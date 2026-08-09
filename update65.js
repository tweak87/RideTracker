(() => {
  'use strict';

  if (window.RideTrackerGForceDiagnostics) return;
  const quality = window.RideTrackerGForceQuality;
  const visualizer = window.RideTrackerGForceVisualizer;
  const state = { latest:null, maximumHorizontalG:0, maximumNormalG:0, minimumNormalG:Infinity, sampleRateHz:0, samples:0, trail:visualizer?.createTrail?.({maxAgeMs:3000,maxPoints:150,minimumIntervalMs:20}) };
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
    state.maximumNormalG = Math.max(state.maximumNormalG, metrics.normalG);
    state.minimumNormalG = Math.min(state.minimumNormalG, metrics.normalG);
    state.sampleRateHz = sensorRate();
    state.samples += 1;
    state.trail?.push?.(metrics,state.latest.timestamp);
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
      maximumNormalG:state.maximumNormalG,
      minimumNormalG:Number.isFinite(state.minimumNormalG)?state.minimumNormalG:null,
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
    panel.innerHTML = `<div class="rt65-head"><div><b>G-Kräfte intuitiv</b><small>Draufsicht, Vertikallast und 3-Sekunden-Schweif</small></div><span data-calibration>–</span></div><canvas id="rtGForceDetailCanvas65" width="960" height="430" aria-label="G-Kraft-Verlauf: Seiten- und Längskräfte in der Draufsicht sowie vertikale Belastung"></canvas><div class="rt65-legend"><span><i class="rt65-dot horizontal"></i>Draufsicht: links/rechts · beschleunigen/bremsen</span><span><i class="rt65-dot vertical"></i>Vertikal: Airtime bis hohe positive Last</span></div><div class="rt65-grid"><div><small>Seitenkraft</small><strong data-lateral>–</strong></div><div><small>Vertikallast</small><strong data-normal>–</strong></div><div><small>Horizontal gesamt</small><strong data-horizontal>–</strong></div><div><small>Sensorfrequenz</small><strong data-rate>–</strong></div></div><p data-hint>Der helle Punkt ist der aktuelle Wert. Der auslaufende Schweif zeigt die letzten drei Sekunden. Die Draufsicht bleibt auch dann verständlich, wenn Seiten- und Längsrichtung gleichzeitig wirken.</p>`;
    (gps || video).after(panel);
    return panel;
  }

  function drawDetail(panel, data) {
    const canvas=panel?.querySelector('#rtGForceDetailCanvas65');if(!canvas||!visualizer?.draw)return;
    const rect=canvas.getBoundingClientRect(),width=Math.max(300,rect.width||canvas.clientWidth||600),height=Math.max(210,Math.min(430,width*.48)),dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr)}
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const current=data.latest||{normalG:1,lateralG:0,longitudinalG:0},timestamp=current.timestamp??performance.now();
    visualizer.draw(ctx,{x:1,y:1,width:width-2,height:height-2},current,state.trail?.snapshot?.(timestamp)||[],{compact:false,panelAlpha:.9});
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
    set('[data-normal]', latest ? `${latest.normalG.toFixed(2)} g · ${latest.normalG < .15 ? 'Airtime' : latest.normalG >= 2.5 ? 'hohe Last' : 'Fahrt'}` : '–');
    set('[data-horizontal]', latest ? `${latest.horizontalG.toFixed(2)} g · max. ${data.maximumHorizontalG.toFixed(2)} g` : '–');
    set('[data-rate]', data.sampleRateHz > 0 ? `${Math.round(data.sampleRateHz)} Hz` : '–');
    drawDetail(panel,data);
  }

  const style = document.createElement('style');
  style.id = 'rtGForceDiagnostics65Style';
  style.textContent = `#rtGForceDiagnostics65{margin:9px 0;border:1px solid #29435f;border-radius:16px;background:#081522;padding:11px;color:#f5fbff}#rtGForceDiagnostics65 .rt65-head{display:flex;justify-content:space-between;gap:8px;align-items:start}#rtGForceDiagnostics65 .rt65-head b{font-size:15px}#rtGForceDiagnostics65 .rt65-head small{display:block;margin-top:2px;color:#96aac1;font-size:10px;text-transform:none}#rtGForceDiagnostics65 .rt65-head>span{font-size:11px;color:#5ee0a0}#rtGForceDiagnostics65[data-calibration="warn"] .rt65-head>span{color:#ffd166}#rtGForceDiagnostics65[data-calibration="error"] .rt65-head>span{color:#ff6680}#rtGForceDetailCanvas65{display:block;width:100%;height:auto;min-height:210px;max-height:430px;margin-top:9px;border-radius:13px;background:#04121d}#rtGForceDiagnostics65 .rt65-legend{display:flex;gap:8px 16px;flex-wrap:wrap;margin:8px 2px;color:#a9bdcf;font-size:10px}.rt65-dot{display:inline-block;width:8px;height:8px;margin-right:5px;border-radius:50%}.rt65-dot.horizontal{background:#5ee0a0}.rt65-dot.vertical{background:#5fd0ff}#rtGForceDiagnostics65 .rt65-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:8px}#rtGForceDiagnostics65 .rt65-grid>div{background:#07111f;border-radius:9px;padding:8px}#rtGForceDiagnostics65 small{display:block;color:#96aac1;font-size:9px;text-transform:uppercase}#rtGForceDiagnostics65 strong{display:block;margin-top:3px;font-size:12px}#rtGForceDiagnostics65 p{margin:8px 2px 0;color:#96aac1;font-size:11px;line-height:1.4}@media(max-width:560px){#rtGForceDiagnostics65 .rt65-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#rtGForceDetailCanvas65{min-height:230px}}`;
  document.head.appendChild(style);

  window.addEventListener('devicemotion', event => queueMicrotask(() => capture(event)), { passive:true });
  window.addEventListener('ridetracker:new-ride-session', () => { state.maximumHorizontalG=0; state.maximumNormalG=0; state.minimumNormalG=Infinity; state.samples=0; state.trail?.clear?.(); render(); });
  window.addEventListener('ridetracker:recording-started', () => { state.maximumHorizontalG=0; state.maximumNormalG=0; state.minimumNormalG=Infinity; state.trail?.clear?.(); render(); });
  setInterval(render, 250);
  render();

  window.RideTrackerGForceDiagnostics = { snapshot, render, calibrationStatus };
})();
