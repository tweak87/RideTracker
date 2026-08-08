(() => {
  'use strict';

  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const numberOrNull = value => finite(value) ? Number(value) : null;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const radians = value => Number(value) * Math.PI / 180;

  function distanceMeters(a, b) {
    if (![a?.latitude, a?.longitude, b?.latitude, b?.longitude].every(finite)) return 0;
    const radius = 6371000;
    const dLat = radians(Number(b.latitude) - Number(a.latitude));
    const dLon = radians(Number(b.longitude) - Number(a.longitude));
    const lat1 = radians(a.latitude);
    const lat2 = radians(b.latitude);
    const q = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * radius * Math.asin(Math.sqrt(q));
  }

  function pointTimestampMs(point) {
    const absolute = numberOrNull(point?.gpsTimestampMs ?? point?.timestampMs);
    if (absolute !== null) return absolute;
    const relative = numberOrNull(point?.timestamp ?? point?.t);
    return relative !== null ? relative * 1000 : null;
  }

  function createEstimator(options = {}) {
    const config = {
      maximumSpeedMS: 100,
      minimumMovingSpeedMS: 0.45,
      minimumDeltaSeconds: 0.35,
      maximumDeltaSeconds: 15,
      riseAlpha: 0.58,
      fallAlpha: 0.36,
      ...options,
    };
    const state = { previous: null, smoothedSpeedMS: 0, points: 0 };

    function reset() {
      state.previous = null;
      state.smoothedSpeedMS = 0;
      state.points = 0;
    }

    function update(point) {
      const nativeSpeedMS = numberOrNull(point?.nativeSpeedMS ?? point?.speedMS);
      let derivedSpeedMS = null;
      let segmentDistanceM = null;
      let noiseAllowanceM = null;
      const currentTimestampMs = pointTimestampMs(point);

      if (state.previous && currentTimestampMs !== null) {
        const previousTimestampMs = pointTimestampMs(state.previous);
        const deltaSeconds = previousTimestampMs === null ? 0 : (currentTimestampMs - previousTimestampMs) / 1000;
        if (deltaSeconds >= config.minimumDeltaSeconds && deltaSeconds <= config.maximumDeltaSeconds) {
          segmentDistanceM = distanceMeters(state.previous, point);
          const previousAccuracy = Math.max(0, numberOrNull(state.previous.horizontalAccuracyM) ?? 25);
          const currentAccuracy = Math.max(0, numberOrNull(point?.horizontalAccuracyM) ?? 25);
          noiseAllowanceM = clamp(Math.hypot(previousAccuracy, currentAccuracy) * 0.35, 2.5, 25);
          if (segmentDistanceM <= noiseAllowanceM) {
            derivedSpeedMS = 0;
          } else {
            const candidate = (segmentDistanceM - noiseAllowanceM) / deltaSeconds;
            if (candidate >= 0 && candidate <= config.maximumSpeedMS) derivedSpeedMS = candidate;
          }
        }
      }

      const nativeUseful = nativeSpeedMS !== null
        && nativeSpeedMS >= config.minimumMovingSpeedMS
        && nativeSpeedMS <= config.maximumSpeedMS;
      const derivedUseful = derivedSpeedMS !== null && derivedSpeedMS >= config.minimumMovingSpeedMS;
      let rawSpeedMS = 0;
      let source = 'stationary';

      if (nativeUseful) {
        if (derivedUseful && Math.abs(nativeSpeedMS - derivedSpeedMS) <= Math.max(4, nativeSpeedMS * 0.5)) {
          rawSpeedMS = nativeSpeedMS * 0.75 + derivedSpeedMS * 0.25;
          source = 'native+derived';
        } else {
          rawSpeedMS = nativeSpeedMS;
          source = 'native';
        }
      } else if (derivedUseful) {
        rawSpeedMS = derivedSpeedMS;
        source = 'derived';
      } else if (nativeSpeedMS !== null && nativeSpeedMS >= 0 && nativeSpeedMS < config.minimumMovingSpeedMS) {
        rawSpeedMS = 0;
        source = 'native';
      } else if (derivedSpeedMS !== null) {
        rawSpeedMS = Math.max(0, derivedSpeedMS);
        source = 'derived';
      }

      const alpha = rawSpeedMS > state.smoothedSpeedMS ? config.riseAlpha : config.fallAlpha;
      state.smoothedSpeedMS = state.points === 0
        ? rawSpeedMS
        : state.smoothedSpeedMS + (rawSpeedMS - state.smoothedSpeedMS) * alpha;
      if (state.smoothedSpeedMS < 0.3) state.smoothedSpeedMS = 0;

      state.previous = { ...point, gpsTimestampMs: currentTimestampMs ?? Date.now() };
      state.points += 1;
      return {
        speedMS: state.smoothedSpeedMS,
        speedKmh: state.smoothedSpeedMS * 3.6,
        rawSpeedMS,
        source,
        nativeSpeedMS,
        derivedSpeedMS,
        segmentDistanceM,
        noiseAllowanceM,
      };
    }

    return { update, reset, snapshot: () => ({ ...state }) };
  }

  function gpsPointsFromPackage(pkg) {
    const direct = Array.isArray(pkg?.document?.gps?.points) ? pkg.document.gps.points : [];
    if (direct.length) return direct;
    const samples = Array.isArray(pkg?.document?.samples) ? pkg.document.samples : [];
    return samples.filter(sample => finite(sample?.latitude) && finite(sample?.longitude));
  }

  function nearestGpsPoint(points, timestamp) {
    if (!Array.isArray(points) || !points.length) return null;
    const target = numberOrNull(timestamp) ?? 0;
    let low = 0;
    let high = points.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((numberOrNull(points[middle]?.timestamp ?? points[middle]?.t) ?? 0) < target) low = middle + 1;
      else high = middle;
    }
    if (low > 0) {
      const before = numberOrNull(points[low - 1]?.timestamp ?? points[low - 1]?.t) ?? 0;
      const after = numberOrNull(points[low]?.timestamp ?? points[low]?.t) ?? 0;
      if (Math.abs(before - target) <= Math.abs(after - target)) low -= 1;
    }
    return points[low] || null;
  }

  function isExternalSpeed(sample) {
    const source = String(sample?.speedSource ?? sample?.gpsSource ?? '').toLowerCase();
    return source.includes('external-gnss') || source.includes('external-gps');
  }

  function mergeCanonicalGpsIntoSamples(samples, gpsPoints) {
    if (!Array.isArray(samples) || !samples.length || !Array.isArray(gpsPoints) || !gpsPoints.length) return samples || [];
    return samples.map((sample, index) => {
      const timestamp = numberOrNull(sample?.timestamp ?? sample?.t) ?? index / 50;
      const point = nearestGpsPoint(gpsPoints, timestamp);
      if (!point) return sample;
      const canonicalSpeedMS = numberOrNull(point.speedMS);
      const canonicalSpeedKmh = numberOrNull(point.speedKmh)
        ?? (canonicalSpeedMS === null ? null : canonicalSpeedMS * 3.6);
      const keepExternal = isExternalSpeed(sample);
      return {
        ...sample,
        latitude: numberOrNull(point.latitude) ?? sample.latitude,
        longitude: numberOrNull(point.longitude) ?? sample.longitude,
        altitude: numberOrNull(point.altitude) ?? sample.altitude,
        horizontalAccuracyM: numberOrNull(point.horizontalAccuracyM) ?? sample.horizontalAccuracyM,
        altitudeAccuracyM: numberOrNull(point.altitudeAccuracyM) ?? sample.altitudeAccuracyM,
        speedMS: keepExternal || canonicalSpeedMS === null ? sample.speedMS : canonicalSpeedMS,
        speedKmh: keepExternal || canonicalSpeedKmh === null ? sample.speedKmh : canonicalSpeedKmh,
        speedSource: keepExternal ? sample.speedSource : (point.speedSource || point.source || 'phone-gps'),
        headingDeg: numberOrNull(point.headingDeg) ?? sample.headingDeg,
        gpsSource: keepExternal ? sample.gpsSource : (point.gpsSource || 'phone-gps'),
      };
    });
  }

  function packageMaxSpeedKmh(pkg) {
    let maximum = 0;
    const add = value => { if (finite(value)) maximum = Math.max(maximum, Math.max(0, Number(value))); };
    add(pkg?.maxSpeedKmh);
    add(pkg?.document?.summary?.maxSpeedKmh);
    for (const sample of Array.isArray(pkg?.document?.samples) ? pkg.document.samples : []) {
      const kmh = numberOrNull(sample?.speedKmh);
      const ms = numberOrNull(sample?.speedMS ?? sample?.speed);
      add(kmh ?? (ms === null ? null : ms * 3.6));
    }
    for (const point of gpsPointsFromPackage(pkg)) {
      const kmh = numberOrNull(point?.speedKmh);
      const ms = numberOrNull(point?.speedMS);
      add(kmh ?? (ms === null ? null : ms * 3.6));
    }
    return maximum;
  }

  globalThis.RideTrackerGpsMath = Object.freeze({
    finite,
    numberOrNull,
    distanceMeters,
    createEstimator,
    gpsPointsFromPackage,
    nearestGpsPoint,
    mergeCanonicalGpsIntoSamples,
    packageMaxSpeedKmh,
  });
})();
