package de.ridetracker.engine

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class AltitudeFusion(
    private val barometerAlpha: Double = 0.18,
    private val gpsCorrectionAlpha: Double = 0.005,
) {
    var relativeAltitudeM: Double? = null
        private set
    private var barometerZero: Double? = null
    private var gpsBias = 0.0

    fun reset() {
        relativeAltitudeM = null
        barometerZero = null
        gpsBias = 0.0
    }

    fun updateBarometer(altitude: Double): Double {
        if (barometerZero == null) barometerZero = altitude
        val value = altitude - (barometerZero ?: altitude) + gpsBias
        relativeAltitudeM = relativeAltitudeM?.let { it + barometerAlpha * (value - it) } ?: value
        return relativeAltitudeM ?: 0.0
    }

    fun correctWithGps(relativeAltitude: Double) {
        relativeAltitudeM?.let { gpsBias += gpsCorrectionAlpha * (relativeAltitude - it) }
    }
}

class RidePhaseDetector {
    var phase: String = "idle"
        private set
    val events = mutableListOf<Pair<Double, String>>()
    private var stationarySince: Double? = null

    fun update(
        t: Double,
        speedMs: Double,
        longitudinalG: Double,
        climbRateMs: Double,
        totalG: Double,
    ): String {
        var next = phase
        when {
            longitudinalG >= 0.35 && speedMs > 2 -> next = "launch"
            climbRateMs >= 0.25 && speedMs <= 8 -> next = "lift"
            longitudinalG <= -0.3 && speedMs > 2 -> next = "brake"
            speedMs > 0.8 || abs(totalG - 1) > 0.18 -> next = "ride"
            else -> {
                if (stationarySince == null) stationarySince = t
                if (t - (stationarySince ?: t) >= 4) {
                    next = if (phase == "idle") "ready" else "station"
                }
            }
        }
        if (speedMs > 0.8) stationarySince = null
        if (next != phase) {
            phase = next
            events += t to next
        }
        return phase
    }
}

object QualityScore {
    fun calculate(
        motionSamples: Int,
        gpsAccepted: Int,
        gpsRejected: Int,
        gaps: Int,
        calibrated: Boolean,
        hasBarometer: Boolean,
        horizontalAccuracyM: Double? = null,
        satellitesUsedInFix: Int? = null,
    ): Int {
        val totalGps = gpsAccepted + gpsRejected
        val gpsRatio = if (totalGps > 0) gpsAccepted.toDouble() / totalGps else 0.0
        val motion = min(1.0, motionSamples / 500.0)
        val penalty = min(0.3, gaps * 0.02)
        val calibrationScore = if (calibrated) 1.0 else 0.0
        val barometerScore = if (hasBarometer) 1.0 else 0.0
        val accuracyScore = horizontalAccuracyM?.takeIf { it.isFinite() }
            ?.let { ((50.0 - it.coerceIn(3.0, 50.0)) / 47.0).coerceIn(0.0, 1.0) }
            ?: 0.0
        val satelliteScore = satellitesUsedInFix?.let { (it / 10.0).coerceIn(0.0, 1.0) } ?: 0.0
        val gnssSignalScore = accuracyScore * 0.72 + satelliteScore * 0.28
        val raw = 100.0 * (
            0.25 * motion +
                0.20 * gpsRatio +
                0.15 * gnssSignalScore +
                0.20 * calibrationScore +
                0.05 * barometerScore +
                0.15
            ) - 100.0 * penalty
        return max(0, min(100, raw.roundToInt()))
    }
}

interface SensorSource {
    val id: String
    val capabilities: Set<String>
    fun start()
    fun stop()
}
