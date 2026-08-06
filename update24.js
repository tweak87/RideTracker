(() => {
  'use strict';

  const style = document.createElement('style');
  style.id = 'rtSettingsViewStyle';
  style.textContent = `
    #rtSettingsView{position:relative;z-index:320;max-width:980px;margin:0 auto;padding:0 12px 30px}
    #rtSettingsView[hidden]{display:none!important}
    .rt-settings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
    .rt-settings-card{display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:7px;width:100%;min-height:132px;padding:16px;border:1px solid #29435f;border-radius:17px;background:linear-gradient(180deg,#10243b,#0a1727);color:#f5fbff}
    .rt-settings-card i{font-style:normal;font-size:25px}.rt-settings-card strong{font-size:16px}.rt-settings-card small{color:#96aac1;line-height:1.4}
    #rideDashboard .dashMenu .rt-dashboard-settings{display:flex!important}
  `;
  document.head.appendChild(style);

  function closeDrawer() {
    document.getElementById('rtNavDrawer')?.classList.remove('open');
    document.getElementById('rtNavScrim')?.classList.remove('open');
  }

  function closeOtherViews(except) {
    document.querySelectorAll('.rt-view,.rt-tool-view,#rtSettingsView').forEach(view => {
      if (view === except) return;
      if (view.id === 'rtSettingsView' || view.classList.contains('rt-tool-view')) view.hidden = true;
      else view.remove();
    });
  }

  function ensureSettingsView() {
    let view = document.getElementById('rtSettingsView');
    if (view) return view;
    view = document.createElement('section');
    view.id = 'rtSettingsView';
    view.hidden = true;
    view.innerHTML = `
      <header class="rt-tool-head">
        <div><h2>Einstellungen</h2><p>Aufnahme, Overlay, Benutzer, Sensoren sowie Import und Export verwalten</p></div>
        <button id="rtSettingsBack" class="rt-tool-back" type="button">Zurück</button>
      </header>
      <div class="rt-settings-grid">
        <button class="rt-settings-card" data-setting="record"><i>🎢</i><strong>Aufnahme & Kalibrierung</strong><small>Kalibrierungsmodus, Fahrtrichtung, Kamera, GPS und Sensorstart konfigurieren.</small></button>
        <button class="rt-settings-card" data-setting="hud"><i>▣</i><strong>HUD-Konfiguration</strong><small>Hoch- und Querformat, Positionen, Größen, Transparenz und Wasserzeichen.</small></button>
        <button class="rt-settings-card" data-setting="sensors"><i>⌁</i><strong>Externe Sensoren</strong><small>Bluetooth-Pulsuhr und künftig zusätzliche Sensor-Kits verbinden.</small></button>
        <button class="rt-settings-card" data-setting="profile"><i>👤</i><strong>Benutzerprofile</strong><small>Lokale Benutzer anlegen, wechseln und benutzerspezifische Daten verwalten.</small></button>
        <button class="rt-settings-card" data-setting="imports"><i>⇩</i><strong>Import & Replay</strong><small>RideSessions, RidePackages und synchronisierte Videos öffnen.</small></button>
      </div>`;
    document.querySelector('main')?.prepend(view);

    view.querySelector('#rtSettingsBack').onclick = () => {
      view.hidden = true;
      document.getElementById('rideDashboard')?.style.setProperty('display', 'block');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    view.querySelector('[data-setting="hud"]').onclick = () => window.RideTrackerTools?.showHudConfiguration?.();
    view.querySelector('[data-setting="imports"]').onclick = () => window.RideTrackerTools?.showImports?.();
    view.querySelector('[data-setting="profile"]').onclick = () => window.RideTrackerProfiles?.showProfiles?.();
    view.querySelector('[data-setting="record"]').onclick = () => openRecordSettings('calMode');
    view.querySelector('[data-setting="sensors"]').onclick = () => openRecordSettings('heartRateConnect');
    return view;
  }

  function openRecordSettings(preferredId) {
    const view = document.getElementById('rtSettingsView');
    if (view) view.hidden = true;
    document.getElementById('rideDashboard')?.style.setProperty('display', 'none');
    document.querySelectorAll('.rt-view,.rt-tool-view').forEach(item => {
      if (item.classList.contains('rt-tool-view')) item.hidden = true;
      else item.remove();
    });
    const target = document.getElementById(preferredId)
      || document.getElementById('calMode')
      || document.querySelector('[data-section="external-sensors"]')
      || document.querySelector('.configGrid');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function showSettings() {
    closeDrawer();
    document.getElementById('rideDashboard')?.style.setProperty('display', 'none');
    const view = ensureSettingsView();
    closeOtherViews(view);
    view.hidden = false;
    view.scrollIntoView({ block: 'start' });
  }

  window.RideTrackerSettings = { show: showSettings };

  // Alte, wirkungslose Einstellungen-Route vor update19 abfangen.
  document.addEventListener('click', event => {
    const route = event.target.closest?.('[data-route="Einstellungen"]');
    if (!route) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showSettings();
  }, true);

  function addDashboardTile() {
    const menu = document.querySelector('#rideDashboard .dashMenu');
    if (!menu || menu.querySelector('.rt-dashboard-settings')) return;
    const button = document.createElement('button');
    button.className = 'dashAction rt-dashboard-settings';
    button.type = 'button';
    button.innerHTML = '<span class="dashIcon">⚙</span><span><strong>Einstellungen</strong><small>Aufnahme, HUD, Sensoren, Profile und Importe verwalten</small></span>';
    button.onclick = event => {
      event.preventDefault();
      showSettings();
    };
    menu.appendChild(button);
  }

  const observer = new MutationObserver(() => {
    addDashboardTile();
    ensureSettingsView();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  addDashboardTile();
  ensureSettingsView();
})();
