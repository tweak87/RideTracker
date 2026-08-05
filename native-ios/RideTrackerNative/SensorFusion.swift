import Foundation

struct RideFusionSample: Codable {
    let timestamp: TimeInterval
    let speedMS: Double
    let normalG: Double
    let longitudinalG: Double
    let relativeAltitudeM: Double?
    let qualityScore: Int
    let phase: String
}

@MainActor
final class AltitudeFusion: ObservableObject {
    @Published private(set) var relativeAltitudeM: Double?
    private var barometerZero: Double?
    private var gpsBias = 0.0
    let barometerAlpha: Double
    let gpsCorrectionAlpha: Double

    init(barometerAlpha: Double = 0.18, gpsCorrectionAlpha: Double = 0.005) {
        self.barometerAlpha = barometerAlpha
        self.gpsCorrectionAlpha = gpsCorrectionAlpha
    }

    func reset() { relativeAltitudeM = nil; barometerZero = nil; gpsBias = 0 }

    @discardableResult
    func updateBarometer(_ altitude: Double) -> Double {
        if barometerZero == nil { barometerZero = altitude }
        let value = altitude - (barometerZero ?? altitude) + gpsBias
        relativeAltitudeM = relativeAltitudeM.map { $0 + barometerAlpha * (value - $0) } ?? value
        return relativeAltitudeM ?? 0
    }

    func correctWithGPS(relativeAltitude: Double) {
        guard let current = relativeAltitudeM else { return }
        gpsBias += gpsCorrectionAlpha * (relativeAltitude - current)
    }
}

@MainActor
final class RidePhaseDetector: ObservableObject {
    @Published private(set) var phase = "idle"
    @Published private(set) var events: [(TimeInterval, String)] = []
    private var stationarySince: TimeInterval?

    @discardableResult
    func update(timestamp: TimeInterval, speedMS: Double, longitudinalG: Double, climbRateMS: Double, totalG: Double) -> String {
        var next = phase
        if longitudinalG >= 0.35 && speedMS > 2 { next = "launch" }
        else if climbRateMS >= 0.25 && speedMS <= 8 { next = "lift" }
        else if longitudinalG <= -0.3 && speedMS > 2 { next = "brake" }
        else if speedMS > 0.8 || abs(totalG - 1) > 0.18 { next = "ride" }
        else {
            if stationarySince == nil { stationarySince = timestamp }
            if timestamp - (stationarySince ?? timestamp) >= 4 { next = phase == "idle" ? "ready" : "station" }
        }
        if speedMS > 0.8 { stationarySince = nil }
        if next != phase { phase = next; events.append((timestamp, next)) }
        return phase
    }
}

struct QualityScore {
    static func calculate(motionSamples: Int, gpsAccepted: Int, gpsRejected: Int, gaps: Int, calibrated: Bool, hasBarometer: Bool) -> Int {
        let totalGPS = gpsAccepted + gpsRejected
        let gpsRatio = totalGPS > 0 ? Double(gpsAccepted) / Double(totalGPS) : 0
        let motion = min(1, Double(motionSamples) / 500)
        let penalty = min(0.3, Double(gaps) * 0.02)
        let raw = 100 * (0.30 * motion + 0.30 * gpsRatio + 0.20 * (calibrated ? 1 : 0) + 0.10 * (hasBarometer ? 1 : 0) + 0.10) - 100 * penalty
        return max(0, min(100, Int(raw.rounded())))
    }
}
