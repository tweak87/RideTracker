(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const ROUTES = Object.freeze([
    { id:'home', title:'Startseite', icon:'⌂', subtitle:'Zur Hauptübersicht' },
    { id:'record', title:'Neue Fahrt', icon:'🎢', subtitle:'Aufzeichnung vorbereiten und starten' },
    { id:'rides', title:'Meine Fahrten', icon:'📁', subtitle:'Gespeicherte Fahrten ansehen und bearbeiten' },
    { id:'map', title:'Karte', icon:'🗺️', subtitle:'Parks, Bahnen und aufgezeichnete Strecken' },
    { id:'statistics', title:'Statistiken', icon:'📈', subtitle:'Kilometer, Fahrzeit und Rekorde' },
    { id:'achievements', title:'Achievements', icon:'🏆', subtitle:'Persönliche Meilensteine' },
    { id:'profile', title:'Profil', icon:'👤', subtitle:'Benutzer wechseln und verwalten' },
    { id:'hud', title:'HUD-Konfiguration', icon:'▣', subtitle:'Overlay gestalten und Wasserzeichen verwalten' },
    { id:'devices', title:'Geräte & Sensoren', icon:'⌁', subtitle:'Interne und externe Geräte konfigurieren' },
    { id:'imports', title:'Import & Replay', icon:'⇩', subtitle:'RideSessions, Packages und Videos öffnen' },
    { id:'settings', title:'Einstellungen', icon:'⚙️', subtitle:'Aufnahme, HUD, Sensoren und Profile verwalten' }
  ]);
  const byTitle = title => ROUTES.find(route => route.title === title);

  const style = document.createElement('style');
  style.id = 'rtFrontendManagers49Style';
  style.textContent = `
    #rtHudClosePortal{position:fixed;right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));z-index:2147483647;display:none;padding:11px 14px;border-radius:13px;border:1px solid #4d718f;background:#102436;color:#fff;font-weight:850;box-shadow:0 10px 35px rgba(0,0,0,.6)}
    body.rt-hud-editor-open #rtHudClosePortal{display:block!important}
    #rtHudOrientationInfo{display:inline-flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid #31536b;border-radius:10px;background:#091626;color:#96aac1;font-size:12px;white-space:nowrap}
    #rtHudOrientationInfo b{color:#5fd0ff}
    body.rt-dialog-open{overscroll-behavior:none}
    body:not([data-rt-route="record"]) #rtVideoStateBadge,body.rt-dialog-open #rtVideoStateBadge,body.rt-navigation-open #rtVideoStateBadge{display:none!important}
    #rtInlineDashboard .rt-inline-menu{display:grid;gap:12px}
  `;
  document.head.appendChild(style);

  const DialogManager = (() => {
    const dialogs = new Map();
    let active = null;
    function register(id, handlers = {}) { dialogs.set(id, handlers); return api; }
    async function open(id) {
      if (active && active !== id) await close(active, 'replace');
      active = id;
      document.body.classList.add('rt-dialog-open');
      await dialogs.get(id)?.open?.();
      window.dispatchEvent(new CustomEvent('ridetracker:dialog-changed',{detail:{open:true,id}}));
    }
    async function close(id = active, reason = 'user') {
      if (!id) return;
      try { await dialogs.get(id)?.close?.(reason); } finally {
        if (active === id) active = null;
        if (!active) document.body.classList.remove('rt-dialog-open');
        window.dispatchEvent(new CustomEvent('ridetracker:dialog-changed',{detail:{open:false,id,reason}}));
      }
    }
    async function closeAll(reason = 'route') { if (active) await close(active, reason); }
    const api = { register, open, close, closeAll, active:() => active };
    return api;
  })();

  const OverlayManager = (() => {
    function drawersOpen() {
      return ['rtCanonicalDrawer','rtInlineDrawer','rtNavDrawer'].some(id => byId(id)?.classList.contains('open'));
    }
    function sync() {
      const navigationOpen = drawersOpen();
      document.body.classList.toggle('rt-navigation-open', navigationOpen);
      const badge = byId('rtVideoStateBadge');
      if (!badge) return;
      const route = document.body.dataset.rtRoute || 'home';
      const mode = badge.dataset.mode || 'live';
      const visible = route === 'record' && !navigationOpen && !DialogManager.active() && (mode === 'recording' || mode === 'preview');
      badge.style.setProperty('display', visible ? 'block' : 'none', 'important');
    }
    function routeChanged(route) {
      document.body.dataset.rtRoute = route;
      if (route !== 'record') {
        window.RideTrackerRecordingFullscreen?.leave?.();
        window.RideTrackerHudReplay?.detach?.();
      }
      sync();
    }
    return { sync, routeChanged };
  })();

  async function navigate(routeOrTitle) {
    const route = ROUTES.find(item => item.id === routeOrTitle) || byTitle(routeOrTitle);
    if (!route) return false;
    await DialogManager.closeAll('navigation');
    for (const id of ['rtCanonicalDrawer','rtInlineDrawer','rtNavDrawer','rtCanonicalScrim','rtInlineScrim','rtNavScrim']) byId(id)?.classList.remove('open');
    OverlayManager.routeChanged(route.id);
    const dash = byId('rtInlineDashboard');
    if (route.id === 'home') return void window.RideTrackerFrontendNavigation?.home?.();
    if (route.id === 'record') return void window.RideTrackerFrontendNavigation?.newRide?.();
    dash?.setAttribute('hidden','');
    if (route.id === 'rides') return void window.RideTrackerRideLibrary?.show?.();
    if (route.id === 'map') return void (window.RideTrackerCanonicalRoutes?.map?.() || window.RideTrackerCanonicalRoutes?.invoke?.('Karte'));
    if (route.id === 'statistics') return void window.RideTrackerStats?.showStats?.();
    if (route.id === 'achievements') return void window.RideTrackerStats?.showAchievements?.();
    if (route.id === 'profile') return void window.RideTrackerProfiles?.showProfiles?.();
    if (route.id === 'hud') return void openHudEditor();
    if (route.id === 'devices') return void window.RideTrackerDeviceCenter?.open?.();
    if (route.id === 'imports') return void window.RideTrackerTools?.showImports?.();
    if (route.id === 'settings') return void window.RideTrackerSettings?.show?.();
    return false;
  }

  function routeButton(route, cls, attr) {
    return `<button class="${cls}" ${attr}="${route.title}" data-registry-route="${route.id}"><i>${route.icon}</i><span><b>${route.title}</b><small>${route.subtitle}</small></span></button>`;
  }

  function rebuildMenus() {
    const inlineMenu = document.querySelector('#rtInlineDashboard .rt-inline-menu');
    if (inlineMenu) inlineMenu.innerHTML = ROUTES.filter(route => route.id !== 'home').map(route => `<button class="rt-inline-action" data-inline-route="${route.title}" data-registry-route="${route.id}"><i>${route.icon}</i><span><strong>${route.title}</strong><small>${route.subtitle}</small></span></button>`).join('');
    const inlineNav = document.querySelector('#rtInlineDrawer .rt-inline-nav');
    if (inlineNav) inlineNav.innerHTML = ROUTES.map(route => `<button data-inline-route="${route.title}" data-registry-route="${route.id}">${route.icon} ${route.title}</button>`).join('');
    const canonical = document.querySelector('#rtCanonicalDrawer .rt-canonical-list');
    if (canonical) canonical.innerHTML = ROUTES.map(route => routeButton(route,'rt-canonical-item','data-canonical-route')).join('');
    const legacyHome = document.querySelector('.rt-home-panel nav');
    if (legacyHome) legacyHome.innerHTML = `<button data-home-close>Zur aktuellen Ansicht</button>${ROUTES.map(route => `<button data-home-route="${route.id}" data-registry-route="${route.id}">${route.icon} ${route.title}</button>`).join('')}`;
  }

  async function forceCloseHud(reason='user') {
    const root = byId('rtStandaloneHudEditor');
    try { await window.RideTrackerStandaloneHudEditor?.close?.(); } catch (_) {}
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch (_) {}
    root?.classList.remove('open');
    document.documentElement.style.removeProperty('overflow');
    document.body.style.removeProperty('overflow');
    document.body.classList.remove('rt-hud-editor-open');
    byId('rtHudClosePortal')?.setAttribute('aria-hidden','true');
    window.dispatchEvent(new CustomEvent('ridetracker:hud-editor-closed',{detail:{reason}}));
  }

  function orientationMode() {
    const type = screen.orientation?.type || '';
    if (type.includes('portrait')) return 'portrait';
    if (type.includes('landscape')) return 'landscape';
    return matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
  }

  const OrientationManager = (() => {
    let auto = true;
    function sync(force = false) {
      const root = byId('rtStandaloneHudEditor');
      if (!root?.classList.contains('open') || (!auto && !force)) return;
      const select = byId('rtHudMode');
      if (!select) return;
      const next = orientationMode();
      if (select.value !== next) {
        select.value = next;
        select.dispatchEvent(new Event('change',{bubbles:true}));
      }
      const info = byId('rtHudOrientationInfo');
      if (info) info.innerHTML = `Ausrichtung: <b>${next === 'portrait' ? 'Hochformat 9:16' : 'Querformat 16:9'}</b> · ${auto?'automatisch':'manuell'}`;
      window.dispatchEvent(new CustomEvent('ridetracker:hud-orientation-changed',{detail:{mode:next,auto}}));
    }
    function setAuto(value) { auto = Boolean(value); sync(true); return auto; }
    window.addEventListener('orientationchange',()=>setTimeout(()=>sync(),80),{passive:true});
    window.addEventListener('resize',()=>sync(),{passive:true});
    screen.orientation?.addEventListener?.('change',()=>sync());
    return { sync, setAuto, isAuto:()=>auto, current:orientationMode };
  })();

  async function openHudEditor() {
    const root = byId('rtStandaloneHudEditor');
    if (!root) return false;
    document.body.classList.add('rt-hud-editor-open');
    await window.RideTrackerStandaloneHudEditor?.open?.();
    OrientationManager.sync(true);
    return true;
  }

  function enhanceHudEditor() {
    const root = byId('rtStandaloneHudEditor');
    if (!root) return;
    let closePortal = byId('rtHudClosePortal');
    if (!closePortal) {
      closePortal = document.createElement('button');
      closePortal.id = 'rtHudClosePortal';
      closePortal.type = 'button';
      closePortal.textContent = 'Fertig';
      closePortal.setAttribute('aria-label','HUD-Konfiguration schließen');
      document.body.appendChild(closePortal);
      closePortal.onclick = () => void DialogManager.close('hud','button');
    }
    const top = root.querySelector('.rt-hud-top');
    if (top && !byId('rtHudOrientationInfo')) {
      const info = document.createElement('span'); info.id='rtHudOrientationInfo';
      const select = byId('rtHudMode'); select?.insertAdjacentElement('afterend',info);
      select?.addEventListener('change',()=>{ OrientationManager.setAuto(false); setTimeout(()=>OrientationManager.sync(true),0); });
      info.addEventListener('click',()=>{ OrientationManager.setAuto(!OrientationManager.isAuto()); OrientationManager.sync(true); });
      info.title='Antippen: automatische Ausrichtung ein-/ausschalten';
    }
    const originalOpen = window.RideTrackerStandaloneHudEditor?.open;
    const originalClose = window.RideTrackerStandaloneHudEditor?.close;
    if (window.RideTrackerStandaloneHudEditor && !window.RideTrackerStandaloneHudEditor.__managed49) {
      window.RideTrackerStandaloneHudEditor.open = async () => {
        document.body.classList.add('rt-hud-editor-open');
        await originalOpen?.();
        OrientationManager.sync(true);
      };
      window.RideTrackerStandaloneHudEditor.close = async () => {
        await originalClose?.();
        document.body.classList.remove('rt-hud-editor-open');
      };
      window.RideTrackerStandaloneHudEditor.__managed49 = true;
    }
    DialogManager.register('hud',{
      open: async()=>{ document.body.classList.add('rt-hud-editor-open'); await window.RideTrackerStandaloneHudEditor?.open?.(); OrientationManager.sync(true); },
      close: async(reason)=>forceCloseHud(reason)
    });
    const done = byId('rtHudDone');
    if (done) done.onclick = () => void DialogManager.close('hud','done');
  }

  function captureRegistryNavigation(event) {
    const target = event.target.closest?.('[data-registry-route]');
    if (!target) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void navigate(target.dataset.registryRoute);
  }

  function installRouteCleanup() {
    window.addEventListener('ridetracker:record-route-entered',()=>OverlayManager.routeChanged('record'));
    window.addEventListener('ridetracker:preview-ready',OverlayManager.sync);
    window.addEventListener('ridetracker:recording-started',OverlayManager.sync);
    window.addEventListener('ridetracker:recording-stopped',OverlayManager.sync);
    window.addEventListener('ridetracker:dialog-changed',OverlayManager.sync);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&DialogManager.active())void DialogManager.close(undefined,'escape');});
    window.addEventListener('popstate',()=>{if(DialogManager.active())void DialogManager.close(undefined,'history');});
  }

  function verifyViews() {
    const routeTitles = ROUTES.map(x=>x.title);
    const inline = [...document.querySelectorAll('#rtInlineDrawer [data-registry-route]')].map(x=>x.textContent.trim().replace(/^\S+\s+/,'').trim());
    const canonical = [...document.querySelectorAll('#rtCanonicalDrawer [data-registry-route]')].map(x=>x.querySelector('b')?.textContent || '');
    const consistent = routeTitles.every((title,index)=>inline[index]===title&&canonical[index]===title);
    window.dispatchEvent(new CustomEvent('ridetracker:navigation-audit',{detail:{consistent,routes:routeTitles}}));
    return {consistent,routes:routeTitles};
  }

  function install() {
    rebuildMenus();
    enhanceHudEditor();
    installRouteCleanup();
    document.addEventListener('click',captureRegistryNavigation,true);
    const observer = new MutationObserver(()=>{ rebuildMenus(); enhanceHudEditor(); OverlayManager.sync(); });
    observer.observe(document.body,{childList:true,subtree:true});
    OverlayManager.sync();
    window.RideTrackerNavigationRegistry = { routes:()=>ROUTES.map(x=>({...x})), navigate, audit:verifyViews };
    window.RideTrackerDialogManager = DialogManager;
    window.RideTrackerOverlayManager = OverlayManager;
    window.RideTrackerOrientationManager = OrientationManager;
    setTimeout(verifyViews,500);
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();