export const G0 = 9.80665;

export function smoothValue(current, target, deltaMs, smoothingMs) {
  if (!Number.isFinite(current)) return target;
  const alpha = 1 - Math.exp(-Math.max(0, deltaMs) / Math.max(1, smoothingMs));
  return current + (target - current) * alpha;
}

export function chooseSpeedScale(speedKmh, peakKmh, scales = [100, 200, 300]) {
  const required = Math.max(0, speedKmh || 0, peakKmh || 0);
  return scales.find(value => value >= required) || Math.ceil(required / 100) * 100 || scales[0];
}

export function vibrationLevel(rms, limits) {
  if (rms >= limits.vibrationCritical) return 'high';
  if (rms >= limits.vibrationWarning) return 'medium';
  return 'low';
}

export function pointerPosition(lateral, vertical, range, centerX, centerY, radius) {
  const clamp = value => Math.max(-1, Math.min(1, value / range));
  return {
    x: centerX + clamp(lateral) * radius,
    y: centerY - clamp(vertical) * radius
  };
}

export function frameAtTime(samples, presentationTimeMs) {
  if (!samples?.length) return null;
  let low = 0, high = samples.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if ((samples[mid].timestampMs ?? samples[mid].timestamp * 1000) <= presentationTimeMs) low = mid;
    else high = mid - 1;
  }
  return samples[low];
}

export function normalizeFrame(sample = {}, timestampMs = 0) {
  const lateral = Number(sample.gForce?.lateral ?? sample.lateralG ?? 0);
  const vertical = Number(sample.gForce?.vertical ?? sample.normalG ?? sample.verticalG ?? 1);
  const longitudinal = Number(sample.gForce?.longitudinal ?? sample.longitudinalG ?? 0);
  const heading = sample.compass?.headingDeg ?? sample.headingDeg;
  return {
    timestampMs,
    gForce: { lateral, vertical, longitudinal, total: Number(sample.gForce?.total ?? sample.totalG ?? Math.hypot(lateral, vertical, longitudinal)) },
    speed: { valueKmh: Number(sample.speed?.valueKmh ?? sample.speedMS ?? 0) * (sample.speed?.valueKmh == null ? 3.6 : 1), source: sample.speed?.source ?? 'gps', accuracyKmh: sample.speed?.accuracyKmh ?? null },
    heartRate: { bpm: sample.heartRate?.bpm ?? sample.heartRateBpm ?? null, source: sample.heartRate?.source ?? (sample.heartRateBpm ? 'bluetooth' : 'none'), valid: Boolean(sample.heartRate?.valid ?? sample.heartRateBpm) },
    vibration: { rmsMs2: Number(sample.vibration?.rmsMs2 ?? sample.vibrationRmsMs2 ?? 0), peakMs2: Number(sample.vibration?.peakMs2 ?? sample.vibrationPeakMs2 ?? 0), level: sample.vibration?.level ?? 'low' },
    recording: { active: Boolean(sample.recording?.active), elapsedMs: Number(sample.recording?.elapsedMs ?? timestampMs) },
    compass: { headingDeg: heading == null || !Number.isFinite(Number(heading)) ? null : ((Number(heading)%360)+360)%360, accuracyDeg: sample.compass?.accuracyDeg ?? sample.headingAccuracyDeg ?? null, source: sample.compass?.source ?? sample.headingSource ?? (heading == null ? 'unavailable' : 'gps-course') }
  };
}
