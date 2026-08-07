(() => {
  'use strict';

  const KNOWN_TRANSIENTS = [
    '#rtStandaloneHudEditor',
    '#rtDeviceCenter',
    '.rt-home-panel',
    '#rtNavScrim',
    '#rtNavDrawer'
  ];

  function ensureVisibleShell() {
    document.documentElement.style.removeProperty('display');
    document.documentElement.style.removeProperty('visibility');
    document.documentElement.style.removeProperty('opacity');
    document.body.style.removeProperty('display');
    document.body.style.removeProperty('visibility');
    document.body.style.removeProperty('opacity');
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
        if (selector === '#rtStandaloneHudEditor' || selector === '#rtDeviceCenter' || selector === '.rt-home-panel') {
          node.style.removeProperty('display');
        }
      });
    }
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      document.documentElement.style.removeProperty('overflow');
      document.body.style.removeProperty('overflow');
    }
  }

  function hasVisibleApplicationContent() {
    const candidates = [document.querySelector('main'), document.getElementById('rideDashboard'), document.querySelector('.rt-tool-view:not([hidden])'), document.querySelector('.rt-view')].filter(Boolean);
    return candidates.some(node => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    });
  }

  function recoverIfNeeded() {
    ensureVisibleShell();
    if (!hasVisibleApplicationContent()) {
      closeStaleTransientViews();
      const dashboard = document.getElementById('rideDashboard');
      if (dashboard) dashboard.style.display = 'block';
      ensureVisibleShell();
    }
  }

  function showRuntimeError(message) {
    console.error('[RideTracker Web]', message);
    let banner = document.getElementById('rtRuntimeErrorBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'rtRuntimeErrorBanner';
      banner.style.cssText = 'position:fixed;left:10px;right:10px;bottom:10px;z-index:3000000;padding:10px 12px;border:1px solid #ff6680;border-radius:12px;background:#2a0b13;color:#fff;font:12px/1.4 system-ui;max-height:35vh;overflow:auto';
      document.body.appendChild(banner);
    }
    banner.textContent = `Web-Fehler erkannt: ${message}`;
  }

  window.addEventListener('error', event => {
    const message = event?.error?.message || event?.message;
    if (message) showRuntimeError(message);
  });
  window.addEventListener('unhandledrejection', event => {
    const reason = event?.reason;
    const message = reason?.message || String(reason || 'Unbekannter Promise-Fehler');
    showRuntimeError(message);
  });

  const boot = () => {
    ensureVisibleShell();
    setTimeout(recoverIfNeeded, 250);
    setTimeout(recoverIfNeeded, 1500);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();

  window.addEventListener('pageshow', () => {
    closeStaleTransientViews();
    recoverIfNeeded();
  });
})();