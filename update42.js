(() => {
  'use strict';

  const REGISTRY_KEY = 'rideTracker.devices.v1';
  const byId = id => document.getElementById(id);
  const state = { running: false };

  function registry() {
    try {
      return window.RideTrackerDeviceCenter?.registry?.() || JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}');
    } catch (_) { return {}; }
  }

  function pluginMap() {
    const map = new Map();
    for (const plugin of window.RideTrackerWebPlugins?.list?.() || []) map.set(plugin.pluginId, plugin);
    return map;
  }

  function recent(timestamp, maxAgeMs = 10000) {
    return Number.isFinite(Number(timestamp)) && performance.now() - Number(timestamp) <= maxAgeMs;
  }

  function selectedSensors() {
    const devices = Array.isArray(registry()?.devices) ? registry().devices : [];
    const plugins = pluginMap();
    return devices
      .filter(device => device?.enabled !== false && Array.isArray(device.channels) && device.channels.some(channel => channel?.enabled !== false))
      .map(device => {
        let available = true;
        let reason = '';
        let pluginId = null;
        if (device.id === 'phone-motion') available = 'DeviceMotionEvent' in window;
        else if (device.id === 'phone-gps') available = Boolean(navigator.geolocation);
        else if (device.id === 'phone-camera') available = Boolean(navigator.mediaDevices?.getUserMedia);
        else if (device.id === 'ble-heart') {
          pluginId = 'ble-heart-rate';
          const runtime = plugins.get(pluginId);
          available = Boolean(runtime && recent(runtime.lastTelemetryAt));
          if (!available) reason = 'nicht verbunden';
        } else if (device.id === 'external-imu') {
          pluginId = 'external-imu';
          const runtime = plugins.get(pluginId);
          available = Boolean(runtime && recent(runtime.lastTelemetryAt));
          if (!available) reason = 'keine aktuellen Messwerte';
        } else if (device.id === 'external-gnss') {
          pluginId = 'external-gnss';
          const runtime = plugins.get(pluginId);
          available = Boolean(runtime && recent(runtime.lastTelemetryAt));
          if (!available) reason = 'keine aktuellen Messwerte';
        } else if (device.type === 'camera') {
          available = Boolean(window.RideTrackerCameraSources?.snapshot?.()?.sources?.some?.(source => source.available !== false));
        }
        const calibratable = device.id === 'phone-motion' || device.id === 'external-imu' || device.type === 'imu';
        const channelCalibrated = !calibratable || (device.channels || []).filter(c => c.enabled !== false).every(c => c.calibration?.status === 'ready');
        return { device, pluginId, available, reason, calibratable, channelCalibrated };
      });
  }

  function phoneCalibrationReady() {
    const manager = window.RideTrackerCalibrationManager;
    const current = Boolean(manager?.current?.());
    if (current && typeof manager?.activeCompatible === 'function') return manager.activeCompatible();
    return current || /kalibriert/i.test(byId('calState')?.textContent || '');
  }

  function externalImuCalibrationReady(item) {
    return item.channelCalibrated;
  }

  function sensorStatus(item) {
    if (!item.available) return { kind: 'skip', text: `Nicht verfügbar${item.reason ? ` · ${item.reason}` : ''} – wird für diese Fahrt nicht vorausgesetzt` };
    if (!item.calibratable) return { kind: 'ready', text: 'Bereit · keine Lage-/Nullpunktkalibrierung nötig' };
    if (item.device.id === 'phone-motion') return phoneCalibrationReady()
      ? { kind: 'ready', text: 'Kalibriert · Geräteachsen → Fahrzeugachsen' }
      : { kind: 'pending', text: 'Kalibrierung nötig · Telefon ruhig in finaler Position halten' };
    return externalImuCalibrationReady(item)
      ? { kind: 'ready', text: 'Kalibriert · Geräteprofil aktiv' }
      : { kind: 'pending', text: 'Kalibrierung im Geräteprofil erforderlich' };
  }

  function ensureUi() {
    if (byId('rtSensorCalibrationSession')) return byId('rtSensorCalibrationSession');
    const style = document.createElement('style');
    style.id = 'rtSensorCalibration42Style';
    style.textContent = `
      #rtSensorCalibrationSession{position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.78);display:grid;place-items:center;padding:16px}
      #rtSensorCalibrationSession[hidden]{display:none!important}.rt-sensor-cal-card{width:min(560px,100%);max-height:min(82dvh,720px);overflow:auto;border:1px solid #315170;border-radius:20px;background:#0b192a;padding:17px;box-shadow:0 20px 70px #000b}
      .rt-sensor-cal-card h3{margin:0 0 5px}.rt-sensor-cal-help{color:#aabbd0;line-height:1.45;font-size:13px;margin:0 0 12px}.rt-sensor-cal-list{display:grid;gap:8px}.rt-sensor-cal-row{border:1px solid #29435f;border-radius:13px;background:#071321;padding:10px}.rt-sensor-cal-row strong{display:block}.rt-sensor-cal-row span{display:block;color:#9fb1c7;font-size:12px;margin-top:4px}.rt-sensor-cal-row[data-kind="ready"]{border-color:#2f7257}.rt-sensor-cal-row[data-kind="working"]{border-color:#00b9d5}.rt-sensor-cal-row[data-kind="error"]{border-color:#a24b59}.rt-sensor-cal-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.rt-sensor-cal-actions button{flex:1;min-width:140px}.rt-sensor-cal-progress{height:6px;background:#06101c;border-radius:99px;overflow:hidden;margin-top:8px}.rt-sensor-cal-progress i{display:block;height:100%;width:0;background:#00e5ff;transition:width .2s ease}
    `;
    document.head.appendChild(style);
    const modal = document.createElement('section');
    modal.id = 'rtSensorCalibrationSession';
    modal.hidden = true;
    modal.innerHTML = `<div class="rt-sensor-cal-card" role="dialog" aria-modal="true"><h3>Sensorprüfung & Kalibrierung</h3><p class="rt-sensor-cal-help">Es werden nur Sensoren berücksichtigt, die für die Fahrt aktiviert und aktuell verfügbar sind. Halte das Smartphone während der Bewegungskalibrierung in seiner endgültigen Position ruhig.</p><div class="rt-sensor-cal-list"></div><div class="rt-sensor-cal-progress"><i></i></div><div class="rt-sensor-cal-actions"><button type="button" class="primary" data-run-cal>Kalibrierung starten</button><button type="button" data-open-devices>Geräte & Sensoren</button><button type="button" data-close-cal>Schließen</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-close-cal]').onclick = () => { if (!state.running) modal.hidden = true; };
    modal.querySelector('[data-open-devices]').onclick = () => { modal.hidden = true; window.RideTrackerDeviceCenter?.open?.(); };
    modal.querySelector('[data-run-cal]').onclick = () => void runCalibration();
    return modal;
  }

  function renderSensors() {
    const modal = ensureUi();
    const list = modal.querySelector('.rt-sensor-cal-list');
    const items = selectedSensors();
    list.innerHTML = items.length ? items.map(item => {
      const status = sensorStatus(item);
      return `<div class="rt-sensor-cal-row" data-sensor="${item.device.id}" data-kind="${status.kind}"><strong>${item.device.name || item.device.id}</strong><span>${status.text}</span></div>`;
    }).join('') : '<div class="rt-sensor-cal-row" data-kind="error"><strong>Keine Sensoren ausgewählt</strong><span>Aktiviere mindestens einen Sensor unter Geräte & Sensoren.</span></div>';
    return items;
  }

  function setRow(id, kind, text) {
    const row = ensureUi().querySelector(`[data-sensor="${id}"]`);
    if (!row) return;
    row.dataset.kind = kind;
    const span = row.querySelector('span');
    if (span) span.textContent = text;
  }

  async function waitFor(predicate, timeoutMs, intervalMs = 100) {
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      if (predicate()) return true;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    return false;
  }

  async function ensureInitialized() {
    const initState = byId('initState');
    if (/initialisiert/i.test(initState?.textContent || '') && !/nicht initialisiert/i.test(initState?.textContent || '')) return true;
    const init = byId('init');
    if (!init) return false;
    init.click();
    return waitFor(() => /initialisiert/i.test(initState?.textContent || '') && !/nicht initialisiert/i.test(initState?.textContent || ''), 15000, 120);
  }

  async function calibratePhoneMotion() {
    setRow('phone-motion', 'working', 'Initialisiere Bewegungssensoren …');
    const initialized = await ensureInitialized();
    if (!initialized) {
      setRow('phone-motion', 'error', 'Initialisierung nicht abgeschlossen. Bitte Sensorfreigabe prüfen.');
      return false;
    }
    if (phoneCalibrationReady()) {
      setRow('phone-motion', 'ready', 'Kalibriert · vorhandene Kalibrierung aktiv');
      return true;
    }
    const arm = byId('arm');
    if (!arm || arm.disabled) {
      setRow('phone-motion', 'error', 'Kalibrierungsfunktion ist noch nicht bereit.');
      return false;
    }
    setRow('phone-motion', 'working', 'Telefon ruhig in finaler Position halten · ca. 3 Sekunden');
    arm.click();
    const ok = await waitFor(phoneCalibrationReady, 12000, 120);
    if (!ok) {
      setRow('phone-motion', 'error', 'Keine stabile Kalibrierung erkannt. Telefon ruhig halten und erneut starten.');
      return false;
    }
    window.RideTrackerCalibrationManager?.saveCurrent?.();
    setRow('phone-motion', 'ready', 'Fertig ✓ · Achsen und Ruhelage gespeichert');
    return true;
  }

  async function runCalibration() {
    if (state.running) return false;
    state.running = true;
    const modal = ensureUi();
    modal.hidden = false;
    const items = renderSensors();
    const progress = modal.querySelector('.rt-sensor-cal-progress i');
    const active = items.filter(item => item.available);
    let done = 0;
    let success = true;
    try {
      for (const item of items) {
        if (!item.available) continue;
        if (!item.calibratable) {
          setRow(item.device.id, 'ready', 'Bereit ✓ · keine Kalibrierung nötig');
        } else if (item.device.id === 'phone-motion') {
          success = (await calibratePhoneMotion()) && success;
        } else if (externalImuCalibrationReady(item)) {
          setRow(item.device.id, 'ready', 'Bereit ✓ · gespeichertes Geräteprofil aktiv');
        } else {
          setRow(item.device.id, 'error', 'Gerät liefert Daten, ist aber noch nicht kalibriert. Bitte Geräte & Sensoren öffnen.');
          success = false;
        }
        done++;
        progress.style.width = `${active.length ? Math.round(done / active.length * 100) : 100}%`;
      }
      if (!active.length) {
        progress.style.width = '100%';
        success = true;
      }
      window.RideTrackerRecordingActions?.refresh?.();
      window.RideTrackerCalibrationManager?.refresh?.();
      if (success) {
        setTimeout(() => { if (!state.running) modal.hidden = true; }, 1100);
      }
      return success;
    } finally {
      state.running = false;
    }
  }

  async function ensureForStart() {
    const items = selectedSensors();
    const requiredAvailable = items.filter(item => item.available && item.calibratable);
    const phoneRequired = requiredAvailable.some(item => item.device.id === 'phone-motion');
    const externalUnready = requiredAvailable.some(item => item.device.id !== 'phone-motion' && !externalImuCalibrationReady(item));
    if ((!phoneRequired || phoneCalibrationReady() || window.RideTrackerCalibrationManager?.applyStored?.()) && !externalUnready) return true;
    const modal = ensureUi();
    renderSensors();
    modal.hidden = false;
    return false;
  }

  function install() {
    ensureUi();
    const manager = window.RideTrackerCalibrationManager;
    if (manager) {
      manager.ensureForStart = ensureForStart;
      manager.beginCalibration = runCalibration;
    }
    document.addEventListener('click', event => {
      const recalibrate = event.target.closest?.('[data-cal-recalibrate]');
      if (!recalibrate) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void runCalibration();
    }, true);
    document.addEventListener('click', event => {
      const now = event.target.closest?.('[data-cal-action="now"]');
      if (!now) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      byId('rtCalibrationPrompt')?.setAttribute('hidden', '');
      void runCalibration();
    }, true);
    window.RideTrackerSensorCalibration = { selectedSensors, run: runCalibration, ensureForStart, refresh: renderSensors };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})();
