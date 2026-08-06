import Foundation

struct RoutedTelemetrySample<Value> {
    let metric: String
    let sourceID: String
    let value: Value
    let quality: Double
    let timestamp: TimeInterval
}

struct TelemetrySourcePolicy: Codable, Hashable {
    var metric: String
    var primarySource: String
    var fallbackSources: [String]
    var minimumQuality: Double
    var maxAgeMs: Int
}

struct TelemetrySourceSwitch: Codable, Hashable {
    let timestamp: TimeInterval
    let metric: String
    let from: String?
    let to: String?
    let reason: String
}

@MainActor
final class TelemetrySourceRouter: ObservableObject {
    @Published private(set) var switches: [TelemetrySourceSwitch] = []
    private var latest: [String: (metric: String, value: Any, quality: Double, timestamp: TimeInterval)] = [:]
    private var active: [String: String] = [:]
    var policies: [TelemetrySourcePolicy] = []

    func ingest<Value>(metric: String, sourceID: String, value: Value, quality: Double = 1, timestamp: TimeInterval = ProcessInfo.processInfo.systemUptime) {
        latest[sourceID] = (metric, value, quality, timestamp)
    }

    func resolve<Value>(_ metric: String, at now: TimeInterval = ProcessInfo.processInfo.systemUptime, as type: Value.Type = Value.self) -> RoutedTelemetrySample<Value>? {
        let policy = policies.first { $0.metric == metric }
        let ordered = [policy?.primarySource].compactMap { $0 } + (policy?.fallbackSources ?? [])
        let candidates = ordered.isEmpty ? latest.keys.filter { latest[$0]?.metric == metric } : ordered
        var selected: RoutedTelemetrySample<Value>?
        for source in candidates {
            guard let sample = latest[source], sample.metric == metric, let value = sample.value as? Value else { continue }
            let ageMs = max(0, (now - sample.timestamp) * 1000)
            if sample.quality < (policy?.minimumQuality ?? 0) || ageMs > Double(policy?.maxAgeMs ?? Int.max) { continue }
            selected = RoutedTelemetrySample(metric: metric, sourceID: source, value: value, quality: sample.quality, timestamp: sample.timestamp)
            break
        }
        let next = selected?.sourceID
        if active[metric] != next {
            switches.append(.init(timestamp: now, metric: metric, from: active[metric], to: next, reason: next == nil ? "no-valid-source" : "selected"))
            active[metric] = next
        }
        return selected
    }
}
