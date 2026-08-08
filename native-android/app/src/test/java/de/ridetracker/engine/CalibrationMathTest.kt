package de.ridetracker.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import kotlin.math.sqrt

class CalibrationMathTest {
    @Test
    fun rejectsInsufficientSamples() {
        val result = CalibrationMath.build(List(10) { Vector3(0.0, 0.0, 1.0) }, ForwardEdge.TOP)
        assertNull(result)
    }

    @Test
    fun createsOrthonormalSeatAxes() {
        val samples = List(100) { Vector3(0.01, -0.02, 0.999) }
        val calibration = CalibrationMath.build(samples, ForwardEdge.TOP)
        assertNotNull(calibration)
        calibration!!

        assertEquals(1.0, length(calibration.up), 1e-6)
        assertEquals(1.0, length(calibration.lateral), 1e-6)
        assertEquals(1.0, length(calibration.forward), 1e-6)
        assertEquals(0.0, dot(calibration.up, calibration.lateral), 1e-6)
        assertEquals(0.0, dot(calibration.up, calibration.forward), 1e-6)
        assertEquals(0.0, dot(calibration.lateral, calibration.forward), 1e-6)
    }

    @Test
    fun calibratedMotionMapsGravityToNormalAxis() {
        val engine = RideEngine()
        engine.calibration = CalibrationMath.build(
            List(100) { Vector3(0.0, 0.0, 1.0) },
            ForwardEdge.TOP,
        )

        val output = engine.processMotion(MotionInput(0.0, 0.0, 0.0, 1.0))
        assertEquals(1.0, output.normalG, 1e-6)
        assertEquals(0.0, output.lateralG, 1e-6)
        assertEquals(0.0, output.longitudinalG, 1e-6)
        assertEquals(1.0, output.totalG, 1e-6)
    }

    @Test
    fun exposesHorizontalResultantAndLateralMetersPerSecondSquared() {
        val output = RideEngine().processMotion(MotionInput(0.0, 0.3, 0.4, 1.0))
        assertEquals(0.5, output.horizontalG, 1e-6)
        assertEquals(2.941995, output.lateralMS2, 1e-6)
    }

    private fun dot(a: Vector3, b: Vector3) = a.x * b.x + a.y * b.y + a.z * b.z
    private fun length(v: Vector3) = sqrt(dot(v, v))
}
