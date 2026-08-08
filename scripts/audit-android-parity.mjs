import fs from 'node:fs';

const files = {
  manifest: 'native-android/app/src/main/AndroidManifest.xml',
  app: 'native-android/app/src/main/java/de/ridetracker/FunctionalRideTrackerApp.kt',
  context: 'native-android/app/src/main/java/de/ridetracker/context/AndroidRideContext.kt',
  contextScreen: 'native-android/app/src/main/java/de/ridetracker/context/AndroidRideContextScreen.kt',
  recorder: 'native-android/app/src/main/java/de/ridetracker/sensors/AndroidSensorRecorder.kt',
  speed: 'native-android/app/src/main/java/de/ridetracker/engine/GpsSpeedEstimator.kt',
  viewer: 'native-android/app/src/main/java/de/ridetracker/Track3DViewer.kt',
  media: 'native-android/app/src/main/java/de/ridetracker/RideMediaScreen.kt',
  workflow: '.github/workflows/android-build.yml',
};

const source = Object.fromEntries(Object.entries(files).map(([name, file]) => {
  if (!fs.existsSync(file)) throw new Error(`Android parity file missing: ${file}`);
  return [name, fs.readFileSync(file, 'utf8')];
}));
const requireToken = (name, token, message) => {
  if (!source[name].includes(token)) throw new Error(message);
};

requireToken('manifest', 'android.permission.INTERNET', 'Android map/weather/image access needs INTERNET permission');
requireToken('manifest', 'android:allowBackup="false"', 'Private ride data must not enter automatic Android cloud backups');
requireToken('app', 'beginAutomaticRecording', 'Android automatic recording flow missing');
requireToken('app', 'Automatisch starten', 'Android bottom recording control missing');
requireToken('app', 'recorder.lastSavedPath == null', 'Android unsaved-ride guard missing');
requireToken('context', 'open-meteo.com', 'Android weather snapshots missing');
requireToken('context', 'commons.wikimedia.org', 'Android licensed stock image lookup missing');
requireToken('context', 'externalLookupConsent', 'External location lookup consent missing');
requireToken('contextScreen', 'NearbyParkMap', 'Android nearby park map missing');
requireToken('contextScreen', 'AndroidSensorFaq', 'Android sensor FAQ missing');
requireToken('recorder', 'GpsSpeedEstimator', 'Android recorder must use canonical stationary speed filtering');
requireToken('recorder', 'TYPE_ROTATION_VECTOR', 'Android compass source missing');
requireToken('speed', 'stationaryLocked', 'Android stationary GPS lock missing');
requireToken('viewer', 'Räumliches XYZ-Modell', 'Android spatial XYZ viewer missing');
requireToken('viewer', 'detectTapGestures', 'Android 3D point inspector missing');
requireToken('media', 'thumbnailNode', 'Android ride thumbnails missing');
requireToken('workflow', 'assembleDebug', 'Android APK build missing');
requireToken('workflow', 'gh release create', 'Direct Android APK release missing');

console.log('Android parity audit passed.');
