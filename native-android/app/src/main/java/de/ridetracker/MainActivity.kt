package de.ridetracker

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import de.ridetracker.engine.ForwardEdge
import de.ridetracker.sensors.AndroidSensorRecorder
import de.ridetracker.video.AndroidVideoRecorder

enum class AppSection(val title: String) { HOME("Start"), RECORD("Aufzeichnen"), RIDES("Fahrten"), MAP("Karte") }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                val recorder = remember { AndroidSensorRecorder(applicationContext) }
                val videoRecorder = remember { AndroidVideoRecorder(applicationContext, this@MainActivity) }
                var section by remember { mutableStateOf(AppSection.HOME) }
                var recordVideo by remember { mutableStateOf(true) }
                LaunchedEffect(Unit) { videoRecorder.configure() }

                val permissions = buildList {
                    add(Manifest.permission.ACCESS_FINE_LOCATION)
                    add(Manifest.permission.ACCESS_COARSE_LOCATION)
                    add(Manifest.permission.CAMERA)
                    add(Manifest.permission.RECORD_AUDIO)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        add(Manifest.permission.BLUETOOTH_SCAN)
                        add(Manifest.permission.BLUETOOTH_CONNECT)
                    }
                }.toTypedArray()

                val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
                    val locationGranted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true || result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
                    if (locationGranted) {
                        recorder.calibrateNow()
                        recorder.start()
                        if (recordVideo) videoRecorder.start(recorder.sessionId, recorder.recordingStartNs)
                    }
                }

                Scaffold(
                    bottomBar = {
                        NavigationBar {
                            NavigationBarItem(section == AppSection.HOME, { section = AppSection.HOME }, { Icon(Icons.Default.Home, null) }, label = { Text("Start") })
                            NavigationBarItem(section == AppSection.RECORD, { section = AppSection.RECORD }, { Icon(Icons.Default.PlayCircle, null) }, label = { Text("Aufzeichnen") })
                            NavigationBarItem(section == AppSection.RIDES, { section = AppSection.RIDES }, { Icon(Icons.Default.List, null) }, label = { Text("Fahrten") })
                            NavigationBarItem(section == AppSection.MAP, { section = AppSection.MAP }, { Icon(Icons.Default.Map, null) }, label = { Text("Karte") })
                        }
                    }
                ) { padding ->
                    when (section) {
                        AppSection.HOME -> Dashboard(Modifier.padding(padding), onSelect = { section = it })
                        AppSection.RECORD -> RecordingScreen(
                            modifier = Modifier.padding(padding), recorder = recorder, videoRecorder = videoRecorder,
                            recordVideo = recordVideo, onRecordVideoChange = { recordVideo = it },
                            onStart = { permissionLauncher.launch(permissions) }
                        )
                        AppSection.RIDES -> Placeholder(Modifier.padding(padding), "Meine Fahrten", "Lokale RidePackages werden im nächsten Datenbank-Schritt als durchsuchbare Liste mit Detailansicht eingebunden.")
                        AppSection.MAP -> Placeholder(Modifier.padding(padding), "Parkkarte", "Hier erscheinen Parks, Bahnen, eigene Fahrten und später Community-Master-Tracks.")
                    }
                }
            }
        }
    }
}

@Composable
private fun Dashboard(modifier: Modifier = Modifier, onSelect: (AppSection) -> Unit) {
    Column(modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("RideTracker", style = MaterialTheme.typography.headlineLarge)
        Text("Aufzeichnen, auswerten und gemeinsam präzisere Achterbahn-Strecken aufbauen.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        MenuCard("Neue Fahrt", "Kalibrieren, Kamera und Sensoren gemeinsam starten") { onSelect(AppSection.RECORD) }
        MenuCard("Meine Fahrten", "Gespeicherte RidePackages und Auswertungen") { onSelect(AppSection.RIDES) }
        MenuCard("Karte", "Parks, Bahnen und aufgezeichnete Strecken") { onSelect(AppSection.MAP) }
        Text("Community-Ziel", style = MaterialTheme.typography.titleMedium)
        Text("Mehrfach aufgezeichnete Fahrten werden später ausgerichtet, von Ausreißern bereinigt und zu versionierten Master-Tracks zusammengeführt.", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun MenuCard(title: String, subtitle: String, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun RecordingScreen(
    modifier: Modifier,
    recorder: AndroidSensorRecorder,
    videoRecorder: AndroidVideoRecorder,
    recordVideo: Boolean,
    onRecordVideoChange: (Boolean) -> Unit,
    onStart: () -> Unit,
) {
    Column(modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Neue Fahrt", style = MaterialTheme.typography.headlineMedium)
        Text("Status: ${recorder.status}")
        Text("Video: ${videoRecorder.status}")
        Text("Phase: ${recorder.ridePhase} · Qualität: ${recorder.qualityScore}/100")
        Text("Samples: ${recorder.sampleCount} · Strecke: ${"%.1f".format(recorder.distanceMeters)} m")
        Text("Tempo: ${"%.1f".format(recorder.speedKmh)} km/h · Höhe: ${"%.1f".format(recorder.relativeAltitudeM)} m")

        Card {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Aufnahme vorbereiten", style = MaterialTheme.typography.titleMedium)
                Text("Fahrtrichtung: ${recorder.forwardEdge.title}")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = {
                        val all = ForwardEdge.entries
                        recorder.forwardEdge = all[(recorder.forwardEdge.ordinal + all.size - 1) % all.size]
                    }) { Text("◀") }
                    Button(onClick = {
                        val all = ForwardEdge.entries
                        recorder.forwardEdge = all[(recorder.forwardEdge.ordinal + 1) % all.size]
                    }) { Text("▶") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Video synchron aufzeichnen")
                    Switch(recordVideo, onRecordVideoChange, enabled = !recorder.isRecording)
                }
                Text("Telefon in die endgültige Position bringen und ruhig halten. Beim Start werden Kalibrierung, Sensorlogger und Kamera gemeinsam ausgeführt.", style = MaterialTheme.typography.bodySmall)
                Text("${recorder.calibrationSampleCount} Lagewerte verfügbar", style = MaterialTheme.typography.bodySmall)
            }
        }

        if (!recorder.isRecording) {
            Button(onClick = onStart, modifier = Modifier.fillMaxWidth()) { Text("Kalibrieren & Aufnahme starten") }
        } else {
            Button(onClick = {
                videoRecorder.stop()
                recorder.attachVideo(videoRecorder.lastVideoFile?.name, videoRecorder.startOffsetSeconds)
                recorder.stop()
            }, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) { Text("Aufnahme stoppen") }
        }
        Button(enabled = !recorder.isRecording && recorder.sampleCount > 0, onClick = {
            recorder.attachVideo(videoRecorder.lastVideoFile?.name, videoRecorder.startOffsetSeconds)
            recorder.saveSession()
        }, modifier = Modifier.fillMaxWidth()) { Text("RidePackage speichern") }
    }
}

@Composable
private fun Placeholder(modifier: Modifier, title: String, text: String) {
    Column(modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Text(title, style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(8.dp))
        Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
