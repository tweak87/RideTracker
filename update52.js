(() => {
  'use strict';
  const byId=id=>document.getElementById(id);

  const style=document.createElement('style');
  style.id='rtHudCameraFix52Style';
  style.textContent=`
    #rtStandaloneHudEditor .rt-hud-body{height:auto!important;min-height:0!important}
    #rtStandaloneHudEditor .rt-hud-stage-wrap{position:relative!important;overflow:hidden!important}
    #rtStandaloneHudEditor .rt-hud-stage{position:absolute!important;left:50%!important;top:50%!important;right:auto!important;bottom:auto!important;margin:0!important;transform:translate(-50%,-50%)!important;transform-origin:center center!important}
    @media (orientation:portrait),(max-width:760px){
      #rtStandaloneHudEditor .rt-hud-body{height:auto!important;grid-template-rows:minmax(0,58%) minmax(0,42%)!important}
      #rtStandaloneHudEditor .rt-hud-stage-wrap{min-height:0!important}
      #rtStandaloneHudEditor .rt-hud-sidebar{min-height:0!important;overflow:auto!important}
    }
    @media (orientation:landscape) and (max-height:600px){#rtStandaloneHudEditor .rt-hud-body{height:auto!important}}
  `;
  document.head.appendChild(style);

  function refitHud(){
    const root=byId('rtStandaloneHudEditor'),wrap=root?.querySelector('.rt-hud-stage-wrap'),stage=root?.querySelector('.rt-hud-stage'),select=byId('rtHudMode');
    if(!root?.classList.contains('open')||!wrap||!stage)return;
    const portrait=(select?.value||'portrait')==='portrait',ratio=portrait?9/16:16/9,rect=wrap.getBoundingClientRect();
    const width=Math.max(80,rect.width-12),height=Math.max(80,rect.height-12);
    let stageW=Math.min(width,height*ratio),stageH=stageW/ratio;
    if(stageH>height){stageH=height;stageW=stageH*ratio;}
    stage.style.setProperty('width',`${Math.floor(stageW)}px`,'important');
    stage.style.setProperty('height',`${Math.floor(stageH)}px`,'important');
    stage.style.setProperty('aspect-ratio',portrait?'9 / 16':'16 / 9','important');
    stage.style.setProperty('left','50%','important');stage.style.setProperty('top','50%','important');stage.style.setProperty('transform','translate(-50%,-50%)','important');
  }
  const schedule=()=>requestAnimationFrame(()=>{refitHud();setTimeout(refitHud,80);setTimeout(refitHud,220);});
  window.addEventListener('resize',schedule,{passive:true});window.addEventListener('orientationchange',schedule,{passive:true});window.visualViewport?.addEventListener?.('resize',schedule,{passive:true});
  document.addEventListener('change',event=>{if(event.target?.id==='rtHudMode')schedule();},true);
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});

  function recording(){return Boolean(window.RideTrackerRecordingFullscreen?.isRecording?.());}
  function syncCameraButton(){
    const preview=byId('preview'),button=byId('flip'),stream=preview?.srcObject,track=stream?.getVideoTracks?.()[0],settings=track?.getSettings?.()||{};
    if(stream)window.RideTrackerCameraSources?.syncFromStream?.(stream);
    if(button){const facing=settings.facingMode||window.RideTrackerCameraSources?.snapshot?.().facing||null;button.textContent=facing==='user'?'Rückkamera verwenden':'Frontkamera verwenden';button.disabled=recording();button.title=recording()?'Kamerawechsel während einer laufenden Aufnahme ist gesperrt.':'';}
    window.RideTrackerCameraDiagnostics?.refresh?.();
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('#flip');if(!button)return;
    if(recording()){event.preventDefault();event.stopImmediatePropagation();alert('Kamerawechsel während einer laufenden Aufnahme ist gesperrt. Beende zuerst die Aufnahme.');return;}
    setTimeout(syncCameraButton,250);setTimeout(syncCameraButton,700);
  },true);
  window.addEventListener('ridetracker:camera-sources',syncCameraButton);
  window.addEventListener('ridetracker:camera-plugin-preview',syncCameraButton);
  window.addEventListener('ridetracker:recording-started',syncCameraButton);
  window.addEventListener('ridetracker:recording-stopped',syncCameraButton);

  const install=()=>{schedule();syncCameraButton();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.RideTrackerHudPortraitFit={fit:refitHud};
})();