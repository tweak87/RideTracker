import { readRideSessionFile } from './shared/ride-engine/session-import.js';

const card = document.getElementById('sessionImportCard');
if (card) {
  const block = document.createElement('div');
  block.className = 'chartbox';
  block.style.marginTop = '10px';
  block.innerHTML = `
    <div class="charthead"><b>Synchrones Video-Replay</b><span>Video + RideSession-Zeitachse</span></div>
    <div class="setupRow" style="margin-top:10px">
      <label><span class="label">Zugehörige Videodatei</span><input id="rideVideoFile" type="file" accept="video/*" style="width:100%;padding:10px;border-radius:12px;border:1px solid var(--l);background:#081321;color:var(--t)"></label>
      <label><span class="label">Video-Offset in Sekunden</span><input id="rideVideoOffset" type="number" value="0" step="0.05" style="width:100%;padding:10px;border-radius:12px;border:1px solid var(--l);background:#081321;color:var(--t)"></label>
    </div>
    <div class="videoWrap" style="margin-top:10px"><video id="rideSyncedVideo" playsinline controls></video>
      <div class="hud" id="rideSyncedHud"><div class="hudShell"><div class="hudTop glass"><div class="hudG" id="syncNormal">–</div><div class="hudMeta"><span>Normal G</span><span id="syncPhase">Keine Session</span></div></div><div class="hudBars glass"><div class="metricLine"><span>lateral</span><div class="bar lat"><i id="syncLatBar"></i></div><b id="syncLat">–</b></div><div class="metricLine"><span>long.</span><div class="bar long"><i id="syncLongBar"></i></div><b id="syncLong">–</b></div></div></div><div class="hudStats"><div class="statPill glass"><span>Tempo</span><b id="syncSpeed">–</b></div><div class="statPill glass"><span>Höhe</span><b id="syncHeight">–</b></div><div class="statPill glass"><span>Qualität</span><b id="syncQuality">–</b></div><div class="statPill glass"><span>Zeit</span><b id="syncTime">00:00</b></div></div></div>
    </div>
    <input id="rideSyncScrub" class="scrub" type="range" min="0" max="1000" value="0">
    <div id="rideSyncStatus" class="videoMeta">RideSession und Video auswählen.</div>`;
  card.appendChild(block);
}

const q = id => document.getElementById(id);
let session = null;
let videoURL = null;

q('rideSessionImport')?.addEventListener('click', async () => {
  const file = q('rideSessionFile')?.files?.[0];
  if (!file) return;
  try {
    session = await readRideSessionFile(file);
    q('rideVideoOffset').value = Number(session.video?.startOffsetSeconds || 0).toFixed(2);
    q('rideSyncStatus').textContent = `Session ${String(session.id || '').slice(0,8)} bereit. Jetzt Video auswählen.`;
    updateAt(0);
  } catch (error) {
    q('rideSyncStatus').textContent = `Session für Replay nicht lesbar: ${error.message}`;
  }
});

q('rideVideoFile')?.addEventListener('change', () => {
  const file = q('rideVideoFile').files?.[0];
  if (!file) return;
  if (videoURL) URL.revokeObjectURL(videoURL);
  videoURL = URL.createObjectURL(file);
  const video = q('rideSyncedVideo');
  video.src = videoURL;
  q('rideSyncStatus').textContent = `${file.name} geladen. Offset bei Bedarf korrigieren.`;
});

q('rideSyncedVideo')?.addEventListener('timeupdate', event => {
  const video = event.currentTarget;
  if (video.duration) q('rideSyncScrub').value = String(video.currentTime / video.duration * 1000);
  updateAt(video.currentTime - Number(q('rideVideoOffset')?.value || 0));
});

q('rideSyncScrub')?.addEventListener('input', () => {
  const video = q('rideSyncedVideo');
  if (video.duration) video.currentTime = Number(q('rideSyncScrub').value) / 1000 * video.duration;
});

q('rideVideoOffset')?.addEventListener('input', () => {
  const video = q('rideSyncedVideo');
  updateAt((video?.currentTime || 0) - Number(q('rideVideoOffset').value || 0));
});

function updateAt(time) {
  if (!session?.samples?.length) return;
  const t = Math.max(0, time);
  const sample = nearest(session.samples, t);
  if (!sample) return;
  setText('syncNormal', formatG(sample.normalG));
  setText('syncLat', formatG(sample.lateralG));
  setText('syncLong', formatG(sample.longitudinalG));
  setText('syncSpeed', Number.isFinite(sample.speedMS) ? `${(sample.speedMS*3.6).toFixed(0)} km/h` : '–');
  setText('syncHeight', Number.isFinite(sample.relativeAltitudeM) ? `${sample.relativeAltitudeM.toFixed(1)} m` : '–');
  setText('syncQuality', Number.isFinite(sample.qualityScore) ? `${sample.qualityScore}/100` : '–');
  setText('syncPhase', sample.phase || nearestEvent(t)?.type || 'ride');
  setText('syncTime', formatTime(t));
  setWidth('syncLatBar', sample.lateralG);
  setWidth('syncLongBar', sample.longitudinalG);
  drawCursor(t);
}

function nearest(list, t) {
  let lo=0, hi=list.length-1;
  while (lo < hi) { const m=(lo+hi)>>1; list[m].timestamp < t ? lo=m+1 : hi=m; }
  if (lo>0 && Math.abs(list[lo-1].timestamp-t) < Math.abs(list[lo].timestamp-t)) return list[lo-1];
  return list[lo];
}
function nearestEvent(t){return session.events?.filter(e=>e.timestamp<=t).at(-1) || null;}
function setText(id,value){const n=q(id);if(n)n.textContent=value;}
function setWidth(id,value){const n=q(id);if(n)n.style.width=`${Math.min(100,Math.abs(Number(value)||0)/3*100)}%`;}
function formatG(v){return Number.isFinite(v)?`${v.toFixed(2)}g`:'–';}
function formatTime(s){const m=Math.floor(s/60);return `${String(m).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;}
function drawCursor(t){
  const canvas=q('rideSessionG'); if(!canvas||!session)return;
  const duration=Math.max(1,session.durationSeconds||1),ctx=canvas.getContext('2d');
  const x=34+Math.min(1,t/duration)*(canvas.width-52);
  ctx.save();ctx.strokeStyle='#ff6680';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,12);ctx.lineTo(x,canvas.height-28);ctx.stroke();ctx.restore();
}

// Update 13: app dashboard and unified start flow.
const appMain = document.querySelector('main');
if (appMain && !document.getElementById('rideDashboard')) {
  const style = document.createElement('style');
  style.textContent = `
    #rideDashboard{position:fixed;inset:0;z-index:1000;background:radial-gradient(circle at 50% -10%,#1a4168,#07111f 48%);overflow:auto;padding:calc(24px + env(safe-area-inset-top)) 16px calc(30px + env(safe-area-inset-bottom));color:var(--t)}
    .dashInner{max-width:780px;margin:auto}.dashHero{margin:20px 0 24px}.dashHero h2{font-size:clamp(36px,10vw,64px);margin:0;letter-spacing:-.05em}.dashHero p{color:var(--m);font-size:16px;line-height:1.5}.dashMenu{display:grid;gap:12px}.dashAction{display:flex;align-items:center;text-align:left;gap:14px;width:100%;padding:18px;border-radius:18px;background:linear-gradient(180deg,#17304d,#10233a);border:1px solid var(--l)}.dashAction strong{display:block;font-size:18px}.dashAction small{display:block;color:var(--m);margin-top:4px;font-weight:500}.dashIcon{font-size:28px;width:42px}.dashCommunity{margin-top:22px;padding:16px;border:1px solid var(--l);border-radius:16px;background:#0b192a;color:var(--m);line-height:1.45}.appBack{position:fixed;right:14px;top:calc(12px + env(safe-area-inset-top));z-index:999;display:none}
  `;
  document.head.appendChild(style);
  const dashboard = document.createElement('section');
  dashboard.id = 'rideDashboard';
  dashboard.innerHTML = `<div class="dashInner"><div class="dashHero"><div class="label">RideTracker Community</div><h2>Deine Fahrt.<br>Unsere Strecke.</h2><p>Fahrten aufzeichnen, auswerten und aus mehreren Messungen präzisere Achterbahn-Modelle aufbauen.</p></div><div class="dashMenu"><button class="dashAction" data-view="record"><span class="dashIcon">●</span><span><strong>Neue Fahrt</strong><small>Kalibrierung, Kamera und Sensoren gemeinsam starten</small></span></button><button class="dashAction" data-view="rides"><span class="dashIcon">☷</span><span><strong>Meine Fahrten</strong><small>RidePackages importieren und analysieren</small></span></button><button class="dashAction" data-view="map"><span class="dashIcon">⌖</span><span><strong>Karte</strong><small>Parks, Bahnen und aufgezeichnete Strecken</small></span></button></div><div class="dashCommunity"><b>Community-Ziel</b><br>Mehrfach aufgezeichnete Fahrten werden künftig räumlich ausgerichtet, von Ausreißern bereinigt und zu versionierten Master-Tracks mit Konfidenzwerten zusammengeführt.</div></div>`;
  document.body.appendChild(dashboard);
  const back = document.createElement('button'); back.className='appBack'; back.textContent='Menü'; document.body.appendChild(back);
  const openApp = target => {
    dashboard.style.display='none'; back.style.display='block';
    if(target==='record') document.querySelector('.controls')?.scrollIntoView({behavior:'smooth'});
    if(target==='rides') document.getElementById('sessionImportCard')?.scrollIntoView({behavior:'smooth'});
    if(target==='map') document.getElementById('parkMapCard')?.scrollIntoView({behavior:'smooth'});
  };
  dashboard.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>openApp(button.dataset.view)));
  back.addEventListener('click',()=>{dashboard.style.display='block';back.style.display='none';});
}

const oldControls = document.querySelector('.controls');
if (oldControls && !document.getElementById('unifiedRideStart')) {
  const unified = document.createElement('button');
  unified.id='unifiedRideStart'; unified.className='primary'; unified.textContent='Kalibrieren & Fahrt starten';
  oldControls.prepend(unified);
  unified.addEventListener('click', async () => {
    unified.disabled=true; unified.textContent='Initialisiere …';
    try {
      const init=q('init'), arm=q('arm'), start=q('start');
      if(init && !init.disabled) { init.click(); await waitUntil(()=>!arm?.disabled,12000); }
      if(arm && !arm.disabled) { arm.click(); await new Promise(r=>setTimeout(r,1200)); }
      if(start && !start.disabled) start.click();
      unified.textContent='Aufnahme läuft';
    } catch(error) {
      unified.disabled=false; unified.textContent='Erneut versuchen';
      console.error('Unified ride start failed',error);
    }
  });
  q('stop')?.addEventListener('click',()=>{unified.disabled=false;unified.textContent='Kalibrieren & Fahrt starten';});
}
function waitUntil(predicate, timeout=8000){return new Promise((resolve,reject)=>{const start=Date.now();const timer=setInterval(()=>{if(predicate()){clearInterval(timer);resolve();}else if(Date.now()-start>timeout){clearInterval(timer);reject(new Error('Zeitüberschreitung'));}},100);});}
