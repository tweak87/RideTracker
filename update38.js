(() => {
  'use strict';

  const KNOWN_TRANSIENTS = [
    '#rtStandaloneHudEditor',
    '#rtDeviceCenter',
    '.rt-home-panel',
    '#rtNavScrim',
    '#rtNavDrawer'
  ];
  const MENU_ITEMS = [
    ['🎢','Neue Fahrt','Aufzeichnung vorbereiten und starten'],
    ['📁','Meine Fahrten','Gespeicherte Fahrten ansehen und bearbeiten'],
    ['🗺️','Karte','Parks, Bahnen und aufgezeichnete Strecken'],
    ['📈','Statistiken','Kilometer, Fahrzeit und Rekorde'],
    ['🏆','Achievements','Persönliche Meilensteine'],
    ['👤','Profil','Benutzer wechseln und verwalten'],
    ['▣','HUD-Konfiguration','Overlay gestalten und Wasserzeichen verwalten'],
    ['⌁','Geräte & Sensoren','Interne und externe Geräte konfigurieren'],
    ['⇩','Import & Replay','RideSessions, Packages und Videos öffnen'],
    ['⚙️','Einstellungen','Aufnahme, HUD, Sensoren und Profile verwalten']
  ];

  function ensureVisibleShell() {
    for (const node of [document.documentElement, document.body]) {
      node?.style.removeProperty('display');
      node?.style.removeProperty('visibility');
      node?.style.removeProperty('opacity');
    }
    const main = document.querySelector('main');
    if (main) {
      main.style.removeProperty('visibility');
      main.style.removeProperty('opacity');
      if (getComputedStyle(main).display === 'none') main.style.display = 'block';
    }
  }

  function closeStaleTransientViews() {
    for (const selector of KNOWN_TRANSIENTS) {
      document.querySelectorAll(selector).forEach(node => {
        node.classList.remove('open');
        if (selector === '#rtStandaloneHudEditor' || selector === '#rtDeviceCenter' || selector === '.rt-home-panel') node.style.removeProperty('display');
      });
    }
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      document.documentElement.style.removeProperty('overflow');
      document.body.style.removeProperty('overflow');
    }
  }

  function closeViews() {
    document.querySelectorAll('.rt-view').forEach(view => view.remove());
    document.querySelectorAll('.rt-tool-view,#rtSettingsView,#rtRideLibrary').forEach(view => { view.hidden = true; });
  }

  function activeProfileName() {
    try { return window.RideTrackerProfiles?.activeProfile?.()?.name || 'Standardnutzer'; }
    catch { return 'Standardnutzer'; }
  }

  function closeCanonicalDrawer() {
    document.getElementById('rtCanonicalDrawer')?.classList.remove('open');
    document.getElementById('rtCanonicalScrim')?.classList.remove('open');
  }

  function goHome() {
    closeCanonicalDrawer();
    closeStaleTransientViews();
    closeViews();
    ensureVisibleShell();
    const dashboard = document.getElementById('rideDashboard');
    if (dashboard) {
      dashboard.style.setProperty('display','block','important');
      dashboard.style.setProperty('visibility','visible','important');
      dashboard.style.setProperty('opacity','1','important');
    }
    document.querySelector('.appBack')?.style.setProperty('display','none','important');
    window.scrollTo({top:0,behavior:'auto'});
  }

  function showRecord() {
    closeCanonicalDrawer();
    closeViews();
    document.getElementById('rideDashboard')?.style.setProperty('display','none','important');
    ensureVisibleShell();
    window.scrollTo({top:0,behavior:'auto'});
    setTimeout(() => document.querySelector('.controls')?.scrollIntoView({block:'start'}), 0);
  }

  function dashboardButton(view) {
    return document.querySelector(`#rideDashboard [data-view="${view}"]`);
  }

  function route(name) {
    closeCanonicalDrawer();
    if (name === 'Startseite') return goHome();
    if (name === 'Neue Fahrt') return showRecord();
    if (name === 'Meine Fahrten') {
      if (window.RideTrackerRideLibrary?.show) return window.RideTrackerRideLibrary.show();
      if (window.RideTrackerTools?.showRides) return window.RideTrackerTools.showRides();
      return dashboardButton('rides')?.click();
    }
    if (name === 'Karte') return dashboardButton('map')?.click();
    if (name === 'Statistiken') return window.RideTrackerStats?.showStats?.();
    if (name === 'Achievements') return window.RideTrackerStats?.showAchievements?.();
    if (name === 'Profil') return window.RideTrackerProfiles?.showProfiles?.();
    if (name === 'HUD-Konfiguration') return window.RideTrackerStandaloneHudEditor?.open?.() || window.RideTrackerTools?.showHudConfiguration?.();
    if (name === 'Geräte & Sensoren') return window.RideTrackerDeviceCenter?.open?.();
    if (name === 'Import & Replay') return window.RideTrackerTools?.showImports?.();
    if (name === 'Einstellungen') return window.RideTrackerSettings?.show?.();
  }

  function ensureCanonicalShell() {
    if (!document.getElementById('rtCanonicalShellStyle')) {
      const style = document.createElement('style');
      style.id = 'rtCanonicalShellStyle';
      style.textContent = `
        .rt-global-menu,.appBack{display:none!important}
        #rideDashboard{padding-top:calc(max(env(safe-area-inset-top),12px) + 78px)!important}
        #rtCanonicalBar{position:fixed;top:0;left:0;right:0;z-index:2500000;height:calc(max(env(safe-area-inset-top),12px) + 58px);padding:max(env(safe-area-inset-top),12px) 12px 8px;display:grid;grid-template-columns:46px minmax(0,1fr) auto;align-items:center;gap:10px;background:rgba(6,15,27,.97);border-bottom:1px solid #29435f;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);color:#f5fbff}
        #rtCanonicalBar button{height:42px;min-width:44px;border:1px solid #31536b;border-radius:13px;background:#102436;color:#fff;padding:0 11px;font-weight:800}
        #rtCanonicalTitle{min-width:0}#rtCanonicalTitle strong{display:block;font-size:18px}#rtCanonicalTitle small{display:block;color:#96aac1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #rtCanonicalProfile{max-width:155px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #rtCanonicalScrim{position:fixed;inset:0;z-index:2500010;background:rgba(0,0,0,.58);display:none}#rtCanonicalScrim.open{display:block}
        #rtCanonicalDrawer{position:fixed;z-index:2500020;left:10px;top:calc(max(env(safe-area-inset-top),12px) + 63px);bottom:max(env(safe-area-inset-bottom),12px);width:min(360px,calc(100vw - 20px));padding:14px;border:1px solid #29435f;border-radius:20px;background:#091626;box-shadow:0 24px 70px rgba(0,0,0,.6);overflow:auto;transform:translateX(calc(-100% - 28px));transition:transform .2s ease;color:#fff}#rtCanonicalDrawer.open{transform:translateX(0)}
        #rtCanonicalDrawer h2{margin:2px 4px 12px}.rt-canonical-list{display:grid;gap:8px}.rt-canonical-item{width:100%;display:grid;grid-template-columns:34px minmax(0,1fr);gap:10px;align-items:center;text-align:left;padding:12px;border:1px solid #29435f;border-radius:14px;background:#102436;color:#fff}.rt-canonical-item i{font-style:normal;font-size:21px}.rt-canonical-item span{display:grid}.rt-canonical-item small{color:#96aac1;font-weight:500;margin-top:2px}
      `;
      document.head.appendChild(style);
    }

    let bar = document.getElementById('rtCanonicalBar');
    if (!bar) {
      bar = document.createElement('header');
      bar.id = 'rtCanonicalBar';
      bar.innerHTML = '<button id="rtCanonicalMenu" type="button" aria-label="Hauptmenü öffnen">☰</button><div id="rtCanonicalTitle"><strong>RideTracker</strong><small>Fahrten · Telemetrie · Community</small></div><button id="rtCanonicalProfile" type="button"></button>';
      document.body.appendChild(bar);
    }

    let scrim = document.getElementById('rtCanonicalScrim');
    if (!scrim) {
      scrim = document.createElement('div'); scrim.id = 'rtCanonicalScrim'; document.body.appendChild(scrim);
    }
    let drawer = document.getElementById('rtCanonicalDrawer');
    if (!drawer) {
      drawer = document.createElement('nav'); drawer.id = 'rtCanonicalDrawer';
      drawer.innerHTML = `<h2>Hauptmenü</h2><div class="rt-canonical-list"><button class="rt-canonical-item" data-canonical-route="Startseite"><i>⌂</i><span><b>Startseite</b><small>Zur Hauptübersicht</small></span></button>${MENU_ITEMS.map(([icon,title,sub])=>`<button class="rt-canonical-item" data-canonical-route="${title}"><i>${icon}</i><span><b>${title}</b><small>${sub}</small></span></button>`).join('')}</div>`;
      document.body.appendChild(drawer);
    }

    bar.querySelector('#rtCanonicalMenu').onclick = () => { drawer.classList.toggle('open'); scrim.classList.toggle('open'); };
    bar.querySelector('#rtCanonicalProfile').onclick = () => route('Profil');
    scrim.onclick = closeCanonicalDrawer;
    drawer.querySelectorAll('[data-canonical-route]').forEach(button => button.onclick = () => route(button.dataset.canonicalRoute));
    bar.querySelector('#rtCanonicalProfile').textContent = `👤 ${activeProfileName()}`;
  }

  function recoverIfNeeded(forceHome = false) {
    ensureVisibleShell();
    ensureCanonicalShell();
    const dashboard = document.getElementById('rideDashboard');
    const activeTool = document.querySelector('.rt-tool-view:not([hidden]),#rtSettingsView:not([hidden]),#rtRideLibrary:not([hidden]),.rt-view,#rtStandaloneHudEditor.open,#rtDeviceCenter.open');
    const recording = window.RideTrackerRecordingState?.isRecording?.() === true || document.getElementById('stop')?.disabled === false;
    if (forceHome && activeTool) forceHome = false;
    if (forceHome || (!recording && !activeTool && dashboard && getComputedStyle(dashboard).display === 'none')) goHome();
  }

  const runtimeErrors = { handling:false, lastKey:'', lastAt:0, count:0, timer:0 };
  function reportRuntimeError(input) {
    if (runtimeErrors.handling) return false;
    const detail = typeof input === 'string' ? {message:input} : (input || {});
    const message = String(detail.message || detail.error?.message || 'Unbekannter Browserfehler');
    const key = `${message}|${detail.filename || ''}|${detail.lineno || ''}|${detail.colno || ''}`;
    const now = performance.now();
    if (key === runtimeErrors.lastKey && now - runtimeErrors.lastAt < 2500) return false;
    runtimeErrors.handling = true;
    runtimeErrors.lastKey = key;
    runtimeErrors.lastAt = now;
    runtimeErrors.count += 1;
    let banner = document.getElementById('rtRuntimeErrorBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'rtRuntimeErrorBanner';
      banner.style.cssText = 'position:fixed;left:10px;right:10px;bottom:calc(82px + env(safe-area-inset-bottom));z-index:3000000;padding:10px 12px;border:1px solid #ff6680;border-radius:12px;background:#2a0b13eF;color:#fff;font:12px/1.4 system-ui;max-height:24vh;overflow:auto;pointer-events:none';
      document.body.appendChild(banner);
    }
    banner.hidden = false;
    banner.textContent = `Web-Fehler erkannt und protokolliert: ${message}`;
    clearTimeout(runtimeErrors.timer);
    runtimeErrors.timer = setTimeout(() => { banner.hidden = true; }, 10000);
    try { window.dispatchEvent(new CustomEvent('ridetracker:runtime-error',{detail:{message,name:detail.name||detail.error?.name||null,stack:detail.stack||detail.error?.stack||null,filename:detail.filename||null,lineno:detail.lineno||null,colno:detail.colno||null,count:runtimeErrors.count}})); } catch (_) {}
    runtimeErrors.handling = false;
    return true;
  }

  window.addEventListener('error', event => reportRuntimeError({message:event?.error?.message||event?.message,error:event?.error,filename:event?.filename,lineno:event?.lineno,colno:event?.colno}));
  window.addEventListener('unhandledrejection', event => { const reason=event?.reason;reportRuntimeError({message:reason?.message||String(reason||'Unbekannter Promise-Fehler'),error:reason}); });
  window.RideTrackerRuntimeErrors={report:reportRuntimeError,snapshot:()=>({count:runtimeErrors.count,lastKey:runtimeErrors.lastKey,lastAt:runtimeErrors.lastAt})};

  const boot = () => {
    ensureVisibleShell();
    ensureCanonicalShell();
    setTimeout(() => recoverIfNeeded(true), 300);
    setTimeout(() => recoverIfNeeded(false), 1500);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
  window.addEventListener('pageshow', event => {
    if (!document.body.classList.contains('rt-hud-editor-open')) closeStaleTransientViews();
    recoverIfNeeded(event.persisted === true);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) recoverIfNeeded(false); });
  setInterval(() => {
    const profile = document.getElementById('rtCanonicalProfile');
    if (profile) profile.textContent = `👤 ${activeProfileName()}`;
  }, 1500);

  window.RideTrackerNavigation = {...(window.RideTrackerNavigation || {}), home: goHome, route};
})();
