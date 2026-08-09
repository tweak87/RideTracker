package de.ridetracker

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorManager
import android.location.LocationManager
import android.os.Build
import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

private data class AndroidCompatibilitySnapshot(
    val version: String,
    val packageId: String,
    val device: String,
    val api: Int,
    val providers: List<String>,
    val sensors: List<Pair<String, Boolean>>,
    val freeStorageMb: Long,
)

@Composable
internal fun AndroidCompatibilityScreen(modifier: Modifier) {
    val context = LocalContext.current.applicationContext
    val snapshot = remember { compatibilitySnapshot(context) }
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Kompatibilität & Diagnose", style = MaterialTheme.typography.headlineMedium)
        Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(if (Build.MANUFACTURER.equals("Amazon", true)) "Amazon Fire OS erkannt" else "Android-Gerät erkannt", style = MaterialTheme.typography.titleMedium)
                Text(snapshot.device)
                Text("Android API ${snapshot.api} · RideTracker ${snapshot.version}")
                Text(snapshot.packageId, style = MaterialTheme.typography.labelSmall)
            }
        }
        DiagnosticCard("Installation", listOf(
            "Mindestversion" to (snapshot.api >= 21),
            "Freier Speicher (${snapshot.freeStorageMb} MB)" to (snapshot.freeStorageMb >= 200),
            "Fire-Testpaket" to snapshot.packageId.endsWith(".fire8v5"),
        ))
        DiagnosticCard("Standort ohne Google-Dienste", listOf(
            "GPS-Anbieter" to snapshot.providers.contains(LocationManager.GPS_PROVIDER),
            "Netzwerk-Anbieter" to snapshot.providers.contains(LocationManager.NETWORK_PROVIDER),
        ))
        DiagnosticCard("Sensoren", snapshot.sensors)
        Button(
            onClick = {
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("RideTracker-Diagnose", snapshot.asReport()))
                Toast.makeText(context, "Diagnosebericht kopiert", Toast.LENGTH_SHORT).show()
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Diagnosebericht kopieren") }
        Text(
            "Fehlt GPS, kann RideTracker weiterhin Beschleunigung und G-Kräfte aufzeichnen. Ohne GPS fehlen jedoch belastbare Geschwindigkeit, Kartenroute und räumliches Streckenmodell.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun AndroidCompatibilitySnapshot.asReport(): String = buildString {
    appendLine("RideTracker-Kompatibilitätsbericht")
    appendLine("Version: $version")
    appendLine("Paket: $packageId")
    appendLine("Gerät: $device")
    appendLine("Android API: $api")
    appendLine("Standortanbieter: ${providers.joinToString().ifBlank { "keine" }}")
    appendLine("Freier Speicher: $freeStorageMb MB")
    sensors.forEach { (name, available) -> appendLine("$name: ${if (available) "verfügbar" else "fehlt"}") }
}

@Composable
private fun DiagnosticCard(title: String, values: List<Pair<String, Boolean>>) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            values.forEach { (label, available) ->
                Row(Modifier.fillMaxWidth()) {
                    Text(label, Modifier.weight(1f))
                    Text(if (available) "Verfügbar" else "Fehlt", color = if (available) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}

@Suppress("DEPRECATION")
private fun compatibilitySnapshot(context: Context): AndroidCompatibilitySnapshot {
    val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val version = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: "unbekannt"
    return AndroidCompatibilitySnapshot(
        version = version,
        packageId = context.packageName,
        device = "${Build.MANUFACTURER} ${Build.MODEL} · ${Build.DEVICE}",
        api = Build.VERSION.SDK_INT,
        providers = locationManager.allProviders,
        sensors = listOf(
            "Beschleunigung" to (sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null),
            "Gyroskop" to (sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE) != null),
            "Kompass / Rotation" to (sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null),
            "Barometer" to (sensorManager.getDefaultSensor(Sensor.TYPE_PRESSURE) != null),
        ),
        freeStorageMb = context.filesDir.usableSpace / 1024L / 1024L,
    )
}
