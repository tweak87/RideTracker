import { chooseSpeedScale, normalizeFrame, pointerPosition, vibrationLevel } from './shared/overlay/overlay-core.js';

const spec = await fetch('./shared/overlay/overlay-spec.json').then(r => r.json());
const videoWrap = document.getElementById('videoWrap');
if (videoWrap) {
  const canvas = document.createElement('canvas');
  canvas.id = 'rtSharedOverlay';
  Object.assign(canvas.style, {position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'8',pointerEvents:'none'});
  videoWrap.appendChild(canvas);
  document.getElementById('hud')?.classList.add('hidden');
  const ctx = canvas.getContext('2d');
  const histories = { vibration: [], pulse: [] };
  const number = id => Number(String(document.getElementById(id)?.textContent || '').replace(',','.').match(/[-+]?\d+(?:\.\d+)?/)?.[0] || 0);
  const panel = (x,y,w,h,title) => { ctx.fillStyle='rgba(6,20,22,.86)';ctx.strokeStyle=spec.theme.cyan;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x,y,w,h,14);ctx.fill();ctx.stroke();ctx.fillStyle=spec.theme.white;ctx.font=`600 ${Math.max(11,h*.075)}px system-ui`;ctx.fillText(title,x+w*.06,y+h*.13); };
  const rect = key => { const [x,y,w,h]=spec.layout[key]; return [x*canvas.width,y*canvas.height,w*canvas.width,h*canvas.height]; };
  const signed = v => `${v>=0?'+':''}${v.toFixed(1)}`;
  function currentFrame(){
    const replay = window.__rideTrackerReplaySession;
    const video = document.getElementById('nativeReplayVideo') || document.getElementById('replay');
    if (replay?.samples?.length && video && !video.classList.contains('hidden')) {
      const offset = Number(document.getElementById('nativeReplayOffset')?.value || replay.video?.startOffsetSeconds || 0);
      const t = Math.max(0,(video.currentTime-offset)*1000);
      let sample = replay.samples[0]; for (const s of replay.samples) { if ((s.timestampMs ?? s.timestamp*1000)>t) break; sample=s; }
      return normalizeFrame(sample,t);
    }
    return normalizeFrame({lateralG:number('latVal'),normalG:number('normalVal')||1,longitudinalG:number('hudLong'),speed:{valueKmh:number('speed')},heartRateBpm:number('heartRateValue')||null,vibrationRmsMs2:number('vibrationValue')},performance.now());
  }
  function draw(){
    const box=videoWrap.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2), w=Math.max(1,Math.round(box.width*dpr)), h=Math.max(1,Math.round(box.height*dpr)); if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx.clearRect(0,0,w,h); const f=currentFrame(); const cyan=spec.theme.cyan, orange=spec.theme.warning, red=spec.theme.heart;
    let [x,y,pw,ph]=rect('pulse'); panel(x,y,pw,ph,'PULS'); const bpm=f.heartRate.bpm||0; histories.pulse.push(bpm); histories.pulse=histories.pulse.slice(-40); ctx.fillStyle=bpm>=spec.limits.pulseCritical?red:bpm>=spec.limits.pulseWarning?orange:cyan; ctx.font=`700 ${ph*.24}px system-ui`;ctx.fillText(bpm||'–',x+pw*.06,y+ph*.82);ctx.font=`500 ${ph*.10}px system-ui`;ctx.fillText('BPM',x+pw*.33,y+ph*.82);ctx.strokeStyle=red;ctx.lineWidth=3;ctx.beginPath();histories.pulse.forEach((v,i)=>{const px=x+pw*.35+i/(39)*pw*.58,py=y+ph*.48-(v-(bpm||v))*ph*.01;i?ctx.lineTo(px,py):ctx.moveTo(px,py)});ctx.stroke();
    [x,y,pw,ph]=rect('speed'); panel(x,y,pw,ph,'GESCHWINDIGKEIT'); const speed=f.speed.valueKmh, scale=chooseSpeedScale(speed,speed,spec.limits.speedScales);ctx.strokeStyle=cyan;ctx.lineWidth=6;ctx.beginPath();ctx.arc(x+pw*.5,y+ph*.66,pw*.36,Math.PI*1.1,Math.PI*1.9);ctx.stroke();ctx.fillStyle=spec.theme.white;ctx.font=`700 ${ph*.35}px system-ui`;ctx.textAlign='center';ctx.fillText(Math.round(speed),x+pw*.5,y+ph*.65);ctx.fillStyle=cyan;ctx.font=`600 ${ph*.10}px system-ui`;ctx.fillText('KM/H',x+pw*.5,y+ph*.82);ctx.textAlign='start';ctx.font=`500 ${ph*.06}px system-ui`;ctx.fillText(`0–${scale}`,x+pw*.07,y+ph*.93);
    [x,y,pw,ph]=rect('gDial'); const cx=x+pw/2,cy=y+ph/2,r=Math.min(pw,ph)*.42;ctx.strokeStyle=cyan;ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();for(let i=1;i<4;i++){ctx.strokeStyle='rgba(125,146,154,.45)';ctx.beginPath();ctx.arc(cx,cy,r*i/4,0,Math.PI*2);ctx.stroke();}ctx.strokeStyle='rgba(245,251,255,.7)';ctx.beginPath();ctx.moveTo(cx-r,cy);ctx.lineTo(cx+r,cy);ctx.moveTo(cx,cy-r);ctx.lineTo(cx,cy+r);ctx.stroke();const p=pointerPosition(f.gForce.lateral,f.gForce.vertical,spec.limits.gDisplayRange,cx,cy,r);ctx.strokeStyle=f.gForce.longitudinal<0?orange:cyan;ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.fillStyle=cyan;ctx.beginPath();ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.fill();
    [x,y,pw,ph]=rect('gValues');panel(x,y,pw,ph,'');ctx.font=`600 ${ph*.16}px system-ui`;ctx.fillStyle=spec.theme.muted;['LATERAL','VERTICAL','LONGITUDINAL'].forEach((t,i)=>ctx.fillText(t,x+pw*(.06+i*.33),y+ph*.28));ctx.font=`700 ${ph*.28}px system-ui`;[f.gForce.lateral,f.gForce.vertical,f.gForce.longitudinal].forEach((v,i)=>{ctx.fillStyle=v<0?orange:cyan;ctx.fillText(`${signed(v)} G`,x+pw*(.06+i*.33),y+ph*.73)});
    [x,y,pw,ph]=rect('vibration');panel(x,y,pw,ph,'VIBRATION');const vr=f.vibration.rmsMs2||0;histories.vibration.push(vr);histories.vibration=histories.vibration.slice(-32);ctx.fillStyle=vibrationLevel(vr,spec.limits)==='high'?red:vibrationLevel(vr,spec.limits)==='medium'?orange:cyan;histories.vibration.forEach((v,i)=>ctx.fillRect(x+pw*.07+i*pw*.026,y+ph*.62-Math.min(v/12,1)*ph*.35,pw*.012,Math.min(v/12,1)*ph*.35));ctx.font=`700 ${ph*.20}px system-ui`;ctx.fillText(vr.toFixed(1),x+pw*.38,y+ph*.88);ctx.font=`500 ${ph*.09}px system-ui`;ctx.fillText('m/s²',x+pw*.66,y+ph*.88);
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}
