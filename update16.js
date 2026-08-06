(() => {
  'use strict';

  const PROFILE_KEY = 'RideTrackerProfilesV1';
  const ACTIVE_KEY = 'RideTrackerActiveProfileV1';
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

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('RideTrackerLibrary', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function allRides() {
    const db = await openDB();
    const rides = await new Promise((resolve, reject) => {
      const r = db.transaction('rides', 'readonly').objectStore('rides').getAll();
      r.onsuccess = () => resolve(r.result || []); r.onerror = () => reject(r.error);
    });
    db.close(); return rides;
  }

  async function writeRide(ride) {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('rides', 'readwrite'); tx.objectStore('rides').put(ride);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function assignUnownedTo(profileId) {
    const rides = await allRides();
    for (const ride of rides) {
      if (!ride.ownerProfileId) {
        ride.ownerProfileId = profileId;
        ride.document = ride.document || {};
        ride.document.owner = { profileID: profileId, displayName: activeProfile().name };
        await writeRide(ride);
      }
    }
  }

  async function assignLatestToActive() {
    await new Promise(r => setTimeout(r, 700));
    const rides = (await allRides()).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const latest = rides[0];
    if (!latest) return;
    latest.ownerProfileId = activeId();
    latest.document = latest.document || {};
    latest.document.owner = { profileID: activeId(), displayName: activeProfile().name };
    await writeRide(latest);
  }

  async function resetActiveStatistics() {
    const profile = activeProfile();
    if (!confirm(`Alle lokal gespeicherten Fahrten und Statistiken von „${profile.name}“ löschen?`)) return;
    const db = await openDB();
    const rides = await allRides();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('rides', 'readwrite');
      const store = tx.objectStore('rides');
      rides.filter(r => (r.ownerProfileId || DEFAULT_PROFILE.id) === profile.id).forEach(r => store.delete(r.id));
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
    document.querySelector('.rt-stats-view')?.remove();
    alert('Statistiken und Fahrten dieses Benutzers wurden lokal zurückgesetzt.');
  }

  function style() {
    if (document.getElementById('rtProfileStyle')) return;
    const s = document.createElement('style'); s.id = 'rtProfileStyle';
    s.textContent = `.rt-user-badge{position:fixed;right:12px;top:max(12px,env(safe-area-inset-top));z-index:22000;border:1px solid #29435f;background:#0d1a2c;color:#fff;border-radius:999px;padding:9px 13px;font-weight:800}.rt-profile-list{display:grid;gap:9px}.rt-profile-row{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:12px;border:1px solid #29435f;border-radius:14px;background:#0c192a}.rt-profile-row.active{border-color:#4bbd87}.rt-profile-create{display:flex;gap:8px;margin-top:14px}.rt-profile-create input{flex:1;padding:11px;border-radius:12px;border:1px solid #29435f;background:#081321;color:#fff}.rt-danger{background:#7c2634!important}`;
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
    modal.innerHTML = `<div class="rt-modal-card"><h3>Benutzer</h3><p>Lokale Profile trennen Fahrten, Statistiken und Achievements auf diesem Gerät.</p><div class="rt-profile-list">${profiles.map(p => `<div class="rt-profile-row ${p.id===activeId()?'active':''}"><span><strong>${escapeHtml(p.name)}</strong><br><small>${p.id===activeId()?'Angemeldet':'Lokal gespeichert'}</small></span><button data-login="${p.id}">${p.id===activeId()?'Aktiv':'Anmelden'}</button></div>`).join('')}</div><div class="rt-profile-create"><input id="rtProfileName" placeholder="Neuer Benutzername"><button id="rtCreateProfile">Anlegen</button></div><div class="rt-modal-actions"><button id="rtResetStats" class="rt-danger">Statistiken & Fahrten zurücksetzen</button><button id="rtCloseProfiles">Schließen</button></div></div>`;
    modal.querySelectorAll('[data-login]').forEach(b => b.onclick = async () => { setActive(b.dataset.login); modal.remove(); location.reload(); });
    modal.querySelector('#rtCreateProfile').onclick = () => {
      const name = modal.querySelector('#rtProfileName').value.trim(); if (!name) return;
      const p = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
      const next = [...loadProfiles(), p]; saveProfiles(next); setActive(p.id); modal.remove(); location.reload();
    };
    modal.querySelector('#rtResetStats').onclick = resetActiveStatistics;
    modal.querySelector('#rtCloseProfiles').onclick = () => modal.remove();
    document.body.appendChild(modal);
  }

  function escapeHtml(v) { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function installHooks() {
    document.getElementById('stop')?.addEventListener('click', assignLatestToActive, false);
    document.getElementById('rideSessionImport')?.addEventListener('click', assignLatestToActive, false);
    document.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b && /Statistiken|Achievements|Meine Fahrten|Karte/.test(b.textContent)) assignUnownedTo(activeId());
    }, true);
  }

  saveProfiles(loadProfiles()); if (!localStorage.getItem(ACTIVE_KEY)) setActive(loadProfiles()[0].id);
  style(); updateBadge(); installHooks(); assignUnownedTo(activeId());
  window.RideTrackerProfiles = { activeId, activeProfile, showProfiles, resetActiveStatistics };
})();
