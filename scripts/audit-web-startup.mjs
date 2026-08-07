import fs from 'node:fs';

const activeUpdates = [
  'update11.js','update12.js','update13.js','update14.js','update15.js','update16.js','update17.js','update18.js','update19.js',
  'update23.js','update24.js','update25.js','update26.js','update27.js','update28.js','update29.js',
  'update33.js','update34.js','update35.js','update36.js','update37.js','update38.js','update39.js','update40.js','update41.js','update42.js','update43.js','update44.js','update45.js','update46.js'
];
const requiredFiles = [
  ...activeUpdates,
  'core/storage/web-database-service.js','core/adapters/web-plugin-runtimes.mjs'
];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing active web module: ${file}`);
}

const text = file => fs.readFileSync(file, 'utf8');
const src = Object.fromEntries(requiredFiles.map(file => [file, text(file)]));
const u24 = src['update24.js'];
const u25 = src['update25.js'];
const u29 = src['update29.js'];
const u35 = src['update35.js'];
const u37 = src['update37.js'];
const u39 = src['update39.js'];
const u40 = src['update40.js'];
const u41 = src['update41.js'];
const u42 = src['update42.js'];
const u43 = src['update43.js'];
const u44 = src['update44.js'];
const u45 = src['update45.js'];
const u46 = src['update46.js'];
const db = src['core/storage/web-database-service.js'];
const plugins = src['core/adapters/web-plugin-runtimes.mjs'];

const failIf = (condition, message) => { if (condition) throw new Error(message); };
const requireToken = (source, token, message) => failIf(!source.includes(token), message);

// Production modules must never open or transact IndexedDB directly. Storage belongs to RideTrackerDatabase only.
for (const file of activeUpdates) {
  const source = src[file];
  failIf(/indexedDB\s*\.\s*open\s*\(/.test(source), `${file} must not call indexedDB.open directly`);
  failIf(/\.transaction\s*\(/.test(source), `${file} must not call IDBDatabase.transaction directly`);
}

failIf(u25.includes("dispatchEvent(new Event('resize'))") || u25.includes('dispatchEvent(new Event("resize"))'),
  'update25.js must never dispatch resize from its resize/orientation handler');
requireToken(u25, 'mutationScheduled', 'update25.js MutationObserver must be throttled');
requireToken(u24, 'scheduled', 'update24.js MutationObserver must be throttled');
requireToken(u37, 'observerScheduled', 'update37.js MutationObserver must be throttled');
requireToken(u29, 'dashboardVisible', 'update29.js must suspend HUD work behind the dashboard');
requireToken(u29, 'idleTimer', 'update29.js must use an idle cadence while hidden');

requireToken(db, 'MIN_SCHEMA_VERSION = 6', 'Web database minimum repair version must be 6');
for (const store of ['videos','ridePackages','settings','cache']) requireToken(db, store, `Web database missing store: ${store}`);
requireToken(db, 'inspectAndRepair', 'Web database must inspect and repair an existing schema');
requireToken(db, 'missingStores', 'Web database missing-store inspection is required');
requireToken(db, 'ridetracker:database-repaired', 'Web database must report successful repair');
requireToken(db, 'selfTest()', 'Web database must run a startup read/write self-test');
requireToken(db, 'api.ready', 'Web database must expose a startup readiness promise');

requireToken(u39, 'hasLiveCameraStream', 'Recording fullscreen must verify a live camera MediaStream');
requireToken(u39, 'waitForLivePreview', 'Recording fullscreen must wait for the live preview');
requireToken(u39, "recorded.classList.add('hidden')", 'Replay video must be hidden during recording');
requireToken(u39, "live.removeAttribute('controls')", 'Live preview must not expose player controls');
requireToken(u39, 'object-fit:cover', 'Fullscreen live preview must be image-filling');
requireToken(u39, 'object-position:50% 50%', 'Fullscreen live preview must be centered');
requireToken(u39, 'rtRecordingControlPortal', 'Recording controls must live in a body-level portal');
requireToken(u39, 'rtRecordingElapsed', 'Recording elapsed timer missing');
requireToken(u39, 'Vollbild verlassen', 'Fullscreen minimize action missing');
requireToken(u39, 'z-index:2147483646', 'Recording controls must stay above HUD layers');
requireToken(u25, 'if (window.RideTrackerRecordingFullscreen) return;', 'Legacy fullscreen triggers must defer to update39');

requireToken(u43, 'waitForReplay', 'Post-recording preview must wait for Safari replay creation');
requireToken(u43, 'leaveRecordingFullscreen', 'Post-recording preview must leave recording fullscreen');
requireToken(u43, 'ridetracker:preview-ready', 'Preview-ready event missing');
requireToken(u43, 'RideTrackerPostRecording', 'Post-recording public API missing');
requireToken(u43, 'unhandledrejection', 'Runtime promise diagnostics missing');

requireToken(u37, 'RideTrackerDatabase', 'Ride library must use central database service');
requireToken(u37, 'savePendingRide', 'Ride library save/upsert API missing');
requireToken(u37, 'activeRideId', 'Ride library must retain an active ride id');
requireToken(u37, 'isNew', 'Ride save must distinguish insert from update');
requireToken(u37, 'newRideSession', 'Ride library must explicitly start new ride identities');
requireToken(u44, 'RideTrackerRideMediaStorage', 'Ride media bridge public API missing');
requireToken(u44, 'savePendingRide', 'Ride media bridge must delegate saving to ride library upsert');

requireToken(u45, 'RideTrackerRecordingSession', 'Unified recording session controller missing');
requireToken(u45, "mode: 'live'", 'Recording session must start in live mode');
requireToken(u45, "setMode('preview')", 'Recording session must expose preview mode');
requireToken(u45, "setMode('recording')", 'Recording session must expose recording mode');
requireToken(u45, 'function confirmReplaceBeforeStart()', 'Replacement gate must remain synchronous for iOS user activation');
requireToken(u45, 'showReplay', 'Recorded video must replace live view inside the same window');
requireToken(u45, 'rt-session-preview #preview', 'Preview state must force-hide the live camera');
requireToken(u45, 'rt-session-preview #replay', 'Preview state must force-show replay video');
requireToken(u45, 'rtVideoStateBadge', 'Video state badge missing');

requireToken(u41, 'rideTracker.calibration.v1', 'Persistent calibration storage key missing');
requireToken(u41, 'applyStored', 'Stored calibration restore path missing');
requireToken(u41, 'record.forwardEdge !== selectedForward()', 'Stored calibration must validate selected forward edge');
requireToken(u41, 'ensureForStart', 'Calibration manager must expose a start gate');
requireToken(u42, 'selectedSensors', 'Sensor-aware calibration must inspect selected sensors');
requireToken(u42, 'device?.enabled !== false', 'Calibration must ignore disabled devices');
requireToken(u42, 'channel?.enabled !== false', 'Calibration must ignore disabled channels');
requireToken(u42, 'Nicht verfügbar', 'Unavailable selected sensors must not block calibration');
requireToken(u42, 'RideTrackerSensorCalibration', 'Sensor calibration public API missing');

requireToken(u40, 'canonicalStart', 'Recording actions must provide a canonical start path');
requireToken(u40, 'ensureInitialized', 'One-click recording must initialize required hardware automatically');
requireToken(u40, 'recoverCamera', 'One-click recording must recover a missing live camera stream');
requireToken(u40, "init.click()", 'One-click recording must invoke the base permission/initialization flow');
requireToken(u40, 'videoRecorderActive', 'Video start must verify that MediaRecorder is actually recording');
requireToken(u40, 'session.confirmReplaceBeforeStart() === false', 'Canonical start must use synchronous replacement gate');
requireToken(u40, 'calibrationManager.ensureForStart()', 'Canonical start must consult calibration manager');
requireToken(u40, 'start.click()', 'Canonical recording action must invoke the base #start handler');
requireToken(u40, 'minimizeAndStartVideo', 'Minimize-and-video action API missing');
requireToken(u40, 'unifiedRideStart', 'Legacy unified start must route to canonical recording actions');

requireToken(plugins, 'ridetracker:plugin-telemetry', 'Web plugin runtime must emit normalized plugin telemetry');
requireToken(plugins, "return 'external-imu'", 'External IMU packets must be classified by plugin runtime');
requireToken(plugins, 'ensureCameraPreview', 'Camera preview must be exposed through the camera plugin runtime');
requireToken(plugins, "operation === 'ensurePreview'", 'Camera plugin runtime must expose ensurePreview operation');
requireToken(plugins, 'recordingActive', 'Camera plugin runtime must track recording lifecycle');
requireToken(u35, 'ridetracker:plugin-telemetry', 'Source router must consume normalized plugin telemetry');
failIf(u35.includes("addEventListener('ridetracker:heart-rate'"), 'BLE heart rate must no longer bypass plugin runtime');

requireToken(u46, 'RideTrackerFrontendNavigation', 'Frontend navigation consolidation API missing');
requireToken(u46, "#rideDashboard{display:none!important}", 'Legacy dashboard must stay hidden');
requireToken(u46, 'enterRecord({ newRide: true })', 'Neue Fahrt must enter recording preparation directly');
requireToken(u46, '#rtVideoStateBadge[data-mode="live"]{display:none!important}', 'LIVE badge must be hidden outside actual recording/preview states');
requireToken(u46, "state.route === 'record'", 'Video state badge must be scoped to recording route');
requireToken(u46, 'syncCameraPlugin', 'Frontend must bridge recording UX to plugin camera state');

const publicApis = [
  ['update24.js','RideTrackerSettings','settings'],['update33.js','RideTrackerDeviceCenter','device center'],['update34.js','RideTrackerSourceRouting','source routing'],
  ['update35.js','RideTrackerRecordingSourceRouter','source router'],['update36.js','RideTrackerCameraSources','camera sources'],['update37.js','RideTrackerRideLibrary','ride library'],
  ['update38.js','RideTrackerNavigation','navigation'],['update39.js','RideTrackerRecordingFullscreen','recording fullscreen'],['update40.js','RideTrackerRecordingActions','recording actions'],
  ['update41.js','RideTrackerCalibrationManager','calibration manager'],['update42.js','RideTrackerSensorCalibration','sensor calibration'],['update43.js','RideTrackerPostRecording','post-recording preview'],
  ['update44.js','RideTrackerRideMediaStorage','ride media storage'],['update45.js','RideTrackerRecordingSession','recording session'],['update46.js','RideTrackerFrontendNavigation','frontend navigation']
];
for (const [file, token, label] of publicApis) requireToken(src[file], token, `Missing ${label} API`);
requireToken(plugins, 'RideTrackerWebPlugins', 'Missing web plugin runtimes API');

if (fs.existsSync('index.html')) {
  const html = text('index.html');
  if (html.includes('rtInlineDashboard')) {
    for (const route of ['Neue Fahrt','Meine Fahrten','Karte','Statistiken','Achievements','Profil','HUD-Konfiguration','Geräte & Sensoren','Import & Replay','Einstellungen']) {
      requireToken(html, route, `Inline dashboard/navigation missing route: ${route}`);
    }
  }
  const positions = {
    db: html.indexOf('core/storage/web-database-service.js?v='),
    engine: html.indexOf('shared/ride-engine/browser-adapter.js?v='),
    firstUpdate: html.indexOf('update11.js?v='),
    rides: html.indexOf('update37.js?v='),
    plugins: html.indexOf('core/adapters/web-plugin-runtimes.mjs?v='),
    fullscreen: html.indexOf('update39.js?v='),
    post: html.indexOf('update43.js?v='),
    storage: html.indexOf('update44.js?v='),
    session: html.indexOf('update45.js?v='),
    calibration: html.indexOf('update41.js?v='),
    sensorCalibration: html.indexOf('update42.js?v='),
    actions: html.indexOf('update40.js?v='),
    frontend: html.indexOf('update46.js?v=')
  };
  const built = Object.values(positions).some(value => value >= 0);
  if (built) {
    failIf(positions.db < 0 || positions.engine < 0 || positions.firstUpdate < 0 || positions.db > positions.engine || positions.db > positions.firstUpdate,
      'Database service must load before ride engine and every update module');
    failIf(positions.rides < 0 || positions.db > positions.rides, 'Database service must load before ride library');
    failIf(positions.plugins < 0 || positions.fullscreen < 0 || positions.plugins > positions.fullscreen, 'Plugin runtime must load before recording fullscreen');
    failIf(positions.fullscreen > positions.post || positions.post > positions.storage || positions.storage > positions.session,
      'Recording post-flow order must be fullscreen -> post-recording -> storage -> session');
    failIf(positions.fullscreen > positions.calibration || positions.calibration > positions.sensorCalibration || positions.sensorCalibration > positions.actions,
      'Recording startup order must be fullscreen -> calibration -> sensor calibration -> actions');
    failIf(positions.session > positions.actions, 'Recording session controller must load before canonical actions');
    failIf(positions.actions < 0 || positions.frontend < 0 || positions.actions > positions.frontend,
      'Frontend consolidation must load after canonical recording actions');
  }
}

console.log('Web startup audit passed.');
