(() => {
  'use strict';

  const forbiddenButtonPatterns = [
    /^Modus:\s*/i,
    /^HUD:\s*(klein|mittel|groß)/i,
    /^HUD verschieben$/i,
    /^Positionen zurücksetzen$/i
  ];
  const forbiddenSectionPatterns = [
    /^Streckenkonstruktion$/i,
    /^HUD[- ]Layout$/i,
    /^HUD verschieben$/i
  ];

  function normalizedText(node) {
    return (node?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function removeLegacyControls(root = document) {
    root.querySelectorAll('button, [role="button"], .btn').forEach((control) => {
      const text = normalizedText(control);
      if (forbiddenButtonPatterns.some((pattern) => pattern.test(text))) {
        control.remove();
      }
    });

    root.querySelectorAll('h1,h2,h3,h4,h5,legend,summary,.section-title,.card-title').forEach((heading) => {
      const text = normalizedText(heading);
      if (!forbiddenSectionPatterns.some((pattern) => pattern.test(text))) return;
      const section = heading.closest('section,details,fieldset,.card,.panel,.settings-card,.control-card') || heading.parentElement;
      section?.remove();
    });

    // Werkzeugleisten früherer HUD-Editoren dürfen ausschließlich im separaten Editor existieren.
    document.querySelectorAll('#rtOverlayToolbar,#rtHudToolbar,.rt-overlay-toolbar,.hud-toolbar').forEach((toolbar) => toolbar.remove());

    // Alte Umschalter nach IDs/Klassen unabhängig von ihrer Beschriftung entfernen.
    [
      '#hudModeBtn','#hudSizeBtn','#hudDragBtn','#hudResetBtn',
      '[data-action="hud-mode"]','[data-action="hud-size"]',
      '[data-action="hud-drag"]','[data-action="hud-reset"]'
    ].forEach((selector) => document.querySelectorAll(selector).forEach((node) => node.remove()));
  }

  let scheduled = false;
  const scheduleCleanup = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      removeLegacyControls();
    });
  };

  removeLegacyControls();
  new MutationObserver(scheduleCleanup).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  document.addEventListener('fullscreenchange', scheduleCleanup);
  document.addEventListener('webkitfullscreenchange', scheduleCleanup);
  window.addEventListener('orientationchange', scheduleCleanup);
  window.addEventListener('resize', scheduleCleanup);
})();