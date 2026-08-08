(function track3dFactory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RideTrackerTrack3D = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createTrack3DModule() {
  'use strict';

  const EARTH_RADIUS_M = 6371008.8;
  const METRICS = {
    speedKmh: { label: 'Geschwindigkeit', unit: 'km/h', palette: ['#2563eb', '#14b8a6', '#facc15', '#ef4444'] },
    normalG: { label: 'Vertikalkraft', unit: 'g', palette: ['#312e81', '#38bdf8', '#f8fafc', '#fb7185', '#7f1d1d'] },
    lateralG: { label: 'Seitenkraft', unit: 'g', palette: ['#312e81', '#38bdf8', '#f8fafc', '#fb7185', '#7f1d1d'] },
    longitudinalG: { label: 'Längskraft', unit: 'g', palette: ['#312e81', '#38bdf8', '#f8fafc', '#fb7185', '#7f1d1d'] },
    totalG: { label: 'Gesamtkraft', unit: 'g', palette: ['#0f766e', '#84cc16', '#facc15', '#ef4444'] },
    elevationM: { label: 'Höhe', unit: 'm', palette: ['#064e3b', '#22c55e', '#fde68a', '#f8fafc'] },
    confidence: { label: 'Modellgüte', unit: '%', palette: ['#64748b', '#facc15', '#22c55e'] }
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const lerp = (a, b, t) => a + (b - a) * t;

  function quantile(values, q) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const index = (sorted.length - 1) * q;
    const low = Math.floor(index);
    const high = Math.ceil(index);
    return low === high ? sorted[low] : lerp(sorted[low], sorted[high], index - low);
  }

  function metricRange(points, metric) {
    const values = points.map((point) => finite(point[metric])).filter(Number.isFinite);
    if (!values.length) return { min: 0, max: 1 };
    let min = quantile(values, 0.03);
    let max = quantile(values, 0.97);
    if (metric === 'confidence') return { min: 0, max: 1 };
    if (['normalG', 'lateralG', 'longitudinalG'].includes(metric)) {
      const extent = Math.max(Math.abs(min), Math.abs(max), 0.1);
      min = -extent; max = extent;
    }
    if (Math.abs(max - min) < 1e-9) { min -= 0.5; max += 0.5; }
    return { min, max };
  }

  function hexToRgb(hex) {
    const normalized = hex.replace('#', '');
    const value = parseInt(normalized.length === 3 ? normalized.split('').map((c) => c + c).join('') : normalized, 16);
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
  }

  function metricColor(metric, value, range) {
    const palette = METRICS[metric]?.palette || METRICS.speedKmh.palette;
    const min = finite(range?.min, 0);
    const max = finite(range?.max, 1);
    const t = clamp((finite(value, min) - min) / Math.max(1e-9, max - min), 0, 1);
    const scaled = t * (palette.length - 1);
    const index = Math.min(palette.length - 2, Math.floor(scaled));
    const mix = scaled - index;
    const left = hexToRgb(palette[index]);
    const right = hexToRgb(palette[index + 1]);
    return `rgb(${Math.round(lerp(left.r, right.r, mix))},${Math.round(lerp(left.g, right.g, mix))},${Math.round(lerp(left.b, right.b, mix))})`;
  }

  function sourceSamples(source) {
    const root = source?.document || source || {};
    const samples = Array.isArray(root.samples) ? root.samples : (Array.isArray(source?.samples) ? source.samples : []);
    const gps = Array.isArray(root.gps?.points) ? root.gps.points : [];
    if (samples.some((sample) => finite(sample.latitude ?? sample.lat) !== null)) return samples;
    if (!gps.length) return samples;
    return gps.map((point, index) => {
      const sample = samples.length ? samples[Math.min(samples.length - 1, Math.round(index * (samples.length - 1) / Math.max(1, gps.length - 1)))] : {};
      return { ...sample, ...point };
    });
  }

  function normalizeExistingPoints(source) {
    const points = source?.points || source?.model?.points;
    if (!Array.isArray(points) || !points.length || finite(points[0]?.x) === null) return null;
    return points.map((point, index) => ({
      i: index, x: finite(point.x, 0), y: finite(point.y, 0), z: finite(point.z, 0),
      speedKmh: finite(point.speedKmh, finite(point.speedMS) !== null ? finite(point.speedMS) * 3.6 : null),
      normalG: finite(point.normalG), lateralG: finite(point.lateralG),
      longitudinalG: finite(point.longitudinalG), totalG: finite(point.totalG),
      elevationM: finite(point.elevationM, finite(point.y, 0)), confidence: finite(point.confidence, 1),
      timestamp: finite(point.timestamp)
    }));
  }

  function geographicPoints(source) {
    const samples = sourceSamples(source);
    const candidates = samples.filter((sample) => finite(sample.latitude ?? sample.lat) !== null && finite(sample.longitude ?? sample.lon ?? sample.lng) !== null);
    if (!candidates.length) return [];
    const originLat = finite(candidates[0].latitude ?? candidates[0].lat);
    const originLon = finite(candidates[0].longitude ?? candidates[0].lon ?? candidates[0].lng);
    const originAlt = finite(candidates[0].relativeAltitudeM, finite(candidates[0].altitude, 0));
    const cosLat = Math.cos(originLat * Math.PI / 180);
    const points = [];
    candidates.forEach((sample) => {
      const lat = finite(sample.latitude ?? sample.lat);
      const lon = finite(sample.longitude ?? sample.lon ?? sample.lng);
      const relativeAltitude = finite(sample.relativeAltitudeM);
      const absoluteAltitude = finite(sample.altitude, originAlt);
      const x = (lon - originLon) * Math.PI / 180 * EARTH_RADIUS_M * cosLat;
      const z = -(lat - originLat) * Math.PI / 180 * EARTH_RADIUS_M;
      const y = relativeAltitude !== null ? relativeAltitude : absoluteAltitude - originAlt;
      const point = {
        x, y, z,
        speedKmh: finite(sample.speedKmh, finite(sample.speedMS) !== null ? finite(sample.speedMS) * 3.6 : null),
        normalG: finite(sample.normalG), lateralG: finite(sample.lateralG),
        longitudinalG: finite(sample.longitudinalG), totalG: finite(sample.totalG),
        elevationM: y, confidence: finite(sample.confidence, 1), timestamp: finite(sample.timestamp)
      };
      const previous = points[points.length - 1];
      const distance = previous ? Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z) : Infinity;
      if (distance >= 0.15 || !previous) points.push(point);
      else Object.keys(point).forEach((key) => { if (point[key] !== null) previous[key] = point[key]; });
    });
    return points;
  }

  function smoothSpatial(points, radius = 2) {
    if (points.length < 5 || radius < 1) return points.map((point) => ({ ...point }));
    return points.map((point, index) => {
      if (index === 0 || index === points.length - 1) return { ...point };
      const slice = points.slice(Math.max(0, index - radius), Math.min(points.length, index + radius + 1));
      return {
        ...point,
        x: slice.reduce((sum, item) => sum + item.x, 0) / slice.length,
        y: slice.reduce((sum, item) => sum + item.y, 0) / slice.length,
        z: slice.reduce((sum, item) => sum + item.z, 0) / slice.length
      };
    });
  }

  function interpolatePoint(left, right, t, index) {
    const result = { i: index };
    ['x','y','z','speedKmh','normalG','lateralG','longitudinalG','totalG','elevationM','confidence','timestamp'].forEach((key) => {
      const a = finite(left[key]); const b = finite(right[key]);
      result[key] = a !== null && b !== null ? lerp(a, b, t) : (a ?? b);
    });
    return result;
  }

  function resample(points, targetCount = 192) {
    if (points.length < 2) return points.map((point, index) => ({ ...point, i: index }));
    const cumulative = [0];
    for (let index = 1; index < points.length; index += 1) {
      cumulative[index] = cumulative[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y, points[index].z - points[index - 1].z);
    }
    const total = cumulative[cumulative.length - 1];
    if (total < 0.01) return points.map((point, index) => ({ ...point, i: index }));
    const count = clamp(Math.round(targetCount), 16, 320);
    const output = [];
    let cursor = 1;
    for (let index = 0; index < count; index += 1) {
      const distance = total * index / (count - 1);
      while (cursor < cumulative.length - 1 && cumulative[cursor] < distance) cursor += 1;
      const leftIndex = Math.max(0, cursor - 1);
      const span = Math.max(1e-9, cumulative[cursor] - cumulative[leftIndex]);
      output.push(interpolatePoint(points[leftIndex], points[cursor], (distance - cumulative[leftIndex]) / span, index));
    }
    return output;
  }

  function calculateBounds(points) {
    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
    points.forEach((point) => {
      bounds.minX = Math.min(bounds.minX, point.x); bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.minY = Math.min(bounds.minY, point.y); bounds.maxY = Math.max(bounds.maxY, point.y);
      bounds.minZ = Math.min(bounds.minZ, point.z); bounds.maxZ = Math.max(bounds.maxZ, point.z);
    });
    return bounds;
  }

  function finalizeModel(points, source = {}, sourceCount = 1) {
    const root = source?.document || source || {};
    const durationFromPoints = points.length > 1 && points[0].timestamp !== null && points.at(-1).timestamp !== null ? Math.max(0, points.at(-1).timestamp - points[0].timestamp) : 0;
    let distanceM = 0;
    for (let index = 1; index < points.length; index += 1) distanceM += Math.hypot(points[index].x-points[index-1].x, points[index].y-points[index-1].y, points[index].z-points[index-1].z);
    const ranges = {};
    Object.keys(METRICS).forEach((metric) => { ranges[metric] = metricRange(points, metric); });
    return {
      version: 1, points, bounds: calculateBounds(points), ranges,
      distanceM: finite(source.distanceM, finite(root.metadata?.distanceM, distanceM)),
      durationMs: finite(source.durationMs, finite(root.metadata?.durationMs, durationFromPoints)),
      sourceCount,
      summary: {
        maxSpeedKmh: Math.max(0, ...points.map((point) => finite(point.speedKmh, 0))),
        maxTotalG: Math.max(0, ...points.map((point) => finite(point.totalG, 0))),
        elevationRangeM: metricRange(points, 'elevationM')
      }
    };
  }

  function deriveTrackModel(source, options = {}) {
    let points = normalizeExistingPoints(source) || geographicPoints(source);
    if (points.length < 2) return null;
    points = resample(smoothSpatial(points, finite(options.smoothingRadius, 2)), finite(options.targetPoints, 192));
    return finalizeModel(points, source, finite(source?.sourceCount, 1));
  }

  function median(values) { return quantile(values.filter(Number.isFinite), 0.5); }

  function mergeModels(models, options = {}) {
    const valid = models.map((model) => deriveTrackModel(model, options)).filter((model) => model?.points?.length > 1);
    if (!valid.length) return null;
    const count = finite(options.targetPoints, 192);
    const normalized = valid.map((model) => resample(model.points, count));
    const points = normalized[0].map((_, index) => {
      const point = { i: index };
      ['x','y','z','speedKmh','normalG','lateralG','longitudinalG','totalG','elevationM'].forEach((metric) => {
        const values = normalized.map((modelPoints) => finite(modelPoints[index]?.[metric])).filter(Number.isFinite);
        point[metric] = values.length ? median(values) : null;
      });
      point.confidence = Math.min(1, normalized.length / 5);
      return point;
    });
    return finalizeModel(points, { distanceM: median(valid.map((model) => model.distanceM)), durationMs: median(valid.map((model) => model.durationMs)) }, valid.length);
  }

  function escapeXml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[character]));
  }

  function thumbnailSvg(model, options = {}) {
    const width = finite(options.width, 320); const height = finite(options.height, 180);
    const metric = METRICS[options.metric] ? options.metric : 'speedKmh';
    const title = escapeXml(options.title || 'Streckenmodell');
    const points = model?.points || [];
    if (points.length < 2) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#1e293b"/></linearGradient></defs><rect width="100%" height="100%" rx="18" fill="url(#bg)"/><path d="M35 ${height-35} Q${width*.35} 22 ${width*.56} ${height*.55} T${width-30} 38" fill="none" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" opacity=".8"/><text x="20" y="30" fill="#e2e8f0" font-family="system-ui" font-size="15" font-weight="700">${title}</text></svg>`;
    }
    const xs = points.map((point) => point.x); const zs = points.map((point) => point.z);
    const minX = Math.min(...xs); const maxX = Math.max(...xs); const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
    const scale = Math.min((width - 40) / Math.max(1, maxX-minX), (height - 58) / Math.max(1, maxZ-minZ));
    const offsetX = (width - (maxX-minX)*scale)/2; const offsetY = 40 + (height-52-(maxZ-minZ)*scale)/2;
    const project = (point) => `${(offsetX+(point.x-minX)*scale).toFixed(1)},${(offsetY+(point.z-minZ)*scale).toFixed(1)}`;
    const range = model.ranges?.[metric] || metricRange(points, metric);
    const segments = points.slice(1).map((point, index) => `<path d="M${project(points[index])} L${project(point)}" stroke="${metricColor(metric, point[metric], range)}" stroke-width="5" stroke-linecap="round"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" rx="18" fill="#08111f"/><path d="M${project(points[0])} ${points.slice(1).map((point)=>`L${project(point)}`).join(' ')}" fill="none" stroke="#020617" stroke-width="10" opacity=".65"/>${segments}<circle cx="${project(points[0]).split(',')[0]}" cy="${project(points[0]).split(',')[1]}" r="5" fill="#fff"/><text x="18" y="27" fill="#f8fafc" font-family="system-ui" font-size="15" font-weight="700">${title}</text><text x="${width-18}" y="${height-14}" text-anchor="end" fill="#94a3b8" font-family="system-ui" font-size="11">${escapeXml(METRICS[metric].label)}</text></svg>`;
  }

  function thumbnailDataUri(model, options) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(thumbnailSvg(model, options))}`;
  }

  function createRenderer(canvas, initialModel, options = {}) {
    if (!canvas?.getContext) throw new Error('Für den 3D-Viewer wird ein Canvas-Element benötigt.');
    const context = canvas.getContext('2d');
    let model = initialModel;
    let metric = METRICS[options.metric] ? options.metric : 'speedKmh';
    let yaw = -0.65; let pitch = -0.52; let zoom = 1;
    let drag = null; let pinchDistance = null; let animationFrame = null; let destroyed = false;
    const pointers = new Map();

    function resize() {
      const ratio = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(320, Math.round(rect.width || canvas.clientWidth || 640));
      const height = Math.max(220, Math.round(rect.height || canvas.clientHeight || 420));
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio; canvas.height = height * ratio; context.setTransform(ratio,0,0,ratio,0,0);
      }
      return { width, height };
    }

    function transform(point, width, height) {
      const bounds = model.bounds || calculateBounds(model.points);
      const centerX = (bounds.minX+bounds.maxX)/2; const centerY = (bounds.minY+bounds.maxY)/2; const centerZ = (bounds.minZ+bounds.maxZ)/2;
      const x = point.x-centerX; const y=(point.y-centerY)*1.8; const z=point.z-centerZ;
      const cy=Math.cos(yaw), sy=Math.sin(yaw), cp=Math.cos(pitch), sp=Math.sin(pitch);
      const x1=x*cy-z*sy; const z1=x*sy+z*cy; const y1=y*cp-z1*sp; const depth=y*sp+z1*cp;
      const extent=Math.max(1,bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ,(bounds.maxY-bounds.minY)*2);
      const scale=Math.min(width,height)*0.72/extent*zoom;
      const perspective=1/(1+depth/Math.max(200,extent*5));
      return { x:width/2+x1*scale*perspective, y:height*.52-y1*scale*perspective, depth };
    }

    function render() {
      animationFrame = null;
      if (destroyed) return;
      const { width, height } = resize();
      const gradient=context.createLinearGradient(0,0,0,height); gradient.addColorStop(0,'#07111f'); gradient.addColorStop(1,'#101b2c');
      context.fillStyle=gradient; context.fillRect(0,0,width,height);
      if (!model?.points?.length) { context.fillStyle='#cbd5e1'; context.font='600 16px system-ui'; context.textAlign='center'; context.fillText('Keine Streckendaten verfügbar',width/2,height/2); return; }
      context.strokeStyle='rgba(148,163,184,.14)'; context.lineWidth=1;
      for(let line=1;line<6;line+=1){context.beginPath();context.moveTo(width*.1,height*(.2+line*.11));context.lineTo(width*.9,height*(.2+line*.11));context.stroke();}
      const projected=model.points.map((point)=>transform(point,width,height));
      context.lineCap='round'; context.lineJoin='round'; context.globalAlpha=.35; context.strokeStyle='#000'; context.lineWidth=10;
      context.beginPath(); context.moveTo(projected[0].x+3,projected[0].y+5); projected.slice(1).forEach((point)=>context.lineTo(point.x+3,point.y+5)); context.stroke(); context.globalAlpha=1;
      const range=model.ranges?.[metric]||metricRange(model.points,metric);
      for(let index=1;index<projected.length;index+=1){context.strokeStyle=metricColor(metric,model.points[index][metric],range);context.lineWidth=5;context.beginPath();context.moveTo(projected[index-1].x,projected[index-1].y);context.lineTo(projected[index].x,projected[index].y);context.stroke();}
      context.fillStyle='#fff'; context.beginPath(); context.arc(projected[0].x,projected[0].y,5,0,Math.PI*2); context.fill();
      context.textAlign='left'; context.fillStyle='#e2e8f0'; context.font='700 14px system-ui'; context.fillText(METRICS[metric].label,18,28);
      context.fillStyle='#94a3b8'; context.font='12px system-ui'; context.fillText('Ziehen: drehen · Mausrad/Pinch: zoomen',18,height-18);
    }

    function requestRender(){if(animationFrame===null) animationFrame=typeof requestAnimationFrame==='function'?requestAnimationFrame(render):setTimeout(render,0);}
    function pointerDown(event){pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});drag={x:event.clientX,y:event.clientY};if(pointers.size===2){const [left,right]=[...pointers.values()];pinchDistance=Math.hypot(right.x-left.x,right.y-left.y);}canvas.setPointerCapture?.(event.pointerId);}
    function pointerMove(event){if(!pointers.has(event.pointerId))return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size>=2){const [left,right]=[...pointers.values()];const distance=Math.hypot(right.x-left.x,right.y-left.y);if(pinchDistance)zoom=clamp(zoom*distance/pinchDistance,.35,4);pinchDistance=distance;requestRender();return;}if(!drag)return;yaw+=(event.clientX-drag.x)*.008;pitch=clamp(pitch+(event.clientY-drag.y)*.008,-1.35,.35);drag={x:event.clientX,y:event.clientY};requestRender();}
    function pointerUp(event){pointers.delete(event?.pointerId);pinchDistance=null;const remaining=[...pointers.values()][0];drag=remaining?{...remaining}:null;canvas.releasePointerCapture?.(event?.pointerId);}
    function wheel(event){event.preventDefault();zoom=clamp(zoom*Math.exp(-event.deltaY*.001),.35,4);requestRender();}
    canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerUp);canvas.addEventListener('wheel',wheel,{passive:false});
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(requestRender):null;observer?.observe(canvas);requestRender();
    return {
      setMetric(next){if(METRICS[next])metric=next;requestRender();return metric;},
      setModel(next){model=next;requestRender();},
      reset(){yaw=-.65;pitch=-.52;zoom=1;requestRender();},
      render:requestRender,
      toDataUrl(){render();return canvas.toDataURL('image/png');},
      destroy(){destroyed=true;observer?.disconnect();canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointercancel',pointerUp);canvas.removeEventListener('wheel',wheel);if(animationFrame!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(animationFrame);}
    };
  }

  return { METRICS, deriveTrackModel, mergeModels, metricRange, metricColor, thumbnailSvg, thumbnailDataUri, createRenderer };
});
