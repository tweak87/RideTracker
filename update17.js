(() => {
  'use strict';

  const META_KEY = 'rideTracker.savedRides.v2';
  const activeProfileId = () => window.RideTrackerProfiles?.activeId?.() || 'local-default';
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const database = () => window.RideTrackerDatabase;

  const readMeta = () => {
    try { const rides = JSON.parse(localStorage.getItem(META_KEY) || '[]'); return Array.isArray(rides) ? rides : []; }
    catch { return []; }
  };
  const writeMeta = rides => localStorage.setItem(META_KEY, JSON.stringify(rides));

  async function ridesForActiveUser() {
    const db = database();
    if (!db) return [];
    const packages = await db.getAll(db.stores.ridePackages);
    const metadata = readMeta();
    const metaById = new Map(metadata.map(ride => [ride.id, ride]));
    return (Array.isArray(packages) ? packages : [])
      .filter(ride => (ride.ownerProfileId || metaById.get(ride.id)?.ownerProfileId || 'local-default') === activeProfileId())
      .map(ride => {
        const meta = metaById.get(ride.id) || {};
        return {
          ...ride,
          title: meta.title || ride.rideName,
          parkName: meta.park || ride.parkName,
          rideName: meta.track || meta.title || ride.rideName,
          rating: Number(meta.rating ?? ride.rating ?? 0),
          notes: meta.notes ?? ride.notes ?? '',
          comment: meta.comment ?? ride.comment ?? ''
        };
      });
  }

  async function saveRideMedia(ride) {
    if (!ride?.id) return;
    const db = database();
    if (!db) throw new Error('RideTrackerDatabase ist noch nicht bereit.');
    ride.updatedAt = new Date().toISOString();
    await db.put(db.stores.ridePackages, ride.id, ride);

    const metadata = readMeta();
    const meta = metadata.find(item => item.id === ride.id);
    if (meta) {
      meta.rating = Number(ride.rating || 0);
      meta.updatedAt = ride.updatedAt;
      writeMeta(metadata);
    }
    window.dispatchEvent(new CustomEvent('ridetracker:ride-saved', { detail: { rideId: ride.id, isNew: false } }));
  }

  function installStyles() {
    if (document.getElementById('rtUx17Style')) return;
    const style = document.createElement('style');
    style.id = 'rtUx17Style';
    style.textContent = `
      .rt-back{position:relative!important;top:auto!important;right:auto!important;z-index:2!important;margin:0!important}
      .rt-head{padding-top:max(16px,env(safe-area-inset-top))!important;padding-right:12px!important;gap:12px!important}
      .rt-recording-banner{position:fixed;left:10px;right:10px;bottom:max(10px,env(safe-area-inset-bottom));z-index:50000;display:none;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #ff7587;border-radius:16px;background:rgba(91,15,31,.96);color:#fff;box-shadow:0 12px 35px rgba(0,0,0,.45);backdrop-filter:blur(14px)}
      .rt-recording-banner.visible{display:flex}.rt-recording-dot{width:10px;height:10px;border-radius:50%;background:#ff405d;box-shadow:0 0 0 0 rgba(255,64,93,.65);animation:rtPulse 1.4s infinite}.rt-recording-copy{flex:1}.rt-recording-copy strong{display:block}.rt-recording-copy span{font-size:12px;opacity:.82}.rt-recording-stop{border:0;border-radius:12px;padding:10px 13px;background:#fff;color:#651426;font-weight:900}
      @keyframes rtPulse{70%{box-shadow:0 0 0 10px rgba(255,64,93,0)}100%{box-shadow:0 0 0 0 rgba(255,64,93,0)}}
      .rt-ride-media-list{display:grid;gap:12px}.rt-ride-media-card{display:grid;grid-template-columns:92px 1fr;gap:12px;padding:12px;border:1px solid #29435f;border-radius:17px;background:#0c192a}.rt-ride-photo{width:92px;height:92px;border-radius:13px;object-fit:cover;background:#111f31}.rt-ride-photo.empty{display:grid;place-items:center;color:#7890aa;font-size:12px;text-align:center}.rt-stars button{font-size:24px;background:transparent;border:0;padding:1px;color:#65778d}.rt-stars button.on{color:#ffc247}.rt-media-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.rt-media-actions label,.rt-media-actions button{display:inline-flex;align-items:center;padding:8px 10px;border:1px solid #38516d;border-radius:10px;background:#11233a;color:#fff;font-weight:700;font-size:12px}.rt-media-actions input{display:none}`;
    document.head.appendChild(style);
  }

  function isRecording() {
    const stop = document.getElementById('stop');
    if (stop && !stop.disabled) return true;
    return [...document.querySelectorAll('button')].some(b => !b.disabled && /Aufnahme stoppen|Fahrt stoppen|Stoppen/.test(b.textContent || ''));
  }

  function stopRecording() {
    const candidates = [document.getElementById('stop'), ...document.querySelectorAll('button')].filter(Boolean);
    const button = candidates.find(b => !b.disabled && /Aufnahme stoppen|Fahrt stoppen|Stoppen/.test(b.textContent || ''));
    button?.click();
  }

  function installRecordingBanner() {
    let banner = document.getElementById('rtRecordingBanner');
    if (!banner) {
      banner = document.createElement('aside');
      banner.id = 'rtRecordingBanner';
      banner.className = 'rt-recording-banner';
      banner.innerHTML = `<span class="rt-recording-dot"></span><div class="rt-recording-copy"><strong>Aufnahme läuft</strong><span>Sensoren und optional Video werden aufgezeichnet.</span></div><button class="rt-recording-stop">Stoppen</button>`;
      banner.querySelector('button').onclick = stopRecording;
      document.body.appendChild(banner);
    }
    setInterval(() => banner.classList.toggle('visible', isRecording()), 250);
  }

  function fileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      if (!file.type.startsWith('image/')) return reject(new Error('Bitte eine Bilddatei auswählen.'));
      if (file.size > 4 * 1024 * 1024) return reject(new Error('Das Bild darf maximal 4 MB groß sein.'));
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
    });
  }

  async function showRideMedia() {
    document.querySelector('.rt-ride-media-view')?.remove();
    const rides = await ridesForActiveUser();
    const section = document.createElement('section');
    section.className = 'rt-view rt-ride-media-view';
    section.innerHTML = `<div class="rt-shell"><header class="rt-head"><div><h2>Bilder & Bewertungen</h2><div class="rt-meta">Persönliche Bahnbilder und Bewertungen</div></div><button class="rt-back">Zurück</button></header><div class="rt-ride-media-list"></div></div>`;
    section.querySelector('.rt-back').onclick = () => section.remove();
    const host = section.querySelector('.rt-ride-media-list');
    if (!rides.length) host.innerHTML = '<p>Noch keine Fahrt bewusst gespeichert. Nach dem Speichern kannst du hier die Bahn bewerten und ein Bild hinterlegen.</p>';
    rides.sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).forEach(ride => {
      const title = ride.rideName || ride.document?.context?.rideName || 'Unbenannte Bahn';
      const park = ride.parkName || ride.document?.context?.parkName || 'Park nicht erkannt';
      const rating = Number(ride.rating || 0);
      const card = document.createElement('article'); card.className = 'rt-ride-media-card';
      card.innerHTML = `${ride.photoDataUrl ? `<img class="rt-ride-photo" alt="${escapeHtml(title)}" src="${ride.photoDataUrl}">` : '<div class="rt-ride-photo empty">Noch kein Bild</div>'}<div><strong>${escapeHtml(title)}</strong><div class="rt-meta">${escapeHtml(park)}</div><div class="rt-stars">${[1,2,3,4,5].map(v=>`<button class="${v<=rating?'on':''}" data-rating="${v}" aria-label="${v} Sterne">★</button>`).join('')}</div><div class="rt-media-actions"><label>Bild auswählen<input type="file" accept="image/*"></label><button class="rt-remove-photo">Bild entfernen</button></div></div>`;
      card.querySelectorAll('[data-rating]').forEach(button => button.onclick = async () => { ride.rating = Number(button.dataset.rating); ride.document = ride.document || {}; ride.document.userRating = ride.rating; await saveRideMedia(ride); showRideMedia(); });
      card.querySelector('input').onchange = async event => { try { ride.photoDataUrl = await fileAsDataURL(event.target.files?.[0]); await saveRideMedia(ride); showRideMedia(); } catch (error) { alert(error.message); } };
      card.querySelector('.rt-remove-photo').onclick = async () => { delete ride.photoDataUrl; await saveRideMedia(ride); showRideMedia(); };
      host.appendChild(card);
    });
    document.body.appendChild(section);
  }

  function addMenuEntry() {
    if (document.getElementById('rtRideMediaMenu')) return;
    const buttons = [...document.querySelectorAll('button')];
    const anchor = buttons.find(b => /Meine Fahrten/.test(b.textContent || ''));
    if (!anchor) return setTimeout(addMenuEntry, 500);
    const button = anchor.cloneNode(true); button.id = 'rtRideMediaMenu';
    button.innerHTML = button.innerHTML.replace('Meine Fahrten', 'Bilder & Bewertungen').replace('Gespeicherte RidePackages und Auswertungen', 'Bahnbilder hinterlegen und Sterne vergeben');
    button.onclick = event => { event.preventDefault(); event.stopPropagation(); showRideMedia(); };
    anchor.parentElement.appendChild(button);
  }

  installStyles(); installRecordingBanner(); addMenuEntry();
  window.RideTrackerRideMedia = { showRideMedia, ridesForActiveUser };
})();
