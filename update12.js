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
  // Re-render is handled by Update 11; add a high-contrast cursor without changing the data model.
  const duration=Math.max(1,session.durationSeconds||1),ctx=canvas.getContext('2d');
  const x=34+Math.min(1,t/duration)*(canvas.width-52);
  ctx.save();ctx.strokeStyle='#ff6680';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,12);ctx.lineTo(x,canvas.height-28);ctx.stroke();ctx.restore();
}
