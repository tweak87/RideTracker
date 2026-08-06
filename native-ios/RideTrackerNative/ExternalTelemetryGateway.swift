import Foundation

struct ExternalTelemetryChannel: Codable, Hashable {
    let metric: String
    let channelID: String
    let value: Double
    let quality: Double
}

struct ExternalTelemetryPacket: Codable, Hashable {
    let deviceID: String
    let timestamp: TimeInterval
    let channels: [ExternalTelemetryChannel]
}

@MainActor
final class ExternalTelemetryGateway {
    private let router: TelemetrySourceRouter

    init(router: TelemetrySourceRouter) {
        self.router = router
    }

    func ingest(_ packet: ExternalTelemetryPacket) {
        let timestamp = packet.timestamp > 0 ? packet.timestamp : ProcessInfo.processInfo.systemUptime
        for channel in packet.channels where channel.value.isFinite {
            router.ingest(
                metric: channel.metric,
                sourceID: "\(packet.deviceID)/\(channel.channelID)",
                value: channel.value,
                quality: max(0, min(1, channel.quality)),
                timestamp: timestamp
            )
        }
    }

    func ingestAccessorySample(_ sample: BLEAccessoryManager.AccessorySample, deviceID: String = "external-gnss") {
        var channels: [ExternalTelemetryChannel] = []
        let quality = max(0, min(1, sample.quality ?? sample.horizontalAccuracy.map { 1 - min($0, 100) / 100 } ?? 1))
        if let speed = sample.speedMS, speed.isFinite {
            channels.append(.init(metric: "speedKmh", channelID: "speed", value: max(0, speed * 3.6), quality: quality))
        }
        if let x = sample.accelerationX, x.isFinite { channels.append(.init(metric: "accelerationX", channelID: "accelerationX", value: x, quality: quality)) }
        if let y = sample.accelerationY, y.isFinite { channels.append(.init(metric: "accelerationY", channelID: "accelerationY", value: y, quality: quality)) }
        if let z = sample.accelerationZ, z.isFinite { channels.append(.init(metric: "accelerationZ", channelID: "accelerationZ", value: z, quality: quality)) }
        ingest(.init(deviceID: deviceID, timestamp: ProcessInfo.processInfo.systemUptime, channels: channels))
    }
}
