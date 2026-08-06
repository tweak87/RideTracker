(() => {
  'use strict';

  const LEGACY_SELECTORS = [
    '#rtSharedOverlay',
    '#rtOverlayToolbar',
    '#rtOverlayError',
    '#videoWrap > #hud'
  ];

  const style = document.createElement('style');
  style.id = 'rtSingleHudLayerStyle';
  style.textContent = `
    #rtSharedOverlay,
    #rtOverlayToolbar,
    #rtOverlayError,
    #videoWrap > #hud {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
    #rtConfiguredLiveHud {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      z-index: 55 !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);

  function removeLegacyHud() {
    for (const selector of LEGACY_SELECTORS) {
      document.querySelectorAll(selector).forEach(node => {
        if (node.id === 'hud') {
          node.hidden = true;
          node.setAttribute('aria-hidden', 'true');
          node.style.setProperty('display', 'none', 'important');
          node.style.setProperty('visibility', 'hidden', 'important');
          node.style.setProperty('opacity', '0', 'important');
        } else {
          node.remove();
        }
      });
    }
  }

  removeLegacyHud();

  const observer = new MutationObserver(removeLegacyHud);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('fullscreenchange', removeLegacyHud);
  document.addEventListener('webkitfullscreenchange', removeLegacyHud);
  window.addEventListener('orientationchange', removeLegacyHud);
  window.addEventListener('resize', removeLegacyHud);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) removeLegacyHud();
  });
})();
