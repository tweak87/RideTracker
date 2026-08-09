package de.ridetracker.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GpsSpeedEstimatorTest {
    @Test fun isolatedStationaryJumpIsSuppressed() {
        val estimator = GpsSpeedEstimator()
        val offsets = listOf(0.0, 0.000004, -0.000003, 0.00009, 0.000002, -0.000004, 0.000003)
        val results = offsets.mapIndexed { index, offset ->
            estimator.update(GpsObservation(1_000L + index * 1_000L, 50.0 + offset, 8.0, 8.0, if (index == 0) null else 0.0))
        }
        assertTrue(results.drop(2).all { (it.speedMS ?: 0.0) == 0.0 })
        assertTrue(results.last().stationaryLocked)
    }

    @Test fun twoConsistentFixesReleaseARealLaunch() {
        val estimator = GpsSpeedEstimator()
        repeat(4) { index -> estimator.update(GpsObservation(1_000L + index * 1_000L, 50.0, 8.0, 3.0, 0.0)) }
        estimator.update(GpsObservation(5_000L, 50.00005, 8.0, 3.0, 6.0))
        val launch = estimator.update(GpsObservation(6_000L, 50.00014, 8.0, 3.0, 10.0))
        assertTrue((launch.speedMS ?: 0.0) > 3.0)
        assertEquals(false, launch.stationaryLocked)
    }

    @Test fun walkingAwayFromAStationaryClusterProducesDistanceAndSpeed() {
        val estimator = GpsSpeedEstimator()
        repeat(4) { index -> estimator.update(GpsObservation(1_000L + index * 1_000L, 50.0, 8.0, 4.0, 0.0)) }

        val walking = (1..5).map { step ->
            estimator.update(
                GpsObservation(
                    timestampMs = 4_000L + step * 1_000L,
                    latitude = 50.0 + step * 0.000012,
                    longitude = 8.0,
                    accuracyM = 4.0,
                    nativeSpeedMS = null,
                ),
            )
        }

        assertTrue(walking.drop(1).any { !it.suppressPosition })
        assertTrue((walking.last().speedKmh ?: 0.0) > 2.0)
        assertEquals(false, walking.last().stationaryLocked)
    }
}
