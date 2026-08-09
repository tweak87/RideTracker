(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const G = 9.80665;

  const style = document.createElement('style');
  style.id = 'rtFrontendFixes50Style';
  style.textContent = `
    #rtStandaloneHudEditor{width:100vw!important;height:100dvh!important;max-width:100vw!important;max-height:100dvh!important;box-sizing:border-box!important}
    #rtStandaloneHudEditor .rt-hud-top{min-width:0!important;max-width:100vw!important;box-sizing:border-box!important;flex-wrap:nowrap!important}
    #rtStandaloneHudEditor .rt-hud-body{width:100%!important;max-width:100vw!important;min-width:0!important;min-height:0!important;box-sizing:border-box!important;overflow:hidden!important}
    #rtStandaloneHudEditor .rt-hud-stage-wrap{min-width:0!important;max-width:100%!important;min-height:0!important;box-sizing:border-box!important;overflow:hidden!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:6px!important}
    #rtStandaloneHudEditor .rt-hud-stage{flex:0 0 auto!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;box-sizing:border-box!important}
    #rtStandaloneHudEditor .rt-hud-sidebar{min-width:0!important;min-height:0!important;box-sizing:border-box!important}
    @media (orientation:portrait),(max-width:760px){
      #rtStandaloneHudEditor.open{grid-template-rows:auto minmax(0,1fr)!important}
      #rtStandaloneHudEditor .rt-hud-body{display:grid!important;grid-template-columns:minmax(0,1fr)!important;grid-template-rows:minmax(180px,46%) minmax(0,54%)!important;gap:8px!important;padding:8px!important;height:100%!important}
      #rtStandaloneHudEditor .rt-hud-stage-wrap{grid-row:1!important;width:100%!important;height:100%!important}
      #rtStandaloneHudEditor .rt-hud-sidebar{grid-row:2!important;width:100%!important;height:100%!important;overflow:auto!important}
      #rtStandaloneHudEditor .rt-hud-top{gap:5px!important;padding-left:7px!important;padding-right:7px!important}
      #rtStandaloneHudEditor .rt-hud-top h2{font-size:15px!important;white-space:nowrap!important}
      #rtStandaloneHudEditor .rt-hud-top button,#rtStandaloneHudEditor .rt-hud-top select{padding:7px 8px!important;font-size:11px!important;min-width:0!important}
      #rtHudOrientationInfo{display:none!important}
    }
    @media (orientation:landscape) and (max-height:600px){
      #rtStandaloneHudEditor .rt-hud-body{display:grid!important;grid-template-columns:clamp(190px,28vw,300px) minmax(0,1fr)!important;grid-template-rows:minmax(0,1fr)!important;gap:8px!important;padding:8px!important;height:100%!important}
      #rtStandaloneHudEditor .rt-hud-sidebar{grid-column:1!important;grid-row:1!important;height:100%!important;overflow:auto!important}
      #rtStandaloneHudEditor .rt-hud-stage-wrap{grid-column:2!important;grid-row:1!important;width:100%!important;height:100%!important}
      #rtStandaloneHudEditor .rt-hud-top{padding-top:max(5px,env(safe-area-inset-top))!important;padding-bottom:5px!important}
    }
    .rt-sensor-diagnostic-v2{margin-top:12px;padding:12px;border:1px solid #29435f;border-radius:14px;background:#07131f}.rt-live-v2-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.rt-live-v2-status{font-size:11px;color:#5fd0ff}.rt-live-v2-chart{display:block;width:100%;height:170px;border-radius:10px;background:#040b12;margin-top:9px}.rt-live-v2-values{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.rt-live-v2-value{padding:6px 8px;border:1px solid #29435f;border-radius:9px;font-size:12px}.rt-live-v2-value b{color:#5fd0ff}.rt-live-v2-purpose{color:#96aac1;font-size:13px;line-height:1.45;margin:7px 0}.rt-live-v2-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.rt-live-v2-actions button{padding:8px 10px}.rt-route-error{position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483647;background:#2a0b13;border:1px solid #ff6680;color:#fff;border-radius:12px;padding:11px 13px;font-size:13px}
    .rt-camera-diagnostic{margin-top:10px;border:1px solid #29435f;border-radius:12px;overflow:hidden;background:#02070d}.rt-camera-diagnostic video{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#000}.rt-camera-diagnostic-controls{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px}.rt-camera-diagnostic-controls span{font-size:12px;color:#96aac1}.rt-camera-diagnostic-controls button{padding:8px 10px!important}
  `;
  document.head.appendChild(style);

  // --- HUD editor: contain the entire 16:9 / 9:16 design surface inside Safari's real visual viewport. ---
  function viewportSize() {
    const vv = window.visualViewport;
    return {
      width: Math.max(240, Math.floor(vv?.width || window.innerWidth || document.documentElement.clientWidth || 320)),
      height: Math.max(240, Math.floor(vv?.height || window.innerHeight || document.documentElement.clientHeight || 480))
    };
  }
  function fitHudStage() {
    const root = byId('rtStandaloneHudEditor');
    const wrap = root?.querySelector('.rt-hud-stage-wrap');
    const stage = root?.querySelector('.rt-hud-stage');
    const select = byId('rtHudMode');
    if (!root?.classList.contains('open') || !wrap || !stage) return;
    const portrait = (select?.value || 'portrait') === 'portrait';
    const ratio = portrait ? 9 / 16 : 16 / 9;
    const vp = viewportSize();
    const rootRect = root.getBoundingClientRect();
    const rect = wrap.getBoundingClientRect();
    const viewportLeft = Math.max(0, rect.left - rootRect.left);
    const viewportTop = Math.max(0, rect.top - rootRect.top);
    const maxByViewportW = Math.max(110, vp.width - viewportLeft - 10);
    const maxByViewportH = Math.max(110, vp.height - viewportTop - 10);
    const availableW = Math.max(110, Math.min(wrap.clientWidth || rect.width, rect.width, maxByViewportW) - 8);
    const availableH = Math.max(110, Math.min(wrap.clientHeight || rect.height, rect.height, maxByViewportH) - 8);
    let width = Math.min(availableW, availableH * ratio);
    let height = width / ratio;
    if (height > availableH) { height = availableH; width = height * ratio; }
    if (width > availableW) { width = availableW; height = width / ratio; }
    stage.style.setProperty('width', `${Math.floor(width)}px`, 'important');
    stage.style.setProperty('height', `${Math.floor(height)}px`, 'important');
    stage.style.setProperty('aspect-ratio', portrait ? '9 / 16' : '16 / 9', 'important');
    stage.style.setProperty('max-width', `${Math.floor(availableW)}px`, 'important');
    stage.style.setProperty('max-height', `${Math.floor(availableH)}px`, 'important');
  }
  const scheduleFit = (() => { let raf = 0; return () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { fitHudStage(); setTimeout(fitHudStage, 60); setTimeout(fitHudStage, 180); }); }; })();
  window.addEventListener('resize', scheduleFit, { passive:true });
  window.addEventListener('orientationchange', scheduleFit, { passive:true });
  window.visualViewport?.addEventListener?.('resize', scheduleFit, { passive:true });
  window.visualViewport?.addEventListener?.('scroll', scheduleFit, { passive:true });
  screen.orientation?.addEventListener?.('change', scheduleFit);
  document.addEventListener('change', event => { if (event.target?.id === 'rtHudMode') scheduleFit(); }, true);
  const hudObserver = new MutationObserver(() => scheduleFit());
  const observeHud = () => { const root = byId('rtStandaloneHudEditor'); if (root && !root.dataset.rt50Observed) { root.dataset.rt50Observed='1'; hudObserver.observe(root,{attributes:true,attributeFilter:['class'],subtree:true,childList:true}); } scheduleFit(); };

  // --- Canonical route adapters. Existing NavigationRegistry calls these APIs dynamically. ---
  function closeTransientViews(except = null) {
    document.querySelectorAll('.rt-view').forEach(view => { if (!except || !view.matches(except)) view.remove(); });
    for (const id of ['rtDeviceCenter','rtSourceRouting']) if (id !== except?.replace('#','')) byId(id)?.classList.remove('open');
    document.querySelectorAll('.rt-tool-view,#rtSettingsView,#rtRideLibrary').forEach(view => { if (!except || !view.matches(except)) view.hidden = true; });
    byId('rtInlineDashboard')?.setAttribute('hidden','');
  }
  function routeError(title) {
    document.querySelector('.rt-route-error')?.remove();
    const el=document.createElement('div');el.className='rt-route-error';el.textContent=`${title} konnte nicht geöffnet werden. Die Zielansicht ist in diesem Build nicht verfügbar.`;document.body.appendChild(el);setTimeout(()=>el.remove(),4500);
  }
  function wrapMethod(object, key, title, cleanupSelector = null) {
    if (!object || typeof object[key] !== 'function' || object[key].__rt50) return;
    const original = object[key].bind(object);
    const wrapped = function(...args) {
      closeTransientViews(cleanupSelector);
      document.body.dataset.rtRoute = ({showStats:'statistics',showAchievements:'achievements',showProfiles:'profile',showImports:'imports',show:'rides',open:'devices'})[key] || document.body.dataset.rtRoute;
      try { const result = original(...args); setTimeout(() => window.RideTrackerOverlayManager?.sync?.(),0); return result; }
      catch (error) { console.error(`[RideTracker route ${title}]`, error); routeError(title); return null; }
    };
    wrapped.__rt50 = true; object[key] = wrapped;
  }
  function patchRoutes() {
    wrapMethod(window.RideTrackerRideLibrary,'show','Meine Fahrten','#rtRideLibrary');
    wrapMethod(window.RideTrackerStats,'showStats','Statistiken');
    wrapMethod(window.RideTrackerStats,'showAchievements','Achievements');
    wrapMethod(window.RideTrackerProfiles,'showProfiles','Profil');
    wrapMethod(window.RideTrackerTools,'showImports','Import & Replay');
    wrapMethod(window.RideTrackerSettings,'show','Einstellungen','#rtSettingsView');
    wrapMethod(window.RideTrackerDeviceCenter,'open','Geräte & Sensoren','#rtDeviceCenter');
    const routes = window.RideTrackerCanonicalRoutes;
    if (routes?.map && !routes.map.__rt50) {
      const originalMap = routes.map.bind(routes);
      const map = async (...args) => { closeTransientViews('.rt-map-view'); document.body.dataset.rtRoute='map'; try { return await originalMap(...args); } catch(error) { console.error(error); routeError('Karte'); } };
      map.__rt50=true; routes.map=map;
    }
  }

  // --- True live sensor diagnostics. ---
  const streams = new Map();
  const descriptorFallback = {
    'phone-motion': {purpose:'Misst die reale Bewegung des Smartphones. Die Live-Diagnose zeigt rohe Beschleunigungsachsen direkt aus DeviceMotion; nach der Fahrtkalibrierung werden daraus fahrzeugbezogene G-Kräfte.',hint:'Bewege das Telefon: die Kurven müssen unmittelbar reagieren.',channels:[['x','X','g'],['y','Y','g'],['z','Z','g']]},
    'phone-gps': {purpose:'Bestimmt Position, Geschwindigkeit und Höhe. GPS aktualisiert langsamer als die Bewegungssensoren.',hint:'Im Freien mit freier Sicht zum Himmel reagiert GPS am zuverlässigsten.',channels:[['speedKmh','Geschwindigkeit','km/h'],['altitude','Höhe','m'],['accuracy','Genauigkeit','m']]},
    'ble-heart': {purpose:'Liest die aktuelle Herzfrequenz eines verbundenen Bluetooth-Pulssensors.',hint:'Der BPM-Wert wird live vom Plugin übernommen.',channels:[['heartRateBpm','Puls','BPM']]},
    'external-imu': {purpose:'Zeigt Messwerte einer externen IMU direkt aus der Plugin-Telemetrie.',hint:'Die Werte aktualisieren sich nur bei verbundenem und aktivem Gerät.',channels:[['acceleration','Beschleunigung','m/s²'],['gyroscope','Drehrate','rad/s']]},
    'external-gnss': {purpose:'Zeigt Geschwindigkeit und Höhe eines externen GNSS-Empfängers.',hint:'Die Aktualisierungsrate hängt vom Empfänger ab.',channels:[['speedKmh','Geschwindigkeit','km/h'],['altitude','Höhe','m']]},
    'phone-camera': {purpose:'Zeigt das echte Livebild der ausgewählten Smartphone-Kamera und den aktuellen Aufnahmezustand.',hint:'Das Livebild nutzt dieselbe Kameraquelle wie die Fahrtaufnahme.',channels:[['preview','Livebild',''],['recording','Aufnahme','']]},
    'external-camera': {purpose:'Zeigt den Zustand einer externen Kameraquelle.',hint:'Nur verfügbare Streams können live dargestellt werden.',channels:[['preview','Livebild',''],['recording','Aufnahme','']]}
  };
  function streamFor(id) { if (!streams.has(id)) streams.set(id,{history:[],latest:{},lastAt:0}); return streams.get(id); }
  function ingest(id, values, timestamp = performance.now()) {
    const clean={}; for(const [k,v] of Object.entries(values||{})) if(Number.isFinite(Number(v))) clean[k]=Number(v);
    if(!Object.keys(clean).length) return;
    const s=streamFor(id); s.latest={...s.latest,...clean};s.lastAt=timestamp;s.history.push({t:timestamp,...s.latest});
    while(s.history.length>240 || (s.history[0]&&timestamp-s.history[0].t>30000))s.history.shift();
  }
  function deviceFromTelemetry(d={}) {
    const plugin=String(d.pluginId||'');const src=String(d.sourceId||d.deviceId||'').toLowerCase();
    if(plugin==='ble-heart-rate'||src.includes('ble-heart'))return'ble-heart';
    if(plugin==='external-imu'||src.includes('external-imu'))return'external-imu';
    if(plugin==='external-gnss'||src.includes('external-gnss'))return'external-gnss';
    if(src.includes('phone-gps'))return'phone-gps';
    if(src.includes('phone-motion'))return'phone-motion';
    return null;
  }
  window.addEventListener('devicemotion',event=>{
    const a=event.accelerationIncludingGravity||event.acceleration;if(!a)return;
    ingest('phone-motion',{x:Number(a.x)/G,y:Number(a.y)/G,z:Number(a.z)/G});
  },{passive:true});
  window.addEventListener('ridetracker:internal-telemetry',event=>{
    const d=event.detail||{};const vals={};
    for(const key of ['lateralG','verticalG','longitudinalG','x','y','z'])if(Number.isFinite(Number(d[key])))vals[key]=Number(d[key]);
    if(Object.keys(vals).length)ingest('phone-motion',vals,Number(d.timestampMs||performance.now()));
    if(Number.isFinite(Number(d.speedKmh)))ingest('phone-gps',{speedKmh:Number(d.speedKmh)},Number(d.timestampMs||performance.now()));
  });
  for(const eventName of ['ridetracker:plugin-telemetry','ridetracker:routed-telemetry'])window.addEventListener(eventName,event=>{
    const d=event.detail||{};const id=deviceFromTelemetry(d);if(!id||d.valid===false)return;const metric=String(d.metric||d.channelId||'value');if(Number.isFinite(Number(d.value)))ingest(id,{[metric]:Number(d.value)},Number(d.timestampMs||d.timestamp||performance.now()));
  });
  let gpsWatch=null;
  function ensureGpsDiagnostics() {
    if(gpsWatch!=null||!navigator.geolocation)return;
    try{gpsWatch=navigator.geolocation.watchPosition(pos=>{const c=pos.coords;ingest('phone-gps',{speedKmh:Number.isFinite(c.speed)?c.speed*3.6:NaN,altitude:Number(c.altitude),accuracy:Number(c.accuracy)},performance.now());},()=>{}, {enableHighAccuracy:true,maximumAge:1000,timeout:10000});}catch(_){}
  }
  async function requestMotionPermission() {
    try { if(typeof DeviceMotionEvent?.requestPermission==='function') return (await DeviceMotionEvent.requestPermission())==='granted'; return true; } catch { return false; }
  }
  function drawLive(canvas,id,channels) {
    const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(260,rect.width),h=170;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#040b12';ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(255,255,255,.08)';for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(0,i*h/4);ctx.lineTo(w,i*h/4);ctx.stroke();}
    const hist=streamFor(id).history,keys=channels.map(c=>c[0]);const vals=hist.flatMap(r=>keys.map(k=>Number(r[k])).filter(Number.isFinite));if(hist.length<2||!vals.length){ctx.fillStyle='#758ba3';ctx.font='12px system-ui';ctx.fillText('Warte auf echte Sensordaten …',12,24);return;}
    let min=Math.min(...vals),max=Math.max(...vals);if(Math.abs(max-min)<.01){min-=.5;max+=.5;}const span=max-min,colors=['#00e5ff','#ffaa20','#ff334e','#9b8cff'];keys.forEach((key,ki)=>{ctx.beginPath();let started=false;hist.forEach((r,i)=>{const v=Number(r[key]);if(!Number.isFinite(v))return;const x=6+i/Math.max(1,hist.length-1)*(w-12),y=h-8-(v-min)/span*(h-20);started?ctx.lineTo(x,y):ctx.moveTo(x,y);started=true;});ctx.strokeStyle=colors[ki%colors.length];ctx.lineWidth=2;ctx.stroke();});
  }

  async function cameraStream() {
    const plugins=window.RideTrackerWebPlugins;if(!plugins?.invoke)return null;
    try { const stream=await plugins.invoke('camera-source','previewStream'); return stream?.getVideoTracks?.().some(t=>t.readyState==='live')?stream:null; } catch { return null; }
  }
  async function activateCameraDiagnostic(card, forcePermission=false) {
    const host=card?.querySelector('.rt-camera-diagnostic'),video=host?.querySelector('video'),button=host?.querySelector('[data-camera-live]'),status=host?.querySelector('[data-camera-status]');
    if(!host||!video)return;
    let stream=await cameraStream();
    if(!stream&&forcePermission){try{stream=await window.RideTrackerWebPlugins?.invoke?.('camera-source','ensurePreview');}catch(error){if(status)status.textContent=`Kamera nicht verfügbar: ${error?.message||error}`;}}
    if(stream){if(video.srcObject!==stream)video.srcObject=stream;video.muted=true;video.autoplay=true;video.playsInline=true;video.setAttribute('playsinline','');try{await video.play();}catch(_){}if(status)status.textContent='Livebild aktiv';if(button){button.textContent='Livebild aktiv ✓';button.disabled=true;}}
    else{if(status)status.textContent='Kamera noch nicht aktiviert';if(button){button.textContent='Livebild aktivieren';button.disabled=false;}}
  }

  function buildDiagnostic(card) {
    const id=card.dataset.id;if(!id)return;
    const old=card.querySelector('.rt-sensor-diagnostic');if(old&&!old.classList.contains('rt-sensor-diagnostic-v2'))old.remove();
    if(card.querySelector('.rt-sensor-diagnostic-v2'))return;
    const d=descriptorFallback[id]||{purpose:'Live-Werte dieses Geräts direkt aus dem Plugin-Telemetriestrom.',hint:'Aktiviere und verbinde das Gerät, damit Messwerte eintreffen.',channels:[['value','Wert','']]};
    const isCamera=id==='phone-camera'||id==='external-camera';
    const box=document.createElement('section');box.className='rt-sensor-diagnostic rt-sensor-diagnostic-v2';
    box.innerHTML=`<div class="rt-live-v2-head"><strong>Live-Diagnose</strong><span class="rt-live-v2-status">wartet auf echte Daten</span></div><div class="rt-live-v2-purpose">${d.purpose}</div>${isCamera?'<div class="rt-camera-diagnostic"><video muted autoplay playsinline></video><div class="rt-camera-diagnostic-controls"><span data-camera-status>Kamera noch nicht aktiviert</span><button type="button" data-camera-live>Livebild aktivieren</button></div></div>':'<canvas class="rt-live-v2-chart"></canvas>'}<div class="rt-live-v2-values"></div><div class="rt-live-v2-actions">${id==='phone-motion'?'<button type="button" data-motion-live>Live-Sensor aktivieren</button>':''}</div><div class="rt-sensor-hint">${d.hint}</div>`;
    card.appendChild(box);
    const motionButton=box.querySelector('[data-motion-live]');
    motionButton?.addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;button.textContent='Berechtigung wird geprüft …';const ok=await requestMotionPermission();if(!button.isConnected)return;button.textContent=ok?'Sensor aktiv ✓':'Berechtigung erforderlich';button.disabled=ok;});
    box.querySelector('[data-camera-live]')?.addEventListener('click',event=>{event.preventDefault();const stableCard=event.currentTarget.closest('.rt-device');void activateCameraDiagnostic(stableCard,true);});
    if(isCamera)void activateCameraDiagnostic(card,false);
    const render=()=>{if(!box.isConnected)return;const s=streamFor(id),age=performance.now()-s.lastAt;if(!isCamera)drawLive(box.querySelector('canvas'),id,d.channels);if(isCamera){const state=window.RideTrackerWebPlugins?.get?.('camera-source');if(state)ingest('phone-camera',{preview:state.previewActive?1:0,recording:state.recordingActive?1:0});}box.querySelector('.rt-live-v2-status').textContent=isCamera?(window.RideTrackerWebPlugins?.get?.('camera-source')?.previewActive?'live':'wartet auf Kamera'):s.lastAt?(age<1500?'live':`letzter Wert ${Math.round(age/1000)} s`):'wartet auf echte Daten';box.querySelector('.rt-live-v2-values').innerHTML=d.channels.map(([key,label,unit])=>{const v=Number(streamFor(id).latest[key]);return `<span class="rt-live-v2-value">${label}: <b>${Number.isFinite(v)?`${Math.abs(v)<10?v.toFixed(2):v.toFixed(0)} ${unit}`:'–'}</b></span>`}).join('');requestAnimationFrame(()=>setTimeout(render,180));};render();
  }
  function installDiagnostics() { document.querySelectorAll('#rtDeviceCenter .rt-device[data-id]').forEach(buildDiagnostic); if(byId('rtDeviceCenter')?.classList.contains('open'))ensureGpsDiagnostics(); }
  const diagObserver=new MutationObserver(()=>requestAnimationFrame(installDiagnostics));

  // Safari clears Event.currentTarget after await in some event paths. Intercept permission clicks in capture phase and keep a stable element reference.
  document.addEventListener('click',async event=>{
    const button=event.target.closest?.('[data-motion-live]');if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();button.disabled=true;button.textContent='Berechtigung wird geprüft …';
    const ok=await requestMotionPermission();if(!button.isConnected)return;button.textContent=ok?'Sensor aktiv ✓':'Berechtigung erforderlich';button.disabled=ok;
  },true);

  function install() {
    observeHud();patchRoutes();installDiagnostics();
    diagObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','open']});
    setInterval(()=>{patchRoutes();installDiagnostics();},1200);
    window.addEventListener('ridetracker:web-plugins-ready',installDiagnostics);
    window.addEventListener('ridetracker:camera-plugin-preview',installDiagnostics);
    window.addEventListener('ridetracker:recording-started',installDiagnostics);
    window.addEventListener('ridetracker:recording-stopped',installDiagnostics);
    window.RideTrackerHudStageFit={fit:fitHudStage};
    window.RideTrackerLiveSensorDiagnostics={stream:id=>({history:[...streamFor(id).history],latest:{...streamFor(id).latest}}),ingest};
    window.RideTrackerCameraDiagnostics={refresh:installDiagnostics,activate:activateCameraDiagnostic};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();