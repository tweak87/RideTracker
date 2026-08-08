import assert from 'node:assert/strict';
import './community-backend.js';

const { createClient, validateConfig, PRIVACY_NOTICE_VERSION } = globalThis.RideTrackerCommunityBackend;

function storage() {
  const values = new Map();
  return { getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,String(value)), removeItem:key=>values.delete(key) };
}

function response(payload, status = 200) {
  return { ok:status>=200&&status<300, status, text:async()=>payload===null?'':JSON.stringify(payload) };
}

{
  const client=createClient({storage:storage()});
  assert.deepEqual(client.getStatus().configured,false);
  const health=await client.health();
  assert.equal(health.ok,false);
  assert.equal(health.message,'Lokaler Modus aktiv');
}

{
  const jwtPart=Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url');
  assert.throws(()=>validateConfig({url:'https://test.supabase.co',publishableKey:`x.${jwtPart}.x`}),/Service-Role/);
  assert.throws(()=>validateConfig({url:'http://test.local',publishableKey:'a'.repeat(30)}),/HTTPS/);
  assert.throws(()=>validateConfig({url:'https://test.supabase.co',publishableKey:'a'.repeat(30),privacyNoticeUrl:'http://example.com/privacy'}),/Datenschutzhinweis/);
}

{
  const calls=[];
  const fetchMock=async(url,options)=>{
    calls.push({url,options});
    if(url.includes('/auth/v1/token'))return response({access_token:'user-token',refresh_token:'refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'user-1',email:'jens@example.de'}});
    return response({ok:true});
  };
  const client=createClient({storage:storage(),fetch:fetchMock,config:{url:'https://test.supabase.co',publishableKey:'sb_publishable_'+('a'.repeat(32))}});
  await client.signIn({email:'jens@example.de',password:'very-secret'});
  assert.equal(client.getStatus().authenticated,true);
  assert.equal(calls[0].url,'https://test.supabase.co/auth/v1/token?grant_type=password');
  assert.equal(calls[0].options.headers.apikey.startsWith('sb_publishable_'),true);
  assert.equal(calls[0].options.headers.Authorization.startsWith('Bearer sb_publishable_'),true);
  assert.deepEqual(JSON.parse(calls[0].options.body),{email:'jens@example.de',password:'very-secret'});
}

{
  const calls=[];
  const fetchMock=async(url,options)=>{
    calls.push({url,options});
    if(url.includes('/auth/v1/token'))return response({access_token:'user-token',refresh_token:'refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'user-1'}});
    return response({recordingId:'recording-1'});
  };
  const client=createClient({storage:storage(),fetch:fetchMock,config:{url:'https://test.supabase.co',publishableKey:'sb_publishable_'+('b'.repeat(32))}});
  await client.signIn({email:'jens@example.de',password:'very-secret'});
  await client.syncRide({
    ride:{id:'ride-1',metadata:{parkName:'Europa-Park',trackName:'Voltron',visibility:'public'}},
    trackModel:{points:[{x:0,y:0,z:0,speedKmh:10,latitude:48.2,longitude:7.7},{x:2,y:1,z:3,speedKmh:80,latitude:48.3,longitude:7.8}],distanceM:4,durationMs:1000}
  });
  const syncCall=calls.find(call=>call.url.endsWith('/rest/v1/rpc/sync_community_ride'));
  assert.ok(syncCall);
  const serialized=syncCall.options.body;
  assert.doesNotMatch(serialized,/latitude|longitude/);
  assert.match(serialized,/"x":2/);
  assert.equal(syncCall.options.headers.Authorization,'Bearer user-token');
}

{
  const calls=[];
  const fetchMock=async(url,options)=>{
    calls.push({url,options});
    if(url.includes('/auth/v1/token'))return response({access_token:'user-token',refresh_token:'refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'user-1'}});
    if(url.endsWith('/privacy_notice_status'))return response({version:PRIVACY_NOTICE_VERSION,accepted:false});
    if(url.endsWith('/accept_privacy_notice'))return response({version:PRIVACY_NOTICE_VERSION,accepted:true});
    if(url.endsWith('/export_my_community_data'))return response({recordings:[]});
    return response({erased:true});
  };
  const client=createClient({storage:storage(),fetch:fetchMock,config:{url:'https://test.supabase.co',publishableKey:'sb_publishable_'+('c'.repeat(32))}});
  await client.signIn({email:'jens@example.de',password:'very-secret'});
  assert.equal((await client.privacyStatus()).accepted,false);
  assert.equal((await client.acceptPrivacyNotice()).accepted,true);
  assert.deepEqual(await client.exportMyData(),{recordings:[]});
  assert.equal((await client.eraseMyCommunityData()).erased,true);
  const consentCall=calls.find(call=>call.url.endsWith('/accept_privacy_notice'));
  assert.deepEqual(JSON.parse(consentCall.options.body),{p_notice_version:PRIVACY_NOTICE_VERSION,p_source:'web'});
}

console.log('community-backend tests passed');
