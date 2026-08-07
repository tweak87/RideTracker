(() => {
  'use strict';

  const gps = { active:false, startMono:0, watchId:null, points:[], last:null };
  const db = () => window.RideTrackerDatabase;
  const finite = value => Number.isFinite(Number(value));
  const elapsedSeconds = () => gps.active ? Math.max(0, (performance.now() - gps.startMono) / 1000) : 0;

  function startGpsCapture() {
    if (gps.active) return;
    gps.active = true;
    gps.startMono = performance.now();
    gps.points = [];
    gps.last = null;
    if (!navigator.geolocation) return;
    try {
      gps.watchId = navigator.geolocation.watchPosition(position => {
        const c = position.coords || {};
        if (!finite(c.latitude) || !finite(c.longitude)) return;
        const point = {
          timestamp: elapsedSeconds(),
          latitude: Number(c.latitude),
          longitude: Number(c.longitude),
          altitude: finite(c.altitude) ? Number(c.altitude) : null,
          horizontalAccuracyM: finite(c.accuracy) ? Number(c.accuracy) : null,
          altitudeAccuracyM: finite(c.altitudeAccuracy) ? Number(c.altitudeAccuracy) : null,
          speedMS: finite(c.speed) ? Math.max(0, Number(c.speed)) : null,
          speedKmh: finite(c.speed) ? Math.max(0, Number(c.speed)) * 3.6 : null,
          headingDeg: finite(c.heading) ? Number(c.heading) : null,
          gpsTimestampMs: Number(position.timestamp) || Date.now(),
          source: 'internal-gps'
        };
        gps.points.push(point);
        gps.last = point;
        window.dispatchEvent(new CustomEvent('ridetracker:recording-gps', { detail: point }));
      }, error => {
        window.dispatchEvent(new CustomEvent('ridetracker:recording-gps-error', { detail: { code:error?.code, message:error?.message } }));
      }, { enableHighAccuracy:true, maximumAge:500, timeout:12000 });
    } catch (error) {
      console.warn('[RideTracker GPS]', error);
    }
  }

  function stopGpsCapture() {
    gps.active = false;
    if (gps.watchId != null && navigator.geolocation) {
      try { navigator.geolocation.clearWatch(gps.watchId); } catch (_) {}
    }
    gps.watchId = null;
  }

  function nearestGps(timestamp) {
    const values = gps.points;
    if (!values.length) return null;
    let lo = 0, hi = values.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[mid].timestamp < timestamp) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && Math.abs(values[lo - 1].timestamp - timestamp) <= Math.abs(values[lo].timestamp - timestamp)) lo -= 1;
    return values[lo];
  }

  function mergeGpsIntoSamples(samples) {
    if (!Array.isArray(samples) || !samples.length || !gps.points.length) return samples || [];
    return samples.map((sample, index) => {
      const timestamp = finite(sample.timestamp) ? Number(sample.timestamp) : finite(sample.t) ? Number(sample.t) : index / 50;
      const point = nearestGps(timestamp);
      if (!point) return sample;
      return {
        ...sample,
        latitude: point.latitude,
        longitude: point.longitude,
        altitude: point.altitude,
        horizontalAccuracyM: point.horizontalAccuracyM,
        altitudeAccuracyM: point.altitudeAccuracyM,
        speedMS: finite(sample.speedMS) ? sample.speedMS : point.speedMS,
        speedKmh: finite(sample.speedKmh) ? sample.speedKmh : point.speedKmh,
        headingDeg: point.headingDeg,
        gpsSource: point.source
      };
    });
  }

  async function persistGps(rideId) {
    if (!rideId || !gps.points.length) return;
    const database = db();
    if (!database) return;
    const ridePackage = await database.get(database.stores.ridePackages, rideId);
    if (!ridePackage) return;
    ridePackage.document = ridePackage.document || {};
    ridePackage.document.samples = mergeGpsIntoSamples(Array.isArray(ridePackage.document.samples) ? ridePackage.document.samples : []);
    ridePackage.document.gps = {
      ...(ridePackage.document.gps || {}),
      points: gps.points.slice(),
      source: 'internal-gps',
      capturedAt: new Date().toISOString()
    };
    ridePackage.gpsPointCount = gps.points.length;
    await database.put(database.stores.ridePackages, rideId, ridePackage);
    window.dispatchEvent(new CustomEvent('ridetracker:gps-persisted', { detail: { rideId, count:gps.points.length } }));
  }

  window.addEventListener('ridetracker:recording-started', startGpsCapture);
  window.addEventListener('ridetracker:recording-stopped', stopGpsCapture);
  window.addEventListener('ridetracker:ride-saved', event => void persistGps(event.detail?.rideId));
  window.addEventListener('ridetracker:new-ride-session', () => { gps.points = []; gps.last = null; });

  window.RideTrackerGpsCapture = {
    start:startGpsCapture,
    stop:stopGpsCapture,
    points:() => gps.points.slice(),
    last:() => gps.last,
    persistGps
  };
  window.RideTrackerReferenceEngine = window.RideTrackerReferenceEngine || {};
})();
