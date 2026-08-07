import fs from 'node:fs';

const requiredFiles = [
  'update24.js','update25.js','update29.js','update33.js','update34.js','update35.js','update36.js','update37.js','update38.js','update39.js','update40.js','update41.js','update42.js','update43.js','update44.js',
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
const u40 = text('update40.js');
const u41 = text('update41.js');
const u42 = text('update42.js');
const u43 = text('update43.js');
const u44 = text('update44.js');
const db = text('core/storage/web-database-service.js');
const plugins = text('core/adapters/web-plugin-runtimes.mjs');

const failIf = (condition, message) => { if (condition) throw new Error(message); };
const requireToken = (source, token, message) => failIf(!source.includes(token), message);

failIf(u25.includes("dispatchEvent(new Event('resize'))") || u25.includes('dispatchEvent(new Event("resize"))'),
  'update25.js must never dispatch resize from its resize/orientation handler');
requireToken(u25, 'mutationScheduled', 'update25.js MutationObserver must be throttled');
requireToken(u24, 'scheduled', 'update24.js MutationObserver must be throttled');
requireToken(u37, 'observerScheduled', 'update37.js MutationObserver must be throttled');
failIf(/button\.textContent\s*=\s*['\"]Hauptmenü['\"];\s*button\.onclick/.test(u37) && !u37.includes("if(button.textContent!=='Hauptmenü')"),
  'update37.js must not rewrite tool button text on every mutation callback');

requireToken(u29, 'dashboardVisible', 'update29.js must suspend HUD work behind the dashboard');
requireToken(u29, 'idleTimer', 'update29.js must use an idle cadence while hidden');

requireToken(db, "DB_VERSION = 5", 'Web database must use forced repair schema version 5');
for (const store of ['videos','ridePackages','settings','cache']) requireToken(db, store, `Web database missing store: ${store}`);
requireToken(db, 'selfTest()', 'Web database must run a startup self-test');
requireToken(db, 'nativeOpen', 'Web database compatibility bridge missing');
requireToken(db, 'available stores:', 'Database errors must report available stores');

requireToken(u39, 'hasLiveCameraStream', 'Recording fullscreen must verify a live camera MediaStream');
requireToken(u39, 'waitForLivePreview', 'Recording fullscreen must wait for the live preview');
requireToken(u39, "recorded.classList.add('hidden')", 'Replay video must be hidden during recording');
requireToken(u39, "live.removeAttribute('controls')", 'Live preview must not expose player controls');
requireToken(u39, 'object-fit:cover', 'Fullscreen live preview must be image-filling');
requireToken(u39, 'object-position:50% 50%', 'Fullscreen live preview must be centered');
requireToken(u39, 'Recording deliberately continues.', 'Leaving fullscreen must not stop recording');
requireToken(u39, 'rtRecordingControlPortal', 'Recording controls must live in a body-level portal');
requireToken(u39, 'rtRecordingElapsed', 'Recording elapsed timer missing');
requireToken(u39, 'Vollbild verlassen', 'Fullscreen minimize action missing');
requireToken(u39, 'z-index:2147483646', 'Recording controls must stay above HUD layers');
requireToken(u25, 'if (window.RideTrackerRecordingFullscreen) return;', 'Legacy fullscreen triggers must defer to update39');

requireToken(u43, 'waitForReplay', 'Post-recording preview must wait for Safari replay blob creation');
requireToken(u43, 'leaveRecordingFullscreen', 'Post-recording preview must leave recording fullscreen');
requireToken(u43, 'Vorschau wird vorbereitet', 'Preview preparation feedback missing');
requireToken(u43, 'ridetracker:preview-ready', 'Preview-ready event missing');
requireToken(u43, 'RideTrackerPostRecording', 'Post-recording public API missing');
requireToken(u43, 'unhandledrejection', 'Runtime promise diagnostics missing');

requireToken(u44, 'RideTrackerDatabase', 'Ride media storage bridge must use the central database service');
requireToken(u44, 'RideTrackerRideMediaStorage', 'Ride media storage public API missing');
requireToken(u44, "event.stopImmediatePropagation()", 'Legacy ride media handlers must be intercepted before direct IndexedDB access');
requireToken(u44, "database.put(videoStore(), id, blob)", 'Ride saves must store video through central database service');
requireToken(u44, "db()?.get(videoStore(), ride.id)", 'Stored ride playback must use central database service');
requireToken(u44, "db()?.delete(videoStore(), ride.id)", 'Ride deletion must use central database service');

requireToken(u41, 'rideTracker.calibration.v1', 'Persistent calibration storage key missing');
requireToken(u41, 'applyStored', 'Stored calibration restore path missing');
requireToken(u41, 'record.forwardEdge !== selectedForward()', 'Stored calibration must validate selected forward edge');
requireToken(u41, 'ensureForStart', 'Calibration manager must expose a start gate');
requireToken(u40, 'calibrationManager.ensureForStart()', 'Canonical recording start must consult calibration manager');

requireToken(u42, 'selectedSensors', 'Sensor-aware calibration must inspect selected sensors');
requireToken(u42, 'device?.enabled !== false', 'Calibration must ignore disabled devices');
requireToken(u42, 'channel?.enabled !== false', 'Calibration must ignore disabled channels');
requireToken(u42, 'Nicht verfügbar', 'Unavailable selected sensors must be shown but not required');
requireToken(u42, 'Telefon ruhig in finaler Position halten', 'Phone motion calibration instructions missing');
requireToken(u42, 'Keine stabile Kalibrierung erkannt', 'Calibration timeout feedback missing');
requireToken(u42, 'RideTrackerSensorCalibration', 'Sensor calibration public API missing');
requireToken(u42, 'manager.ensureForStart = ensureForStart', 'Sensor-aware gate must replace generic calibration gate');

requireToken(u40, 'canonicalStart', 'Recording actions must provide a canonical start path');
requireToken(u40, 'start.click()', 'Canonical recording action must invoke the base #start handler');
requireToken(u40, 'setVideoEnabled(video)', 'Canonical recording action must explicitly set video mode');
requireToken(u40, 'minimizeAndStartVideo', 'Minimize-and-video action API missing');
requireToken(u40, '/minim/.test(label)', 'Existing minimize/video buttons must be routed to canonical recording actions');
requireToken(u40, 'rtRecordingQuickStart', 'Simplified recording quick-start UI missing');

requireToken(plugins, 'ridetracker:plugin-telemetry', 'Web plugin runtime must emit normalized plugin telemetry');
requireToken(plugins, "return 'external-imu'", 'External IMU packets must be classified by the plugin runtime');
requireToken(u35, 'ridetracker:plugin-telemetry', 'Source router must consume normalized plugin telemetry');
requireToken(u35, "'external-imu'", 'Source router must accept external IMU plugin telemetry');
failIf(u35.includes("addEventListener('ridetracker:heart-rate'"), 'BLE heart rate must no longer bypass plugin runtime');

[
  [u24, 'RideTrackerSettings', 'settings'],
  [u33, 'RideTrackerDeviceCenter', 'device center'],
  [u34, 'RideTrackerSourceRouting', 'source routing'],
  [u35, 'RideTrackerRecordingSourceRouter', 'recording source router'],
  [u36, 'RideTrackerCameraSources', 'camera sources'],
  [u37, 'RideTrackerRideLibrary', 'ride library'],
  [u38, 'RideTrackerNavigation', 'navigation'],
  [u39, 'RideTrackerRecordingFullscreen', 'recording fullscreen'],
  [u40, 'RideTrackerRecordingActions', 'recording actions'],
  [u41, 'RideTrackerCalibrationManager', 'calibration manager'],
  [u42, 'RideTrackerSensorCalibration', 'sensor calibration'],
  [u43, 'RideTrackerPostRecording', 'post-recording preview'],
  [u44, 'RideTrackerRideMediaStorage', 'ride media storage'],
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
  const rideEngineIndex = html.indexOf('shared/ride-engine/browser-adapter.js?v=');
  const firstUpdateIndex = html.indexOf('update11.js?v=');
  const ridesIndex = html.indexOf('update37.js?v=');
  const pluginIndex = html.indexOf('core/adapters/web-plugin-runtimes.mjs?v=');
  const fullscreenIndex = html.indexOf('update39.js?v=');
  const postRecordingIndex = html.indexOf('update43.js?v=');
  const storageBridgeIndex = html.indexOf('update44.js?v=');
  const calibrationIndex = html.indexOf('update41.js?v=');
  const sensorCalibrationIndex = html.indexOf('update42.js?v=');
  const actionsIndex = html.indexOf('update40.js?v=');
  const builtIndex = dbIndex >= 0 || rideEngineIndex >= 0 || firstUpdateIndex >= 0;
  if (builtIndex) {
    failIf(dbIndex < 0 || rideEngineIndex < 0 || firstUpdateIndex < 0 || dbIndex > rideEngineIndex || dbIndex > firstUpdateIndex,
      'Database repair service must load before ride engine and every update module');
    failIf(ridesIndex < 0 || dbIndex > ridesIndex, 'Database service must load before the ride library');
    if (pluginIndex >= 0 || fullscreenIndex >= 0) failIf(pluginIndex < 0 || fullscreenIndex < 0 || pluginIndex > fullscreenIndex, 'Plugin runtime must load before recording fullscreen controller');
    failIf(fullscreenIndex < 0 || postRecordingIndex < 0 || fullscreenIndex > postRecordingIndex,
      'Post-recording controller must load after fullscreen controller');
    failIf(postRecordingIndex < 0 || storageBridgeIndex < 0 || postRecordingIndex > storageBridgeIndex,
      'Ride media storage bridge must load after post-recording preview controller');
    if (fullscreenIndex >= 0 || calibrationIndex >= 0 || sensorCalibrationIndex >= 0 || actionsIndex >= 0) {
      failIf(fullscreenIndex < 0 || calibrationIndex < 0 || sensorCalibrationIndex < 0 || actionsIndex < 0 || fullscreenIndex > calibrationIndex || calibrationIndex > sensorCalibrationIndex || sensorCalibrationIndex > actionsIndex,
        'Recording startup order must be fullscreen -> calibration persistence -> sensor calibration -> actions');
    }
  }
}

console.log('Web startup audit passed.');
