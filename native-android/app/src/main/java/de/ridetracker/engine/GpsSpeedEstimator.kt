package de.ridetracker.engine

import kotlin.math.*

data class GpsObservation(
    val timestampMs: Long,
    val latitude: Double,
    val longitude: Double,
    val accuracyM: Double,
    val nativeSpeedMS: Double?,
)

data class GpsSpeedEstimate(
    val speedMS: Double?,
    val speedKmh: Double?,
    val source: String,
    val confidence: Double,
    val stationaryLocked: Boolean,
    val movementEvidence: Double,
    val suppressPosition: Boolean,
)

class GpsSpeedEstimator {
    private val history = ArrayDeque<GpsObservation>()
    private var smoothedSpeedMS: Double? = null
    private var stationaryAnchor: GpsObservation? = null
    private var stationarySamples = 0
    private var stationaryLocked = false
    private var movementEvidence = 0.0
    private var movementHeading: Double? = null
    private var points = 0

    fun reset() {
        history.clear()
        smoothedSpeedMS = null
        stationaryAnchor = null
        stationarySamples = 0
        stationaryLocked = false
        movementEvidence = 0.0
        movementHeading = null
        points = 0
    }

    fun update(point: GpsObservation): GpsSpeedEstimate {
        while (history.isNotEmpty() && point.timestampMs - history.first().timestampMs > 12_000L) history.removeFirst()
        val candidates = history.mapNotNull { previous ->
            val seconds = (point.timestampMs - previous.timestampMs) / 1000.0
            if (seconds !in 0.8..15.0) return@mapNotNull null
            val distance = distanceMeters(previous, point)
            val combinedAccuracy = hypot(previous.accuracyM.coerceAtLeast(0.0), point.accuracyM.coerceAtLeast(0.0))
            val allowance = (combinedAccuracy * 0.10).coerceIn(1.5, 14.0)
            val speed = (distance - allowance).coerceAtLeast(0.0) / seconds
            if (speed > 100.0) return@mapNotNull null
            Candidate(speed, distance, seconds, (distance / max(6.0, combinedAccuracy * 1.2)).coerceIn(0.0, 1.0) * (seconds / 4.0).coerceIn(0.25, 1.0), bearing(previous, point))
        }.sortedByDescending { it.seconds }.take(4)
        val derivedSpeed = median(candidates.map { it.speedMS })
        var confidence = median(candidates.map { it.confidence }) ?: 0.0
        val heading = candidates.maxByOrNull { it.seconds }?.heading
        val native = point.nativeSpeedMS?.takeIf { it.isFinite() && it >= 0.0 }
        val nativeUseful = native != null && native >= 0.45 && native <= 100.0
        val derivedUseful = derivedSpeed != null && derivedSpeed >= 0.45

        if (stationaryAnchor == null) stationaryAnchor = point
        val anchorDistance = distanceMeters(stationaryAnchor!!, point)
        val stationaryRadius = (point.accuracyM * 0.55).coerceIn(4.0, 22.0)
        val nativeStationary = native == null || native <= 0.8
        val insideCluster = anchorDistance <= stationaryRadius
        val movementSpeed = max(if (nativeUseful) native!! else 0.0, if (derivedUseful) derivedSpeed!! else 0.0)
        val courseConsistent = heading != null && (movementHeading == null || headingDelta(movementHeading!!, heading) <= 70.0)

        if (nativeStationary && insideCluster) {
            stationarySamples += 1
            movementEvidence = 0.0
            movementHeading = null
            if (stationarySamples >= 3) stationaryLocked = true
        } else if (movementSpeed >= 1.4) {
            val strongNative = nativeUseful && native!! >= 2.2
            movementEvidence += if (strongNative) 1.0 else if (courseConsistent) 1.0 else 0.35
            if (heading != null) movementHeading = heading
            if (movementEvidence >= 2.0) {
                stationaryLocked = false
                stationarySamples = 0
                stationaryAnchor = point
                if (smoothedSpeedMS == 0.0) smoothedSpeedMS = null
            }
        } else {
            movementEvidence = (movementEvidence - 0.5).coerceAtLeast(0.0)
            if (!stationaryLocked) {
                stationaryAnchor = point
                stationarySamples = 0
            }
        }

        var rawSpeed: Double? = null
        var source = "unavailable"
        if (nativeUseful) {
            rawSpeed = if (derivedUseful && abs(native!! - derivedSpeed!!) <= max(4.0, native * 0.5)) native * 0.75 + derivedSpeed * 0.25 else native
            source = if (derivedUseful) "native+derived" else "native"
        } else if (derivedUseful) {
            rawSpeed = derivedSpeed
            source = if (confidence < 0.25) "derived-low-confidence" else "derived"
        } else if (native != null && native < 0.45 && point.accuracyM <= 25.0) {
            rawSpeed = 0.0
            source = "native"
        } else if (derivedSpeed != null) {
            rawSpeed = derivedSpeed.coerceAtLeast(0.0)
            source = "derived"
        }

        val movementConfirmed = movementEvidence >= 2.0
        val suppress = points > 0 && (stationaryLocked || (!movementConfirmed && stationarySamples > 0 && rawSpeed != null && rawSpeed >= 0.45 && !nativeUseful && (confidence < 0.25 || point.accuracyM > 5.0)))
        if (suppress) {
            rawSpeed = 0.0
            source = if (stationaryLocked) "stationary-lock" else "stationary-candidate"
            confidence = max(confidence, if (insideCluster) 0.9 else 0.55)
            if (stationaryLocked) smoothedSpeedMS = 0.0
        }

        if (rawSpeed != null) {
            val previous = smoothedSpeedMS
            val alpha = if (previous == null || rawSpeed > previous) 0.58 else 0.36
            smoothedSpeedMS = if (previous == null) rawSpeed else previous + (rawSpeed - previous) * alpha
            if ((smoothedSpeedMS ?: 0.0) < 0.3) smoothedSpeedMS = 0.0
        }

        history.addLast(point)
        points += 1
        return GpsSpeedEstimate(smoothedSpeedMS, smoothedSpeedMS?.times(3.6), source, confidence.coerceIn(0.0, 1.0), stationaryLocked, movementEvidence, suppress)
    }

    private data class Candidate(val speedMS: Double, val distanceM: Double, val seconds: Double, val confidence: Double, val heading: Double)

    private fun median(values: List<Double>): Double? {
        if (values.isEmpty()) return null
        val sorted = values.sorted()
        val middle = sorted.size / 2
        return if (sorted.size % 2 == 1) sorted[middle] else (sorted[middle - 1] + sorted[middle]) / 2.0
    }

    private fun distanceMeters(a: GpsObservation, b: GpsObservation): Double {
        val radius = 6_371_000.0
        val latitudeA = Math.toRadians(a.latitude)
        val latitudeB = Math.toRadians(b.latitude)
        val latitudeDelta = Math.toRadians(b.latitude - a.latitude)
        val longitudeDelta = Math.toRadians(b.longitude - a.longitude)
        val value = sin(latitudeDelta / 2).pow(2) + cos(latitudeA) * cos(latitudeB) * sin(longitudeDelta / 2).pow(2)
        return 2 * radius * asin(sqrt(value.coerceIn(0.0, 1.0)))
    }

    private fun bearing(a: GpsObservation, b: GpsObservation): Double {
        val latitudeA = Math.toRadians(a.latitude)
        val latitudeB = Math.toRadians(b.latitude)
        val longitudeDelta = Math.toRadians(b.longitude - a.longitude)
        val y = sin(longitudeDelta) * cos(latitudeB)
        val x = cos(latitudeA) * sin(latitudeB) - sin(latitudeA) * cos(latitudeB) * cos(longitudeDelta)
        return (Math.toDegrees(atan2(y, x)) + 360.0) % 360.0
    }

    private fun headingDelta(a: Double, b: Double) = abs(((b - a + 540.0) % 360.0) - 180.0)
}
