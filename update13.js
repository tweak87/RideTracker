(() => {
  'use strict';

  let activeView = null;
  let map = null;
  let mapLayer = null;

  const database = () => window.RideTrackerDatabase;
  const packageStore = () => database()?.stores?.ridePackages || 'ridePackages';

  async function putRide(ride) {
    if (!ride?.id) throw new Error('RidePackage benötigt eine ID.');
    const db = database();
    if (!db) throw new Error('RideTrackerDatabase ist noch nicht bereit.');
    await db.put(packageStore(), ride.id, ride);
    return ride;
  }

  async function getRides() {
    const db = database();
    if (!db) return [];
    const rides = await db.getAll(packageStore());
    return (Array.isArray(rides) ? rides : []).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async function deleteRide(id) {
    const db = database();
    if (!db) return;
    await db.delete(packageStore(), id);
  }

  function normalizeRide(doc, source = 'web') {
    const samples = Array.isArray(doc.samples) ? doc.samples : [];
    const gps = samples
      .filter(s => Number.isFinite(Number(s.latitude ?? s.lat)) && Number.isFinite(Number(s.longitude ?? s.lon)))
      .map(s => ({
        latitude: Number(s.latitude ?? s.lat), longitude: Number(s.longitude ?? s.lon),
        altitude: Number(s.relativeAltitudeM ?? s.relativeAltitude ?? s.gpsAltitude ?? s.alt ?? 0),
        timestamp: Number(s.timestamp ?? s.t ?? 0)
      }));
    const first = gps[0];
    const summary = doc.summary || {};
    return {
      id: String(doc.id || doc.sessionID || crypto.randomUUID()),
      schemaVersion: String(doc.schemaVersion || '2.0.0'),
      createdAt: doc.startedAt || doc.started_at || doc.createdAt || new Date().toISOString(),
      endedAt: doc.endedAt || null,
      platform: doc.platform || source,
      parkName: doc.context?.parkName || doc.park?.name || doc.parkName || 'Unbekannter Park',
      rideName: doc.context?.rideName || doc.ride?.name || doc.rideName || 'Unbenannte Fahrt',
      latitude: Number(doc.context?.latitude ?? first?.latitude ?? NaN),
      longitude: Number(doc.context?.longitude ?? first?.longitude ?? NaN),
      distanceMeters: Number(summary.distanceMeters ?? summary.distance_m ?? doc.distanceMeters ?? 0),
      durationSeconds: Number(summary.durationSeconds ?? summary.duration_s ?? doc.durationSeconds ?? samples.at(-1)?.timestamp ?? samples.at(-1)?.t ?? 0),
      qualityScore: Number(summary.qualityScore ?? doc.qualityScore ?? 0),
      sampleCount: Number(summary.sampleCount ?? samples.length),
      gps,
      document: doc
    };
  }

  function nearestAt(list, t) {
    if (!Array.isArray(list) || !list.length) return null;
    let lo = 0, hi = list.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (Number(list[mid]?.t ?? list[mid]?.timestamp ?? 0) < t) lo = mid + 1; else hi = mid;
    }
    if (lo > 0) {
      const a = Number(list[lo - 1]?.t ?? list[lo - 1]?.timestamp ?? 0);
      const b = Number(list[lo]?.t ?? list[lo]?.timestamp ?? 0);
      if (Math.abs(a - t) <= Math.abs(b - t)) lo--;
    }
    return list[lo] || null;
  }

  function currentWebRide(id = crypto.randomUUID()) {
    try {
      if (typeof S === 'undefined') return null;
      const motion = Array.isArray(S.motion) && S.motion.length
        ? S.motion
        : (Array.isArray(S.samples) ? S.samples.filter(sample => sample?.type === 'motion') : []);
      if (!motion.length) return null;
      const speeds = Array.isArray(S.speed) ? S.speed : [];
      const gpsPoints = Array.isArray(S.gps) ? S.gps : [];
      const samples = motion.map((sample, index) => {
        const timestamp = Number(sample.t ?? sample.timestamp ?? index / 50);
        const speed = nearestAt(speeds, timestamp);
        const gps = nearestAt(gpsPoints, timestamp);
        return {
          timestamp,
          normalG: Number(sample.n ?? sample.normal ?? sample.normalG ?? 0),
          lateralG: Number(sample.l ?? sample.lateral ?? sample.lateralG ?? 0),
          longitudinalG: Number(sample.q ?? sample.longitudinal ?? sample.longitudinalG ?? 0),
          totalG: Number(sample.total ?? sample.totalG ?? Math.hypot(Number(sample.normal ?? 0), Number(sample.lateral ?? 0), Number(sample.longitudinal ?? 0))),
          speedMS: Number(speed?.v ?? 0) / 3.6,
          relativeAltitudeM: Number(sample.height ?? gps?.alt ?? gps?.altitude ?? 0),
          latitude: Number(gps?.lat ?? gps?.latitude ?? NaN),
          longitude: Number(gps?.lon ?? gps?.longitude ?? NaN)
        };
      });
      return normalizeRide({
        id, schemaVersion: '2.1.0', platform: 'web',
        startedAt: S.wall || new Date().toISOString(), samples,
        summary: {
          durationSeconds: Number(S.end || samples.at(-1)?.timestamp || 0),
          sampleCount: samples.length,
          distanceMeters: Number(S.dist || 0),
          maxSpeedKmh: Number(S.sMax || 0),
          qualityScore: 0
        }
      });
    } catch (error) {
      console.warn('RideTracker ride package capture skipped', error);
      return null;
    }
  }

  async function persistCurrentRide(id) {
    const ride = currentWebRide(id);
    if (!ride) return null;
    return putRide(ride);
  }

  function installImportPersistence() {
    const importButton = document.getElementById('rideSessionImport');
    importButton?.addEventListener('click', () => setTimeout(async () => {
      const file = document.getElementById('rideSessionFile')?.files?.[0];
      if (!file) return;
      try { await putRide(normalizeRide(JSON.parse(await file.text()), 'imported')); }
      catch (error) { console.warn('Import konnte nicht lokal gespeichert werden', error); }
    }, 100), true);
  }

  function ensureStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .rt-view{position:fixed;inset:0;z-index:10000;background:#07111f;color:#f5f8fc;overflow:auto;padding:max(18px,env(safe-area-inset-top)) 14px max(28px,env(safe-area-inset-bottom));font-family:system-ui,-apple-system,sans-serif}
      .rt-shell{max-width:1100px;margin:auto}.rt-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.rt-head h2{font-size:clamp(27px,6vw,42px);margin:0}.rt-back{border:1px solid #29435f;background:#14263d;color:#fff;border-radius:12px;padding:10px 14px;font-weight:700}
      .rt-grid{display:grid;gap:12px}.rt-ride{display:grid;grid-template-columns:1fr auto;gap:12px;padding:15px;border:1px solid #29435f;border-radius:16px;background:linear-gradient(180deg,#11233a,#0c192a)}.rt-ride h3{margin:0 0 4px}.rt-meta{color:#96aac1;font-size:13px;line-height:1.55}.rt-actions{display:flex;gap:7px;align-items:start;flex-wrap:wrap}.rt-actions button{padding:8px 10px}.rt-empty{padding:28px;border:1px dashed #29435f;border-radius:16px;color:#96aac1;text-align:center}
      #rtMap{height:min(68vh,720px);border-radius:18px;border:1px solid #29435f;overflow:hidden;background:#0c192a}.rt-map-list{display:grid;gap:8px;margin-top:12px}.rt-park{padding:12px;border:1px solid #29435f;border-radius:14px;background:#0c192a;cursor:pointer}.rt-park strong{display:block}.rt-park span{color:#96aac1;font-size:12px}.rt-import{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.rt-import input{max-width:100%;padding:10px;border:1px solid #29435f;border-radius:12px;background:#0c192a;color:#fff}
      @media(min-width:760px){.rt-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.rt-map-layout{display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:14px}.rt-map-list{margin-top:0;max-height:68vh;overflow:auto}}
    `;
    document.head.appendChild(style);
  }

  function closeView() {
    activeView?.remove(); activeView = null;
    if (map) { map.remove(); map = null; mapLayer = null; }
  }

  function createView(title) {
    closeView();
    const view = document.createElement('section');
    view.className = 'rt-view';
    view.innerHTML = `<div class="rt-shell"><header class="rt-head"><div><h2>${title}</h2><div class="rt-meta">Bewusst gespeicherte oder importierte Fahrten</div></div><button class="rt-back">Zurück</button></header><div class="rt-content"></div></div>`;
    view.querySelector('.rt-back').onclick = closeView;
    document.body.appendChild(view); activeView = view;
    return view.querySelector('.rt-content');
  }

  async function showLibrary() {
    const content = createView('RidePackages');
    content.innerHTML = `<div class="rt-import"><input id="rtImport" type="file" accept=".json,.ride.json,application/json" multiple><button id="rtImportBtn">RidePackages importieren</button></div><div class="rt-grid" id="rtRideGrid"></div>`;
    content.querySelector('#rtImportBtn').onclick = async () => {
      const files = [...content.querySelector('#rtImport').files];
      for (const file of files) {
        try { await putRide(normalizeRide(JSON.parse(await file.text()), 'imported')); } catch (error) { alert(`${file.name}: ${error.message}`); }
      }
      await renderRideGrid(content.querySelector('#rtRideGrid'));
    };
    await renderRideGrid(content.querySelector('#rtRideGrid'));
  }

  async function renderRideGrid(grid) {
    const rides = await getRides();
    if (!rides.length) {
      grid.innerHTML = `<div class="rt-empty">Noch kein RidePackage vorhanden. Fahrten werden nur nach bewusstem Speichern übernommen; JSON-Dateien können oben importiert werden.</div>`;
      return;
    }
    grid.innerHTML = rides.map(r => `<article class="rt-ride"><div><h3>${escapeHTML(r.rideName)}</h3><div class="rt-meta">${escapeHTML(r.parkName)}<br>${formatDate(r.createdAt)} · ${(r.distanceMeters/1000).toFixed(2)} km · ${formatDuration(r.durationSeconds)}<br>${r.sampleCount} Samples · Qualität ${r.qualityScore}/100</div></div><div class="rt-actions"><button data-map="${r.id}">Karte</button><button data-open="${r.id}">Details</button><button data-delete="${r.id}">Löschen</button></div></article>`).join('');
    grid.querySelectorAll('[data-map]').forEach(b => b.onclick = () => showMap(b.dataset.map));
    grid.querySelectorAll('[data-open]').forEach(b => b.onclick = async () => showDetails((await getRides()).find(r => r.id === b.dataset.open)));
    grid.querySelectorAll('[data-delete]').forEach(b => b.onclick = async () => { if (confirm('RidePackage lokal löschen?')) { await deleteRide(b.dataset.delete); await renderRideGrid(grid); } });
  }

  async function showMap(focusId = null) {
    const content = createView('Parks & Strecken');
    content.innerHTML = `<div class="rt-map-layout"><div id="rtMap"></div><div class="rt-map-list" id="rtParkList"></div></div>`;
    await loadLeaflet();
    const rides = await getRides();
    map = L.map('rtMap', { zoomControl: true }).setView([50.5, 10.2], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap-Mitwirkende' }).addTo(map);
    mapLayer = L.featureGroup().addTo(map);
    const valid = rides.filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
    valid.forEach(r => {
      const points = r.gps.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).map(p => [p.latitude, p.longitude]);
      let layer;
      if (points.length > 1) layer = L.polyline(points, { weight: 4 }).addTo(mapLayer);
      else layer = L.marker([r.latitude, r.longitude]).addTo(mapLayer);
      layer.bindPopup(`<b>${escapeHTML(r.rideName)}</b><br>${escapeHTML(r.parkName)}<br>${(r.distanceMeters/1000).toFixed(2)} km`);
      layer._rideId = r.id;
    });
    if (valid.length) map.fitBounds(mapLayer.getBounds().pad(.16));
    const parks = groupParks(rides);
    const list = content.querySelector('#rtParkList');
    list.innerHTML = parks.length ? parks.map(p => `<div class="rt-park" data-ride="${p.rides[0].id}"><strong>${escapeHTML(p.name)}</strong><span>${p.rides.length} Fahrt${p.rides.length === 1 ? '' : 'en'} · ${p.rides.map(r => escapeHTML(r.rideName)).join(', ')}</span></div>`).join('') : `<div class="rt-empty">Noch keine bewusst gespeicherten Fahrten mit gültigen GPS-Punkten vorhanden.</div>`;
    list.querySelectorAll('[data-ride]').forEach(item => item.onclick = () => focusRide(item.dataset.ride));
    if (focusId) setTimeout(() => focusRide(focusId), 50);
  }

  function focusRide(id) {
    mapLayer?.eachLayer(layer => {
      if (layer._rideId === id) {
        if (layer.getBounds) map.fitBounds(layer.getBounds().pad(.3));
        else map.setView(layer.getLatLng(), 17);
        layer.openPopup();
      }
    });
  }

  function showDetails(ride) {
    if (!ride) return;
    const content = createView(ride.rideName);
    content.innerHTML = `<article class="rt-ride"><div><h3>${escapeHTML(ride.parkName)}</h3><div class="rt-meta">${formatDate(ride.createdAt)}<br>Distanz: ${ride.distanceMeters.toFixed(1)} m<br>Dauer: ${formatDuration(ride.durationSeconds)}<br>Samples: ${ride.sampleCount}<br>GPS-Punkte: ${ride.gps.length}<br>Qualität: ${ride.qualityScore}/100<br>Quelle: ${escapeHTML(ride.platform)}</div></div><div class="rt-actions"><button id="rtDetailMap">Auf Karte</button><button id="rtExport">JSON exportieren</button></div></article>`;
    content.querySelector('#rtDetailMap').onclick = () => showMap(ride.id);
    content.querySelector('#rtExport').onclick = () => downloadJSON(ride.document, `${ride.id}.ride.json`);
  }

  function groupParks(rides) {
    const groups = new Map();
    rides.forEach(r => { const name = r.parkName || 'Unbekannter Park'; if (!groups.has(name)) groups.set(name, []); groups.get(name).push(r); });
    return [...groups].map(([name, grouped]) => ({ name, rides: grouped })).sort((a,b) => a.name.localeCompare(b.name));
  }

  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-rt-leaflet]')) {
        const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; css.dataset.rtLeaflet = '1'; document.head.appendChild(css);
      }
      const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    });
  }

  function hookMenu() {
    document.addEventListener('click', event => {
      const button = event.target.closest('button,a,[role="button"]');
      if (!button) return;
      const label = button.textContent.trim().toLowerCase();
      if (label === 'karte' || (label.includes('parks') && label.includes('karte'))) {
        event.preventDefault(); event.stopImmediatePropagation(); showMap();
      }
    }, true);
  }

  function downloadJSON(data, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const formatDate = value => { try { return new Intl.DateTimeFormat('de-DE', { dateStyle:'medium', timeStyle:'short' }).format(new Date(value)); } catch { return String(value); } };
  const formatDuration = seconds => `${Math.floor(Number(seconds||0)/60)}:${String(Math.round(Number(seconds||0)%60)).padStart(2,'0')} min`;

  ensureStyles();
  hookMenu();
  installImportPersistence();
  window.RideTrackerLibrary = { showLibrary, showMap, putRide, getRides, persistCurrentRide, normalizeRide };
})();