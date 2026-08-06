(() => {
  'use strict';

  const style = document.createElement('style');
  style.id = 'rtRecordingSeparationStyle';
  style.textContent = `
    body.rt-record-mode main>h1,
    body.rt-record-mode main>.sub,
    body.rt-record-mode main>.notice{display:none!important}
    body.rt-record-mode main{max-width:1180px!important}
    body.rt-record-mode main>.controls{max-width:900px;margin:0 auto 10px}
    body.rt-record-mode main>section.grid{display:block!important}
    body.rt-record-mode main>section.grid>.card{display:none!important}
    body.rt-record-mode main>section.grid>.rt-record-video-card{display:block!important;max-width:1100px;margin:0 auto;padding:0!important;border:0!important;background:transparent!important}
    body.rt-record-mode .rt-record-video-card>.configGrid,
    body.rt-record-mode .rt-record-video-card>.videoMeta{display:none!important}
    body.rt-record-mode .rt-record-video-card .videoWrap{margin-top:0;min-height:min(72vh,760px)}
    #rtAdvancedSettingsHost{display:grid;gap:12px}
    #rtAdvancedSettingsHost>.card{display:block!important;width:100%!important}
    #rtAdvancedSettingsHost .videoWrap,
    #rtAdvancedSettingsHost .videoBtns,
    #rtAdvancedSettingsHost #scrub{display:none!important}
    .rt-setting-section{border:1px solid #29435f;border-radius:17px;background:#0a1727;padding:13px}
    .rt-setting-section>h3{margin:0 0 10px;color:#00e5ff}
    #videoWrap.rt-app-fullscreen{position:fixed!important;inset:0!important;z-index:999999!important;width:100vw!important;height:100dvh!important;max-height:none!important;aspect-ratio:auto!important;margin:0!important;border-radius:0!important;background:#000!important}
    #videoWrap.rt-app-fullscreen video{object-fit:cover!important}
    #videoWrap.rt-app-fullscreen #rtHudCanvas{width:100%!important;height:100%!important}
    #rtExitRecordingFullscreen{position:fixed;z-index:1000001;right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));display:none;border:1px solid rgba(255,255,255,.55);background:rgba(6,20,22,.82);color:#fff;border-radius:999px;padding:10px 13px;font-weight:750}
    body.rt-app-fullscreen-active #rtExitRecordingFullscreen{display:block}
    @media(orientation:portrait){#videoWrap.rt-app-fullscreen{width:100vw!important;height:100dvh!important}}
    @media(orientation:landscape){#videoWrap.rt-app-fullscreen{width:100vw!important;height:100dvh!important}}
  `;
  document.head.appendChild(style);

  const q = selector => document.querySelector(selector);
  const qa = selector => [...document.querySelectorAll(selector)];

  function settingsView() {
    return document.getElementById('rtSettingsView');
  }

  function ensureAdvancedHost() {
    const view = settingsView();
    if (!view) return null;
    let host = document.getElementById('rtAdvancedSettingsHost');
    if (host) return host;
    host = document.createElement('section');
    host.id = 'rtAdvancedSettingsHost';
    host.innerHTML = '<div class="rt-setting-section"><h3>Aufnahme, Kalibrierung und Route</h3><div data-record-settings></div></div><div class="rt-setting-section"><h3>Auswertung und Diagnose</h3><div data-diagnostics-settings></div></div>';
    view.appendChild(host);
    return host;
  }

  function identifyVideoCard() {
    return document.getElementById('videoWrap')?.closest('.card') || null;
  }

  function moveSettingsOutOfRecording() {
    const grid = q('main>section.grid');
    const videoCard = identifyVideoCard();
    const host = ensureAdvancedHost();
    if (!grid || !videoCard || !host) return false;
    videoCard.classList.add('rt-record-video-card');

    const recordTarget = host.querySelector('[data-record-settings]');
    const diagnosticsTarget = host.querySelector('[data-diagnostics-settings]');

    // Die Setup-Karte mit Kalibrierung, Startprofil und Gerätekante gehört ausschließlich in Einstellungen.
    const setupCard = document.getElementById('calMode')?.closest('.card');
    if (setupCard && setupCard.parentElement !== recordTarget) recordTarget.appendChild(setupCard);

    // HUD-Schnelloptionen aus der Video-Karte herauslösen; der vollständige HUD-Editor bleibt separat.
    const configGrid = videoCard.querySelector('.configGrid');
    if (configGrid && !document.getElementById('rtQuickHudSettings')) {
      const quick = document.createElement('div');
      quick.id = 'rtQuickHudSettings';
      quick.className = 'card';
      quick.innerHTML = '<div class="label">Schnelle HUD-Anzeigeoptionen</div>';
      quick.appendChild(configGrid);
      recordTarget.appendChild(quick);
    }

    // Karten-, Routen-, Profil- und Sensoroptionen aus späteren Updates ebenfalls aus der Aufnahme entfernen.
    const settingSelectors = [
      '#parkMapCard', '#routeSettingsCard', '#trackSettingsCard', '#sessionImportCard',
      '[data-section="route-settings"]', '[data-section="map-settings"]',
      '[data-section="external-sensors"]', '#heartRateConnect'
    ];
    for (const selector of settingSelectors) {
      const node = document.querySelector(selector);
      const card = node?.closest?.('.card') || (node?.matches?.('.card') ? node : null);
      if (card && card !== videoCard && card.parentElement !== recordTarget) recordTarget.appendChild(card);
    }

    // Diagramme, Zusammenfassung und Diagnose stehen außerhalb des Aufnahmebildschirms zur Verfügung.
    qa('main>section.grid>.card').forEach(card => {
      if (card === videoCard || card === setupCard) return;
      if (card.querySelector('#normalVal,#positiveAvg,#latVal,#speed')) return;
      if (card.parentElement === grid) diagnosticsTarget.appendChild(card);
    });
    return true;
  }

  function showRecordingOnly() {
    document.getElementById('rideDashboard')?.style.setProperty('display', 'none');
    qa('.rt-view,.rt-tool-view').forEach(view => {
      if (view.classList.contains('rt-tool-view')) view.hidden = true;
      else view.remove();
    });
    const settings = settingsView();
    if (settings) settings.hidden = true;
    document.body.classList.add('rt-record-mode');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showRealSettings() {
    document.body.classList.remove('rt-record-mode');
    window.RideTrackerSettings?.show?.();
    requestAnimationFrame(moveSettingsOutOfRecording);
  }

  // Die bisherigen Einstellungs-Unterpunkte dürfen nicht mehr zurück in die Aufnahme scrollen.
  document.addEventListener('click', event => {
    const settingRoute = event.target.closest?.('[data-route="Einstellungen"],.rt-dashboard-settings');
    if (settingRoute) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showRealSettings();
      return;
    }
    const recordTile = event.target.closest?.('[data-view="record"],[data-route="Neue Fahrt"]');
    if (recordTile) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showRecordingOnly();
    }
  }, true);

  // Einstellungskarten, die bisher openRecordSettings() aufriefen, bleiben innerhalb der Einstellungsseite.
  document.addEventListener('click', event => {
    const card = event.target.closest?.('[data-setting="record"],[data-setting="sensors"]');
    if (!card) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showRealSettings();
    const host = ensureAdvancedHost();
    host?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, true);

  function addExitButton() {
    if (document.getElementById('rtExitRecordingFullscreen')) return;
    const button = document.createElement('button');
    button.id = 'rtExitRecordingFullscreen';
    button.type = 'button';
    button.textContent = 'Vollbild verlassen';
    button.onclick = exitFullscreen;
    document.body.appendChild(button);
  }

  async function enterFullscreen() {
    const wrap = document.getElementById('videoWrap');
    const video = document.getElementById('preview');
    if (!wrap) return;
    addExitButton();
    try {
      if (wrap.requestFullscreen && !document.fullscreenElement) await wrap.requestFullscreen({ navigationUI: 'hide' });
      else if (wrap.webkitRequestFullscreen && !document.webkitFullscreenElement) wrap.webkitRequestFullscreen();
      else {
        wrap.classList.add('rt-app-fullscreen');
        document.body.classList.add('rt-app-fullscreen-active');
      }
    } catch (_) {
      // iPhone Safari erlaubt häufig nur Video-Vollbild oder ein App-Vollbild-Fallback.
      if (video?.webkitEnterFullscreen) {
        try { video.webkitEnterFullscreen(); return; } catch (_) {}
      }
      wrap.classList.add('rt-app-fullscreen');
      document.body.classList.add('rt-app-fullscreen-active');
    }
    try {
      const orientation = screen.orientation;
      if (orientation?.lock && matchMedia('(orientation: landscape)').matches) await orientation.lock('landscape');
    } catch (_) {}
  }

  async function exitFullscreen() {
    const wrap = document.getElementById('videoWrap');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (_) {}
    wrap?.classList.remove('rt-app-fullscreen');
    document.body.classList.remove('rt-app-fullscreen-active');
    try { screen.orientation?.unlock?.(); } catch (_) {}
  }

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      document.getElementById('videoWrap')?.classList.remove('rt-app-fullscreen');
      document.body.classList.remove('rt-app-fullscreen-active');
    }
  });
  document.addEventListener('webkitfullscreenchange', () => {
    if (!document.webkitFullscreenElement) document.body.classList.remove('rt-app-fullscreen-active');
  });

  // Jede explizite Auswahl „Mit Video starten“ aktiviert unmittelbar Vollbild.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    const label = (button?.textContent || '').trim().toLowerCase();
    if (!button || !label.includes('mit video starten')) return;
    // Der Vollbildaufruf erfolgt noch im direkten User-Gesture-Handler.
    enterFullscreen();
  }, true);

  // Fallback für ältere Oberflächen: Wird Start bei eingeschaltetem Video gedrückt, ebenfalls Vollbild aktivieren.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#start,#unifiedRideStart');
    if (!button) return;
    const videoMode = document.getElementById('videoMode');
    const videoEnabled = !videoMode || !/aus/i.test(videoMode.textContent || '');
    if (videoEnabled) enterFullscreen();
  }, true);

  // Bei Drehung werden Canvas und Videofläche neu berechnet; die Overlay-Renderer reagieren auf Resize.
  const refreshOrientation = () => {
    const wrap = document.getElementById('videoWrap');
    if (!wrap) return;
    wrap.dataset.orientation = matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
    window.dispatchEvent(new Event('resize'));
  };
  addEventListener('orientationchange', () => setTimeout(refreshOrientation, 120));
  screen.orientation?.addEventListener?.('change', refreshOrientation);
  addEventListener('resize', refreshOrientation);

  const observer = new MutationObserver(() => {
    moveSettingsOutOfRecording();
    addExitButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  moveSettingsOutOfRecording();
  addExitButton();
  refreshOrientation();
})();
