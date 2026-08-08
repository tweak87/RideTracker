(() => {
  'use strict';

  const state = {
    recording:false,
    previous:null,
    smoothedSpeedMS:0,
    maxSpeedKmh:0,
    points:0,
    lastFixAt:0,
    lastAccuracy:null,
    lastSource:'–',
    lastError:null,
    persistedRideId:null,
    persistedPoints:0,
    validation:null,
  };

  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const gpsMath = window.RideTrackerGpsMath;
  const estimator = gpsMath?.createEstimator?.() || null;
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  const rad = value => Number(value) * Math.PI / 180;
  function distanceMeters(a,b){
    if(gpsMath?.distanceMeters)return gpsMath.distanceMeters(a,b);
    const R=6371000;
    const dLat=rad(Number(b.latitude)-Number(a.latitude));
    const dLon=rad(Number(b.longitude)-Number(a.longitude));
    const lat1=rad(a.latitude),lat2=rad(b.latitude);
    const q=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(q));
  }

  function recordingFromBase(){
    const stop=document.getElementById('stop');
    return Boolean(stop && stop.disabled===false);
  }

  function qualityFor(point,source){
    const accuracy=finite(point.horizontalAccuracyM)?Number(point.horizontalAccuracyM):100;
    let quality=clamp(1-accuracy/120,0.15,1);
    if(source==='derived')quality*=0.92;
    return quality;
  }

  function deriveSpeed(point){
    if(estimator)return estimator.update(point);
    const prev=state.previous;
    const nativeMS=finite(point.nativeSpeedMS??point.speedMS)?Math.max(0,Number(point.nativeSpeedMS??point.speedMS)):null;
    let derivedMS=null;
    if(prev && finite(prev.latitude) && finite(prev.longitude)){
      const dtMs=(Number(point.gpsTimestampMs)||Date.now())-(Number(prev.gpsTimestampMs)||0);
      const dt=dtMs/1000;
      if(dt>=0.2 && dt<=20){
        const distance=distanceMeters(prev,point);
        const accuracy=Math.max(Number(prev.horizontalAccuracyM)||0,Number(point.horizontalAccuracyM)||0);
        const noiseFloor=Math.max(1.5,Math.min(12,accuracy*0.12));
        if(distance<=noiseFloor)derivedMS=0;
        else {
          const candidate=distance/dt;
          if(candidate>=0 && candidate<=220)derivedMS=candidate;
        }
      }
    }

    let raw=0,source='stationary';
    const nativeUseful=nativeMS!=null && nativeMS>0.6;
    const derivedUseful=derivedMS!=null && derivedMS>0.6;
    if(nativeUseful && derivedUseful){
      // iOS can report stale/zero native speed. Blend when both agree, prefer geometry when they diverge strongly.
      const delta=Math.abs(nativeMS-derivedMS);
      if(delta<=Math.max(7,nativeMS*0.55)){raw=nativeMS*0.65+derivedMS*0.35;source='native+derived';}
      else {raw=derivedMS;source='derived';}
    } else if(nativeUseful){raw=nativeMS;source='native';}
    else if(derivedUseful){raw=derivedMS;source='derived';}
    else if(nativeMS!=null){raw=nativeMS;source='native';}
    else if(derivedMS!=null){raw=derivedMS;source='derived';}

    if(raw<0.45)raw=0;
    const alpha=raw>state.smoothedSpeedMS?0.58:0.34;
    state.smoothedSpeedMS=state.points<2?raw:(state.smoothedSpeedMS+(raw-state.smoothedSpeedMS)*alpha);
    if(state.smoothedSpeedMS<0.3)state.smoothedSpeedMS=0;
    return { speedMS:state.smoothedSpeedMS, speedKmh:state.smoothedSpeedMS*3.6, source, nativeSpeedMS:nativeMS, derivedSpeedMS:derivedMS };
  }

  function updateSpeedDom(){
    if(!state.recording || !finite(state.smoothedSpeedMS))return;
    const kmh=state.smoothedSpeedMS*3.6;
    state.maxSpeedKmh=Math.max(state.maxSpeedKmh,kmh);
    const speed=document.getElementById('speed');
    const speedHtml=`${kmh.toFixed(1)} <span class="unit">km/h</span>`;
    if(speed&&speed.innerHTML!==speedHtml)speed.innerHTML=speedHtml;
    const max=document.getElementById('speedMax');
    const maxText=`${state.maxSpeedKmh.toFixed(1)} km/h`;
    if(max&&max.textContent!==maxText)max.textContent=maxText;
    const legacyHud=document.getElementById('hudSpeed');
    const hudText=String(Math.round(kmh));
    if(legacyHud&&legacyHud.textContent!==hudText)legacyHud.textContent=hudText;
  }

  function onGps(event){
    const point=event.detail;
    if(!point || !finite(point.latitude) || !finite(point.longitude))return;
    if(!finite(point.nativeSpeedMS) && finite(point.speedMS))point.nativeSpeedMS=Number(point.speedMS);
    const speed=deriveSpeed(point);
    state.smoothedSpeedMS=speed.speedMS;
    point.speedMS=speed.speedMS;
    point.speedKmh=speed.speedKmh;
    point.speedSource=speed.source;
    point.nativeSpeedMS=speed.nativeSpeedMS;
    point.derivedSpeedMS=speed.derivedSpeedMS;
    point.quality=qualityFor(point,speed.source);
    state.points+=1;
    state.lastFixAt=performance.now();
    state.lastAccuracy=finite(point.horizontalAccuracyM)?Number(point.horizontalAccuracyM):null;
    state.lastSource=speed.source;
    state.lastError=null;
    state.previous={...point};
    updateSpeedDom();
    window.dispatchEvent(new CustomEvent('ridetracker:internal-telemetry',{detail:{
      speedKmh:speed.speedKmh,
      latitude:Number(point.latitude),
      longitude:Number(point.longitude),
      altitude:finite(point.altitude)?Number(point.altitude):null,
      horizontalAccuracyM:state.lastAccuracy,
      quality:point.quality,
      timestampMs:performance.now(),
      source:'phone-gps',
      speedSource:speed.source,
    }}));
    window.dispatchEvent(new CustomEvent('ridetracker:canonical-gps',{detail:{...point}}));
    window.dispatchEvent(new CustomEvent('ridetracker:gps-health',{detail:snapshot()}));
    render();
  }

  function onGpsError(event){
    const error=event.detail||{};
    state.lastError={code:error.code??null,message:String(error.message||'GPS nicht verfügbar')};
    render();
  }

  function resetSession(){
    estimator?.reset?.();
    state.previous=null;
    state.smoothedSpeedMS=0;
    state.maxSpeedKmh=0;
    state.points=0;
    state.lastFixAt=0;
    state.lastAccuracy=null;
    state.lastSource='–';
    state.lastError=null;
    state.persistedRideId=null;
    state.persistedPoints=0;
    state.validation=null;
    render();
  }

  function syncRecording(){
    const next=recordingFromBase() || Boolean(window.RideTrackerRecordingFullscreen?.isRecording?.());
    if(next===state.recording){if(next)updateSpeedDom();return;}
    state.recording=next;
    if(next){
      estimator?.reset?.();
      state.previous=null;
      state.smoothedSpeedMS=0;
      state.maxSpeedKmh=0;
      state.points=0;
      state.lastFixAt=0;
      state.lastError=null;
      try{window.RideTrackerGpsCapture?.start?.();}catch(error){state.lastError={message:error?.message||String(error)};}
    } else {
      try{window.RideTrackerGpsCapture?.stop?.();}catch(_){}
    }
    render();
  }

  function packageGpsPoints(pkg){
    if(gpsMath?.gpsPointsFromPackage)return gpsMath.gpsPointsFromPackage(pkg);
    const direct=Array.isArray(pkg?.document?.gps?.points)?pkg.document.gps.points:[];
    if(direct.length)return direct;
    return (Array.isArray(pkg?.document?.samples)?pkg.document.samples:[]).filter(s=>finite(s.latitude)&&finite(s.longitude));
  }

  function distanceFromPoints(points){
    let distance=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];
      if(!finite(a.latitude)||!finite(a.longitude)||!finite(b.latitude)||!finite(b.longitude))continue;
      const dt=((Number(b.gpsTimestampMs)||0)-(Number(a.gpsTimestampMs)||0))/1000;
      const d=distanceMeters(a,b);
      const accuracy=Math.max(Number(a.horizontalAccuracyM)||0,Number(b.horizontalAccuracyM)||0);
      if(dt>0 && d/dt>220)continue;
      if(d>Math.max(1.5,accuracy*0.08))distance+=d;
    }
    return distance;
  }

  async function hardenPackage(rideId){
    const database=window.RideTrackerDatabase;
    if(!database||!rideId)return null;
    // update54 owns the canonical merge; call it again here so saving and GPS persistence cannot race.
    await window.RideTrackerGpsCapture?.persistGps?.(rideId);
    let pkg=await database.get(database.stores.ridePackages,rideId);
    if(!pkg)return null;
    const points=packageGpsPoints(pkg);
    pkg.document=pkg.document||{};
    if(points.length && gpsMath?.mergeCanonicalGpsIntoSamples){
      pkg.document.samples=gpsMath.mergeCanonicalGpsIntoSamples(Array.isArray(pkg.document.samples)?pkg.document.samples:[],points);
    }
    const distance=distanceFromPoints(points);
    const samples=Array.isArray(pkg?.document?.samples)?pkg.document.samples:[];
    let maxSpeed=gpsMath?.packageMaxSpeedKmh?.(pkg)||0;
    for(const sample of samples){
      const speed=finite(sample.speedKmh)?Number(sample.speedKmh):(finite(sample.speedMS)?Number(sample.speedMS)*3.6:0);
      maxSpeed=Math.max(maxSpeed,speed);
    }
    for(const point of points){
      const speed=finite(point.speedKmh)?Number(point.speedKmh):(finite(point.speedMS)?Number(point.speedMS)*3.6:0);
      maxSpeed=Math.max(maxSpeed,speed);
    }
    if(points.length){
      pkg.distanceMeters=distance>0?distance:Number(pkg.distanceMeters||0);
      pkg.maxSpeedKmh=Math.max(Number(pkg.maxSpeedKmh||0),maxSpeed);
      pkg.gpsPointCount=points.length;
      pkg.document.summary={...(pkg.document.summary||{}),distanceMeters:pkg.distanceMeters,maxSpeedKmh:pkg.maxSpeedKmh,gpsPointCount:points.length};
    }
    const video=await database.get(database.stores.videos,rideId).catch(()=>null);
    const motionSamples=samples.filter(s=>finite(s.normalG??s.normal)||finite(s.lateralG??s.lateral)||finite(s.longitudinalG??s.longitudinal));
    const validation={
      checkedAt:new Date().toISOString(),
      rideId,
      video:Boolean(video),
      telemetry:motionSamples.length>0,
      gps:points.length>0,
      gpsPoints:points.length,
      maxSpeedKmh:Number(pkg.maxSpeedKmh||0),
      distanceMeters:Number(pkg.distanceMeters||0),
      ok:Boolean(motionSamples.length && (video || points.length)),
    };
    pkg.document.validation=validation;
    await database.put(database.stores.ridePackages,rideId,pkg);
    state.persistedRideId=rideId;
    state.persistedPoints=points.length;
    state.validation=validation;
    window.dispatchEvent(new CustomEvent('ridetracker:ride-validated',{detail:validation}));
    render();
    return validation;
  }

  async function onRideSaved(event){
    const rideId=event.detail?.rideId;
    if(!rideId)return;
    try{
      // Allow the base RidePackage write to settle before the explicit GPS merge/validation.
      await new Promise(resolve=>setTimeout(resolve,180));
      await hardenPackage(rideId);
    }catch(error){
      state.validation={rideId,ok:false,error:error?.message||String(error)};
      render();
    }
  }

  function statusText(){
    if(state.lastError){
      if(Number(state.lastError.code)===1)return 'Standort-Berechtigung fehlt';
      return `GPS-Fehler: ${state.lastError.message}`;
    }
    if(state.recording && !state.points)return 'GPS-Fix wird gesucht …';
    if(state.recording && state.points){
      const age=(performance.now()-state.lastFixAt)/1000;
      return age>5?'GPS-Fix veraltet':'GPS-Fix aktiv';
    }
    if(state.persistedRideId)return state.persistedPoints?`GPS gespeichert · ${state.persistedPoints} Punkte`:'Fahrt gespeichert · keine GPS-Punkte';
    return 'GPS startet automatisch mit der Aufnahme';
  }

  function snapshot(){
    return {
      recording:state.recording,
      points:state.points,
      speedKmh:state.smoothedSpeedMS*3.6,
      maxSpeedKmh:state.maxSpeedKmh,
      accuracyM:state.lastAccuracy,
      source:state.lastSource,
      ageMs:state.lastFixAt?performance.now()-state.lastFixAt:null,
      error:state.lastError,
      persistedRideId:state.persistedRideId,
      persistedPoints:state.persistedPoints,
      validation:state.validation,
    };
  }

  const style=document.createElement('style');
  style.id='rtGpsHealth58Style';
  style.textContent=`#rtGpsHealth58{margin:9px 0;border:1px solid #29435f;border-radius:13px;background:#081522;padding:10px;color:#f5fbff}#rtGpsHealth58 .rt58-head{display:flex;justify-content:space-between;gap:8px;align-items:center}#rtGpsHealth58 .rt58-head b{font-size:13px}#rtGpsHealth58 .rt58-head span{font-size:11px;color:#5fd0ff}#rtGpsHealth58 .rt58-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:8px}#rtGpsHealth58 .rt58-item{background:#07111f;border-radius:9px;padding:7px}#rtGpsHealth58 .rt58-item small{display:block;color:#96aac1;font-size:9px;text-transform:uppercase}#rtGpsHealth58 .rt58-item strong{display:block;margin-top:2px;font-size:12px}@media(max-width:560px){#rtGpsHealth58 .rt58-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
  document.head.appendChild(style);

  function ensurePanel(){
    let panel=document.getElementById('rtGpsHealth58');
    if(panel)return panel;
    const videoWrap=document.getElementById('videoWrap');
    if(!videoWrap)return null;
    panel=document.createElement('div');
    panel.id='rtGpsHealth58';
    panel.innerHTML='<div class="rt58-head"><b>GPS-Diagnose</b><span data-status></span></div><div class="rt58-grid"><div class="rt58-item"><small>Tempo</small><strong data-speed>–</strong></div><div class="rt58-item"><small>Genauigkeit</small><strong data-accuracy>–</strong></div><div class="rt58-item"><small>Punkte</small><strong data-points>0</strong></div><div class="rt58-item"><small>Quelle</small><strong data-source>–</strong></div></div>';
    videoWrap.before(panel);
    return panel;
  }

  function render(){
    const panel=ensurePanel();if(!panel)return;
    const snap=snapshot();
    const set=(selector,value)=>{const node=panel.querySelector(selector);if(node&&node.textContent!==value)node.textContent=value;};
    set('[data-status]',statusText());
    set('[data-speed]',`${Number(snap.speedKmh||0).toFixed(1)} km/h`);
    set('[data-accuracy]',finite(snap.accuracyM)?`±${Math.round(snap.accuracyM)} m`:'–');
    set('[data-points]',String(snap.points||snap.persistedPoints||0));
    set('[data-source]',snap.source==='native+derived'?'GPS + Strecke':snap.source==='derived'?'aus GPS-Strecke':snap.source==='native'?'GPS direkt':snap.source);
  }

  window.addEventListener('ridetracker:recording-gps',onGps);
  window.addEventListener('ridetracker:recording-gps-error',onGpsError);
  window.addEventListener('ridetracker:new-ride-session',resetSession);
  window.addEventListener('ridetracker:ride-saved',event=>void onRideSaved(event));
  window.addEventListener('ridetracker:recording-started',()=>setTimeout(syncRecording,0));
  window.addEventListener('ridetracker:recording-stopped',()=>setTimeout(syncRecording,0));
  setInterval(()=>{syncRecording();render();},250);
  render();

  window.RideTrackerGpsHealth={snapshot,hardenPackage,deriveSpeed,distanceFromPoints};
})();
