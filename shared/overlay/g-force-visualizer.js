(() => {
  'use strict';

  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const now = () => globalThis.performance?.now?.() ?? Date.now();

  function normalizeSample(sample = {}) {
    const lateralG = finite(sample.lateralG ?? sample.lateral ?? sample.lat) ? Number(sample.lateralG ?? sample.lateral ?? sample.lat) : 0;
    const longitudinalG = finite(sample.longitudinalG ?? sample.longitudinal ?? sample.long) ? Number(sample.longitudinalG ?? sample.longitudinal ?? sample.long) : 0;
    const normalG = finite(sample.normalG ?? sample.normal ?? sample.vert) ? Number(sample.normalG ?? sample.normal ?? sample.vert) : 1;
    return { lateralG, longitudinalG, normalG, horizontalG:Math.hypot(lateralG, longitudinalG) };
  }

  function createTrail(options = {}) {
    const maxAgeMs = Math.max(250, Number(options.maxAgeMs ?? 3000));
    const maxPoints = Math.max(4, Number(options.maxPoints ?? 72));
    const minimumIntervalMs = Math.max(0, Number(options.minimumIntervalMs ?? 24));
    const points = [];
    let lastTimestampMs = null;

    function trim(timestampMs) {
      const cutoff = timestampMs - maxAgeMs;
      while (points.length && points[0].timestampMs < cutoff) points.shift();
      if (points.length > maxPoints) points.splice(0, points.length - maxPoints);
    }

    function push(sample, timestampMs = now()) {
      timestampMs = finite(timestampMs) ? Number(timestampMs) : now();
      if (lastTimestampMs !== null && timestampMs < lastTimestampMs - 100) clear();
      const point = { ...normalizeSample(sample), timestampMs };
      if (points.length && timestampMs - points.at(-1).timestampMs < minimumIntervalMs) points[points.length - 1] = point;
      else points.push(point);
      lastTimestampMs = timestampMs;
      trim(timestampMs);
      return point;
    }

    function snapshot(timestampMs = lastTimestampMs ?? now()) {
      trim(Number(timestampMs));
      return points.map(point => ({ ...point, ageRatio:clamp((Number(timestampMs) - point.timestampMs) / maxAgeMs, 0, 1) }));
    }

    function clear() { points.length = 0; lastTimestampMs = null; }
    return { push, snapshot, clear, size:() => points.length, maxAgeMs, maxPoints };
  }

  function horizontalPoint(sample, geometry, rangeG = 2) {
    const value = normalizeSample(sample), radius = Number(geometry.radius || 0), cx = Number(geometry.cx || 0), cy = Number(geometry.cy || 0);
    return {
      x:cx + clamp(value.lateralG / rangeG, -1, 1) * radius,
      y:cy - clamp(value.longitudinalG / rangeG, -1, 1) * radius,
    };
  }

  function verticalPoint(sample, geometry, range = { min:-1, max:4 }) {
    const value = normalizeSample(sample), min = Number(range.min), max = Number(range.max), top = Number(geometry.top || 0), height = Number(geometry.height || 0);
    const ratio = (clamp(value.normalG, min, max) - min) / Math.max(0.001, max - min);
    return { x:Number(geometry.x || 0), y:top + (1 - ratio) * height };
  }

  function forceColor(sample, axis = 'horizontal') {
    const value = normalizeSample(sample), force = axis === 'vertical' ? value.normalG : value.horizontalG;
    if (axis === 'vertical') {
      if (force < 0.15) return '#a78bfa';
      if (force >= 3) return '#ff5d78';
      if (force >= 1.8) return '#ffd166';
      return '#5fd0ff';
    }
    if (force >= 1.25) return '#ff5d78';
    if (force >= 0.65) return '#ffd166';
    return '#5ee0a0';
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, width, height, radius);
    else ctx.rect(x, y, width, height);
  }

  function trailAppearance(ageRatio) {
    const freshness = 1 - clamp(Number(ageRatio) || 0, 0, 1);
    return {
      alpha:Math.pow(freshness, 1.45) * 0.82,
      glowAlpha:Math.pow(freshness, 1.8) * 0.24,
      widthFactor:0.22 + Math.pow(freshness, 0.7) * 0.78,
    };
  }

  function drawTrail(ctx, points, projector, color, lineWidth) {
    if (!points.length) return;
    const projected = points.map(point => ({ ...projector(point), ageRatio:point.ageRatio }));
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    if (projected.length === 1) {
      const point=projected[0],appearance=trailAppearance(point.ageRatio);
      ctx.globalAlpha=appearance.glowAlpha;ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=lineWidth*3;
      ctx.beginPath();ctx.arc(point.x,point.y,lineWidth*1.35,0,Math.PI*2);ctx.fill();ctx.restore();return;
    }
    for (let index = 1; index < points.length; index += 1) {
      const before=projected[Math.max(0,index-2)],previous=projected[index-1],current=projected[index];
      const start=index===1?previous:{x:(before.x+previous.x)/2,y:(before.y+previous.y)/2};
      const end=index===projected.length-1?current:{x:(previous.x+current.x)/2,y:(previous.y+current.y)/2};
      const appearance=trailAppearance((Number(previous.ageRatio)+Number(current.ageRatio))/2);
      if(appearance.alpha<=0)continue;
      const stroke=()=>{ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.quadraticCurveTo(previous.x,previous.y,end.x,end.y);ctx.stroke()};
      ctx.strokeStyle=color;ctx.globalAlpha=appearance.glowAlpha;ctx.lineWidth=lineWidth*2.8*appearance.widthFactor;ctx.shadowColor=color;ctx.shadowBlur=lineWidth*2.4;stroke();
      ctx.globalAlpha=appearance.alpha;ctx.lineWidth=lineWidth*appearance.widthFactor;ctx.shadowBlur=lineWidth*.7;stroke();
    }
    ctx.restore();
  }

  function draw(ctx, rect, sample, history = [], options = {}) {
    if (!ctx || !rect) return null;
    const value = normalizeSample(sample), compact = options.compact ?? rect.height < 190;
    const panelAlpha = clamp(Number(options.panelAlpha ?? 0.82), 0, 1), pad = Math.max(7, Math.min(rect.width, rect.height) * 0.055);
    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, Math.max(8, rect.height * 0.07));
    ctx.fillStyle = `rgba(4,18,29,${panelAlpha})`; ctx.fill(); ctx.strokeStyle = 'rgba(95,208,255,.82)'; ctx.lineWidth = Math.max(1, rect.height * 0.009); ctx.stroke();

    const titleHeight = compact ? pad * 0.65 : Math.max(20, rect.height * 0.13);
    ctx.fillStyle = '#f5fbff'; ctx.textAlign = 'left'; ctx.font = `800 ${Math.max(8, titleHeight * 0.58)}px system-ui`;
    ctx.fillText(compact ? 'G-BALL' : 'G-KRÄFTE · VERLAUF', rect.x + pad, rect.y + titleHeight * 0.78);

    const contentTop = rect.y + titleHeight, contentHeight = rect.height - titleHeight - pad * 0.35;
    const horizontalWidth = rect.width * (compact ? 0.68 : 0.64), horizontalCenterX = rect.x + horizontalWidth * 0.5;
    const horizontalCenterY = contentTop + contentHeight * 0.52;
    const radius = Math.max(8, Math.min(horizontalWidth * 0.39, contentHeight * 0.38));
    const horizontalGeometry = { cx:horizontalCenterX, cy:horizontalCenterY, radius };

    ctx.strokeStyle = 'rgba(245,251,255,.22)'; ctx.lineWidth = Math.max(1, radius * 0.012);
    for (const ratio of [0.25, 0.5, 1]) { ctx.beginPath(); ctx.arc(horizontalCenterX, horizontalCenterY, radius * ratio, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(horizontalCenterX - radius, horizontalCenterY); ctx.lineTo(horizontalCenterX + radius, horizontalCenterY); ctx.moveTo(horizontalCenterX, horizontalCenterY - radius); ctx.lineTo(horizontalCenterX, horizontalCenterY + radius); ctx.stroke();
    ctx.fillStyle = 'rgba(245,251,255,.68)'; ctx.font = `700 ${Math.max(7, radius * 0.13)}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText('L', horizontalCenterX - radius - pad * 0.38, horizontalCenterY + 3); ctx.fillText('R', horizontalCenterX + radius + pad * 0.38, horizontalCenterY + 3);
    if (!compact) { ctx.fillText('BESCHLEUNIGEN', horizontalCenterX, horizontalCenterY - radius - 5); ctx.fillText('BREMSEN', horizontalCenterX, horizontalCenterY + radius + Math.max(10, radius * 0.18)); }

    const visibleHistory = Array.isArray(history) ? history : [];
    drawTrail(ctx, visibleHistory, point => horizontalPoint(point, horizontalGeometry, 2), '#5fd0ff', Math.max(1.5, radius * 0.045));
    const horizontal = horizontalPoint(value, horizontalGeometry, 2), horizontalColor = forceColor(value, 'horizontal');
    ctx.fillStyle = horizontalColor; ctx.shadowColor = horizontalColor; ctx.shadowBlur = Math.max(5, radius * 0.16); ctx.beginPath(); ctx.arc(horizontal.x, horizontal.y, Math.max(4, radius * 0.075), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;

    const gaugeX = rect.x + rect.width * (compact ? 0.82 : 0.80), gaugeTop = contentTop + contentHeight * 0.09, gaugeHeight = contentHeight * 0.78;
    const verticalGeometry = { x:gaugeX, top:gaugeTop, height:gaugeHeight }, range = { min:-1, max:4 };
    const bandWidth = Math.max(7, rect.width * 0.025);
    const bands = [[-1,0.15,'#a78bfa'],[0.15,1.8,'#5fd0ff'],[1.8,3,'#ffd166'],[3,4,'#ff5d78']];
    for (const [min,max,color] of bands) {
      const topPoint = verticalPoint({normalG:max}, verticalGeometry, range), bottomPoint = verticalPoint({normalG:min}, verticalGeometry, range);
      ctx.strokeStyle = color; ctx.globalAlpha = 0.28; ctx.lineWidth = bandWidth; ctx.beginPath(); ctx.moveTo(gaugeX, topPoint.y); ctx.lineTo(gaugeX, bottomPoint.y); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(245,251,255,.7)'; ctx.lineWidth = Math.max(1, rect.height * 0.007); ctx.beginPath(); ctx.moveTo(gaugeX, gaugeTop); ctx.lineTo(gaugeX, gaugeTop + gaugeHeight); ctx.stroke();
    for (const tick of [0,1,2,3,4]) { const point=verticalPoint({normalG:tick}, verticalGeometry, range); ctx.beginPath(); ctx.moveTo(gaugeX-bandWidth*.9,point.y);ctx.lineTo(gaugeX+bandWidth*.9,point.y);ctx.stroke(); }
    drawTrail(ctx, visibleHistory, point => verticalPoint(point, verticalGeometry, range), '#f5fbff', Math.max(1.5, bandWidth * 0.42));
    const vertical = verticalPoint(value, verticalGeometry, range), verticalColor = forceColor(value, 'vertical');
    ctx.fillStyle = verticalColor; ctx.shadowColor = verticalColor; ctx.shadowBlur = Math.max(5, bandWidth); ctx.beginPath(); ctx.arc(vertical.x, vertical.y, Math.max(4, bandWidth * 0.65), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#f5fbff'; ctx.font = `800 ${Math.max(8, contentHeight * (compact ? 0.10 : 0.085))}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText(`${value.normalG >= 0 ? '+' : ''}${value.normalG.toFixed(1)} G`, gaugeX, gaugeTop + gaugeHeight + Math.max(12, contentHeight * 0.11));
    if (!compact) { ctx.fillStyle='rgba(245,251,255,.7)';ctx.font=`700 ${Math.max(8,contentHeight*.055)}px system-ui`;ctx.fillText('VERTIKAL',gaugeX,gaugeTop-7); }
    return { horizontal, vertical, value };
  }

  globalThis.RideTrackerGForceVisualizer = Object.freeze({ normalizeSample, createTrail, horizontalPoint, verticalPoint, forceColor, trailAppearance, draw });
})();
