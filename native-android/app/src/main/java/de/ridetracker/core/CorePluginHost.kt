package de.ridetracker.core

enum class PluginCapability(val id: String) {
    MOTION_ACCELERATION("motion.acceleration"),
    MOTION_GYROSCOPE("motion.gyroscope"),
    MOTION_ORIENTATION("motion.orientation"),
    LOCATION_POSITION("location.position"),
    LOCATION_SPEED("location.speed"),
    LOCATION_ALTITUDE("location.altitude"),
    HEART_RATE_BPM("heart-rate.bpm"),
    CAMERA_PREVIEW("camera.preview"),
    CAMERA_RECORDING("camera.recording"),
    AUDIO_MICROPHONE("audio.microphone"),
    VIDEO_IMPORT("video.import"),
    VIDEO_EXPORT("video.export"),
    TELEMETRY_IMPORT("telemetry.import"),
    TELEMETRY_EXPORT("telemetry.export"),
    DEVICE_DISCOVERY("device.discovery"),
    DEVICE_CONNECTION("device.connection"),
    CALIBRATION_MOTION("calibration.motion"),
    CALIBRATION_LOCATION("calibration.location"),
    CALIBRATION_CAMERA("calibration.camera"),
    HUD_WIDGET_SOURCE("hud.widget-source"),
}

data class CorePluginDefinition(
    val id: String,
    val name: String,
    val version: String = "1.0.0",
    val capabilities: Set<PluginCapability>,
)

class CorePluginHost {
    private val plugins = linkedMapOf<String, CorePluginDefinition>()

    fun register(plugin: CorePluginDefinition): CorePluginDefinition {
        require(plugin.id.isNotBlank()) { "plugin.id is required" }
        require(plugin.capabilities.isNotEmpty()) { "plugin.capabilities are required" }
        check(!plugins.containsKey(plugin.id)) { "plugin already registered: ${plugin.id}" }
        plugins[plugin.id] = plugin
        return plugin
    }

    fun get(id: String): CorePluginDefinition? = plugins[id]

    fun list(capability: PluginCapability? = null): List<CorePluginDefinition> = plugins.values
        .filter { capability == null || capability in it.capabilities }

    fun clear() = plugins.clear()

    fun registerBuiltins() {
        if (plugins.isNotEmpty()) return
        register(CorePluginDefinition(
            id = "internal-sensors",
            name = "Interne Smartphone-Sensoren",
            capabilities = setOf(
                PluginCapability.MOTION_ACCELERATION,
                PluginCapability.MOTION_GYROSCOPE,
                PluginCapability.MOTION_ORIENTATION,
                PluginCapability.LOCATION_POSITION,
                PluginCapability.LOCATION_SPEED,
                PluginCapability.LOCATION_ALTITUDE,
                PluginCapability.CALIBRATION_MOTION,
                PluginCapability.CALIBRATION_LOCATION,
                PluginCapability.HUD_WIDGET_SOURCE,
            ),
        ))
        register(CorePluginDefinition(
            id = "ble-heart-rate",
            name = "Bluetooth Herzfrequenz",
            capabilities = setOf(
                PluginCapability.HEART_RATE_BPM,
                PluginCapability.DEVICE_DISCOVERY,
                PluginCapability.DEVICE_CONNECTION,
                PluginCapability.HUD_WIDGET_SOURCE,
            ),
        ))
        register(CorePluginDefinition(
            id = "external-imu",
            name = "Externe IMU",
            capabilities = setOf(
                PluginCapability.MOTION_ACCELERATION,
                PluginCapability.MOTION_GYROSCOPE,
                PluginCapability.MOTION_ORIENTATION,
                PluginCapability.DEVICE_DISCOVERY,
                PluginCapability.DEVICE_CONNECTION,
                PluginCapability.CALIBRATION_MOTION,
                PluginCapability.HUD_WIDGET_SOURCE,
            ),
        ))
        register(CorePluginDefinition(
            id = "external-gnss",
            name = "Externer GNSS-Empfänger",
            capabilities = setOf(
                PluginCapability.LOCATION_POSITION,
                PluginCapability.LOCATION_SPEED,
                PluginCapability.LOCATION_ALTITUDE,
                PluginCapability.DEVICE_DISCOVERY,
                PluginCapability.DEVICE_CONNECTION,
                PluginCapability.CALIBRATION_LOCATION,
                PluginCapability.HUD_WIDGET_SOURCE,
            ),
        ))
        register(CorePluginDefinition(
            id = "camera-source",
            name = "Kameraquelle",
            capabilities = setOf(
                PluginCapability.CAMERA_PREVIEW,
                PluginCapability.CAMERA_RECORDING,
                PluginCapability.AUDIO_MICROPHONE,
                PluginCapability.CALIBRATION_CAMERA,
            ),
        ))
    }
}
