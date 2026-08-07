(() => {
  'use strict';

  const META_KEY = 'rideTracker.savedRides.v2';
  const DRAFT_KEY = 'rideTracker.unsavedRide.v1';
  const readMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY) || '[]'); } catch (_) { return []; } };
  const writeMeta = value => localStorage.setItem(META_KEY, JSON.stringify(value));
  const db = () => window.RideTrackerDatabase;
  const videoStore = () => db()?.stores?.videos || 'videos';

  async function currentRecordedBlob() {
    const fromController = window.RideTrackerPostRecording?.blob?.();
    if (fromController instanceof Blob) return fromController;
    const replay = document.getElementById('replay');
    const src = replay?.currentSrc || replay?.src;
    if (!src?.startsWith('blob:')) return null;
    try { return await fetch(src).then(response => response.ok ? response.blob() : null); } catch (_) { return null; }
  }

  async function saveRide() {
    const database = db();
    if (!database) throw new Error('RideTrackerDatabase ist noch nicht bereit.');
    const id = crypto.randomUUID();
    const blob = await currentRecordedBlob();
    const now = new Date();
    const ride = {
      id,
      createdAt: now.toISOString(),
      title: `Fahrt ${now.toLocaleString('de-DE')}`,
      park: '',
      track: '',
      notes: '',
      comment: '',
      rating: 0,
      hasVideo: Boolean(blob),
      recordingConfiguration: window.RideTrackerRideLibrary?.configurationSnapshot?.() || null
    };
    if (blob) await database.put(videoStore(), id, blob);
    const rides = readMeta();
    rides.unshift(ride);
    writeMeta(rides);
    localStorage.removeItem(DRAFT_KEY);
    document.getElementById('rtPostRecordActions')?.setAttribute('hidden', '');
    window.RideTrackerRideLibrary?.show?.();
    return ride;
  }

  async function playStoredRide(button) {
    const card = button.closest('.rt-ride-card');
    const cards = [...document.querySelectorAll('#rtRideList .rt-ride-card')];
    const index = cards.indexOf(card);
    const ride = readMeta()[index];
    const host = card?.querySelector('.rt-video-host');
    if (!ride || !host) return;
    const blob = await db()?.get(videoStore(), ride.id);
    if (!(blob instanceof Blob)) {
      host.textContent = 'Für diese Fahrt ist kein Video gespeichert.';
      return;
    }
    host.innerHTML = '';
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.src = URL.createObjectURL(blob);
    host.appendChild(video);
    try { await video.play(); } catch (_) {}
  }

  async function deleteStoredRide(button) {
    const card = button.closest('.rt-ride-card');
    const cards = [...document.querySelectorAll('#rtRideList .rt-ride-card')];
    const index = cards.indexOf(card);
    const rides = readMeta();
    const ride = rides[index];
    if (!ride || !confirm('Fahrt endgültig löschen?')) return;
    writeMeta(rides.filter(item => item.id !== ride.id));
    await db()?.delete(videoStore(), ride.id);
    await window.RideTrackerRideLibrary?.render?.();
  }

  document.addEventListener('click', event => {
    const save = event.target.closest?.('#rtSaveRide');
    if (save) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void saveRide().catch(error => window.dispatchEvent(new CustomEvent('ridetracker:database-error', { detail: { message: `Fahrt speichern: ${error?.message || error}` } })));
      return;
    }
    const action = event.target.closest?.('#rtRideLibrary [data-action]');
    if (!action) return;
    if (action.dataset.action === 'play') {
      event.preventDefault(); event.stopImmediatePropagation();
      void playStoredRide(action).catch(error => window.dispatchEvent(new CustomEvent('ridetracker:database-error', { detail: { message: `Video laden: ${error?.message || error}` } })));
    } else if (action.dataset.action === 'delete') {
      event.preventDefault(); event.stopImmediatePropagation();
      void deleteStoredRide(action).catch(error => window.dispatchEvent(new CustomEvent('ridetracker:database-error', { detail: { message: `Fahrt löschen: ${error?.message || error}` } })));
    }
  }, true);

  window.RideTrackerRideMediaStorage = { saveRide, currentRecordedBlob };
})();
