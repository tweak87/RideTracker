(() => {
  'use strict';

  const style=document.createElement('style');
  style.id='rtRecordingFullscreen39Style';
  style.textContent=`
    #videoWrap.rt-app-fullscreen,
    #videoWrap:fullscreen,
    #videoWrap:-webkit-full-screen{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;min-height:0!important;aspect-ratio:auto!important;margin:0!important;border-radius:0!important;background:#000!important;overflow:hidden!important}
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
    #rtRecordingOverlayControls{position:absolute;inset:0;z-index:2147483000;pointer-events:none;display:none}
    #videoWrap.rt-app-fullscreen #rtRecordingOverlayControls,
    #videoWrap:fullscreen #rtRecordingOverlayControls,
    #videoWrap:-webkit-full-screen #rtRecordingOverlayControls{display:block}
    #rtRecordingOverlayControls button{pointer-events:auto;position:absolute;top:max(12px,env(safe-area-inset-top));min-height:44px;border-radius:999px;padding:9px 14px;border:1px solid rgba(255,255,255,.48);color:#fff;background:rgba(4,15,22,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-weight:800;font-variant-numeric:tabular-nums;box-shadow:0 4px 20px rgba(0,0,0,.35)}
    #rtRecordingStopButton{left:max(12px,env(safe-area-inset-left));display:none!important;background:rgba(124,14,32,.88)!important;border-color:rgba(255,105,125,.9)!important}
    #rtRecordingStopButton[data-recording="true"]{display:block!important}
    #rtRecordingStopButton .rt-rec-dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#ff334e;margin-right:7px;vertical-align:0;box-shadow:0 0 0 0 rgba(255,51,78,.7);animation:rtRecPulse 1.3s infinite}
    #rtRecordingExitButton{right:max(12px,env(safe-area-inset-right))}
    @keyframes rtRecPulse{0%{box-shadow:0 0 0 0 rgba(255,51,78,.7)}70%{box-shadow:0 0 0 8px rgba(255,51,78,0)}100%{box-shadow:0 0 0 0 rgba(255,51,78,0)}}
    body.rt-app-fullscreen-active{overflow:hidden!important;overscroll-behavior:none!important;touch-action:none}
  `;
  document.head.appendChild(style);

  const state={recording:false,startedAt:0,raf:0,lastText:'',activationToken:0};
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
    const host=wrap();
    if(!host)return null;
    let controls=document.getElementById('rtRecordingOverlayControls');
    if(controls&&controls.parentElement===host)return controls;
    controls?.remove();
    controls=document.createElement('div');
    controls.id='rtRecordingOverlayControls';
    controls.innerHTML='<button type="button" id="rtRecordingStopButton" aria-label="Aufzeichnung stoppen"><span class="rt-rec-dot"></span><span>REC</span> <span id="rtRecordingElapsed">00:00</span></button><button type="button" id="rtRecordingExitButton">Vollbild verlassen</button>';
    host.appendChild(controls);
    controls.querySelector('#rtRecordingStopButton').onclick=()=>stopRecording();
    controls.querySelector('#rtRecordingExitButton').onclick=()=>leaveFullscreen();
    return controls;
  }

  function forceLivePreviewMode(){
    const live=preview();
    const recorded=replay();
    if(recorded){
      try{recorded.pause()}catch(_){ }
      recorded.classList.add('hidden');
      recorded.controls=false;
    }
    if(live){
      live.classList.remove('hidden');
      live.controls=false;
      live.muted=true;
      live.autoplay=true;
      live.playsInline=true;
      live.setAttribute('playsinline','');
      live.setAttribute('webkit-playsinline','');
      live.removeAttribute('controls');
    }
    return live;
  }

  function hasLiveCameraStream(video){
    const stream=video?.srcObject;
    if(!(stream instanceof MediaStream))return false;
    return stream.getVideoTracks().some(track=>track.readyState==='live'&&track.enabled!==false);
  }

  async function waitForLivePreview(timeoutMs=3500){
    const started=performance.now();
    while(performance.now()-started<timeoutMs){
      if(!state.recording)return null;
      const video=forceLivePreviewMode();
      if(video&&hasLiveCameraStream(video)){
        try{await video.play()}catch(_){ }
        if(!video.paused)return video;
      }
      await new Promise(resolve=>setTimeout(resolve,80));
    }
    return null;
  }

  function tick(){
    if(!state.recording)return;
    const text=formatElapsed(performance.now()-state.startedAt);
    if(text!==state.lastText){
      state.lastText=text;
      const elapsed=document.getElementById('rtRecordingElapsed');if(elapsed)elapsed.textContent=text;
    }
    state.raf=requestAnimationFrame(tick);
  }

  async function activateRecordingView(token){
    const video=await waitForLivePreview();
    if(token!==state.activationToken||!state.recording)return;
    if(video){
      ensureAppFullscreen();
      return;
    }
    // Keep recording running even if Safari has not produced a preview frame yet.
    const meta=document.getElementById('videoMeta');
    if(meta)meta.textContent='Aufnahme läuft. Kameravorschau wird noch initialisiert.';
  }

  function setRecording(active){
    if(active===state.recording)return;
    state.recording=active;
    state.activationToken+=1;
    if(active){
      state.startedAt=performance.now();
      forceLivePreviewMode();
      tick();
      void activateRecordingView(state.activationToken);
    }else{
      cancelAnimationFrame(state.raf);state.raf=0;state.lastText='';
      const elapsed=document.getElementById('rtRecordingElapsed');if(elapsed)elapsed.textContent='00:00';
    }
    const button=document.getElementById('rtRecordingStopButton');
    if(button)button.dataset.recording=String(active);
  }

  function syncRecordingState(){
    const stop=stopButton();
    if(!stop)return;
    setRecording(stop.disabled===false);
  }

  function stopRecording(){
    const stop=stopButton();
    if(stop&&stop.disabled===false)stop.click();
    setTimeout(syncRecordingState,0);
  }

  async function leaveFullscreen(){
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else if(document.webkitFullscreenElement&&document.webkitExitFullscreen)document.webkitExitFullscreen();
    }catch(_){ }
    const host=wrap();
    host?.classList.remove('rt-app-fullscreen');
    document.body.classList.remove('rt-app-fullscreen-active');
    try{screen.orientation?.unlock?.()}catch(_){ }
    // Deliberately do not stop the recording here.
  }

  function ensureAppFullscreen(){
    const host=wrap();
    if(!host||!state.recording)return;
    forceLivePreviewMode();
    host.classList.add('rt-app-fullscreen');
    document.body.classList.add('rt-app-fullscreen-active');
    ensureControls();
  }

  function keepSafariVideoInsideApp(){
    const video=preview();
    if(!video||video.dataset.rtFullscreen39==='1')return;
    video.dataset.rtFullscreen39='1';
    video.addEventListener('webkitbeginfullscreen',()=>{
      try{video.webkitExitFullscreen?.()}catch(_){ }
      setTimeout(()=>{if(state.recording)ensureAppFullscreen()},0);
    });
  }

  window.addEventListener('ridetracker:recording-started',()=>setRecording(true));
  window.addEventListener('ridetracker:recording-stopped',()=>setRecording(false));
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&!wrap()?.classList.contains('rt-app-fullscreen'))document.body.classList.remove('rt-app-fullscreen-active')});
  document.addEventListener('webkitfullscreenchange',()=>{if(!document.webkitFullscreenElement&&!wrap()?.classList.contains('rt-app-fullscreen'))document.body.classList.remove('rt-app-fullscreen-active')});

  const stopObserver=new MutationObserver(syncRecordingState);
  const install=()=>{
    ensureControls();
    keepSafariVideoInsideApp();
    forceLivePreviewMode();
    syncRecordingState();
    const stop=stopButton();if(stop)stopObserver.observe(stop,{attributes:true,attributeFilter:['disabled']});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();

  window.RideTrackerRecordingFullscreen={
    enter:async()=>{
      if(!state.recording)return false;
      const video=await waitForLivePreview();
      if(!video)return false;
      ensureAppFullscreen();
      return true;
    },
    exit:leaveFullscreen,
    stop:stopRecording,
    isRecording:()=>state.recording,
    elapsedMs:()=>state.recording?performance.now()-state.startedAt:0,
    ensureLivePreview:forceLivePreviewMode
  };
})();
