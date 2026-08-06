import { chooseSpeedScale, normalizeFrame, pointerPosition, vibrationLevel } from './shared/overlay/overlay-core.js';

const spec = await fetch('./shared/overlay/overlay-spec.json', { cache: 'no-store' }).then(r => r.json());
const wrap = document.getElementById('videoWrap');
if (wrap) {
  const oldCanvas = document.getElementById('rtSharedOverlay');
  if (oldCanvas) oldCanvas.style.display = 'none';
  const oldToolbar = document.getElementById('rtOverlayToolbar');
  if (oldToolbar) oldToolbar.style.display = 'none';

  const keys = ['pulse','gDial','gValues','speed','vibration','dynamics'];
  const labels = {pulse:'Puls',gDial:'G-Kraft-Kreis',gValues:'G-Achsen',speed:'Geschwindigkeit',vibration:'Vibration',dynamics:'Fahrdynamik'};
  const storageKey = 'rideTracker.hud.configuration.v1';
  const baseProfile = mode => ({
    panelOpacity:.86, globalOpacity:1, fontScale:1, fontFamily:'system-ui,-apple-system,sans-serif',
    elements:Object.fromEntries(keys.map(k=>{ const a=spec.layouts[mode][k]; return [k,{visible:true,x:a[0],y:a[1],width:a[2],height:a[3],scale:1,opacity:1,fontScale:1}]; }))
  });
  const defaults = {version:'1.0.0',profiles:{landscape:baseProfile('landscape'),portrait:baseProfile('portrait')},watermark:{enabled:false,dataUrl:null,x:.82,y:.04,width:.14,opacity:.65}};
  const merge = (a,b) => { for(const [k,v] of Object.entries(b||{})){ if(v&&typeof v==='object'&&!Array.isArray(v)) a[k]=merge(a[k]||{},v); else a[k]=v; } return a; };
  let config = merge(structuredClone(defaults), JSON.parse(localStorage.getItem(storageKey)||'{}'));
  const save = () => localStorage.setItem(storageKey, JSON.stringify(config));

  const style=document.createElement('style'); style.textContent=`
  #rtHudCanvas{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;z-index:45!important;pointer-events:none}
  #rtHudEditorButton{position:absolute;z-index:80;top:8px;left:8px;border:1px solid #00e5ff;border-radius:10px;background:rgba(6,20,22,.9);color:#f5fbff;padding:8px 10px;font:700 11px system-ui}
  #rtHudEditor{position:fixed;z-index:100000;inset:max(8px,env(safe-area-inset-top)) 8px max(8px,env(safe-area-inset-bottom));margin:auto;max-width:560px;background:#07161b;color:#f5fbff;border:1px solid #00e5ff;border-radius:18px;box-shadow:0 18px 70px #000;display:none;overflow:auto;padding:16px;font:14px system-ui}
  #rtHudEditor.open{display:block} #rtHudEditor h2{margin:0 0 8px} #rtHudEditor h3{margin:18px 0 8px;color:#00e5ff}
  #rtHudEditor .row{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;margin:9px 0} #rtHudEditor input[type=range]{width:190px}
  #rtHudEditor select,#rtHudEditor button,#rtHudEditor input[type=file]{background:#102733;color:#fff;border:1px solid #315361;border-radius:9px;padding:8px}
  #rtHudEditor .actions{display:flex;flex-wrap:wrap;gap:8px;position:sticky;bottom:0;background:#07161b;padding:12px 0 2px}
  #rtHudEditor .element{border:1px solid #234047;border-radius:12px;padding:10px;margin:8px 0}
  #rtHudEditor .hint{color:#9db1b8;font-size:12px} #rtHudCanvas.editing{pointer-events:auto;touch-action:none;cursor:move}
  `; document.head.appendChild(style);

  const canvas=document.createElement('canvas'); canvas.id='rtHudCanvas'; wrap.appendChild(canvas); const ctx=canvas.getContext('2d');
  const button=document.createElement('button'); button.id='rtHudEditorButton'; button.textContent='HUD konfigurieren'; wrap.appendChild(button);
  const editor=document.createElement('div'); editor.id='rtHudEditor'; document.body.appendChild(editor);
  let orientation='landscape', content={x:0,y:0,width:1,height:1}, selected='pulse', dragging=null, resizing=false, watermarkImage=new Image();
  const num=id=>Number(String(document.getElementById(id)?.textContent||'').replace(',','.').match(/[-+]?\d+(?:\.\d+)?/)?.[0]||0);
  const signed=v=>`${v>=0?'+':''}${v.toFixed(1)}`;
  const visibleVideo=()=>[...wrap.querySelectorAll('video')].find(v=>getComputedStyle(v).display!=='none'&&!v.classList.contains('hidden')&&(v.videoWidth||v.clientWidth));
  function calcContent(w,h){const v=visibleVideo(),sw=v?.videoWidth||(w>=h?1920:1080),sh=v?.videoHeight||(w>=h?1080:1920),sa=sw/sh,ba=w/h;let x=0,y=0,width=w,height=h;if(ba>sa){height=h;width=h*sa;x=(w-width)/2}else{width=w;height=w/sa;y=(h-height)/2}return{x,y,width,height,aspect:sa};}
  const profile=()=>config.profiles[orientation];
  const er=k=>profile().elements[k];
  function rect(k){const e=er(k),s=e.scale||1,w=e.width*content.width*s,h=e.height*content.height*s;return{x:content.x+e.x*content.width,y:content.y+e.y*content.height,width:w,height:h};}
  const rr=(r,rad)=>{ctx.beginPath();ctx.roundRect?ctx.roundRect(r.x,r.y,r.width,r.height,rad):ctx.rect(r.x,r.y,r.width,r.height)};
  function panel(r,title,e){ctx.save();ctx.globalAlpha=profile().globalOpacity*(e.opacity??1);rr(r,12);ctx.fillStyle=`rgba(6,20,22,${profile().panelOpacity})`;ctx.fill();ctx.strokeStyle='#00e5ff';ctx.lineWidth=2;ctx.stroke();if(title){ctx.fillStyle='#f5fbff';ctx.font=`600 ${Math.max(10,r.height*.075*profile().fontScale*(e.fontScale||1))}px ${profile().fontFamily}`;ctx.fillText(title,r.x+r.width*.06,r.y+r.height*.13)}ctx.restore();}
  function frame(){const s=window.__rideTrackerReplaySession,v=document.getElementById('nativeReplayVideo')||document.getElementById('replay');if(s?.samples?.length&&v&&!v.classList.contains('hidden')){const off=Number(document.getElementById('nativeReplayOffset')?.value||s.video?.startOffsetSeconds||0),t=Math.max(0,(v.currentTime-off)*1000);let p=s.samples[0];for(const q of s.samples){if((q.timestampMs??q.timestamp*1000)>t)break;p=q}return normalizeFrame(p,t)}return normalizeFrame({lateralG:num('latVal'),normalG:num('normalVal')||1,longitudinalG:num('hudLong'),speed:{valueKmh:num('speed')},heartRateBpm:num('heartRateValue')||null,vibrationRmsMs2:num('vibrationValue')},performance.now())}
  let last=null,lastT=0,jerk=0; const vib=[];
  function drawElement(k,f){const e=er(k);if(!e.visible)return;const r=rect(k);ctx.save();ctx.globalAlpha=profile().globalOpacity*(e.opacity??1);const fs=profile().fontScale*(e.fontScale||1),font=profile().fontFamily;
    if(k==='pulse'){panel(r,'PULS',e);const bpm=f.heartRate.bpm||0,col=bpm>=160?'#ff3b30':bpm>=120?'#ffaa20':'#00e5ff';ctx.fillStyle=col;ctx.font=`700 ${r.height*.25*fs}px ${font}`;ctx.fillText(bpm||'–',r.x+r.width*.07,r.y+r.height*.8);ctx.fillStyle='#f5fbff';ctx.font=`500 ${r.height*.1*fs}px ${font}`;ctx.fillText('BPM',r.x+r.width*.36,r.y+r.height*.8)}
    if(k==='speed'){panel(r,'GESCHWINDIGKEIT',e);const val=f.speed.valueKmh||0,max=chooseSpeedScale(val,val,spec.limits.speedScales),cx=r.x+r.width/2,cy=r.y+r.height*.68,rad=r.width*.35,a=Math.PI*1.1,b=Math.PI*1.9;ctx.strokeStyle='#00e5ff';ctx.lineWidth=6;ctx.beginPath();ctx.arc(cx,cy,rad,a,a+(b-a)*Math.min(val/max,1));ctx.stroke();ctx.textAlign='center';ctx.fillStyle='#f5fbff';ctx.font=`700 ${r.height*.34*fs}px ${font}`;ctx.fillText(Math.round(val),cx,r.y+r.height*.66);ctx.fillStyle='#00e5ff';ctx.font=`600 ${r.height*.1*fs}px ${font}`;ctx.fillText('KM/H',cx,r.y+r.height*.84);ctx.textAlign='start'}
    if(k==='gDial'){const cx=r.x+r.width/2,cy=r.y+r.height/2,rad=Math.min(r.width,r.height)*.42;ctx.strokeStyle='#00e5ff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,rad,0,Math.PI*2);ctx.stroke();for(let i=1;i<4;i++){ctx.strokeStyle='rgba(125,146,154,.45)';ctx.beginPath();ctx.arc(cx,cy,rad*i/4,0,Math.PI*2);ctx.stroke()}const p=pointerPosition(f.gForce.lateral,f.gForce.vertical,spec.limits.gDisplayRange,cx,cy,rad);ctx.strokeStyle=f.gForce.longitudinal<0?'#ffaa20':'#00e5ff';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.fillStyle='#00e5ff';ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill()}
    if(k==='gValues'){panel(r,'',e);['LATERAL','VERTICAL','LONGITUDINAL'].forEach((t,i)=>{const x=r.x+r.width*(.05+i*.33),v=[f.gForce.lateral,f.gForce.vertical,f.gForce.longitudinal][i];ctx.fillStyle='#7d929a';ctx.font=`600 ${r.height*.14*fs}px ${font}`;ctx.fillText(t,x,r.y+r.height*.27);ctx.fillStyle=v<0?'#ffaa20':'#00e5ff';ctx.font=`700 ${r.height*.27*fs}px ${font}`;ctx.fillText(`${signed(v)} G`,x,r.y+r.height*.72)})}
    if(k==='vibration'){panel(r,'VIBRATION',e);const v=f.vibration.rmsMs2||0;vib.push(v);if(vib.length>30)vib.shift();ctx.fillStyle=vibrationLevel(v,spec.limits)==='high'?'#ff3b30':vibrationLevel(v,spec.limits)==='medium'?'#ffaa20':'#00e5ff';vib.forEach((n,i)=>{const h=Math.min(n/12,1)*r.height*.38;ctx.fillRect(r.x+r.width*(.07+i*.029),r.y+r.height*.63-h,r.width*.014,h)});ctx.font=`700 ${r.height*.2*fs}px ${font}`;ctx.fillText(v.toFixed(1),r.x+r.width*.38,r.y+r.height*.89)}
    if(k==='dynamics'){panel(r,'FAHRDYNAMIK',e);const now=f.timestampMs;if(last&&now>lastT){const dt=(now-lastT)/1000,dg=Math.hypot(f.gForce.lateral-last.gForce.lateral,f.gForce.vertical-last.gForce.vertical,f.gForce.longitudinal-last.gForce.longitudinal);jerk=dg/Math.max(dt,.001)}last=f;lastT=now;ctx.fillStyle='#00e5ff';ctx.font=`700 ${r.height*.2*fs}px ${font}`;ctx.fillText(`${f.gForce.total.toFixed(2)} G`,r.x+r.width*.06,r.y+r.height*.48);ctx.font=`600 ${r.height*.13*fs}px ${font}`;ctx.fillText(`${jerk.toFixed(1)} G/s`,r.x+r.width*.55,r.y+r.height*.48)}
    if(editor.classList.contains('open')){ctx.setLineDash([6,4]);ctx.strokeStyle=k===selected?'#fff':'rgba(255,255,255,.45)';ctx.lineWidth=k===selected?3:1;ctx.strokeRect(r.x,r.y,r.width,r.height);ctx.setLineDash([])}ctx.restore();}
  function draw(){const b=wrap.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2),pw=Math.max(1,Math.round(b.width*d)),ph=Math.max(1,Math.round(b.height*d));if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph}ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,b.width,b.height);content=calcContent(b.width,b.height);orientation=content.aspect<1?'portrait':'landscape';const f=frame();keys.forEach(k=>drawElement(k,f));if(config.watermark.enabled&&watermarkImage.complete&&watermarkImage.naturalWidth){const w=config.watermark.width*content.width,h=w*watermarkImage.naturalHeight/watermarkImage.naturalWidth;ctx.globalAlpha=config.watermark.opacity;ctx.drawImage(watermarkImage,content.x+config.watermark.x*content.width,content.y+config.watermark.y*content.height,w,h);ctx.globalAlpha=1}requestAnimationFrame(draw)}
  function rebuild(){const p=profile();editor.innerHTML=`<h2>HUD-Editor</h2><div class="hint">Aktives Profil: <b>${orientation==='portrait'?'Hochformat':'Querformat'}</b>. Änderungen werden getrennt gespeichert.</div><h3>Gesamtdesign</h3>
  <div class="row"><label>Panel-Transparenz</label><input data-root="panelOpacity" type="range" min="0" max="1" step=".05" value="${p.panelOpacity}"></div>
  <div class="row"><label>Gesamtdeckkraft</label><input data-root="globalOpacity" type="range" min="0" max="1" step=".05" value="${p.globalOpacity}"></div>
  <div class="row"><label>Globale Schriftgröße</label><input data-root="fontScale" type="range" min=".5" max="2.5" step=".05" value="${p.fontScale}"></div>
  <div class="row"><label>Schriftart</label><select data-root="fontFamily"><option value="system-ui,-apple-system,sans-serif">System</option><option value="Inter,system-ui,sans-serif">Inter</option><option value="Arial,sans-serif">Arial</option><option value="monospace">Monospace</option></select></div>
  <h3>Elemente</h3>${keys.map(k=>{const e=p.elements[k];return `<div class="element"><div class="row"><label><input data-k="${k}" data-p="visible" type="checkbox" ${e.visible?'checked':''}> ${labels[k]}</label><button data-select="${k}">Auswählen</button></div><div class="row"><label>Größe</label><input data-k="${k}" data-p="scale" type="range" min=".25" max="3" step=".05" value="${e.scale}"></div><div class="row"><label>Deckkraft</label><input data-k="${k}" data-p="opacity" type="range" min="0" max="1" step=".05" value="${e.opacity}"></div><div class="row"><label>Schriftgröße</label><input data-k="${k}" data-p="fontScale" type="range" min=".5" max="2.5" step=".05" value="${e.fontScale}"></div></div>`}).join('')}
  <h3>Wasserzeichen</h3><div class="row"><label><input id="rtWmEnabled" type="checkbox" ${config.watermark.enabled?'checked':''}> Logo anzeigen</label><input id="rtWmFile" type="file" accept="image/png,image/jpeg,image/webp"></div><div class="row"><label>Größe</label><input id="rtWmWidth" type="range" min=".03" max=".8" step=".01" value="${config.watermark.width}"></div><div class="row"><label>Transparenz</label><input id="rtWmOpacity" type="range" min="0" max="1" step=".05" value="${config.watermark.opacity}"></div><div class="actions"><button id="rtDragMode">Elemente direkt verschieben</button><button id="rtResetCurrent">Aktuelles Profil zurücksetzen</button><button id="rtExportHud">Konfiguration exportieren</button><button id="rtCloseEditor">Schließen</button></div>`;
  editor.querySelector(`[data-root="fontFamily"]`).value=p.fontFamily;
  editor.querySelectorAll('[data-root]').forEach(i=>i.oninput=()=>{p[i.dataset.root]=i.type==='range'?Number(i.value):i.value;save()});
  editor.querySelectorAll('[data-k]').forEach(i=>i.oninput=()=>{const e=p.elements[i.dataset.k];e[i.dataset.p]=i.type==='checkbox'?i.checked:Number(i.value);save()});
  editor.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>{selected=b.dataset.select;canvas.classList.add('editing')});
  editor.querySelector('#rtWmEnabled').onchange=e=>{config.watermark.enabled=e.target.checked;save()};editor.querySelector('#rtWmWidth').oninput=e=>{config.watermark.width=Number(e.target.value);save()};editor.querySelector('#rtWmOpacity').oninput=e=>{config.watermark.opacity=Number(e.target.value);save()};
  editor.querySelector('#rtWmFile').onchange=e=>{const file=e.target.files[0];if(!file)return;if(file.size>4*1024*1024){alert('Logo maximal 4 MB.');return}const reader=new FileReader();reader.onload=()=>{config.watermark.dataUrl=reader.result;config.watermark.enabled=true;watermarkImage.src=reader.result;save();rebuild()};reader.readAsDataURL(file)};
  editor.querySelector('#rtDragMode').onclick=()=>canvas.classList.toggle('editing');editor.querySelector('#rtResetCurrent').onclick=()=>{config.profiles[orientation]=baseProfile(orientation);save();rebuild()};editor.querySelector('#rtExportHud').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(config,null,2)],{type:'application/json'}));a.download='RideTracker-HUD-Konfiguration.json';a.click();URL.revokeObjectURL(a.href)};editor.querySelector('#rtCloseEditor').onclick=()=>{editor.classList.remove('open');canvas.classList.remove('editing')};}
  button.onclick=()=>{editor.classList.add('open');rebuild()};
  function point(e){const r=canvas.getBoundingClientRect(),t=e.touches?.[0]||e;return{x:t.clientX-r.left,y:t.clientY-r.top}}
  canvas.addEventListener('pointerdown',e=>{if(!canvas.classList.contains('editing'))return;const p=point(e);for(const k of [...keys].reverse()){const r=rect(k);if(p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height){selected=k;dragging={x:p.x,y:p.y,ex:er(k).x,ey:er(k).y};canvas.setPointerCapture(e.pointerId);break}}});
  canvas.addEventListener('pointermove',e=>{if(!dragging)return;const p=point(e),el=er(selected);el.x=Math.max(0,Math.min(1-el.width*el.scale,dragging.ex+(p.x-dragging.x)/content.width));el.y=Math.max(0,Math.min(1-el.height*el.scale,dragging.ey+(p.y-dragging.y)/content.height));save()});canvas.addEventListener('pointerup',()=>dragging=null);
  if(config.watermark.dataUrl)watermarkImage.src=config.watermark.dataUrl;
  requestAnimationFrame(draw);
}
