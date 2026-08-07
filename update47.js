(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '');

  const style = document.createElement('style');
  style.id = 'rtNavigationExport47Style';
  style.textContent = `
    #rtCanonicalDrawer.open ~ #rtVideoStateBadge,#rtInlineDrawer.open ~ #rtVideoStateBadge,#rtNavDrawer.open ~ #rtVideoStateBadge{display:none!important}
    body.rt-navigation-open #rtVideoStateBadge{display:none!important}
    body:not([data-rt-route="record"]) #rtVideoStateBadge{display:none!important}
    .rt-map-grid{display:grid;gap:12px}.rt-map-card{border:1px solid #29435f;border-radius:16px;background:#0c192a;padding:14px}.rt-map-card h3{margin:0 0 4px}.rt-map-card p{margin:0;color:#96aac1;font-size:13px}.rt-map-card canvas{width:100%;height:180px;margin-top:10px;border-radius:12px;background:#07111f}.rt-empty{padding:20px;border:1px dashed #35536f;border-radius:16px;color:#96aac1;text-align:center}
    #rtExportDialog{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:18px}#rtExportDialog[hidden]{display:none!important}.rt-export-card{width:min(520px,100%);border:1px solid #35536f;border-radius:20px;background:#091626;padding:18px;color:#fff;box-shadow:0 24px 80px rgba(0,0,0,.7)}.rt-export-card h2{margin:0 0 6px}.rt-export-card p{color:#96aac1;margin:0 0 14px}.rt-export-actions{display:grid;gap:10px}.rt-export-actions button,.rt-export-actions a{display:block;text-decoration:none;text-align:center;padding:13px;border-radius:13px;border:1px solid #35536f;background:#102436;color:#fff;font-weight:800}.rt-export-actions .primary{background:#5fd0ff;color:#001522;border:0}.rt-export-note{font-size:12px;color:#96aac1;margin-top:10px}
  `;
  document.head.appendChild(style);

  function drawersOpen() {
    return ['rtCanonicalDrawer','rtInlineDrawer','rtNavDrawer'].some(id => byId(id)?.classList.contains('open'));
  }

  function syncNavigationOverlayState() {
    document.body.classList.toggle('rt-navigation-open', drawersOpen());
    const badge = byId('rtVideoStateBadge');
    if (!badge) return;
    const route = document.body.dataset.rtRoute || '';
    const mode = badge.dataset.mode || 'live';
    const visible = route === 'record' && !drawersOpen() && (mode === 'recording' || mode === 'preview');
    badge.style.setProperty('display', visible ? 'block' : 'none', 'important');
  }

  function closeDrawers() {
    for (const id of ['rtCanonicalDrawer','rtInlineDrawer','rtNavDrawer','rtCanonicalScrim','rtInlineScrim','rtNavScrim']) byId(id)?.classList.remove('open');
    syncNavigationOverlayState();
  }

  function closeViews() {
    document.querySelectorAll('.rt-view').forEach(view => view.remove());
    document.querySelectorAll('.rt-tool-view,#rtSettingsView,#rtRideLibrary').forEach(view => { view.hidden = true; });
  }

  function setRoute(name) {
    document.body.dataset.rtRoute = name;
    syncNavigationOverlayState();
  }

  function showHome() {
    closeDrawers(); closeViews(); setRoute('home');
    const dash = byId('rtInlineDashboard'); if (dash) dash.hidden = false;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  async function getRidePackages() {
    const db = window.RideTrackerDatabase;
    if (!db) return [];
    try { return await db.getAll(db.stores.ridePackages) || []; } catch { return []; }
  }

  function gpsPoints(pkg) {
    const samples = Array.isArray(pkg?.document?.samples) ? pkg.document.samples : [];
    return samples.filter(s => Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude))).map(s => ({ lat:Number(s.latitude), lon:Number(s.longitude) }));
  }

  function drawTrack(canvas, points) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width = Math.max(520, Math.floor(canvas.clientWidth * devicePixelRatio));
    const h = canvas.height = Math.max(240, Math.floor(canvas.clientHeight * devicePixelRatio));
    ctx.fillStyle='#07111f';ctx.fillRect(0,0,w,h);
    if (points.length < 2) { ctx.fillStyle='#96aac1';ctx.font=`${14*devicePixelRatio}px system-ui`;ctx.fillText('Keine ausreichenden GPS-Daten',20*devicePixelRatio,32*devicePixelRatio);return; }
    const lat0=points.reduce((a,p)=>a+p.lat,0)/points.length;
    const xy=points.map(p=>({x:p.lon*111320*Math.cos(lat0*Math.PI/180),y:p.lat*111320}));
    const xs=xy.map(p=>p.x),ys=xy.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);const pad=24*devicePixelRatio;const scale=Math.min((w-pad*2)/Math.max(1,maxX-minX),(h-pad*2)/Math.max(1,maxY-minY));
    ctx.strokeStyle='#5fd0ff';ctx.lineWidth=3*devicePixelRatio;ctx.beginPath();xy.forEach((p,i)=>{const x=pad+(p.x-minX)*scale,y=h-pad-(p.y-minY)*scale;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
  }

  async function showMap() {
    closeDrawers(); closeViews(); setRoute('map'); byId('rtInlineDashboard')?.setAttribute('hidden','');
    const rides = await getRidePackages();
    const groups = new Map();
    for (const ride of rides) {
      const park = ride.parkName || ride.document?.parkName || 'Ohne Park';
      const track = ride.rideName || ride.document?.rideName || 'Ohne Bahn';
      const key = `${park}\u0000${track}`;
      if (!groups.has(key)) groups.set(key,{park,track,rides:[]});
      groups.get(key).rides.push(ride);
    }
    const section=document.createElement('section');section.className='rt-view rt-map-view';section.innerHTML=`<div class="rt-shell"><header class="rt-head"><div><h2>Karte</h2><div class="rt-meta">Gespeicherte Parks, Bahnen und Strecken</div></div><button class="rt-back">Hauptmenü</button></header><div class="rt-map-grid">${groups.size?[...groups.entries()].map(([key,g],i)=>`<article class="rt-map-card"><h3>${escapeHtml(g.track)}</h3><p>${escapeHtml(g.park)} · ${g.rides.length} Fahrt${g.rides.length===1?'':'en'}</p><canvas data-map-key="${i}"></canvas></article>`).join(''):'<div class="rt-empty">Noch keine gespeicherten GPS-Strecken vorhanden.</div>'}</div></div>`;
    section.querySelector('.rt-back').onclick=showHome;document.body.appendChild(section);
    [...groups.values()].forEach((g,i)=>drawTrack(section.querySelector(`canvas[data-map-key="${i}"]`),gpsPoints(g.rides.at(-1))));
  }

  function invokeRoute(name) {
    closeDrawers();
    if (name === 'Startseite') return showHome();
    if (name === 'Neue Fahrt') return window.RideTrackerFrontendNavigation?.newRide?.();
    if (name === 'Meine Fahrten' || name === 'Fahrten') { setRoute('rides'); byId('rtInlineDashboard')?.setAttribute('hidden',''); return window.RideTrackerRideLibrary?.show?.(); }
    if (name === 'Karte') return void showMap();
    if (name === 'Statistiken') { setRoute('statistics'); byId('rtInlineDashboard')?.setAttribute('hidden',''); return window.RideTrackerStats?.showStats?.(); }
    if (name === 'Achievements') { setRoute('achievements'); byId('rtInlineDashboard')?.setAttribute('hidden',''); return window.RideTrackerStats?.showAchievements?.(); }
    if (name === 'Profil') { setRoute('profile'); byId('rtInlineDashboard')?.setAttribute('hidden',''); return window.RideTrackerProfiles?.showProfiles?.(); }
    if (name === 'HUD-Konfiguration') { setRoute('hud'); byId('rtInlineDashboard')?.setAttribute('hidden',''); return window.RideTrackerStandaloneHudEditor?.open?.() || window.RideTrackerTools?.showHudConfiguration?.(); }
    if (name === 'Geräte & Sensoren') { setRoute('devices'); byId('rtInlineDashboard')?.setAttribute('hidden',''); return window.RideTrackerDeviceCenter?.open?.(); }
    if (name === 'Import & Replay') { setRoute('imports'); byId('rtInlineDashboard')?.setAttribute('hidden',''); return window.RideTrackerTools?.showImports?.(); }
    if (name === 'Einstellungen') { setRoute('settings'); byId('rtInlineDashboard')?.setAttribute('hidden',''); return window.RideTrackerSettings?.show?.(); }
  }

  function routeName(target) {
    return target?.getAttribute?.('data-inline-route') || target?.getAttribute?.('data-canonical-route') || target?.getAttribute?.('data-route') || '';
  }

  function interceptRoutes(event) {
    const target=event.target.closest?.('[data-inline-route],[data-canonical-route],[data-route]');if(!target)return;
    const name=routeName(target);if(!['Karte','Statistiken','Achievements','Meine Fahrten','Fahrten','Profil','HUD-Konfiguration','Geräte & Sensoren','Import & Replay','Einstellungen'].includes(name))return;
    event.preventDefault();event.stopImmediatePropagation();invokeRoute(name);
  }

  function downloadBlob(blob, filename) {
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }

  function ensureExportDialog() {
    let dialog=byId('rtExportDialog');if(dialog)return dialog;
    dialog=document.createElement('div');dialog.id='rtExportDialog';dialog.hidden=true;dialog.innerHTML='<div class="rt-export-card"><h2>Video exportieren</h2><p>Wähle, ob du nur das Video oder zusätzlich die synchronisierten Sensordaten exportieren möchtest.</p><div class="rt-export-actions"><button id="rtExportVideoOnly" class="primary">Nur Video</button><button id="rtExportWithTelemetry">Video + Sensordaten</button><button id="rtExportCancel">Abbrechen</button></div><div class="rt-export-note">Bei „Video + Sensordaten“ erhältst du das Video und eine zugehörige Ride-JSON-Datei mit Zeitstempeln.</div></div>';document.body.appendChild(dialog);
    byId('rtExportCancel').onclick=()=>{dialog.hidden=true};
    byId('rtExportVideoOnly').onclick=()=>void exportCurrent(false);
    byId('rtExportWithTelemetry').onclick=()=>void exportCurrent(true);
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.hidden=true});
    return dialog;
  }

  async function exportCurrent(includeTelemetry) {
    const plugins=window.RideTrackerWebPlugins;if(!plugins?.invoke)return alert('Export-Plugin ist noch nicht bereit.');
    const video=await plugins.invoke('media-export','rawVideo');if(!(video instanceof Blob))return alert('Keine fertige Videoaufnahme zum Exportieren vorhanden.');
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');const ext=video.type.includes('mp4')?'mp4':'webm';
    if (!includeTelemetry) { downloadBlob(video,`RideTracker-${stamp}.${ext}`);byId('rtExportDialog').hidden=true;return; }
    const telemetry=await plugins.invoke('media-export','telemetry');
    const dialog=ensureExportDialog();const card=dialog.querySelector('.rt-export-card');
    card.innerHTML=`<h2>Export bereit</h2><p>Lade beide Dateien. Die Ride-JSON enthält die Zeitstempel für die Sensordaten.</p><div class="rt-export-actions"><button id="rtExportVideoFile" class="primary">1. Video laden</button><button id="rtExportTelemetryFile">2. Sensordaten laden</button><button id="rtExportDone">Fertig</button></div>`;
    card.querySelector('#rtExportVideoFile').onclick=()=>downloadBlob(video,`RideTracker-${stamp}.${ext}`);
    card.querySelector('#rtExportTelemetryFile').onclick=()=>downloadBlob(new Blob([JSON.stringify(telemetry,null,2)],{type:'application/json'}),`RideTracker-${stamp}.ride.json`);
    card.querySelector('#rtExportDone').onclick=()=>{dialog.remove()};
  }

  function interceptDownload(event) {
    const button=event.target.closest?.('#downloadVideo');if(!button)return;event.preventDefault();event.stopImmediatePropagation();ensureExportDialog().hidden=false;
  }

  function install() {
    document.addEventListener('click',interceptRoutes,true);
    document.addEventListener('click',interceptDownload,true);
    const observer=new MutationObserver(syncNavigationOverlayState);observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','data-mode','data-rt-route']});
    syncNavigationOverlayState();
    window.RideTrackerCanonicalRoutes={invoke:invokeRoute,map:showMap};
    window.RideTrackerMediaExport={open:()=>{ensureExportDialog().hidden=false},exportCurrent};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
