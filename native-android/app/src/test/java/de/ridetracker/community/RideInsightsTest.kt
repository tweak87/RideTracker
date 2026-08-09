package de.ridetracker.community

import de.ridetracker.session.RideSessionSample
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RideInsightsTest {
    private fun sample(t: Double, speedKmh: Double, normal: Double, lateral: Double, longitudinal: Double, quality: Int) =
        RideSessionSample(t, normal, lateral, longitudinal, 1.0, null, speedKmh / 3.6, null, null, null, "ride", quality)

    @Test
    fun `metrics preserve peak directions and quality`() {
        val metrics = calculateRideMetrics(
            listOf(
                sample(0.0, 0.0, 1.0, 0.0, 0.0, 80),
                sample(2.0, 72.0, 2.4, -1.3, 0.6, 90),
                sample(4.0, 45.0, -0.4, 0.8, -1.1, 100),
            ),
        )
        assertEquals(72.0, metrics.maxSpeedKmh, 0.001)
        assertEquals(2.4, metrics.maxNormalG, 0.001)
        assertEquals(-0.4, metrics.minNormalG, 0.001)
        assertEquals(1.3, metrics.maxLateralG, 0.001)
        assertEquals(1.1, metrics.maxLongitudinalG, 0.001)
        assertEquals(90, metrics.qualityScore)
    }

    @Test
    fun `history exposes best and average separately`() {
        val history = aggregateRideHistory(
            listOf(
                RideMetrics(maxSpeedKmh = 80.0, maxLateralG = 1.0, durationSeconds = 60.0),
                RideMetrics(maxSpeedKmh = 100.0, maxLateralG = 1.4, durationSeconds = 55.0),
            ),
        )
        assertEquals(2, history.rideCount)
        assertEquals(100.0, history.personalBest?.maxSpeedKmh ?: 0.0, 0.001)
        assertEquals(90.0, history.personalAverage?.maxSpeedKmh ?: 0.0, 0.001)
        assertEquals(55.0, history.personalBest?.durationSeconds ?: 0.0, 0.001)
    }

    @Test
    fun `difference stays unavailable for missing or zero reference`() {
        assertNull(normalizedDifference(10.0, null))
        assertNull(normalizedDifference(10.0, 0.0))
        assertEquals(0.25, normalizedDifference(100.0, 80.0) ?: 0.0, 0.001)
    }
}
