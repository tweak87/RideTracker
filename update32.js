(() => {
  'use strict';

  const LEGACY_IDS = [
    'rtHudConfigView',
    'rtHudWorkspace',
    'rtHudEditor',
    'rtHudEditorButton',
    'rtHudCanvas',
    'rtOverlayToolbar',
    'rtSharedOverlay'
  ];

  function removeLegacyHudEditor() {
    for (const id of LEGACY_IDS) {
      const node = document.getElementById(id);
      if (!node) continue;
      // The current live canvas must never be removed.
      if (id === 'rtSharedOverlay') {
        node.remove();
        continue;
      }
      node.remove();
    }

    document.querySelectorAll('.hud-toolbar,.rt-overlay-toolbar,[data-action="hud-drag"],[data-action="hud-reset"]').forEach(node => node.remove());
  }

  async function openCanonicalHudEditor() {
    removeLegacyHudEditor();
    document.getElementById('rtNavDrawer')?.classList.remove('open');
    document.getElementById('rtNavScrim')?.classList.remove('open');

    const editor = window.RideTrackerStandaloneHudEditor;
    if (!editor?.open) {
      console.error('Der zentrale HUD-Editor ist noch nicht geladen.');
      return;
    }
    await editor.open();
  }

  function isHudTrigger(target) {
    const trigger = target.closest?.('[data-route="HUD-Konfiguration"],[data-setting="hud"],.rt-dashboard-hud');
    if (trigger) return true;
    const button = target.closest?.('button,a,[role="button"]');
    return !!button && /HUD-Konfiguration/i.test((button.textContent || '').replace(/\s+/g, ' ').trim());
  }

  // Override the old public route used by update23 and the settings page.
  window.RideTrackerTools ||= {};
  window.RideTrackerTools.showHudConfiguration = openCanonicalHudEditor;
  window.RideTrackerHUD = { open: openCanonicalHudEditor };

  document.addEventListener('click', event => {
    if (!isHudTrigger(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openCanonicalHudEditor();
  }, true);

  removeLegacyHudEditor();
  new MutationObserver(() => {
    removeLegacyHudEditor();
    if (window.RideTrackerTools?.showHudConfiguration !== openCanonicalHudEditor) {
      window.RideTrackerTools.showHudConfiguration = openCanonicalHudEditor;
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
