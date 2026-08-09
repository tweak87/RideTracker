package de.ridetracker.community

import android.content.Context
import de.ridetracker.session.LocalProfileStore
import de.ridetracker.session.RideSessionSample
import de.ridetracker.session.rideSessionSamplesFromJson
import de.ridetracker.session.deriveGpsMotion
import org.json.JSONObject
import kotlin.math.abs

data class RideMetrics(
    val maxSpeedKmh: Double = 0.0,
    val maxNormalG: Double = 1.0,
    val minNormalG: Double = 1.0,
    val maxLateralG: Double = 0.0,
    val maxLongitudinalG: Double = 0.0,
    val durationSeconds: Double = 0.0,
    val qualityScore: Int = 0,
    val sampleCount: Int = 0,
)

data class RideHistory(
    val rideCount: Int = 0,
    val personalBest: RideMetrics? = null,
    val personalAverage: RideMetrics? = null,
)

data class MetricComparison(
    val measured: Double,
    val personalBest: Double?,
    val personalAverage: Double?,
    val official: Double?,
)

fun calculateRideMetrics(samples: List<RideSessionSample>): RideMetrics {
    if (samples.isEmpty()) return RideMetrics()
    val gpsFallback = deriveGpsMotion(samples)
    return RideMetrics(
        maxSpeedKmh = maxOf(samples.maxOf { it.speedMS * 3.6 }, gpsFallback.maxSpeedMS * 3.6),
        maxNormalG = samples.maxOf { it.normalG },
        minNormalG = samples.minOf { it.normalG },
        maxLateralG = samples.maxOf { abs(it.lateralG) },
        maxLongitudinalG = samples.maxOf { abs(it.longitudinalG) },
        durationSeconds = samples.maxOf { it.timestamp },
        qualityScore = samples.map { it.qualityScore }.average().toInt().coerceIn(0, 100),
        sampleCount = samples.size,
    )
}

fun aggregateRideHistory(rides: List<RideMetrics>): RideHistory {
    if (rides.isEmpty()) return RideHistory()
    fun average(selector: (RideMetrics) -> Double) = rides.map(selector).average()
    val best = RideMetrics(
        maxSpeedKmh = rides.maxOf { it.maxSpeedKmh },
        maxNormalG = rides.maxOf { it.maxNormalG },
        minNormalG = rides.minOf { it.minNormalG },
        maxLateralG = rides.maxOf { it.maxLateralG },
        maxLongitudinalG = rides.maxOf { it.maxLongitudinalG },
        durationSeconds = rides.minOf { it.durationSeconds },
        qualityScore = rides.maxOf { it.qualityScore },
        sampleCount = rides.maxOf { it.sampleCount },
    )
    val mean = RideMetrics(
        maxSpeedKmh = average { it.maxSpeedKmh },
        maxNormalG = average { it.maxNormalG },
        minNormalG = average { it.minNormalG },
        maxLateralG = average { it.maxLateralG },
        maxLongitudinalG = average { it.maxLongitudinalG },
        durationSeconds = average { it.durationSeconds },
        qualityScore = rides.map { it.qualityScore }.average().toInt(),
        sampleCount = rides.map { it.sampleCount }.average().toInt(),
    )
    return RideHistory(rides.size, best, mean)
}

fun normalizedDifference(measured: Double, reference: Double?): Double? =
    reference?.takeIf { abs(it) > 1e-9 }?.let { ((measured - it) / abs(it)).coerceIn(-2.0, 2.0) }

fun loadRideHistory(
    context: Context,
    attractionId: String?,
    attractionName: String?,
    parkName: String?,
    excludeSessionId: String? = null,
): RideHistory {
    val activeProfile = LocalProfileStore.current(context).id
    val rides = context.filesDir.listFiles { file -> file.name.endsWith(".ride.json") }.orEmpty().mapNotNull { file ->
        runCatching {
            val root = JSONObject(file.readText())
            if (root.optString("id") == excludeSessionId) return@runCatching null
            if (root.optJSONObject("owner")?.optString("profileID", activeProfile) != activeProfile) return@runCatching null
            val rideContext = root.optJSONObject("context")
            val sameRide = when {
                !attractionId.isNullOrBlank() -> rideContext?.optString("rideID") == attractionId
                !attractionName.isNullOrBlank() -> rideContext?.optString("rideName").equals(attractionName, true) &&
                    (parkName.isNullOrBlank() || rideContext?.optString("parkName").equals(parkName, true))
                else -> false
            }
            if (!sameRide) null else calculateRideMetrics(rideSessionSamplesFromJson(root))
        }.getOrNull()
    }
    return aggregateRideHistory(rides)
}
