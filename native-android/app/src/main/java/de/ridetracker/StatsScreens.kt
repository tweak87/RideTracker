package de.ridetracker

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import org.json.JSONObject

data class LocalRideStats(
    val rides: Int = 0,
    val distanceMeters: Double = 0.0,
    val durationSeconds: Double = 0.0,
    val bestQuality: Int = 0,
    val maxSpeedKmh: Double = 0.0,
    val maxG: Double = 0.0,
)

private fun loadStats(context: Context): LocalRideStats {
    var result = LocalRideStats()
    context.filesDir.listFiles { file -> file.name.endsWith(".ride.json") }?.forEach { file ->
        runCatching {
            val root = JSONObject(file.readText())
            val summary = root.optJSONObject("summary")
            var speed = result.maxSpeedKmh
            var g = result.maxG
            val samples = root.optJSONArray("samples")
            if (samples != null) for (index in 0 until samples.length()) {
                val sample = samples.optJSONObject(index) ?: continue
                speed = maxOf(speed, sample.optDouble("speedMS", 0.0) * 3.6)
                g = maxOf(g, sample.optDouble("totalG", 0.0))
            }
            result = result.copy(
                rides = result.rides + 1,
                distanceMeters = result.distanceMeters + (summary?.optDouble("distanceMeters", 0.0) ?: 0.0),
                durationSeconds = result.durationSeconds + (summary?.optDouble("durationSeconds", 0.0) ?: 0.0),
                bestQuality = maxOf(result.bestQuality, summary?.optInt("qualityScore", 0) ?: 0),
                maxSpeedKmh = speed,
                maxG = g,
            )
        }
    }
    return result
}

@Composable
fun StatisticsScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var stats by remember { mutableStateOf(LocalRideStats()) }
    LaunchedEffect(Unit) { stats = loadStats(context) }
    Column(modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Statistiken", style = MaterialTheme.typography.headlineMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatCard("Fahrten", "${stats.rides}", Modifier.weight(1f))
            StatCard("Gesamtstrecke", "%.2f km".format(stats.distanceMeters / 1000), Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatCard("Fahrzeit", "%.0f min".format(stats.durationSeconds / 60), Modifier.weight(1f))
            StatCard("Max. Tempo", "%.1f km/h".format(stats.maxSpeedKmh), Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatCard("Max. Gesamt-G", "%.2f g".format(stats.maxG), Modifier.weight(1f))
            StatCard("Beste Qualität", "${stats.bestQuality}/100", Modifier.weight(1f))
        }
    }
}

@Composable
fun AchievementsScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var stats by remember { mutableStateOf(LocalRideStats()) }
    LaunchedEffect(Unit) { stats = loadStats(context) }
    val achievements = listOf(
        Triple("Erste Fahrt", "Eine Fahrt speichern", stats.rides >= 1),
        Triple("Stammgast", "10 Fahrten speichern", stats.rides >= 10),
        Triple("Kilometersammler", "10 km Gesamtstrecke", stats.distanceMeters >= 10_000),
        Triple("Datenprofi", "Eine Fahrt mit Qualität 90+", stats.bestQuality >= 90),
        Triple("High Speed", "Mindestens 100 km/h messen", stats.maxSpeedKmh >= 100),
        Triple("G-Force", "Mindestens 4,0 g messen", stats.maxG >= 4),
    )
    LazyColumn(modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Text("Achievements", style = MaterialTheme.typography.headlineMedium) }
        items(achievements) { (title, detail, done) ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(if (done) "✓" else "○", style = MaterialTheme.typography.headlineSmall)
                    Column { Text(title, style = MaterialTheme.typography.titleMedium); Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
        }
    }
}

@Composable
private fun StatCard(title: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier) { Column(Modifier.padding(14.dp)) { Text(title, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(value, style = MaterialTheme.typography.titleLarge) } }
}
