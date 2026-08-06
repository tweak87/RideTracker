(() => {
  'use strict';

  const banner = document.getElementById('rtRecordingBanner');
  if (!banner) return;

  const style = document.createElement('style');
  style.id = 'rtRecordingStateStyle';
  style.textContent = `
    #rtRecordingBanner:not(.verified-recording){display:none!important}
    #rtRecordingBanner .rt-recording-time{display:block;font-variant-numeric:tabular-nums;font-weight:800;margin-top:2px}
    #rtRecordingBanner.starting .rt-recording-dot{background:#ffd166;animation:none}
  `;
  document.head.appendChild(style);

  const copy = banner.querySelector('.rt-recording-copy');
  const detail = copy?.querySelector('span');
  const stopButton = banner.querySelector('.rt-recording-stop');
  let state = 'idle';
  let startedAt = 0;
  let confirmTimer = null;

  const statusText = () => (document.getElementById('status')?.textContent || '').trim().toLowerCase();
  const dotActive = () => document.getElementById('dot')?.classList.contains('on') === true;
  const stopEnabled = () => {
    const stop = document.getElementById('stop');
    return Boolean(stop && !stop.disabled);
  };
  const sampleCount = () => {
    const raw = document.getElementById('positiveCount')?.textContent || '0';
    return Number.parseInt(raw.replace(/\D/g, ''), 10) || 0;
  };

  function coreConfirmsRecording() {
    const text = statusText();
    const explicitIdle = /bereit|gestoppt|beendet|fehler|abgebrochen|nicht initialisiert/.test(text);
    const explicitActive = /aufnahme|aufzeichnung|läuft|recording|fahrt läuft/.test(text);
    return !explicitIdle && stopEnabled() && (dotActive() || explicitActive || sampleCount() > 0);
  }

  function setState(next) {
    if (state === next) return;
    state = next;
    banner.classList.toggle('verified-recording', next === 'recording');
    banner.classList.toggle('starting', next === 'starting');
    if (next === 'recording') {
      startedAt = performance.now();
      if (detail) detail.innerHTML = 'Sensoren und optional Video werden aufgezeichnet.<b class="rt-recording-time">00:00</b>';
    } else {
      startedAt = 0;
      if (detail) detail.textContent = next === 'starting' ? 'Aufnahme wird initialisiert …' : 'Sensoren und optional Video werden aufgezeichnet.';
    }
  }

  function requestStartVerification() {
    if (state === 'recording' || state === 'starting') return;
    setState('starting');
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      if (!coreConfirmsRecording()) setState('idle');
    }, 12000);
  }

  function requestStop() {
    setState('stopping');
    const stop = document.getElementById('stop');
    if (stop && !stop.disabled) stop.click();
    setTimeout(() => setState(coreConfirmsRecording() ? 'recording' : 'idle'), 150);
  }

  stopButton?.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    requestStop();
  }, true);

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const text = (button.textContent || '').trim();
    if (/Mit Video|Ohne Video|Kalibrieren & Fahrt starten|\bStart\b/.test(text) && !/Stop/.test(text)) requestStartVerification();
    if (/Aufnahme stoppen|Fahrt stoppen|^Stoppen$/.test(text) && button !== stopButton) setTimeout(() => setState('idle'), 0);
  }, true);

  setInterval(() => {
    const confirmed = coreConfirmsRecording();
    if (confirmed && state !== 'recording') setState('recording');
    if (!confirmed && state === 'recording') setState('idle');

    if (state === 'recording' && startedAt && detail) {
      const seconds = Math.max(0, Math.floor((performance.now() - startedAt) / 1000));
      const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      const node = detail.querySelector('.rt-recording-time');
      if (node) node.textContent = time;
    }
  }, 250);

  setState('idle');
  window.RideTrackerRecordingState = { get state() { return state; }, isRecording: coreConfirmsRecording };
})();
