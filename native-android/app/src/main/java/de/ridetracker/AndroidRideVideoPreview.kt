package de.ridetracker

import android.net.Uri
import android.widget.VideoView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import de.ridetracker.session.RideSessionSample
import kotlinx.coroutines.delay
import java.io.File
import kotlin.math.hypot
import kotlin.math.pow

internal fun telemetrySampleIndexAt(samples: List<RideSessionSample>, timestamp: Double): Int {
    if (samples.isEmpty()) return -1
    var low = 0
    var high = samples.lastIndex
    while (low <= high) {
        val middle = (low + high) ushr 1
        if (samples[middle].timestamp < timestamp) low = middle + 1 else high = middle - 1
    }
    val next = low.coerceIn(samples.indices)
    val previous = (next - 1).coerceIn(samples.indices)
    return if (kotlin.math.abs(samples[next].timestamp - timestamp) < kotlin.math.abs(samples[previous].timestamp - timestamp)) next else previous
}

internal fun telemetryTrailAt(samples: List<RideSessionSample>, timestamp: Double, seconds: Double = 3.0): List<RideSessionSample> {
    val end = telemetrySampleIndexAt(samples, timestamp)
    if (end < 0) return emptyList()
    var start = end
    while (start > 0 && samples[start - 1].timestamp >= timestamp - seconds) start -= 1
    return samples.subList(start, end + 1)
}

@Composable
fun AndroidRideVideoPreview(
    file: File,
    samples: List<RideSessionSample>,
    startOffsetSeconds: Double,
    hudEmbedded: Boolean,
    modifier: Modifier = Modifier,
) {
    var videoView by remember(file.absolutePath) { mutableStateOf<VideoView?>(null) }
    var durationMs by remember(file.absolutePath) { mutableLongStateOf(1L) }
    var positionMs by remember(file.absolutePath) { mutableLongStateOf(0L) }
    var playing by remember(file.absolutePath) { mutableStateOf(false) }
    var prepared by remember(file.absolutePath) { mutableStateOf(false) }
    var status by remember(file.absolutePath) { mutableStateOf("Videovorschau wird vorbereitet …") }
    var videoAspect by remember(file.absolutePath) { mutableFloatStateOf(16f / 9f) }

    LaunchedEffect(videoView, playing) {
        while (true) {
            val view = videoView
            if (view != null && prepared) {
                positionMs = view.currentPosition.toLong().coerceAtLeast(0L)
                playing = view.isPlaying
            }
            delay(if (playing) 50L else 180L)
        }
    }
    DisposableEffect(videoView) { onDispose { videoView?.pause() } }

    val telemetryTimestamp = positionMs / 1_000.0 + startOffsetSeconds
    val sampleIndex = remember(samples, telemetryTimestamp) { telemetrySampleIndexAt(samples, telemetryTimestamp) }
    val sample = samples.getOrNull(sampleIndex)
    val trail = remember(samples, telemetryTimestamp) { telemetryTrailAt(samples, telemetryTimestamp) }

    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(
            Modifier.fillMaxWidth().aspectRatio(videoAspect.coerceIn(.56f, 1.9f)).background(Color.Black),
            contentAlignment = Alignment.Center,
        ) {
            AndroidView(
                factory = { context ->
                    VideoView(context).apply {
                        tag = file.absolutePath
                        setVideoURI(Uri.fromFile(file))
                        setOnPreparedListener { player ->
                            durationMs = player.duration.toLong().coerceAtLeast(1L)
                            val width = player.videoWidth
                            val height = player.videoHeight
                            if (width > 0 && height > 0) videoAspect = width.toFloat() / height.toFloat()
                            prepared = true
                            status = if (hudEmbedded) "Vorschau bereit · Sensor-HUD ist in der Videodatei eingebettet" else "Vorschau bereit · Sensor-HUD wird synchron eingeblendet"
                            seekTo(1)
                        }
                        setOnCompletionListener { playing = false; positionMs = durationMs }
                        setOnErrorListener { _, what, extra ->
                            prepared = false
                            playing = false
                            status = "Vorschaufehler ($what/$extra). Die Originaldatei bleibt erhalten."
                            true
                        }
                        videoView = this
                    }
                },
                update = { view ->
                    videoView = view
                    if (view.tag != file.absolutePath) {
                        view.tag = file.absolutePath
                        prepared = false
                        view.setVideoURI(Uri.fromFile(file))
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
            if (!hudEmbedded && sample != null) ReplaySensorHud(sample, trail, telemetryTimestamp, Modifier.fillMaxSize())
            if (!playing) {
                FilledIconButton(
                    enabled = prepared,
                    onClick = { videoView?.start(); playing = true },
                    modifier = Modifier.size(62.dp),
                    colors = IconButtonDefaults.filledIconButtonColors(containerColor = RideCyan.copy(alpha = .9f), contentColor = Color(0xFF03111D)),
                ) { Icon(if (positionMs >= durationMs - 250L) Icons.Filled.Replay else Icons.Filled.PlayArrow, "Video abspielen", Modifier.size(34.dp)) }
            }
            Surface(
                color = Color(0xB805121D),
                shape = CircleShape,
                modifier = Modifier.align(Alignment.TopStart).padding(9.dp),
            ) { Text(if (hudEmbedded) "HUD · EINGEBETTET" else "HUD · SYNCHRON", Modifier.padding(horizontal = 9.dp, vertical = 5.dp), style = MaterialTheme.typography.labelSmall, color = RideCyan) }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(
                enabled = prepared,
                onClick = {
                    if (playing) videoView?.pause() else videoView?.start()
                    playing = !playing
                },
            ) { Icon(if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, if (playing) "Pausieren" else "Abspielen") }
            Slider(
                value = positionMs.coerceAtMost(durationMs).toFloat(),
                onValueChange = { value -> positionMs = value.toLong(); videoView?.seekTo(positionMs.toInt()) },
                valueRange = 0f..durationMs.coerceAtLeast(1L).toFloat(),
                enabled = prepared,
                modifier = Modifier.weight(1f),
            )
            Text("%02d:%02d".format(positionMs / 60_000, (positionMs / 1_000) % 60), style = MaterialTheme.typography.labelMedium)
        }
        Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ReplaySensorHud(
    sample: RideSessionSample,
    trail: List<RideSessionSample>,
    timestamp: Double,
    modifier: Modifier = Modifier,
) {
    Box(modifier) {
        Surface(
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(8.dp),
            color = Color(0xC704121D),
            shape = MaterialTheme.shapes.medium,
            border = androidx.compose.foundation.BorderStroke(1.dp, RideCyan.copy(alpha = .55f)),
        ) {
            Row(Modifier.height(112.dp).padding(9.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.width(76.dp)) {
                    Text("TEMPO", style = MaterialTheme.typography.labelSmall, color = RideMuted)
                    Text("%.0f".format(sample.speedMS * 3.6), style = MaterialTheme.typography.headlineMedium, color = RideCyan)
                    Text("KM/H", style = MaterialTheme.typography.labelSmall, color = RideCyan)
                }
                Canvas(Modifier.weight(1f).fillMaxHeight()) {
                    val center = Offset(size.width * .38f, size.height * .52f)
                    val radius = size.minDimension * .38f
                    val verticalX = size.width * .84f
                    val rangeG = 2f
                    for (ratio in listOf(.5f, 1f)) drawCircle(Color.White.copy(alpha = .18f), radius * ratio, center, style = Stroke(1.2.dp.toPx()))
                    drawLine(Color.White.copy(alpha = .2f), Offset(center.x - radius, center.y), Offset(center.x + radius, center.y), 1.dp.toPx())
                    drawLine(Color.White.copy(alpha = .2f), Offset(center.x, center.y - radius), Offset(center.x, center.y + radius), 1.dp.toPx())
                    drawLine(Color.White.copy(alpha = .4f), Offset(verticalX, size.height * .08f), Offset(verticalX, size.height * .92f), 2.dp.toPx())
                    fun horizontal(point: RideSessionSample) = Offset(
                        center.x + (point.lateralG / rangeG).coerceIn(-1.0, 1.0).toFloat() * radius,
                        center.y - (point.longitudinalG / rangeG).coerceIn(-1.0, 1.0).toFloat() * radius,
                    )
                    fun vertical(point: RideSessionSample): Offset {
                        val ratio = ((point.normalG.coerceIn(-1.0, 4.0) + 1.0) / 5.0).toFloat()
                        return Offset(verticalX, size.height * .92f - ratio * size.height * .84f)
                    }
                    fun drawTrail(project: (RideSessionSample) -> Offset, color: Color) {
                        trail.zipWithNext().forEach { (older, newer) ->
                            val age = ((timestamp - newer.timestamp) / 3.0).coerceIn(0.0, 1.0).toFloat()
                            val alpha = (1f - age).pow(1.45f)
                            val a = project(older); val b = project(newer)
                            val path = Path().apply { moveTo(a.x, a.y); quadraticBezierTo(a.x, a.y, b.x, b.y) }
                            drawPath(path, color.copy(alpha = alpha * .18f), style = Stroke(11.dp.toPx() * (.25f + alpha), cap = StrokeCap.Round))
                            drawPath(path, color.copy(alpha = alpha * .88f), style = Stroke(3.dp.toPx() * (.35f + alpha), cap = StrokeCap.Round))
                        }
                    }
                    drawTrail(::horizontal, RideCyan)
                    drawTrail(::vertical, RideGreen)
                    val horizontalPoint = horizontal(sample)
                    drawCircle(if (hypot(sample.lateralG, sample.longitudinalG) > 1.2) RideRose else RideGreen, 6.dp.toPx(), horizontalPoint)
                    drawCircle(RideCyan, 6.dp.toPx(), vertical(sample))
                }
                Column(Modifier.width(78.dp), horizontalAlignment = Alignment.End) {
                    Text("VERTIKAL", style = MaterialTheme.typography.labelSmall, color = RideMuted)
                    Text("%+.1f G".format(sample.normalG), style = MaterialTheme.typography.titleLarge)
                    Text("GESAMT %.1f G".format(sample.totalG), style = MaterialTheme.typography.labelSmall, color = RideGreen)
                }
            }
        }
    }
}
