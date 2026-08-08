(() => {
  'use strict';

  const style = document.createElement('style');
  style.id = 'rtRecordingActions40Style';
  style.textContent = `
    #rtRecordingQuickStart{display:grid;gap:10px;margin:10px 0;padding:12px;border:1px solid #29435f;border-radius:16px;background:linear-gradient(180deg,#10243a,#0a1727)}
    #rtRecordingQuickStart[hidden]{display:none!important}
    .rt-quick-status{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.rt-quick-chip{border:1px solid #29435f;background:#071321;border-radius:999px;padding:6px 9px;font-size:12px;color:#96aac1}.rt-quick-chip[data-ok="true"]{color:#9ff0c6;border-color:#2f7257}.rt-quick-actions{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}.rt-quick-actions button{min-height:48px}.rt-quick-help{font-size:12px;color:#96aac1;line-height:1.4}
    @media(max-width:560px){.rt-quick-actions{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const state = { busy: false, priming: null };
  const button = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const recordingActive = () => button('stop')?.disabled === false;
  const videoEnabled = () => !/aus/i.test(button('videoMode')?.textContent || '');
  const initialized = () => /initialisiert/i.test(button('initState')?.textContent || '') && !/nicht initialisiert/i.test(button('initState')?.textContent || '');
  const initializationFailed = () => /fehler/i.test(button('initState')?.textContent || '');
  const cameraReady = () => {
    const stream = document.getElementById('preview')?.srcObject;
    return stream instanceof MediaStream && stream.getVideoTracks().some(track => track.readyState === 'live');
  };
  const videoRecorderActive = () => {
    try { return typeof S !== 'undefined' && S?.recorder?.state === 'recording'; } catch (_) { return false; }
  };
  const calibrated = () => Boolean(window.RideTrackerCalibrationManager?.current?.()) || button('start')?.disabled === false || /kalibriert/i.test(document.getElementById('calState')?.textContent || '');

  function message(text) {
    const meta = document.getElementById('videoMeta');
    if (meta) meta.textContent = text;
    const status = document.getElementById('status');
    if (status && !recordingActive()) status.textContent = text;
  }

  async function waitFor(predicate, timeoutMs = 12000, intervalMs = 80) {
    const started = performance.now();
    while (performance.now() - started < timeoutMs) {
      try { if (predicate()) return true; } catch (_) {}
      await sleep(intervalMs);
    }
    return false;
  }

  function setVideoEnabled(enabled) {
    const toggle = button('videoMode');
    if (!toggle) return;
    if (enabled !== videoEnabled()) toggle.click();
  }

  function primeForUserGesture({ video = true, fullscreen = true } = {}) {
    setVideoEnabled(video);
    if (video && fullscreen) window.RideTrackerRecordingFullscreen?.beginPreparation?.();
    const init = button('init');
    if (!initialized() && init && !init.disabled) {
      // This click must remain in the original tap stack on iOS so the motion,
      // camera and microphone permission sheets are allowed to open.
      init.click();
    } else if (video && initialized() && !cameraReady() && !state.priming) {
      state.priming = Promise.resolve(recoverCamera()).finally(() => { state.priming = null; });
    }
    void window.RideTrackerCompass?.requestPermission?.();
    return state.priming || Promise.resolve(true);
  }

  async function recoverCamera() {
    if (cameraReady()) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      message('Auf diesem Gerät ist kein Kamera-Zugriff verfügbar.');
      return false;
    }
    message('Kamera wird vorbereitet …');
    try {
      const selected = window.RideTrackerCameraSources?.constraints?.();
      const constraints = selected || { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoTracks = stream.getVideoTracks();
      if (!videoTracks.length) throw new Error('Kein Video-Track verfügbar');
      const cameraStream = new MediaStream(videoTracks);
      try {
        if (typeof S !== 'undefined') {
          S.cam?.getTracks?.().forEach(track => track.stop());
          S.cam = cameraStream;
        }
      } catch (_) {}
      const preview = document.getElementById('preview');
      if (preview) {
        preview.srcObject = cameraStream;
        preview.muted = true;
        preview.autoplay = true;
        preview.playsInline = true;
        preview.setAttribute('playsinline', '');
        preview.classList.remove('hidden');
        try { await preview.play(); } catch (_) {}
      }
      const ready = await waitFor(cameraReady, 4000);
      if (!ready) throw new Error('Livebild wurde nicht aktiv');
      window.dispatchEvent(new CustomEvent('ridetracker:camera-ready'));
      message('Kamera bereit.');
      refresh();
      return true;
    } catch (error) {
      message(`Kamera konnte nicht gestartet werden: ${error?.message || error}`);
      return false;
    }
  }

  async function ensureInitialized({ video }) {
    if (!initialized()) {
      const init = button('init');
      if (!init) {
        message('Initialisierungsschaltfläche fehlt.');
        return false;
      }
      if (initializationFailed()) init.disabled = false;
      message('Kamera und Sensoren werden initialisiert …');
      if (!init.disabled) init.click();
      const done = await waitFor(() => initialized() || initializationFailed(), 16000);
      if (!done || !initialized()) {
        message('Initialisierung nicht abgeschlossen. Bitte Berechtigungen für Bewegung, Kamera und Standort prüfen.');
        refresh();
        return false;
      }
    }
    if (video && !cameraReady() && !(await recoverCamera())) {
      refresh();
      return false;
    }
    refresh();
    return true;
  }

  async function canonicalStart({ video = true, minimize = false } = {}) {
    if (state.busy || recordingActive()) return recordingActive();
    state.busy = true;
    try {
      primeForUserGesture({ video, fullscreen:video && !minimize });
      const session = window.RideTrackerRecordingSession;
      if (session?.confirmReplaceBeforeStart && session.confirmReplaceBeforeStart() === false) {
        await window.RideTrackerRecordingFullscreen?.abortPreparation?.();
        refresh();
        return false;
      }

      setVideoEnabled(video);

      // Important on iOS: trigger the base permission flow immediately from the user action.
      const initialization = ensureInitialized({ video });
      if (!(await initialization)) { await window.RideTrackerRecordingFullscreen?.abortPreparation?.(); return false; }

      const calibrationManager = window.RideTrackerCalibrationManager;
      if (calibrationManager && !(await calibrationManager.ensureForStart())) {
        await window.RideTrackerRecordingFullscreen?.abortPreparation?.();
        refresh();
        return false;
      }

      const start = button('start');
      if (!start) {
        message('Aufnahme-Startschaltfläche fehlt.');
        await window.RideTrackerRecordingFullscreen?.abortPreparation?.();
        return false;
      }
      if (start.disabled) {
        message('Aufnahme noch nicht startbereit. Initialisierung und Kalibrierung werden geprüft.');
        await window.RideTrackerRecordingFullscreen?.abortPreparation?.();
        refresh();
        return false;
      }

      window.RideTrackerRecordingSession?.showLive?.();
      start.click();
      const started = await waitFor(recordingActive, 1800);
      if (!started) {
        message('Aufnahme konnte nicht gestartet werden.');
        await window.RideTrackerRecordingFullscreen?.abortPreparation?.();
        refresh();
        return false;
      }

      if (video) {
        const recorderStarted = await waitFor(videoRecorderActive, 2200);
        if (!recorderStarted) {
          button('stop')?.click();
          message('Videoaufnahme konnte nicht gestartet werden. Kamera/MediaRecorder bitte erneut prüfen.');
          await window.RideTrackerRecordingFullscreen?.abortPreparation?.();
          refresh();
          return false;
        }
      }

      window.dispatchEvent(new CustomEvent('ridetracker:canonical-recording-started', { detail: { video, minimize } }));
      if (video && !minimize && window.RideTrackerRecordingFullscreen?.enter) {
        await window.RideTrackerRecordingFullscreen.enter();
      }
      if (minimize) await window.RideTrackerRecordingFullscreen?.exit?.();
      refresh();
      return true;
    } catch (error) {
      if (recordingActive()) button('stop')?.click();
      await window.RideTrackerRecordingFullscreen?.abortPreparation?.();
      message(`Aufnahme konnte nicht gestartet werden: ${error?.message || error}`);
      refresh();
      return false;
    } finally {
      state.busy = false;
    }
  }

  function ensureQuickStart() {
    if (document.getElementById('rtRecordingQuickStart')) return;
    const wrap = document.getElementById('videoWrap');
    const card = wrap?.closest('.rt-record-video-card,.card');
    const controls = document.querySelector('main>.controls');
    const anchor = card || controls;
    if (!anchor) return;
    const panel = document.createElement('section');
    panel.id = 'rtRecordingQuickStart';
    panel.innerHTML = `
      <div><strong>Aufnahmebereit</strong><div class="rt-quick-help">Ein Klick übernimmt Initialisierung, gespeicherte Kalibrierung und Aufnahme. Nur fehlende Berechtigungen oder Sensoren werden nachgefragt.</div></div>
      <div class="rt-quick-status">
        <span class="rt-quick-chip" data-status="camera">Kamera</span>
        <span class="rt-quick-chip" data-status="calibration">Kalibrierung</span>
        <span class="rt-quick-chip" data-status="video">Video</span>
        <span class="rt-quick-chip" data-status="recording">Aufnahme</span>
      </div>
      <div class="rt-quick-actions">
        <button type="button" id="rtQuickStartVideo" class="primary">Fahrt mit Video starten</button>
        <button type="button" id="rtQuickStartNoVideo">Fahrt ohne Video starten</button>
      </div>`;
    if (card) card.before(panel); else controls.after(panel);
    panel.querySelector('#rtQuickStartVideo').onclick = () => canonicalStart({ video: true });
    panel.querySelector('#rtQuickStartNoVideo').onclick = () => canonicalStart({ video: false });
    window.RideTrackerCalibrationManager?.refresh?.();
  }

  function refresh() {
    ensureQuickStart();
    const panel = document.getElementById('rtRecordingQuickStart');
    if (!panel) return;
    const dashboardVisible = document.getElementById('rtInlineDashboard') && !document.getElementById('rtInlineDashboard').hidden;
    panel.hidden = dashboardVisible || !document.body.classList.contains('rt-record-mode');
    const states = {
      camera: cameraReady(),
      calibration: calibrated(),
      video: videoEnabled(),
      recording: recordingActive()
    };
    for (const [name, ok] of Object.entries(states)) {
      const chip = panel.querySelector(`[data-status="${name}"]`);
      if (!chip) continue;
      chip.dataset.ok = String(ok);
      chip.textContent = `${name === 'camera' ? 'Kamera' : name === 'calibration' ? 'Kalibrierung' : name === 'video' ? 'Video' : 'Aufnahme'}: ${ok ? 'bereit' : 'nicht bereit'}`;
    }
    const startVideo = panel.querySelector('#rtQuickStartVideo');
    const startNoVideo = panel.querySelector('#rtQuickStartNoVideo');
    if (startVideo) startVideo.disabled = recordingActive() || state.busy;
    if (startNoVideo) startNoVideo.disabled = recordingActive() || state.busy;
    window.RideTrackerCalibrationManager?.refresh?.();
  }

  document.addEventListener('click', event => {
    const target = event.target.closest?.('button,[role="button"]');
    if (!target || target.id === 'start' || target.id === 'rtQuickStartVideo' || target.id === 'rtQuickStartNoVideo') return;
    const label = (target.textContent || target.getAttribute('aria-label') || '').trim().toLowerCase();
    const isMinimizeAndVideo = /minim/.test(label) && /video/.test(label) && /start/.test(label);
    const isUnifiedStart = target.id === 'unifiedRideStart' || /kalibrieren\s*&\s*fahrt starten/.test(label);
    if (!isMinimizeAndVideo && !isUnifiedStart) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void canonicalStart({ video: isUnifiedStart ? videoEnabled() : true, minimize: isMinimizeAndVideo });
  }, true);

  window.addEventListener('ridetracker:recording-started', refresh);
  window.addEventListener('ridetracker:recording-stopped', refresh);
  window.addEventListener('ridetracker:preview-ready', refresh);
  window.addEventListener('ridetracker:ride-saved', refresh);
  window.addEventListener('ridetracker:ride-discarded', refresh);
  window.addEventListener('ridetracker:database-ready', refresh);
  window.addEventListener('ridetracker:camera-ready', refresh);
  window.addEventListener('ridetracker:calibration-saved', refresh);
  window.addEventListener('ridetracker:calibration-restored', refresh);
  const observer = new MutationObserver(() => requestAnimationFrame(refresh));
  const install = () => {
    ensureQuickStart();
    refresh();
    for (const id of ['start','stop','videoMode','calState','initState','preview']) {
      const node = document.getElementById(id);
      if (node) observer.observe(node, { attributes: true, childList: true, subtree: true });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();

  window.RideTrackerRecordingActions = {
    startWithVideo: () => canonicalStart({ video: true }),
    startWithoutVideo: () => canonicalStart({ video: false }),
    minimizeAndStartVideo: () => canonicalStart({ video: true, minimize: true }),
    ensureInitialized,
    recoverCamera,
    primeForUserGesture,
    refresh
  };
})();
