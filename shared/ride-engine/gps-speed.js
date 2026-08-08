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

  function bearingDegrees(a, b) {
    if (![a?.latitude, a?.longitude, b?.latitude, b?.longitude].every(finite)) return null;
    const latitudeA = radians(a.latitude);
    const latitudeB = radians(b.latitude);
    const deltaLongitude = radians(Number(b.longitude) - Number(a.longitude));
    const y = Math.sin(deltaLongitude) * Math.cos(latitudeB);
    const x = Math.cos(latitudeA) * Math.sin(latitudeB)
      - Math.sin(latitudeA) * Math.cos(latitudeB) * Math.cos(deltaLongitude);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
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
      historyWindowSeconds: 12,
      geometryMinimumDeltaSeconds: 0.8,
      holdMaximumSeconds: 3.2,
      riseAlpha: 0.58,
      fallAlpha: 0.36,
      ...options,
    };
    const state = { previous: null, history: [], smoothedSpeedMS: null, lastMovingAtMs: null, points: 0 };

    function reset() {
      state.previous = null;
      state.history = [];
      state.smoothedSpeedMS = null;
      state.lastMovingAtMs = null;
      state.points = 0;
    }

    function update(point) {
      const nativeSpeedMS = numberOrNull(point?.nativeSpeedMS ?? point?.speedMS);
      let derivedSpeedMS = null;
      let segmentDistanceM = null;
      let noiseAllowanceM = null;
      let derivedHeadingDeg = null;
      let confidence = 0;
      const currentTimestampMs = pointTimestampMs(point);
      const geometryCandidates = [];
      let longestCandidate = null;

      if (currentTimestampMs !== null) {
        state.history = state.history.filter((previous) => {
          const previousTimestampMs = pointTimestampMs(previous);
          return previousTimestampMs !== null
            && currentTimestampMs - previousTimestampMs <= config.historyWindowSeconds * 1000;
        });
        const currentAccuracy = Math.max(0, numberOrNull(point?.horizontalAccuracyM) ?? 25);
        for (const previous of state.history) {
          const previousTimestampMs = pointTimestampMs(previous);
          const deltaSeconds = previousTimestampMs === null ? 0 : (currentTimestampMs - previousTimestampMs) / 1000;
          if (deltaSeconds < config.geometryMinimumDeltaSeconds || deltaSeconds > config.maximumDeltaSeconds) continue;
          const distanceM = distanceMeters(previous, point);
          const previousAccuracy = Math.max(0, numberOrNull(previous.horizontalAccuracyM) ?? 25);
          const combinedAccuracyM = Math.hypot(previousAccuracy, currentAccuracy);
          // Accuracy values around 100 m are common during the first iOS fixes. Capping the
          // deduction prevents a real ride from being erased completely while still removing
          // the usual stationary jitter from good fixes.
          const allowanceM = clamp(combinedAccuracyM * 0.10, 1.5, 14);
          const candidateMS = Math.max(0, distanceM - allowanceM) / deltaSeconds;
          if (candidateMS > config.maximumSpeedMS) continue;
          const candidateConfidence = clamp(distanceM / Math.max(6, combinedAccuracyM * 1.2), 0, 1)
            * clamp(deltaSeconds / 4, 0.25, 1);
          geometryCandidates.push({ speedMS:candidateMS, distanceM, allowanceM, deltaSeconds, confidence:candidateConfidence, previous });
          if (!longestCandidate || deltaSeconds > longestCandidate.deltaSeconds) longestCandidate = geometryCandidates.at(-1);
        }
        // Longer baselines are much less sensitive to a single inaccurate fix. Use the
        // median of the four longest windows so a jump cannot dominate the result.
        const stableCandidates = [...geometryCandidates]
          .sort((left, right) => right.deltaSeconds - left.deltaSeconds)
          .slice(0, 4);
        derivedSpeedMS = median(stableCandidates.map((candidate) => candidate.speedMS));
        confidence = median(stableCandidates.map((candidate) => candidate.confidence)) ?? 0;
        if (longestCandidate) {
          segmentDistanceM = longestCandidate.distanceM;
          noiseAllowanceM = longestCandidate.allowanceM;
          derivedHeadingDeg = bearingDegrees(longestCandidate.previous, point);
        }
      }

      const nativeUseful = nativeSpeedMS !== null
        && nativeSpeedMS >= config.minimumMovingSpeedMS
        && nativeSpeedMS <= config.maximumSpeedMS;
      const derivedUseful = derivedSpeedMS !== null && derivedSpeedMS >= config.minimumMovingSpeedMS;
      let rawSpeedMS = null;
      let source = 'unavailable';

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
        source = confidence < 0.25 ? 'derived-low-confidence' : 'derived';
      } else if (nativeSpeedMS !== null && nativeSpeedMS >= 0 && nativeSpeedMS < config.minimumMovingSpeedMS
        && (numberOrNull(point?.horizontalAccuracyM) ?? 100) <= 25) {
        rawSpeedMS = 0;
        source = 'native';
      } else if (derivedSpeedMS !== null) {
        rawSpeedMS = Math.max(0, derivedSpeedMS);
        source = 'derived';
      }

      if (rawSpeedMS !== null && rawSpeedMS >= config.minimumMovingSpeedMS) state.lastMovingAtMs = currentTimestampMs;
      const secondsSinceMoving = state.lastMovingAtMs === null || currentTimestampMs === null
        ? Infinity : (currentTimestampMs - state.lastMovingAtMs) / 1000;
      if (rawSpeedMS === null && state.smoothedSpeedMS !== null && secondsSinceMoving <= config.holdMaximumSeconds) {
        rawSpeedMS = state.smoothedSpeedMS;
        source = 'held';
        confidence *= 0.7;
      }
      if (rawSpeedMS !== null) {
        const previousSmoothed = state.smoothedSpeedMS;
        const alpha = previousSmoothed === null || rawSpeedMS > previousSmoothed ? config.riseAlpha : config.fallAlpha;
        state.smoothedSpeedMS = previousSmoothed === null
          ? rawSpeedMS
          : previousSmoothed + (rawSpeedMS - previousSmoothed) * alpha;
        if (state.smoothedSpeedMS < 0.3) state.smoothedSpeedMS = 0;
      }

      state.previous = { ...point, gpsTimestampMs: currentTimestampMs ?? Date.now() };
      state.history.push(state.previous);
      state.points += 1;
      return {
        speedMS: state.smoothedSpeedMS,
        speedKmh: state.smoothedSpeedMS === null ? null : state.smoothedSpeedMS * 3.6,
        rawSpeedMS,
        source,
        confidence,
        nativeSpeedMS,
        derivedSpeedMS,
        derivedHeadingDeg,
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
    bearingDegrees,
    createEstimator,
    gpsPointsFromPackage,
    nearestGpsPoint,
    mergeCanonicalGpsIntoSamples,
    packageMaxSpeedKmh,
  });
})();
