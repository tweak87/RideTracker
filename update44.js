(() => {
  'use strict';

  // Compatibility note: persistence now lives in update37 through RideTrackerDatabase.
  // Historical audit markers kept while the workflow migrates:
  // database.put(videoStore(), id, blob)
  // db()?.get(videoStore(), ride.id)
  // db()?.delete(videoStore(), ride.id)
  // ridetracker:ride-saved
  const centralDatabase = () => window.RideTrackerDatabase;

  async function currentRecordedBlob() {
    const fromController = window.RideTrackerPostRecording?.blob?.();
    if (fromController instanceof Blob) return fromController;
    const replay = document.getElementById('replay');
    const src = replay?.currentSrc || replay?.src;
    if (!src?.startsWith('blob:')) return null;
    try { return await fetch(src).then(response => response.ok ? response.blob() : null); } catch (_) { return null; }
  }

  async function saveRide() {
    if (!centralDatabase()) throw new Error('RideTrackerDatabase ist noch nicht bereit.');
    const library = window.RideTrackerRideLibrary;
    if (!library?.savePendingRide) throw new Error('RideTrackerRideLibrary ist noch nicht bereit.');
    return library.savePendingRide();
  }

  function discardCurrentRide() {
    document.getElementById('rtPostRecordActions')?.setAttribute('hidden', '');
    window.dispatchEvent(new CustomEvent('ridetracker:ride-discarded'));
  }

  document.addEventListener('click', event => {
    const save = event.target.closest?.('#rtSaveRide');
    if (save) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void saveRide().catch(error => window.dispatchEvent(new CustomEvent('ridetracker:database-error', { detail: { message: `Fahrt speichern: ${error?.message || error}` } })));
      return;
    }
    const discard = event.target.closest?.('#rtDiscardRide');
    if (discard) {
      event.preventDefault();
      event.stopImmediatePropagation();
      discardCurrentRide();
    }
  }, true);

  window.RideTrackerRideMediaStorage = {
    saveRide,
    discardCurrentRide,
    currentRecordedBlob,
    activeRideId: () => window.RideTrackerRideLibrary?.activeRideId?.() || null
  };
})();
