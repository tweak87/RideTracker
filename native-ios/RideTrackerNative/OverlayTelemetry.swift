import Foundation

struct OverlayTelemetryFrame: Codable, Equatable {
    struct GForce: Codable, Equatable { var lateral: Double; var vertical: Double; var longitudinal: Double; var total: Double }
    struct Speed: Codable, Equatable { var valueKmh: Double; var source: String; var accuracyKmh: Double? }
    struct HeartRate: Codable, Equatable { var bpm: Int?; var source: String; var valid: Bool }
    struct Vibration: Codable, Equatable { var rmsMs2: Double; var peakMs2: Double; var level: String }
    struct Recording: Codable, Equatable { var active: Bool; var elapsedMs: Double }
    var timestampMs: Double
    var gForce: GForce
    var speed: Speed
    var heartRate: HeartRate
    var vibration: Vibration
    var recording: Recording
}

struct OverlayConfiguration: Codable, Equatable {
    struct Limits: Codable, Equatable {
        var gDisplayRange: Double
        var speedScales: [Double]
        var pulseWarning: Int
        var pulseCritical: Int
        var vibrationWarning: Double
        var vibrationCritical: Double
    }
    var version: String
    var designWidth: Double
    var designHeight: Double
    var layout: [String: [Double]]
    var limits: Limits
}

extension OverlayTelemetryFrame {
    static func from(sample: RideSample, videoStartOffsetSeconds: Double = 0, vibrationRmsMs2: Double = 0, vibrationPeakMs2: Double = 0) -> Self {
        let timestampMs = max(0, (sample.timestamp - videoStartOffsetSeconds) * 1000)
        let bpm = sample.heartRateBpm
        return .init(
            timestampMs: timestampMs,
            gForce: .init(lateral: sample.lateralG, vertical: sample.normalG, longitudinal: sample.longitudinalG, total: sample.totalG),
            speed: .init(valueKmh: sample.speedMS * 3.6, source: "gps", accuracyKmh: nil),
            heartRate: .init(bpm: bpm, source: bpm == nil ? "none" : "bluetooth", valid: bpm != nil),
            vibration: .init(rmsMs2: vibrationRmsMs2, peakMs2: vibrationPeakMs2, level: vibrationRmsMs2 >= 7 ? "high" : vibrationRmsMs2 >= 3 ? "medium" : "low"),
            recording: .init(active: true, elapsedMs: timestampMs)
        )
    }
}
