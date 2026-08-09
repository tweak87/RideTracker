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
  gradle: 'native-android/app/build.gradle.kts',
  platformLocation: 'native-android/app/src/main/java/de/ridetracker/location/AndroidPlatformLocationProvider.kt',
  communityProfile: 'native-android/app/src/main/java/de/ridetracker/CommunityProfileScreens.kt',
  compatibility: 'native-android/app/src/main/java/de/ridetracker/AndroidCompatibilityScreen.kt',
  heartRate: 'native-android/app/src/main/java/de/ridetracker/sensors/AndroidHeartRateManager.kt',
  deviceScreen: 'native-android/app/src/main/java/de/ridetracker/DeviceCenterScreen.kt',
  liveHud: 'native-android/app/src/main/java/de/ridetracker/AndroidLiveHud.kt',
  video: 'native-android/app/src/main/java/de/ridetracker/video/AndroidVideoRecorder.kt',
  theme: 'native-android/app/src/main/java/de/ridetracker/RideTrackerTheme.kt',
};

const source = Object.fromEntries(Object.entries(files).map(([name, file]) => {
  if (!fs.existsSync(file)) throw new Error(`Android parity file missing: ${file}`);
  return [name, fs.readFileSync(file, 'utf8')];
}));
const requireToken = (name, token, message) => {
  if (!source[name].includes(token)) throw new Error(message);
};
const rejectToken = (name, token, message) => {
  if (source[name].includes(token)) throw new Error(message);
};

requireToken('manifest', 'android.permission.INTERNET', 'Android map/weather/image access needs INTERNET permission');
requireToken('manifest', 'android:allowBackup="false"', 'Private ride data must not enter automatic Android cloud backups');
requireToken('manifest', 'android.hardware.location.gps', 'GPS must remain optional on Fire tablets');
requireToken('app', 'beginAutomaticRecording', 'Android automatic recording flow missing');
requireToken('app', 'Fahrt automatisch starten', 'Android bottom recording control missing');
requireToken('app', 'AndroidLiveRecordingFullscreen', 'Android camera and G-force fullscreen missing');
requireToken('liveHud', 'G_TRAIL_DURATION_MS = 3_000L', 'Android G-force HUD must retain exactly three seconds');
requireToken('liveHud', 'PreviewView.ImplementationMode.COMPATIBLE', 'Huawei-compatible camera preview mode missing');
requireToken('video', 'provider.bindToLifecycle(lifecycleOwner, selector, preview, capture)', 'Camera preview and recording must be bound together');
requireToken('video', 'awaitFinalized', 'Video must finish and validate before playback or ride saving');
requireToken('video', 'MediaMetadataRetriever', 'Finalized Android videos must be checked for playback metadata');
requireToken('theme', 'darkColorScheme', 'Modern dark Android theme missing');
requireToken('app', 'recorder.lastSavedPath == null', 'Android unsaved-ride guard missing');
requireToken('app', 'FunctionalSection.COMMUNITY', 'Community must be a primary Android destination');
requireToken('app', 'FunctionalSection.PROFILE', 'Profile must be a primary Android destination');
requireToken('app', 'Icons.Filled.Groups', 'Primary Android navigation needs recognizable icons');
requireToken('communityProfile', 'Lokaler, datenschutzorientierter Modus', 'Truthful local community status missing');
requireToken('communityProfile', 'Profil anlegen und auswählen', 'Android profile management missing');
requireToken('compatibility', 'Amazon Fire OS erkannt', 'Fire OS diagnostics missing');
requireToken('compatibility', 'Standort ohne Google-Dienste', 'Google-independent location diagnostics missing');
requireToken('compatibility', 'Diagnosebericht kopieren', 'Shareable Fire diagnostics missing');
requireToken('heartRate', 'requiredPermissions()', 'BLE permission compatibility guard missing');
requireToken('heartRate', 'runCatching { adapter?.bluetoothLeScanner', 'BLE scan must not crash when Fire OS rejects access');
requireToken('deviceScreen', 'permissionLauncher.launch(heartRate.requiredPermissions())', 'BLE permission request UI missing');
requireToken('deviceScreen', 'AddDeviceDialog', 'Device add button must open a source selection dialog');
requireToken('deviceScreen', 'LiveSensorDiagnostics', 'Android live sensor graphs missing');
requireToken('context', 'open-meteo.com', 'Android weather snapshots missing');
requireToken('context', 'commons.wikimedia.org', 'Android licensed stock image lookup missing');
requireToken('context', 'externalLookupConsent', 'External location lookup consent missing');
requireToken('contextScreen', 'NearbyParkMap', 'Android nearby park map missing');
requireToken('contextScreen', 'AndroidSensorFaq', 'Android sensor FAQ missing');
requireToken('recorder', 'GpsSpeedEstimator', 'Android recorder must use canonical stationary speed filtering');
requireToken('recorder', 'TYPE_ROTATION_VECTOR', 'Android compass source missing');
requireToken('recorder', 'AndroidPlatformLocationProvider', 'Recorder must use the Google-independent system location provider');
requireToken('context', 'AndroidPlatformLocationProvider', 'Park and weather context must use system location on Fire OS');
requireToken('context', 'completeAfterRecording', 'Automatic park lookup must happen after recording');
requireToken('context', 'OVERPASS_ENDPOINTS', 'Park search needs resilient provider fallbacks');
requireToken('platformLocation', 'LocationManager.GPS_PROVIDER', 'Platform GPS provider missing');
requireToken('platformLocation', 'LocationManager.NETWORK_PROVIDER', 'Platform network location fallback missing');
requireToken('gradle', 'minSdk = 21', 'Fire OS 5 compatibility floor missing');
requireToken('gradle', 'applicationIdSuffix = ".fire8v5"', 'Side-by-side Fire OS 8 test package missing');
requireToken('gradle', 'applicationIdSuffix = ".devicev5"', 'Side-by-side Huawei/Android test package missing');
requireToken('gradle', 'useLegacyPackaging = true', 'Fire-compatible native library packaging missing');
requireToken('gradle', '"armeabi-v7a", "arm64-v8a"', 'Fire APK must only package compatible ARM variants');
rejectToken('gradle', 'play-services-location', 'Fire OS build must not depend on Google Play Services location');
requireToken('speed', 'stationaryLocked', 'Android stationary GPS lock missing');
requireToken('viewer', 'Räumliches XYZ-Modell', 'Android spatial XYZ viewer missing');
requireToken('viewer', 'detectTapGestures', 'Android 3D point inspector missing');
requireToken('viewer', 'smoothAndroidTrackPoints', 'Android coaster model smoothing missing');
requireToken('media', 'Video in Dateien speichern', 'Finalized ride video export missing');
requireToken('media', 'thumbnailNode', 'Android ride thumbnails missing');
requireToken('workflow', 'assembleDebug', 'Android APK build missing');
requireToken('workflow', 'assembleFireTest', 'Dedicated Fire OS APK build missing');
requireToken('workflow', 'INSTALL-RideTracker-ANDROID-DEVICE-v2026.08.09.1.apk', 'Direct Huawei/Android APK artifact missing');
requireToken('workflow', 'INSTALL-RideTracker-FIRE-OS-8-v2026.08.09.1.apk', 'Direct Fire APK artifact missing');
requireToken('workflow', 'apksigner', 'Fire APK signature verification missing');
requireToken('workflow', 'gh release create', 'Direct Android APK release missing');

console.log('Android parity audit passed.');
