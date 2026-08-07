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

  const state = { busy: false };
  const button = id => document.getElementById(id);
  const recordingActive = () => button('stop')?.disabled === false;
  const videoEnabled = () => !/aus/i.test(button('videoMode')?.textContent || '');
  const cameraReady = () => {
    const stream = document.getElementById('preview')?.srcObject;
    return stream instanceof MediaStream && stream.getVideoTracks().some(track => track.readyState === 'live');
  };
  const calibrated = () => button('start')?.disabled === false || /kalibriert/i.test(document.getElementById('calState')?.textContent || '');

  function setVideoEnabled(enabled) {
    const toggle = button('videoMode');
    if (!toggle) return;
    if (enabled !== videoEnabled()) toggle.click();
  }

  async function canonicalStart({ video = true, minimize = false } = {}) {
    if (state.busy || recordingActive()) return recordingActive();
    state.busy = true;
    try {
      setVideoEnabled(video);
      const start = button('start');
      if (!start) return false;
      if (start.disabled) {
        document.getElementById('videoMeta')?.replaceChildren(document.createTextNode('Bitte zuerst initialisieren und kalibrieren. Danach kann die Aufnahme gestartet werden.'));
        return false;
      }
      start.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      if (!recordingActive()) return false;
      if (video && window.RideTrackerRecordingFullscreen?.enter) {
        // The fullscreen controller waits until the live camera stream really exists.
        await window.RideTrackerRecordingFullscreen.enter();
      }
      if (minimize) {
        // "Minimieren" means leave the app-owned fullscreen layer while recording continues.
        await window.RideTrackerRecordingFullscreen?.exit?.();
      }
      refresh();
      return true;
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
      <div><strong>Aufnahmebereit</strong><div class="rt-quick-help">Die wichtigsten Schritte bleiben hier sichtbar. Alle erweiterten Einstellungen bleiben weiterhin unter Einstellungen verfügbar.</div></div>
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
    if (startVideo) startVideo.disabled = recordingActive();
    if (startNoVideo) startNoVideo.disabled = recordingActive();
  }

  // Compatibility for existing/custom UI actions such as
  // "Minimieren und Video starten". They are routed to the real #start handler,
  // which is the only path that starts MediaRecorder in the base application.
  document.addEventListener('click', event => {
    const target = event.target.closest?.('button,[role="button"]');
    if (!target || target.id === 'start' || target.id === 'rtQuickStartVideo') return;
    const label = (target.textContent || target.getAttribute('aria-label') || '').trim().toLowerCase();
    const isMinimizeAndVideo = /minim/.test(label) && /video/.test(label) && /start/.test(label);
    if (!isMinimizeAndVideo) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void canonicalStart({ video: true, minimize: true });
  }, true);

  window.addEventListener('ridetracker:recording-started', refresh);
  window.addEventListener('ridetracker:recording-stopped', refresh);
  window.addEventListener('ridetracker:database-ready', refresh);
  const observer = new MutationObserver(() => requestAnimationFrame(refresh));
  const install = () => {
    ensureQuickStart();
    refresh();
    for (const id of ['start','stop','videoMode','calState','preview']) {
      const node = document.getElementById(id);
      if (node) observer.observe(node, { attributes: true, childList: true, subtree: true });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();

  window.RideTrackerRecordingActions = {
    startWithVideo: () => canonicalStart({ video: true }),
    startWithoutVideo: () => canonicalStart({ video: false }),
    minimizeAndStartVideo: () => canonicalStart({ video: true, minimize: true }),
    refresh
  };
})();
