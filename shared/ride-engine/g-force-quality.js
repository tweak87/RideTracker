(() => {
  'use strict';

  const STANDARD_GRAVITY = 9.80665;
  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const length = vector => Math.hypot(...vector);
  const normalize = vector => {
    const magnitude = length(vector);
    return magnitude > 0 ? vector.map(value => value / magnitude) : [0, 0, 0];
  };
  const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0);

  function forceMetrics(sample = {}) {
    const normalG = finite(sample.normalG ?? sample.normal) ? Number(sample.normalG ?? sample.normal) : 0;
    const lateralG = finite(sample.lateralG ?? sample.lateral) ? Number(sample.lateralG ?? sample.lateral) : 0;
    const longitudinalG = finite(sample.longitudinalG ?? sample.longitudinal) ? Number(sample.longitudinalG ?? sample.longitudinal) : 0;
    return {
      normalG,
      lateralG,
      longitudinalG,
      horizontalG: Math.hypot(lateralG, longitudinalG),
      totalG: Math.hypot(normalG, lateralG, longitudinalG),
      lateralMS2: lateralG * STANDARD_GRAVITY,
      longitudinalMS2: longitudinalG * STANDARD_GRAVITY,
    };
  }

  function calibrationCompatibility(calibration, rawSamples, options = {}) {
    const minimumSamples = Number(options.minimumSamples ?? 20);
    const maximumSamples = Number(options.maximumSamples ?? 45);
    const maximumAngleDeg = Number(options.maximumAngleDeg ?? 12);
    const maximumNoiseG = Number(options.maximumNoiseG ?? 0.08);
    const maximumMagnitudeErrorG = Number(options.maximumMagnitudeErrorG ?? 0.12);
    const samples = (Array.isArray(rawSamples) ? rawSamples : [])
      .slice(-maximumSamples)
      .map(sample => ({
        x:sample?.calX ?? sample?.x,
        y:sample?.calY ?? sample?.y,
        z:sample?.calZ ?? sample?.z,
      }))
      .filter(sample => [sample.x, sample.y, sample.z].every(finite));
    if (!Array.isArray(calibration?.up) || calibration.up.length !== 3) {
      return { ready:true, compatible:false, reason:'missing-calibration-axis', sampleCount:samples.length };
    }
    if (samples.length < minimumSamples) {
      return { ready:false, compatible:false, reason:'waiting-for-motion-samples', sampleCount:samples.length };
    }

    const average = [0, 1, 2].map(index => samples.reduce((sum, sample) => sum + Number([sample.x, sample.y, sample.z][index]), 0) / samples.length);
    const magnitudeG = length(average);
    const up = normalize(calibration.up.map(Number));
    const direction = normalize(average);
    const angleDeg = Math.acos(clamp(dot(up, direction), -1, 1)) * 180 / Math.PI;
    const noiseG = Math.sqrt(samples.reduce((sum, sample) => {
      const delta = Math.hypot(Number(sample.x) - average[0], Number(sample.y) - average[1], Number(sample.z) - average[2]);
      return sum + delta * delta;
    }, 0) / samples.length);
    const stable = noiseG <= maximumNoiseG && Math.abs(magnitudeG - 1) <= maximumMagnitudeErrorG;
    const compatible = stable && angleDeg <= maximumAngleDeg;
    return {
      ready:true,
      compatible,
      reason:!stable ? 'device-moving' : compatible ? 'compatible' : 'orientation-changed',
      sampleCount:samples.length,
      angleDeg,
      noiseG,
      magnitudeG,
    };
  }

  globalThis.RideTrackerGForceQuality = Object.freeze({
    STANDARD_GRAVITY,
    forceMetrics,
    calibrationCompatibility,
  });
})();
