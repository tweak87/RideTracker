package de.ridetracker

import android.os.SystemClock
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import de.ridetracker.hud.AndroidHudItem
import de.ridetracker.sensors.AndroidLiveGForceSample
import kotlinx.coroutines.delay
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.pow
import kotlin.math.sqrt

data class AndroidHudTelemetry(
    val g: AndroidLiveGForceSample = AndroidLiveGForceSample(),
    val speedKmh: Double = 0.0,
    val heartRateBpm: Int? = null,
    val vibrationMS2: Double = 0.0,
    val phase: String = "bereit",
)

@Composable
fun AndroidConfiguredHudLayer(
    profile: Map<String, AndroidHudItem>,
    telemetry: AndroidHudTelemetry,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(modifier) {
        profile.forEach { (id, item) ->
            if (item.visible) {
                val width = maxWidth * (item.width * item.scale).coerceAtMost(1f)
                val height = maxHeight * (item.height * item.scale).coerceAtMost(1f)
                AndroidHudElement(
                    id = id,
                    telemetry = telemetry,
                    modifier = Modifier
                        .offset(maxWidth * item.x, maxHeight * item.y)
                        .size(width, height),
                )
            }
        }
    }
}

@Composable
internal fun AndroidHudElement(id: String, telemetry: AndroidHudTelemetry, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        color = Color(0xD9071724),
        shape = MaterialTheme.shapes.medium,
        border = BorderStroke(1.dp, RideCyan.copy(alpha = .42f)),
    ) {
        when (id) {
            "gDial" -> AndroidHudMiniTrail(telemetry.g, Modifier.fillMaxSize())
            else -> Column(
                Modifier.fillMaxSize().padding(horizontal = 9.dp, vertical = 7.dp),
                verticalArrangement = Arrangement.Center,
            ) {
                val (label, value, color) = when (id) {
                    "pulse" -> Triple("PULS", telemetry.heartRateBpm?.let { "$it BPM" } ?: "– BPM", RideRose)
                    "gValues" -> Triple("G-ACHSEN", "LAT %+.2f · VERT %+.2f\nLÄNGS %+.2f".format(telemetry.g.lateralG, telemetry.g.normalG, telemetry.g.longitudinalG), RideGreen)
                    "speed" -> Triple("GESCHWINDIGKEIT", "%.1f KM/H".format(telemetry.speedKmh), RideCyan)
                    "vibration" -> Triple("VIBRATION", "%.2f m/s²".format(telemetry.vibrationMS2), RideAmber)
                    "dynamics" -> Triple("FAHRDYNAMIK", "%.2f G · %s".format(
                        sqrt(telemetry.g.normalG.pow(2) + telemetry.g.lateralG.pow(2) + telemetry.g.longitudinalG.pow(2)),
                        telemetry.phase.uppercase(),
                    ), RideCyan)
                    else -> Triple(id.uppercase(), "–", RideMuted)
                }
                Text(label, style = MaterialTheme.typography.labelSmall, color = RideMuted, maxLines = 1)
                Text(value, style = MaterialTheme.typography.titleMedium, color = color, maxLines = 2)
            }
        }
    }
}

private data class MiniTrailPoint(val timestampMs: Long, val normalG: Double, val lateralG: Double, val longitudinalG: Double)

@Composable
private fun AndroidHudMiniTrail(sample: AndroidLiveGForceSample, modifier: Modifier) {
    val history = remember { mutableStateListOf<MiniTrailPoint>() }
    var nowMs by remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    LaunchedEffect(sample.timestampMs) {
        if (sample.timestampMs > 0L) {
            history += MiniTrailPoint(sample.timestampMs, sample.normalG, sample.lateralG, sample.longitudinalG)
            while (history.size > 180) history.removeAt(0)
        }
    }
    LaunchedEffect(Unit) {
        while (true) {
            nowMs = SystemClock.elapsedRealtime()
            while (history.isNotEmpty() && nowMs - history.first().timestampMs > 3_000L) history.removeAt(0)
            delay(33)
        }
    }
    Box(modifier.padding(7.dp)) {
        Text("G-KRÄFTE · 3 S", style = MaterialTheme.typography.labelSmall, color = RideMuted, modifier = Modifier.align(Alignment.TopStart))
        Canvas(Modifier.fillMaxSize().padding(top = 16.dp)) {
            val radius = size.minDimension * .36f
            val center = Offset(size.width * .37f, size.height * .54f)
            val verticalX = size.width * .84f
            val verticalTop = size.height * .12f
            val verticalBottom = size.height * .88f
            drawCircle(Color.White.copy(alpha = .16f), radius, center, style = Stroke(1.2f))
            drawCircle(Color.White.copy(alpha = .12f), radius * .5f, center, style = Stroke(1f))
            drawLine(Color.White.copy(alpha = .18f), Offset(center.x - radius, center.y), Offset(center.x + radius, center.y), 1f)
            drawLine(Color.White.copy(alpha = .18f), Offset(center.x, center.y - radius), Offset(center.x, center.y + radius), 1f)
            drawLine(Color.White.copy(alpha = .38f), Offset(verticalX, verticalTop), Offset(verticalX, verticalBottom), 2f)
            fun horizontal(point: MiniTrailPoint) = Offset(
                center.x + (point.lateralG / 2.0).coerceIn(-1.0, 1.0).toFloat() * radius,
                center.y - (point.longitudinalG / 2.0).coerceIn(-1.0, 1.0).toFloat() * radius,
            )
            fun vertical(value: Double): Offset {
                val ratio = ((value.coerceIn(-1.0, 4.0) + 1.0) / 5.0).toFloat()
                return Offset(verticalX, verticalBottom - ratio * (verticalBottom - verticalTop))
            }
            fun alpha(timestampMs: Long) = (1f - ((nowMs - timestampMs).coerceAtLeast(0L) / 3_000f).coerceIn(0f, 1f)).pow(1.45f)
            fun trail(project: (MiniTrailPoint) -> Offset, color: Color) {
                history.zipWithNext().forEach { (older, newer) ->
                    val a = alpha(newer.timestampMs)
                    val first = project(older)
                    val second = project(newer)
                    val path = Path().apply { moveTo(first.x, first.y); quadraticBezierTo(first.x, first.y, second.x, second.y) }
                    drawPath(path, color.copy(alpha = a * .18f), style = Stroke(10f * (.4f + a), cap = StrokeCap.Round))
                    drawPath(path, color.copy(alpha = a), style = Stroke(2f + 3f * a, cap = StrokeCap.Round))
                }
            }
            trail(::horizontal, RideCyan)
            trail({ vertical(it.normalG) }, RideGreen)
            val current = MiniTrailPoint(nowMs, sample.normalG, sample.lateralG, sample.longitudinalG)
            drawCircle(if (hypot(sample.lateralG, sample.longitudinalG) > 1.2) RideRose else RideGreen, 5.5f, horizontal(current))
            drawCircle(if (abs(sample.normalG) > 3.0) RideRose else RideCyan, 5.5f, vertical(sample.normalG))
        }
    }
}
