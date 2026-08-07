import fs from 'node:fs';

const requiredFiles = [
  'update24.js','update25.js','update29.js','update33.js','update34.js','update35.js','update36.js','update37.js','update38.js','update39.js',
  'core/storage/web-database-service.js','core/adapters/web-plugin-runtimes.mjs'
];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing active web module: ${file}`);
}

const text = file => fs.readFileSync(file, 'utf8');
const u24 = text('update24.js');
const u25 = text('update25.js');
const u29 = text('update29.js');
const u33 = text('update33.js');
const u34 = text('update34.js');
const u35 = text('update35.js');
const u36 = text('update36.js');
const u37 = text('update37.js');
const u38 = text('update38.js');
const u39 = text('update39.js');
const db = text('core/storage/web-database-service.js');
const plugins = text('core/adapters/web-plugin-runtimes.mjs');

const failIf = (condition, message) => { if (condition) throw new Error(message); };
const requireToken = (source, token, message) => failIf(!source.includes(token), message);

// Known boot blockers: event recursion and self-triggering mutation observers.
failIf(u25.includes("dispatchEvent(new Event('resize'))") || u25.includes('dispatchEvent(new Event("resize"))'),
  'update25.js must never dispatch resize from its resize/orientation handler');
requireToken(u25, 'mutationScheduled', 'update25.js MutationObserver must be throttled');
requireToken(u24, 'scheduled', 'update24.js MutationObserver must be throttled');
requireToken(u37, 'observerScheduled', 'update37.js MutationObserver must be throttled');
failIf(/button\.textContent\s*=\s*['\"]Hauptmenü['\"];\s*button\.onclick/.test(u37) && !u37.includes("if(button.textContent!=='Hauptmenü')"),
  'update37.js must not rewrite tool button text on every mutation callback');

// The HUD must not burn a full render loop while the start dashboard covers the camera.
requireToken(u29, 'dashboardVisible', 'update29.js must suspend HUD work behind the dashboard');
requireToken(u29, 'idleTimer', 'update29.js must use an idle cadence while hidden');

// IndexedDB schema must be versioned, migration-safe and self-tested.
requireToken(db, "DB_VERSION = 3", 'Web database must use the current schema version');
for (const store of ['videos','ridePackages','settings','cache']) requireToken(db, store, `Web database missing store: ${store}`);
requireToken(db, 'selfTest()', 'Web database must run a startup self-test');
requireToken(db, 'nativeOpen', 'Web database compatibility bridge missing');

// BLE heart rate and external GNSS must enter through the plugin runtime before source routing.
requireToken(plugins, "ridetracker:heart-rate", 'BLE heart-rate plugin ingress missing');
requireToken(plugins, "ridetracker:external-telemetry", 'External GNSS plugin ingress missing');
requireToken(plugins, "ridetracker:plugin-telemetry", 'Plugin telemetry output missing');
requireToken(u35, "ridetracker:plugin-telemetry", 'Source router must consume plugin telemetry');
failIf(u35.includes("window.addEventListener('ridetracker:heart-rate'"), 'Source router must not consume BLE heart rate directly anymore');

// Recording fullscreen must keep controls inside the video container and allow leaving fullscreen without stopping.
requireToken(u39, 'RideTrackerRecordingFullscreen', 'Recording fullscreen API missing');
requireToken(u39, 'rtRecordingStopButton', 'Fullscreen REC stop control missing');
requireToken(u39, 'rtRecordingExitButton', 'Fullscreen exit control missing');
requireToken(u39, 'object-fit:cover', 'Fullscreen camera image must use cover');
requireToken(u39, 'object-position:50% 50%', 'Fullscreen camera image must be centered');
requireToken(u39, 'Deliberately do not stop the recording here.', 'Fullscreen exit must remain independent from recording stop');

// Core user-facing modules must still expose their public APIs.
[
  [u24, 'RideTrackerSettings', 'settings'],
  [u33, 'RideTrackerDeviceCenter', 'device center'],
  [u34, 'RideTrackerSourceRouting', 'source routing'],
  [u35, 'RideTrackerRecordingSourceRouter', 'recording source router'],
  [u36, 'RideTrackerCameraSources', 'camera sources'],
  [u37, 'RideTrackerRideLibrary', 'ride library'],
  [u38, 'RideTrackerNavigation', 'navigation'],
  [u39, 'RideTrackerRecordingFullscreen', 'recording fullscreen'],
  [plugins, 'RideTrackerWebPlugins', 'web plugin runtimes']
].forEach(([source, token, label]) => requireToken(source, token, `Missing ${label} API`));

if (fs.existsSync('index.html')) {
  const html = text('index.html');
  // These checks are effective after prepare-pages.mjs has generated dist/index.html.
  if (html.includes('rtInlineDashboard')) {
    for (const route of ['Neue Fahrt','Meine Fahrten','Karte','Statistiken','Achievements','Profil','HUD-Konfiguration','Geräte & Sensoren','Import & Replay','Einstellungen']) {
      requireToken(html, route, `Inline dashboard/navigation missing route: ${route}`);
    }
  }
  const dbIndex = html.indexOf('core/storage/web-database-service.js?v=');
  const ridesIndex = html.indexOf('update37.js?v=');
  if (dbIndex >= 0 || ridesIndex >= 0) {
    failIf(dbIndex < 0 || ridesIndex < 0 || dbIndex > ridesIndex, 'Database service must load before the ride library');
  }
  const pluginIndex = html.indexOf('core/adapters/web-plugin-runtimes.mjs?v=');
  const fullscreenIndex = html.indexOf('update39.js?v=');
  if (fullscreenIndex >= 0) failIf(pluginIndex < 0 || pluginIndex > fullscreenIndex, 'Plugin runtime must load before recording fullscreen controls');
}

console.log('Web startup audit passed.');
