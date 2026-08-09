(() => {
  'use strict';

  const style=document.createElement('style');
  style.id='rtRecordingFullscreen39Style';
  style.textContent=`
    #videoWrap.rt-app-fullscreen,
    #videoWrap:fullscreen,
    #videoWrap:-webkit-full-screen{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;min-height:0!important;aspect-ratio:auto!important;margin:0!important;border-radius:0!important;background:#000!important;overflow:hidden!important;z-index:2147481000!important}
    #videoWrap.rt-app-fullscreen>#preview,
    #videoWrap:fullscreen>#preview,
    #videoWrap:-webkit-full-screen>#preview{display:block!important;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:cover!important;object-position:50% 50%!important;background:#000!important}
    #videoWrap.rt-app-fullscreen>#replay,
    #videoWrap:fullscreen>#replay,
    #videoWrap:-webkit-full-screen>#replay{display:none!important}
    #preview::-webkit-media-controls{display:none!important}
    #videoWrap.rt-app-fullscreen #rtConfiguredLiveHud,
    #videoWrap:fullscreen #rtConfiguredLiveHud,
    #videoWrap:-webkit-full-screen #rtConfiguredLiveHud,
    #videoWrap.rt-app-fullscreen #rtHudCanvas,
    #videoWrap:fullscreen #rtHudCanvas,
    #videoWrap:-webkit-full-screen #rtHudCanvas{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important}
    #rtExitRecordingFullscreen{display:none!important}
    #rtRecordingControlPortal{position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important;display:none!important;font-variant-numeric:tabular-nums}
    body.rt-app-fullscreen-active #rtRecordingControlPortal{display:block!important}
    #rtRecordingControlPortal .rt-record-control{pointer-events:auto!important;position:fixed!important;top:max(12px,env(safe-area-inset-top))!important;min-height:46px!important;border-radius:999px!important;padding:10px 14px!important;border:1px solid rgba(255,255,255,.55)!important;color:#fff!important;background:rgba(4,15,22,.88)!important;backdrop-filter:blur(12px)!important;-webkit-backdrop-filter:blur(12px)!important;font-weight:800!important;box-shadow:0 5px 22px rgba(0,0,0,.45)!important}
    #rtRecordingStopButton{left:max(12px,env(safe-area-inset-left))!important;background:rgba(124,14,32,.92)!important;border-color:rgba(255,105,125,.95)!important;display:none!important}
    #rtRecordingStopButton[data-recording="true"]{display:block!important}
    #rtRecordingMinimizeButton{right:max(12px,env(safe-area-inset-right))!important}
    #rtRecordingStopButton .rt-rec-dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#ff334e;margin-right:7px;vertical-align:0;box-shadow:0 0 0 0 rgba(255,51,78,.7);animation:rtRecPulse 1.3s infinite}
    #rtRecordingStatusChip{pointer-events:none!important;position:fixed!important;left:50%!important;transform:translateX(-50%)!important;bottom:max(18px,calc(env(safe-area-inset-bottom) + 10px))!important;display:none!important;border-radius:999px!important;padding:8px 12px!important;background:rgba(0,0,0,.68)!important;color:#fff!important;border:1px solid rgba(255,255,255,.35)!important;font-size:12px!important}
    #rtRecordingPreparationPanel{pointer-events:none!important;position:fixed!important;inset:0!important;display:none!important;place-items:center!important;padding:24px!important;background:radial-gradient(circle at 50% 42%,rgba(10,53,76,.34),rgba(0,0,0,.78))!important;color:#fff!important;text-align:center!important}
    body.rt-app-fullscreen-active #rtRecordingPreparationPanel[data-preparing="true"]{display:grid!important}
    #rtRecordingPreparationPanel>div{max-width:340px;border:1px solid rgba(95,208,255,.6);border-radius:22px;padding:20px 22px;background:rgba(4,18,29,.84);box-shadow:0 18px 60px rgba(0,0,0,.55);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
    #rtRecordingPreparationPanel i{display:block;width:42px;height:42px;margin:0 auto 14px;border:4px solid rgba(95,208,255,.24);border-top-color:#5fd0ff;border-radius:50%;animation:rtPrepareSpin .85s linear infinite}
    #rtRecordingPreparationPanel strong{display:block;font-size:20px}#rtRecordingPreparationPanel span{display:block;margin-top:7px;color:#bdd4e5;font-size:13px;line-height:1.45}
    body.rt-app-fullscreen-active #rtRecordingStatusChip[data-recording="true"],body.rt-app-fullscreen-active #rtRecordingStatusChip[data-preparing="true"]{display:block!important}
    @keyframes rtRecPulse{0%{box-shadow:0 0 0 0 rgba(255,51,78,.7)}70%{box-shadow:0 0 0 8px rgba(255,51,78,0)}100%{box-shadow:0 0 0 0 rgba(255,51,78,0)}}
    @keyframes rtPrepareSpin{to{transform:rotate(360deg)}}
    body.rt-app-fullscreen-active{overflow:hidden!important;overscroll-behavior:none!important;touch-action:none!important}
    @media(max-width:520px){#rtRecordingControlPortal .rt-record-control{top:max(8px,env(safe-area-inset-top))!important;padding:9px 11px!important;font-size:13px!important}}
  `;
  document.head.appendChild(style);

  const state={recording:false,preparing:false,stageMessage:'Kamera, Sensoren und Kalibrierung werden vorbereitet …',startedAt:0,raf:0,lastText:'',activationToken:0,syncTimer:0};
  const wrap=()=>document.getElementById('videoWrap');
  const stopButton=()=>document.getElementById('stop');
  const preview=()=>document.getElementById('preview');
  const replay=()=>document.getElementById('replay');

  function formatElapsed(ms){
    const total=Math.max(0,Math.floor(ms/1000));
    const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
    return h>0?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function ensureControls(){
    let portal=document.getElementById('rtRecordingControlPortal');
    if(portal)return portal;
    portal=document.createElement('div');
    portal.id='rtRecordingControlPortal';
    portal.setAttribute('aria-live','polite');
    portal.innerHTML='<div id="rtRecordingPreparationPanel"><div><i></i><strong>Aufnahme wird vorbereitet</strong><span>Kamera, Sensoren und Kalibrierung werden vorbereitet …</span></div></div><button type="button" class="rt-record-control" id="rtRecordingStopButton" aria-label="Aufzeichnung stoppen"><span class="rt-rec-dot"></span><span>REC</span> <span id="rtRecordingElapsed">00:00</span></button><button type="button" class="rt-record-control" id="rtRecordingMinimizeButton">Vollbild verlassen</button><div id="rtRecordingStatusChip">Aufnahme läuft · Vollbild kann verlassen werden</div>';
    document.body.appendChild(portal);
    portal.querySelector('#rtRecordingStopButton').onclick=()=>stopRecording();
    portal.querySelector('#rtRecordingMinimizeButton').onclick=()=>leaveFullscreen();
    return portal;
  }

  function forceLivePreviewMode(){
    const live=preview();
    const recorded=replay();
    if(recorded){try{recorded.pause()}catch(_){} recorded.classList.add('hidden');recorded.controls=false;}
    if(live){
      live.classList.remove('hidden');live.controls=false;live.muted=true;live.autoplay=true;live.playsInline=true;
      live.setAttribute('playsinline','');live.setAttribute('webkit-playsinline','');live.removeAttribute('controls');
    }
    return live;
  }

  function hasLiveCameraStream(video){
    const stream=video?.srcObject;
    return stream instanceof MediaStream&&stream.getVideoTracks().some(track=>track.readyState==='live'&&track.enabled!==false);
  }

  async function waitForLivePreview(timeoutMs=3500){
    const started=performance.now();
    while(performance.now()-started<timeoutMs){
      if(!state.recording)return null;
      const video=forceLivePreviewMode();
      if(video&&hasLiveCameraStream(video)){
        try{await video.play()}catch(_){}
        if(!video.paused)return video;
      }
      await new Promise(resolve=>setTimeout(resolve,80));
    }
    return null;
  }

  function updateControlState(){
    ensureControls();
    const stop=document.getElementById('rtRecordingStopButton');
    const chip=document.getElementById('rtRecordingStatusChip');
    const preparation=document.getElementById('rtRecordingPreparationPanel');
    if(stop)stop.dataset.recording=String(state.recording);
    if(chip){chip.dataset.recording=String(state.recording);chip.dataset.preparing=String(state.preparing);chip.textContent=state.recording?'Aufnahme läuft · HUD und Video aktiv':state.stageMessage;}
    if(preparation){preparation.dataset.preparing=String(state.preparing);const text=preparation.querySelector('span');if(text)text.textContent=state.stageMessage;}
  }

  function tick(){
    if(!state.recording)return;
    const text=formatElapsed(performance.now()-state.startedAt);
    if(text!==state.lastText){
      state.lastText=text;
      const elapsed=document.getElementById('rtRecordingElapsed');
      if(elapsed)elapsed.textContent=text;
    }
    state.raf=requestAnimationFrame(tick);
  }

  async function activateRecordingView(token){
    const video=await waitForLivePreview();
    if(token!==state.activationToken||!state.recording)return;
    if(video){ensureAppFullscreen();return;}
    const meta=document.getElementById('videoMeta');
    if(meta)meta.textContent='Aufnahme läuft. Kameravorschau wird noch initialisiert.';
  }

  function setRecording(active){
    active=Boolean(active);
    if(active===state.recording){updateControlState();return;}
    state.recording=active;state.activationToken+=1;
    if(active){
      state.preparing=false;state.startedAt=performance.now();state.lastText='';forceLivePreviewMode();ensureControls();updateControlState();ensureAppFullscreen();tick();void activateRecordingView(state.activationToken);
    }else{
      cancelAnimationFrame(state.raf);state.raf=0;state.lastText='';
      const elapsed=document.getElementById('rtRecordingElapsed');if(elapsed)elapsed.textContent='00:00';
      updateControlState();
    }
  }

  function recordingByBaseUi(){
    const stop=stopButton();
    return Boolean(stop&&stop.disabled===false);
  }

  function syncRecordingState(){
    const inferred=recordingByBaseUi();
    if(inferred!==state.recording)setRecording(inferred);else updateControlState();
  }

  function stopRecording(){
    const stop=stopButton();
    if(stop&&stop.disabled===false)stop.click();
    setTimeout(syncRecordingState,0);
  }

  async function leaveFullscreen(){
    state.preparing=false;
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else if(document.webkitFullscreenElement&&document.webkitExitFullscreen)document.webkitExitFullscreen();
    }catch(_){}
    wrap()?.classList.remove('rt-app-fullscreen');
    document.body.classList.remove('rt-app-fullscreen-active');
    try{screen.orientation?.unlock?.()}catch(_){}
    // Recording deliberately continues.
    updateControlState();
  }

  function ensureAppFullscreen(){
    const host=wrap();
    if(!host||(!state.recording&&!state.preparing))return;
    forceLivePreviewMode();ensureControls();host.classList.add('rt-app-fullscreen');document.body.classList.add('rt-app-fullscreen-active');updateControlState();
  }

  function beginPreparation(){
    state.preparing=true;state.stageMessage='Kamera, Sensoren und Kalibrierung werden vorbereitet …';forceLivePreviewMode();ensureControls();ensureAppFullscreen();updateControlState();requestAnimationFrame(ensureAppFullscreen);setTimeout(ensureAppFullscreen,120);return true;
  }

  function setStage(message){
    if(message)state.stageMessage=String(message);if(state.preparing)ensureAppFullscreen();updateControlState();
  }

  async function abortPreparation(){
    if(state.recording)return false;state.preparing=false;await leaveFullscreen();return true;
  }

  function keepSafariVideoInsideApp(){
    const video=preview();
    if(!video||video.dataset.rtFullscreen39==='1')return;
    video.dataset.rtFullscreen39='1';
    video.addEventListener('webkitbeginfullscreen',()=>{
      try{video.webkitExitFullscreen?.()}catch(_){}
      setTimeout(()=>{if(state.recording)ensureAppFullscreen()},0);
    });
  }

  window.addEventListener('ridetracker:recording-started',()=>setRecording(true));
  window.addEventListener('ridetracker:recording-stopped',()=>setRecording(false));
  window.addEventListener('ridetracker:recording-stage',event=>setStage(event.detail?.message));
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&!wrap()?.classList.contains('rt-app-fullscreen'))document.body.classList.remove('rt-app-fullscreen-active')});
  document.addEventListener('webkitfullscreenchange',()=>{if(!document.webkitFullscreenElement&&!wrap()?.classList.contains('rt-app-fullscreen'))document.body.classList.remove('rt-app-fullscreen-active')});

  const stopObserver=new MutationObserver(syncRecordingState);
  const install=()=>{
    ensureControls();keepSafariVideoInsideApp();forceLivePreviewMode();syncRecordingState();
    const stop=stopButton();if(stop)stopObserver.observe(stop,{attributes:true,attributeFilter:['disabled']});
    clearInterval(state.syncTimer);state.syncTimer=setInterval(syncRecordingState,500);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();

  window.RideTrackerRecordingFullscreen={
    enter:async()=>{if(!state.recording)return false;const video=await waitForLivePreview();if(!video)return false;ensureAppFullscreen();return true;},
    beginPreparation,
    abortPreparation,
    exit:leaveFullscreen,
    stop:stopRecording,
    isRecording:()=>state.recording,
    elapsedMs:()=>state.recording?performance.now()-state.startedAt:0,
    ensureLivePreview:forceLivePreviewMode,
    setStage,
    controls:ensureControls
  };
})();
