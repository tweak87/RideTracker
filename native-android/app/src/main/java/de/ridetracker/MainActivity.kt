package de.ridetracker

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import de.ridetracker.sensors.AndroidSensorRecorder

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                val recorder = remember { AndroidSensorRecorder(applicationContext) }
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
                val permissionLauncher = rememberLauncherForActivityResult(
                    ActivityResultContracts.RequestMultiplePermissions()
                ) { result ->
                    val locationGranted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                        result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
                    if (locationGranted) recorder.start()
                }

                Column(
                    modifier = Modifier.fillMaxSize().padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text("RideTracker Android", style = MaterialTheme.typography.headlineMedium)
                    Text("Native Sensor Layer · Ride Engine 2.0")
                    Text("Status: ${recorder.status}")
                    Text("Phase: ${recorder.ridePhase}")
                    Text("Qualität: ${recorder.qualityScore}/100")
                    Text("Samples: ${recorder.sampleCount}")
                    Text("Geschwindigkeit: ${"%.1f".format(recorder.speedKmh)} km/h")
                    Text("Strecke: ${"%.1f".format(recorder.distanceMeters)} m")
                    Text("Relative Höhe: ${"%.1f".format(recorder.relativeAltitudeM)} m")
                    Text("GPS: ${recorder.acceptedLocations} akzeptiert / ${recorder.rejectedLocations} verworfen")
                    Text("Barometer: ${if (recorder.hasBarometer) "verfügbar" else "nicht verfügbar"}")
                    recorder.lastSavedPath?.let { Text("Gespeichert: $it") }
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(
                            enabled = !recorder.isRecording,
                            onClick = { permissionLauncher.launch(permissions) }
                        ) { Text("Initialisieren & Start") }
                        Button(
                            enabled = recorder.isRecording,
                            onClick = recorder::stop
                        ) { Text("Stop") }
                    }
                    Button(
                        enabled = !recorder.isRecording && recorder.sampleCount > 0,
                        onClick = { recorder.saveSession() }
                    ) { Text("RideSession JSON speichern") }
                }
            }
        }
    }
}
