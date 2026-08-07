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

struct CoreNativeCameraSnapshot: Codable, Hashable {
    let primaryID: String?
    let fallbackIDs: [String]
    let sources: [CameraSourceDescriptor]
}

struct CoreNativeConfigurationSnapshot: Codable, Hashable {
    let coreVersion: String
    let capturedAt: Date
    let platform: String
    let devices: [CoreNativeDeviceSnapshot]
    let camera: CoreNativeCameraSnapshot
    let calibrationMode: String
    let forwardEdge: String
}

@MainActor
final class RideTrackerCoreAdapter: ObservableObject {
    static let coreVersion = "2.0.0-alpha.1"

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
        forwardEdge: String,
        connectedAccessoryName: String?
    ) -> CoreNativeConfigurationSnapshot {
        var devices = [
            CoreNativeDeviceSnapshot(id: "iphone", name: "iPhone", type: "internal", enabled: true)
        ]
        if let connectedAccessoryName, !connectedAccessoryName.isEmpty {
            devices.append(CoreNativeDeviceSnapshot(id: "ble-heart", name: connectedAccessoryName, type: "bluetooth-le", enabled: true))
        }
        return CoreNativeConfigurationSnapshot(
            coreVersion: Self.coreVersion,
            capturedAt: Date(),
            platform: "ios",
            devices: devices,
            camera: CoreNativeCameraSnapshot(
                primaryID: cameraSources.primarySourceID,
                fallbackIDs: cameraSources.fallbackSourceIDs,
                sources: cameraSources.sources
            ),
            calibrationMode: "manual",
            forwardEdge: forwardEdge
        )
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
