import { readRideSessionFile } from './shared/ride-engine/session-import.js';

const root = document.querySelector('main');
if (root) {
  const section = document.createElement('section');
  section.className = 'grid';
  section.style.marginTop = '12px';
  section.innerHTML = `
    <article class="card wide" id="sessionImportCard">
      <div class="label">Native RideSession importieren</div>
      <div class="help">Importiert <code>*.ride.json</code> aus iOS oder Android. Strecke, Höhenprofil, G-Kräfte, Quality Score und Fahrereignisse werden gemeinsam dargestellt.</div>
      <div class="setupRow" style="margin-top:10px">
        <label><span class="label">RideSession-Datei</span><input id="rideSessionFile" type="file" accept="application/json,.json,.ride.json" style="width:100%;padding:10px;border-radius:12px;border:1px solid var(--l);background:#081321;color:var(--t)"></label>
        <button id="rideSessionImport" class="primary">Session importieren</button>
        <button id="rideSessionClear">Import löschen</button>
      </div>
      <div id="rideSessionStatus" class="videoMeta">Noch keine native Session geladen.</div>
      <div class="summarygrid" id="rideSessionMetrics"></div>
      <div class="charts" style="margin-top:10px">
        <div class="chartbox"><div class="charthead"><b>G-Kräfte mit Ereignissen</b><span>Normal · lateral · longitudinal</span></div><canvas id="rideSessionG" width="900" height="260"></canvas></div>
        <div class="chartbox"><div class="charthead"><b>Streckenprofil</b><span>Bodenlinie · relative Höhe</span></div><canvas id="rideSessionProfile" width="900" height="260"></canvas></div>
      </div>
      <div class="chartbox" style="margin-top:10px"><div class="charthead"><b>2D-Strecke</b><span>GPS-Draufsicht mit Start/Ende</span></div><canvas id="rideSessionMap" width="900" height="420"></canvas></div>
      <div id="rideSessionEvents" class="log" style="margin-top:10px">Keine Ereignisse.</div>
    </article>`;
  root.appendChild(section);
}

let importedSession = null;
const $i = (id) => document.getElementById(id);

$i('rideSessionImport')?.addEventListener('click', async () => {
  const file = $i('rideSessionFile')?.files?.[0];
  if (!file) return setStatus('Bitte zuerst eine RideSession-Datei auswählen.', true);
  try {
    importedSession = await readRideSessionFile(file);
    renderSession(importedSession);
    setStatus(`${file.name} geladen · ${importedSession.samples.length} Samples · ${importedSession.events.length} Ereignisse`);
  } catch (error) {
    setStatus(`Importfehler: ${error.message}`, true);
  }
});

$i('rideSessionClear')?.addEventListener('click', () => {
  importedSession = null;
  $i('rideSessionFile').value = '';
  $i('rideSessionMetrics').innerHTML = '';
  $i('rideSessionEvents').textContent = 'Keine Ereignisse.';
  ['rideSessionG','rideSessionProfile','rideSessionMap'].forEach(clearCanvas);
  setStatus('Import gelöscht.');
});

function setStatus(message, error = false) {
  const node = $i('rideSessionStatus');
  if (!node) return;
  node.textContent = message;
  node.style.color = error ? 'var(--b)' : 'var(--m)';
}

function renderSession(session) {
  const summary = session.summary || {};
  const validGps = session.samples.filter(s => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  const quality = Number(summary.qualityScore ?? session.samples.at(-1)?.qualityScore ?? 0);
  const metrics = [
    ['Quelle', session.source || 'unbekannt'],
    ['Dauer', `${Number(session.durationSeconds || 0).toFixed(1)} s`],
    ['Distanz', `${Number(summary.distanceMeters || 0).toFixed(1)} m`],
    ['Qualität', `${quality}/100`],
    ['Samples', String(session.samples.length)],
    ['GPS-Punkte', String(validGps.length)],
    ['Ereignisse', String(session.events.length)],
    ['Kalibriert', session.calibration?.calibrated ? 'ja' : 'nein'],
  ];
  $i('rideSessionMetrics').innerHTML = metrics.map(([k,v]) => `<div class="summaryitem"><span class="label">${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('');
  $i('rideSessionEvents').textContent = session.events.length
    ? session.events.map(e => `${formatTime(e.timestamp)}  ${e.type}`).join('\n')
    : 'Keine Ereignisse erkannt.';
  drawG(session);
  drawProfile(session);
  drawMap(validGps);
}

function drawG(session) {
  const canvas = $i('rideSessionG');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const data = session.samples.filter(s => Number.isFinite(s.normalG));
  drawFrame(ctx, canvas, -3, 5);
  const duration = Math.max(1, session.durationSeconds || data.at(-1)?.timestamp || 1);
  drawSeries(ctx, canvas, data, 'normalG', -3, 5, duration, '#5fd0ff', 2.5);
  drawSeries(ctx, canvas, data, 'lateralG', -3, 5, duration, '#5ee0a0', 1.5);
  drawSeries(ctx, canvas, data, 'longitudinalG', -3, 5, duration, '#ffd166', 1.5);
  ctx.font = '12px system-ui';
  session.events.forEach((event, index) => {
    const x = 34 + (event.timestamp / duration) * (canvas.width - 52);
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.moveTo(x, 12); ctx.lineTo(x, canvas.height - 28); ctx.stroke();
    ctx.save(); ctx.translate(x + 3, 18 + (index % 3) * 14); ctx.fillStyle = '#fff'; ctx.fillText(event.type, 0, 0); ctx.restore();
  });
}

function drawProfile(session) {
  const canvas = $i('rideSessionProfile');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const points = session.samples.filter(s => Number.isFinite(s.relativeAltitudeM));
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#07101b'; ctx.fillRect(0,0,canvas.width,canvas.height);
  const groundY = canvas.height - 42;
  ctx.fillStyle = '#10291f'; ctx.fillRect(0,groundY,canvas.width,canvas.height-groundY);
  ctx.strokeStyle = 'rgba(95,224,160,.35)';
  for (let x=0;x<canvas.width;x+=50){ctx.beginPath();ctx.moveTo(x,groundY);ctx.lineTo(x+35,canvas.height);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(0,groundY);ctx.lineTo(canvas.width,groundY);ctx.strokeStyle='#5ee0a0';ctx.lineWidth=2;ctx.stroke();
  if (points.length < 2) return;
  const values = points.map(p => p.relativeAltitudeM);
  const min = Math.min(...values), max = Math.max(...values), span = Math.max(1,max-min);
  const duration = Math.max(1, session.durationSeconds || points.at(-1).timestamp || 1);
  ctx.beginPath();
  points.forEach((p,i) => {
    const x = 30 + p.timestamp/duration*(canvas.width-48);
    const y = groundY - 14 - (p.relativeAltitudeM-min)/span*(groundY-42);
    i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
  });
  ctx.strokeStyle='#5fd0ff';ctx.lineWidth=3;ctx.stroke();
  ctx.fillStyle='#cbd9e8';ctx.font='12px system-ui';ctx.fillText(`Höhenspanne ${span.toFixed(1)} m`,34,22);
}

function drawMap(points) {
  const canvas = $i('rideSessionMap');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#07101b';ctx.fillRect(0,0,canvas.width,canvas.height);
  if (points.length < 2) { ctx.fillStyle='#96aac1';ctx.fillText('Keine ausreichenden GPS-Daten.',30,40); return; }
  const lat0 = points.reduce((s,p)=>s+p.latitude,0)/points.length;
  const xy = points.map(p => ({x:(p.longitude-points[0].longitude)*111320*Math.cos(lat0*Math.PI/180), y:(p.latitude-points[0].latitude)*111320}));
  const xs=xy.map(p=>p.x), ys=xy.map(p=>p.y), minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=Math.min((canvas.width-70)/Math.max(1,maxX-minX),(canvas.height-70)/Math.max(1,maxY-minY));
  const project=p=>({x:35+(p.x-minX)*scale,y:canvas.height-35-(p.y-minY)*scale});
  ctx.strokeStyle='rgba(255,255,255,.08)';
  for(let x=35;x<canvas.width;x+=50){ctx.beginPath();ctx.moveTo(x,20);ctx.lineTo(x,canvas.height-20);ctx.stroke();}
  for(let y=35;y<canvas.height;y+=50){ctx.beginPath();ctx.moveTo(20,y);ctx.lineTo(canvas.width-20,y);ctx.stroke();}
  ctx.beginPath();xy.forEach((p,i)=>{const q=project(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});ctx.strokeStyle='#5fd0ff';ctx.lineWidth=4;ctx.stroke();
  const a=project(xy[0]), b=project(xy.at(-1));
  dot(ctx,a,'#5ee0a0','Start');dot(ctx,b,'#ff6680','Ende');
}

function drawFrame(ctx, canvas, min, max) {
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#07101b';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=1;
  for(let i=0;i<5;i++){const y=16+i*(canvas.height-44)/4;ctx.beginPath();ctx.moveTo(34,y);ctx.lineTo(canvas.width-18,y);ctx.stroke();}
  ctx.fillStyle='#96aac1';ctx.font='11px system-ui';ctx.fillText(`${max}g`,4,20);ctx.fillText(`${min}g`,4,canvas.height-30);
}
function drawSeries(ctx,canvas,data,key,min,max,duration,color,width){ctx.beginPath();let drew=false;data.forEach(p=>{const v=Number(p[key]);if(!Number.isFinite(v))return;const x=34+p.timestamp/duration*(canvas.width-52);const y=canvas.height-28-(Math.max(min,Math.min(max,v))-min)/(max-min)*(canvas.height-44);drew?ctx.lineTo(x,y):ctx.moveTo(x,y);drew=true});ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function dot(ctx,p,color,label){ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill();ctx.font='12px system-ui';ctx.fillText(label,p.x+10,p.y-8);}
function clearCanvas(id){const c=$i(id);if(c)c.getContext('2d').clearRect(0,0,c.width,c.height);}
function formatTime(s){const m=Math.floor(s/60);return `${String(m).padStart(2,'0')}:${(s-m*60).toFixed(1).padStart(4,'0')}`;}
function escapeHtml(value){return String(value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
