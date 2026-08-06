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
})();
