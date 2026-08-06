(() => {
  'use strict';
  const STORAGE_KEY = 'rideTracker.hud.configuration.v1';
  const IDS = ['pulse','gDial','gValues','speed','vibration','dynamics'];
  const LABELS = {pulse:'PULS',gDial:'G-KRÄFTE',gValues:'G-ACHSEN',speed:'GESCHWINDIGKEIT',vibration:'VIBRATION',dynamics:'FAHRDYNAMIK'};

  const style=document.createElement('style');
  style.textContent='#rtConfiguredLiveHud{position:absolute;inset:0;width:100%;height:100%;z-index:55;pointer-events:none}#rtSharedOverlay{display:none!important}';
  document.head.appendChild(style);

  function num(id,fallback=0){const text=document.getElementById(id)?.textContent||'';const m=String(text).replace(',','.').match(/[-+]?\d+(?:\.\d+)?/);return m?Number(m[0]):fallback;}
  function load(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{return {}}}
  function defaults(mode){
    const p=mode==='portrait'?{
      vibration:[.04,.04,.42,.15],dynamics:[.54,.04,.42,.15],gDial:[.18,.22,.64,.30],gValues:[.07,.54,.86,.10],pulse:[.05,.69,.43,.25],speed:[.52,.69,.43,.25]
    }:{pulse:[.02,.62,.29,.31],gDial:[.42,.48,.17,.30],gValues:[.33,.84,.34,.11],speed:[.70,.61,.28,.33],vibration:[.80,.06,.18,.24],dynamics:[.03,.06,.24,.18]};
    return Object.fromEntries(Object.entries(p).map(([k,v])=>[k,{visible:true,x:v[0],y:v[1],width:v[2],height:v[3],scale:1,opacity:1,fontScale:1}]));
  }
  function values(){
    const lat=num('latVal'),vert=num('normalVal',1),long=num('hudLong'),speed=num('speed'),pulse=num('heartRateValue'),vibration=num('vibrationValue');
    return {lat,vert,long,speed,pulse,vibration,total:Math.hypot(lat,vert,long)};
  }
  function signed(v){return `${v>=0?'+':''}${v.toFixed(1)}`}
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);}
  function panel(ctx,r,title,alpha,fontScale){
    roundRect(ctx,r.x,r.y,r.w,r.h,Math.max(6,r.h*.07));ctx.fillStyle=`rgba(6,20,22,${alpha})`;ctx.fill();ctx.strokeStyle='#00E5FF';ctx.lineWidth=Math.max(1,r.h*.012);ctx.stroke();
    ctx.fillStyle='#F5FBFF';ctx.font=`600 ${Math.max(8,r.h*.10*fontScale)}px system-ui`;ctx.fillText(title,r.x+r.w*.05,r.y+r.h*.14);
  }
  function drawItem(ctx,key,r,v,a,fs){
    if(key==='gDial'){
      const cx=r.x+r.w/2,cy=r.y+r.h/2,rad=Math.min(r.w,r.h)*.39;ctx.strokeStyle='#00E5FF';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,rad,0,Math.PI*2);ctx.stroke();
      for(let i=1;i<4;i++){ctx.strokeStyle='rgba(245,251,255,.25)';ctx.beginPath();ctx.arc(cx,cy,rad*i/4,0,Math.PI*2);ctx.stroke()}
      ctx.strokeStyle='#F5FBFF';ctx.beginPath();ctx.moveTo(cx-rad,cy);ctx.lineTo(cx+rad,cy);ctx.moveTo(cx,cy-rad);ctx.lineTo(cx,cy+rad);ctx.stroke();
      const px=cx+Math.max(-1,Math.min(1,v.lat/4))*rad,py=cy-Math.max(-1,Math.min(1,v.vert/4))*rad;ctx.strokeStyle=v.long<0?'#FFAA20':'#00E5FF';ctx.lineWidth=Math.max(3,r.h*.025);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(px,py);ctx.stroke();ctx.fillStyle='#00E5FF';ctx.beginPath();ctx.arc(px,py,Math.max(4,r.h*.025),0,Math.PI*2);ctx.fill();return;
    }
    panel(ctx,r,LABELS[key],a,fs);
    ctx.textAlign=key==='speed'?'center':'left';
    if(key==='pulse'){ctx.fillStyle=v.pulse>=160?'#FF334E':v.pulse>=120?'#FFAA20':'#00E5FF';ctx.font=`800 ${Math.max(13,r.h*.30*fs)}px system-ui`;ctx.fillText(v.pulse||'–',r.x+r.w*.08,r.y+r.h*.78);ctx.fillStyle='#F5FBFF';ctx.font=`600 ${Math.max(8,r.h*.11*fs)}px system-ui`;ctx.fillText('BPM',r.x+r.w*.40,r.y+r.h*.78)}
    if(key==='speed'){ctx.fillStyle='#F5FBFF';ctx.font=`800 ${Math.max(15,r.h*.38*fs)}px system-ui`;ctx.fillText(Math.round(v.speed),r.x+r.w*.5,r.y+r.h*.63);ctx.fillStyle='#00E5FF';ctx.font=`600 ${Math.max(8,r.h*.10*fs)}px system-ui`;ctx.fillText('KM/H',r.x+r.w*.5,r.y+r.h*.82)}
    if(key==='gValues'){ctx.textAlign='left';const labels=['LAT','VERT','LONG'],vals=[v.lat,v.vert,v.long];labels.forEach((l,i)=>{const x=r.x+r.w*(.05+i*.33);ctx.fillStyle='#7D929A';ctx.font=`600 ${Math.max(7,r.h*.18*fs)}px system-ui`;ctx.fillText(l,x,r.y+r.h*.30);ctx.fillStyle=vals[i]<0?'#FFAA20':'#00E5FF';ctx.font=`800 ${Math.max(9,r.h*.29*fs)}px system-ui`;ctx.fillText(`${signed(vals[i])} G`,x,r.y+r.h*.75)})}
    if(key==='vibration'){ctx.fillStyle=v.vibration>7?'#FF3B30':v.vibration>3?'#FFAA20':'#00E5FF';ctx.font=`800 ${Math.max(12,r.h*.27*fs)}px system-ui`;ctx.fillText(v.vibration.toFixed(1),r.x+r.w*.08,r.y+r.h*.80);ctx.fillStyle='#F5FBFF';ctx.font=`600 ${Math.max(7,r.h*.10*fs)}px system-ui`;ctx.fillText('m/s²',r.x+r.w*.48,r.y+r.h*.80)}
    if(key==='dynamics'){ctx.fillStyle='#00E5FF';ctx.font=`800 ${Math.max(11,r.h*.24*fs)}px system-ui`;ctx.fillText(`${v.total.toFixed(2)} G`,r.x+r.w*.07,r.y+r.h*.53);ctx.fillStyle='#F5FBFF';ctx.font=`600 ${Math.max(7,r.h*.11*fs)}px system-ui`;ctx.fillText(v.vert<.2?'AIRTIME':v.long>.2?'LAUNCH':v.long<-.2?'BREMSEN':'FAHRT',r.x+r.w*.07,r.y+r.h*.80)}
    ctx.textAlign='left';
  }

  function install(){
    const wrap=document.getElementById('videoWrap');if(!wrap)return false;
    let canvas=document.getElementById('rtConfiguredLiveHud');if(!canvas){canvas=document.createElement('canvas');canvas.id='rtConfiguredLiveHud';wrap.appendChild(canvas)}
    const ctx=canvas.getContext('2d');
    const render=()=>{
      if(!canvas.isConnected)return;
      const rect=wrap.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,rect.width),h=Math.max(1,rect.height);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const video=[...wrap.querySelectorAll('video')].find(x=>x.videoWidth&&x.videoHeight);const aspect=video?.videoWidth&&video?.videoHeight?video.videoWidth/video.videoHeight:w/h;const mode=aspect<1?'portrait':'landscape';
      let cw=w,ch=h,cx=0,cy=0;if(w/h>aspect){cw=h*aspect;cx=(w-cw)/2}else{ch=w/aspect;cy=(h-ch)/2}
      const cfg=load(),profile=cfg.profiles?.[mode]||{},elements={...defaults(mode),...(profile.elements||{})},globalOpacity=profile.globalOpacity??1,panelOpacity=profile.panelOpacity??.86,globalFont=profile.fontScale??1,v=values();
      for(const key of IDS){const e=elements[key];if(!e||e.visible===false)continue;const scale=e.scale??1,r={x:cx+e.x*cw,y:cy+e.y*ch,w:e.width*scale*cw,h:e.height*scale*ch};ctx.save();ctx.globalAlpha=(e.opacity??1)*globalOpacity;drawItem(ctx,key,r,v,panelOpacity,(e.fontScale??1)*globalFont);ctx.restore()}
      requestAnimationFrame(render);
    };requestAnimationFrame(render);return true;
  }
  if(!install())new MutationObserver(()=>install()&&this.disconnect).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)install()});
  window.addEventListener('resize',install);
})();