package de.ridetracker

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.widget.MediaController
import android.widget.VideoView
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
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
import androidx.compose.ui.input.pointer.pointerInput
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
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
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
    var pendingTarget by remember { mutableStateOf<FunctionalSection?>(null) }
    var showUnsavedDialog by remember { mutableStateOf(false) }
    var recordingMinimized by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) videoRecorder.configure()
    }
    LaunchedEffect(heartRate.latestHeartRate, heartRate.deviceName) { recorder.setHeartRate(heartRate.latestHeartRate, heartRate.deviceName) }

    fun beginAutomaticRecording(withVideo: Boolean) {
        if (recorder.isRecording || starting) return
        recordingMinimized = !withVideo
        starting = true
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
                    beginAutomaticRecording(pendingVideo)
                } else permissionMessage = "Die Kamera muss für eine Videoaufnahme freigegeben werden."
            }
            PendingPermissionAction.PARK_SEARCH -> if (locationGranted) loadNearbyParks() else permissionMessage = "Für die Parkkarte wird die Standortfreigabe benötigt."
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
            runCatching { if (rideContext.weatherEnabled) rideContext.captureWeather("end") }
            recorder.attachRideContext(rideContext.snapshot())
            permissionMessage = "Aufnahme beendet. Fahrt kann jetzt bewusst gespeichert werden."
            stopping = false
            recordingMinimized = false
        }
    }

    fun saveRide(): Boolean {
        return runCatching {
            recorder.attachVideo(videoRecorder.lastVideoFile?.takeIf(File::exists)?.name, videoRecorder.startOffsetSeconds)
            recorder.attachRideContext(rideContext.snapshot())
            recorder.saveSession().also { require(it.exists() && it.length() > 0L) { "Die Fahrtdaten wurden nicht geschrieben." } }
        }.onSuccess { file ->
            permissionMessage = "Fahrt erfolgreich gespeichert: ${file.name}"
            rideContext.resetRideMedia()
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

    val primarySections = remember { listOf(FunctionalSection.HOME, FunctionalSection.RECORD, FunctionalSection.RIDES, FunctionalSection.COMMUNITY, FunctionalSection.PROFILE) }
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

    Box(
        Modifier
            .fillMaxSize()
            .background(RideMidnight)
            .pointerInput(section, recorder.isRecording, starting) {
                if (!recorder.isRecording && !starting && section in primarySections) {
                    var horizontalDrag = 0f
                    detectHorizontalDragGestures(
                        onHorizontalDrag = { change, amount -> change.consume(); horizontalDrag += amount },
                        onDragCancel = { horizontalDrag = 0f },
                        onDragEnd = {
                            val current = primarySections.indexOf(section)
                            val threshold = 96.dp.toPx()
                            val next = when {
                                horizontalDrag < -threshold -> (current + 1).coerceAtMost(primarySections.lastIndex)
                                horizontalDrag > threshold -> (current - 1).coerceAtLeast(0)
                                else -> current
                            }
                            if (next != current) navigate(primarySections[next])
                            horizontalDrag = 0f
                        },
                    )
                }
            },
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
                                Text("Fahrten · Telemetrie · Community", style = MaterialTheme.typography.labelSmall, color = RideMuted)
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
                    if (section == FunctionalSection.RECORD || recorder.isRecording || starting) RecordingControlBar(
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
                            Triple(FunctionalSection.HOME, "Start", Icons.Filled.Home),
                            Triple(FunctionalSection.RECORD, "Aufnahme", Icons.Filled.FiberManualRecord),
                            Triple(FunctionalSection.RIDES, "Fahrten", Icons.Filled.Folder),
                            Triple(FunctionalSection.COMMUNITY, "Community", Icons.Filled.Groups),
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
            when (section) {
                FunctionalSection.HOME -> AndroidDashboard(Modifier.padding(padding), profiles.activeProfile.name, navigate)
                FunctionalSection.RECORD -> AndroidRecording(Modifier.padding(padding), recorder, videoRecorder, rideContext, stopping, ::requestParkSearch, ::saveRide) { recordingMinimized = false }
                FunctionalSection.RIDES -> RideMediaScreen(Modifier.padding(padding), profiles)
                FunctionalSection.COMMUNITY -> AndroidCommunityOverview(Modifier.padding(padding), profiles.activeProfile.name)
                FunctionalSection.PROFILE -> AndroidProfileScreen(Modifier.padding(padding), profiles)
                FunctionalSection.MAP -> AndroidRideMapList(Modifier.padding(padding), context)
                FunctionalSection.DEVICES -> AndroidDeviceCenter(Modifier.padding(padding), devices, heartRate)
                FunctionalSection.SETTINGS -> AndroidSettings(Modifier.padding(padding), recorder, heartRate, { navigate(FunctionalSection.HUD) }, { navigate(FunctionalSection.DEVICES) }, { navigate(FunctionalSection.COMPATIBILITY) })
                FunctionalSection.HUD -> AndroidHudFullscreenEditor(Modifier.padding(padding))
                FunctionalSection.STATISTICS -> StatisticsScreen(Modifier.padding(padding))
                FunctionalSection.ACHIEVEMENTS -> AchievementsScreen(Modifier.padding(padding))
                FunctionalSection.FAQ -> AndroidSensorFaq(Modifier.padding(padding))
                FunctionalSection.COMPATIBILITY -> AndroidCompatibilityScreen(Modifier.padding(padding))
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
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Hauptmenü", style = MaterialTheme.typography.headlineSmall)
            Text("Hauptbereiche", style = MaterialTheme.typography.titleMedium)
            listOf(FunctionalSection.HOME, FunctionalSection.RECORD, FunctionalSection.RIDES, FunctionalSection.COMMUNITY, FunctionalSection.PROFILE).forEach { target ->
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

private fun FunctionalSection.displayName() = when (this) {
    FunctionalSection.HOME -> "Start"
    FunctionalSection.RECORD -> "Neue Fahrt"
    FunctionalSection.RIDES -> "Meine Fahrten"
    FunctionalSection.COMMUNITY -> "Community"
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
                Text("Zwischen Hauptseiten kannst du auch nach links oder rechts wischen.", style = MaterialTheme.typography.labelSmall, color = RideMuted)
            }
        }
        Text("Entdecken", style = MaterialTheme.typography.titleLarge)
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
    requestParkSearch: () -> Unit,
    saveRide: () -> Boolean,
    openFullscreen: () -> Unit,
) {
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Neue Fahrt", style = MaterialTheme.typography.headlineMedium)
        val videoFile = video.lastVideoFile
        if (!recorder.isRecording && videoFile != null && videoFile.exists()) {
            Text("Videovorschau", style = MaterialTheme.typography.titleMedium)
            AndroidView(
                factory = { context -> VideoView(context).apply { setMediaController(MediaController(context).also { it.setAnchorView(this) }); setVideoURI(Uri.fromFile(videoFile)) } },
                update = { it.setVideoURI(Uri.fromFile(videoFile)) },
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
            )
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
                Text("Höhe: ${"%.1f".format(recorder.relativeAltitudeM)} m · Qualität ${recorder.qualityScore} %")
                Text("Kompass: ${recorder.headingDegrees?.let { "${"%.0f".format(it)}° ${compassDirection(it)}" } ?: "noch ohne Richtung"}")
            }
        }
        AndroidGForceTrail(recorder.liveGForceSample, Modifier.fillMaxWidth())
        AndroidRideContextPanel(rideContext, requestParkSearch)
        Button(enabled = !recorder.isRecording && !stopping && recorder.sampleCount > 0 && recorder.lastSavedPath == null, onClick = { saveRide() }, modifier = Modifier.fillMaxWidth()) { Text("Fahrt bewusst speichern") }
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
