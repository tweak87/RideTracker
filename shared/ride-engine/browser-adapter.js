import { RideEngine } from './ride-engine.js';

const engine = new RideEngine();
window.RideTrackerEngine = engine;

const originalWatch = navigator.geolocation?.watchPosition?.bind(navigator.geolocation);
const originalGet = navigator.geolocation?.getCurrentPosition?.bind(navigator.geolocation);

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

function filteredCallback(callback) {
  return position => {
    const result = engine.processLocation(normalize(position));
    updateBadge();
    if (result.accepted) callback?.(position);
  };
}

if (originalWatch) {
  navigator.geolocation.watchPosition = (success, error, options) =>
    originalWatch(filteredCallback(success), error, options);
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
