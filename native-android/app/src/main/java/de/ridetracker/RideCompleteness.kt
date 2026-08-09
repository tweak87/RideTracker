package de.ridetracker

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import de.ridetracker.context.AndroidRideContextSnapshot
import de.ridetracker.session.RideSessionSample
import de.ridetracker.session.deriveGpsMotion
import de.ridetracker.session.rideSessionSamplesFromJson
import org.json.JSONObject

data class RideCompletenessCriterion(
    val title: String,
    val detail: String,
    val complete: Boolean,
    val weight: Int,
    val optional: Boolean = false,
)

data class RideCompletenessReport(
    val percent: Int,
    val criteria: List<RideCompletenessCriterion>,
) {
    val completedCount get() = criteria.count { it.complete }
}

fun buildRideCompleteness(
    samples: List<RideSessionSample>,
    recordedDistanceMeters: Double,
    calibrated: Boolean,
    rideContext: AndroidRideContextSnapshot?,
    hasVideo: Boolean,
    videoHudEmbedded: Boolean,
): RideCompletenessReport {
    val gps = deriveGpsMotion(samples)
    val effectiveDistance = maxOf(recordedDistanceMeters, gps.distanceMeters)
    val accuracies = samples.mapNotNull { it.horizontalAccuracyM }
    val usedSatellites = samples.mapNotNull { it.satellitesUsedInFix }.maxOrNull()
    val maxSpeed = maxOf(samples.maxOfOrNull { it.speedMS * 3.6 } ?: 0.0, gps.maxSpeedMS * 3.6)
    val criteria = listOf(
        RideCompletenessCriterion("Bewegungssensoren", "${samples.size} Messwerte", samples.isNotEmpty(), 15),
        RideCompletenessCriterion("Kalibrierung", if (calibrated) "Ausrichtung gespeichert" else "Vor der nächsten Fahrt Gerät ruhig halten", calibrated, 10),
        RideCompletenessCriterion("GPS-Strecke", "${gps.usablePointCount} eindeutige Punkte · %.1f m".format(effectiveDistance), gps.usablePointCount >= 2 && effectiveDistance > 2.0, 15),
        RideCompletenessCriterion("Geschwindigkeit", "Maximal %.1f km/h".format(maxSpeed), maxSpeed >= 0.5, 10),
        RideCompletenessCriterion(
            "GNSS-Qualität",
            "${usedSatellites?.let { "$it Satelliten verwendet · " }.orEmpty()}${accuracies.minOrNull()?.let { "beste Genauigkeit ±%.1f m".format(it) } ?: "keine Genauigkeit"}",
            accuracies.any { it <= 40.0 },
            10,
        ),
        RideCompletenessCriterion("Höhenprofil", if (samples.any { it.relativeAltitudeM != null }) "Barometer- oder GPS-Höhe vorhanden" else "Ohne Barometer nur bei brauchbarer GPS-Höhe", samples.any { it.relativeAltitudeM != null }, 5),
        RideCompletenessCriterion("Freizeitpark", rideContext?.park?.name ?: "noch auswählen", rideContext?.park != null, 10),
        RideCompletenessCriterion("Attraktion", rideContext?.attraction?.name ?: "noch auswählen", rideContext?.attraction != null, 10),
        RideCompletenessCriterion("Video & HUD", when { videoHudEmbedded -> "HUD im Video eingebettet"; hasVideo -> "Video ohne eingebettetes HUD"; else -> "optional nicht aufgenommen" }, videoHudEmbedded, 5, optional = true),
        RideCompletenessCriterion("Wetter", rideContext?.weatherEnd?.let { "${it.condition} · %.1f °C".format(it.temperatureC) } ?: "optional nicht geladen", rideContext?.weatherEnd != null, 5, optional = true),
        RideCompletenessCriterion("Thumbnail", rideContext?.thumbnail?.title ?: "optional noch auswählen", rideContext?.thumbnail != null, 3, optional = true),
        RideCompletenessCriterion("Offizielle Referenz", rideContext?.officialFacts?.sourceTitle ?: "für diese Bahn nicht verifiziert", rideContext?.officialFacts != null, 2, optional = true),
    )
    val maximum = criteria.sumOf { it.weight }.coerceAtLeast(1)
    val reached = criteria.filter { it.complete }.sumOf { it.weight }
    return RideCompletenessReport((reached * 100.0 / maximum).toInt().coerceIn(0, 100), criteria)
}

fun rideCompletenessFromJson(root: JSONObject): RideCompletenessReport {
    val samples = rideSessionSamplesFromJson(root)
    val summary = root.optJSONObject("summary")
    val context = root.optJSONObject("context")
    val environment = root.optJSONObject("environment")?.optJSONObject("weather")
    val video = root.optJSONObject("video")
    val thumbnail = root.optJSONObject("thumbnail")
    val calibration = root.optJSONObject("calibration")
    val gps = deriveGpsMotion(samples)
    val distance = maxOf(summary?.optDouble("distanceMeters", 0.0) ?: 0.0, gps.distanceMeters)
    val accuracies = samples.mapNotNull { it.horizontalAccuracyM }
    val satellites = samples.mapNotNull { it.satellitesUsedInFix }.maxOrNull()
    val maximumSpeed = maxOf(summary?.optDouble("maxSpeedKmh", 0.0) ?: 0.0, samples.maxOfOrNull { it.speedMS * 3.6 } ?: 0.0, gps.maxSpeedMS * 3.6)
    fun populated(node: JSONObject?, key: String) = node?.optString(key)?.takeIf { it.isNotBlank() && it != "null" }
    val criteria = listOf(
        RideCompletenessCriterion("Bewegungssensoren", "${samples.size} Messwerte", samples.isNotEmpty(), 15),
        RideCompletenessCriterion("Kalibrierung", if (calibration?.optBoolean("isCalibrated") == true) "gespeichert" else "fehlt", calibration?.optBoolean("isCalibrated") == true, 10),
        RideCompletenessCriterion("GPS-Strecke", "${gps.usablePointCount} Punkte · %.1f m".format(distance), gps.usablePointCount >= 2 && distance > 2.0, 15),
        RideCompletenessCriterion("Geschwindigkeit", "Maximal %.1f km/h".format(maximumSpeed), maximumSpeed >= .5, 10),
        RideCompletenessCriterion("GNSS-Qualität", "${satellites?.let { "$it Satelliten · " }.orEmpty()}${accuracies.minOrNull()?.let { "±%.1f m".format(it) } ?: "keine Genauigkeit"}", accuracies.any { it <= 40.0 }, 10),
        RideCompletenessCriterion("Höhenprofil", summary?.optString("altitudeSource")?.takeIf { it != "none" } ?: "nicht verfügbar", samples.any { it.relativeAltitudeM != null }, 5),
        RideCompletenessCriterion("Freizeitpark", populated(context, "parkName") ?: "fehlt", populated(context, "parkName") != null, 10),
        RideCompletenessCriterion("Attraktion", populated(context, "rideName") ?: "fehlt", populated(context, "rideName") != null, 10),
        RideCompletenessCriterion("Video & HUD", if (video?.optBoolean("hudEmbedded") == true) "eingebettet" else "optional fehlt", video?.optBoolean("hudEmbedded") == true, 5, true),
        RideCompletenessCriterion("Wetter", if (environment?.optJSONObject("end") != null) "gespeichert" else "optional fehlt", environment?.optJSONObject("end") != null, 5, true),
        RideCompletenessCriterion("Thumbnail", if (thumbnail != null && thumbnail.length() > 0) "gespeichert" else "optional fehlt", thumbnail != null && thumbnail.length() > 0, 3, true),
        RideCompletenessCriterion("Offizielle Referenz", if (context?.optJSONObject("officialData") != null) "gespeichert" else "optional nicht verfügbar", context?.optJSONObject("officialData") != null, 2, true),
    )
    val maximum = criteria.sumOf { it.weight }.coerceAtLeast(1)
    return RideCompletenessReport((criteria.filter { it.complete }.sumOf { it.weight } * 100.0 / maximum).toInt(), criteria)
}

@Composable
fun RideCompletenessCard(report: RideCompletenessReport, modifier: Modifier = Modifier) {
    var expanded by remember(report.percent, report.completedCount) { mutableStateOf(false) }
    Card(modifier, border = BorderStroke(1.dp, RideCyan.copy(alpha = .32f))) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Vollständigkeit der Fahrt", style = MaterialTheme.typography.titleMedium)
                    Text("${report.completedCount}/${report.criteria.size} Bereiche · gewichtete Datenqualität", style = MaterialTheme.typography.bodySmall, color = RideMuted)
                }
                Text("${report.percent}%", style = MaterialTheme.typography.headlineSmall, color = if (report.percent >= 75) RideGreen else RideAmber)
            }
            LinearProgressIndicator(
                progress = { report.percent / 100f },
                modifier = Modifier.fillMaxWidth().height(8.dp),
                color = if (report.percent >= 75) RideGreen else RideAmber,
                trackColor = RideSurfaceHigh,
            )
            TextButton(onClick = { expanded = !expanded }, contentPadding = PaddingValues(0.dp)) {
                Text(if (expanded) "Vollständigkeitsdetails schließen" else "Alle Prüfpunkte anzeigen")
            }
            if (expanded) report.criteria.forEach { criterion ->
                Row(verticalAlignment = Alignment.Top) {
                    Icon(
                        when { criterion.complete -> Icons.Filled.CheckCircle; criterion.optional -> Icons.Filled.Info; else -> Icons.Filled.RadioButtonUnchecked },
                        null,
                        Modifier.size(18.dp),
                        tint = when { criterion.complete -> RideGreen; criterion.optional -> RideMuted; else -> RideAmber },
                    )
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f)) {
                        Text(criterion.title, style = MaterialTheme.typography.labelLarge)
                        Text(criterion.detail, style = MaterialTheme.typography.bodySmall, color = RideMuted)
                    }
                }
            }
        }
    }
}
