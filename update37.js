(() => {
  'use strict';
  const META_KEY='rideTracker.savedRides.v2';
  const DRAFT_KEY='rideTracker.unsavedRide.v1';
  const DB_NAME='RideTrackerMedia';
  const DB_STORE='videos';
  const state={dirty:false,lastStoppedAt:0,pendingBlob:null,pendingUrl:null};

  const readMeta=()=>{try{return JSON.parse(localStorage.getItem(META_KEY)||'[]')}catch{return[]}};
  const writeMeta=value=>localStorage.setItem(META_KEY,JSON.stringify(value));
  const readJson=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback))}catch{return fallback}};
  const deviceSnapshot=()=>{const raw=readJson('rideTracker.devices.v1',[]);const list=Array.isArray(raw)?raw:(Array.isArray(raw?.devices)?raw.devices:[]);return list.filter(x=>x?.id).map(x=>({id:String(x.id),name:String(x.name||x.label||x.id),type:String(x.type||x.transport||'unknown'),enabled:x.enabled!==false,pluginId:x.pluginId??null,channels:Array.isArray(x.channels)?x.channels:[],calibration:x.calibration??null,...x}))};
  const sourceRoutingSnapshot=()=>{const raw=readJson('rideTracker.metricBindings.v1',readJson('rideTracker.sourceRouting.v1',[]));const list=Array.isArray(raw)?raw:(Array.isArray(raw?.metricBindings)?raw.metricBindings:(Array.isArray(raw?.bindings)?raw.bindings:[]));return list.filter(x=>x?.metric).map(x=>({metric:String(x.metric),primarySource:String(x.primarySource||''),fallbackSources:Array.isArray(x.fallbackSources)?x.fallbackSources.map(String):[],minimumQuality:Math.max(0,Math.min(1,Number(x.minimumQuality??0))),maxAgeMs:Math.max(0,Math.round(Number(x.maxAgeMs??0))),interpolation:['none','hold','linear'].includes(x.interpolation)?x.interpolation:'hold',widgetId:x.widgetId??null}))};
  const cameraSnapshot=()=>{const raw=window.RideTrackerCameraSources?.snapshot?.()||readJson('rideTracker.cameraSources.v1',{});const sources=Array.isArray(raw.sources)?raw.sources:[];return {primaryId:raw.primaryId??raw.primary??null,fallbackIds:Array.isArray(raw.fallbackIds)?raw.fallbackIds:(Array.isArray(raw.fallbacks)?raw.fallbacks:[]),sources:sources.map((x,index)=>({id:String(x.id||`camera-${index}`),name:String(x.name||x.label||x.id||`Kamera ${index+1}`),position:x.position??null,transport:x.transport??null,available:x.available!==false,...x}))}};
  const hudSnapshot=()=>{const raw=readJson('rideTracker.hud.configuration.v1',{});const profiles=raw&&typeof raw.profiles==='object'&&!Array.isArray(raw.profiles)?raw.profiles:{};return {version:String(raw.version||'1.0.0'),activeProfile:raw.activeProfile??null,profiles,watermark:raw.watermark??null}};
  const configurationSnapshot=()=>({
    schemaVersion:'1.0.0',
    coreVersion:window.RideTrackerCoreRuntime?.snapshot?.().coreVersion||'2.0.0-alpha.1',
    capturedAt:new Date().toISOString(),
    platform:'web',
    devices:deviceSnapshot(),
    sourceRouting:sourceRoutingSnapshot(),
    camera:cameraSnapshot(),
    hud:hudSnapshot(),
    calibration:{mode:document.getElementById('calMode')?.value||'manual',forwardEdge:document.getElementById('forward')?.value||'top',deviceCalibration:null}
  });
  const openDb=()=>new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(DB_STORE))request.result.createObjectStore(DB_STORE)};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  const putVideo=async(id,blob)=>{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(blob,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()};
  const getVideo=async id=>{const db=await openDb();const result=await new Promise((resolve,reject)=>{const request=db.transaction(DB_STORE).objectStore(DB_STORE).get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});db.close();return result};
  const deleteVideo=async id=>{const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()};

  const style=document.createElement('style');style.textContent=`
    #rtRideLibrary{position:relative;z-index:420;max-width:1050px;margin:auto;padding:0 12px 30px}#rtRideLibrary[hidden]{display:none!important}
    .rt-ride-list{display:grid;gap:12px}.rt-ride-card{border:1px solid #29435f;border-radius:18px;background:#0a1727;padding:14px}.rt-ride-card video{width:100%;max-height:430px;background:#000;border-radius:13px}.rt-ride-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.rt-ride-grid label{display:grid;gap:5px;color:#96aac1;font-size:12px}.rt-ride-grid input,.rt-ride-grid textarea,.rt-ride-grid select{width:100%;background:#07111f;color:#f5fbff;border:1px solid #29435f;border-radius:10px;padding:10px}.rt-ride-grid textarea{min-height:82px;resize:vertical}.rt-span{grid-column:1/-1}.rt-ride-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.rt-post-record{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}.rt-post-record button{flex:1;min-width:150px}.rt-config-summary{margin-top:10px;padding:10px;border:1px solid #29435f;border-radius:12px;color:#96aac1;font-size:12px}@media(max-width:640px){.rt-ride-grid{grid-template-columns:1fr}}
  `;document.head.appendChild(style);

  function home(){document.querySelectorAll('.rt-tool-view,#rtSettingsView,#rtRideLibrary').forEach(v=>v.hidden=true);document.querySelectorAll('.rt-view').forEach(v=>v.remove());document.getElementById('rideDashboard')?.style.setProperty('display','block');document.getElementById('rtInlineDashboard')?.removeAttribute('hidden');window.scrollTo({top:0,behavior:'smooth'})}
  window.RideTrackerNavigation={...(window.RideTrackerNavigation||{}),home};
  function ensureHomeButtons(){
    document.querySelectorAll('.rt-tool-head').forEach(head=>{
      const button=head.querySelector('.rt-tool-back');
      if(!button)return;
      if(button.textContent!=='Hauptmenü')button.textContent='Hauptmenü';
      if(button.dataset.rtHomeBound!=='1'){
        button.onclick=home;
        button.dataset.rtHomeBound='1';
      }
    });
    document.querySelectorAll('.rt-view').forEach(view=>{
      if(view.querySelector('.rt-global-home'))return;
      const button=document.createElement('button');
      button.type='button';button.className='rt-global-home';button.textContent='Hauptmenü';button.style.cssText='position:sticky;top:12px;z-index:999;margin:8px';button.onclick=home;view.prepend(button)
    })
  }
  async function capturePendingVideo(){const replay=document.getElementById('replay');const src=replay?.currentSrc||replay?.src;if(!src||!src.startsWith('blob:'))return null;try{return await fetch(src).then(r=>r.blob())}catch{return null}}
  function ensurePostRecordActions(){const videoMeta=document.getElementById('videoMeta');if(!videoMeta||document.getElementById('rtPostRecordActions'))return;const row=document.createElement('div');row.id='rtPostRecordActions';row.className='rt-post-record';row.hidden=true;row.innerHTML='<button type="button" id="rtPreviewLast">Vorschau abspielen</button><button type="button" id="rtSaveRide" class="primary">Fahrt speichern</button><button type="button" id="rtDiscardRide">Verwerfen</button>';videoMeta.after(row);row.querySelector('#rtPreviewLast').onclick=()=>{const preview=document.getElementById('preview'),replay=document.getElementById('replay');if(!replay?.src)return;preview?.classList.add('hidden');replay.classList.remove('hidden');replay.controls=true;replay.currentTime=0;replay.play().catch(()=>{})};row.querySelector('#rtSaveRide').onclick=savePendingRide;row.querySelector('#rtDiscardRide').onclick=()=>{state.dirty=false;state.pendingBlob=null;localStorage.removeItem(DRAFT_KEY);row.hidden=true}}
  async function savePendingRide(){const id=crypto.randomUUID();const blob=state.pendingBlob||await capturePendingVideo();const now=new Date();const ride={id,createdAt:now.toISOString(),title:`Fahrt ${now.toLocaleString('de-DE')}`,park:'',track:'',notes:'',comment:'',rating:0,hasVideo:Boolean(blob),recordingConfiguration:configurationSnapshot()};if(blob)await putVideo(id,blob);const rides=readMeta();rides.unshift(ride);writeMeta(rides);state.dirty=false;state.pendingBlob=null;localStorage.removeItem(DRAFT_KEY);document.getElementById('rtPostRecordActions')?.setAttribute('hidden','');showLibrary()}
  function markStopped(){setTimeout(async()=>{const replay=document.getElementById('replay');if(!replay?.src)return;state.pendingBlob=await capturePendingVideo();state.dirty=true;state.lastStoppedAt=Date.now();localStorage.setItem(DRAFT_KEY,JSON.stringify({stoppedAt:state.lastStoppedAt,recordingConfiguration:configurationSnapshot()}));const row=document.getElementById('rtPostRecordActions');if(row)row.hidden=false},500)}
  function installRecordingHooks(){document.getElementById('stop')?.addEventListener('click',markStopped,true);window.addEventListener('beforeunload',event=>{if(!state.dirty)return;event.preventDefault();event.returnValue=''});document.addEventListener('click',event=>{const nav=event.target.closest?.('[data-route],[data-view],.dashAction,.rt-global-home,.rt-tool-back,[data-inline-route]');if(!nav||!state.dirty||nav.id==='rtSaveRide'||nav.id==='rtDiscardRide')return;if(!confirm('Die aufgezeichnete Fahrt wurde noch nicht gespeichert. Jetzt speichern?'))return;event.preventDefault();event.stopImmediatePropagation();savePendingRide()},true)}
  function ensureLibrary(){let view=document.getElementById('rtRideLibrary');if(view)return view;view=document.createElement('section');view.id='rtRideLibrary';view.hidden=true;view.innerHTML='<header class="rt-tool-head"><div><h2>Meine Fahrten</h2><p>Videos ansehen, Fahrten bewusst speichern und Angaben bearbeiten</p></div><button type="button" class="rt-tool-back">Hauptmenü</button></header><div id="rtRideList" class="rt-ride-list"></div>';view.querySelector('.rt-tool-back').onclick=home;document.querySelector('main')?.prepend(view);return view}
  async function renderLibrary(){const list=ensureLibrary().querySelector('#rtRideList');const rides=readMeta();if(!rides.length){list.innerHTML='<div class="rt-ride-card">Noch keine bewusst gespeicherte Fahrt vorhanden.</div>';return}list.innerHTML='';for(const ride of rides){const config=ride.recordingConfiguration||{};const deviceCount=Array.isArray(config.devices)?config.devices.length:(config.devices?.devices?.length||0);const cameraName=config.camera?.sources?.find?.(x=>x.id===config.camera?.primaryId)?.name||config.camera?.ordered?.[0]?.label||config.camera?.primary||'Standardkamera';const card=document.createElement('article');card.className='rt-ride-card';card.innerHTML=`<div class="rt-ride-grid"><label>Titel<input data-field="title" value="${escapeHtml(ride.title||'')}"></label><label>Park<input data-field="park" value="${escapeHtml(ride.park||'')}"></label><label>Strecke/Bahn<input data-field="track" value="${escapeHtml(ride.track||'')}"></label><label>Bewertung<select data-field="rating">${[0,1,2,3,4,5].map(v=>`<option value="${v}" ${Number(ride.rating)===v?'selected':''}>${v?v+' Sterne':'Keine'}</option>`).join('')}</select></label><label class="rt-span">Private Notiz<textarea data-field="notes">${escapeHtml(ride.notes||'')}</textarea></label><label class="rt-span">Kommentar<textarea data-field="comment">${escapeHtml(ride.comment||'')}</textarea></label></div><div class="rt-config-summary">Aufnahmekonfiguration ${escapeHtml(config.schemaVersion||'ältere Version')} · ${deviceCount} Geräteprofile · Kamera: ${escapeHtml(cameraName)} · Kalibrierung: ${escapeHtml(config.calibration?.mode||'unbekannt')}</div><div class="rt-video-host"></div><div class="rt-ride-actions"><button type="button" data-action="save">Änderungen speichern</button><button type="button" data-action="play">Video laden</button><button type="button" data-action="delete" class="danger">Fahrt löschen</button></div>`;card.querySelector('[data-action="save"]').onclick=()=>{const all=readMeta();const item=all.find(x=>x.id===ride.id);if(!item)return;card.querySelectorAll('[data-field]').forEach(input=>item[input.dataset.field]=input.dataset.field==='rating'?Number(input.value):input.value);writeMeta(all)};card.querySelector('[data-action="play"]').onclick=async()=>{const host=card.querySelector('.rt-video-host');const blob=await getVideo(ride.id);if(!blob){host.textContent='Für diese Fahrt ist kein Video gespeichert.';return}host.innerHTML='';const video=document.createElement('video');video.controls=true;video.playsInline=true;video.src=URL.createObjectURL(blob);host.appendChild(video);video.play().catch(()=>{})};card.querySelector('[data-action="delete"]').onclick=async()=>{if(!confirm('Fahrt endgültig löschen?'))return;writeMeta(readMeta().filter(x=>x.id!==ride.id));await deleteVideo(ride.id);renderLibrary()};list.appendChild(card)}}
  const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function showLibrary(){document.getElementById('rideDashboard')?.style.setProperty('display','none');document.getElementById('rtInlineDashboard')?.setAttribute('hidden','');document.querySelectorAll('.rt-tool-view,#rtSettingsView').forEach(v=>v.hidden=true);const view=ensureLibrary();view.hidden=false;renderLibrary();view.scrollIntoView({block:'start'})}
  window.RideTrackerRideLibrary={show:showLibrary,render:renderLibrary,configurationSnapshot};

  let observerScheduled=false;
  const observer=new MutationObserver(()=>{
    if(observerScheduled)return;
    observerScheduled=true;
    requestAnimationFrame(()=>{
      observerScheduled=false;
      ensurePostRecordActions();
      ensureHomeButtons();
    });
  });
  observer.observe(document.body,{childList:true,subtree:true});
  ensurePostRecordActions();ensureHomeButtons();installRecordingHooks();
})();
