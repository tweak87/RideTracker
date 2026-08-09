package de.ridetracker

import android.app.Activity
import android.content.res.Configuration
import android.os.SystemClock
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloseFullscreen
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import de.ridetracker.sensors.AndroidLiveGForceSample
import de.ridetracker.sensors.AndroidSensorRecorder
import de.ridetracker.hud.AndroidHudConfigurationStore
import de.ridetracker.video.AndroidVideoRecorder
import kotlinx.coroutines.delay
import kotlin.math.hypot
import kotlin.math.pow

private const val G_TRAIL_DURATION_MS = 3_000L

private data class GTrailPoint(val timestampMs: Long, val normalG: Double, val lateralG: Double, val longitudinalG: Double)

@Composable
fun AndroidGForceTrail(
    sample: AndroidLiveGForceSample,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    val history = remember { mutableStateListOf<GTrailPoint>() }
    var clockMs by remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }

    LaunchedEffect(sample.timestampMs) {
        if (sample.timestampMs > 0L) {
            history += GTrailPoint(sample.timestampMs, sample.normalG, sample.lateralG, sample.longitudinalG)
            while (history.size > 180) history.removeAt(0)
        }
    }
    LaunchedEffect(Unit) {
        while (true) {
            clockMs = SystemClock.elapsedRealtime()
            while (history.isNotEmpty() && clockMs - history.first().timestampMs > G_TRAIL_DURATION_MS) history.removeAt(0)
            delay(33)
        }
    }

    Surface(
        modifier = modifier,
        color = Color(0xCC04121D),
        shape = MaterialTheme.shapes.large,
        border = androidx.compose.foundation.BorderStroke(1.dp, RideCyan.copy(alpha = .62f)),
    ) {
        Column(Modifier.padding(if (compact) 10.dp else 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("G-KRÄFTE · 3-S-SCHWEIF", style = MaterialTheme.typography.titleSmall)
                    if (!compact) Text("Draufsicht und Vertikallast", style = MaterialTheme.typography.labelSmall, color = RideMuted)
                }
                Text("${if (sample.normalG >= 0) "+" else ""}${"%.1f".format(sample.normalG)} G", color = RideCyan, style = MaterialTheme.typography.titleMedium)
            }
            Canvas(Modifier.fillMaxWidth().height(if (compact) 145.dp else 210.dp)) {
                val radius = size.minDimension * .34f
                val center = Offset(size.width * .36f, size.height * .52f)
                val verticalX = size.width * .82f
                val verticalTop = size.height * .12f
                val verticalBottom = size.height * .88f
                val rangeG = 2f

                for (ratio in listOf(.25f, .5f, 1f)) drawCircle(Color.White.copy(alpha = .15f), radius * ratio, center, style = Stroke(1.2.dp.toPx()))
                drawLine(Color.White.copy(alpha = .2f), Offset(center.x - radius, center.y), Offset(center.x + radius, center.y), 1.dp.toPx())
                drawLine(Color.White.copy(alpha = .2f), Offset(center.x, center.y - radius), Offset(center.x, center.y + radius), 1.dp.toPx())
                drawLine(Color.White.copy(alpha = .5f), Offset(verticalX, verticalTop), Offset(verticalX, verticalBottom), 2.dp.toPx(), cap = StrokeCap.Round)

                fun horizontal(point: GTrailPoint) = Offset(
                    center.x + (point.lateralG / rangeG).coerceIn(-1.0, 1.0).toFloat() * radius,
                    center.y - (point.longitudinalG / rangeG).coerceIn(-1.0, 1.0).toFloat() * radius,
                )
                fun vertical(normalG: Double): Offset {
                    val ratio = ((normalG.coerceIn(-1.0, 4.0) + 1.0) / 5.0).toFloat()
                    return Offset(verticalX, verticalBottom - ratio * (verticalBottom - verticalTop))
                }
                fun alpha(timestamp: Long): Float {
                    val age = ((clockMs - timestamp).coerceAtLeast(0L).toFloat() / G_TRAIL_DURATION_MS).coerceIn(0f, 1f)
                    return (1f - age).pow(1.45f) * .84f
                }
                fun drawSoftTrail(project: (GTrailPoint) -> Offset, color: Color, baseWidth: Float) {
                    history.zipWithNext().forEach { (previous, current) ->
                        val a = alpha((previous.timestampMs + current.timestampMs) / 2)
                        if (a <= 0f) return@forEach
                        val p0 = project(previous); val p1 = project(current)
                        val path = Path().apply { moveTo(p0.x, p0.y); quadraticBezierTo(p0.x, p0.y, p1.x, p1.y) }
                        drawPath(path, color.copy(alpha = a * .20f), style = Stroke(baseWidth * 3.1f * (.35f + a), cap = StrokeCap.Round))
                        drawPath(path, color.copy(alpha = a), style = Stroke(baseWidth * (.35f + a * .65f), cap = StrokeCap.Round))
                    }
                }

                drawSoftTrail(::horizontal, RideCyan, 4.dp.toPx())
                drawSoftTrail({ vertical(it.normalG) }, Color.White, 3.dp.toPx())

                val current = GTrailPoint(clockMs, sample.normalG, sample.lateralG, sample.longitudinalG)
                val horizontalPoint = horizontal(current)
                drawCircle(RideGreen.copy(alpha = .2f), 13.dp.toPx(), horizontalPoint)
                drawCircle(if (hypot(sample.lateralG, sample.longitudinalG) > 1.2) RideRose else RideGreen, 6.dp.toPx(), horizontalPoint)
                val verticalPoint = vertical(sample.normalG)
                drawCircle(RideCyan.copy(alpha = .18f), 12.dp.toPx(), verticalPoint)
                drawCircle(when { sample.normalG < .15 -> Color(0xFFA78BFA); sample.normalG >= 3 -> RideRose; sample.normalG >= 1.8 -> RideAmber; else -> RideCyan }, 6.dp.toPx(), verticalPoint)
            }
        }
    }
}

@Composable
fun AndroidLiveRecordingFullscreen(
    activity: Activity,
    recorder: AndroidSensorRecorder,
    video: AndroidVideoRecorder,
    preparing: Boolean,
    minimize: () -> Unit,
    stop: () -> Unit,
) {
    val view = LocalView.current
    DisposableEffect(activity, view) {
        val controller = WindowCompat.getInsetsController(activity.window, view)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
        onDispose { controller.show(WindowInsetsCompat.Type.systemBars()) }
    }
    var verticalDrag by remember { mutableFloatStateOf(0f) }
    var elapsedMs by remember { mutableLongStateOf(0L) }
    LaunchedEffect(recorder.isRecording) {
        while (recorder.isRecording) {
            elapsedMs = ((SystemClock.elapsedRealtimeNanos() - recorder.recordingStartNs).coerceAtLeast(0L)) / 1_000_000L
            delay(250)
        }
    }
    val elapsed = "%02d:%02d".format(elapsedMs / 60_000, (elapsedMs / 1_000) % 60)
    val orientation = LocalConfiguration.current.orientation
    val hudConfiguration = remember { AndroidHudConfigurationStore.load(activity.applicationContext) }
    val hudProfile = if (orientation == Configuration.ORIENTATION_LANDSCAPE) hudConfiguration.landscape else hudConfiguration.portrait
    val acceleration = recorder.liveSensorSample
    val vibrationMS2 = kotlin.math.abs(
        kotlin.math.sqrt(
            acceleration.accelerationXG.pow(2) + acceleration.accelerationYG.pow(2) + acceleration.accelerationZG.pow(2),
        ) - 1.0,
    ) * 9.80665

    Surface(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onVerticalDrag = { change, amount -> change.consume(); verticalDrag += amount },
                    onDragEnd = { if (verticalDrag > 110.dp.toPx()) minimize(); verticalDrag = 0f },
                    onDragCancel = { verticalDrag = 0f },
                )
            },
        color = Color.Black,
    ) {
        Box(Modifier.fillMaxSize()) {
            AndroidView(
                factory = { context -> PreviewView(context).apply {
                    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                    video.attachPreview(surfaceProvider)
                } },
                update = { video.attachPreview(it.surfaceProvider) },
                modifier = Modifier.fillMaxSize(),
            )
            Box(Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color.Black.copy(alpha=.54f),Color.Transparent,Color.Black.copy(alpha=.78f)))))
            AndroidConfiguredHudLayer(
                profile = hudProfile,
                telemetry = AndroidHudTelemetry(
                    g = recorder.liveGForceSample,
                    speedKmh = recorder.speedKmh,
                    heartRateBpm = recorder.latestHeartRateBpm,
                    vibrationMS2 = vibrationMS2,
                    phase = recorder.ridePhase,
                ),
                modifier = Modifier.fillMaxSize(),
            )
            Row(Modifier.fillMaxWidth().statusBarsPadding().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                RideTrackerLogo()
                Spacer(Modifier.width(10.dp))
                Surface(color = if (recorder.isRecording) RideRose.copy(alpha=.88f) else RideAmber.copy(alpha=.88f), shape = CircleShape) {
                    Text(if (recorder.isRecording) "● REC $elapsed" else "KAMERA STARTET", Modifier.padding(horizontal=12.dp,vertical=8.dp), color=Color.White, style=MaterialTheme.typography.labelLarge)
                }
                Spacer(Modifier.weight(1f))
                if (recorder.isRecording) {
                    FilledTonalIconButton(onClick = stop) { Icon(Icons.Filled.Stop, "Aufnahme stoppen", tint = RideRose) }
                    Spacer(Modifier.width(8.dp))
                }
                FilledTonalIconButton(onClick = minimize) { Icon(Icons.Filled.CloseFullscreen, "Vollbild verlassen") }
            }

            if (preparing && !recorder.isRecording) Surface(Modifier.align(Alignment.Center), color=Color(0xDD071522), shape=MaterialTheme.shapes.large) {
                Column(Modifier.padding(22.dp), horizontalAlignment=Alignment.CenterHorizontally, verticalArrangement=Arrangement.spacedBy(8.dp)) {
                    CircularProgressIndicator(color=RideCyan)
                    Text("Aufnahme wird vorbereitet", style=MaterialTheme.typography.titleMedium)
                    Text(video.status, color=RideMuted, style=MaterialTheme.typography.bodySmall)
                }
            }

            Text(
                "Nach unten wischen: Vollbild verlassen",
                modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(12.dp),
                style = MaterialTheme.typography.labelSmall,
                color = RideMuted,
            )
        }
    }
}
