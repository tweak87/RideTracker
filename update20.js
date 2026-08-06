import { chooseSpeedScale, normalizeFrame, pointerPosition, vibrationLevel } from './shared/overlay/overlay-core.js';

const spec = await fetch('./shared/overlay/overlay-spec.json', { cache: 'no-store' }).then(r => {
  if (!r.ok) throw new Error(`Overlay-Spezifikation konnte nicht geladen werden (${r.status})`);
  return r.json();
});

const wrap = document.getElementById('videoWrap');
if (wrap) {
  const style = document.createElement('style');
  style.textContent = `
    #videoWrap{isolation:isolate!important;position:relative!important}
    #videoWrap>#hud{display:none!important;visibility:hidden!important;opacity:0!important}
    #rtSharedOverlay{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;z-index:40!important;display:block!important;pointer-events:none}
    #rtOverlayToolbar{position:absolute;z-index:60;top:8px;left:8px;display:flex;gap:6px}
    #rtOverlayToolbar button{border:1px solid rgba(0,229,255,.75);border-radius:9px;background:rgba(6,20,22,.88);color:#f5fbff;padding:7px 9px;font:600 11px system-ui}
    #rtOverlayToolbar button[aria-pressed="true"]{background:#00e5ff;color:#061416}
    #rtOverlayError{position:absolute;left:10px;right:10px;bottom:10px;z-index:70;padding:10px 12px;border:1px solid #ff3b30;border-radius:10px;background:rgba(35,0,0,.9);color:#fff;font:600 12px system-ui;display:none}
  `;
  document.head.appendChild(style);

  const legacy = document.getElementById('hud');
  if (legacy) {
    legacy.hidden = true;
    legacy.setAttribute('aria-hidden', 'true');
    new MutationObserver(() => legacy.style.setProperty('display', 'none', 'important')).observe(legacy, { attributes: true });
  }

  document.getElementById('rtSharedOverlay')?.remove();
  document.getElementById('rtOverlayToolbar')?.remove();
  const canvas = document.createElement('canvas');
  canvas.id = 'rtSharedOverlay';
  wrap.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D wird nicht unterstützt.');

  const toolbar = document.createElement('div');
  toolbar.id = 'rtOverlayToolbar';
  toolbar.innerHTML = '<button id="rtEditHud" type="button" aria-pressed="false">HUD verschieben</button><button id="rtResetHud" type="button">Positionen zurücksetzen</button>';
  wrap.appendChild(toolbar);
  const editButton = toolbar.querySelector('#rtEditHud');
  const resetButton = toolbar.querySelector('#rtResetHud');
  const errorBox = document.createElement('div');
  errorBox.id = 'rtOverlayError';
  wrap.appendChild(errorBox);

  const storageKey = 'rideTracker.overlay.layouts.v1';
  const overrides = JSON.parse(localStorage.getItem(storageKey) || '{}');
  let editMode = false;
  let drag = null;
  let orientation = 'landscape';
  let contentRect = { x: 0, y: 0, width: 1, height: 1 };
  let activeLayout = {};
  let lastFrame = null;
  let lastFrameTime = 0;
  let jerk = 0;
  const histories = { pulse: [], vibration: [] };
  const num = id => Number(String(document.getElementById(id)?.textContent || '').replace(',', '.').match(/[-+]?\d+(?:\.\d+)?/)?.[0] || 0);
  const signed = v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;

  function visibleVideo() {
    const candidates = [...wrap.querySelectorAll('video')].filter(v => getComputedStyle(v).display !== 'none' && !v.classList.contains('hidden'));
    return candidates.find(v => v.videoWidth && v.videoHeight) || candidates[0] || null;
  }

  function calculateContentRect(cssWidth, cssHeight) {
    const video = visibleVideo();
    const sourceWidth = video?.videoWidth || (cssWidth >= cssHeight ? 1920 : 1080);
    const sourceHeight = video?.videoHeight || (cssWidth >= cssHeight ? 1080 : 1920);
    const sourceAspect = sourceWidth / sourceHeight;
    const boxAspect = cssWidth / cssHeight;
    let width = cssWidth, height = cssHeight, x = 0, y = 0;
    if (boxAspect > sourceAspect) { height = cssHeight; width = height * sourceAspect; x = (cssWidth - width) / 2; }
    else { width = cssWidth; height = width / sourceAspect; y = (cssHeight - height) / 2; }
    return { x, y, width, height, sourceAspect };
  }

  function layoutFor(mode) {
    const base = structuredClone(spec.layouts[mode]);
    const saved = overrides[mode] || {};
    for (const [key, value] of Object.entries(saved)) if (base[key] && Array.isArray(value)) base[key] = value;
    return base;
  }

  function panelRect(key) {
    const [nx, ny, nw, nh] = activeLayout[key];
    return {
      x: contentRect.x + nx * contentRect.width,
      y: contentRect.y + ny * contentRect.height,
      width: nw * contentRect.width,
      height: nh * contentRect.height
    };
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else { const q = Math.min(r, w / 2, h / 2); ctx.moveTo(x + q, y); ctx.arcTo(x + w, y, x + w, y + h, q); ctx.arcTo(x + w, y + h, x, y + h, q); ctx.arcTo(x, y + h, x, y, q); ctx.arcTo(x, y, x + w, y, q); }
  }

  function panel(rect, title, scale) {
    roundedRect(rect.x, rect.y, rect.width, rect.height, 16 * scale);
    ctx.fillStyle = 'rgba(6,20,22,.86)'; ctx.fill();
    ctx.strokeStyle = spec.theme.cyan; ctx.lineWidth = Math.max(1, 2 * scale); ctx.stroke();
    if (editMode) { ctx.save(); ctx.setLineDash([7 * scale, 5 * scale]); ctx.strokeStyle = '#f5fbff'; ctx.lineWidth = Math.max(1, scale); ctx.stroke(); ctx.restore(); }
    if (title) { ctx.fillStyle = spec.theme.white; ctx.font = `600 ${Math.max(10, rect.height * .08)}px system-ui`; ctx.fillText(title, rect.x + rect.width * .06, rect.y + rect.height * .14); }
  }

  function currentFrame() {
    const session = window.__rideTrackerReplaySession;
    const replayVideo = document.getElementById('nativeReplayVideo') || document.getElementById('replay');
    if (session?.samples?.length && replayVideo && !replayVideo.classList.contains('hidden')) {
      const offset = Number(document.getElementById('nativeReplayOffset')?.value || session.video?.startOffsetSeconds || 0);
      const t = Math.max(0, (replayVideo.currentTime - offset) * 1000);
      let sample = session.samples[0];
      for (const candidate of session.samples) { if ((candidate.timestampMs ?? candidate.timestamp * 1000) > t) break; sample = candidate; }
      return normalizeFrame(sample, t);
    }
    return normalizeFrame({ lateralG: num('latVal'), normalG: num('normalVal') || 1, longitudinalG: num('hudLong'), speed: { valueKmh: num('speed') }, heartRateBpm: num('heartRateValue') || null, vibrationRmsMs2: num('vibrationValue') }, performance.now());
  }

  function drawPulse(r, f, scale) {
    panel(r, 'PULS', scale); const bpm = f.heartRate.bpm || 0;
    histories.pulse.push(bpm); histories.pulse = histories.pulse.slice(-36);
    const color = bpm >= spec.limits.pulseCritical ? spec.theme.critical : bpm >= spec.limits.pulseWarning ? spec.theme.warning : spec.theme.cyan;
    ctx.fillStyle = color; ctx.font = `700 ${r.height * .25}px system-ui`; ctx.fillText(bpm || '–', r.x + r.width * .06, r.y + r.height * .82);
    ctx.fillStyle = spec.theme.white; ctx.font = `500 ${r.height * .10}px system-ui`; ctx.fillText('BPM', r.x + r.width * .34, r.y + r.height * .82);
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, 3 * scale); ctx.beginPath();
    histories.pulse.forEach((value, i) => { const x = r.x + r.width * (.37 + i / 35 * .56); const beat = i % 9 === 5 ? -.17 : i % 9 === 6 ? .10 : 0; const y = r.y + r.height * (.47 + beat); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  }

  function drawSpeed(r, f, scale) {
    panel(r, 'GESCHWINDIGKEIT', scale); const value = f.speed.valueKmh || 0; const max = chooseSpeedScale(value, value, spec.limits.speedScales);
    const cx = r.x + r.width / 2, cy = r.y + r.height * .68, radius = r.width * .35, start = Math.PI * 1.1, end = Math.PI * 1.9;
    ctx.strokeStyle = 'rgba(245,251,255,.25)'; ctx.lineWidth = Math.max(3, 7 * scale); ctx.beginPath(); ctx.arc(cx, cy, radius, start, end); ctx.stroke();
    ctx.strokeStyle = spec.theme.cyan; ctx.beginPath(); ctx.arc(cx, cy, radius, start, start + (end - start) * Math.min(value / max, 1)); ctx.stroke();
    ctx.strokeStyle = spec.theme.warning; ctx.lineWidth = Math.max(2, 4 * scale); ctx.beginPath(); ctx.arc(cx, cy, radius, start + (end - start) * .78, end); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = spec.theme.white; ctx.font = `700 ${r.height * .34}px system-ui`; ctx.fillText(Math.round(value), cx, r.y + r.height * .66);
    ctx.fillStyle = spec.theme.cyan; ctx.font = `600 ${r.height * .10}px system-ui`; ctx.fillText('KM/H', cx, r.y + r.height * .84); ctx.textAlign = 'start';
  }

  function drawDial(r, f, scale) {
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2, radius = Math.min(r.width, r.height) * .42;
    ctx.strokeStyle = spec.theme.cyan; ctx.lineWidth = Math.max(1, 2 * scale); ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
    for (let i = 1; i < 4; i++) { ctx.strokeStyle = 'rgba(125,146,154,.45)'; ctx.beginPath(); ctx.arc(cx, cy, radius * i / 4, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(245,251,255,.75)'; ctx.beginPath(); ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy); ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius); ctx.stroke();
    const p = pointerPosition(f.gForce.lateral, f.gForce.vertical, spec.limits.gDisplayRange, cx, cy, radius);
    ctx.strokeStyle = f.gForce.longitudinal < 0 ? spec.theme.warning : spec.theme.cyan; ctx.lineWidth = Math.max(3, 6 * scale); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.fillStyle = spec.theme.cyan; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(4, 7 * scale), 0, Math.PI * 2); ctx.fill();
  }

  function drawGValues(r, f, scale) {
    panel(r, '', scale); const labels = ['LATERAL', 'VERTICAL', 'LONGITUDINAL']; const values = [f.gForce.lateral, f.gForce.vertical, f.gForce.longitudinal];
    labels.forEach((label, i) => { const x = r.x + r.width * (.06 + i * .33); ctx.fillStyle = spec.theme.muted; ctx.font = `600 ${r.height * .15}px system-ui`; ctx.fillText(label, x, r.y + r.height * .28); ctx.fillStyle = values[i] < 0 ? spec.theme.warning : spec.theme.cyan; ctx.font = `700 ${r.height * .28}px system-ui`; ctx.fillText(`${signed(values[i])} G`, x, r.y + r.height * .73); });
  }

  function drawVibration(r, f, scale) {
    panel(r, 'VIBRATION', scale); const value = f.vibration.rmsMs2 || 0; histories.vibration.push(value); histories.vibration = histories.vibration.slice(-30);
    const color = vibrationLevel(value, spec.limits) === 'high' ? spec.theme.critical : vibrationLevel(value, spec.limits) === 'medium' ? spec.theme.warning : spec.theme.cyan;
    ctx.fillStyle = color; histories.vibration.forEach((v, i) => { const h = Math.min(v / 12, 1) * r.height * .38; ctx.fillRect(r.x + r.width * (.07 + i * .029), r.y + r.height * .63 - h, r.width * .014, h); });
    ctx.font = `700 ${r.height * .20}px system-ui`; ctx.fillText(value.toFixed(1), r.x + r.width * .38, r.y + r.height * .89); ctx.fillStyle = spec.theme.white; ctx.font = `500 ${r.height * .09}px system-ui`; ctx.fillText('m/s²', r.x + r.width * .66, r.y + r.height * .89);
  }

  function drawDynamics(r, f, scale, now) {
    panel(r, 'FAHRDYNAMIK', scale);
    if (lastFrame && now > lastFrameTime) { const dt = (now - lastFrameTime) / 1000; const dg = Math.hypot(f.gForce.lateral - lastFrame.gForce.lateral, f.gForce.vertical - lastFrame.gForce.vertical, f.gForce.longitudinal - lastFrame.gForce.longitudinal); jerk = dg / Math.max(dt, .001); }
    lastFrame = f; lastFrameTime = now;
    const airtime = f.gForce.vertical < .2; const braking = f.gForce.longitudinal < -.2; const launch = f.gForce.longitudinal > .2;
    const status = airtime ? 'AIRTIME' : braking ? 'BREMSEN' : launch ? 'LAUNCH' : 'FAHRT';
    ctx.fillStyle = airtime || jerk >= spec.limits.jerkCriticalGPerSecond ? spec.theme.critical : jerk >= spec.limits.jerkWarningGPerSecond ? spec.theme.warning : spec.theme.cyan;
    ctx.font = `700 ${r.height * .20}px system-ui`; ctx.fillText(`${f.gForce.total.toFixed(2)} G`, r.x + r.width * .06, r.y + r.height * .48);
    ctx.font = `600 ${r.height * .13}px system-ui`; ctx.fillText(`${jerk.toFixed(1)} G/s`, r.x + r.width * .52, r.y + r.height * .48);
    ctx.fillStyle = spec.theme.white; ctx.font = `600 ${r.height * .12}px system-ui`; ctx.fillText(status, r.x + r.width * .06, r.y + r.height * .78);
  }

  function draw() {
    try {
      const box = wrap.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 2);
      const cssWidth = Math.max(1, box.width), cssHeight = Math.max(1, box.height);
      const pixelWidth = Math.round(cssWidth * dpr), pixelHeight = Math.round(cssHeight * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cssWidth, cssHeight);
      contentRect = calculateContentRect(cssWidth, cssHeight); orientation = contentRect.sourceAspect < 1 ? 'portrait' : 'landscape'; activeLayout = layoutFor(orientation);
      const designW = orientation === 'portrait' ? spec.portraitDesignWidth : spec.designWidth; const designH = orientation === 'portrait' ? spec.portraitDesignHeight : spec.designHeight;
      const scale = Math.min(contentRect.width / designW, contentRect.height / designH); const frame = currentFrame(); const now = performance.now();
      drawPulse(panelRect('pulse'), frame, scale); drawSpeed(panelRect('speed'), frame, scale); drawDial(panelRect('gDial'), frame, scale); drawGValues(panelRect('gValues'), frame, scale); drawVibration(panelRect('vibration'), frame, scale); drawDynamics(panelRect('dynamics'), frame, scale, now);
      errorBox.style.display = 'none';
    } catch (error) { console.error(error); errorBox.textContent = `Overlay-Fehler: ${error.message}`; errorBox.style.display = 'block'; }
    requestAnimationFrame(draw);
  }

  function hitTest(x, y) {
    return Object.keys(activeLayout).reverse().find(key => { const r = panelRect(key); return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height; });
  }

  editButton.addEventListener('click', () => { editMode = !editMode; editButton.setAttribute('aria-pressed', String(editMode)); canvas.style.pointerEvents = editMode ? 'auto' : 'none'; });
  resetButton.addEventListener('click', () => { delete overrides[orientation]; localStorage.setItem(storageKey, JSON.stringify(overrides)); activeLayout = layoutFor(orientation); });
  canvas.addEventListener('pointerdown', event => { if (!editMode) return; const rect = canvas.getBoundingClientRect(); const x = event.clientX - rect.left, y = event.clientY - rect.top; const key = hitTest(x, y); if (!key) return; const p = panelRect(key); drag = { key, dx: x - p.x, dy: y - p.y }; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => { if (!drag) return; const rect = canvas.getBoundingClientRect(); const x = event.clientX - rect.left - drag.dx, y = event.clientY - rect.top - drag.dy; const item = activeLayout[drag.key]; item[0] = Math.max(0, Math.min(1 - item[2], (x - contentRect.x) / contentRect.width)); item[1] = Math.max(0, Math.min(1 - item[3], (y - contentRect.y) / contentRect.height)); overrides[orientation] = overrides[orientation] || {}; overrides[orientation][drag.key] = [...item]; });
  const endDrag = () => { if (!drag) return; localStorage.setItem(storageKey, JSON.stringify(overrides)); drag = null; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

  requestAnimationFrame(draw);
}
