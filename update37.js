(() => {
  'use strict';

  const META_KEY = 'rideTracker.savedRides.v2';
  const DRAFT_KEY = 'rideTracker.unsavedRide.v1';
  const ACTIVE_KEY = 'rideTracker.activeRideId.v1';
  const state = { dirty: false, pendingBlob: null, activeRideId: sessionStorage.getItem(ACTIVE_KEY) || null };

  const readJson = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; } };
  const readMeta = () => readJson(META_KEY, []);
  const writeMeta = value => localStorage.setItem(META_KEY, JSON.stringify(value));
  const db = () => window.RideTrackerDatabase;
  const videoStore = () => db()?.stores?.videos || 'videos';
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function setActiveRideId(id) {
    state.activeRideId = id || null;
    if (state.activeRideId) sessionStorage.setItem(ACTIVE_KEY, state.activeRideId);
    else sessionStorage.removeItem(ACTIVE_KEY);
    window.dispatchEvent(new CustomEvent('ridetracker:active-ride-changed', { detail: { rideId: state.activeRideId } }));
  }

  function newRideSession() {
    setActiveRideId(null);
    state.pendingBlob = null;
    state.dirty = false;
    localStorage.removeItem(DRAFT_KEY);
    window.dispatchEvent(new CustomEvent('ridetracker:new-ride-session'));
  }

  const deviceSnapshot = () => {
    const raw = readJson('rideTracker.devices.v1', []);
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.devices) ? raw.devices : []);
    return list.filter(x => x?.id).map(x => ({ id:String(x.id), name:String(x.name||x.label||x.id), type:String(x.type||x.transport||'unknown'), enabled:x.enabled!==false, pluginId:x.pluginId??null, channels:Array.isArray(x.channels)?x.channels:[], calibration:x.calibration??null, ...x }));
  };
  const sourceRoutingSnapshot = () => {
    const raw = readJson('rideTracker.metricBindings.v1', readJson('rideTracker.sourceRouting.v1', []));
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.metricBindings) ? raw.metricBindings : (Array.isArray(raw?.bindings) ? raw.bindings : []));
    return list.filter(x => x?.metric).map(x => ({ metric:String(x.metric), primarySource:String(x.primarySource||''), fallbackSources:Array.isArray(x.fallbackSources)?x.fallbackSources.map(String):[], minimumQuality:Math.max(0,Math.min(1,Number(x.minimumQuality??0))), maxAgeMs:Math.max(0,Math.round(Number(x.maxAgeMs??0))), interpolation:['none','hold','linear'].includes(x.interpolation)?x.interpolation:'hold', widgetId:x.widgetId??null }));
  };
  const cameraSnapshot = () => {
    const raw = window.RideTrackerCameraSources?.snapshot?.() || readJson('rideTracker.cameraSources.v1', {});
    const sources = Array.isArray(raw.sources) ? raw.sources : [];
    return { primaryId:raw.primaryId??raw.primary??null, fallbackIds:Array.isArray(raw.fallbackIds)?raw.fallbackIds:(Array.isArray(raw.fallbacks)?raw.fallbacks:[]), sources:sources.map((x,index)=>({id:String(x.id||`camera-${index}`),name:String(x.name||x.label||x.id||`Kamera ${index+1}`),position:x.position??null,transport:x.transport??null,available:x.available!==false,...x})) };
  };
  const hudSnapshot = () => {
    const raw = readJson('rideTracker.hud.configuration.v1', {});
    const profiles = raw && typeof raw.profiles === 'object' && !Array.isArray(raw.profiles) ? raw.profiles : {};
    return { version:String(raw.version||'1.0.0'), activeProfile:raw.activeProfile??null, profiles, watermark:raw.watermark??null };
  };
  const configurationSnapshot = () => ({
    schemaVersion:'1.0.0', coreVersion:window.RideTrackerCoreRuntime?.snapshot?.().coreVersion||'2.0.0-alpha.1', capturedAt:new Date().toISOString(), platform:'web',
    devices:deviceSnapshot(), sourceRouting:sourceRoutingSnapshot(), camera:cameraSnapshot(), hud:hudSnapshot(),
    calibration:{mode:document.getElementById('calMode')?.value||'manual',forwardEdge:document.getElementById('forward')?.value||'top',deviceCalibration:window.RideTrackerCalibrationManager?.current?.()||null}
  });

  async function currentRecordedBlob() {
    const controllerBlob = window.RideTrackerPostRecording?.blob?.();
    if (controllerBlob instanceof Blob) return controllerBlob;
    const replay = document.getElementById('replay');
    const src = replay?.currentSrc || replay?.src;
    if (!src?.startsWith('blob:')) return state.pendingBlob;
    try { return await fetch(src).then(r => r.ok ? r.blob() : null); } catch (_) { return state.pendingBlob; }
  }

  async function putVideo(id, blob) {
    if (!(blob instanceof Blob)) return;
    const database = db();
    if (!database) throw new Error('RideTrackerDatabase ist noch nicht bereit.');
    await database.put(videoStore(), id, blob);
  }
  async function getVideo(id) {
    const database = db();
    if (!database) throw new Error('RideTrackerDatabase ist noch nicht bereit.');
    return database.get(videoStore(), id);
  }
  async function deleteVideo(id) {
    const database = db();
    if (!database) throw new Error('RideTrackerDatabase ist noch nicht bereit.');
    return database.delete(videoStore(), id);
  }

  const style = document.createElement('style');
  style.textContent = `#rtRideLibrary{position:relative;z-index:420;max-width:1050px;margin:auto;padding:0 12px 30px}#rtRideLibrary[hidden]{display:none!important}.rt-ride-list{display:grid;gap:12px}.rt-ride-card{border:1px solid #29435f;border-radius:18px;background:#0a1727;padding:14px}.rt-ride-card video{width:100%;max-height:430px;background:#000;border-radius:13px}.rt-ride-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.rt-ride-grid label{display:grid;gap:5px;color:#96aac1;font-size:12px}.rt-ride-grid input,.rt-ride-grid textarea,.rt-ride-grid select{width:100%;background:#07111f;color:#f5fbff;border:1px solid #29435f;border-radius:10px;padding:10px}.rt-ride-grid textarea{min-height:82px;resize:vertical}.rt-span{grid-column:1/-1}.rt-ride-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.rt-post-record{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}.rt-post-record button{flex:1;min-width:150px}.rt-config-summary{margin-top:10px;padding:10px;border:1px solid #29435f;border-radius:12px;color:#96aac1;font-size:12px}@media(max-width:640px){.rt-ride-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);

  function home(){document.querySelectorAll('.rt-tool-view,#rtSettingsView,#rtRideLibrary').forEach(v=>v.hidden=true);document.querySelectorAll('.rt-view').forEach(v=>v.remove());document.getElementById('rideDashboard')?.style.setProperty('display','block');document.getElementById('rtInlineDashboard')?.removeAttribute('hidden');window.scrollTo({top:0,behavior:'smooth'});}
  window.RideTrackerNavigation = { ...(window.RideTrackerNavigation||{}), home };

  function ensurePostRecordActions(){
    const videoMeta=document.getElementById('videoMeta');
    if(!videoMeta||document.getElementById('rtPostRecordActions')) return;
    const row=document.createElement('div'); row.id='rtPostRecordActions'; row.className='rt-post-record'; row.hidden=true;
    row.innerHTML='<button type="button" id="rtPreviewLast">Vorschau abspielen</button><button type="button" id="rtSaveRide" class="primary">Fahrt speichern</button><button type="button" id="rtDiscardRide">Verwerfen</button>';
    videoMeta.after(row);
    row.querySelector('#rtPreviewLast').onclick=()=>window.RideTrackerPostRecording?.play?.();
    row.querySelector('#rtSaveRide').onclick=()=>void savePendingRide();
    row.querySelector('#rtDiscardRide').onclick=()=>{state.dirty=false;state.pendingBlob=null;localStorage.removeItem(DRAFT_KEY);row.hidden=true;window.dispatchEvent(new CustomEvent('ridetracker:ride-discarded'));};
  }

  async function savePendingRide() {
    const blob = state.pendingBlob || await currentRecordedBlob();
    const rides = readMeta();
    let ride = state.activeRideId ? rides.find(x => x.id === state.activeRideId) : null;
    const isNew = !ride;
    if (!ride) {
      const id = crypto.randomUUID();
      const now = new Date();
      ride = { id, createdAt:now.toISOString(), title:`Fahrt ${now.toLocaleString('de-DE')}`, park:'', track:'', notes:'', comment:'', rating:0, hasVideo:false, recordingConfiguration:null };
      rides.unshift(ride);
      setActiveRideId(id);
    }
    ride.updatedAt = new Date().toISOString();
    ride.recordingConfiguration = configurationSnapshot();
    if (blob instanceof Blob) { await putVideo(ride.id, blob); ride.hasVideo = true; }
    writeMeta(rides);
    state.dirty=false; state.pendingBlob=blob||null; localStorage.removeItem(DRAFT_KEY);
    document.getElementById('rtPostRecordActions')?.setAttribute('hidden','');
    window.dispatchEvent(new CustomEvent('ridetracker:ride-saved',{detail:{rideId:ride.id,isNew}}));
    showLibrary(ride.id);
    return ride;
  }

  function markStopped(){
    setTimeout(async()=>{
      state.pendingBlob = await currentRecordedBlob();
      state.dirty = true;
      localStorage.setItem(DRAFT_KEY, JSON.stringify({rideId:state.activeRideId,stoppedAt:Date.now(),recordingConfiguration:configurationSnapshot()}));
      const row=document.getElementById('rtPostRecordActions'); if(row) row.hidden=false;
    },650);
  }

  function installRecordingHooks(){
    document.getElementById('stop')?.addEventListener('click',markStopped,true);
    window.addEventListener('ridetracker:recording-stopped',markStopped);
    window.addEventListener('ridetracker:new-ride-session',()=>{state.pendingBlob=null;state.dirty=false;});
    window.addEventListener('beforeunload',event=>{if(!state.dirty)return;event.preventDefault();event.returnValue='';});
  }

  function ensureLibrary(){
    let view=document.getElementById('rtRideLibrary'); if(view) return view;
    view=document.createElement('section'); view.id='rtRideLibrary'; view.hidden=true;
    view.innerHTML='<header class="rt-tool-head"><div><h2>Meine Fahrten</h2><p>Videos ansehen und bestehende Fahrten bearbeiten</p></div><button type="button" class="rt-tool-back">Hauptmenü</button></header><div id="rtRideList" class="rt-ride-list"></div>';
    view.querySelector('.rt-tool-back').onclick=home; document.querySelector('main')?.prepend(view); return view;
  }

  async function updateRideFromCard(rideId, card){
    const rides=readMeta(); const ride=rides.find(x=>x.id===rideId); if(!ride) return;
    card.querySelectorAll('[data-field]').forEach(input=>ride[input.dataset.field]=input.dataset.field==='rating'?Number(input.value):input.value);
    ride.updatedAt=new Date().toISOString(); writeMeta(rides); setActiveRideId(ride.id);
    window.dispatchEvent(new CustomEvent('ridetracker:ride-saved',{detail:{rideId:ride.id,isNew:false}}));
  }

  async function renderLibrary(focusRideId=null){
    const list=ensureLibrary().querySelector('#rtRideList'); const rides=readMeta();
    if(!rides.length){list.innerHTML='<div class="rt-ride-card">Noch keine bewusst gespeicherte Fahrt vorhanden.</div>';return;}
    list.innerHTML='';
    for(const ride of rides){
      const config=ride.recordingConfiguration||{}; const deviceCount=Array.isArray(config.devices)?config.devices.length:0;
      const cameraName=config.camera?.sources?.find?.(x=>x.id===config.camera?.primaryId)?.name||'Standardkamera';
      const card=document.createElement('article'); card.className='rt-ride-card'; card.dataset.rideId=ride.id;
      card.innerHTML=`<div class="rt-ride-grid"><label>Titel<input data-field="title" value="${escapeHtml(ride.title)}"></label><label>Park<input data-field="park" value="${escapeHtml(ride.park)}"></label><label>Strecke/Bahn<input data-field="track" value="${escapeHtml(ride.track)}"></label><label>Bewertung<select data-field="rating">${[0,1,2,3,4,5].map(v=>`<option value="${v}" ${Number(ride.rating)===v?'selected':''}>${v?v+' Sterne':'Keine'}</option>`).join('')}</select></label><label class="rt-span">Private Notiz<textarea data-field="notes">${escapeHtml(ride.notes)}</textarea></label><label class="rt-span">Kommentar<textarea data-field="comment">${escapeHtml(ride.comment)}</textarea></label></div><div class="rt-config-summary">Aufnahmekonfiguration ${escapeHtml(config.schemaVersion||'ältere Version')} · ${deviceCount} Geräte · Kamera: ${escapeHtml(cameraName)}</div><div class="rt-video-host"></div><div class="rt-ride-actions"><button type="button" data-action="save">Änderungen speichern</button><button type="button" data-action="play">Video laden</button><button type="button" data-action="continue">Fahrt weiter bearbeiten</button><button type="button" data-action="delete" class="danger">Fahrt löschen</button></div>`;
      card.querySelector('[data-action="save"]').onclick=()=>void updateRideFromCard(ride.id,card);
      card.querySelector('[data-action="play"]').onclick=async()=>{setActiveRideId(ride.id);const host=card.querySelector('.rt-video-host');const blob=await getVideo(ride.id);if(!(blob instanceof Blob)){host.textContent='Für diese Fahrt ist kein Video gespeichert.';return;}host.innerHTML='';const video=document.createElement('video');video.controls=true;video.playsInline=true;video.src=URL.createObjectURL(blob);host.appendChild(video);try{await video.play();}catch(_){}};
      card.querySelector('[data-action="continue"]').onclick=()=>{setActiveRideId(ride.id);home();document.querySelector('[data-inline-route="record"]')?.click?.();};
      card.querySelector('[data-action="delete"]').onclick=async()=>{if(!confirm('Fahrt endgültig löschen?'))return;writeMeta(readMeta().filter(x=>x.id!==ride.id));await deleteVideo(ride.id);if(state.activeRideId===ride.id)setActiveRideId(null);await renderLibrary();};
      list.appendChild(card);
      if(focusRideId===ride.id) setTimeout(()=>card.scrollIntoView({block:'center'}),0);
    }
  }

  function showLibrary(focusRideId=null){document.getElementById('rideDashboard')?.style.setProperty('display','none');document.getElementById('rtInlineDashboard')?.setAttribute('hidden','');document.querySelectorAll('.rt-tool-view,#rtSettingsView').forEach(v=>v.hidden=true);const view=ensureLibrary();view.hidden=false;void renderLibrary(focusRideId);view.scrollIntoView({block:'start'});}

  let observerScheduled=false;
  const observer=new MutationObserver(()=>{if(observerScheduled)return;observerScheduled=true;requestAnimationFrame(()=>{observerScheduled=false;ensurePostRecordActions();});});
  observer.observe(document.body,{childList:true,subtree:true});

  ensurePostRecordActions(); installRecordingHooks();
  window.RideTrackerRideLibrary={show:showLibrary,render:renderLibrary,configurationSnapshot,savePendingRide,newRideSession,setActiveRideId,activeRideId:()=>state.activeRideId};
})();
