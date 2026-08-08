import fs from 'node:fs';

const required = [
  'index.html',
  'update38.js',
  'update46.js',
  'update54.js',
  'update58.js',
  'update60.js',
  'update61.js',
  'update62.js',
  'update63.js',
  'shared/ride-engine/gps-speed.js',
  'shared/ride-engine/browser-adapter.js',
  'shared/core/community-model.js',
  'shared/core/community-backend.js',
  'shared/core/release-manifest.js',
  'shared/visualization/track-3d.js',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing runtime file: ${file}`);
}

const read = file => fs.readFileSync(file, 'utf8');
const source = Object.fromEntries(required.map(file => [file, read(file)]));
const requireToken = (file, token, message) => {
  if (!source[file].includes(token)) throw new Error(message);
};
const rejectToken = (file, token, message) => {
  if (source[file].includes(token)) throw new Error(message);
};

requireToken('shared/ride-engine/gps-speed.js', 'createEstimator', 'Canonical GPS estimator missing');
requireToken('shared/ride-engine/gps-speed.js', 'mergeCanonicalGpsIntoSamples', 'Canonical GPS merge missing');
requireToken('update54.js', 'RideTrackerGpsMath?.mergeCanonicalGpsIntoSamples', 'GPS persistence must use canonical speed');
requireToken('update58.js', "ridetracker:canonical-gps", 'Filtered GPS event missing');
requireToken('update58.js', 'RideTrackerGpsMath', 'GPS health must use canonical estimator');
rejectToken('update58.js', 'new MutationObserver(()=>render())', 'GPS panel must not create a self-triggering render observer');
rejectToken('update58.js', 'observer.observe(document.body,{childList:true,subtree:true})', 'GPS panel must not observe its own DOM writes');

requireToken('shared/ride-engine/browser-adapter.js', 'callback?.(position);', 'Every GPS consumer must receive its callback');
rejectToken('shared/ride-engine/browser-adapter.js', 'if (result.accepted)', 'Shared engine must not starve a GPS consumer');
requireToken('index.html', 'if(window.RideTrackerGpsCapture?.start)', 'Recording must prefer the single GPS capture service');
requireToken('index.html', "ridetracker:recording-started", 'Recording-start event missing');
requireToken('index.html', "ridetracker:recording-stopped", 'Recording-stop event missing');

requireToken('update46.js', 'ensureInlineDashboard', 'Recoverable home dashboard missing');
requireToken('update60.js', 'RideTrackerFrontendNavigation?.ensureHome?.()', 'Safe boot must restore the home dashboard');
requireToken('update60.js', "document.querySelectorAll('.rt-home-panel.open')", 'Safe boot must close stale home panels');
requireToken('update61.js', 'rtCommunityBottomNav', 'Unified mobile navigation missing');
requireToken('update61.js', 'RideTrackerPreflight', 'Recording preflight API missing');
requireToken('update61.js', 'RideTrackerSupportCenter', 'Support center API missing');
requireToken('update61.js', 'RideTrackerAdminCenter', 'Local admin center API missing');
requireToken('shared/core/community-model.js', 'ready-for-backend', 'Community publication state missing');
requireToken('shared/core/community-model.js', 'publicProjection', 'Privacy-safe community projection missing');
requireToken('shared/core/release-manifest.js', 'rollback/pre-speed-compass-3d-20260808', 'Documented rollback point missing');
requireToken('update61.js', 'RideTrackerCommunityHub?.open', 'Community navigation must delegate to the full hub');
requireToken('update62.js', 'RideTrackerCommunityHub', 'Community backend/3D hub missing');
requireToken('shared/core/community-backend.js', 'SERVICE_ROLE_REJECTED', 'Service-role browser protection missing');
requireToken('shared/core/community-backend.js', 'RAW_GPS_REJECTED', 'Raw GPS upload protection missing');
requireToken('shared/visualization/track-3d.js', 'mergeModels', 'Server-compatible multi-ride model merge missing');
requireToken('shared/visualization/track-3d.js', 'nearestProjectedPoint', '3D point picking missing');
requireToken('update63.js', 'RideTrackerCompass', 'Compass runtime missing');
requireToken('update63.js', 'webkitCompassHeading', 'iOS compass support missing');
requireToken('update38.js', 'runtimeErrors.handling', 'Runtime error recursion guard missing');

const html = source['index.html'];
const gpsPosition = html.indexOf('shared/ride-engine/gps-speed.js?v=');
const adapterPosition = html.indexOf('shared/ride-engine/browser-adapter.js?v=');
const healthPosition = html.indexOf('update58.js?v=');
const modelPosition = html.indexOf('shared/core/community-model.js?v=');
const releasePosition = html.indexOf('shared/core/release-manifest.js?v=');
const communityPosition = html.indexOf('update61.js?v=');
const backendPosition = html.indexOf('shared/core/community-backend.js?v=');
const track3dPosition = html.indexOf('shared/visualization/track-3d.js?v=');
const community3dPosition = html.indexOf('update62.js?v=');
const built = gpsPosition >= 0 || adapterPosition >= 0 || healthPosition >= 0 || communityPosition >= 0;
if (built && (gpsPosition < 0 || adapterPosition < 0 || healthPosition < 0 || gpsPosition > adapterPosition || gpsPosition > healthPosition)) {
  throw new Error('Canonical GPS math must load before the adapter and GPS health module');
}
if (built && (modelPosition < 0 || releasePosition < 0 || communityPosition < 0 || modelPosition > communityPosition || releasePosition > communityPosition || communityPosition < healthPosition)) {
  throw new Error('Community model and release manifest must load before update61, after the GPS health runtime');
}
if (built && (backendPosition < 0 || track3dPosition < 0 || community3dPosition < 0 || backendPosition > community3dPosition || track3dPosition > community3dPosition || community3dPosition < communityPosition)) {
  throw new Error('Community backend and 3D runtime must load before update62, after the community foundation');
}

console.log('Runtime regression audit passed.');
