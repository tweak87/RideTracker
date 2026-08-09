package de.ridetracker.video

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.RectF
import java.util.Locale
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.pow

data class VideoHudSample(
    val timestampMs: Long = 0L,
    val elapsedSeconds: Double = 0.0,
    val speedKmh: Double = 0.0,
    val normalG: Double = 1.0,
    val lateralG: Double = 0.0,
    val longitudinalG: Double = 0.0,
    val totalG: Double = 1.0,
    val phase: String = "idle",
    val heartRateBpm: Int? = null,
)

internal class VideoHudHistory(private val durationMs: Long = 3_000L) {
    private val values = ArrayDeque<VideoHudSample>()

    @Synchronized
    fun add(sample: VideoHudSample) {
        if (sample.timestampMs <= 0L) return
        if (values.lastOrNull()?.timestampMs == sample.timestampMs) values.removeLast()
        values.addLast(sample)
        trim(sample.timestampMs)
        while (values.size > 240) values.removeFirst()
    }

    @Synchronized
    fun snapshot(nowMs: Long): List<VideoHudSample> {
        trim(nowMs)
        return values.toList()
    }

    @Synchronized
    fun clear() = values.clear()

    private fun trim(nowMs: Long) {
        while (values.isNotEmpty() && nowMs - values.first().timestampMs > durationMs) values.removeFirst()
    }
}

/** Draws the same three-second G-force language into CameraX's video frames. */
class VideoHudOverlayRenderer {
    private val current = AtomicReference(VideoHudSample())
    private val history = VideoHudHistory()

    fun update(sample: VideoHudSample) {
        current.set(sample)
        history.add(sample)
    }

    fun reset() {
        current.set(VideoHudSample())
        history.clear()
    }

    fun draw(canvas: Canvas): Boolean {
        val sample = current.get()
        if (sample.timestampMs <= 0L || canvas.width <= 0 || canvas.height <= 0) return true
        canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
        val points = history.snapshot(sample.timestampMs)
        val shortSide = min(canvas.width, canvas.height).toFloat()
        val scale = (shortSide / 720f).coerceIn(.62f, 2.2f)
        val margin = 24f * scale
        val panelHeight = 158f * scale
        val panel = RectF(margin, canvas.height - margin - panelHeight, canvas.width - margin, canvas.height - margin)
        val background = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(194, 3, 14, 25) }
        canvas.drawRoundRect(panel, 24f * scale, 24f * scale, background)

        val white = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
        }
        val muted = Paint(white).apply { color = Color.rgb(166, 192, 210); typeface = android.graphics.Typeface.DEFAULT }
        val cyan = Paint(white).apply { color = Color.rgb(95, 208, 255) }
        val green = Paint(white).apply { color = Color.rgb(101, 240, 183) }
        val rose = Paint(white).apply { color = Color.rgb(255, 90, 103) }

        white.textSize = 24f * scale
        muted.textSize = 17f * scale
        cyan.textSize = 45f * scale
        canvas.drawText("RIDETRACKER · HUD", panel.left + 18f * scale, panel.top + 30f * scale, white)
        canvas.drawText(formatElapsed(sample.elapsedSeconds), panel.left + 18f * scale, panel.top + 57f * scale, muted)
        canvas.drawText(String.format(Locale.US, "%.0f", sample.speedKmh), panel.left + 18f * scale, panel.bottom - 30f * scale, cyan)
        muted.textSize = 15f * scale
        canvas.drawText("KM/H", panel.left + 88f * scale, panel.bottom - 31f * scale, muted)

        val graphLeft = panel.left + 150f * scale
        val graphRight = panel.right - 150f * scale
        val centerX = (graphLeft + graphRight) / 2f
        val centerY = panel.top + panel.height() * .58f
        val radius = min((graphRight - graphLeft) / 2f, 53f * scale).coerceAtLeast(28f * scale)
        val grid = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(80, 255, 255, 255); style = Paint.Style.STROKE; strokeWidth = 1.5f * scale }
        canvas.drawCircle(centerX, centerY, radius, grid)
        canvas.drawCircle(centerX, centerY, radius * .5f, grid)
        canvas.drawLine(centerX - radius, centerY, centerX + radius, centerY, grid)
        canvas.drawLine(centerX, centerY - radius, centerX, centerY + radius, grid)

        fun x(point: VideoHudSample) = centerX + (point.lateralG / 2.0).coerceIn(-1.0, 1.0).toFloat() * radius
        fun y(point: VideoHudSample) = centerY - (point.longitudinalG / 2.0).coerceIn(-1.0, 1.0).toFloat() * radius
        points.zipWithNext().forEach { (older, newer) ->
            val age = ((sample.timestampMs - newer.timestampMs).coerceAtLeast(0L) / 3_000f).coerceIn(0f, 1f)
            val alpha = (1f - age).pow(1.45f)
            val trail = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.argb((alpha * 220).toInt(), 95, 208, 255)
                style = Paint.Style.STROKE
                strokeCap = Paint.Cap.ROUND
                strokeWidth = (2.2f + alpha * 4.2f) * scale
            }
            val path = Path().apply { moveTo(x(older), y(older)); quadTo(x(older), y(older), x(newer), y(newer)) }
            canvas.drawPath(path, trail)
        }
        val load = hypot(sample.lateralG, sample.longitudinalG)
        canvas.drawCircle(x(sample), y(sample), 8f * scale, if (load > 1.2) rose else green)

        val verticalX = panel.right - 98f * scale
        val verticalTop = panel.top + 26f * scale
        val verticalBottom = panel.bottom - 28f * scale
        canvas.drawLine(verticalX, verticalTop, verticalX, verticalBottom, grid.apply { strokeWidth = 3f * scale })
        points.zipWithNext().forEach { (older, newer) ->
            fun verticalY(value: Double): Float {
                val ratio = ((value.coerceIn(-1.0, 4.0) + 1.0) / 5.0).toFloat()
                return verticalBottom - ratio * (verticalBottom - verticalTop)
            }
            val age = ((sample.timestampMs - newer.timestampMs).coerceAtLeast(0L) / 3_000f).coerceIn(0f, 1f)
            val alpha = (1f - age).pow(1.45f)
            canvas.drawLine(verticalX, verticalY(older.normalG), verticalX, verticalY(newer.normalG), Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.argb((alpha * 220).toInt(), 101, 240, 183)
                strokeWidth = (2f + alpha * 4f) * scale
                strokeCap = Paint.Cap.ROUND
            })
        }
        fun verticalY(value: Double): Float {
            val ratio = ((value.coerceIn(-1.0, 4.0) + 1.0) / 5.0).toFloat()
            return verticalBottom - ratio * (verticalBottom - verticalTop)
        }
        canvas.drawCircle(verticalX, verticalY(sample.normalG), 8f * scale, cyan)
        white.textSize = 20f * scale
        canvas.drawText(String.format(Locale.US, "%+.1f G", sample.normalG), panel.right - 77f * scale, panel.bottom - 8f * scale, white)
        muted.textSize = 14f * scale
        canvas.drawText("SEITE / LÄNGS", centerX - 43f * scale, panel.bottom - 9f * scale, muted)
        sample.heartRateBpm?.let {
            rose.textSize = 20f * scale
            canvas.drawText("♥ $it", panel.left + 18f * scale, panel.top + 82f * scale, rose)
        }
        return true
    }

    private fun formatElapsed(seconds: Double): String {
        val whole = seconds.coerceAtLeast(0.0).toLong()
        return "%02d:%02d · %s".format(Locale.US, whole / 60, whole % 60, current.get().phase.uppercase(Locale.GERMAN))
    }
}
