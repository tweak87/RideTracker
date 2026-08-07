package de.ridetracker.core

import de.ridetracker.video.CameraSourceDescriptor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CoreRuntimeManagersTest {
    @Test
    fun deviceManagerUpsertsAndRemovesDevices() {
        val manager = CoreDeviceManager()
        manager.upsert(CoreNativeDeviceSnapshot("phone", "Phone", "internal", true))
        manager.upsert(CoreNativeDeviceSnapshot("phone", "Phone updated", "internal", true))

        assertEquals(1, manager.list().size)
        assertEquals("Phone updated", manager.get("phone")?.name)
        assertTrue(manager.remove("phone"))
        assertFalse(manager.remove("phone"))
        assertNull(manager.get("phone"))
    }

    @Test
    fun sensorManagerKeepsLatestSamplePerChannel() {
        val manager = CoreSensorManager()
        manager.ingest(CoreTelemetrySample(1, "phone", "speed", "speedKmh", 10.0, "km/h", 0.8, "phone/speed"))
        manager.ingest(CoreTelemetrySample(2, "phone", "speed", "speedKmh", 20.0, "km/h", 0.9, "phone/speed"))
        manager.ingest(CoreTelemetrySample(3, "heart", "heartRate", "heartRateBpm", 140.0, "bpm", 1.0, "heart/heartRate"))

        assertEquals(2, manager.snapshot().size)
        assertEquals(20.0, manager.latestFor("phone", "speed")?.value ?: -1.0, 0.0)
        assertEquals(140.0, manager.latestFor("heart", "heartRate")?.value ?: -1.0, 0.0)

        manager.clear()
        assertTrue(manager.snapshot().isEmpty())
    }

    @Test
    fun cameraManagerKeepsValidPrimaryAndFallbackOrder() {
        val manager = CoreCameraManager()
        val back = CameraSourceDescriptor("0", "Back", "back", "internal", true)
        val front = CameraSourceDescriptor("1", "Front", "front", "internal", true)
        manager.sync(
            availableSources = listOf(back, front),
            primaryId = "0",
            fallbackIds = listOf("1", "0", "missing", "1"),
        )

        assertEquals("0", manager.primaryId)
        assertEquals(listOf("1"), manager.fallbackIds)
        assertEquals(listOf("0", "1"), manager.ordered().map { it.id })
        assertEquals(listOf("0", "1"), manager.snapshot().sources.map { it.id })
    }

    @Test
    fun recordingManagerOwnsLifecycleState() {
        val manager = CoreRecordingManager()
        val started = manager.start("ride-1", 100L)

        assertTrue(manager.active)
        assertEquals("ride-1", started.sessionId)
        assertEquals(100L, manager.session?.startedAtMs)

        val stopped = manager.stop(250L)
        assertFalse(manager.active)
        assertEquals(250L, stopped?.endedAtMs)

        manager.reset()
        assertNull(manager.session)
    }
}
