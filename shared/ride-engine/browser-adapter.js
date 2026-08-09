import { RideEngine } from './ride-engine.js';

const engine = new RideEngine();
window.RideTrackerEngine = engine;

const originalWatch = navigator.geolocation?.watchPosition?.bind(navigator.geolocation);
const originalGet = navigator.geolocation?.getCurrentPosition?.bind(navigator.geolocation);
let lastObservedTimestamp = null;

function normalize(position) {
  const c = position.coords;
  return {
    t: position.timestamp / 1000,
    lat: c.latitude,
    lon: c.longitude,
    accuracy: c.accuracy,
    altitude: Number.isFinite(c.altitude) ? c.altitude : null,
    speed: Number.isFinite(c.speed) ? Math.max(0, c.speed) : null,
    heading: Number.isFinite(c.heading) ? c.heading : null,
  };
}

function updateBadge() {
  const summary = engine.summary();
  let badge = document.getElementById('sharedEngineBadge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'sharedEngineBadge';
    badge.className = 'badge ok';
    document.querySelector('.status')?.append(badge);
  }
  if (badge) badge.textContent = `Engine: ${summary.acceptedLocations} GPS ✓ / ${summary.rejectedLocations} verworfen`;
}

function observedCallback(callback) {
  return position => {
    const timestamp = Number(position?.timestamp);
    if (!Number.isFinite(timestamp) || timestamp !== lastObservedTimestamp) {
      lastObservedTimestamp = Number.isFinite(timestamp) ? timestamp : null;
      engine.processLocation(normalize(position));
      updateBadge();
    }
    // The engine observes quality but must never starve another GPS consumer.
    // A separate watch (for example Device Center diagnostics) may receive the
    // same OS fix and still needs its callback.
    callback?.(position);
  };
}

if (originalWatch) {
  navigator.geolocation.watchPosition = (success, error, options) =>
    originalWatch(observedCallback(success), error, options);
}

if (originalGet) {
  navigator.geolocation.getCurrentPosition = (success, error, options) =>
    originalGet(position => {
      const normalized = normalize(position);
      if (!engine.lastLocation) engine.processLocation(normalized);
      updateBadge();
      success?.(position);
    }, error, options);
}

window.addEventListener('ridetracker-calibration', event => {
  if (event.detail) engine.setCalibration(event.detail);
});

console.info('RideTracker shared Ride Engine active');
