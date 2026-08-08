(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const state = { route: 'home', installing: false };
  const HOME_ITEMS = [
    ['record','🎢','Neue Fahrt','Aufzeichnung vorbereiten und starten'],
    ['rides','📁','Meine Fahrten','Gespeicherte Fahrten ansehen und bearbeiten'],
    ['map','🗺️','Karte','Parks, Bahnen und aufgezeichnete Strecken'],
    ['statistics','📈','Statistiken','Kilometer, Fahrzeit und Rekorde'],
    ['achievements','🏆','Achievements','Persönliche Meilensteine'],
    ['profile','👤','Profil','Benutzer wechseln und verwalten'],
    ['hud','▣','HUD-Konfiguration','Overlay gestalten und Wasserzeichen verwalten'],
    ['devices','⌁','Geräte & Sensoren','Interne und externe Geräte konfigurieren'],
    ['imports','⇩','Import & Replay','RideSessions, Packages und Videos öffnen'],
    ['settings','⚙️','Einstellungen','Aufnahme, HUD, Sensoren und Profile verwalten']
  ];

  const style = document.createElement('style');
  style.id = 'rtFrontendCleanup46Style';
  style.textContent = `
    #rideDashboard{display:none!important}
    #rtInlineDashboard{position:fixed;inset:0;z-index:2400000;overflow:auto;background:radial-gradient(circle at 50% -12%,#1a4168,#07111f 48%);padding:calc(max(env(safe-area-inset-top),12px) + 82px) 14px max(32px,env(safe-area-inset-bottom));color:#f5fbff}
    #rtInlineDashboard[hidden]{display:none!important}
    #rtInlineDashboard .rt-inline-shell{width:min(820px,100%);margin:auto}
    #rtInlineDashboard .rt-inline-head{display:flex;align-items:start;justify-content:space-between;gap:12px;margin:8px 0 20px}
    #rtInlineDashboard .rt-inline-head h1{font-size:clamp(34px,9vw,58px);margin:0;letter-spacing:-.05em}
    #rtInlineDashboard .rt-inline-head p{margin:7px 0 0;color:#96aac1;line-height:1.45}
    #rtInlineProfile{white-space:nowrap}
    #rtInlineDashboard .rt-inline-menu{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
    #rtInlineDashboard .rt-inline-action{display:grid;grid-template-columns:38px minmax(0,1fr);gap:11px;align-items:center;text-align:left;min-height:92px;padding:14px;border:1px solid #29435f;border-radius:17px;background:linear-gradient(180deg,#17304d,#10233a);color:#f5fbff}
    #rtInlineDashboard .rt-inline-action i{font-style:normal;font-size:25px}
    #rtInlineDashboard .rt-inline-action span{display:grid;gap:4px}
    #rtInlineDashboard .rt-inline-action strong{font-size:16px}
    #rtInlineDashboard .rt-inline-action small{color:#96aac1;font-weight:500;line-height:1.35}
    @media(max-width:620px){#rtInlineDashboard .rt-inline-menu{grid-template-columns:1fr}#rtInlineDashboard .rt-inline-head{display:grid}}
    #rtVideoStateBadge[data-mode="live"]{display:none!important}
    body:not([data-rt-route="record"]) #rtVideoStateBadge{display:none!important}
    body[data-rt-route="record"] #rtVideoStateBadge[data-mode="recording"],
    body[data-rt-route="record"] #rtVideoStateBadge[data-mode="preview"]{display:block!important}
  `;
  document.head.appendChild(style);

  function ensureInlineDashboard() {
    let dashboard = byId('rtInlineDashboard');
    if (dashboard) return dashboard;
    dashboard = document.createElement('section');
    dashboard.id = 'rtInlineDashboard';
    dashboard.innerHTML = `<div class="rt-inline-shell"><header class="rt-inline-head"><div><div class="label">RideTracker Community</div><h1>Deine Fahrt.<br>Unsere Strecke.</h1><p>Aufzeichnen, auswerten und mehrere Fahrten derselben Bahn zuverlässig vergleichen.</p></div><button id="rtInlineProfile" type="button">👤 Profil</button></header><div class="rt-inline-menu">${HOME_ITEMS.map(([id,icon,title,subtitle])=>`<button class="rt-inline-action" type="button" data-inline-route="${title}" data-route-id="${id}"><i>${icon}</i><span><strong>${title}</strong><small>${subtitle}</small></span></button>`).join('')}</div></div>`;
    document.body.appendChild(dashboard);
    return dashboard;
  }

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
    const inline = ensureInlineDashboard();
    inline.hidden = false;
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
    const inline = ensureInlineDashboard();
    hideLegacyDashboard();
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
      syncVideoBadge,
      ensureHome: ensureInlineDashboard
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})();

import('./core/adapters/web-plugin-ui.mjs?v=48').catch(error => console.error('[RideTracker plugin UI]', error));
