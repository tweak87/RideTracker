package de.ridetracker

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import de.ridetracker.sensors.AndroidHeartRateManager
import de.ridetracker.sensors.AndroidSensorRecorder

@Composable
internal fun AndroidDeviceCenter(modifier: Modifier, registry: AndroidDeviceRegistry) {
    val context = LocalContext.current.applicationContext
    val heartRate = remember { AndroidHeartRateManager(context) }
    val recorder = remember { AndroidSensorRecorder(context) }
    AndroidDeviceCenter(modifier, registry, heartRate, recorder)
}
