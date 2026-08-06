package de.ridetracker.overlay

import kotlin.math.hypot

data class OverlayTelemetryFrame(
    val timestampMs: Double,
    val gForce: GForce,
    val speed: Speed,
    val heartRate: HeartRate,
    val vibration: Vibration,
    val recording: Recording,
) {
    data class GForce(val lateral: Double, val vertical: Double, val longitudinal: Double, val total: Double)
    data class Speed(val valueKmh: Double, val source: String, val accuracyKmh: Double?)
    data class HeartRate(val bpm: Int?, val source: String, val valid: Boolean)
    data class Vibration(val rmsMs2: Double, val peakMs2: Double, val level: String)
    data class Recording(val active: Boolean, val elapsedMs: Double)

    companion object {
        fun create(timestampMs: Double, lateralG: Double, verticalG: Double, longitudinalG: Double, speedKmh: Double, heartRateBpm: Int?, vibrationRmsMs2: Double, vibrationPeakMs2: Double, recording: Boolean) = OverlayTelemetryFrame(
            timestampMs.coerceAtLeast(0.0),
            GForce(lateralG, verticalG, longitudinalG, hypot(hypot(lateralG, verticalG), longitudinalG)),
            Speed(speedKmh.coerceAtLeast(0.0), "gps", null),
            HeartRate(heartRateBpm, if (heartRateBpm == null) "none" else "bluetooth", heartRateBpm != null),
            Vibration(vibrationRmsMs2, vibrationPeakMs2, when { vibrationRmsMs2 >= 7.0 -> "high"; vibrationRmsMs2 >= 3.0 -> "medium"; else -> "low" }),
            Recording(recording, timestampMs.coerceAtLeast(0.0)),
        )
    }
}

data class OverlayConfiguration(
    val version: String = "1.1.0",
    val designWidth: Double = 1920.0,
    val designHeight: Double = 1080.0,
    val portraitDesignWidth: Double = 1080.0,
    val portraitDesignHeight: Double = 1920.0,
    val layouts: Map<String, Map<String, List<Double>>> = mapOf(
        "landscape" to mapOf(
            "pulse" to listOf(.020, .618, .292, .315), "gDial" to listOf(.417, .481, .167, .296),
            "gValues" to listOf(.330, .834, .344, .110), "speed" to listOf(.704, .608, .277, .330),
            "vibration" to listOf(.801, .061, .185, .240), "dynamics" to listOf(.020, .055, .260, .185),
        ),
        "portrait" to mapOf(
            "vibration" to listOf(.055, .045, .410, .145), "dynamics" to listOf(.535, .045, .410, .145),
            "gDial" to listOf(.250, .255, .500, .280), "gValues" to listOf(.070, .550, .860, .105),
            "pulse" to listOf(.055, .700, .410, .245), "speed" to listOf(.535, .700, .410, .245),
        ),
    ),
)
