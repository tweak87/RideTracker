import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL('./001_community_backend.sql',import.meta.url),'utf8');
const hardening=fs.readFileSync(new URL('./002_privacy_security_hardening.sql',import.meta.url),'utf8');

for(const table of ['profiles','community_roles','parks','attractions','ride_recordings','track_models','feed_posts','friendships','reports','moderation_actions']){
  assert.match(sql,new RegExp(`create table if not exists public\\.${table}\\b`),`missing table ${table}`);
  assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`),`RLS missing for ${table}`);
}

for(const routine of ['sync_community_ride','community_feed','send_friend_request','respond_friend_request','report_content','moderation_queue','moderate_report','rebuild_track_model']){
  assert.match(sql,new RegExp(`function public\\.${routine}\\b`),`missing function ${routine}`);
}

assert.match(sql,/percentile_cont\(0\.5\)/,'track merge must use robust median aggregation');
assert.match(sql,/raw gps coordinates rejected/,'server-side raw GPS guard missing');
assert.doesNotMatch(sql,/\blatitude\s+(?:double|numeric|real|decimal)/i,'schema must not persist latitude');
assert.doesNotMatch(sql,/\blongitude\s+(?:double|numeric|real|decimal)/i,'schema must not persist longitude');
assert.match(sql,/revoke all on function public\.sync_community_ride\(jsonb\) from public, anon/,'anonymous sync execution must be revoked');
assert.match(sql,/grant execute on function public\.moderate_report.*to authenticated/,'moderation RPC grant missing');
assert.match(sql,/community_roles[\s\S]*role in \('member', 'moderator', 'admin'\)/,'role constraint missing');

assert.match(hardening,/create table if not exists public\.privacy_consents\b/,'versioned consent table missing');
assert.match(hardening,/trigger require_privacy_notice_for_recording/,'server-side privacy gate missing');
assert.match(hardening,/function public\.export_my_community_data\(\)/,'self-service export missing');
assert.match(hardening,/function public\.erase_my_community_data\(\)/,'self-service erasure missing');
assert.match(hardening,/revoke insert, update, delete[\s\S]*from anon, authenticated/,'direct browser writes must be revoked');
assert.match(hardening,/grant execute on function public\.accept_privacy_notice\(text,text\) to authenticated/,'consent RPC grant missing');

console.log('community SQL schema tests passed');
