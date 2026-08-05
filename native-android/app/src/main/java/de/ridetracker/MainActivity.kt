package de.ridetracker

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import de.ridetracker.engine.ForwardEdge
import de.ridetracker.sensors.AndroidSensorRecorder
import de.ridetracker.video.AndroidVideoRecorder

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                val recorder = remember { AndroidSensorRecorder(applicationContext) }
                val videoRecorder = remember { AndroidVideoRecorder(applicationContext, this@MainActivity) }
                var recordVideo = remember { true }
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
                    val locationGranted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                        result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
                    if (locationGranted) {
                        recorder.start()
                        if (recordVideo) videoRecorder.start(recorder.sessionId, recorder.recordingStartNs)
                    }
                }

                Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("RideTracker Android", style = MaterialTheme.typography.headlineMedium)
                    Text("Native Sensor Layer · Ride Engine 2.0")
                    Text("Status: ${recorder.status}")
                    Text("Video: ${videoRecorder.status}")
                    Text("Phase: ${recorder.ridePhase} · Qualität: ${recorder.qualityScore}/100")
                    Text("Samples: ${recorder.sampleCount} · Strecke: ${"%.1f".format(recorder.distanceMeters)} m")
                    Text("Tempo: ${"%.1f".format(recorder.speedKmh)} km/h · Höhe: ${"%.1f".format(recorder.relativeAltitudeM)} m")
                    Text("GPS: ${recorder.acceptedLocations} ✓ / ${recorder.rejectedLocations} verworfen")

                    Card {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Manuelle Kalibrierung", style = MaterialTheme.typography.titleMedium)
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
                                Button(onClick = recorder::calibrateNow) { Text("Jetzt kalibrieren") }
                            }
                            Text("${recorder.calibrationSampleCount} Lagewerte verfügbar", style = MaterialTheme.typography.bodySmall)
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Video synchron aufzeichnen")
                        Switch(checked = recordVideo, onCheckedChange = { recordVideo = it }, enabled = !recorder.isRecording)
                    }
                    videoRecorder.lastVideoFile?.let {
                        Text("Video: ${it.name} · Offset ${"%.3f".format(videoRecorder.startOffsetSeconds)} s", style = MaterialTheme.typography.bodySmall)
                    }
                    recorder.lastSavedPath?.let { Text("Gespeichert: $it", style = MaterialTheme.typography.bodySmall) }

                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(enabled = !recorder.isRecording, onClick = { permissionLauncher.launch(permissions) }) {
                            Text("Initialisieren & Start")
                        }
                        Button(enabled = recorder.isRecording, onClick = {
                            videoRecorder.stop()
                            recorder.attachVideo(videoRecorder.lastVideoFile?.name, videoRecorder.startOffsetSeconds)
                            recorder.stop()
                        }) { Text("Stop") }
                    }
                    Button(enabled = !recorder.isRecording && recorder.sampleCount > 0, onClick = {
                        recorder.attachVideo(videoRecorder.lastVideoFile?.name, videoRecorder.startOffsetSeconds)
                        recorder.saveSession()
                    }) { Text("RideSession JSON speichern") }
                }
            }
        }
    }
}
