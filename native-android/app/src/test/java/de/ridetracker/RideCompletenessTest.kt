package de.ridetracker

import de.ridetracker.session.RideSessionSample
import org.junit.Assert.assertTrue
import org.junit.Test

class RideCompletenessTest {
    @Test
    fun `twenty metre walk is complete for route and speed even with native zero`() {
        val samples = listOf(
            sample(0.0, 52.00000, 8.00000),
            sample(8.0, 52.00018, 8.00000),
        )

        val report = buildRideCompleteness(
            samples = samples,
            recordedDistanceMeters = 0.0,
            calibrated = true,
            rideContext = null,
            hasVideo = false,
            videoHudEmbedded = false,
        )

        assertTrue(report.criteria.first { it.title == "GPS-Strecke" }.complete)
        assertTrue(report.criteria.first { it.title == "Geschwindigkeit" }.complete)
        assertTrue(report.criteria.first { it.title == "GNSS-Qualität" }.complete)
    }

    private fun sample(timestamp: Double, latitude: Double, longitude: Double) = RideSessionSample(
        timestamp = timestamp,
        normalG = 1.0,
        lateralG = 0.0,
        longitudinalG = 0.0,
        totalG = 1.0,
        relativeAltitudeM = timestamp,
        speedMS = 0.0,
        latitude = latitude,
        longitude = longitude,
        horizontalAccuracyM = 4.0,
        phase = "ride",
        qualityScore = 90,
        satellitesVisible = 12,
        satellitesUsedInFix = 8,
    )
}
