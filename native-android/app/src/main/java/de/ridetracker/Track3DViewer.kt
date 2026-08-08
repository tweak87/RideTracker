package de.ridetracker

import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import org.json.JSONObject
import kotlin.math.*

data class AndroidTrackPoint(
    val index: Int,
    val timestamp: Double,
    val x: Double,
    val y: Double,
    val z: Double,
    val distanceM: Double,
    val speedKmh: Double,
    val normalG: Double,
    val lateralG: Double,
    val longitudinalG: Double,
    val totalG: Double,
    val confidence: Double,
)

enum class AndroidHeatMetric(val title: String) { SPEED("Geschwindigkeit"), TOTAL_G("Gesamtkraft"), NORMAL_G("Vertikalkraft"), LATERAL_G("Seitenkraft"), HEIGHT("Höhe") }

fun deriveAndroidTrackPoints(root: JSONObject): List<AndroidTrackPoint> {
    val samples = root.optJSONArray("samples") ?: return emptyList()
    val raw = buildList {
        for (index in 0 until samples.length()) {
            val sample = samples.optJSONObject(index) ?: continue
            val latitude = sample.optDouble("latitude", Double.NaN)
            val longitude = sample.optDouble("longitude", Double.NaN)
            if (!latitude.isFinite() || !longitude.isFinite()) continue
            add(sample)
        }
    }
    if (raw.size < 2) return emptyList()
    val step = max(1, ceil(raw.size / 400.0).toInt())
    val selected = raw.filterIndexed { index, _ -> index % step == 0 }.toMutableList().apply { if (last() !== raw.last()) add(raw.last()) }
    val originLatitude = selected.first().optDouble("latitude")
    val originLongitude = selected.first().optDouble("longitude")
    val latitudeScale = 111_320.0
    val longitudeScale = cos(Math.toRadians(originLatitude)) * 111_320.0
    var distance = 0.0
    var previousX = 0.0
    var previousY = selected.first().optDouble("relativeAltitudeM", 0.0)
    var previousZ = 0.0
    return selected.mapIndexed { index, sample ->
        val x = (sample.optDouble("longitude") - originLongitude) * longitudeScale
        val z = (sample.optDouble("latitude") - originLatitude) * latitudeScale
        val y = sample.optDouble("relativeAltitudeM", 0.0).takeIf { it.isFinite() } ?: 0.0
        if (index > 0) distance += sqrt((x - previousX).pow(2) + (y - previousY).pow(2) + (z - previousZ).pow(2))
        previousX = x; previousY = y; previousZ = z
        AndroidTrackPoint(
            index = index,
            timestamp = sample.optDouble("timestamp", index / 10.0),
            x = x, y = y, z = z, distanceM = distance,
            speedKmh = if (sample.has("speedKmh")) sample.optDouble("speedKmh") else sample.optDouble("speedMS", 0.0) * 3.6,
            normalG = sample.optDouble("normalG", 0.0),
            lateralG = sample.optDouble("lateralG", 0.0),
            longitudinalG = sample.optDouble("longitudinalG", 0.0),
            totalG = sample.optDouble("totalG", 0.0),
            confidence = (sample.optDouble("qualityScore", 0.0) / 100.0).coerceIn(0.0, 1.0),
        )
    }
}

@Composable
fun AndroidTrack3DViewer(points: List<AndroidTrackPoint>, modifier: Modifier = Modifier) {
    if (points.size < 2) {
        Text("Für dieses räumliche Modell sind noch nicht genug GPS-Punkte vorhanden.", modifier = modifier)
        return
    }
    var yaw by remember { mutableFloatStateOf(-0.65f) }
    var pitch by remember { mutableFloatStateOf(0.55f) }
    var zoom by remember { mutableFloatStateOf(1f) }
    var metric by remember { mutableStateOf(AndroidHeatMetric.SPEED) }
    var selectedIndex by remember { mutableIntStateOf(0) }
    var canvasSize by remember { mutableStateOf(IntSize.Zero) }
    val selected = points[selectedIndex.coerceIn(points.indices)]

    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Räumliches XYZ-Modell", style = MaterialTheme.typography.titleLarge)
        Text("Ziehen dreht, zwei Finger zoomen. Tippe einen Streckenpunkt für Messwerte.", style = MaterialTheme.typography.bodySmall)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            listOf(AndroidHeatMetric.SPEED, AndroidHeatMetric.TOTAL_G, AndroidHeatMetric.HEIGHT).forEach { value ->
                FilterChip(value == metric, { metric = value }, { Text(value.title, style = MaterialTheme.typography.labelSmall) }, modifier = Modifier.weight(1f))
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            listOf(AndroidHeatMetric.NORMAL_G, AndroidHeatMetric.LATERAL_G).forEach { value ->
                FilterChip(value == metric, { metric = value }, { Text(value.title, style = MaterialTheme.typography.labelSmall) }, modifier = Modifier.weight(1f))
            }
            OutlinedButton(onClick = { yaw = -0.65f; pitch = 0.55f; zoom = 1f }, modifier = Modifier.weight(1f)) { Text("Reset") }
        }
        Canvas(
            Modifier.fillMaxWidth().height(360.dp).onSizeChanged { canvasSize = it }
                .pointerInput(points, yaw, pitch, zoom, canvasSize) {
                    detectTapGestures { tap ->
                        val screen = projectTrack(points, canvasSize, yaw, pitch, zoom)
                        val nearest = screen.indices.minByOrNull { (screen[it] - tap).getDistance() }
                        if (nearest != null && (screen[nearest] - tap).getDistance() <= 42f) selectedIndex = nearest
                    }
                }
                .pointerInput(Unit) {
                    detectTransformGestures { _, pan, gestureZoom, rotation ->
                        yaw += rotation * 0.015f + pan.x * 0.006f
                        pitch = (pitch + pan.y * 0.004f).coerceIn(-1.45f, 1.45f)
                        zoom = (zoom * gestureZoom).coerceIn(0.35f, 5f)
                    }
                },
        ) {
            drawRect(Color(0xFF07111F))
            val screen = projectTrack(points, IntSize(size.width.roundToInt(), size.height.roundToInt()), yaw, pitch, zoom)
            if (screen.size >= 2) for (index in 1 until screen.size) {
                drawLine(metricColor(points[index], points, metric), screen[index - 1], screen[index], strokeWidth = if (index == selectedIndex) 8f else 5f)
            }
            val origin = Offset(48f, size.height - 48f)
            drawLine(Color(0xFFFF5A67), origin, origin + Offset(62f, 0f), 4f)
            drawLine(Color(0xFF65F0B7), origin, origin + Offset(0f, -62f), 4f)
            drawLine(Color(0xFF5FD0FF), origin, origin + Offset(42f, 38f), 4f)
            val textPaint = Paint().apply { isAntiAlias = true; textSize = 28f; typeface = android.graphics.Typeface.DEFAULT_BOLD }
            textPaint.color = android.graphics.Color.rgb(255, 90, 103); drawContext.canvas.nativeCanvas.drawText("X", origin.x + 67f, origin.y + 7f, textPaint)
            textPaint.color = android.graphics.Color.rgb(101, 240, 183); drawContext.canvas.nativeCanvas.drawText("Y", origin.x - 8f, origin.y - 68f, textPaint)
            textPaint.color = android.graphics.Color.rgb(95, 208, 255); drawContext.canvas.nativeCanvas.drawText("Z", origin.x + 47f, origin.y + 48f, textPaint)
            screen.getOrNull(selectedIndex)?.let { point -> drawCircle(Color.White, 9f, point); drawCircle(Color.Black, 4f, point) }
        }
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Punkt ${selected.index + 1} / ${points.size}", style = MaterialTheme.typography.titleMedium)
                Text("XYZ: ${"%.1f".format(selected.x)} / ${"%.1f".format(selected.y)} / ${"%.1f".format(selected.z)} m")
                Text("Strecke ${"%.1f".format(selected.distanceM)} m · Zeit ${"%.2f".format(selected.timestamp)} s")
                Text("Tempo ${"%.1f".format(selected.speedKmh)} km/h · Gesamt ${"%.2f".format(selected.totalG)} G")
                Text("Vertikal ${"%.2f".format(selected.normalG)} G · Seitlich ${"%.2f".format(selected.lateralG)} G · Längs ${"%.2f".format(selected.longitudinalG)} G")
                Text("Modellgüte ${"%.0f".format(selected.confidence * 100)} %")
            }
        }
    }
}

private fun projectTrack(points: List<AndroidTrackPoint>, size: IntSize, yaw: Float, pitch: Float, zoom: Float): List<Offset> {
    if (size.width <= 0 || size.height <= 0) return emptyList()
    val centerX = (points.minOf { it.x } + points.maxOf { it.x }) / 2.0
    val centerY = (points.minOf { it.y } + points.maxOf { it.y }) / 2.0
    val centerZ = (points.minOf { it.z } + points.maxOf { it.z }) / 2.0
    val extent = max(10.0, max(points.maxOf { abs(it.x - centerX) }, max(points.maxOf { abs(it.y - centerY) }, points.maxOf { abs(it.z - centerZ) })))
    val scale = min(size.width, size.height) * 0.39 / extent * zoom
    val cosYaw = cos(yaw); val sinYaw = sin(yaw); val cosPitch = cos(pitch); val sinPitch = sin(pitch)
    return points.map { point ->
        val x = point.x - centerX; val y = point.y - centerY; val z = point.z - centerZ
        val rotatedX = x * cosYaw - z * sinYaw
        val depth = x * sinYaw + z * cosYaw
        val rotatedY = y * cosPitch - depth * sinPitch
        val rotatedDepth = y * sinPitch + depth * cosPitch
        val perspective = 1.0 / (1.0 + rotatedDepth / (extent * 5.0)).coerceIn(0.45, 1.8)
        Offset((size.width / 2.0 + rotatedX * scale * perspective).toFloat(), (size.height / 2.0 - rotatedY * scale * perspective).toFloat())
    }
}

private fun metricColor(point: AndroidTrackPoint, points: List<AndroidTrackPoint>, metric: AndroidHeatMetric): Color {
    val value = when (metric) { AndroidHeatMetric.SPEED -> point.speedKmh; AndroidHeatMetric.TOTAL_G -> point.totalG; AndroidHeatMetric.NORMAL_G -> point.normalG; AndroidHeatMetric.LATERAL_G -> abs(point.lateralG); AndroidHeatMetric.HEIGHT -> point.y }
    val values = points.map { when (metric) { AndroidHeatMetric.SPEED -> it.speedKmh; AndroidHeatMetric.TOTAL_G -> it.totalG; AndroidHeatMetric.NORMAL_G -> it.normalG; AndroidHeatMetric.LATERAL_G -> abs(it.lateralG); AndroidHeatMetric.HEIGHT -> it.y } }
    val minimum = values.minOrNull() ?: 0.0
    val maximum = values.maxOrNull() ?: 1.0
    val ratio = ((value - minimum) / (maximum - minimum).coerceAtLeast(1e-6)).coerceIn(0.0, 1.0).toFloat()
    return Color.hsv(220f - ratio * 220f, 0.85f, 0.95f)
}
