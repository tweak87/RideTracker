-- RideTracker Community Backend v1
-- Run once in a new Supabase project. Raw latitude/longitude values are deliberately
-- absent: clients upload only local x/y/z track coordinates and derived telemetry.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Rider' check (char_length(display_name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 500),
  avatar_url text not null default '' check (char_length(avatar_url) <= 500),
  visibility text not null default 'friends' check (visibility in ('private', 'friends', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deliberately separate from profiles: users must never be able to update their role.
create table if not exists public.community_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'moderator', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parks (
  id uuid primary key default gen_random_uuid(),
  external_key text not null unique check (char_length(external_key) between 1 and 120),
  name text not null check (char_length(name) between 1 and 120),
  thumbnail_model jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attractions (
  id uuid primary key default gen_random_uuid(),
  park_id uuid not null references public.parks(id) on delete cascade,
  external_key text not null unique check (char_length(external_key) between 1 and 240),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ride_recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attraction_id uuid not null references public.attractions(id) on delete cascade,
  external_id text not null check (char_length(external_id) between 1 and 120),
  started_at timestamptz,
  duration_ms bigint not null default 0 check (duration_ms >= 0),
  distance_m double precision not null default 0 check (distance_m >= 0),
  visibility text not null default 'friends' check (visibility in ('private', 'friends', 'public')),
  normalized_model jsonb not null check (jsonb_typeof(normalized_model -> 'points') = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_id)
);

create table if not exists public.track_models (
  attraction_id uuid primary key references public.attractions(id) on delete cascade,
  model jsonb not null,
  source_count integer not null default 0 check (source_count >= 0),
  revision integer not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now()
);

create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  recording_id uuid unique references public.ride_recordings(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 1000),
  visibility text not null default 'friends' check (visibility in ('private', 'friends', 'public')),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('profile', 'post', 'recording')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 80),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  moderator_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('reviewing', 'hide', 'resolve', 'dismiss')),
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists ride_recordings_attraction_idx on public.ride_recordings(attraction_id, created_at desc);
create index if not exists ride_recordings_user_idx on public.ride_recordings(user_id, created_at desc);
create index if not exists feed_posts_created_idx on public.feed_posts(created_at desc) where hidden_at is null;
create index if not exists friendships_addressee_idx on public.friendships(addressee_id, status);
create index if not exists reports_status_idx on public.reports(status, created_at);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','community_roles','parks','attractions','ride_recordings','feed_posts','friendships','reports'] loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(left(new.raw_user_meta_data ->> 'display_name', 60), ''), split_part(new.email, '@', 1), 'Rider'))
  on conflict (id) do nothing;
  insert into public.community_roles (user_id, role) values (new.id, 'member') on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_community_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.community_roles where user_id = auth.uid() and role in ('moderator', 'admin'));
$$;

create or replace function public.are_friends(p_left uuid, p_right uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = p_left and addressee_id = p_right) or (requester_id = p_right and addressee_id = p_left))
  );
$$;

create or replace function public.is_friend_of_current_user(p_other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.are_friends(p_other, auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.community_roles enable row level security;
alter table public.parks enable row level security;
alter table public.attractions enable row level security;
alter table public.ride_recordings enable row level security;
alter table public.track_models enable row level security;
alter table public.feed_posts enable row level security;
alter table public.friendships enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;

drop policy if exists profiles_visible on public.profiles;
create policy profiles_visible on public.profiles for select to authenticated using (
  id = auth.uid() or visibility = 'public' or (visibility = 'friends' and public.is_friend_of_current_user(id)) or public.is_community_moderator()
);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists roles_self on public.community_roles;
create policy roles_self on public.community_roles for select to authenticated using (user_id = auth.uid() or public.is_community_moderator());

drop policy if exists parks_read on public.parks;
create policy parks_read on public.parks for select to anon, authenticated using (true);
drop policy if exists attractions_read on public.attractions;
create policy attractions_read on public.attractions for select to anon, authenticated using (true);
drop policy if exists track_models_read on public.track_models;
create policy track_models_read on public.track_models for select to anon, authenticated using (true);

drop policy if exists recordings_visible on public.ride_recordings;
create policy recordings_visible on public.ride_recordings for select to authenticated using (
  user_id = auth.uid() or visibility = 'public' or (visibility = 'friends' and public.is_friend_of_current_user(user_id)) or public.is_community_moderator()
);
drop policy if exists recordings_owner on public.ride_recordings;
create policy recordings_owner on public.ride_recordings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists posts_visible on public.feed_posts;
create policy posts_visible on public.feed_posts for select to authenticated using (
  hidden_at is null and (author_id = auth.uid() or visibility = 'public' or (visibility = 'friends' and public.is_friend_of_current_user(author_id)))
  or public.is_community_moderator()
);
drop policy if exists posts_owner on public.feed_posts;
create policy posts_owner on public.feed_posts for all to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists friendships_involved on public.friendships;
create policy friendships_involved on public.friendships for select to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid() or public.is_community_moderator());
drop policy if exists reports_own_or_mod on public.reports;
create policy reports_own_or_mod on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_community_moderator());
drop policy if exists moderation_mod_only on public.moderation_actions;
create policy moderation_mod_only on public.moderation_actions for select to authenticated using (public.is_community_moderator());

create or replace function public.my_community_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.community_roles where user_id = auth.uid()), 'member');
$$;

create or replace function public.upsert_my_profile(p_display_name text, p_bio text default '', p_avatar_url text default '', p_visibility text default 'friends')
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_visibility not in ('private','friends','public') then raise exception 'invalid visibility'; end if;
  insert into public.profiles(id, display_name, bio, avatar_url, visibility)
  values(auth.uid(), coalesce(left(nullif(trim(p_display_name), ''), 60), 'Rider'), left(coalesce(p_bio,''),500), left(coalesce(p_avatar_url,''),500), p_visibility)
  on conflict(id) do update set display_name=excluded.display_name, bio=excluded.bio, avatar_url=excluded.avatar_url, visibility=excluded.visibility
  returning jsonb_build_object('id',id,'displayName',display_name,'bio',bio,'avatarUrl',avatar_url,'visibility',visibility) into result;
  return result;
end;
$$;

create or replace function public.rebuild_track_model(p_attraction_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare merged jsonb; sources integer; next_revision integer;
begin
  select count(*) into sources from public.ride_recordings
  where attraction_id = p_attraction_id and visibility <> 'private';
  if sources = 0 then return null; end if;

  select jsonb_build_object(
    'version', 1,
    'sourceCount', sources,
    'points', coalesce(jsonb_agg(point order by idx), '[]'::jsonb),
    'distanceM', (select percentile_cont(0.5) within group(order by distance_m) from public.ride_recordings where attraction_id=p_attraction_id and visibility <> 'private')
  ) into merged
  from (
    select idx, jsonb_strip_nulls(jsonb_build_object(
      'i', idx,
      'x', percentile_cont(0.5) within group(order by x),
      'y', percentile_cont(0.5) within group(order by y),
      'z', percentile_cont(0.5) within group(order by z),
      'speedKmh', percentile_cont(0.5) within group(order by speed_kmh) filter (where speed_kmh is not null),
      'normalG', percentile_cont(0.5) within group(order by normal_g) filter (where normal_g is not null),
      'lateralG', percentile_cont(0.5) within group(order by lateral_g) filter (where lateral_g is not null),
      'longitudinalG', percentile_cont(0.5) within group(order by longitudinal_g) filter (where longitudinal_g is not null),
      'totalG', percentile_cont(0.5) within group(order by total_g) filter (where total_g is not null),
      'elevationM', percentile_cont(0.5) within group(order by elevation_m) filter (where elevation_m is not null),
      'confidence', least(1.0, count(*) / 5.0)
    )) as point
    from (
      select coalesce((p.value->>'i')::integer, p.ordinality::integer - 1) idx,
        (p.value->>'x')::double precision x, (p.value->>'y')::double precision y, (p.value->>'z')::double precision z,
        nullif(p.value->>'speedKmh','')::double precision speed_kmh,
        nullif(p.value->>'normalG','')::double precision normal_g,
        nullif(p.value->>'lateralG','')::double precision lateral_g,
        nullif(p.value->>'longitudinalG','')::double precision longitudinal_g,
        nullif(p.value->>'totalG','')::double precision total_g,
        nullif(p.value->>'elevationM','')::double precision elevation_m
      from public.ride_recordings r
      cross join lateral jsonb_array_elements(r.normalized_model->'points') with ordinality p(value, ordinality)
      where r.attraction_id=p_attraction_id and r.visibility <> 'private'
    ) samples group by idx
  ) aggregate_points;

  select coalesce(revision,0)+1 into next_revision from public.track_models where attraction_id=p_attraction_id;
  next_revision := coalesce(next_revision, 1);
  insert into public.track_models(attraction_id,model,source_count,revision)
  values(p_attraction_id, merged, sources, next_revision)
  on conflict(attraction_id) do update set model=excluded.model, source_count=excluded.source_count, revision=excluded.revision, updated_at=now();
  update public.parks set thumbnail_model=merged where id=(select park_id from public.attractions where id=p_attraction_id);
  return merged;
end;
$$;

create or replace function public.sync_community_ride(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare park_id_value uuid; attraction_id_value uuid; recording_id_value uuid; post_id_value uuid; merged jsonb;
declare visibility_value text; external_ride text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  external_ride := left(nullif(trim(p_payload->>'ride_external_id'),''),120);
  if external_ride is null then raise exception 'ride_external_id required'; end if;
  visibility_value := coalesce(p_payload#>>'{recording,visibility}','friends');
  if visibility_value not in ('private','friends','public') then raise exception 'invalid visibility'; end if;
  if (p_payload::text ~* '"(latitude|longitude|lat|lon)"[[:space:]]*:') then raise exception 'raw gps coordinates rejected'; end if;

  insert into public.parks(external_key,name)
  values(left(p_payload#>>'{park,external_key}',120), left(p_payload#>>'{park,name}',120))
  on conflict(external_key) do update set name=excluded.name
  returning id into park_id_value;

  insert into public.attractions(park_id,external_key,name)
  values(park_id_value,left(p_payload#>>'{attraction,external_key}',240),left(p_payload#>>'{attraction,name}',120))
  on conflict(external_key) do update set name=excluded.name, park_id=excluded.park_id
  returning id into attraction_id_value;

  insert into public.ride_recordings(user_id,attraction_id,external_id,started_at,duration_ms,distance_m,visibility,normalized_model)
  values(auth.uid(), attraction_id_value, external_ride, nullif(p_payload#>>'{recording,started_at}','')::timestamptz,
    greatest(0,coalesce((p_payload#>>'{recording,duration_ms}')::bigint,0)),
    greatest(0,coalesce((p_payload#>>'{recording,distance_m}')::double precision,0)), visibility_value,
    p_payload#>'{recording,model}')
  on conflict(user_id,external_id) do update set attraction_id=excluded.attraction_id,started_at=excluded.started_at,
    duration_ms=excluded.duration_ms,distance_m=excluded.distance_m,visibility=excluded.visibility,normalized_model=excluded.normalized_model
  returning id into recording_id_value;

  insert into public.feed_posts(author_id,recording_id,title,body,visibility)
  values(auth.uid(),recording_id_value,left(p_payload#>>'{post,title}',160),left(coalesce(p_payload#>>'{post,body}',''),1000),visibility_value)
  on conflict(recording_id) do update set title=excluded.title,body=excluded.body,visibility=excluded.visibility
  returning id into post_id_value;

  merged := public.rebuild_track_model(attraction_id_value);
  return jsonb_build_object('parkId',park_id_value,'attractionId',attraction_id_value,'recordingId',recording_id_value,'postId',post_id_value,'model',merged);
end;
$$;

create or replace function public.community_feed(p_limit integer default 30, p_offset integer default 0)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id',fp.id,'title',fp.title,'body',fp.body,'createdAt',fp.created_at,'visibility',fp.visibility,
    'author',jsonb_build_object('id',pr.id,'displayName',pr.display_name,'avatarUrl',pr.avatar_url),
    'ride',jsonb_build_object('id',rr.id,'durationMs',rr.duration_ms,'distanceM',rr.distance_m),
    'attraction',jsonb_build_object('id',a.id,'name',a.name,'model',tm.model),
    'park',jsonb_build_object('id',p.id,'name',p.name)
  )
  from public.feed_posts fp join public.profiles pr on pr.id=fp.author_id
  left join public.ride_recordings rr on rr.id=fp.recording_id
  left join public.attractions a on a.id=rr.attraction_id left join public.parks p on p.id=a.park_id
  left join public.track_models tm on tm.attraction_id=a.id
  where fp.hidden_at is null and (fp.author_id=auth.uid() or fp.visibility='public' or (fp.visibility='friends' and public.is_friend_of_current_user(fp.author_id)))
  order by fp.created_at desc limit least(greatest(p_limit,1),100) offset greatest(p_offset,0);
$$;

create or replace function public.search_profiles(p_query text)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id',id,'displayName',display_name,'bio',bio,'avatarUrl',avatar_url,'visibility',visibility)
  from public.profiles where id<>auth.uid() and display_name ilike '%' || left(coalesce(p_query,''),80) || '%'
    and (visibility='public' or (visibility='friends' and public.is_friend_of_current_user(id)))
  order by display_name limit 30;
$$;

create or replace function public.send_friend_request(p_addressee uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result public.friendships;
begin
  if auth.uid() is null or p_addressee=auth.uid() then raise exception 'invalid addressee'; end if;
  if exists(select 1 from public.friendships where (requester_id=auth.uid() and addressee_id=p_addressee) or (requester_id=p_addressee and addressee_id=auth.uid())) then
    raise exception 'friendship already exists';
  end if;
  insert into public.friendships(requester_id,addressee_id) values(auth.uid(),p_addressee) returning * into result;
  return to_jsonb(result);
end;
$$;

create or replace function public.respond_friend_request(p_friendship_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result public.friendships;
begin
  update public.friendships set status=case when p_accept then 'accepted' else 'declined' end
  where id=p_friendship_id and addressee_id=auth.uid() and status='pending' returning * into result;
  if result.id is null then raise exception 'pending friendship not found'; end if;
  return to_jsonb(result);
end;
$$;

create or replace function public.list_my_friends()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('friendshipId',f.id,'status',f.status,'direction',case when f.requester_id=auth.uid() then 'outgoing' else 'incoming' end,
    'profile',jsonb_build_object('id',p.id,'displayName',p.display_name,'avatarUrl',p.avatar_url))
  from public.friendships f join public.profiles p on p.id=case when f.requester_id=auth.uid() then f.addressee_id else f.requester_id end
  where f.requester_id=auth.uid() or f.addressee_id=auth.uid() order by f.updated_at desc;
$$;

create or replace function public.report_content(p_target_type text,p_target_id uuid,p_reason text,p_details text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare report_id uuid;
begin
  if p_target_type not in ('profile','post','recording') then raise exception 'invalid target type'; end if;
  insert into public.reports(reporter_id,target_type,target_id,reason,details)
  values(auth.uid(),p_target_type,p_target_id,left(p_reason,80),left(coalesce(p_details,''),1000)) returning id into report_id;
  return report_id;
end;
$$;

create or replace function public.moderation_queue()
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_community_moderator() then raise exception 'moderator role required'; end if;
  return query select jsonb_build_object('id',r.id,'targetType',r.target_type,'targetId',r.target_id,'reason',r.reason,'details',r.details,'status',r.status,'createdAt',r.created_at,
    'reporter',jsonb_build_object('id',p.id,'displayName',p.display_name))
  from public.reports r join public.profiles p on p.id=r.reporter_id where r.status in ('open','reviewing') order by r.created_at;
end;
$$;

create or replace function public.moderate_report(p_report_id uuid,p_decision text,p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare report_value public.reports;
begin
  if not public.is_community_moderator() then raise exception 'moderator role required'; end if;
  if p_decision not in ('reviewing','hide','resolve','dismiss') then raise exception 'invalid moderation decision'; end if;
  update public.reports set status=case p_decision when 'reviewing' then 'reviewing' when 'dismiss' then 'dismissed' else 'resolved' end
  where id=p_report_id returning * into report_value;
  if report_value.id is null then raise exception 'report not found'; end if;
  if p_decision='hide' and report_value.target_type='post' then update public.feed_posts set hidden_at=now() where id=report_value.target_id; end if;
  insert into public.moderation_actions(report_id,moderator_id,decision,note) values(p_report_id,auth.uid(),p_decision,left(coalesce(p_note,''),1000));
  return to_jsonb(report_value);
end;
$$;

revoke all on function public.is_community_moderator() from public, anon;
revoke all on function public.are_friends(uuid,uuid) from public;
revoke all on function public.is_friend_of_current_user(uuid) from public, anon;
revoke all on function public.rebuild_track_model(uuid) from public;
revoke all on function public.my_community_role() from public, anon;
revoke all on function public.upsert_my_profile(text,text,text,text) from public, anon;
revoke all on function public.sync_community_ride(jsonb) from public, anon;
revoke all on function public.community_feed(integer,integer) from public, anon;
revoke all on function public.search_profiles(text) from public, anon;
revoke all on function public.send_friend_request(uuid) from public, anon;
revoke all on function public.respond_friend_request(uuid,boolean) from public, anon;
revoke all on function public.list_my_friends() from public, anon;
revoke all on function public.report_content(text,uuid,text,text) from public, anon;
revoke all on function public.moderation_queue() from public, anon;
revoke all on function public.moderate_report(uuid,text,text) from public, anon;
grant execute on function public.is_community_moderator() to authenticated;
grant execute on function public.is_friend_of_current_user(uuid) to authenticated;
grant execute on function public.my_community_role() to authenticated;
grant execute on function public.upsert_my_profile(text,text,text,text) to authenticated;
grant execute on function public.sync_community_ride(jsonb) to authenticated;
grant execute on function public.community_feed(integer,integer) to authenticated;
grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid,boolean) to authenticated;
grant execute on function public.list_my_friends() to authenticated;
grant execute on function public.report_content(text,uuid,text,text) to authenticated;
grant execute on function public.moderation_queue() to authenticated;
grant execute on function public.moderate_report(uuid,text,text) to authenticated;
grant select on public.parks, public.attractions, public.track_models to anon, authenticated;
