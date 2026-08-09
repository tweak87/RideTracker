(() => {
  'use strict';

  const PROFILE_KEY = 'RideTrackerProfilesV1';
  const ACTIVE_KEY = 'RideTrackerActiveProfileV1';
  const META_KEY = 'rideTracker.savedRides.v2';
  const DEFAULT_PROFILE = { id: 'local-default', name: 'Standardnutzer', createdAt: new Date().toISOString() };

  const loadProfiles = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) || '[]');
      return Array.isArray(parsed) && parsed.length ? parsed : [DEFAULT_PROFILE];
    } catch { return [DEFAULT_PROFILE]; }
  };
  const saveProfiles = profiles => localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles));
  const activeId = () => localStorage.getItem(ACTIVE_KEY) || loadProfiles()[0].id;
  const activeProfile = () => loadProfiles().find(p => p.id === activeId()) || loadProfiles()[0];
  const setActive = id => { localStorage.setItem(ACTIVE_KEY, id); updateBadge(); };
  const database = () => window.RideTrackerDatabase;

  const readMeta = () => {
    try { const value = JSON.parse(localStorage.getItem(META_KEY) || '[]'); return Array.isArray(value) ? value : []; }
    catch { return []; }
  };
  const writeMeta = rides => localStorage.setItem(META_KEY, JSON.stringify(rides));

  async function allPackages() {
    const db = database();
    if (!db) return [];
    const rides = await db.getAll(db.stores.ridePackages);
    return Array.isArray(rides) ? rides : [];
  }

  async function writePackage(ride) {
    if (!ride?.id) return;
    const db = database();
    if (!db) return;
    await db.put(db.stores.ridePackages, ride.id, ride);
  }

  async function assignRideToProfile(rideId, profileId = activeId()) {
    if (!rideId) return;
    const profile = loadProfiles().find(p => p.id === profileId) || activeProfile();
    const metadata = readMeta();
    const metaRide = metadata.find(r => r.id === rideId);
    if (metaRide) {
      metaRide.ownerProfileId = profileId;
      metaRide.ownerProfileName = profile.name;
      writeMeta(metadata);
    }
    const db = database();
    if (!db) return;
    const ride = await db.get(db.stores.ridePackages, rideId);
    if (!ride) return;
    ride.ownerProfileId = profileId;
    ride.document = ride.document || {};
    ride.document.ownerProfileId = profileId;
    ride.document.owner = { profileID: profileId, displayName: profile.name };
    await writePackage(ride);
  }

  async function assignUnownedTo(profileId) {
    const packages = await allPackages();
    for (const ride of packages) if (!ride.ownerProfileId) await assignRideToProfile(ride.id, profileId);
    const metadata = readMeta();
    let changed = false;
    for (const ride of metadata) {
      if (!ride.ownerProfileId) { ride.ownerProfileId = profileId; ride.ownerProfileName = activeProfile().name; changed = true; }
    }
    if (changed) writeMeta(metadata);
  }

  async function resetActiveStatistics() {
    const profile = activeProfile();
    if (!confirm(`Alle gespeicherten Fahrten, Videos und Statistiken von „${profile.name}“ endgültig löschen?`)) return;
    const db = database();
    const metadata = readMeta();
    const ownedIds = new Set(metadata.filter(r => (r.ownerProfileId || DEFAULT_PROFILE.id) === profile.id).map(r => r.id));
    if (db) {
      const packages = await allPackages();
      for (const ride of packages) if ((ride.ownerProfileId || DEFAULT_PROFILE.id) === profile.id) ownedIds.add(ride.id);
      for (const id of ownedIds) {
        await db.delete(db.stores.ridePackages, id);
        await db.delete(db.stores.videos, id);
      }
    }
    writeMeta(metadata.filter(r => !ownedIds.has(r.id)));
    if (ownedIds.has(window.RideTrackerRideLibrary?.activeRideId?.())) window.RideTrackerRideLibrary?.newRideSession?.();
    document.querySelector('.rt-stats-view')?.remove();
    alert(`${ownedIds.size} Fahrt${ownedIds.size===1?'':'en'} inklusive lokal gespeicherter Videos wurden gelöscht.`);
  }

  async function factoryReset() {
    const first = confirm('RideTracker vollständig zurücksetzen? Dadurch werden ALLE Benutzer, Fahrten, Videos, Sensor-/HUD-Konfigurationen und lokalen App-Daten auf diesem Gerät gelöscht.');
    if (!first) return;
    const second = confirm('Diese Aktion kann nicht rückgängig gemacht werden. Auch alle in RideTracker lokal gespeicherten Video-Dateien/Blobs werden endgültig entfernt. Wirklich fortfahren?');
    if (!second) return;
    try {
      window.RideTrackerHudReplay?.detach?.();
      window.RideTrackerRecordingFullscreen?.stop?.();
      const db = database();
      if (db?.destroy) await db.destroy();
      else if (db) {
        for (const store of Object.values(db.stores || {})) { try { await db.clear?.(store); } catch (_) {} }
      }
      const localKeys = [];
      for (let i=0;i<localStorage.length;i++) localKeys.push(localStorage.key(i));
      localKeys.filter(Boolean).filter(key => key.startsWith('rideTracker.') || key.startsWith('RideTracker')).forEach(key => localStorage.removeItem(key));
      const sessionKeys = [];
      for (let i=0;i<sessionStorage.length;i++) sessionKeys.push(sessionStorage.key(i));
      sessionKeys.filter(Boolean).filter(key => key.startsWith('rideTracker.') || key.startsWith('RideTracker')).forEach(key => sessionStorage.removeItem(key));
      if ('caches' in window) {
        try { for (const name of await caches.keys()) if (/ride.?tracker/i.test(name)) await caches.delete(name); } catch (_) {}
      }
      alert('RideTracker wurde vollständig zurückgesetzt. Die App wird neu geladen.');
      location.reload();
    } catch (error) {
      alert(`Vollständiger Reset fehlgeschlagen: ${error?.message || error}`);
    }
  }

  function style() {
    if (document.getElementById('rtProfileStyle')) return;
    const s = document.createElement('style'); s.id = 'rtProfileStyle';
    s.textContent = `
      .rt-user-badge{position:fixed;right:12px;top:max(12px,env(safe-area-inset-top));z-index:22000;border:1px solid #29435f;background:#0d1a2c;color:#fff;border-radius:999px;padding:9px 13px;font-weight:800}
      .rt-profile-modal{position:fixed!important;inset:0!important;z-index:2147483000!important;display:grid!important;place-items:center!important;background:rgba(0,0,0,.78)!important;padding:max(18px,env(safe-area-inset-top)) 14px max(18px,env(safe-area-inset-bottom))!important;overflow:auto!important}
      .rt-profile-modal .rt-modal-card{width:min(620px,100%)!important;max-height:calc(100dvh - 36px)!important;overflow:auto!important;background:#091626!important;color:#fff!important;border:1px solid #35536f!important;border-radius:20px!important;padding:18px!important;box-shadow:0 24px 80px rgba(0,0,0,.68)!important}
      .rt-profile-modal .rt-modal-card h3{margin:0 0 6px;font-size:24px}.rt-profile-modal .rt-modal-card>p{color:#96aac1;line-height:1.45}
      .rt-profile-list{display:grid;gap:9px}.rt-profile-row{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:12px;border:1px solid #29435f;border-radius:14px;background:#0c192a}.rt-profile-row.active{border-color:#4bbd87}.rt-profile-create{display:flex;gap:8px;margin-top:14px}.rt-profile-create input{flex:1;padding:11px;border-radius:12px;border:1px solid #29435f;background:#081321;color:#fff}.rt-modal-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.rt-modal-actions button,.rt-profile-row button,.rt-profile-create button{border:1px solid #35536f;background:#102436;color:#fff;border-radius:11px;padding:10px 12px;font-weight:800}.rt-danger{background:#7c2634!important}.rt-factory-reset{background:#a20f2d!important;border-color:#ff6680!important}
    `;
    document.head.appendChild(s);
  }

  function updateBadge() {
    let b = document.getElementById('rtUserBadge');
    if (!b) { b = document.createElement('button'); b.id = 'rtUserBadge'; b.className = 'rt-user-badge'; b.onclick = showProfiles; document.body.appendChild(b); }
    b.textContent = `👤 ${activeProfile().name}`;
  }

  function showProfiles() {
    document.querySelector('.rt-profile-modal')?.remove();
    const profiles = loadProfiles();
    const modal = document.createElement('div'); modal.className = 'rt-modal rt-profile-modal';
    modal.innerHTML = `<div class="rt-modal-card"><h3>User-Konfiguration</h3><p>Lokale Profile trennen gespeicherte Fahrten und Statistiken. Hier kannst du einzelne Benutzerdaten oder das komplette Gerät zurücksetzen.</p><div class="rt-profile-list">${profiles.map(p => `<div class="rt-profile-row ${p.id===activeId()?'active':''}"><span><strong>${escapeHtml(p.name)}</strong><br><small>${p.id===activeId()?'Angemeldet':'Lokal gespeichert'}</small></span><button data-login="${p.id}">${p.id===activeId()?'Aktiv':'Anmelden'}</button></div>`).join('')}</div><div class="rt-profile-create"><input id="rtProfileName" placeholder="Neuer Benutzername"><button id="rtCreateProfile">Anlegen</button></div><div class="rt-modal-actions"><button id="rtResetStats" class="rt-danger">Aktuellen Benutzer inkl. Videos zurücksetzen</button><button id="rtFactoryReset" class="rt-factory-reset">Alles zurücksetzen</button><button id="rtCloseProfiles">Schließen</button></div></div>`;
    modal.querySelectorAll('[data-login]').forEach(b => b.onclick = async () => { setActive(b.dataset.login); modal.remove(); location.reload(); });
    modal.querySelector('#rtCreateProfile').onclick = () => {
      const name = modal.querySelector('#rtProfileName').value.trim(); if (!name) return;
      const p = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
      const next = [...loadProfiles(), p]; saveProfiles(next); setActive(p.id); modal.remove(); location.reload();
    };
    modal.querySelector('#rtResetStats').onclick = () => void resetActiveStatistics();
    modal.querySelector('#rtFactoryReset').onclick = () => void factoryReset();
    modal.querySelector('#rtCloseProfiles').onclick = () => modal.remove();
    modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  }

  function escapeHtml(v) { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function installHooks() {
    window.addEventListener('ridetracker:ride-saved', event => { const rideId = event.detail?.rideId; if (rideId) void assignRideToProfile(rideId, activeId()); });
    window.addEventListener('ridetracker:database-ready', () => void assignUnownedTo(activeId()));
  }

  saveProfiles(loadProfiles()); if (!localStorage.getItem(ACTIVE_KEY)) setActive(loadProfiles()[0].id);
  style(); updateBadge(); installHooks();
  window.RideTrackerProfiles = { activeId, activeProfile, showProfiles, resetActiveStatistics, factoryReset, assignRideToProfile };
})();