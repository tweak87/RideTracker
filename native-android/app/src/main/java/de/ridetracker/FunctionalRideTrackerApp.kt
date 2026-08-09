package de.ridetracker

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import de.ridetracker.context.AndroidRideContextPanel
import de.ridetracker.context.AndroidRideContextStore
import de.ridetracker.context.AndroidSensorFaq
import de.ridetracker.sensors.AndroidHeartRateManager
import de.ridetracker.sensors.AndroidSensorRecorder
import de.ridetracker.session.LocalProfileStore
import de.ridetracker.video.AndroidVideoRecorder
import de.ridetracker.video.VideoHudSample
import kotlinx.coroutines.async
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File

enum class FunctionalSection { HOME, RECORD, RIDES, COMMUNITY, PROFILE, MAP, DEVICES, SETTINGS, HUD, STATISTICS, ACHIEVEMENTS, FAQ, COMPATIBILITY }
private enum class PendingPermissionAction { NONE, START, PARK_SEARCH }

data class AndroidRideEntry(val file: File, val title: String, val distanceMeters: Double, val durationSeconds: Double, val latitude: Double?, val longitude: Double?)

private fun loadRides(context: Context): List<AndroidRideEntry> = context.filesDir.walkTopDown()
    .filter { it.isFile && it.name.endsWith(".ride.json") }
    .mapNotNull { file ->
        runCatching {
            val root = JSONObject(file.readText())
            val summary = root.optJSONObject("summary")
            val contextJson = root.optJSONObject("context")
            val samples = root.optJSONArray("samples")
            var latitude: Double? = null
            var longitude: Double? = null
            if (samples != null) for (index in 0 until samples.length()) {
                val sample = samples.optJSONObject(index) ?: continue
                if (sample.has("latitude") && sample.has("longitude")) {
                    latitude = sample.optDouble("latitude")
                    longitude = sample.optDouble("longitude")
                    break
                }
            }
            AndroidRideEntry(
                file,
                contextJson?.optString("rideName")?.takeIf { it.isNotBlank() }
                    ?: contextJson?.optString("parkName")?.takeIf { it.isNotBlank() }
                    ?: file.nameWithoutExtension,
                summary?.optDouble("distanceMeters") ?: 0.0,
                summary?.optDouble("durationSeconds") ?: 0.0,
                latitude,
                longitude,
            )
        }.getOrNull()
    }.sortedByDescending { it.file.lastModified() }.toList()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FunctionalRideTrackerApp(activity: Activity) {
    val context = activity.applicationContext
    val componentActivity = activity as ComponentActivity
    val recorder = remember { AndroidSensorRecorder(context) }
    val videoRecorder = remember { AndroidVideoRecorder(context, componentActivity) }
    val heartRate = remember { AndroidHeartRateManager(context) }
    val profiles = remember { LocalProfileStore(context) }
    val devices = remember { AndroidDeviceRegistry(context) }
    val rideContext = remember { AndroidRideContextStore(context) }
    val scope = rememberCoroutineScope()

    var section by remember { mutableStateOf(FunctionalSection.HOME) }
    var menuOpen by remember { mutableStateOf(false) }
    var recordVideo by remember { mutableStateOf(true) }
    var pendingPermissionAction by remember { mutableStateOf(PendingPermissionAction.NONE) }
    var pendingVideo by remember { mutableStateOf(false) }
    var starting by remember { mutableStateOf(false) }
    var stopping by remember { mutableStateOf(false) }
    var permissionMessage by remember { mutableStateOf("") }
    var permissionSettingsMessage by remember { mutableStateOf<String?>(null) }
    var pendingTarget by remember { mutableStateOf<FunctionalSection?>(null) }
    var showUnsavedDialog by remember { mutableStateOf(false) }
    var recordingMinimized by remember { mutableStateOf(false) }
    var sessionUsesVideo by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) videoRecorder.configure()
    }
    LaunchedEffect(heartRate.latestHeartRate, heartRate.deviceName) { recorder.setHeartRate(heartRate.latestHeartRate, heartRate.deviceName) }
    LaunchedEffect(recorder.liveGForceSample.timestampMs, recorder.speedKmh, recorder.ridePhase, recorder.latestHeartRateBpm) {
        val g = recorder.liveGForceSample
        if (recorder.isRecording && g.timestampMs > 0L) {
            videoRecorder.updateHud(
                VideoHudSample(
                    timestampMs = g.timestampMs,
                    elapsedSeconds = ((g.timestampMs * 1_000_000L - recorder.recordingStartNs).coerceAtLeast(0L)) / 1_000_000_000.0,
                    speedKmh = recorder.speedKmh,
                    normalG = g.normalG,
                    lateralG = g.lateralG,
                    longitudinalG = g.longitudinalG,
                    totalG = kotlin.math.sqrt(g.normalG * g.normalG + g.lateralG * g.lateralG + g.longitudinalG * g.longitudinalG),
                    phase = recorder.ridePhase,
                    heartRateBpm = recorder.latestHeartRateBpm,
                ),
            )
        }
    }

    fun beginAutomaticRecording(withVideo: Boolean) {
        if (recorder.isRecording || starting) return
        recordingMinimized = !withVideo
        starting = true
        sessionUsesVideo = withVideo
        permissionMessage = "Sensoren, GPS und Kalibrierung werden automatisch vorbereitet …"
        scope.launch {
            if (withVideo) {
                videoRecorder.configure()
                var cameraAttempts = 0
                while (!videoRecorder.isConfigured && cameraAttempts < 60) {
                    delay(100)
                    cameraAttempts += 1
                }
                if (!videoRecorder.isConfigured) {
                    permissionMessage = "Kamera konnte nicht vorbereitet werden: ${videoRecorder.status}"
                    starting = false
                    return@launch
                }
            }
            val contextPreparation = async { rideContext.prepareForRecording() }
            var attempts = 0
            while (recorder.calibrationSampleCount < 20 && attempts < 40) {
                delay(50)
                attempts += 1
            }
            if (!recorder.calibrateNow()) {
                permissionMessage = "Automatische Kalibrierung fehlgeschlagen. Gerät kurz ruhig halten und erneut starten."
                starting = false
                return@launch
            }
            recorder.start()
            if (!recorder.isRecording) {
                permissionMessage = "Die Sensoraufnahme konnte nicht gestartet werden."
                starting = false
                return@launch
            }
            if (withVideo) videoRecorder.start(recorder.sessionId, recorder.recordingStartNs)
            contextPreparation.await()
            recorder.attachRideContext(rideContext.snapshot())
            delay(if (withVideo) 1_500 else 100)
            if (withVideo && !videoRecorder.isRecording && !videoRecorder.isStarting) {
                videoRecorder.configure()
                delay(800)
                videoRecorder.start(recorder.sessionId, recorder.recordingStartNs)
                delay(1_200)
            }
            permissionMessage = if (withVideo && !videoRecorder.isRecording) {
                "Sensoraufnahme läuft, Video konnte nicht bestätigt werden: ${videoRecorder.status}"
            } else "Aufnahme erfolgreich gestartet."
            starting = false
        }
    }

    fun loadNearbyParks() {
        scope.launch {
            runCatching { rideContext.loadNearbyParks() }
                .onFailure { permissionMessage = "Parkkarte konnte nicht geladen werden: ${it.message}" }
        }
    }

    fun requiredPermissions(withVideo: Boolean): Array<String> = buildList {
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        add(Manifest.permission.ACCESS_COARSE_LOCATION)
        if (withVideo) {
            add(Manifest.permission.CAMERA)
            add(Manifest.permission.RECORD_AUDIO)
        }
    }.toTypedArray()

    fun permissionsGranted(values: Array<String>) = values.all { permission ->
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED ||
            (permission == Manifest.permission.ACCESS_FINE_LOCATION && ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED)
    }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        val locationGranted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true || result[Manifest.permission.ACCESS_COARSE_LOCATION] == true ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        when (pendingPermissionAction) {
            PendingPermissionAction.START -> {
                val cameraGranted = !pendingVideo || ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                if (cameraGranted) {
                    permissionMessage = if (locationGranted) "Berechtigungen erteilt." else "GPS nicht freigegeben · Kamera und Kraftsensoren starten trotzdem."
                    if (!locationGranted) permissionSettingsMessage = "Der Standortzugriff ist in den App-Einstellungen deaktiviert. Ohne ihn werden Park, Strecke und GPS-Geschwindigkeit nicht gespeichert."
                    beginAutomaticRecording(pendingVideo)
                } else {
                    permissionMessage = "Die Kamera muss für eine Videoaufnahme freigegeben werden."
                    permissionSettingsMessage = "Die Kamerafreigabe fehlt. Öffne die App-Einstellungen und erlaube Kamera; für Ton zusätzlich Mikrofon."
                }
            }
            PendingPermissionAction.PARK_SEARCH -> if (locationGranted) loadNearbyParks() else {
                permissionMessage = "Für die Parkkarte wird die Standortfreigabe benötigt."
                permissionSettingsMessage = "Standort ist deaktiviert. Aktiviere unter App-Einstellungen → Berechtigungen den Standortzugriff."
            }
            PendingPermissionAction.NONE -> Unit
        }
        pendingPermissionAction = PendingPermissionAction.NONE
    }

    fun requestAutomaticStart(withVideo: Boolean) {
        pendingVideo = withVideo
        val permissions = requiredPermissions(withVideo)
        val cameraGranted = !withVideo || ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        val locationGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (cameraGranted && locationGranted) beginAutomaticRecording(withVideo)
        else {
            pendingPermissionAction = PendingPermissionAction.START
            permissionLauncher.launch(permissions)
        }
    }

    fun requestParkSearch() {
        val permissions = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (permissionsGranted(permissions)) loadNearbyParks()
        else {
            pendingPermissionAction = PendingPermissionAction.PARK_SEARCH
            permissionLauncher.launch(permissions)
        }
    }

    fun stopRecording() {
        if (!recorder.isRecording || stopping) return
        stopping = true
        videoRecorder.stop()
        recorder.stop()
        scope.launch {
            val finalizedVideo = if (sessionUsesVideo) videoRecorder.awaitFinalized() else null
            rideContext.completeAfterRecording()
            recorder.attachRideContext(rideContext.snapshot())
            permissionMessage = when {
                sessionUsesVideo && finalizedVideo == null -> "Fahrtdaten beendet; das Video konnte nicht finalisiert werden. ${videoRecorder.status}"
                rideContext.autoParkLookupEnabled -> "Aufnahme beendet. Parkauswahl und Karte sind jetzt bereit; die Fahrt kann gespeichert werden."
                else -> "Aufnahme beendet. Fahrt kann jetzt bewusst gespeichert werden."
            }
            stopping = false
            recordingMinimized = false
        }
    }

    fun saveRide(): Boolean {
        return runCatching {
            if (sessionUsesVideo && videoRecorder.isFinalizing) error("Das Video wird noch abgeschlossen. Bitte einen Moment warten.")
            recorder.attachVideo(
                if (sessionUsesVideo) videoRecorder.playableVideoFile?.takeIf(File::exists)?.name else null,
                videoRecorder.startOffsetSeconds,
                sessionUsesVideo && videoRecorder.isHudEmbedded,
            )
            recorder.attachRideContext(rideContext.snapshot())
            recorder.saveSession().also { require(it.exists() && it.length() > 0L) { "Die Fahrtdaten wurden nicht geschrieben." } }
        }.onSuccess { file ->
            permissionMessage = "Fahrt erfolgreich gespeichert: ${file.name}"
            rideContext.resetRideMedia()
            sessionUsesVideo = false
        }.onFailure { error ->
            permissionMessage = "Speichern fehlgeschlagen: ${error.message ?: "unbekannter Fehler"}"
        }.isSuccess
    }

    fun completeNavigation(target: FunctionalSection) { section = target; menuOpen = false; pendingTarget = null }
    val navigate: (FunctionalSection) -> Unit = { target ->
        if (section == FunctionalSection.RECORD && target != FunctionalSection.RECORD && !recorder.isRecording && recorder.sampleCount > 0 && recorder.lastSavedPath == null) {
            pendingTarget = target; showUnsavedDialog = true; menuOpen = false
        } else completeNavigation(target)
    }

    val fullscreenRecording = recordVideo && (starting || recorder.isRecording) && !recordingMinimized
    BackHandler(enabled = fullscreenRecording || menuOpen || section != FunctionalSection.HOME) {
        when {
            fullscreenRecording -> recordingMinimized = true
            menuOpen -> menuOpen = false
            else -> navigate(FunctionalSection.HOME)
        }
    }

    if (showUnsavedDialog) AlertDialog(
        onDismissRequest = { showUnsavedDialog = false; pendingTarget = null },
        title = { Text("Fahrt noch nicht gespeichert") },
        text = { Text("Möchtest du die aufgezeichnete Fahrt vor dem Wechsel speichern?") },
        confirmButton = { TextButton(onClick = { if (saveRide()) { showUnsavedDialog = false; pendingTarget?.let(::completeNavigation) } }) { Text("Speichern") } },
        dismissButton = {
            Row {
                TextButton(onClick = { showUnsavedDialog = false; pendingTarget?.let(::completeNavigation) }) { Text("Ohne Speichern") }
                TextButton(onClick = { showUnsavedDialog = false; pendingTarget = null }) { Text("Abbrechen") }
            }
        },
    )

    permissionSettingsMessage?.let { guidance ->
        AlertDialog(
            onDismissRequest = { permissionSettingsMessage = null },
            title = { Text("Berechtigung in App-Einstellungen") },
            text = { Text(guidance) },
            confirmButton = {
                Button(onClick = {
                    context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    permissionSettingsMessage = null
                }) { Text("App-Einstellungen öffnen") }
            },
            dismissButton = { TextButton(onClick = { permissionSettingsMessage = null }) { Text("Später") } },
        )
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(RideMidnight),
    ) {
        Scaffold(
            containerColor = RideMidnight,
            contentWindowInsets = WindowInsets.safeDrawing,
            topBar = {
                TopAppBar(
                    title = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RideTrackerLogo()
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text("RideTracker", style = MaterialTheme.typography.titleLarge)
                                Text("Ride Stories · Telemetrie · Community", style = MaterialTheme.typography.labelSmall, color = RideMuted)
                            }
                        }
                    },
                    navigationIcon = { IconButton(onClick = { menuOpen = true }) { Icon(Icons.Filled.Menu, "Menü") } },
                    actions = {
                        Surface(color = RideSurfaceHigh, shape = CircleShape, modifier = Modifier.padding(end = 10.dp)) {
                            Row(Modifier.padding(horizontal = 11.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.Person, null, Modifier.size(17.dp), tint = RideCyan)
                                Spacer(Modifier.width(6.dp)); Text(profiles.activeProfile.name, style = MaterialTheme.typography.labelLarge)
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = RideSurface),
                )
            },
            bottomBar = {
                Column {
                    val unsavedDraft = !recorder.isRecording && recorder.sampleCount > 0 && recorder.lastSavedPath == null
                    if (section == FunctionalSection.RECORD && unsavedDraft) {
                        RideDraftActionBar(
                            enabled = !stopping && !videoRecorder.isFinalizing,
                            readyForCommunity = recorder.publicationStatus == "ready_to_publish",
                            save = { if (saveRide()) completeNavigation(FunctionalSection.RIDES) },
                        )
                    } else if (section == FunctionalSection.RECORD || recorder.isRecording || starting) RecordingControlBar(
                            recorder = recorder,
                            videoRecorder = videoRecorder,
                            recordVideo = recordVideo,
                            setRecordVideo = { recordVideo = it },
                            starting = starting,
                            stopping = stopping,
                            message = permissionMessage,
                            start = { requestAutomaticStart(recordVideo) },
                            stop = ::stopRecording,
                            openSensors = { navigate(FunctionalSection.DEVICES) },
                        )
                    NavigationBar(containerColor = RideSurface, tonalElevation = 10.dp) {
                        listOf(
                            Triple(FunctionalSection.COMMUNITY, "Feed", Icons.Filled.DynamicFeed),
                            Triple(FunctionalSection.HOME, "Entdecken", Icons.Filled.Explore),
                            Triple(FunctionalSection.RECORD, "Aufnahme", Icons.Filled.FiberManualRecord),
                            Triple(FunctionalSection.RIDES, "Fahrten", Icons.Filled.Folder),
                            Triple(FunctionalSection.PROFILE, "Profil", Icons.Filled.Person),
                        ).forEach { (target, label, icon) ->
                            NavigationBarItem(
                                selected = section == target,
                                onClick = { navigate(target) },
                                icon = { Icon(icon, contentDescription = label) },
                                label = { Text(label) },
                                colors = NavigationBarItemDefaults.colors(indicatorColor = RideCyan.copy(alpha = .22f)),
                            )
                        }
                    }
                }
            },
        ) { padding ->
            key(section) {
                when (section) {
                    FunctionalSection.HOME -> AndroidDashboard(Modifier.padding(padding), profiles.activeProfile.name, navigate)
                    FunctionalSection.RECORD -> AndroidRecording(Modifier.padding(padding), recorder, videoRecorder, rideContext, stopping, sessionUsesVideo, ::requestParkSearch, ::saveRide) { recordingMinimized = false }
                    FunctionalSection.RIDES -> RideMediaScreen(Modifier.padding(padding), profiles)
                    FunctionalSection.COMMUNITY -> AndroidCommunityOverview(Modifier.padding(padding), profiles.activeProfile.name)
                    FunctionalSection.PROFILE -> AndroidProfileScreen(Modifier.padding(padding), profiles)
                    FunctionalSection.MAP -> AndroidRideMapList(Modifier.padding(padding), context)
                    FunctionalSection.DEVICES -> AndroidDeviceCenter(Modifier.padding(padding), devices, heartRate, recorder)
                    FunctionalSection.SETTINGS -> AndroidSettings(Modifier.padding(padding), recorder, heartRate, { navigate(FunctionalSection.HUD) }, { navigate(FunctionalSection.DEVICES) }, { navigate(FunctionalSection.COMPATIBILITY) })
                    FunctionalSection.HUD -> AndroidHudFullscreenEditor(Modifier.padding(padding))
                    FunctionalSection.STATISTICS -> StatisticsScreen(Modifier.padding(padding))
                    FunctionalSection.ACHIEVEMENTS -> AchievementsScreen(Modifier.padding(padding))
                    FunctionalSection.FAQ -> AndroidSensorFaq(Modifier.padding(padding))
                    FunctionalSection.COMPATIBILITY -> AndroidCompatibilityScreen(Modifier.padding(padding))
                }
            }
        }

        if (fullscreenRecording) AndroidLiveRecordingFullscreen(
            activity = activity,
            recorder = recorder,
            video = videoRecorder,
            preparing = starting,
            minimize = { recordingMinimized = true },
            stop = ::stopRecording,
        )
    }

    if (menuOpen) ModalBottomSheet(onDismissRequest = { menuOpen = false }) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Hauptmenü", style = MaterialTheme.typography.headlineSmall)
            Text("Hauptbereiche", style = MaterialTheme.typography.titleMedium)
            listOf(FunctionalSection.COMMUNITY, FunctionalSection.HOME, FunctionalSection.RECORD, FunctionalSection.RIDES, FunctionalSection.PROFILE).forEach { target ->
                TextButton(onClick = { navigate(target) }, modifier = Modifier.fillMaxWidth()) { Text(target.displayName(), modifier = Modifier.fillMaxWidth()) }
            }
            HorizontalDivider()
            Text("Werkzeuge & Einstellungen", style = MaterialTheme.typography.titleMedium)
            FunctionalSection.entries.filterNot { it in setOf(FunctionalSection.HOME, FunctionalSection.RECORD, FunctionalSection.RIDES, FunctionalSection.COMMUNITY, FunctionalSection.PROFILE) }.forEach { target ->
                TextButton(onClick = { navigate(target) }, modifier = Modifier.fillMaxWidth()) { Text(target.displayName(), modifier = Modifier.fillMaxWidth()) }
            }
        }
    }
}

@Composable
private fun RecordingControlBar(
    recorder: AndroidSensorRecorder,
    videoRecorder: AndroidVideoRecorder,
    recordVideo: Boolean,
    setRecordVideo: (Boolean) -> Unit,
    starting: Boolean,
    stopping: Boolean,
    message: String,
    start: () -> Unit,
    stop: () -> Unit,
    openSensors: () -> Unit,
) {
    Surface(
        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
        color = if (recorder.isRecording) Color(0xFF4D1020) else RideSurfaceHigh,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, if (recorder.isRecording) RideRose.copy(alpha = .75f) else RideCyan.copy(alpha = .45f)),
        tonalElevation = 8.dp,
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Surface(color = if (recorder.isRecording) RideRose else RideCyan, shape = CircleShape, modifier = Modifier.size(10.dp)) {}
                Spacer(Modifier.width(9.dp))
                Text(if (recorder.isRecording) "Aufnahme läuft" else if (starting) "Fahrt wird vorbereitet" else "Fahrt automatisch starten", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                if (recorder.isRecording) Text("${"%.0f".format(recorder.speedKmh)} km/h", color = RideCyan, style = MaterialTheme.typography.titleMedium)
            }
            Text(
                when {
                    message.isNotBlank() -> message
                    recorder.isRecording -> "Sensoren${if (videoRecorder.isRecording) " und Video" else ""} werden aufgezeichnet."
                    else -> "Initialisierung, Kalibrierung und Aufnahme erfolgen in einem Schritt."
                },
                style = MaterialTheme.typography.bodySmall,
            )
            if (!recorder.isRecording && !starting) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) { Checkbox(recordVideo, setRecordVideo); Icon(Icons.Filled.Videocam, null, Modifier.size(18.dp)); Spacer(Modifier.width(5.dp)); Text("Video") }
                    FilledTonalIconButton(openSensors) { Icon(Icons.Filled.Sensors, "Sensoren") }
                    Spacer(Modifier.width(7.dp))
                    Button(start, contentPadding = PaddingValues(horizontal = 15.dp, vertical = 11.dp)) { Icon(Icons.Filled.PlayArrow, null); Spacer(Modifier.width(5.dp)); Text("Start") }
                }
            } else if (recorder.isRecording) Button(stop, enabled = !stopping, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = RideRose)) { Icon(Icons.Filled.Stop, null); Spacer(Modifier.width(7.dp)); Text(if (stopping) "Wird beendet …" else "Aufnahme stoppen") }
        }
    }
}

@Composable
private fun RideDraftActionBar(
    enabled: Boolean,
    readyForCommunity: Boolean,
    save: () -> Unit,
) {
    Surface(
        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
        color = RideSurfaceHigh,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, RideGreen.copy(alpha = .48f)),
        tonalElevation = 10.dp,
    ) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Ride Story fertigstellen", style = MaterialTheme.typography.titleMedium)
                Text(
                    if (readyForCommunity) "Lokal speichern · für späteren Community-Upload markiert"
                    else "Privat und lokal speichern",
                    style = MaterialTheme.typography.bodySmall,
                    color = RideMuted,
                )
            }
            Button(onClick = save, enabled = enabled) {
                Icon(Icons.Filled.Save, null)
                Spacer(Modifier.width(6.dp))
                Text(if (enabled) "Speichern" else "Warten …")
            }
        }
    }
}

private fun FunctionalSection.displayName() = when (this) {
    FunctionalSection.HOME -> "Entdecken"
    FunctionalSection.RECORD -> "Neue Fahrt"
    FunctionalSection.RIDES -> "Meine Fahrten"
    FunctionalSection.COMMUNITY -> "Community-Feed"
    FunctionalSection.PROFILE -> "Profile"
    FunctionalSection.MAP -> "Parks & Strecken"
    FunctionalSection.DEVICES -> "Geräte & Sensoren"
    FunctionalSection.SETTINGS -> "Einstellungen"
    FunctionalSection.HUD -> "HUD-Konfiguration"
    FunctionalSection.STATISTICS -> "Statistiken"
    FunctionalSection.ACHIEVEMENTS -> "Achievements"
    FunctionalSection.FAQ -> "FAQ & Messmethode"
    FunctionalSection.COMPATIBILITY -> "Kompatibilität & Diagnose"
}

@Composable
private fun AndroidDashboard(modifier: Modifier, profile: String, select: (FunctionalSection) -> Unit) {
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(color = RideSurfaceHigh, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, RideCyan.copy(alpha = .25f))) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Text("Bereit für die nächste Fahrt?", style = MaterialTheme.typography.headlineMedium)
                Text("Hallo $profile · Aufnahme, Kalibrierung und Kamera starten mit einem Tipp automatisch.", color = RideMuted)
                Button({ select(FunctionalSection.RECORD) }, Modifier.fillMaxWidth()) { Icon(Icons.Filled.FiberManualRecord, null); Spacer(Modifier.width(8.dp)); Text("Neue Fahrt aufnehmen") }
                Text("Die Hauptnavigation bleibt während des Scrollens jederzeit am unteren Rand erreichbar.", style = MaterialTheme.typography.labelSmall, color = RideMuted)
            }
        }
        Text("Deine Bereiche", style = MaterialTheme.typography.titleLarge)
        DashboardCard(Icons.Filled.Folder, RideCyan, "Meine Fahrten", "Thumbnails, Wetter, Videos und räumliche 3D-Auswertung") { select(FunctionalSection.RIDES) }
        DashboardCard(Icons.Filled.Groups, RideGreen, "Community", "Lokaler Datenschutzstatus und vorbereitete Online-Funktionen") { select(FunctionalSection.COMMUNITY) }
        DashboardCard(Icons.Filled.Map, RideAmber, "Parks & Strecken", "GPS-Fahrten und Startpositionen") { select(FunctionalSection.MAP) }
        DashboardCard(Icons.Filled.Sensors, RideCyan, "Geräte & Sensoren", "Interne und externe Quellen konfigurieren") { select(FunctionalSection.DEVICES) }
        DashboardCard(Icons.Filled.Tune, RideGreen, "HUD-Konfiguration", "Vollbild-Editor für Hoch- und Querformat") { select(FunctionalSection.HUD) }
        DashboardCard(Icons.Filled.Help, RideAmber, "FAQ & Messmethode", "G-Kräfte, GPS-Filter, Kompass und Messqualität") { select(FunctionalSection.FAQ) }
        DashboardCard(Icons.Filled.QueryStats, RideCyan, "Statistiken", "Kilometer, Fahrzeit und Rekorde") { select(FunctionalSection.STATISTICS) }
        DashboardCard(Icons.Filled.EmojiEvents, RideAmber, "Achievements", "Persönliche Meilensteine") { select(FunctionalSection.ACHIEVEMENTS) }
        DashboardCard(Icons.Filled.Person, RideGreen, "Profile", "Lokale Nutzer anlegen und Fahrten sauber trennen") { select(FunctionalSection.PROFILE) }
        DashboardCard(Icons.Filled.Settings, RideCyan, "Einstellungen", "Manuelle Kalibrierung, Sensoren und Berechtigungen") { select(FunctionalSection.SETTINGS) }
        DashboardCard(Icons.Filled.Build, RideRose, "Kompatibilität & Diagnose", "Fire OS, Standortanbieter, Speicher und Sensoren prüfen") { select(FunctionalSection.COMPATIBILITY) }
    }
}

@Composable
private fun DashboardCard(icon: ImageVector, tint: Color, title: String, subtitle: String, click: () -> Unit) {
    Card(
        onClick = click,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = RideSurface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(Modifier.padding(15.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(color = tint.copy(alpha = .14f), shape = CircleShape) { Icon(icon, null, Modifier.padding(11.dp).size(23.dp), tint = tint) }
            Spacer(Modifier.width(13.dp))
            Column(Modifier.weight(1f)) { Text(title, style = MaterialTheme.typography.titleMedium); Text(subtitle, style = MaterialTheme.typography.bodySmall, color = RideMuted) }
            Icon(Icons.Filled.ChevronRight, null, tint = RideMuted)
        }
    }
}

@Composable
private fun AndroidRecording(
    modifier: Modifier,
    recorder: AndroidSensorRecorder,
    video: AndroidVideoRecorder,
    rideContext: AndroidRideContextStore,
    stopping: Boolean,
    sessionUsesVideo: Boolean,
    requestParkSearch: () -> Unit,
    saveRide: () -> Boolean,
    openFullscreen: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var exportStatus by remember { mutableStateOf("") }
    val previewSamples = if (!recorder.isRecording && recorder.sampleCount > 0) {
        remember(recorder.sessionId, recorder.sampleCount) { recorder.sessionSamplesSnapshot() }
    } else emptyList()
    val previewTrack = remember(previewSamples) { deriveAndroidTrackPoints(previewSamples) }
    val exportVideo = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("video/mp4")) { destination ->
        val source = video.playableVideoFile
        if (destination != null && source != null) scope.launch {
            exportStatus = runCatching {
                withContext(Dispatchers.IO) {
                    context.contentResolver.openOutputStream(destination, "w")?.use { output -> source.inputStream().use { it.copyTo(output) } }
                        ?: error("Zieldatei konnte nicht geöffnet werden")
                }
                "Video wurde am ausgewählten Ort gespeichert."
            }.getOrElse { "Videoexport fehlgeschlagen: ${it.message}" }
        }
    }
    if (!recorder.isRecording && recorder.sampleCount > 0 && recorder.lastSavedPath == null) {
        RideStoryDraftScreen(
            modifier = modifier,
            recorder = recorder,
            rideContext = rideContext,
            samples = previewSamples,
            trackPoints = previewTrack,
            videoFile = video.playableVideoFile?.takeIf(File::exists),
            videoStartOffsetSeconds = video.startOffsetSeconds,
            videoHudEmbedded = video.isHudEmbedded,
            videoFinalizing = video.isFinalizing,
            videoStatus = video.status,
            requestParkSearch = requestParkSearch,
            exportVideo = { exportVideo.launch("RideTracker-${recorder.sessionId.take(8)}.mp4") },
            exportStatus = exportStatus,
        )
        return
    }
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Neue Fahrt", style = MaterialTheme.typography.headlineMedium)
        val videoFile = video.playableVideoFile
        if (!recorder.isRecording && sessionUsesVideo && videoFile != null && videoFile.exists()) {
            Text("Aufnahme prüfen", style = MaterialTheme.typography.titleLarge)
            Text("Abspielen, Sensorwerte kontrollieren und 3D-Strecke ansehen – erst danach entscheidest du über das Speichern.", color = RideMuted, style = MaterialTheme.typography.bodySmall)
            AndroidRideVideoPreview(
                file = videoFile,
                samples = previewSamples,
                startOffsetSeconds = video.startOffsetSeconds,
                hudEmbedded = video.isHudEmbedded,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedButton(onClick = { exportVideo.launch("RideTracker-${recorder.sessionId.take(8)}.mp4") }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Download, null); Spacer(Modifier.width(7.dp)); Text(if (video.isHudEmbedded) "HUD-Video in Dateien speichern" else "Originalvideo in Dateien speichern")
            }
            if (exportStatus.isNotBlank()) Text(exportStatus, style = MaterialTheme.typography.bodySmall)
        } else if (video.isFinalizing) {
            Card(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(24.dp)); Spacer(Modifier.width(10.dp)); Text("Video wird abgeschlossen und auf Abspielbarkeit geprüft …")
                }
            }
        } else if (!recorder.isRecording && sessionUsesVideo && recorder.sampleCount > 0) {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = RideRose.copy(alpha = .15f))) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text("Video konnte nicht als Vorschau geöffnet werden", style = MaterialTheme.typography.titleMedium, color = RideRose)
                    Text(video.status, style = MaterialTheme.typography.bodySmall)
                    Text("Die Sensordaten und die 3D-Auswertung sind weiterhin vorhanden und können gespeichert werden.", color = RideMuted, style = MaterialTheme.typography.bodySmall)
                }
            }
        } else Surface(color = Color.Black, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
            Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f), contentAlignment = Alignment.Center) {
                AndroidView(
                    factory = { cameraContext ->
                        PreviewView(cameraContext).apply {
                            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                            scaleType = PreviewView.ScaleType.FILL_CENTER
                            video.attachPreview(surfaceProvider)
                        }
                    },
                    update = { video.attachPreview(it.surfaceProvider) },
                    modifier = Modifier.fillMaxSize(),
                )
                Surface(color = Color(0x99030B14), shape = MaterialTheme.shapes.small, modifier = Modifier.align(Alignment.BottomStart).padding(10.dp)) {
                    Text("Kamera · ${video.status}", Modifier.padding(horizontal = 10.dp, vertical = 7.dp), style = MaterialTheme.typography.labelMedium)
                }
                if (recorder.isRecording || video.isRecording) FilledTonalIconButton(onClick = openFullscreen, modifier = Modifier.align(Alignment.TopEnd).padding(10.dp)) {
                    Icon(Icons.Filled.Fullscreen, "Kamera und HUD im Vollbild öffnen")
                }
            }
        }
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text("Live-Telemetrie", style = MaterialTheme.typography.titleMedium)
                Text("Status: ${recorder.status}")
                Text("Tempo: ${"%.1f".format(recorder.speedKmh)} km/h · ${recorder.speedSource}${if (recorder.stationaryLocked) " · Stillstand gesperrt" else ""}")
                Text("Strecke: ${"%.1f".format(recorder.distanceMeters)} m · ${recorder.acceptedLocations} GPS-Punkte akzeptiert")
                Text(
                    "GNSS: ${recorder.satellitesUsedInFix}/${recorder.satellitesVisible} Satelliten verwendet/sichtbar · Genauigkeit ${recorder.horizontalAccuracyM?.let { "±%.1f m".format(it) } ?: "–"}",
                    style = MaterialTheme.typography.bodySmall,
                )
                Text("Höhe: ${"%.1f".format(recorder.relativeAltitudeM)} m · ${recorder.altitudeSource} · Qualität ${recorder.qualityScore} %")
                Text("Kompass: ${recorder.headingDegrees?.let { "${"%.0f".format(it)}° ${compassDirection(it)}" } ?: "noch ohne Richtung"}")
            }
        }
        AndroidGForceTrail(recorder.liveGForceSample, Modifier.fillMaxWidth())
        if (!recorder.isRecording) {
            Card(colors = CardDefaults.cardColors(containerColor = RideAmber.copy(alpha = .12f)), border = BorderStroke(1.dp, RideAmber.copy(alpha = .35f))) {
                Row(Modifier.fillMaxWidth().padding(13.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.HealthAndSafety, null, tint = RideAmber)
                    Spacer(Modifier.width(10.dp))
                    Text("Video nur mit einer vom Park erlaubten, sicher befestigten Halterung aufnehmen. Parkregeln und Anweisungen des Personals haben immer Vorrang.", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        if (!recorder.isRecording && recorder.sampleCount > 0) {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = RideSurfaceHigh)) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("3D-Auswertung vor dem Speichern", style = MaterialTheme.typography.titleLarge)
                    Text("Die räumliche Strecke wird direkt aus der noch ungespeicherten Session erzeugt.", color = RideMuted, style = MaterialTheme.typography.bodySmall)
                    AndroidTrack3DViewer(previewTrack, Modifier.fillMaxWidth())
                }
            }
            AndroidRideContextPanel(rideContext, requestParkSearch, parkLookupAllowed = true)
        } else if (!recorder.isRecording) {
            Card(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.LocationOn, null, tint = RideMuted)
                    Spacer(Modifier.width(9.dp))
                    Text("Park, Attraktion, Wetter, Video und 3D-Auswertung erscheinen nach dem Beenden der Aufnahme.", color = RideMuted, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        Button(enabled = !recorder.isRecording && !stopping && !video.isFinalizing && recorder.sampleCount > 0 && recorder.lastSavedPath == null, onClick = { saveRide() }, modifier = Modifier.fillMaxWidth()) { Text("Fahrt bewusst speichern") }
        Spacer(Modifier.height(190.dp))
    }
}

@Composable
private fun AndroidRideMapList(modifier: Modifier, context: Context) {
    val rides = remember { loadRides(context).filter { it.latitude != null && it.longitude != null } }
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Parks & Strecken", style = MaterialTheme.typography.headlineMedium)
        if (rides.isEmpty()) Text("Noch keine Fahrten mit GPS-Daten vorhanden.")
        rides.forEach { ride -> Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp)) { Text(ride.title, style = MaterialTheme.typography.titleMedium); Text("${"%.5f".format(ride.latitude)}, ${"%.5f".format(ride.longitude)}"); Text("${"%.2f".format(ride.distanceMeters / 1000)} km") } } }
    }
}

@Composable
private fun AndroidSettings(
    modifier: Modifier,
    recorder: AndroidSensorRecorder,
    heartRate: AndroidHeartRateManager,
    openHud: () -> Unit,
    openDevices: () -> Unit,
    openCompatibility: () -> Unit,
) {
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Einstellungen", style = MaterialTheme.typography.headlineMedium)
        Card {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Aufnahme & Kalibrierung", style = MaterialTheme.typography.titleMedium)
                Text("Fahrtrichtung: ${recorder.forwardEdge.title} · ${recorder.calibrationSampleCount} Ruhesamples")
                Button(onClick = { val all = de.ridetracker.engine.ForwardEdge.entries; recorder.forwardEdge = all[(recorder.forwardEdge.ordinal + 1) % all.size] }) { Text("Fahrtrichtung wechseln") }
                OutlinedButton(onClick = { recorder.calibrateNow() }) { Text("Jetzt manuell kalibrieren") }
            }
        }
        Card {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("BLE Herzfrequenz", style = MaterialTheme.typography.titleMedium)
                Text(heartRate.status)
                Row { Button(onClick = heartRate::scan) { Text("Suchen") }; Spacer(Modifier.width(8.dp)); Button(onClick = heartRate::connect) { Text("Verbinden") } }
            }
        }
        Button(onClick = openDevices, modifier = Modifier.fillMaxWidth()) { Text("Geräte & Sensoren konfigurieren") }
        Button(onClick = openHud, modifier = Modifier.fillMaxWidth()) { Text("HUD-Konfiguration öffnen") }
        OutlinedButton(onClick = openCompatibility, modifier = Modifier.fillMaxWidth()) { Text("Kompatibilität & Diagnose") }
    }
}

private fun compassDirection(value: Double): String {
    val labels = listOf("N", "NO", "O", "SO", "S", "SW", "W", "NW")
    return labels[((value + 22.5) / 45.0).toInt() % labels.size]
}
