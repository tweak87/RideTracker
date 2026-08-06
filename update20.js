import { chooseSpeedScale, normalizeFrame, pointerPosition, vibrationLevel } from './shared/overlay/overlay-core.js';

const spec = await fetch('./shared/overlay/overlay-spec.json', { cache: 'no-store' }).then(response => {
  if (!response.ok) throw new Error(`Overlay-Spezifikation konnte nicht geladen werden (${response.status})`);
  return response.json();
});

const videoWrap = document.getElementById('videoWrap');
if (videoWrap) {
  const style = document.createElement('style');
  style.id = 'rtSharedOverlayStyle';
  style.textContent = `
    #videoWrap{isolation:isolate!important}
    #videoWrap>#hud{display:none!important;visibility:hidden!important;opacity:0!important}
    #rtSharedOverlay{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;z-index:40!important;display:block!important;pointer-events:none!important}
    #rtOverlayError{position:absolute;left:10px;right:10px;bottom:10px;z-index:50;padding:10px 12px;border:1px solid #ff3b30;border-radius:10px;background:rgba(35,0,0,.9);color:#fff;font:600 12px system-ui;display:none}
  `;
  document.head.appendChild(style);

  const legacyHud = document.getElementById('hud');
  if (legacyHud) {
    legacyHud.hidden = true;
    legacyHud.setAttribute('aria-hidden', 'true');
    new MutationObserver(() => {
      legacyHud.hidden = true;
      legacyHud.setAttribute('aria-hidden', 'true');
      legacyHud.style.setProperty('display', 'none', 'important');
    }).observe(legacyHud, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  }

  document.getElementById('rtSharedOverlay')?.remove();
  const canvas = document.createElement('canvas');
  canvas.id = 'rtSharedOverlay';
  canvas.setAttribute('aria-label', 'RideTracker Telemetrie-Overlay');
  videoWrap.appendChild(canvas);

  const errorBox = document.createElement('div');
  errorBox.id = 'rtOverlayError';
  videoWrap.appendChild(errorBox);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D wird von diesem Browser nicht unterstützt.');

  const histories = { vibration: [], pulse: [] };
  const number = id => Number(String(document.getElementById(id)?.textContent || '').replace(',', '.').match(/[-+]?\d+(?:\.\d+)?/)?.[0] || 0);
  const signed = value => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
  const rect = key => {
    const [x, y, width, height] = spec.layout[key];
    return [x * canvas.width, y * canvas.height, width * canvas.width, height * canvas.height];
  };
  const roundedRect = (x, y, width, height, radius) => {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, width, height, radius);
    else {
      const r = Math.min(radius, width / 2, height / 2);
      ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y); ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx.lineTo(x + width, y + height - r); ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      ctx.lineTo(x + r, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - r);
      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    }
  };
  const panel = (x, y, width, height, title) => {
    const scale = Math.min(canvas.width / spec.designWidth, canvas.height / spec.designHeight);
    ctx.save();
    roundedRect(x, y, width, height, 18 * scale);
    ctx.fillStyle = 'rgba(6,20,22,.86)';
    ctx.fill();
    ctx.strokeStyle = spec.theme.cyan;
    ctx.lineWidth = Math.max(1, 2 * scale);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(245,251,255,.18)';
    ctx.lineWidth = Math.max(1, scale);
    roundedRect(x + 5 * scale, y + 5 * scale, width - 10 * scale, height - 10 * scale, 14 * scale);
    ctx.stroke();
    if (title) {
      ctx.fillStyle = spec.theme.white;
      ctx.font = `600 ${Math.max(11 * scale, height * .075)}px system-ui,-apple-system,sans-serif`;
      ctx.fillText(title, x + width * .06, y + height * .13);
    }
    ctx.restore();
  };

  function currentFrame() {
    const replaySession = window.__rideTrackerReplaySession;
    const video = document.getElementById('nativeReplayVideo') || document.getElementById('replay');
    if (replaySession?.samples?.length && video && !video.classList.contains('hidden')) {
      const offset = Number(document.getElementById('nativeReplayOffset')?.value || replaySession.video?.startOffsetSeconds || 0);
      const timeMs = Math.max(0, (video.currentTime - offset) * 1000);
      let sample = replaySession.samples[0];
      for (const candidate of replaySession.samples) {
        if ((candidate.timestampMs ?? candidate.timestamp * 1000) > timeMs) break;
        sample = candidate;
      }
      return normalizeFrame(sample, timeMs);
    }
    return normalizeFrame({
      lateralG: number('latVal'),
      normalG: number('normalVal') || 1,
      longitudinalG: number('hudLong'),
      speed: { valueKmh: number('speed') },
      heartRateBpm: number('heartRateValue') || null,
      vibrationRmsMs2: number('vibrationValue')
    }, performance.now());
  }

  function drawGrid(x, y, width, height, columns = 8, rows = 4) {
    ctx.save();
    ctx.strokeStyle = 'rgba(35,64,71,.35)';
    ctx.lineWidth = 1;
    for (let i = 1; i < columns; i++) {
      const px = x + width * i / columns;
      ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + height); ctx.stroke();
    }
    for (let i = 1; i < rows; i++) {
      const py = y + height * i / rows;
      ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + width, py); ctx.stroke();
    }
    ctx.restore();
  }

  function drawFrame() {
    try {
      const box = videoWrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(box.width * dpr));
      const height = Math.max(1, Math.round(box.height * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      ctx.clearRect(0, 0, width, height);
      const frame = currentFrame();
      const cyan = spec.theme.cyan, orange = spec.theme.warning, red = spec.theme.heart;
      const scale = Math.min(width / spec.designWidth, height / spec.designHeight);

      let [x, y, panelWidth, panelHeight] = rect('pulse');
      panel(x, y, panelWidth, panelHeight, 'PULS');
      drawGrid(x + panelWidth * .34, y + panelHeight * .24, panelWidth * .58, panelHeight * .42);
      const bpm = frame.heartRate.bpm || 0;
      histories.pulse.push(bpm); histories.pulse = histories.pulse.slice(-40);
      const pulseColor = bpm >= spec.limits.pulseCritical ? red : bpm >= spec.limits.pulseWarning ? orange : cyan;
      ctx.fillStyle = pulseColor;
      ctx.font = `700 ${panelHeight * .24}px system-ui`;
      ctx.fillText(bpm || '–', x + panelWidth * .06, y + panelHeight * .82);
      ctx.font = `500 ${panelHeight * .10}px system-ui`;
      ctx.fillStyle = spec.theme.white;
      ctx.fillText('BPM', x + panelWidth * .33, y + panelHeight * .82);
      ctx.strokeStyle = pulseColor; ctx.lineWidth = Math.max(2, 3 * scale); ctx.beginPath();
      histories.pulse.forEach((value, index) => {
        const px = x + panelWidth * .35 + index / 39 * panelWidth * .58;
        const baseline = bpm || value;
        const beat = index % 9 === 5 ? -panelHeight * .17 : index % 9 === 6 ? panelHeight * .11 : 0;
        const py = y + panelHeight * .46 + beat - (value - baseline) * panelHeight * .008;
        index ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      });
      ctx.stroke();

      [x, y, panelWidth, panelHeight] = rect('speed');
      panel(x, y, panelWidth, panelHeight, 'GESCHWINDIGKEIT');
      const speed = frame.speed.valueKmh;
      const speedScale = chooseSpeedScale(speed, speed, spec.limits.speedScales);
      const centerX = x + panelWidth * .5, centerY = y + panelHeight * .67, radius = panelWidth * .36;
      const startAngle = Math.PI * 1.1, endAngle = Math.PI * 1.9;
      ctx.strokeStyle = 'rgba(245,251,255,.22)'; ctx.lineWidth = Math.max(3, 8 * scale); ctx.beginPath(); ctx.arc(centerX, centerY, radius, startAngle, endAngle); ctx.stroke();
      ctx.strokeStyle = cyan; ctx.lineWidth = Math.max(3, 7 * scale); ctx.beginPath(); ctx.arc(centerX, centerY, radius, startAngle, startAngle + (endAngle - startAngle) * Math.min(speed / speedScale, 1)); ctx.stroke();
      ctx.strokeStyle = orange; ctx.lineWidth = Math.max(2, 5 * scale); ctx.beginPath(); ctx.arc(centerX, centerY, radius, startAngle + (endAngle - startAngle) * .78, endAngle); ctx.stroke();
      ctx.fillStyle = spec.theme.white; ctx.textAlign = 'center'; ctx.font = `700 ${panelHeight * .35}px system-ui`; ctx.fillText(Math.round(speed), centerX, y + panelHeight * .65);
      ctx.fillStyle = cyan; ctx.font = `600 ${panelHeight * .10}px system-ui`; ctx.fillText('KM/H', centerX, y + panelHeight * .82); ctx.textAlign = 'start';

      [x, y, panelWidth, panelHeight] = rect('gDial');
      const dialX = x + panelWidth / 2, dialY = y + panelHeight / 2, dialRadius = Math.min(panelWidth, panelHeight) * .42;
      ctx.strokeStyle = cyan; ctx.lineWidth = Math.max(1, 2 * scale); ctx.beginPath(); ctx.arc(dialX, dialY, dialRadius, 0, Math.PI * 2); ctx.stroke();
      for (let ring = 1; ring < 4; ring++) { ctx.strokeStyle = 'rgba(125,146,154,.45)'; ctx.beginPath(); ctx.arc(dialX, dialY, dialRadius * ring / 4, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(245,251,255,.75)'; ctx.beginPath(); ctx.moveTo(dialX - dialRadius, dialY); ctx.lineTo(dialX + dialRadius, dialY); ctx.moveTo(dialX, dialY - dialRadius); ctx.lineTo(dialX, dialY + dialRadius); ctx.stroke();
      const pointer = pointerPosition(frame.gForce.lateral, frame.gForce.vertical, spec.limits.gDisplayRange, dialX, dialY, dialRadius);
      ctx.strokeStyle = frame.gForce.longitudinal < 0 ? orange : cyan; ctx.lineWidth = Math.max(3, 6 * scale); ctx.beginPath(); ctx.moveTo(dialX, dialY); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
      ctx.fillStyle = cyan; ctx.beginPath(); ctx.arc(pointer.x, pointer.y, Math.max(4, 8 * scale), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = spec.theme.white; ctx.textAlign = 'center'; ctx.font = `600 ${Math.max(9, 15 * scale)}px system-ui`; ctx.fillText('UP', dialX, dialY - dialRadius - 8 * scale); ctx.fillText('DOWN', dialX, dialY + dialRadius + 18 * scale); ctx.textAlign = 'start';

      [x, y, panelWidth, panelHeight] = rect('gValues');
      panel(x, y, panelWidth, panelHeight, '');
      ctx.font = `600 ${panelHeight * .16}px system-ui`; ctx.fillStyle = spec.theme.muted;
      ['LATERAL', 'VERTICAL', 'LONGITUDINAL'].forEach((label, index) => ctx.fillText(label, x + panelWidth * (.06 + index * .33), y + panelHeight * .28));
      ctx.font = `700 ${panelHeight * .28}px system-ui`;
      [frame.gForce.lateral, frame.gForce.vertical, frame.gForce.longitudinal].forEach((value, index) => {
        ctx.fillStyle = value < 0 ? orange : cyan;
        ctx.fillText(`${signed(value)} G`, x + panelWidth * (.06 + index * .33), y + panelHeight * .73);
      });

      [x, y, panelWidth, panelHeight] = rect('vibration');
      panel(x, y, panelWidth, panelHeight, 'VIBRATION');
      drawGrid(x + panelWidth * .06, y + panelHeight * .20, panelWidth * .88, panelHeight * .44, 10, 3);
      const vibration = frame.vibration.rmsMs2 || 0;
      histories.vibration.push(vibration); histories.vibration = histories.vibration.slice(-32);
      const vibrationColor = vibrationLevel(vibration, spec.limits) === 'high' ? red : vibrationLevel(vibration, spec.limits) === 'medium' ? orange : cyan;
      ctx.fillStyle = vibrationColor;
      histories.vibration.forEach((value, index) => {
        const barHeight = Math.min(value / 12, 1) * panelHeight * .35;
        ctx.fillRect(x + panelWidth * .07 + index * panelWidth * .026, y + panelHeight * .62 - barHeight, panelWidth * .012, barHeight);
      });
      ctx.font = `700 ${panelHeight * .20}px system-ui`; ctx.fillText(vibration.toFixed(1), x + panelWidth * .38, y + panelHeight * .88);
      ctx.fillStyle = spec.theme.white; ctx.font = `500 ${panelHeight * .09}px system-ui`; ctx.fillText('m/s²', x + panelWidth * .66, y + panelHeight * .88);

      errorBox.style.display = 'none';
    } catch (error) {
      console.error('RideTracker Overlay render error', error);
      errorBox.textContent = `Overlay-Fehler: ${error.message}`;
      errorBox.style.display = 'block';
    }
    requestAnimationFrame(drawFrame);
  }

  requestAnimationFrame(drawFrame);
}
