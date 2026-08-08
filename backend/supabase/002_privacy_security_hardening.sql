-- RideTracker Community Backend v2: privacy and browser-client hardening
-- Run after 001_community_backend.sql. This migration is intentionally idempotent.

begin;

create table if not exists public.privacy_consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  notice_version text not null check (char_length(notice_version) between 1 and 80),
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  source text not null default 'web' check (source in ('web', 'ios', 'android', 'admin')),
  primary key (user_id, notice_version)
);

alter table public.privacy_consents enable row level security;
drop policy if exists privacy_consents_self on public.privacy_consents;
create policy privacy_consents_self on public.privacy_consents for select to authenticated
  using (user_id = auth.uid());

create or replace function public.current_privacy_notice_version()
returns text language sql immutable security definer set search_path = public as $$
  select '2026-08-08-v1'::text;
$$;

create or replace function public.privacy_notice_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare current_version text := public.current_privacy_notice_version();
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  return jsonb_build_object(
    'version', current_version,
    'accepted', exists(
      select 1 from public.privacy_consents
      where user_id = auth.uid() and notice_version = current_version and revoked_at is null
    ),
    'acceptedAt', (
      select accepted_at from public.privacy_consents
      where user_id = auth.uid() and notice_version = current_version and revoked_at is null
    )
  );
end;
$$;

create or replace function public.accept_privacy_notice(p_notice_version text, p_source text default 'web')
returns jsonb language plpgsql security definer set search_path = public as $$
declare current_version text := public.current_privacy_notice_version();
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_notice_version is distinct from current_version then raise exception 'privacy notice version is not current'; end if;
  if p_source not in ('web','ios','android','admin') then raise exception 'invalid consent source'; end if;
  insert into public.privacy_consents(user_id, notice_version, accepted_at, revoked_at, source)
  values(auth.uid(), current_version, now(), null, p_source)
  on conflict(user_id, notice_version) do update
    set accepted_at = excluded.accepted_at, revoked_at = null, source = excluded.source;
  return public.privacy_notice_status();
end;
$$;

create or replace function public.revoke_privacy_notice()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  update public.privacy_consents set revoked_at = now()
  where user_id = auth.uid() and notice_version = public.current_privacy_notice_version() and revoked_at is null;
  return public.privacy_notice_status();
end;
$$;

create or replace function public.require_current_privacy_notice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists(
    select 1 from public.privacy_consents
    where user_id = new.user_id
      and notice_version = public.current_privacy_notice_version()
      and revoked_at is null
  ) then
    raise exception 'current privacy notice must be accepted before community synchronization';
  end if;
  return new;
end;
$$;

drop trigger if exists require_privacy_notice_for_recording on public.ride_recordings;
create trigger require_privacy_notice_for_recording
before insert or update on public.ride_recordings
for each row execute function public.require_current_privacy_notice();

create or replace function public.export_my_community_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  return jsonb_build_object(
    'exportedAt', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'recordings', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.ride_recordings r where r.user_id = auth.uid()), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.feed_posts p where p.author_id = auth.uid()), '[]'::jsonb),
    'friendships', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from public.friendships f where f.requester_id = auth.uid() or f.addressee_id = auth.uid()), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.reports r where r.reporter_id = auth.uid()), '[]'::jsonb),
    'privacyConsents', coalesce((select jsonb_agg(to_jsonb(c) order by c.accepted_at) from public.privacy_consents c where c.user_id = auth.uid()), '[]'::jsonb)
  );
end;
$$;

create or replace function public.erase_my_community_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare attraction_ids uuid[];
declare target_attraction_id uuid;
declare removed_recordings integer := 0;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select array_agg(distinct r.attraction_id) into attraction_ids
  from public.ride_recordings r where r.user_id = auth.uid();

  delete from public.friendships where requester_id = auth.uid() or addressee_id = auth.uid();
  delete from public.reports where reporter_id = auth.uid();
  delete from public.feed_posts where author_id = auth.uid();
  delete from public.ride_recordings where user_id = auth.uid();
  get diagnostics removed_recordings = row_count;
  delete from public.privacy_consents where user_id = auth.uid();
  update public.profiles set display_name = 'Gelöschtes Community-Profil', bio = '', avatar_url = '', visibility = 'private'
  where id = auth.uid();

  foreach target_attraction_id in array coalesce(attraction_ids, array[]::uuid[]) loop
    if exists(select 1 from public.ride_recordings where attraction_id = target_attraction_id and visibility <> 'private') then
      perform public.rebuild_track_model(target_attraction_id);
    else
      delete from public.track_models where track_models.attraction_id = target_attraction_id;
    end if;
  end loop;

  return jsonb_build_object('erased', true, 'recordingsRemoved', removed_recordings, 'erasedAt', now());
end;
$$;

-- The browser may read public catalogs and its own RLS-visible rows, but every write
-- goes through a narrowly scoped RPC. This blocks bypassing the server validators.
revoke insert, update, delete on public.profiles, public.community_roles, public.parks,
  public.attractions, public.ride_recordings, public.track_models, public.feed_posts,
  public.friendships, public.reports, public.moderation_actions, public.privacy_consents
  from anon, authenticated;

revoke all on function public.current_privacy_notice_version() from public, anon;
revoke all on function public.privacy_notice_status() from public, anon;
revoke all on function public.accept_privacy_notice(text,text) from public, anon;
revoke all on function public.revoke_privacy_notice() from public, anon;
revoke all on function public.require_current_privacy_notice() from public, anon, authenticated;
revoke all on function public.export_my_community_data() from public, anon;
revoke all on function public.erase_my_community_data() from public, anon;
grant execute on function public.current_privacy_notice_version() to authenticated;
grant execute on function public.privacy_notice_status() to authenticated;
grant execute on function public.accept_privacy_notice(text,text) to authenticated;
grant execute on function public.revoke_privacy_notice() to authenticated;
grant execute on function public.export_my_community_data() to authenticated;
grant execute on function public.erase_my_community_data() to authenticated;
grant select on public.privacy_consents to authenticated;

commit;
