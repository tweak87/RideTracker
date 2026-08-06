(() => {
  'use strict';

  document.addEventListener('click', event => {
    const button = event.target.closest('#rideSessionImport');
    if (!button) return;
    const file = document.getElementById('rideSessionFile')?.files?.[0];
    if (!file) return;
    file.text().then(text => {
      const documentData = JSON.parse(text);
      const samples = Array.isArray(documentData.samples) ? documentData.samples.slice().sort((a,b) => Number(a.timestamp)-Number(b.timestamp)) : [];
      window.__rideTrackerReplaySession = { ...documentData, samples };
    }).catch(error => console.warn('Replay-Telemetrie konnte nicht geladen werden', error));
  }, true);

  async function getRides() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('RideTrackerLibrary', 1);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction('rides', 'readonly').objectStore('rides').getAll();
        read.onsuccess = () => { resolve(read.result || []); db.close(); };
        read.onerror = () => reject(read.error);
      };
      request.onerror = () => reject(request.error);
    });
  }

  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  function aggregate(rides) {
    const parks = new Set(rides.map(r => r.parkName).filter(Boolean));
    const tracks = new Set(rides.map(r => `${r.parkName || ''}|${r.rideName || ''}`).filter(v => v !== '|'));
    return {
      rides: rides.length,
      parks: parks.size,
      tracks: tracks.size,
      distance: rides.reduce((sum, r) => sum + num(r.distanceMeters), 0),
      duration: rides.reduce((sum, r) => sum + num(r.durationSeconds), 0),
      bestQuality: rides.reduce((best, r) => Math.max(best, num(r.qualityScore)), 0),
      maxSpeed: rides.reduce((best, r) => Math.max(best, ...(r.document?.samples || []).map(s => num(s.speedMS) * 3.6)), 0),
      maxG: rides.reduce((best, r) => Math.max(best, ...(r.document?.samples || []).map(s => num(s.totalG))), 0)
    };
  }

  function ensureStyle() {
    if (document.getElementById('rtStatsStyle')) return;
    const style = document.createElement('style'); style.id = 'rtStatsStyle';
    style.textContent = `.rt-metric-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.rt-metric{padding:16px;border:1px solid #29435f;border-radius:16px;background:#0c192a}.rt-metric span{display:block;color:#96aac1;font-size:12px}.rt-metric b{display:block;margin-top:5px;font-size:24px}.rt-achievements{display:grid;gap:10px}.rt-achievement{padding:14px;border:1px solid #29435f;border-radius:15px;background:#0c192a;opacity:.55}.rt-achievement.done{opacity:1;border-color:#4bbd87}.rt-achievement strong{display:block}.rt-achievement span{color:#96aac1;font-size:13px}`;
    document.head.appendChild(style);
  }

  function closeView() { document.querySelector('.rt-stats-view')?.remove(); }
  function createView(title) {
    closeView();
    const section = document.createElement('section'); section.className = 'rt-view rt-stats-view';
    section.innerHTML = `<div class="rt-shell"><header class="rt-head"><div><h2>${title}</h2><div class="rt-meta">Aus lokal gespeicherten Fahrten berechnet</div></div><button class="rt-back">Zurück</button></header><div class="rt-stats-content"></div></div>`;
    section.querySelector('.rt-back').onclick = closeView; document.body.appendChild(section); return section.querySelector('.rt-stats-content');
  }

  async function showStats() {
    const content = createView('Statistiken'), s = aggregate(await getRides());
    const hours = Math.floor(s.duration / 3600), minutes = Math.floor((s.duration % 3600) / 60);
    content.innerHTML = `<div class="rt-metric-grid"><div class="rt-metric"><span>Fahrten</span><b>${s.rides}</b></div><div class="rt-metric"><span>Gesamtstrecke</span><b>${(s.distance/1000).toFixed(2)} km</b></div><div class="rt-metric"><span>Fahrzeit</span><b>${hours} h ${minutes} min</b></div><div class="rt-metric"><span>Parks</span><b>${s.parks}</b></div><div class="rt-metric"><span>Bahnen</span><b>${s.tracks}</b></div><div class="rt-metric"><span>Max. Tempo</span><b>${s.maxSpeed.toFixed(1)} km/h</b></div><div class="rt-metric"><span>Max. Gesamt-G</span><b>${s.maxG.toFixed(2)} g</b></div><div class="rt-metric"><span>Beste Qualität</span><b>${Math.round(s.bestQuality)}/100</b></div></div>`;
  }

  async function showAchievements() {
    const content = createView('Achievements'), s = aggregate(await getRides());
    const items = [['Erste Fahrt','Eine Fahrt speichern',s.rides>=1],['Stammgast','10 Fahrten speichern',s.rides>=10],['Kilometersammler','10 km Gesamtstrecke',s.distance>=10000],['Park Explorer','3 verschiedene Parks besuchen',s.parks>=3],['Coaster Explorer','5 verschiedene Bahnen erfassen',s.tracks>=5],['Datenprofi','Eine Fahrt mit Qualität 90+',s.bestQuality>=90],['High Speed','Mindestens 100 km/h messen',s.maxSpeed>=100],['G-Force','Mindestens 4,0 g messen',s.maxG>=4]];
    content.innerHTML = `<div class="rt-achievements">${items.map(([title,text,done])=>`<article class="rt-achievement ${done?'done':''}"><strong>${done?'✓':'○'} ${title}</strong><span>${text}</span></article>`).join('')}</div>`;
  }

  function addMenuItems() {
    if (document.getElementById('rtStatsMenu')) return;
    const buttons = [...document.querySelectorAll('button')];
    const anchor = buttons.find(b => b.textContent.includes('Parks, Bahnen und aufgezeichnete Strecken')) || buttons.find(b => b.textContent.trim() === 'Karte');
    if (!anchor) return setTimeout(addMenuItems, 500);
    const host = anchor.parentElement;
    const make = (id, title, subtitle, handler) => {
      const button = anchor.cloneNode(true); button.id = id;
      button.innerHTML = button.innerHTML.replace('Karte', title).replace('Parks, Bahnen und aufgezeichnete Strecken', subtitle);
      button.onclick = e => { e.preventDefault(); e.stopPropagation(); handler(); };
      return button;
    };
    host.append(make('rtStatsMenu','Statistiken','Gefahrene Kilometer, Fahrten und Rekorde',showStats), make('rtAchievementMenu','Achievements','Meilensteine und persönliche Erfolge',showAchievements));
  }

  ensureStyle(); addMenuItems();
  window.RideTrackerStats = { showStats, showAchievements };
})();
