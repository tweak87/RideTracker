(() => {
  'use strict';

  const STORAGE_KEY = 'rideTracker.calibration.v1';
  const state = { restored: false, prompted: false, lastSavedAt: null };
  const byId = id => document.getElementById(id);

  function readStored() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return value && value.calibration ? value : null;
    } catch (_) { return null; }
  }

  function currentCalibration() {
    try {
      if (typeof S !== 'undefined' && S?.cal) return S.cal;
      const value = typeof payload === 'function' ? payload()?.calibration : null;
      return value || null;
    } catch (_) { return null; }
  }

  function initialized() {
    return /initialisiert/i.test(byId('initState')?.textContent || '') && !/nicht initialisiert/i.test(byId('initState')?.textContent || '');
  }

  function selectedForward() { return byId('forward')?.value || 'top'; }
  function selectedMode() { return byId('calMode')?.value || 'auto'; }

  function saveCurrent() {
    const calibration = currentCalibration();
    if (!calibration) return false;
    const record = {
      version: 1,
      savedAt: new Date().toISOString(),
      forwardEdge: selectedForward(),
      mode: selectedMode(),
      calibration
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    state.lastSavedAt = record.savedAt;
    state.restored = false;
    window.dispatchEvent(new CustomEvent('ridetracker:calibration-saved', { detail: record }));
    refreshStatus();
    return true;
  }

  function applyStored(record = readStored()) {
    if (!record?.calibration) return false;
    if (record.forwardEdge && record.forwardEdge !== selectedForward()) return false;
    try {
      if (typeof S === 'undefined') return false;
      S.cal = record.calibration;
      S.calArmed = false;
      const calState = byId('calState');
      if (calState) {
        calState.textContent = 'kalibriert · gespeichert';
        calState.classList.add('ok');
      }
      if (initialized() && byId('start')) byId('start').disabled = false;
      state.restored = true;
      state.lastSavedAt = record.savedAt || null;
      window.dispatchEvent(new CustomEvent('ridetracker:calibration-restored', { detail: record }));
      refreshStatus();
      return true;
    } catch (_) { return false; }
  }

  function clearCurrentKeepStored() {
    try {
      if (typeof S !== 'undefined') S.cal = null;
    } catch (_) {}
    state.restored = false;
    const calState = byId('calState');
    if (calState) {
      calState.textContent = 'nicht kalibriert';
      calState.classList.remove('ok');
    }
    if (byId('start')) byId('start').disabled = true;
    refreshStatus();
  }

  function beginCalibration() {
    clearCurrentKeepStored();
    const arm = byId('arm');
    if (!initialized()) {
      byId('init')?.click();
      const wait = setInterval(() => {
        if (!initialized()) return;
        clearInterval(wait);
        setTimeout(() => byId('arm')?.click(), 80);
      }, 120);
      setTimeout(() => clearInterval(wait), 15000);
      return true;
    }
    if (arm && !arm.disabled) { arm.click(); return true; }
    return false;
  }

  function ensureDialog() {
    let dialog = byId('rtCalibrationPrompt');
    if (dialog) return dialog;
    dialog = document.createElement('div');
    dialog.id = 'rtCalibrationPrompt';
    dialog.hidden = true;
    dialog.innerHTML = `
      <div class="rt-cal-dialog-card" role="dialog" aria-modal="true" aria-labelledby="rtCalibrationPromptTitle">
        <strong id="rtCalibrationPromptTitle">Sensoren kalibrieren?</strong>
        <p id="rtCalibrationPromptText">Für diese Geräteposition ist noch keine Kalibrierung vorhanden.</p>
        <div class="rt-cal-dialog-actions">
          <button type="button" class="primary" data-cal-action="now">Jetzt kalibrieren</button>
          <button type="button" data-cal-action="cancel">Abbrechen</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', event => {
      const action = event.target.closest?.('[data-cal-action]')?.dataset.calAction;
      if (!action) return;
      dialog.hidden = true;
      if (action === 'now') beginCalibration();
    });
    return dialog;
  }

  function showCalibrationPrompt() {
    state.prompted = true;
    const dialog = ensureDialog();
    const stored = readStored();
    const mismatch = stored && stored.forwardEdge && stored.forwardEdge !== selectedForward();
    const text = byId('rtCalibrationPromptText');
    if (text) text.textContent = mismatch
      ? 'Die gespeicherte Kalibrierung gehört zu einer anderen Vorwärtskante. Bitte für die aktuelle Montage neu kalibrieren.'
      : 'Für diese Geräteposition ist noch keine Kalibrierung vorhanden. Die Kalibrierung dauert nur wenige Sekunden.';
    dialog.hidden = false;
  }

  async function ensureForStart() {
    if (currentCalibration()) return true;
    if (applyStored()) return true;
    showCalibrationPrompt();
    return false;
  }

  function calibrationAgeText() {
    const stored = readStored();
    if (!stored?.savedAt) return '';
    const ageDays = Math.max(0, Math.floor((Date.now() - Date.parse(stored.savedAt)) / 86400000));
    return ageDays === 0 ? 'heute' : ageDays === 1 ? 'gestern' : `vor ${ageDays} Tagen`;
  }

  function ensureStyles() {
    if (byId('rtCalibration41Style')) return;
    const style = document.createElement('style');
    style.id = 'rtCalibration41Style';
    style.textContent = `
      #rtCalibrationPrompt{position:fixed;inset:0;z-index:2147483500;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:20px}
      #rtCalibrationPrompt[hidden]{display:none!important}.rt-cal-dialog-card{width:min(430px,100%);border:1px solid #315170;border-radius:18px;background:#0c1b2d;padding:18px;box-shadow:0 18px 60px rgba(0,0,0,.55)}
      .rt-cal-dialog-card strong{font-size:20px}.rt-cal-dialog-card p{color:#aabbd0;line-height:1.45}.rt-cal-dialog-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:14px}
      #rtCalibrationReuseInfo{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 10px;border:1px solid #29435f;border-radius:12px;background:#071321;color:#aabbd0;font-size:12px}
      #rtCalibrationReuseInfo button{padding:7px 10px;font-size:12px;white-space:nowrap}
      @media(max-width:520px){.rt-cal-dialog-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureReuseInfo() {
    const panel = byId('rtRecordingQuickStart');
    if (!panel || byId('rtCalibrationReuseInfo')) return;
    const info = document.createElement('div');
    info.id = 'rtCalibrationReuseInfo';
    info.innerHTML = '<span data-cal-info>Kalibrierung prüfen …</span><button type="button" data-cal-recalibrate>Neu kalibrieren</button>';
    panel.querySelector('.rt-quick-status')?.after(info);
    info.querySelector('[data-cal-recalibrate]').onclick = beginCalibration;
  }

  function refreshStatus() {
    ensureReuseInfo();
    const info = byId('rtCalibrationReuseInfo');
    if (!info) return;
    const text = info.querySelector('[data-cal-info]');
    const stored = readStored();
    const current = currentCalibration();
    if (current && state.restored) text.textContent = `Gespeicherte Kalibrierung aktiv${calibrationAgeText() ? ` · ${calibrationAgeText()}` : ''}`;
    else if (current) text.textContent = 'Aktuelle Kalibrierung aktiv';
    else if (stored && stored.forwardEdge === selectedForward()) text.textContent = `Kalibrierung gespeichert${calibrationAgeText() ? ` · ${calibrationAgeText()}` : ''}`;
    else text.textContent = 'Keine passende Kalibrierung vorhanden';
  }

  function maybePersistAfterCalibration() {
    const label = byId('calState')?.textContent || '';
    if (/kalibriert/i.test(label) && currentCalibration() && !state.restored) saveCurrent();
  }

  function restoreWhenReady() {
    if (!currentCalibration()) applyStored();
    if (currentCalibration() && initialized() && byId('start')) byId('start').disabled = false;
    refreshStatus();
  }

  const observer = new MutationObserver(() => {
    maybePersistAfterCalibration();
    restoreWhenReady();
  });

  const install = () => {
    ensureStyles();
    ensureDialog();
    restoreWhenReady();
    const calState = byId('calState');
    const initState = byId('initState');
    if (calState) observer.observe(calState, { childList: true, subtree: true, attributes: true });
    if (initState) observer.observe(initState, { childList: true, subtree: true, attributes: true });
    byId('forward')?.addEventListener('change', () => { clearCurrentKeepStored(); applyStored(); });
    window.addEventListener('ridetracker:recording-stopped', refreshStatus);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();

  window.RideTrackerCalibrationManager = {
    ensureForStart,
    beginCalibration,
    applyStored,
    saveCurrent,
    stored: readStored,
    current: currentCalibration,
    refresh: refreshStatus
  };
})();
