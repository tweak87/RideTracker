package de.ridetracker.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CorePluginHostTest {
    @Test
    fun registersBuiltinsAndFiltersCapabilities() {
        val host = CorePluginHost()
        host.registerBuiltins()

        assertEquals(5, host.list().size)
        assertTrue(host.list(PluginCapability.HEART_RATE_BPM).any { it.id == "ble-heart-rate" })
        assertTrue(host.list(PluginCapability.CAMERA_RECORDING).any { it.id == "camera-source" })
        assertTrue(host.list(PluginCapability.LOCATION_SPEED).any { it.id == "external-gnss" })
        assertTrue(host.list(PluginCapability.MOTION_ACCELERATION).any { it.id == "external-imu" })
    }

    @Test(expected = IllegalStateException::class)
    fun duplicatePluginIdsAreRejected() {
        val host = CorePluginHost()
        val plugin = CorePluginDefinition("test", "Test", capabilities = setOf(PluginCapability.HUD_WIDGET_SOURCE))
        host.register(plugin)
        host.register(plugin)
    }
}
