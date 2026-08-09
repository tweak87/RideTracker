package de.ridetracker

import de.ridetracker.session.RideSessionSample
import org.junit.Assert.assertEquals
import org.junit.Test

class AndroidRideVideoPreviewTest {
    private val samples = (0..80).map { index ->
        RideSessionSample(
            timestamp = index / 10.0,
            normalG = 1.0,
            lateralG = 0.0,
            longitudinalG = 0.0,
            totalG = 1.0,
            relativeAltitudeM = null,
            speedMS = index.toDouble(),
            latitude = null,
            longitude = null,
            horizontalAccuracyM = null,
            phase = "ride",
            qualityScore = 80,
        )
    }

    @Test
    fun `video position selects nearest synchronized sensor sample`() {
        assertEquals(24, telemetrySampleIndexAt(samples, 2.41))
        assertEquals(25, telemetrySampleIndexAt(samples, 2.46))
    }

    @Test
    fun `replay trail contains only the previous three seconds`() {
        val trail = telemetryTrailAt(samples, 6.0)

        assertEquals(3.0, trail.first().timestamp, 0.0001)
        assertEquals(6.0, trail.last().timestamp, 0.0001)
        assertEquals(31, trail.size)
    }
}
