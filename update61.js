(() => {
  'use strict';

  const RELEASE = window.RideTrackerReleaseManifest || {
    version:'2026.08.08-community-backend-3d.1',
    baseline:{commit:'3bd0175b93c7babe515f91555352e7711020fa7f',rollbackBranch:'rollback/pre-community-backend-20260808'}
  };
  const META_KEY = 'rideTracker.savedRides.v2';
  const LOG_KEY = 'rideTracker.supportLog.v1';
  const FLAGS_KEY = 'rideTracker.featureFlags.v1';
  const DEFAULT_FLAGS = { communityPreview:true, detailedLogging:true, automaticRepair:true };
  const community = window.RideTrackerCommunityModel?.createStore?.(localStorage);
  const state = { logs:[], busy:false, lastPreflight:null, installed:false, originalRegistry:null };
  const byId = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } };
  const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const rides = () => { const value=readJson(META_KEY,[]); return Array.isArray(value)?value:[]; };
  const flags = () => ({...DEFAULT_FLAGS,...readJson(FLAGS_KEY,{})});
  const isRecording = () => byId('stop')?.disabled === false || Boolean(window.RideTrackerRecordingFullscreen?.isRecording?.());

  function safeValue(value, depth = 0) {
    if (depth > 4) return '[max-depth]';
    if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Error) return {name:value.name,message:value.message,stack:value.stack || null};
    if (Array.isArray(value)) return value.slice(0,50).map(item=>safeValue(item,depth+1));
    if (typeof value === 'object') {
      const result={};
      for(const [key,item] of Object.entries(value).slice(0,80)) {
        if(/^(lat|latitude|lon|lng|longitude|coordinates|raw)$/i.test(key)) { result[key]='[redacted]'; continue; }
        result[key]=safeValue(item,depth+1);
      }
      return result;
    }
    return String(value);
  }

  function persistLogs() {
    if(!flags().detailedLogging)return;
    try{writeJson(LOG_KEY,state.logs.slice(-800));}catch(_){}
  }
  function log(level,source,message,detail=null) {
    const item={at:new Date().toISOString(),tMs:Math.round(performance.now()),level,source,message:String(message||''),detail:safeValue(detail)};
    state.logs.push(item);if(state.logs.length>800)state.logs.splice(0,state.logs.length-800);persistLogs();
    try{window.RideTrackerDiagnostics?.log?.(level,source,message,detail);}catch(_){}
    renderSupport();return item;
  }

  function downloadJson(filename,value) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function runtimeCommit() {
    const script=[...document.scripts].find(node=>/update61\.js/.test(node.src||''));
    try{return new URL(script?.src||location.href).searchParams.get('v')||'local';}catch{return'local';}
  }

  const style=document.createElement('style');style.id='rtCommunityFoundation61Style';style.textContent=`
    :root{--rt61-nav-h:72px}body{padding-bottom:calc(var(--rt61-nav-h) + env(safe-area-inset-bottom))!important}
    #rtInlineMenu,#rtInlineDrawer,#rtInlineScrim{display:none!important}
    #rtCommunityBottomNav{position:fixed;left:0;right:0;bottom:0;z-index:2491000;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));min-height:var(--rt61-nav-h);padding:7px 6px max(7px,env(safe-area-inset-bottom));border-top:1px solid #29435f;background:rgba(5,14,25,.97);backdrop-filter:blur(18px);color:#f5fbff}
    #rtCommunityBottomNav button{display:grid;place-items:center;align-content:center;gap:3px;min-width:0;min-height:54px;padding:5px 2px;border:0;border-radius:13px;background:transparent;color:#8097ae;font:750 10px system-ui}#rtCommunityBottomNav button i{font-style:normal;font-size:21px;line-height:1}#rtCommunityBottomNav button[data-active=true]{background:#102b42;color:#5fd0ff}#rtCommunityBottomNav button[data-community-route=record]{margin-top:-21px;min-height:62px;border:4px solid #07111f;border-radius:22px;background:#5fd0ff;color:#001522;box-shadow:0 8px 24px rgba(95,208,255,.28)}
    #rtInlineDashboard{padding-bottom:calc(var(--rt61-nav-h) + 28px + env(safe-area-inset-bottom))!important}.rt61-home{width:min(920px,100%);margin:auto}.rt61-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:start;margin:2px 0 18px}.rt61-hero h1{font-size:clamp(34px,9vw,62px);line-height:1;letter-spacing:-.055em;margin:0}.rt61-hero p{max-width:650px;color:#96aac1;line-height:1.45}.rt61-version{padding:7px 10px;border:1px solid #31536b;border-radius:999px;color:#5fd0ff;font-size:11px;white-space:nowrap}.rt61-start{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:13px;min-height:90px;padding:16px;border:0;border-radius:20px;background:linear-gradient(135deg,#5fd0ff,#65f0b7);color:#001522;text-align:left;box-shadow:0 14px 40px rgba(45,182,223,.22)}.rt61-start i{font-style:normal;font-size:32px}.rt61-start strong{display:block;font-size:20px}.rt61-start small{display:block;margin-top:3px;font-weight:650;opacity:.72}.rt61-start b{font-size:24px}.rt61-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0}.rt61-metric,.rt61-card{border:1px solid #29435f;border-radius:17px;background:linear-gradient(180deg,#102238,#0a1727);padding:14px}.rt61-metric span{display:block;color:#96aac1;font-size:11px}.rt61-metric b{display:block;margin-top:4px;font-size:21px}.rt61-section-title{display:flex;justify-content:space-between;gap:8px;align-items:end;margin:20px 2px 9px}.rt61-section-title h2{margin:0;font-size:19px}.rt61-section-title span{color:#96aac1;font-size:11px}.rt61-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.rt61-card{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;text-align:left;color:#f5fbff}.rt61-card i{font-style:normal;font-size:24px}.rt61-card strong{display:block}.rt61-card small{display:block;color:#96aac1;margin-top:3px;line-height:1.35}
    .rt61-view{position:fixed;left:0;right:0;top:calc(max(env(safe-area-inset-top),12px) + 58px);bottom:0;z-index:2485000;overflow:auto;padding:16px 12px calc(var(--rt61-nav-h) + 24px + env(safe-area-inset-bottom));background:#07111f;color:#f5fbff}.rt61-view[hidden]{display:none!important}.rt61-shell{width:min(920px,100%);margin:auto}.rt61-head{display:flex;align-items:start;justify-content:space-between;gap:12px;margin-bottom:14px}.rt61-head h2{margin:0;font-size:clamp(26px,7vw,40px)}.rt61-head p{margin:5px 0 0;color:#96aac1}.rt61-community-list{display:grid;gap:10px}.rt61-ride{border:1px solid #29435f;border-radius:16px;background:#0b192a;padding:14px}.rt61-ride-head{display:flex;justify-content:space-between;gap:10px}.rt61-pill{padding:5px 8px;border-radius:999px;background:#17334b;color:#5fd0ff;font-size:10px}.rt61-empty{padding:24px;border:1px dashed #35536f;border-radius:16px;color:#96aac1;text-align:center}
    #rtCommunityPreflight{display:grid;gap:11px;margin:10px 0;padding:14px;border:1px solid #31536b;border-radius:18px;background:linear-gradient(180deg,#10253a,#091728);color:#f5fbff}#rtRecordingQuickStart{display:none!important}.rt61-preflight-head{display:flex;justify-content:space-between;gap:10px}.rt61-preflight-head h3{margin:0}.rt61-preflight-head p{margin:4px 0 0;color:#96aac1;font-size:12px}.rt61-preflight-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.rt61-check{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;padding:9px;border:1px solid #29435f;border-radius:12px;background:#071321}.rt61-check i{font-style:normal}.rt61-check b{display:block;font-size:12px}.rt61-check small{display:block;color:#96aac1;margin-top:2px}.rt61-check[data-state=ready] i{color:#65f0b7}.rt61-check[data-state=warn] i{color:#ffd166}.rt61-check[data-state=block] i{color:#ff6b82}.rt61-preflight-actions{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.rt61-preflight-actions button{min-height:50px}.rt61-preflight-actions .primary{background:#5fd0ff;color:#001522;border:0;font-weight:850}.rt61-video-choice{display:flex;align-items:center;gap:7px;color:#96aac1;font-size:12px}
    .rt61-modal{position:fixed;inset:0;z-index:2147483647;overflow:auto;padding:max(14px,env(safe-area-inset-top)) 12px max(14px,env(safe-area-inset-bottom));background:rgba(0,0,0,.76);color:#f5fbff}.rt61-modal[hidden]{display:none!important}.rt61-modal-card{width:min(800px,100%);margin:auto;border:1px solid #35536f;border-radius:20px;background:#091626;padding:16px;box-shadow:0 25px 90px rgba(0,0,0,.65)}.rt61-modal-head{display:flex;justify-content:space-between;gap:10px;align-items:start}.rt61-modal-head h2{margin:0}.rt61-modal-head p{margin:5px 0 0;color:#96aac1}.rt61-close{min-width:42px}.rt61-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.rt61-form label{display:grid;gap:5px;color:#96aac1;font-size:12px}.rt61-form input,.rt61-form textarea,.rt61-form select{width:100%;padding:11px;border:1px solid #31536b;border-radius:11px;background:#07111f;color:#f5fbff}.rt61-form textarea{min-height:80px}.rt61-span{grid-column:1/-1}.rt61-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.rt61-actions button,.rt61-actions a{padding:11px 13px;border-radius:11px}.rt61-actions .primary{background:#5fd0ff;color:#001522;border:0;font-weight:850}.rt61-status{margin:12px 0;padding:10px;border-radius:11px;background:#07111f;color:#96aac1;font-size:12px}.rt61-log{max-height:38vh;overflow:auto;white-space:pre-wrap;padding:11px;border-radius:11px;background:#030910;color:#bed0e2;font:11px/1.45 ui-monospace,monospace}.rt61-test-grid{display:grid;gap:7px}.rt61-test{display:flex;justify-content:space-between;gap:10px;padding:8px;border:1px solid #29435f;border-radius:10px}.rt61-test[data-state=pass] b{color:#65f0b7}.rt61-test[data-state=warn] b{color:#ffd166}.rt61-test[data-state=fail] b{color:#ff6b82}.rt61-admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.rt61-admin-card{border:1px solid #29435f;border-radius:15px;background:#071321;padding:12px}.rt61-admin-card h3{margin:0 0 5px}.rt61-admin-card p{margin:0;color:#96aac1;font-size:12px;line-height:1.45}.rt61-flags{display:grid;gap:7px;margin-top:9px}.rt61-flags label{display:flex;align-items:center;gap:8px;color:#dce8f3;font-size:12px}
    @media(max-width:620px){.rt61-hero{grid-template-columns:1fr}.rt61-version{justify-self:start}.rt61-grid,.rt61-form,.rt61-admin-grid{grid-template-columns:1fr}.rt61-span{grid-column:auto}.rt61-preflight-grid{grid-template-columns:1fr}.rt61-preflight-actions{grid-template-columns:1fr}.rt61-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.rt61-metric{padding:10px}.rt61-metric b{font-size:17px}}
  `;document.head.appendChild(style);

  function ensureBottomNav() {
    let nav=byId('rtCommunityBottomNav');if(nav)return nav;
    nav=document.createElement('nav');nav.id='rtCommunityBottomNav';nav.setAttribute('aria-label','Hauptnavigation');
    nav.innerHTML=`<button type="button" data-community-route="home"><i>⌂</i><span>Start</span></button><button type="button" data-community-route="community"><i>◎</i><span>Entdecken</span></button><button type="button" data-community-route="record"><i>●</i><span>Aufnehmen</span></button><button type="button" data-community-route="rides"><i>▤</i><span>Fahrten</span></button><button type="button" data-community-route="profile"><i>☺</i><span>Profil</span></button>`;
    document.body.appendChild(nav);return nav;
  }
  function syncBottomNav() {
    const route=document.body.dataset.rtRoute||'home';
    ensureBottomNav().querySelectorAll('[data-community-route]').forEach(button=>button.dataset.active=String(button.dataset.communityRoute===route));
  }
  function closeFoundationViews(except='') {
    for(const id of ['rtCommunityDiscover','rtCommunityProfile','rtSupportCenter61','rtAdminCenter61'])if(id!==except)byId(id)?.setAttribute('hidden','');
  }
  async function navigate(route) {
    log('info','navigation',`Navigate ${route}`);
    closeFoundationViews();
    if(route==='community'&&window.RideTrackerCommunityHub?.open)return window.RideTrackerCommunityHub.open();
    if(route==='community')return showCommunity();
    if(route==='profile')return showProfile();
    if(route==='support')return showSupport();
    if(route==='admin')return showAdmin();
    document.body.dataset.rtRoute=route;
    const result=await state.originalRegistry?.navigate?.(route);
    syncBottomNav();return result;
  }

  function homeStats() {
    const saved=rides(),parks=new Set(saved.map(ride=>String(ride.park||'').trim()).filter(Boolean));
    const summary=community?.summary?.()||{public:0};return{rides:saved.length,parks:parks.size,public:summary.public};
  }
  function renderHome() {
    const dashboard=window.RideTrackerFrontendNavigation?.ensureHome?.()||byId('rtInlineDashboard');if(!dashboard)return;
    const stats=homeStats(),last=rides()[0],profile=community?.load?.().profile;
    dashboard.innerHTML=`<div class="rt61-home"><header class="rt61-hero"><div><div class="label">RideTracker Community</div><h1>Fahren.<br>Messen. Teilen.</h1><p>Zeichne deine Fahrt auf, prüfe die Messqualität und entscheide selbst, was privat bleibt oder später Teil der Community wird.</p></div><span class="rt61-version">v${esc(RELEASE.version)}</span></header><button type="button" class="rt61-start" data-community-route="record"><i>🎢</i><span><strong>Neue Fahrt aufnehmen</strong><small>GPS, Sensoren, Kamera und Speicher vorher automatisch prüfen</small></span><b>›</b></button><div class="rt61-metrics"><div class="rt61-metric"><span>Fahrten</span><b>${stats.rides}</b></div><div class="rt61-metric"><span>Parks</span><b>${stats.parks}</b></div><div class="rt61-metric"><span>Community</span><b>${stats.public}</b></div></div><div class="rt61-section-title"><h2>Für dich</h2><span>${esc(profile?.pseudonym||'RideTracker Gast')}</span></div><div class="rt61-grid"><button class="rt61-card" type="button" data-community-route="community"><i>◎</i><span><strong>Community entdecken</strong><small>Öffentliche Fahrtentwürfe, Parks und zukünftige Community-Daten</small></span></button><button class="rt61-card" type="button" data-community-route="rides"><i>▤</i><span><strong>${last?'Letzte Fahrt öffnen':'Meine Fahrten'}</strong><small>${last?`${esc(last.track||last.title||'Unbenannte Fahrt')} · ${esc(last.park||'ohne Park')}`:'Aufnahmen nach Park und Achterbahn verwalten'}</small></span></button></div><div class="rt61-section-title"><h2>Werkzeuge</h2><span>Konfiguration & Hilfe</span></div><div class="rt61-grid"><button class="rt61-card" type="button" data-community-route="devices"><i>⌁</i><span><strong>Geräte & Sensoren</strong><small>Verbindungen, Live-Werte und Messkanäle</small></span></button><button class="rt61-card" type="button" data-community-route="hud"><i>▣</i><span><strong>HUD gestalten</strong><small>Overlay für Hoch- und Querformat konfigurieren</small></span></button><button class="rt61-card" type="button" data-community-route="support"><i>◉</i><span><strong>Support & Diagnose</strong><small>Selbsttests, detaillierte Logs und Support-Paket</small></span></button><button class="rt61-card" type="button" data-community-route="admin"><i>⚙</i><span><strong>Administration</strong><small>Version, Datenqualität, Feature-Schalter und Rollback</small></span></button></div></div>`;
  }

  function ensureCommunityView() {
    let view=byId('rtCommunityDiscover');if(view)return view;
    view=document.createElement('section');view.id='rtCommunityDiscover';view.className='rt61-view';view.hidden=true;document.body.appendChild(view);return view;
  }
  function showCommunity() {
    closeFoundationViews('rtCommunityDiscover');
    byId('rtInlineDashboard')?.setAttribute('hidden','');
    document.querySelectorAll('.rt-view').forEach(view=>view.remove());
    document.querySelectorAll('.rt-tool-view,#rtSettingsView,#rtRideLibrary').forEach(view=>view.hidden=true);
    document.body.dataset.rtRoute='community';syncBottomNav();
    const view=ensureCommunityView(),model=community?.load?.(),publicRides=Object.values(model?.rides||{}).filter(ride=>ride.visibility==='public');
    view.innerHTML=`<div class="rt61-shell"><header class="rt61-head"><div><h2>Entdecken</h2><p>Deine lokale Vorschau auf die zukünftige RideTracker Community.</p></div><span class="rt61-pill">Backend folgt</span></header><div class="rt61-card"><i>${esc(model?.profile?.avatar||'🎢')}</i><span><strong>${esc(model?.profile?.pseudonym||'RideTracker Gast')}</strong><small>Öffentliche Einträge werden aktuell nur lokal vorbereitet. Exakte Strecken bleiben standardmäßig geschützt.</small></span></div><div class="rt61-section-title"><h2>Für die Community vorbereitet</h2><span>${publicRides.length} Fahrten</span></div><div class="rt61-community-list">${publicRides.length?publicRides.map(ride=>`<article class="rt61-ride"><div class="rt61-ride-head"><strong>${esc(ride.title)}</strong><span class="rt61-pill">bereit</span></div><p>${esc(ride.parkName||'Unbekannter Park')} · ${esc(ride.rideName||'Unbekannte Bahn')}</p><small>${ride.shareExactTrack?'Exakte Strecke freigegeben':`Start/Ende um ${ride.endpointPrivacyMeters} m geschützt`}</small></article>`).join(''):'<div class="rt61-empty">Noch keine Fahrt für die Community vorbereitet. Nach einer Aufnahme kannst du „Öffentlich“ auswählen.</div>'}</div><div class="rt61-section-title"><h2>Community-Prinzip</h2></div><div class="rt61-grid"><div class="rt61-card"><i>◈</i><span><strong>Messqualität sichtbar</strong><small>GPS-, Sensor- und Konfidenzwerte bleiben nachvollziehbar.</small></span></div><div class="rt61-card"><i>◌</i><span><strong>Privatsphäre zuerst</strong><small>Privat ist Standard; exakte GPS-Daten erfordern eine bewusste Freigabe.</small></span></div></div></div>`;
    view.hidden=false;view.scrollTo({top:0,behavior:'auto'});log('info','community','Community view opened',{publicRides:publicRides.length});
  }

  function ensureProfileView() {
    let view=byId('rtCommunityProfile');if(view)return view;
    view=document.createElement('section');view.id='rtCommunityProfile';view.className='rt61-view';view.hidden=true;document.body.appendChild(view);return view;
  }
  function showProfile() {
    closeFoundationViews('rtCommunityProfile');byId('rtInlineDashboard')?.setAttribute('hidden','');document.querySelectorAll('.rt-view').forEach(view=>view.remove());document.querySelectorAll('.rt-tool-view,#rtSettingsView,#rtRideLibrary').forEach(view=>view.hidden=true);document.body.dataset.rtRoute='profile';syncBottomNav();
    const view=ensureProfileView(),profile=community?.load?.().profile||{},summary=community?.summary?.()||{};
    view.innerHTML=`<div class="rt61-shell"><header class="rt61-head"><div><h2>Community-Profil</h2><p>Du bestimmst Pseudonym, Sichtbarkeit und GPS-Privatsphäre.</p></div><span class="rt61-pill">lokal</span></header><div class="rt61-form"><label>Avatar oder Emoji<input data-profile-avatar value="${esc(profile.avatar||'🎢')}" maxlength="8"></label><label>Pseudonym<input data-profile-name value="${esc(profile.pseudonym||'RideTracker Gast')}" maxlength="60"></label><label class="rt61-span">Über mich<textarea data-profile-bio maxlength="500">${esc(profile.bio||'')}</textarea></label><label>Standard-Sichtbarkeit<select data-profile-visibility><option value="draft" ${profile.defaultVisibility==='draft'?'selected':''}>Entwurf</option><option value="private" ${profile.defaultVisibility==='private'?'selected':''}>Privat</option><option value="friends" ${profile.defaultVisibility==='friends'?'selected':''}>Freunde</option><option value="public" ${profile.defaultVisibility==='public'?'selected':''}>Öffentlich vorbereiten</option></select></label><label>Schutz an Start und Ende<input type="number" min="0" max="5000" step="50" data-profile-privacy value="${Number(profile.endpointPrivacyMeters)||250}"></label><label class="rt61-span rt61-video-choice"><input type="checkbox" data-profile-exact ${profile.shareExactTrack?'checked':''}> Exakte Tracks grundsätzlich erlauben; pro Fahrt ist weiterhin eine ausdrückliche Freigabe nötig</label></div><div class="rt61-status">${summary.total||0} Community-Einträge · ${summary.public||0} für ein späteres Backend vorbereitet. Noch werden keine Daten hochgeladen.</div><div class="rt61-actions"><button class="primary" data-profile-save>Profil speichern</button><button data-profile-local>Messprofile verwalten</button><button data-community-route="settings">Einstellungen</button><button data-community-route="support">Support</button><button data-community-route="admin">Administration</button></div></div>`;
    view.querySelector('[data-profile-save]').onclick=()=>{community?.updateProfile?.({avatar:view.querySelector('[data-profile-avatar]').value,pseudonym:view.querySelector('[data-profile-name]').value,bio:view.querySelector('[data-profile-bio]').value,defaultVisibility:view.querySelector('[data-profile-visibility]').value,endpointPrivacyMeters:Number(view.querySelector('[data-profile-privacy]').value),shareExactTrack:view.querySelector('[data-profile-exact]').checked});renderHome();showProfile();log('info','profile','Community profile updated');};
    view.querySelector('[data-profile-local]').onclick=()=>{view.hidden=true;document.body.dataset.rtRoute='profile';void state.originalRegistry?.navigate?.('profile');};view.hidden=false;view.scrollTo({top:0,behavior:'auto'});log('info','profile','Community profile opened');
  }

  async function storageStatus() {
    try{const estimate=await navigator.storage?.estimate?.();const free=Number(estimate?.quota||0)-Number(estimate?.usage||0);return{free,detail:free?`${Math.round(free/1048576)} MB frei`:'Speicherstatus unbekannt',state:free&&free<50*1048576?'block':free&&free<200*1048576?'warn':'ready'};}catch{return{detail:'Speicherstatus nicht verfügbar',state:'warn'};}
  }
  async function permissionState(name) { try{return (await navigator.permissions?.query?.({name}))?.state||'unknown';}catch{return'unknown';} }
  async function inspectPreflight() {
    const gpsHealth=window.RideTrackerGpsHealth?.snapshot?.()||{},gpsPermission=await permissionState('geolocation');
    const preview=byId('preview'),stream=preview?.srcObject,cameraReady=Boolean(stream?.getVideoTracks?.().some(track=>track.readyState==='live'));
    const calibrated=Boolean(window.RideTrackerCalibrationManager?.current?.())||/kalibriert/i.test(byId('calState')?.textContent||'');
    const storage=await storageStatus(),database=Boolean(window.RideTrackerDatabase);
    const devices=readJson('rideTracker.devices.v1',[]),deviceList=Array.isArray(devices)?devices:(devices?.devices||[]),external=deviceList.filter(device=>device?.enabled!==false&&!String(device.id||'').startsWith('phone-'));
    const channels=window.RideTrackerSensorChannelRegistry?.snapshot?.()||[];
    const checks=[
      {id:'gps',label:'GPS',state:!navigator.geolocation?'block':gpsPermission==='denied'?'block':gpsHealth.points?'ready':'warn',detail:!navigator.geolocation?'Nicht verfügbar':gpsPermission==='denied'?'Berechtigung verweigert':gpsHealth.points?`${gpsHealth.points} Punkte · ±${Math.round(gpsHealth.accuracyM||0)} m`:'Fix wird beim Start gesucht'},
      {id:'motion',label:'Bewegung',state:('DeviceMotionEvent'in window||'ondevicemotion'in window)?'ready':'warn',detail:('DeviceMotionEvent'in window||'ondevicemotion'in window)?'Sensorzugriff unterstützt':'Auf diesem Gerät nicht erkannt'},
      {id:'camera',label:'Kamera',state:cameraReady?'ready':'warn',detail:cameraReady?'Livebild aktiv':'Wird auf Wunsch beim Start aktiviert'},
      {id:'calibration',label:'Kalibrierung',state:calibrated?'ready':'warn',detail:calibrated?'Gültige Kalibrierung':'Wird vor dem Start durchgeführt'},
      {id:'storage',label:'Speicher',state:storage.state,detail:storage.detail},
      {id:'database',label:'Datenbank',state:database?'ready':'block',detail:database?`IndexedDB v${window.RideTrackerDatabase.version}`:'Nicht verfügbar'},
      {id:'external',label:'Externe Sensoren',state:!external.length?'ready':channels.length?'ready':'warn',detail:!external.length?'Keine ausgewählt':channels.length?`${channels.length} Geräte liefern Kanäle`:`${external.length} ausgewählt · noch keine Live-Daten`}
    ];
    const result={checkedAt:new Date().toISOString(),checks,blocking:checks.filter(check=>check.state==='block').map(check=>check.id),warning:checks.filter(check=>check.state==='warn').map(check=>check.id),ready:checks.every(check=>check.state!=='block')};
    state.lastPreflight=result;renderPreflight(result);window.dispatchEvent(new CustomEvent('ridetracker:preflight-completed',{detail:result}));return result;
  }
  function renderPreflight(result=state.lastPreflight) {
    const panel=byId('rtCommunityPreflight');if(!panel||!result)return;
    const host=panel.querySelector('[data-checks]');host.innerHTML=result.checks.map(check=>`<div class="rt61-check" data-state="${check.state}"><i>${check.state==='ready'?'●':check.state==='warn'?'◆':'!'}</i><span><b>${esc(check.label)}</b><small>${esc(check.detail)}</small></span></div>`).join('');
    const status=panel.querySelector('[data-status]');status.textContent=result.blocking.length?`Noch ${result.blocking.length} blockierende Prüfung(en).`:(result.warning.length?'Start möglich · fehlende Punkte werden beim Start vorbereitet.':'Alle Prüfungen bereit.');
  }
  function ensurePreflight() {
    let panel=byId('rtCommunityPreflight');if(panel)return panel;const anchor=byId('rtRecordingQuickStart')||document.querySelector('main>.controls');if(!anchor)return null;
    panel=document.createElement('section');panel.id='rtCommunityPreflight';panel.innerHTML=`<div class="rt61-preflight-head"><div><h3>Fahrt vorbereiten</h3><p>RideTracker prüft die gesamte Aufnahmekette und versucht fehlende Voraussetzungen beim Start zu korrigieren.</p></div><button type="button" data-refresh aria-label="Erneut prüfen">↻</button></div><div class="rt61-preflight-grid" data-checks></div><div class="rt61-status" data-status>Prüfung wird vorbereitet …</div><label class="rt61-video-choice"><input type="checkbox" data-video checked> Video mit synchroner Telemetrie aufnehmen</label><div class="rt61-preflight-actions"><button type="button" class="primary" data-start>Prüfen & Fahrt starten</button><button type="button" data-only-check>Nur prüfen</button></div>`;
    anchor.before(panel);panel.querySelector('[data-refresh]').onclick=()=>void inspectPreflight();panel.querySelector('[data-only-check]').onclick=()=>void inspectPreflight();panel.querySelector('[data-start]').onclick=()=>void startPreparedRide();void inspectPreflight();return panel;
  }
  async function startPreparedRide() {
    if(state.busy||isRecording())return;state.busy=true;const panel=ensurePreflight(),button=panel?.querySelector('[data-start]'),withVideo=Boolean(panel?.querySelector('[data-video]')?.checked);
    if(button){button.disabled=true;button.textContent='Berechtigungen & Sensoren werden vorbereitet …';}
    log('info','preflight','Automatic preparation started',{withVideo});
    try{
      const before=await inspectPreflight();
      if(before.blocking.includes('database')||before.blocking.includes('storage'))throw new Error('Datenbank oder Speicher ist nicht aufnahmebereit.');
      const started=withVideo?await window.RideTrackerRecordingActions?.startWithVideo?.():await window.RideTrackerRecordingActions?.startWithoutVideo?.();
      if(!started)throw new Error('Die Aufnahme konnte nach der automatischen Vorbereitung nicht gestartet werden.');
      log('info','preflight','Recording started successfully',{withVideo});
    }catch(error){log('error','preflight','Recording preparation failed',error);if(panel?.querySelector('[data-status]'))panel.querySelector('[data-status]').textContent=`Start fehlgeschlagen: ${error.message}`;}
    finally{state.busy=false;if(button){button.disabled=false;button.textContent='Prüfen & Fahrt starten';}void inspectPreflight();}
  }

  function ensureRideDraft() {
    let modal=byId('rtRideDraft61');if(modal)return modal;
    modal=document.createElement('section');modal.id='rtRideDraft61';modal.className='rt61-modal';modal.hidden=true;modal.innerHTML=`<div class="rt61-modal-card"><header class="rt61-modal-head"><div><h2>Fahrt fertigstellen</h2><p>Prüfe die Zuordnung und entscheide, wer diese Fahrt später sehen darf.</p></div><button class="rt61-close" data-close>×</button></header><div class="rt61-form"><label>Titel<input data-title placeholder="Meine Fahrt"></label><label>Sichtbarkeit<select data-visibility><option value="draft">Entwurf</option><option value="private" selected>Privat</option><option value="friends">Freunde</option><option value="public">Öffentlich vorbereiten</option></select></label><label>Park<input data-park placeholder="Park wird möglichst automatisch erkannt"></label><label>Achterbahn<input data-ride placeholder="Achterbahn"></label><label class="rt61-span">Beschreibung<textarea data-description placeholder="Wie war die Fahrt?"></textarea></label><label class="rt61-span rt61-video-choice"><input type="checkbox" data-exact> Exakte GPS-Strecke ausdrücklich zur Veröffentlichung freigeben</label></div><div class="rt61-status" data-status>Video und Messdaten bleiben bis zum Speichern ausschließlich lokal.</div><div class="rt61-actions"><button class="primary" type="button" data-save>Fahrt speichern</button><button type="button" data-preview>Vorschau</button><button type="button" data-discard>Verwerfen</button></div></div>`;document.body.appendChild(modal);
    modal.querySelector('[data-close]').onclick=()=>{modal.hidden=true};modal.querySelector('[data-preview]').onclick=()=>window.RideTrackerPostRecording?.play?.();modal.querySelector('[data-discard]').onclick=()=>{byId('rtDiscardRide')?.click();modal.hidden=true};modal.querySelector('[data-save]').onclick=()=>void saveRideDraft(modal);return modal;
  }
  function showRideDraft() {
    if(isRecording())return;const modal=ensureRideDraft(),profile=community?.load?.().profile;modal.querySelector('[data-title]').value=`Fahrt ${new Date().toLocaleString('de-DE')}`;modal.querySelector('[data-visibility]').value=profile?.defaultVisibility||'private';modal.querySelector('[data-exact]').checked=false;modal.hidden=false;log('info','ride-draft','Post-ride draft opened');
  }
  async function saveRideDraft(modal) {
    const save=modal.querySelector('[data-save]'),status=modal.querySelector('[data-status]');save.disabled=true;status.textContent='Video, Messwerte und Community-Metadaten werden gespeichert …';
    try{
      const ride=await window.RideTrackerRideLibrary?.savePendingRide?.();if(!ride?.id)throw new Error('Fahrt konnte nicht gespeichert werden.');
      const patch={title:modal.querySelector('[data-title]').value.trim()||ride.title,park:modal.querySelector('[data-park]').value.trim(),track:modal.querySelector('[data-ride]').value.trim(),comment:modal.querySelector('[data-description]').value.trim(),visibility:modal.querySelector('[data-visibility]').value,shareExactTrack:modal.querySelector('[data-exact]').checked,updatedAt:new Date().toISOString()};
      const all=rides(),meta=all.find(item=>item.id===ride.id);if(meta)Object.assign(meta,patch);writeJson(META_KEY,all);
      const entry=community?.upsertRide?.({id:ride.id,title:patch.title,parkName:patch.park,rideName:patch.track,description:patch.comment,visibility:patch.visibility,shareExactTrack:patch.shareExactTrack,createdAt:ride.createdAt,updatedAt:patch.updatedAt});
      const db=window.RideTrackerDatabase,pkg=await db?.get?.(db.stores.ridePackages,ride.id).catch(()=>null);if(pkg){pkg.document=pkg.document||{};pkg.document.community={...entry};pkg.document.context={...(pkg.document.context||{}),parkName:patch.park,rideName:patch.track};pkg.parkName=patch.park;pkg.rideName=patch.track;await db.put(db.stores.ridePackages,ride.id,pkg);}
      await window.RideTrackerRideLibrary?.render?.();modal.hidden=true;renderHome();window.dispatchEvent(new CustomEvent('ridetracker:community-ride-updated',{detail:{rideId:ride.id,visibility:patch.visibility}}));log('info','ride-draft','Ride saved',{rideId:ride.id,visibility:patch.visibility,shareExactTrack:patch.shareExactTrack});
    }catch(error){status.textContent=`Speichern fehlgeschlagen: ${error.message}`;log('error','ride-draft','Ride save failed',error);}finally{save.disabled=false;}
  }

  async function runSelfTest() {
    const results=[],add=(name,stateValue,detail)=>results.push({name,state:stateValue,detail});
    add('Release-Manifest',RELEASE?.baseline?.commit?'pass':'fail',RELEASE?.version||'fehlt');
    add('Hauptnavigation',ensureBottomNav().querySelectorAll('button').length===5?'pass':'fail','5 mobile Hauptziele');
    add('Community-Datenmodell',community?.load?.().schemaVersion==='1.0.0'?'pass':'fail',community?.load?.().schemaVersion||'fehlt');
    try{const db=await window.RideTrackerDatabase?.selfTest?.();add('IndexedDB',db?.ok?'pass':'fail',db?`v${db.version} · ${db.stores.length} Stores`:'nicht verfügbar');}catch(error){add('IndexedDB','fail',error.message);}
    const blockerIds=['rtCanonicalScrim','rtInlineScrim','rtNavScrim','rtExportDialog','rtStandaloneHudEditor','rtDeviceCenter'];const blockers=blockerIds.filter(id=>{const node=byId(id);if(!node)return false;const style=getComputedStyle(node);return style.display!=='none'&&style.pointerEvents!=='none'&&!node.hidden&&(node.classList.contains('open')||id==='rtExportDialog');});add('Blockierende Overlays',blockers.length?'warn':'pass',blockers.length?blockers.join(', '):'keine');
    const before=performance.now();await new Promise(resolve=>setTimeout(resolve,0));const lag=performance.now()-before;add('Main-Thread',lag>500?'fail':lag>120?'warn':'pass',`${lag.toFixed(1)} ms Timer-Lag`);
    const preflight=await inspectPreflight();add('Aufnahmekette',preflight.blocking.length?'warn':'pass',preflight.blocking.length?`Blockiert: ${preflight.blocking.join(', ')}`:'grundsätzlich startfähig');
    add('Navigation-Audit',window.RideTrackerNavigationRegistry?.audit?.().consistent?'pass':'fail','Community-Navigation');
    log(results.some(x=>x.state==='fail')?'error':'info','self-test','Self-test completed',results);return{checkedAt:new Date().toISOString(),ok:results.every(result=>result.state!=='fail'),results};
  }
  async function supportBundle() {
    let diagnostics=null;try{diagnostics=await window.RideTrackerDiagnostics?.snapshot?.();}catch(error){diagnostics={error:error?.message||String(error)};}
    const selfTest=await runSelfTest();return{format:'ridetracker-support-bundle',schemaVersion:'1.0.0',generatedAt:new Date().toISOString(),release:{...RELEASE,runtimeCommit:runtimeCommit()},environment:{userAgent:navigator.userAgent,language:navigator.language,online:navigator.onLine,viewport:{width:innerWidth,height:innerHeight},orientation:screen.orientation?.type||null,url:`${location.origin}${location.pathname}`},selfTest,preflight:safeValue(state.lastPreflight),community:safeValue(community?.summary?.()),diagnostics:safeValue(diagnostics),logs:state.logs.slice(-500).map(safeValue)};
  }
  function ensureSupport() {
    let modal=byId('rtSupportCenter61');if(modal)return modal;modal=document.createElement('section');modal.id='rtSupportCenter61';modal.className='rt61-modal';modal.hidden=true;modal.innerHTML=`<div class="rt61-modal-card"><header class="rt61-modal-head"><div><h2>Support & Diagnose</h2><p>Datenschutzbereinigte Betriebsdaten für gezielte Fehleranalyse.</p></div><button class="rt61-close" data-close>×</button></header><div class="rt61-status" data-summary></div><div class="rt61-actions"><button class="primary" data-test>Selbsttest starten</button><button data-export>Support-Paket exportieren</button><button data-copy>Zusammenfassung kopieren</button><button data-clear>Log leeren</button></div><div data-tests class="rt61-test-grid"></div><h3>Letzte Ereignisse</h3><pre class="rt61-log" data-log></pre></div>`;document.body.appendChild(modal);modal.querySelector('[data-close]').onclick=()=>modal.hidden=true;modal.querySelector('[data-test]').onclick=async()=>{const result=await runSelfTest();renderSupport(result);};modal.querySelector('[data-export]').onclick=async()=>downloadJson(`RideTracker-Support-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,await supportBundle());modal.querySelector('[data-copy]').onclick=async()=>{const bundle=await supportBundle();await navigator.clipboard?.writeText?.(JSON.stringify({release:bundle.release,selfTest:bundle.selfTest,preflight:bundle.preflight},null,2));};modal.querySelector('[data-clear]').onclick=()=>{state.logs=[];persistLogs();renderSupport();};return modal;
  }
  function renderSupport(test=null) {
    const modal=byId('rtSupportCenter61');if(!modal)return;const errors=state.logs.filter(item=>item.level==='error').length;modal.querySelector('[data-summary]').textContent=`Version ${RELEASE.version} · Commit ${runtimeCommit().slice(0,8)} · ${state.logs.length} Ereignisse · ${errors} Fehler`;
    if(test)modal.querySelector('[data-tests]').innerHTML=test.results.map(result=>`<div class="rt61-test" data-state="${result.state}"><span>${esc(result.name)}<small> · ${esc(result.detail)}</small></span><b>${result.state==='pass'?'OK':result.state==='warn'?'Hinweis':'Fehler'}</b></div>`).join('');
    modal.querySelector('[data-log]').textContent=state.logs.slice(-100).map(item=>`${item.at.slice(11,19)} ${item.level.toUpperCase().padEnd(5)} ${item.source}: ${item.message}`).join('\n')||'Noch keine Ereignisse.';
  }
  function showSupport() { const modal=ensureSupport();modal.hidden=false;renderSupport();void runSelfTest().then(renderSupport);log('info','support','Support center opened'); }

  async function dataQuality() {
    const saved=rides(),db=window.RideTrackerDatabase,packages=await db?.getAll?.(db.stores.ridePackages).catch(()=>[])||[],ids=new Set(),duplicates=[];
    for(const ride of saved){const key=`${String(ride.park||'').toLowerCase()}::${String(ride.track||ride.title||'').toLowerCase()}::${String(ride.createdAt||'').slice(0,16)}`;if(ids.has(key))duplicates.push(ride.id);ids.add(key);}
    return{rides:saved.length,packages:packages.length,missingPark:saved.filter(ride=>!String(ride.park||'').trim()).length,missingRide:saved.filter(ride=>!String(ride.track||'').trim()).length,withoutPackage:saved.filter(ride=>!packages.some(pkg=>String(pkg.id)===String(ride.id))).length,duplicates:duplicates.length,publicReady:community?.summary?.().readyForBackend||0};
  }
  async function fullLocalBackup() {
    const db=window.RideTrackerDatabase,packages=await db?.getAll?.(db.stores.ridePackages).catch(()=>[])||[];const selected={};
    for(let index=0;index<localStorage.length;index++){const key=localStorage.key(index);if(key?.startsWith('rideTracker.'))selected[key]=readJson(key,localStorage.getItem(key));}
    return{format:'ridetracker-local-backup',schemaVersion:'1.0.0',generatedAt:new Date().toISOString(),release:{...RELEASE,runtimeCommit:runtimeCommit()},warning:'Enthält lokale Fahrtdaten und kann genaue GPS-Positionen enthalten. Nicht öffentlich teilen.',localStorage:selected,ridePackages:packages,videoBlobsIncluded:false};
  }
  function ensureAdmin() {
    let modal=byId('rtAdminCenter61');if(modal)return modal;modal=document.createElement('section');modal.id='rtAdminCenter61';modal.className='rt61-modal';modal.hidden=true;modal.innerHTML=`<div class="rt61-modal-card"><header class="rt61-modal-head"><div><h2>Lokale Administration</h2><p>Version, Datenqualität, Reparatur und Community-Vorbereitung.</p></div><button class="rt61-close" data-close>×</button></header><div class="rt61-admin-grid"><section class="rt61-admin-card"><h3>Version & Rollback</h3><p data-version></p><div class="rt61-actions"><a data-rollback target="_blank" rel="noopener">Rollback-Punkt öffnen</a></div></section><section class="rt61-admin-card"><h3>Datenqualität</h3><p data-quality>Wird geprüft …</p><div class="rt61-actions"><button data-normalize>Sichtbarkeit normalisieren</button></div></section><section class="rt61-admin-card"><h3>Systemreparatur</h3><p>Prüft die lokale Datenbank und entfernt blockierende UI-Zustände.</p><div class="rt61-actions"><button data-repair>UI reparieren</button><button data-db>Datenbank prüfen</button><button data-cache>Referenzcache leeren</button></div></section><section class="rt61-admin-card"><h3>Feature-Schalter</h3><p>Lokale Vorbereitung für den späteren rollenbasierten Community-Betrieb.</p><div class="rt61-flags" data-flags></div></section></div><div class="rt61-status" data-status>Bereit.</div><div class="rt61-actions"><button class="primary" data-backup>Lokales Vollbackup exportieren</button><button data-support>Supportbereich öffnen</button></div></div>`;document.body.appendChild(modal);
    modal.querySelector('[data-close]').onclick=()=>modal.hidden=true;modal.querySelector('[data-rollback]').href=RELEASE.baseline?.url||'#';modal.querySelector('[data-version]').textContent=`Aktuell ${RELEASE.version} (${runtimeCommit().slice(0,8)}). Stabiler Ausgangspunkt: ${RELEASE.baseline?.commit?.slice(0,8)} auf ${RELEASE.baseline?.rollbackBranch}.`;
    modal.querySelector('[data-repair]').onclick=async()=>{const result=await window.RideTrackerDiagnostics?.safeBoot?.();modal.querySelector('[data-status]').textContent=`UI-Reparatur ausgeführt: ${JSON.stringify(result||{})}`;};modal.querySelector('[data-db]').onclick=async()=>{try{const result=await window.RideTrackerDatabase?.selfTest?.();modal.querySelector('[data-status]').textContent=`Datenbank OK · v${result.version} · ${result.stores.join(', ')}`;}catch(error){modal.querySelector('[data-status]').textContent=`Datenbankfehler: ${error.message}`;}};
    modal.querySelector('[data-cache]').onclick=async()=>{if(!confirm('Nur heruntergeladene Park-/Referenzdaten aus dem Cache löschen? Fahrten und Videos bleiben erhalten.'))return;await window.RideTrackerDatabase?.clear?.(window.RideTrackerDatabase.stores.cache);modal.querySelector('[data-status]').textContent='Referenzcache geleert.';};modal.querySelector('[data-backup]').onclick=async()=>{if(!confirm('Das Vollbackup kann genaue GPS-Daten enthalten. Nur lokal und geschützt speichern?'))return;downloadJson(`RideTracker-Vollbackup-${new Date().toISOString().slice(0,10)}.json`,await fullLocalBackup());};modal.querySelector('[data-support]').onclick=()=>{modal.hidden=true;showSupport();};modal.querySelector('[data-normalize]').onclick=()=>{for(const ride of rides())community?.upsertRide?.({id:ride.id,title:ride.title,parkName:ride.park,rideName:ride.track,visibility:ride.visibility||'private',createdAt:ride.createdAt});modal.querySelector('[data-status]').textContent='Alle Fahrten besitzen jetzt einen gültigen Community-Sichtbarkeitsstatus.';void renderAdmin();};return modal;
  }
  async function renderAdmin() {
    const modal=ensureAdmin(),quality=await dataQuality();modal.querySelector('[data-quality]').textContent=`${quality.rides} Metadaten · ${quality.packages} Pakete · ${quality.missingPark} ohne Park · ${quality.missingRide} ohne Bahn · ${quality.withoutPackage} ohne Paket · ${quality.duplicates} mögliche Duplikate · ${quality.publicReady} für Backend bereit.`;
    const featureFlags=flags(),host=modal.querySelector('[data-flags]');host.innerHTML=Object.entries({communityPreview:'Community-Vorschau',detailedLogging:'Detailliertes lokales Logging',automaticRepair:'Automatische UI-Reparatur'}).map(([key,label])=>`<label><input type="checkbox" data-flag="${key}" ${featureFlags[key]?'checked':''}> ${label}</label>`).join('');host.querySelectorAll('[data-flag]').forEach(input=>input.onchange=()=>{const next=flags();next[input.dataset.flag]=input.checked;writeJson(FLAGS_KEY,next);log('info','admin','Feature flag changed',{flag:input.dataset.flag,value:input.checked});});
  }
  function showAdmin() { const modal=ensureAdmin();modal.hidden=false;void renderAdmin();log('info','admin','Admin center opened'); }

  function installInstrumentation() {
    try{const saved=readJson(LOG_KEY,[]);if(Array.isArray(saved))state.logs=saved.slice(-800);}catch(_){}
    window.addEventListener('error',event=>log('error','window',event.message||'Window error',{filename:event.filename,lineno:event.lineno,colno:event.colno}));window.addEventListener('unhandledrejection',event=>log('error','promise',event.reason?.message||String(event.reason||'Unhandled rejection'),event.reason));
    document.addEventListener('click',event=>{const target=event.target.closest?.('button,a,[role=button]');if(!target)return;const started=performance.now(),detail={id:target.id||null,route:target.dataset.communityRoute||target.dataset.registryRoute||null,label:String(target.getAttribute('aria-label')||target.textContent||'').trim().slice(0,80),disabled:Boolean(target.disabled)};setTimeout(()=>{const duration=performance.now()-started;log(duration>800?'warn':'info','action','UI action', {...detail,durationMs:Math.round(duration),resultRoute:document.body.dataset.rtRoute||null});if(duration>1500&&flags().automaticRepair&&!isRecording())window.RideTrackerDiagnostics?.safeBoot?.();},0);},true);
    for(const name of ['ridetracker:recording-started','ridetracker:recording-stopped','ridetracker:ride-saved','ridetracker:ride-validated','ridetracker:recording-gps-error','ridetracker:database-error','ridetracker:navigation-audit'])window.addEventListener(name,event=>log(name.includes('error')?'error':'info','event',name,event.detail));
    try{new PerformanceObserver(list=>{for(const entry of list.getEntries())if(entry.duration>150)log('warn','performance','Long task',{durationMs:Math.round(entry.duration),name:entry.name});}).observe({type:'longtask',buffered:true});}catch(_){}
  }
  function patchNavigationRegistry() {
    const registry=window.RideTrackerNavigationRegistry;if(!registry)return;state.originalRegistry={navigate:registry.navigate.bind(registry),routes:registry.routes.bind(registry),audit:registry.audit.bind(registry)};
    registry.navigate=navigate;registry.routes=()=>[...state.originalRegistry.routes(),{id:'community',title:'Entdecken',icon:'◎',subtitle:'Community-Vorschau'},{id:'support',title:'Support & Diagnose',icon:'◉',subtitle:'Logs und Selbsttests'},{id:'admin',title:'Administration',icon:'⚙',subtitle:'Version und Datenqualität'}];registry.audit=()=>{const buttons=[...ensureBottomNav().querySelectorAll('[data-community-route]')];const routes=buttons.map(button=>button.dataset.communityRoute);return{consistent:buttons.length===5&&new Set(routes).size===5,routes,communityFoundation:true};};
  }
  function patchSafeBoot() {
    const diagnostics=window.RideTrackerDiagnostics;if(!diagnostics?.safeBoot||diagnostics.safeBoot.__rt61)return;const original=diagnostics.safeBoot.bind(diagnostics);
    const safeBoot=async()=>{
      if(isRecording())return{skipped:'recording'};
      closeFoundationViews();byId('rtRideDraft61')?.setAttribute('hidden','');
      const result=await original();
      renderHome();syncBottomNav();
      const recovery={...result,activeDialog:window.RideTrackerDialogManager?.active?.()||null,fullscreen:Boolean(document.fullscreenElement||document.webkitFullscreenElement),rootPointerEvents:getComputedStyle(document.documentElement).pointerEvents,homePointerEvents:getComputedStyle(byId('rtInlineDashboard')).pointerEvents};
      log(recovery.activeDialog||recovery.fullscreen||recovery.rootPointerEvents==='none'||recovery.homePointerEvents==='none'?'warn':'info','boot','Safe boot completed',recovery);
      return recovery;
    };safeBoot.__rt61=true;diagnostics.safeBoot=safeBoot;
  }
  function install() {
    if(state.installed)return;state.installed=true;installInstrumentation();patchNavigationRegistry();patchSafeBoot();byId('rtInlineProfile')?.setAttribute('data-community-route','profile');ensureBottomNav();renderHome();ensurePreflight();ensureRideDraft();
    document.addEventListener('click',event=>{const target=event.target.closest?.('[data-community-route]');if(!target)return;event.preventDefault();event.stopImmediatePropagation();void navigate(target.dataset.communityRoute);},true);
    const routeObserver=new MutationObserver(syncBottomNav);routeObserver.observe(document.body,{attributes:true,attributeFilter:['data-rt-route']});
    window.addEventListener('ridetracker:recording-stopped',()=>setTimeout(showRideDraft,750));window.addEventListener('ridetracker:ride-saved',()=>{renderHome();void renderAdmin();});window.addEventListener('ridetracker:new-ride-session',()=>byId('rtRideDraft61')?.setAttribute('hidden',''));window.addEventListener('pageshow',()=>{renderHome();syncBottomNav();void inspectPreflight();});
    window.RideTrackerRelease={manifest:()=>({...RELEASE,runtimeCommit:runtimeCommit()}),rollbackPoint:()=>({...RELEASE.baseline}),exportLocalBackup:fullLocalBackup};window.RideTrackerPreflight={inspect:inspectPreflight,start:startPreparedRide,last:()=>state.lastPreflight};window.RideTrackerSupportCenter={open:showSupport,log,runSelfTest,bundle:supportBundle};window.RideTrackerAdminCenter={open:showAdmin,dataQuality,backup:fullLocalBackup};window.RideTrackerCommunity={open:showCommunity,store:community,navigate};
    syncBottomNav();log('info','boot','Community foundation installed',{version:RELEASE.version,baseline:RELEASE.baseline?.commit});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
