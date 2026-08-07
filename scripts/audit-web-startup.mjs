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
requireToken(db, "DB_VERSION = 4", 'Web database must use repaired schema version 4');
for (const store of ['videos','ridePackages','settings','cache']) requireToken(db, store, `Web database missing store: ${store}`);
requireToken(db, 'selfTest()', 'Web database must run a startup self-test');
requireToken(db, 'nativeOpen', 'Web database compatibility bridge missing');
requireToken(db, 'schema incomplete after v${DB_VERSION} repair', 'Web database must detect incomplete repaired schemas');

// Recording fullscreen must use the live camera preview, never the replay player.
requireToken(u39, 'hasLiveCameraStream', 'Recording fullscreen must verify a live camera MediaStream');
requireToken(u39, 'waitForLivePreview', 'Recording fullscreen must wait for the live preview');
requireToken(u39, "recorded.classList.add('hidden')", 'Replay video must be hidden during recording');
requireToken(u39, "live.removeAttribute('controls')", 'Live preview must not expose player controls');
requireToken(u39, 'object-fit:cover', 'Fullscreen live preview must be image-filling');
requireToken(u39, 'object-position:50% 50%', 'Fullscreen live preview must be centered');
requireToken(u39, 'Deliberately do not stop the recording here', 'Leaving fullscreen must not stop recording');
requireToken(u25, 'if (window.RideTrackerRecordingFullscreen) return;', 'Legacy fullscreen triggers must defer to update39');

// Plugin migration: BLE/GNSS must enter via plugin telemetry.
requireToken(plugins, 'ridetracker:plugin-telemetry', 'Web plugin runtime must emit normalized plugin telemetry');
requireToken(u35, 'ridetracker:plugin-telemetry', 'Source router must consume normalized plugin telemetry');
failIf(u35.includes("addEventListener('ridetracker:heart-rate'"), 'BLE heart rate must no longer bypass plugin runtime');

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
  if (html.includes('rtInlineDashboard')) {
    for (const route of ['Neue Fahrt','Meine Fahrten','Karte','Statistiken','Achievements','Profil','HUD-Konfiguration','Geräte & Sensoren','Import & Replay','Einstellungen']) {
      requireToken(html, route, `Inline dashboard/navigation missing route: ${route}`);
    }
  }
  const dbIndex = html.indexOf('core/storage/web-database-service.js?v=');
  const ridesIndex = html.indexOf('update37.js?v=');
  const pluginIndex = html.indexOf('core/adapters/web-plugin-runtimes.mjs?v=');
  const fullscreenIndex = html.indexOf('update39.js?v=');
  if (dbIndex >= 0 || ridesIndex >= 0) {
    failIf(dbIndex < 0 || ridesIndex < 0 || dbIndex > ridesIndex, 'Database service must load before the ride library');
  }
  if (pluginIndex >= 0 || fullscreenIndex >= 0) {
    failIf(pluginIndex < 0 || fullscreenIndex < 0 || pluginIndex > fullscreenIndex, 'Plugin runtime must load before recording fullscreen controller');
  }
}

console.log('Web startup audit passed.');
