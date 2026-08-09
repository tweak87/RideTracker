package de.ridetracker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

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
}
