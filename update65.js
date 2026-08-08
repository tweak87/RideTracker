(() => {
  'use strict';

  if (window.RideTrackerGForceDiagnostics) return;
  const quality = window.RideTrackerGForceQuality;
  const state = { latest:null, maximumHorizontalG:0, sampleRateHz:0, samples:0 };
  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

  function transformedLinear(event) {
    const acceleration = event?.acceleration;
    if (!acceleration || ![acceleration.x, acceleration.y, acceleration.z].some(finite)) return null;
    const vector = [Number(acceleration.x || 0), Number(acceleration.y || 0), Number(acceleration.z || 0)].map(value => value / quality.STANDARD_GRAVITY);
    const calibration = typeof S !== 'undefined' ? S?.cal : null;
    if (!calibration) return { lateralG:vector[0], longitudinalG:vector[1], horizontalG:Math.hypot(vector[0], vector[1]) };
    const dot = axis => vector.reduce((sum, value, index) => sum + value * Number(axis?.[index] || 0), 0);
    const lateralG = dot(calibration.lateral);
    const longitudinalG = dot(calibration.forward);
    return { lateralG, longitudinalG, horizontalG:Math.hypot(lateralG, longitudinalG) };
  }

  function sensorRate() {
    if (typeof S === 'undefined' || !Array.isArray(S.raw) || S.raw.length < 2) return 0;
    const latest = Number(S.raw.at(-1)?.now || 0);
    const recent = S.raw.filter(sample => latest - Number(sample.now || 0) <= 2000);
    if (recent.length < 2) return 0;
    const duration = (Number(recent.at(-1).now) - Number(recent[0].now)) / 1000;
    return duration > 0 ? (recent.length - 1) / duration : 0;
  }

  function capture(event) {
    if (typeof S === 'undefined' || !quality?.forceMetrics) return;
    const motion = Array.isArray(S.motion) ? S.motion.at(-1) : null;
    if (!motion) return;
    const metrics = quality.forceMetrics(motion);
    const linear = transformedLinear(event);
    Object.assign(motion, metrics, linear ? {
      linearLateralG:linear.lateralG,
      linearLongitudinalG:linear.longitudinalG,
      linearHorizontalG:linear.horizontalG,
    } : {});
    const sample = Array.isArray(S.samples) ? S.samples.at(-1) : null;
    if (sample?.type === 'motion' && Math.abs(Number(sample.t) - Number(motion.t)) < 0.05) Object.assign(sample, metrics, linear ? {
      linearLateralG:linear.lateralG,
      linearLongitudinalG:linear.longitudinalG,
      linearHorizontalG:linear.horizontalG,
    } : {});
    state.latest = {...metrics, linearHorizontalG:linear?.horizontalG ?? null, timestamp:performance.now()};
    state.maximumHorizontalG = Math.max(state.maximumHorizontalG, metrics.horizontalG);
    state.sampleRateHz = sensorRate();
    state.samples += 1;
    window.dispatchEvent(new CustomEvent('ridetracker:g-force-quality', { detail:snapshot() }));
  }

  function calibrationStatus() {
    const manager = window.RideTrackerCalibrationManager;
    if (!manager?.current?.()) return { label:'nicht kalibriert', kind:'warn' };
    const validation = manager.validation?.();
    if (!validation?.ready) return { label:'Lage wird geprüft', kind:'warn' };
    if (!manager.activeCompatible?.()) {
      if (validation?.reason === 'orientation-changed') return { label:`Lage +${Math.round(validation.angleDeg || 0)}° geändert`, kind:'error' };
      return { label:'Telefon kurz ruhig halten', kind:'warn' };
    }
    return { label:'Lage geprüft', kind:'ok' };
  }

  function snapshot() {
    return {
      latest:state.latest ? {...state.latest} : null,
      maximumHorizontalG:state.maximumHorizontalG,
      sampleRateHz:state.sampleRateHz,
      samples:state.samples,
      calibration:calibrationStatus(),
    };
  }

  function ensurePanel() {
    let panel = document.getElementById('rtGForceDiagnostics65');
    if (panel) return panel;
    const gps = document.getElementById('rtGpsHealth58');
    const video = document.getElementById('videoWrap');
    if (!gps && !video) return null;
    panel = document.createElement('section');
    panel.id = 'rtGForceDiagnostics65';
    panel.innerHTML = `<div class="rt65-head"><b>G-Kraft-Diagnose</b><span data-calibration>–</span></div><div class="rt65-grid"><div><small>Seitlich</small><strong data-lateral>–</strong></div><div><small>Seitlich in m/s²</small><strong data-lateral-ms2>–</strong></div><div><small>Horizontal gesamt</small><strong data-horizontal>–</strong></div><div><small>Sensorfrequenz</small><strong data-rate>–</strong></div></div><p data-hint>„Horizontal gesamt“ kombiniert seitliche und längs gerichtete Kraft. Bleibt dieser Wert deutlich größer als „Seitlich“, prüfe Vorwärtskante und Handylage.</p>`;
    (gps || video).after(panel);
    return panel;
  }

  function render() {
    const panel = ensurePanel();
    if (!panel) return;
    const data = snapshot();
    const latest = data.latest;
    const set = (selector, value) => { const node=panel.querySelector(selector); if (node && node.textContent !== value) node.textContent=value; };
    set('[data-calibration]', data.calibration.label);
    panel.dataset.calibration = data.calibration.kind;
    set('[data-lateral]', latest ? `${latest.lateralG.toFixed(2)} g` : '–');
    set('[data-lateral-ms2]', latest ? `${latest.lateralMS2.toFixed(2)} m/s²` : '–');
    set('[data-horizontal]', latest ? `${latest.horizontalG.toFixed(2)} g · max. ${data.maximumHorizontalG.toFixed(2)} g` : '–');
    set('[data-rate]', data.sampleRateHz > 0 ? `${Math.round(data.sampleRateHz)} Hz` : '–');
  }

  const style = document.createElement('style');
  style.id = 'rtGForceDiagnostics65Style';
  style.textContent = `#rtGForceDiagnostics65{margin:9px 0;border:1px solid #29435f;border-radius:13px;background:#081522;padding:10px;color:#f5fbff}#rtGForceDiagnostics65 .rt65-head{display:flex;justify-content:space-between;gap:8px;align-items:center}#rtGForceDiagnostics65 .rt65-head b{font-size:13px}#rtGForceDiagnostics65 .rt65-head span{font-size:11px;color:#5ee0a0}#rtGForceDiagnostics65[data-calibration="warn"] .rt65-head span{color:#ffd166}#rtGForceDiagnostics65[data-calibration="error"] .rt65-head span{color:#ff6680}#rtGForceDiagnostics65 .rt65-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:8px}#rtGForceDiagnostics65 .rt65-grid>div{background:#07111f;border-radius:9px;padding:7px}#rtGForceDiagnostics65 small{display:block;color:#96aac1;font-size:9px;text-transform:uppercase}#rtGForceDiagnostics65 strong{display:block;margin-top:2px;font-size:12px}#rtGForceDiagnostics65 p{margin:8px 2px 0;color:#96aac1;font-size:11px;line-height:1.4}@media(max-width:560px){#rtGForceDiagnostics65 .rt65-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
  document.head.appendChild(style);

  window.addEventListener('devicemotion', event => queueMicrotask(() => capture(event)), { passive:true });
  window.addEventListener('ridetracker:new-ride-session', () => { state.maximumHorizontalG=0; state.samples=0; render(); });
  window.addEventListener('ridetracker:recording-started', () => { state.maximumHorizontalG=0; render(); });
  setInterval(render, 250);
  render();

  window.RideTrackerGForceDiagnostics = { snapshot, render, calibrationStatus };
})();
