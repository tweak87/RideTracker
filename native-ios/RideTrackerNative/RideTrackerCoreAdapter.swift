import Foundation
import SwiftUI

struct CoreTelemetrySample: Codable, Hashable {
    let timestampMs: Double
    let deviceID: String
    let channelID: String
    let metric: String
    let value: Double
    let unit: String?
    let quality: Double
    let sourceID: String
}

struct CoreRuntimeEvent: Codable, Hashable {
    let type: String
    let timestampMs: Double
    let sessionID: String?
    let metric: String?
    let sourceID: String?
}

struct CoreNativeDeviceSnapshot: Codable, Hashable {
    let id: String
    let name: String
    let type: String
    let enabled: Bool
}

struct CoreNativeSourceRoutingSnapshot: Codable, Hashable {
    let metric: String
    let primarySource: String
    let fallbackSources: [String]
    let minimumQuality: Double
    let maxAgeMs: Int
    let interpolation: String
    let widgetId: String?
}

struct CoreNativeCameraSnapshot: Codable, Hashable {
    let primaryId: String?
    let fallbackIds: [String]
    let sources: [CameraSourceDescriptor]
}

struct CoreNativeHUDElementSnapshot: Codable, Hashable {
    let id: String
    let x: Double
    let y: Double
    let width: Double
    let height: Double
    let scale: Double
    let opacity: Double
    let visible: Bool
}

struct CoreNativeHUDProfileSnapshot: Codable, Hashable {
    let elements: [CoreNativeHUDElementSnapshot]
}

struct CoreNativeHUDSnapshot: Codable, Hashable {
    let version: String
    let activeProfile: String?
    let profiles: [String: CoreNativeHUDProfileSnapshot]
    let watermark: String?
}

struct CoreNativeCalibrationSnapshot: Codable, Hashable {
    let mode: String
    let forwardEdge: String
    let deviceCalibration: String?
}

struct CoreNativeConfigurationSnapshot: Codable, Hashable {
    let schemaVersion: String
    let coreVersion: String
    let capturedAt: Date
    let platform: String
    let devices: [CoreNativeDeviceSnapshot]
    let sourceRouting: [CoreNativeSourceRoutingSnapshot]
    let camera: CoreNativeCameraSnapshot
    let hud: CoreNativeHUDSnapshot
    let calibration: CoreNativeCalibrationSnapshot
}

@MainActor
final class RideTrackerCoreAdapter: ObservableObject {
    static let coreVersion = "2.0.0-alpha.1"
    static let snapshotSchemaVersion = "1.0.0"

    @Published private(set) var latestTelemetry: [String: CoreTelemetrySample] = [:]
    @Published private(set) var events: [CoreRuntimeEvent] = []
    @Published private(set) var activeSessionID: String?

    func ingest(
        metric: String,
        sourceID: String,
        value: Double,
        unit: String? = nil,
        quality: Double = 1,
        timestamp: TimeInterval = ProcessInfo.processInfo.systemUptime
    ) {
        guard value.isFinite else { return }
        let parts = sourceID.split(separator: "/", maxSplits: 1).map(String.init)
        let deviceID = parts.first ?? "ios-device"
        let channelID = parts.count > 1 ? parts[1] : metric
        let sample = CoreTelemetrySample(
            timestampMs: timestamp * 1000,
            deviceID: deviceID,
            channelID: channelID,
            metric: metric,
            value: value,
            unit: unit,
            quality: min(max(quality, 0), 1),
            sourceID: sourceID
        )
        latestTelemetry["\(deviceID)/\(channelID)"] = sample
    }

    func recordingStarted(sessionID: String, timestamp: TimeInterval = ProcessInfo.processInfo.systemUptime) {
        activeSessionID = sessionID
        appendEvent(type: "recording.started", timestamp: timestamp, sessionID: sessionID)
    }

    func recordingStopped(timestamp: TimeInterval = ProcessInfo.processInfo.systemUptime) {
        appendEvent(type: "recording.stopped", timestamp: timestamp, sessionID: activeSessionID)
        activeSessionID = nil
    }

    func sourceSwitched(metric: String, sourceID: String?, timestamp: TimeInterval = ProcessInfo.processInfo.systemUptime) {
        appendEvent(type: "source.switched", timestamp: timestamp, metric: metric, sourceID: sourceID)
    }

    func resetRuntime() {
        latestTelemetry.removeAll(keepingCapacity: true)
        events.removeAll(keepingCapacity: true)
        activeSessionID = nil
    }

    func configurationSnapshot(
        cameraSources: CameraSourceManager,
        sourcePolicies: [TelemetrySourcePolicy],
        forwardEdge: String,
        connectedAccessoryName: String?
    ) -> CoreNativeConfigurationSnapshot {
        var devices = [
            CoreNativeDeviceSnapshot(id: "iphone", name: "iPhone", type: "internal", enabled: true)
        ]
        if let connectedAccessoryName, !connectedAccessoryName.isEmpty {
            devices.append(CoreNativeDeviceSnapshot(id: "ble-heart", name: connectedAccessoryName, type: "bluetooth-le", enabled: true))
        }
        let routing = sourcePolicies.map {
            CoreNativeSourceRoutingSnapshot(
                metric: $0.metric,
                primarySource: $0.primarySource,
                fallbackSources: $0.fallbackSources,
                minimumQuality: min(max($0.minimumQuality, 0), 1),
                maxAgeMs: max(0, $0.maxAgeMs),
                interpolation: "hold",
                widgetId: nil
            )
        }
        return CoreNativeConfigurationSnapshot(
            schemaVersion: Self.snapshotSchemaVersion,
            coreVersion: Self.coreVersion,
            capturedAt: Date(),
            platform: "ios",
            devices: devices,
            sourceRouting: routing,
            camera: CoreNativeCameraSnapshot(
                primaryId: cameraSources.primarySourceID,
                fallbackIds: cameraSources.fallbackSourceIDs,
                sources: cameraSources.sources
            ),
            hud: loadHUDSnapshot(),
            calibration: CoreNativeCalibrationSnapshot(mode: "manual", forwardEdge: forwardEdge, deviceCalibration: nil)
        )
    }

    private func loadHUDSnapshot() -> CoreNativeHUDSnapshot {
        var profiles: [String: CoreNativeHUDProfileSnapshot] = [:]
        let decoder = JSONDecoder()
        for (name, key) in [("portrait", "nativeHudPortrait"), ("landscape", "nativeHudLandscape")] {
            guard let json = UserDefaults.standard.string(forKey: key),
                  let data = json.data(using: .utf8),
                  let profile = try? decoder.decode(CoreNativeHUDProfileSnapshot.self, from: data) else { continue }
            profiles[name] = profile
        }
        return CoreNativeHUDSnapshot(version: "1.0.0", activeProfile: nil, profiles: profiles, watermark: nil)
    }

    private func appendEvent(
        type: String,
        timestamp: TimeInterval,
        sessionID: String? = nil,
        metric: String? = nil,
        sourceID: String? = nil
    ) {
        events.append(CoreRuntimeEvent(
            type: type,
            timestampMs: timestamp * 1000,
            sessionID: sessionID,
            metric: metric,
            sourceID: sourceID
        ))
        if events.count > 2_000 { events.removeFirst(events.count - 2_000) }
    }
}
