import CoreLocation
import Foundation

struct SeatCalibration: Codable {
    let up: SIMD3<Double>
    let lateral: SIMD3<Double>
    let forward: SIMD3<Double>
    let source: String
}

struct ProcessedMotionSample: Codable {
    let timestamp: TimeInterval
    let normalG: Double
    let lateralG: Double
    let longitudinalG: Double
    let totalG: Double
    let positiveGAverage: Double?
    let isAirtime: Bool
}

@MainActor
final class RideEngine: ObservableObject {
    @Published private(set) var distanceMeters: Double = 0
    @Published private(set) var acceptedLocations = 0
    @Published private(set) var rejectedLocations = 0
    @Published private(set) var positiveGAverage: Double?

    var calibration: SeatCalibration?

    private var lastLocation: CLLocation?
    private var positiveGSum = 0.0
    private var positiveGCount = 0

    let positiveGThreshold = 1.0
    let airtimeThreshold = 0.3
    let maxHorizontalAccuracy = 40.0
    let stationarySpeed = 0.8
    let minimumMovement = 1.5
    let maxImpliedSpeed = 90.0

    func reset() {
        lastLocation = nil
        distanceMeters = 0
        acceptedLocations = 0
        rejectedLocations = 0
        positiveGSum = 0
        positiveGCount = 0
        positiveGAverage = nil
    }

    func processMotion(timestamp: TimeInterval, deviceG: SIMD3<Double>) -> ProcessedMotionSample {
        let normal = calibration.map { simd_dot(deviceG, $0.up) } ?? deviceG.z
        let lateral = calibration.map { simd_dot(deviceG, $0.lateral) } ?? deviceG.x
        let longitudinal = calibration.map { simd_dot(deviceG, $0.forward) } ?? deviceG.y
        let total = simd_length(SIMD3(normal, lateral, longitudinal))

        if normal > positiveGThreshold {
            positiveGSum += normal
            positiveGCount += 1
            positiveGAverage = positiveGSum / Double(positiveGCount)
        }

        return ProcessedMotionSample(
            timestamp: timestamp,
            normalG: normal,
            lateralG: lateral,
            longitudinalG: longitudinal,
            totalG: total,
            positiveGAverage: positiveGAverage,
            isAirtime: normal < airtimeThreshold
        )
    }

    func processLocation(_ location: CLLocation) -> Bool {
        guard location.horizontalAccuracy >= 0,
              location.horizontalAccuracy <= maxHorizontalAccuracy else {
            rejectedLocations += 1
            return false
        }

        guard let previous = lastLocation else {
            lastLocation = location
            acceptedLocations += 1
            return true
        }

        let dt = max(0.001, location.timestamp.timeIntervalSince(previous.timestamp))
        let distance = location.distance(from: previous)
        let impliedSpeed = distance / dt
        let reportedSpeed = max(0, location.speed)
        let uncertainty = max(location.horizontalAccuracy, previous.horizontalAccuracy) * 0.55

        let stationary = reportedSpeed < stationarySpeed && distance <= uncertainty
        let tooSmall = distance < minimumMovement && dt < 2
        let impossible = impliedSpeed > maxImpliedSpeed

        guard !stationary, !tooSmall, !impossible else {
            rejectedLocations += 1
            return false
        }

        distanceMeters += distance
        lastLocation = location
        acceptedLocations += 1
        return true
    }
}
