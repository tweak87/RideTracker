(() => {
  'use strict';

  const state = { mode: 'live', unsaved: false, replacing: false };
  const byId = id => document.getElementById(id);
  const wrap = () => byId('videoWrap');
  const preview = () => byId('preview');
  const replay = () => byId('replay');

  const style = document.createElement('style');
  style.id = 'rtRecordingSession45Style';
  style.textContent = `
    #videoWrap{position:relative;overflow:hidden}
    #videoWrap #preview,#videoWrap #replay{width:100%!important;height:100%!important;object-fit:cover!important;object-position:50% 50%!important;background:#000!important}
    #videoWrap #replay:not(.hidden){display:block!important}
    #rtVideoStateBadge{position:absolute;z-index:2147480000;left:12px;bottom:12px;pointer-events:none;border-radius:999px;padding:7px 10px;background:rgba(3,13,20,.78);border:1px solid rgba(255,255,255,.38);color:#fff;font-size:12px;font-weight:850;letter-spacing:.08em;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
    #rtVideoStateBadge[data-mode="recording"]{background:rgba(118,13,31,.88);border-color:rgba(255,93,119,.9)}
    #rtVideoStateBadge[data-mode="preview"]{background:rgba(7,48,61,.88);border-color:#00e5ff}
    #rtVideoStateBadge[data-mode="live"]{background:rgba(6,34,30,.84);border-color:#54d7ad}
    #rtReplaceHint{font-size:12px;color:#96aac1;margin-top:6px}
  `;
  document.head.appendChild(style);

  function ensureBadge() {
    const host = wrap();
    if (!host) return null;
    let badge = byId('rtVideoStateBadge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'rtVideoStateBadge';
      host.appendChild(badge);
    }
    return badge;
  }

  function setMode(mode) {
    state.mode = mode;
    const badge = ensureBadge();
    if (badge) {
      badge.dataset.mode = mode;
      badge.textContent = mode === 'recording' ? '● REC' : mode === 'preview' ? 'VORSCHAU' : 'LIVE';
    }
    const panel = byId('rtRecordingQuickStart');
    const startVideo = byId('rtQuickStartVideo');
    const startNoVideo = byId('rtQuickStartNoVideo');
    if (mode === 'preview') {
      if (startVideo) startVideo.textContent = 'Neue Fahrt mit Video aufnehmen';
      if (startNoVideo) startNoVideo.textContent = 'Neue Fahrt ohne Video aufnehmen';
      let hint = byId('rtReplaceHint');
      if (panel && !hint) {
        hint = document.createElement('div');
        hint.id = 'rtReplaceHint';
        hint.textContent = 'Die letzte Aufnahme bleibt erhalten, bis du sie speicherst, verwirfst oder bewusst durch eine neue Aufnahme ersetzt.';
        panel.appendChild(hint);
      }
    } else {
      if (startVideo) startVideo.textContent = 'Fahrt mit Video starten';
      if (startNoVideo) startNoVideo.textContent = 'Fahrt ohne Video starten';
      byId('rtReplaceHint')?.remove();
    }
  }

  function showLive() {
    const live = preview();
    const recorded = replay();
    if (recorded) {
      try { recorded.pause(); } catch (_) {}
      recorded.classList.add('hidden');
      recorded.controls = false;
    }
    if (live) {
      live.classList.remove('hidden');
      live.controls = false;
      live.muted = true;
      live.playsInline = true;
      live.setAttribute('playsinline', '');
    }
    setMode('live');
  }

  function showReplay() {
    const live = preview();
    const recorded = replay();
    if (!recorded) return false;
    live?.classList.add('hidden');
    recorded.classList.remove('hidden');
    recorded.controls = true;
    recorded.playsInline = true;
    recorded.setAttribute('playsinline', '');
    setMode('preview');
    return true;
  }

  async function confirmReplaceBeforeStart() {
    if (!state.unsaved) return true;
    if (state.replacing) return false;
    state.replacing = true;
    try {
      const replace = window.confirm('Die aktuelle Aufnahme wurde noch nicht gespeichert. Soll sie durch eine neue Aufnahme ersetzt werden?');
      if (!replace) {
        showReplay();
        return false;
      }
      state.unsaved = false;
      window.dispatchEvent(new CustomEvent('ridetracker:recording-replaced'));
      showLive();
      return true;
    } finally {
      state.replacing = false;
    }
  }

  function markUnsaved() {
    state.unsaved = true;
    showReplay();
  }

  function markResolved() {
    state.unsaved = false;
    showLive();
  }

  const install = () => {
    ensureBadge();
    if (window.RideTrackerPostRecording?.ready?.()) {
      state.unsaved = true;
      showReplay();
    } else {
      showLive();
    }
    window.addEventListener('ridetracker:recording-started', () => {
      setMode('recording');
      const recorded = replay();
      if (recorded) { try { recorded.pause(); } catch (_) {} recorded.classList.add('hidden'); }
      preview()?.classList.remove('hidden');
    });
    window.addEventListener('ridetracker:preview-ready', markUnsaved);
    window.addEventListener('ridetracker:ride-saved', markResolved);
    window.addEventListener('ridetracker:ride-discarded', markResolved);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();

  window.RideTrackerRecordingSession = {
    confirmReplaceBeforeStart,
    showLive,
    showReplay,
    markResolved,
    hasUnsavedRecording: () => state.unsaved,
    mode: () => state.mode
  };
})();
