package de.ridetracker

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import de.ridetracker.engine.ForwardEdge
import de.ridetracker.sensors.AndroidHeartRateManager
import de.ridetracker.sensors.AndroidSensorRecorder
import de.ridetracker.session.LocalProfileStore
import de.ridetracker.video.AndroidVideoRecorder

enum class AppSection { HOME, RECORD, RIDES, MAP, STATISTICS, ACHIEVEMENTS, MEDIA }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                val recorder = remember { AndroidSensorRecorder(applicationContext) }
                val videoRecorder = remember { AndroidVideoRecorder(applicationContext, this@MainActivity) }
                val heartRate = remember { AndroidHeartRateManager(applicationContext) }
                val profiles = remember { LocalProfileStore(applicationContext) }
                var section by remember { mutableStateOf(AppSection.HOME) }
                var pendingVideo by remember { mutableStateOf(false) }
                var showProfiles by remember { mutableStateOf(false) }
                LaunchedEffect(Unit) { videoRecorder.configure() }
                LaunchedEffect(heartRate.latestHeartRate, heartRate.deviceName) { recorder.setHeartRate(heartRate.latestHeartRate, heartRate.deviceName) }

                val permissions = buildList {
                    add(Manifest.permission.ACCESS_FINE_LOCATION); add(Manifest.permission.ACCESS_COARSE_LOCATION)
                    add(Manifest.permission.CAMERA); add(Manifest.permission.RECORD_AUDIO)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) { add(Manifest.permission.BLUETOOTH_SCAN); add(Manifest.permission.BLUETOOTH_CONNECT) }
                }.toTypedArray()
                val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
                    val locationGranted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true || result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
                    if (locationGranted && recorder.calibrateNow()) {
                        recorder.start(); if (pendingVideo) videoRecorder.start(recorder.sessionId, recorder.recordingStartNs)
                    }
                }

                if (showProfiles) ProfileDialog(profiles) { showProfiles = false }

                Scaffold(
                    contentWindowInsets = WindowInsets.safeDrawing,
                    topBar = {
                        Surface(tonalElevation = 3.dp) {
                            Row(
                                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Text("☰", style = MaterialTheme.typography.titleLarge)
                                Column(Modifier.weight(1f)) {
                                    Text("RideTracker", style = MaterialTheme.typography.titleMedium)
                                    Text("Fahrten · Telemetrie · Community", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                TextButton(onClick = { showProfiles = true }) { Text("👤 ${profiles.activeProfile.name}", maxLines = 1) }
                            }
                        }
                    },
                    bottomBar = {
                        Column {
                            if (recorder.isRecording) {
                                Surface(color = MaterialTheme.colorScheme.errorContainer, tonalElevation = 6.dp) {
                                    Row(
                                        Modifier.fillMaxWidth().padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        Text("●", color = MaterialTheme.colorScheme.error)
                                        Column(Modifier.weight(1f)) {
                                            Text("Aufnahme läuft", style = MaterialTheme.typography.titleMedium)
                                            Text("Sensoren und optional Video werden aufgezeichnet.", style = MaterialTheme.typography.bodySmall)
                                        }
                                        Button(
                                            onClick = {
                                                videoRecorder.stop()
                                                recorder.attachVideo(videoRecorder.lastVideoFile?.name, videoRecorder.startOffsetSeconds)
                                                recorder.stop()
                                            },
                                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                                        ) { Text("Stoppen") }
                                    }
                                }
                            }
                            NavigationBar {
                                NavigationBarItem(section == AppSection.HOME, { section = AppSection.HOME }, { Icon(Icons.Default.Home, null) }, label = { Text("Start") })
                                NavigationBarItem(section == AppSection.RECORD, { section = AppSection.RECORD }, { Icon(Icons.Default.PlayCircle, null) }, label = { Text("Aufzeichnen") })
                                NavigationBarItem(section == AppSection.RIDES, { section = AppSection.RIDES }, { Icon(Icons.Default.List, null) }, label = { Text("Fahrten") })
                                NavigationBarItem(section == AppSection.MAP, { section = AppSection.MAP }, { Icon(Icons.Default.Map, null) }, label = { Text("Karte") })
                            }
                        }
                    }
                ) { padding ->
                    when (section) {
                        AppSection.HOME -> Dashboard(Modifier.padding(padding), profiles.activeProfile.name, { showProfiles = true }) { section = it }
                        AppSection.RECORD -> RecordingScreen(Modifier.padding(padding), recorder, videoRecorder, heartRate) { withVideo -> pendingVideo = withVideo; permissionLauncher.launch(permissions) }
                        AppSection.RIDES -> Placeholder(Modifier.padding(padding), "Meine Fahrten", "Lokale RidePackages werden hier als Liste eingebunden.")
                        AppSection.MAP -> Placeholder(Modifier.padding(padding), "Parkkarte", "Hier erscheinen Parks, Bahnen, eigene Fahrten und Community-Master-Tracks.")
                        AppSection.STATISTICS -> StatisticsScreen(Modifier.padding(padding))
                        AppSection.ACHIEVEMENTS -> AchievementsScreen(Modifier.padding(padding))
                        AppSection.MEDIA -> RideMediaScreen(Modifier.padding(padding), profiles)
                    }
                }
            }
        }
    }
}

@Composable
private fun Dashboard(modifier: Modifier, profileName: String, onProfiles: () -> Unit, onSelect: (AppSection) -> Unit) {
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Übersicht", style = MaterialTheme.typography.headlineLarge)
        Text("Angemeldet: $profileName", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Aufzeichnen, auswerten und gemeinsam präzisere Achterbahn-Strecken aufbauen.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        MenuCard("Neue Fahrt", "Kalibrierung, Sensoren und optional Video gemeinsam starten") { onSelect(AppSection.RECORD) }
        MenuCard("Meine Fahrten", "Gespeicherte RidePackages und Auswertungen") { onSelect(AppSection.RIDES) }
        MenuCard("Bilder & Bewertungen", "Bahnbilder hinterlegen und Sterne vergeben") { onSelect(AppSection.MEDIA) }
        MenuCard("Karte", "Parks, Bahnen und aufgezeichnete Strecken") { onSelect(AppSection.MAP) }
        MenuCard("Statistiken", "Gefahrene Kilometer, Fahrzeit und persönliche Rekorde") { onSelect(AppSection.STATISTICS) }
        MenuCard("Achievements", "Meilensteine und persönliche Erfolge") { onSelect(AppSection.ACHIEVEMENTS) }
        OutlinedButton(onClick = onProfiles, modifier = Modifier.fillMaxWidth()) { Text("Benutzer verwalten") }
    }
}

@Composable
private fun ProfileDialog(store: LocalProfileStore, onDismiss: () -> Unit) {
    var newName by remember { mutableStateOf("") }
    var confirmReset by remember { mutableStateOf(false) }
    if (confirmReset) AlertDialog(
        onDismissRequest = { confirmReset = false },
        title = { Text("Daten zurücksetzen?") },
        text = { Text("Alle lokalen Fahrten und Statistiken von ${store.activeProfile.name} werden gelöscht.") },
        confirmButton = { TextButton(onClick = { store.resetActiveData(); confirmReset = false }) { Text("Löschen") } },
        dismissButton = { TextButton(onClick = { confirmReset = false }) { Text("Abbrechen") } },
    )
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Benutzer") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                store.profiles.forEach { profile ->
                    OutlinedButton(onClick = { store.select(profile.id) }, modifier = Modifier.fillMaxWidth()) {
                        Text(if (profile.id == store.activeProfileId) "✓ ${profile.name}" else profile.name)
                    }
                }
                OutlinedTextField(newName, { newName = it }, label = { Text("Neuer Benutzername") }, modifier = Modifier.fillMaxWidth())
                Button(onClick = { store.create(newName); newName = "" }, enabled = newName.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("Profil anlegen und anmelden") }
                TextButton(onClick = { confirmReset = true }, modifier = Modifier.fillMaxWidth()) { Text("Statistiken und Fahrten zurücksetzen") }
                Text("Die Anmeldung ist lokal auf diesem Gerät. Cloud-Synchronisierung folgt mit dem Community-Backend.", style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Fertig") } },
    )
}

@Composable
private fun MenuCard(title: String, subtitle: String, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) { Text(title, style = MaterialTheme.typography.titleMedium); Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
}

@Composable
private fun RecordingScreen(modifier: Modifier, recorder: AndroidSensorRecorder, videoRecorder: AndroidVideoRecorder, heartRate: AndroidHeartRateManager, onStart: (Boolean) -> Unit) {
    var showStartDialog by remember { mutableStateOf(false) }
    var prepExpanded by remember { mutableStateOf(false) }
    var notesExpanded by remember { mutableStateOf(false) }
    var sensorsExpanded by remember { mutableStateOf(false) }
    if (showStartDialog) AlertDialog(
        onDismissRequest = { showStartDialog = false },
        title = { Text("Video mit aufzeichnen?") },
        text = { Text("Kalibrierung, Sensoren und Kamera werden in einem Ablauf gestartet.") },
        confirmButton = { TextButton(onClick = { showStartDialog = false; onStart(true) }) { Text("Mit Video") } },
        dismissButton = { Row { TextButton(onClick = { showStartDialog = false; onStart(false) }) { Text("Ohne Video") }; TextButton(onClick = { showStartDialog = false }) { Text("Abbrechen") } } },
    )
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Neue Fahrt", style = MaterialTheme.typography.headlineMedium)
        Text("Status: ${recorder.status}"); Text("Video: ${videoRecorder.status}")
        Text("Phase: ${recorder.ridePhase} · Qualität: ${recorder.qualityScore}/100")
        Text("Samples: ${recorder.sampleCount} · Strecke: ${"%.1f".format(recorder.distanceMeters)} m")
        Text("Tempo: ${"%.1f".format(recorder.speedKmh)} km/h · Höhe: ${"%.1f".format(recorder.relativeAltitudeM)} m")
        ExpandableCard("Aufnahme vorbereiten", prepExpanded, { prepExpanded = !prepExpanded }) {
            Text("Fahrtrichtung: ${recorder.forwardEdge.title}")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { val all = ForwardEdge.entries; recorder.forwardEdge = all[(recorder.forwardEdge.ordinal + all.size - 1) % all.size] }) { Text("◀") }
                Button(onClick = { val all = ForwardEdge.entries; recorder.forwardEdge = all[(recorder.forwardEdge.ordinal + 1) % all.size] }) { Text("▶") }
            }
            Text("Telefon in die endgültige Position bringen und ruhig halten.", style = MaterialTheme.typography.bodySmall)
        }
        ExpandableCard("Notizen & Kommentare", notesExpanded, { notesExpanded = !notesExpanded }) {
            OutlinedTextField(recorder.privateNote, { recorder.privateNote = it }, label = { Text("Private Notiz") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
            OutlinedTextField(recorder.communityComment, { recorder.communityComment = it }, label = { Text("Community-Kommentar") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
        }
        ExpandableCard("Externe Sensoren", sensorsExpanded, { sensorsExpanded = !sensorsExpanded }) {
            Text("Puls: ${heartRate.latestHeartRate?.let { "$it bpm" } ?: "–"}")
            Text(heartRate.status, style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Button(onClick = heartRate::scan) { Text("Pulsuhr suchen") }; Button(onClick = heartRate::connect) { Text("Verbinden") } }
        }
        if (!recorder.isRecording) Button(onClick = { showStartDialog = true }, modifier = Modifier.fillMaxWidth()) { Text("Kalibrieren & Fahrt starten") }
        Button(enabled = !recorder.isRecording && recorder.sampleCount > 0, onClick = { recorder.attachVideo(videoRecorder.lastVideoFile?.name, videoRecorder.startOffsetSeconds); recorder.saveSession() }, modifier = Modifier.fillMaxWidth()) { Text("RidePackage speichern") }
    }
}

@Composable
private fun ExpandableCard(title: String, expanded: Boolean, onToggle: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    Card(onClick = onToggle, modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { Text("$title ${if (expanded) "▴" else "▾"}", style = MaterialTheme.typography.titleMedium); if (expanded) content() } }
}

@Composable
private fun Placeholder(modifier: Modifier, title: String, text: String) {
    Column(modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) { Text(title, style = MaterialTheme.typography.headlineMedium); Spacer(Modifier.height(8.dp)); Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant) }
}
