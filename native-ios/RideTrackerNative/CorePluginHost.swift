import Foundation

enum PluginCapability: String, CaseIterable, Codable, Hashable {
    case motionAcceleration = "motion.acceleration"
    case motionGyroscope = "motion.gyroscope"
    case motionOrientation = "motion.orientation"
    case locationPosition = "location.position"
    case locationSpeed = "location.speed"
    case locationAltitude = "location.altitude"
    case heartRateBpm = "heart-rate.bpm"
    case cameraPreview = "camera.preview"
    case cameraRecording = "camera.recording"
    case audioMicrophone = "audio.microphone"
    case videoImport = "video.import"
    case videoExport = "video.export"
    case telemetryImport = "telemetry.import"
    case telemetryExport = "telemetry.export"
    case calibrationMotion = "calibration.motion"
    case calibrationLocation = "calibration.location"
    case calibrationCamera = "calibration.camera"
    case hudWidgetSource = "hud.widget-source"
}

struct CorePluginDefinition: Identifiable, Equatable {
    let id: String
    let name: String
    let version: String
    let capabilities: Set<PluginCapability>

    init(id: String, name: String, version: String = "1.0.0", capabilities: Set<PluginCapability>) {
        self.id = id
        self.name = name
        self.version = version
        self.capabilities = capabilities
    }
}

final class CorePluginHost {
    private var plugins: [String: CorePluginDefinition] = [:]

    @discardableResult
    func register(_ plugin: CorePluginDefinition) -> CorePluginDefinition {
        precondition(!plugin.id.isEmpty, "plugin.id is required")
        precondition(!plugin.capabilities.isEmpty, "plugin.capabilities are required")
        precondition(plugins[plugin.id] == nil, "plugin already registered: \(plugin.id)")
        plugins[plugin.id] = plugin
        return plugin
    }

    func plugin(id: String) -> CorePluginDefinition? { plugins[id] }

    func list(capability: PluginCapability? = nil) -> [CorePluginDefinition] {
        plugins.values
            .filter { capability == nil || $0.capabilities.contains(capability!) }
            .sorted { $0.id < $1.id }
    }

    func clear() { plugins.removeAll() }

    func registerBuiltins() {
        guard plugins.isEmpty else { return }
        register(CorePluginDefinition(
            id: "internal-sensors",
            name: "Interne Smartphone-Sensoren",
            capabilities: [
                .motionAcceleration, .motionGyroscope, .motionOrientation,
                .locationPosition, .locationSpeed, .locationAltitude,
                .calibrationMotion, .calibrationLocation, .hudWidgetSource,
            ]
        ))
        register(CorePluginDefinition(
            id: "ble-heart-rate",
            name: "Bluetooth Herzfrequenz",
            capabilities: [.heartRateBpm, .hudWidgetSource]
        ))
        register(CorePluginDefinition(
            id: "external-imu",
            name: "Externe IMU",
            capabilities: [.motionAcceleration, .motionGyroscope, .motionOrientation, .calibrationMotion, .hudWidgetSource]
        ))
        register(CorePluginDefinition(
            id: "external-gnss",
            name: "Externer GNSS-Empfänger",
            capabilities: [.locationPosition, .locationSpeed, .locationAltitude, .calibrationLocation, .hudWidgetSource]
        ))
        register(CorePluginDefinition(
            id: "camera-source",
            name: "Kameraquelle",
            capabilities: [.cameraPreview, .cameraRecording, .audioMicrophone, .calibrationCamera]
        ))
    }
}
