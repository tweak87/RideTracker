(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const state = { route: 'home', installing: false };

  const style = document.createElement('style');
  style.id = 'rtFrontendCleanup46Style';
  style.textContent = `
    #rideDashboard{display:none!important}
    #rtVideoStateBadge[data-mode="live"]{display:none!important}
    body:not([data-rt-route="record"]) #rtVideoStateBadge{display:none!important}
    body[data-rt-route="record"] #rtVideoStateBadge[data-mode="recording"],
    body[data-rt-route="record"] #rtVideoStateBadge[data-mode="preview"]{display:block!important}
  `;
  document.head.appendChild(style);

  function hideLegacyDashboard() {
    const dashboard = byId('rideDashboard');
    if (dashboard) dashboard.style.setProperty('display', 'none', 'important');
  }

  function closeTransientViews() {
    document.querySelectorAll('.rt-view').forEach(view => view.remove());
    document.querySelectorAll('.rt-tool-view,#rtSettingsView,#rtRideLibrary').forEach(view => { view.hidden = true; });
  }

  function setRoute(route) {
    state.route = route;
    document.body.dataset.rtRoute = route;
    hideLegacyDashboard();
    syncVideoBadge();
  }

  function enterHome() {
    setRoute('home');
    closeTransientViews();
    const inline = byId('rtInlineDashboard');
    if (inline) inline.hidden = false;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function enterRecord({ newRide = true } = {}) {
    setRoute('record');
    closeTransientViews();
    byId('rtInlineDashboard')?.setAttribute('hidden', '');
    if (newRide) window.RideTrackerRideLibrary?.newRideSession?.();
    document.querySelector('main')?.style.removeProperty('display');
    window.scrollTo({ top: 0, behavior: 'auto' });
    setTimeout(() => document.querySelector('.controls')?.scrollIntoView({ block: 'start', behavior: 'auto' }), 0);
    window.dispatchEvent(new CustomEvent('ridetracker:record-route-entered', { detail: { newRide } }));
  }

  function syncVideoBadge() {
    const badge = byId('rtVideoStateBadge');
    if (!badge) return;
    const mode = badge.dataset.mode || window.RideTrackerRecordingSession?.mode?.() || 'live';
    const visible = state.route === 'record' && (mode === 'recording' || mode === 'preview');
    badge.style.setProperty('display', visible ? 'block' : 'none', 'important');
  }

  async function syncCameraPlugin() {
    try {
      const plugins = window.RideTrackerWebPlugins;
      if (!plugins?.invoke) return null;
      const runtime = await plugins.invoke('camera-source', 'state');
      window.dispatchEvent(new CustomEvent('ridetracker:camera-runtime-state', { detail: runtime || {} }));
      return runtime;
    } catch (error) {
      console.warn('[RideTracker camera plugin bridge]', error);
      return null;
    }
  }

  function installRecordingPluginBridge() {
    const actions = window.RideTrackerRecordingActions;
    if (!actions || actions.__pluginBridge46) return;
    const wrap = name => {
      const original = actions[name];
      if (typeof original !== 'function') return;
      actions[name] = async (...args) => {
        await syncCameraPlugin();
        const result = await original(...args);
        await syncCameraPlugin();
        return result;
      };
    };
    wrap('startWithVideo');
    wrap('startWithoutVideo');
    wrap('minimizeAndStartVideo');
    actions.__pluginBridge46 = true;
  }

  function routeFromTarget(target) {
    return target?.getAttribute?.('data-inline-route') || target?.getAttribute?.('data-canonical-route') || target?.getAttribute?.('data-route') || '';
  }

  function captureNavigation(event) {
    const target = event.target.closest?.('[data-inline-route],[data-canonical-route],[data-route],.dashAction');
    if (!target) return;
    const route = routeFromTarget(target) || (target.textContent || '').trim();
    if (route === 'Neue Fahrt' || /neue fahrt/i.test(target.textContent || '')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      enterRecord({ newRide: true });
      return;
    }
    if (route === 'Startseite') {
      event.preventDefault();
      event.stopImmediatePropagation();
      enterHome();
      return;
    }
    if (route) setRoute(route.toLowerCase().replace(/\s+/g, '-'));
  }

  function install() {
    if (state.installing) return;
    state.installing = true;
    hideLegacyDashboard();
    const inline = byId('rtInlineDashboard');
    setRoute(inline && !inline.hidden ? 'home' : 'record');
    document.addEventListener('click', captureNavigation, true);
    window.addEventListener('ridetracker:recording-started', () => { setRoute('record'); syncVideoBadge(); void syncCameraPlugin(); });
    window.addEventListener('ridetracker:recording-stopped', () => { setRoute('record'); syncVideoBadge(); void syncCameraPlugin(); });
    window.addEventListener('ridetracker:preview-ready', syncVideoBadge);
    window.addEventListener('ridetracker:ride-saved', syncVideoBadge);
    window.addEventListener('pageshow', () => { hideLegacyDashboard(); syncVideoBadge(); installRecordingPluginBridge(); });
    const observer = new MutationObserver(() => {
      hideLegacyDashboard();
      syncVideoBadge();
      installRecordingPluginBridge();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    installRecordingPluginBridge();

    window.RideTrackerFrontendNavigation = {
      home: enterHome,
      newRide: () => enterRecord({ newRide: true }),
      continueRide: () => enterRecord({ newRide: false }),
      route: () => state.route,
      syncVideoBadge
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})();
