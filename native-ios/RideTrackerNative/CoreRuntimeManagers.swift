import Foundation

final class CoreDeviceManager {
    private var devices: [String: CoreNativeDeviceSnapshot] = [:]

    @discardableResult
    func upsert(_ device: CoreNativeDeviceSnapshot) -> CoreNativeDeviceSnapshot {
        precondition(!device.id.isEmpty, "device.id is required")
        devices[device.id] = device
        return device
    }

    @discardableResult
    func remove(_ id: String) -> Bool { devices.removeValue(forKey: id) != nil }

    func get(_ id: String) -> CoreNativeDeviceSnapshot? { devices[id] }
    func list() -> [CoreNativeDeviceSnapshot] { Array(devices.values) }
    func clear() { devices.removeAll(keepingCapacity: true) }
}

final class CoreSensorManager {
    private var latest: [String: CoreTelemetrySample] = [:]

    @discardableResult
    func ingest(_ sample: CoreTelemetrySample) -> CoreTelemetrySample {
        precondition(!sample.deviceID.isEmpty, "sample.deviceID is required")
        precondition(!sample.channelID.isEmpty, "sample.channelID is required")
        precondition(!sample.metric.isEmpty, "sample.metric is required")
        precondition(sample.value.isFinite, "sample.value must be finite")
        precondition((0.0...1.0).contains(sample.quality), "sample.quality must be 0...1")
        latest[key(sample.deviceID, sample.channelID)] = sample
        return sample
    }

    func latestFor(deviceID: String, channelID: String) -> CoreTelemetrySample? {
        latest[key(deviceID, channelID)]
    }

    func snapshot() -> [CoreTelemetrySample] { Array(latest.values) }
    func clear() { latest.removeAll(keepingCapacity: true) }

    private func key(_ deviceID: String, _ channelID: String) -> String { "\(deviceID)/\(channelID)" }
}

final class CoreCameraManager {
    private var sources: [String: CameraSourceDescriptor] = [:]
    private(set) var primaryID: String?
    private(set) var fallbackIDs: [String] = []

    func sync(sources availableSources: [CameraSourceDescriptor], primaryID: String?, fallbackIDs: [String]) {
        sources.removeAll(keepingCapacity: true)
        for source in availableSources where !source.id.isEmpty { sources[source.id] = source }
        self.primaryID = primaryID.flatMap { sources[$0] == nil ? nil : $0 }
        var seen = Set<String>()
        self.fallbackIDs = fallbackIDs.filter {
            $0 != self.primaryID && sources[$0] != nil && seen.insert($0).inserted
        }
    }

    func list() -> [CameraSourceDescriptor] { Array(sources.values) }
    func ordered() -> [CameraSourceDescriptor] { ([primaryID].compactMap { $0 } + fallbackIDs).compactMap { sources[$0] } }
    func snapshot() -> CoreNativeCameraSnapshot { .init(primaryId: primaryID, fallbackIds: fallbackIDs, sources: list()) }
    func clear() { sources.removeAll(keepingCapacity: true); primaryID = nil; fallbackIDs = [] }
}

struct CoreRecordingState: Hashable {
    let sessionID: String
    let startedAtMs: Double
    let endedAtMs: Double?
}

final class CoreRecordingManager {
    private(set) var active = false
    private(set) var session: CoreRecordingState?

    @discardableResult
    func start(sessionID: String, timestampMs: Double) -> CoreRecordingState {
        precondition(!sessionID.isEmpty, "sessionID is required")
        precondition(!active, "recording already active")
        let value = CoreRecordingState(sessionID: sessionID, startedAtMs: timestampMs, endedAtMs: nil)
        session = value
        active = true
        return value
    }

    @discardableResult
    func stop(timestampMs: Double) -> CoreRecordingState? {
        guard let current = session else { return nil }
        guard active else { return current }
        let value = CoreRecordingState(sessionID: current.sessionID, startedAtMs: current.startedAtMs, endedAtMs: timestampMs)
        session = value
        active = false
        return value
    }

    func reset() { active = false; session = nil }
}
