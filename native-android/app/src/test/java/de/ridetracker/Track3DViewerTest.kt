package de.ridetracker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import de.ridetracker.session.RideSessionSample

class Track3DViewerTest {
    @Test
    fun `coaster model interpolates corners without losing endpoints or telemetry`() {
        val points = listOf(
            point(0, 0.0, 0.0, 0.0, 10.0),
            point(1, 10.0, 0.0, 0.0, 20.0),
            point(2, 10.0, 5.0, 10.0, 30.0),
            point(3, 20.0, 0.0, 20.0, 40.0),
        )

        val smoothed = smoothAndroidTrackPoints(points, samplesPerSegment = 6)

        assertTrue(smoothed.size > points.size)
        assertEquals(points.first().x, smoothed.first().x, 0.0001)
        assertEquals(points.last().z, smoothed.last().z, 0.0001)
        assertEquals(points.last().speedKmh, smoothed.last().speedKmh, 0.0001)
        assertTrue(smoothed.zipWithNext().all { (a, b) -> b.distanceM >= a.distanceM })
        assertTrue(smoothed.all { it.x.isFinite() && it.y.isFinite() && it.z.isFinite() })
    }

    @Test
    fun `unsaved sensor samples create the same spatial model before persistence`() {
        val samples = listOf(
            sessionSample(0.0, 52.00000, 8.00000, 10.0),
            sessionSample(1.0, 52.00010, 8.00010, 20.0),
            sessionSample(2.0, 52.00020, 8.00020, 30.0),
        )

        val points = deriveAndroidTrackPoints(samples)

        assertEquals(3, points.size)
        assertEquals(0.0, points.first().x, 0.0001)
        assertEquals(30.0, points.last().speedKmh, 0.0001)
        assertTrue(points.last().distanceM > 20.0)
    }

    private fun point(index: Int, x: Double, y: Double, z: Double, speed: Double) = AndroidTrackPoint(
        index = index,
        timestamp = index.toDouble(),
        x = x,
        y = y,
        z = z,
        distanceM = 0.0,
        speedKmh = speed,
        normalG = 1.0,
        lateralG = 0.1 * index,
        longitudinalG = 0.0,
        totalG = 1.0,
        confidence = 1.0,
    )

    private fun sessionSample(timestamp: Double, latitude: Double, longitude: Double, speedKmh: Double) = RideSessionSample(
        timestamp = timestamp,
        normalG = 1.0,
        lateralG = .2,
        longitudinalG = .1,
        totalG = 1.03,
        relativeAltitudeM = timestamp,
        speedMS = speedKmh / 3.6,
        latitude = latitude,
        longitude = longitude,
        horizontalAccuracyM = 4.0,
        phase = "ride",
        qualityScore = 90,
    )
}
