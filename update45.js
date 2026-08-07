(() => {
  'use strict';

  const CONTINUE_KEY = 'rideTracker.continueExistingRide.v1';
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
    #videoWrap.rt-session-live #preview,#videoWrap.rt-session-recording #preview{display:block!important;visibility:visible!important;opacity:1!important}
    #videoWrap.rt-session-live #replay,#videoWrap.rt-session-recording #replay{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}
    #videoWrap.rt-session-preview #preview{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}
    #videoWrap.rt-session-preview #replay{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}
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

  function applyModeVisibility() {
    const host = wrap();
    if (!host) return;
    host.classList.toggle('rt-session-live', state.mode === 'live');
    host.classList.toggle('rt-session-recording', state.mode === 'recording');
    host.classList.toggle('rt-session-preview', state.mode === 'preview');

    const live = preview();
    const recorded = replay();
    if (state.mode === 'preview') {
      if (live) {
        live.classList.add('hidden');
        live.style.setProperty('display','none','important');
      }
      if (recorded) {
        recorded.classList.remove('hidden');
        recorded.style.setProperty('display','block','important');
        recorded.controls = true;
        recorded.playsInline = true;
        recorded.setAttribute('playsinline','');
      }
    } else {
      if (recorded) {
        try { recorded.pause(); } catch (_) {}
        recorded.classList.add('hidden');
        recorded.style.setProperty('display','none','important');
        recorded.controls = false;
      }
      if (live) {
        live.classList.remove('hidden');
        live.style.setProperty('display','block','important');
        live.controls = false;
        live.muted = true;
        live.playsInline = true;
        live.setAttribute('playsinline','');
      }
    }
  }

  function setMode(mode) {
    state.mode = mode;
    applyModeVisibility();
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

  function showLive() { setMode('live'); }
  function showReplay() {
    const recorded = replay();
    const src = recorded?.currentSrc || recorded?.src || '';
    if (!recorded || !src) return false;
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

  function markUnsaved() { state.unsaved = true; showReplay(); }
  function markResolved() { state.unsaved = false; showLive(); }

  function handleNewRideNavigation(event) {
    const target = event.target.closest?.('[data-inline-route="record"],.dashAction,[data-route="record"]');
    if (!target) return;
    const label = (target.textContent || '').toLowerCase();
    if (!/neue fahrt|aufzeichnung vorbereiten/.test(label)) return;
    if (sessionStorage.getItem(CONTINUE_KEY) === '1') {
      sessionStorage.removeItem(CONTINUE_KEY);
      return;
    }
    window.RideTrackerRideLibrary?.newRideSession?.();
  }

  const visibilityObserver = new MutationObserver(() => requestAnimationFrame(applyModeVisibility));

  const install = () => {
    ensureBadge();
    const live = preview(), recorded = replay();
    if (live) visibilityObserver.observe(live,{attributes:true,attributeFilter:['class','style','controls']});
    if (recorded) visibilityObserver.observe(recorded,{attributes:true,attributeFilter:['class','style','controls','src']});
    if (window.RideTrackerPostRecording?.ready?.()) {
      state.unsaved = true;
      showReplay();
    } else {
      showLive();
    }
    window.addEventListener('ridetracker:recording-started', () => setMode('recording'));
    window.addEventListener('ridetracker:preview-ready', markUnsaved);
    window.addEventListener('ridetracker:ride-saved', () => { state.unsaved = false; if (state.mode === 'preview') applyModeVisibility(); });
    window.addEventListener('ridetracker:ride-discarded', markResolved);
    document.addEventListener('click', handleNewRideNavigation, true);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true }); else install();

  window.RideTrackerRecordingSession = {
    confirmReplaceBeforeStart,
    showLive,
    showReplay,
    markResolved,
    hasUnsavedRecording: () => state.unsaved,
    mode: () => state.mode,
    enforce: applyModeVisibility
  };
})();
