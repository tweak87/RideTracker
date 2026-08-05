package de.ridetracker.engine

import android.location.Location
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

data class Vector3(val x: Double, val y: Double, val z: Double)
data class SeatCalibration(val up: Vector3, val lateral: Vector3, val forward: Vector3, val source: String)
data class MotionInput(val t: Double, val x: Double, val y: Double, val z: Double)
data class MotionOutput(
    val t: Double,
    val normalG: Double,
    val lateralG: Double,
    val longitudinalG: Double,
    val totalG: Double,
    val positiveGAverage: Double?,
    val airtime: Boolean
)
data class LocationInput(
    val t: Double,
    val latitude: Double,
    val longitude: Double,
    val accuracy: Double,
    val speed: Double?
)
data class LocationResult(val accepted: Boolean, val reason: String? = null, val segmentDistanceM: Double = 0.0, val totalDistanceM: Double = 0.0)

class RideEngine {
    var calibration: SeatCalibration? = null
    var distanceM: Double = 0.0
        private set
    var acceptedLocations: Int = 0
        private set
    var rejectedLocations: Int = 0
        private set

    private var lastLocation: LocationInput? = null
    private var positiveGSum = 0.0
    private var positiveGCount = 0

    private val positiveGThreshold = 1.0
    private val airtimeThreshold = 0.3
    private val maxAccuracyM = 40.0
    private val stationarySpeedMs = 0.8
    private val minimumMovementM = 1.5
    private val maxImpliedSpeedMs = 90.0

    fun reset() {
        distanceM = 0.0
        acceptedLocations = 0
        rejectedLocations = 0
        lastLocation = null
        positiveGSum = 0.0
        positiveGCount = 0
    }

    fun processMotion(input: MotionInput): MotionOutput {
        val vector = Vector3(input.x, input.y, input.z)
        val normal = calibration?.let { dot(vector, it.up) } ?: input.z
        val lateral = calibration?.let { dot(vector, it.lateral) } ?: input.x
        val longitudinal = calibration?.let { dot(vector, it.forward) } ?: input.y
        val total = sqrt(normal * normal + lateral * lateral + longitudinal * longitudinal)

        if (normal > positiveGThreshold) {
            positiveGSum += normal
            positiveGCount += 1
        }

        return MotionOutput(
            t = input.t,
            normalG = normal,
            lateralG = lateral,
            longitudinalG = longitudinal,
            totalG = total,
            positiveGAverage = if (positiveGCount > 0) positiveGSum / positiveGCount else null,
            airtime = normal < airtimeThreshold
        )
    }

    fun processLocation(point: LocationInput): LocationResult {
        if (!point.accuracy.isFinite() || point.accuracy > maxAccuracyM) {
            rejectedLocations += 1
            return LocationResult(false, "accuracy")
        }
        val previous = lastLocation
        if (previous == null) {
            lastLocation = point
            acceptedLocations += 1
            return LocationResult(true)
        }

        val dt = max(0.001, point.t - previous.t)
        val distance = haversine(previous, point)
        val impliedSpeed = distance / dt
        val reportedSpeed = point.speed?.coerceAtLeast(0.0)
        val uncertainty = max(point.accuracy, previous.accuracy) * 0.55
        val stationary = reportedSpeed != null && reportedSpeed < stationarySpeedMs && distance <= uncertainty
        val tooSmall = distance < minimumMovementM && dt < 2.0
        val impossible = impliedSpeed > maxImpliedSpeedMs

        if (stationary || tooSmall || impossible) {
            rejectedLocations += 1
            return LocationResult(false, if (stationary) "stationary" else if (tooSmall) "minimum-movement" else "implied-speed")
        }

        distanceM += distance
        lastLocation = point
        acceptedLocations += 1
        return LocationResult(true, segmentDistanceM = distance, totalDistanceM = distanceM)
    }

    private fun dot(a: Vector3, b: Vector3) = a.x * b.x + a.y * b.y + a.z * b.z

    private fun haversine(a: LocationInput, b: LocationInput): Double {
        val result = FloatArray(1)
        Location.distanceBetween(a.latitude, a.longitude, b.latitude, b.longitude, result)
        return result[0].toDouble()
    }
}
