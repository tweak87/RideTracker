(() => {
  'use strict';

  const state = { blob: null, objectUrl: null, preparing: false, ready: false };
  const byId = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function replayElement() { return byId('replay'); }
  function previewElement() { return byId('preview'); }

  async function leaveRecordingFullscreen() {
    try { await window.RideTrackerRecordingFullscreen?.exit?.(); } catch (_) {}
    const wrap = byId('videoWrap');
    wrap?.classList.remove('rt-app-fullscreen');
    document.body.classList.remove('rt-app-fullscreen-active');
  }

  function replayHasBlob(replay) {
    const src = replay?.currentSrc || replay?.src || '';
    return src.startsWith('blob:') && Number(replay?.duration || 0) >= 0;
  }

  async function waitForReplay(timeoutMs = 7000) {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      const replay = replayElement();
      if (replayHasBlob(replay)) return replay;
      await sleep(100);
    }
    return null;
  }

  async function captureBlob(replay) {
    const src = replay?.currentSrc || replay?.src;
    if (!src?.startsWith('blob:')) return null;
    try {
      const response = await fetch(src);
      return response.ok ? await response.blob() : null;
    } catch (_) {
      return null;
    }
  }

  function ensurePostActions() {
    const meta = byId('videoMeta');
    if (!meta) return null;
    let row = byId('rtPostRecordActions');
    if (!row) {
      row = document.createElement('div');
      row.id = 'rtPostRecordActions';
      row.className = 'rt-post-record';
      row.hidden = true;
      row.innerHTML = '<button type="button" id="rtPreviewLast" disabled>Vorschau wird vorbereitet …</button><button type="button" id="rtSaveRide" class="primary">Fahrt speichern</button><button type="button" id="rtDiscardRide">Verwerfen</button>';
      meta.after(row);
    }
    const previewButton = byId('rtPreviewLast');
    if (previewButton && previewButton.dataset.rtPreview43 !== '1') {
      previewButton.dataset.rtPreview43 = '1';
      previewButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        void playPreview();
      }, true);
    }
    return row;
  }

  function setPreviewReady(ready, message) {
    state.ready = Boolean(ready);
    const row = ensurePostActions();
    if (row) row.hidden = false;
    const button = byId('rtPreviewLast');
    if (button) {
      button.disabled = !ready;
      button.textContent = ready ? 'Vorschau abspielen' : (message || 'Vorschau wird vorbereitet …');
    }
  }

  async function preparePreview() {
    if (state.preparing) return state.ready;
    state.preparing = true;
    state.ready = false;
    setPreviewReady(false, 'Vorschau wird vorbereitet …');
    try {
      await leaveRecordingFullscreen();
      const replay = await waitForReplay();
      if (!replay) {
        setPreviewReady(false, 'Keine Videovorschau verfügbar');
        return false;
      }
      state.blob = await captureBlob(replay);
      replay.controls = true;
      replay.playsInline = true;
      replay.setAttribute('playsinline', '');
      replay.classList.remove('hidden');
      previewElement()?.classList.add('hidden');
      try { replay.load(); } catch (_) {}
      setPreviewReady(true);
      window.dispatchEvent(new CustomEvent('ridetracker:preview-ready', { detail: { hasBlob: Boolean(state.blob) } }));
      return true;
    } finally {
      state.preparing = false;
    }
  }

  async function playPreview() {
    if (!state.ready && !(await preparePreview())) return false;
    const replay = replayElement();
    if (!replay) return false;
    await leaveRecordingFullscreen();
    previewElement()?.classList.add('hidden');
    replay.classList.remove('hidden');
    replay.controls = true;
    replay.muted = false;
    replay.currentTime = 0;
    try {
      await replay.play();
      return true;
    } catch (error) {
      const meta = byId('videoMeta');
      if (meta) meta.textContent = `Vorschau bereit. Wiedergabe konnte nicht automatisch starten: ${error?.message || error}`;
      return false;
    }
  }

  function resetForRecording() {
    state.blob = null;
    state.ready = false;
    const row = ensurePostActions();
    if (row) row.hidden = true;
    const replay = replayElement();
    if (replay) {
      try { replay.pause(); } catch (_) {}
      replay.classList.add('hidden');
      replay.controls = false;
    }
  }

  function installDiagnostics() {
    if (window.__rtDiagnostics43) return;
    window.__rtDiagnostics43 = true;
    window.addEventListener('error', event => {
      const message = String(event?.message || event?.error?.message || 'Unbekannter Fehler');
      console.error('[RideTracker runtime]', { message, source: event?.filename, line: event?.lineno, column: event?.colno, error: event?.error });
    });
    window.addEventListener('unhandledrejection', event => {
      console.error('[RideTracker promise]', event?.reason);
    });
    window.addEventListener('ridetracker:database-error', event => {
      console.error('[RideTracker database]', event?.detail);
    });
  }

  const install = () => {
    ensurePostActions();
    installDiagnostics();
    window.addEventListener('ridetracker:recording-started', resetForRecording);
    window.addEventListener('ridetracker:recording-stopped', () => void preparePreview());
    byId('stop')?.addEventListener('click', () => setTimeout(() => void preparePreview(), 50), true);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();

  window.RideTrackerPostRecording = {
    prepare: preparePreview,
    play: playPreview,
    blob: () => state.blob,
    ready: () => state.ready
  };
})();
