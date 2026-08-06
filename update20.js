// Legacy shared HUD renderer retired.
// The live recording overlay is rendered exclusively by update29.js from the
// configuration saved by the standalone HUD editor.

const removeLegacyOverlay = () => {
  document.querySelectorAll(
    '#rtSharedOverlay,#rtOverlayToolbar,#rtOverlayError,#rtHudToolbar,.rt-overlay-toolbar,.hud-toolbar'
  ).forEach((node) => node.remove());

  const legacyHud = document.querySelector('#videoWrap > #hud');
  if (legacyHud) {
    legacyHud.hidden = true;
    legacyHud.setAttribute('aria-hidden', 'true');
    legacyHud.style.setProperty('display', 'none', 'important');
  }
};

removeLegacyOverlay();
new MutationObserver(removeLegacyOverlay).observe(document.documentElement, {
  childList: true,
  subtree: true
});

export {};
