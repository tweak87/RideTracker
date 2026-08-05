import CoreLocation
import CoreMotion
import Foundation

struct RideSample: Codable, Identifiable {
    let id: UUID
    let timestamp: TimeInterval
    let userAccelerationX: Double
    let userAccelerationY: Double
    let userAccelerationZ: Double
    let rotationX: Double
    let rotationY: Double
    let rotationZ: Double
    let relativeAltitude: Double?
    let pressureKPa: Double?
    let latitude: Double?
    let longitude: Double?
    let gpsAltitude: Double?
    let speed: Double?
    let horizontalAccuracy: Double?
    let source: String
}

@MainActor
final class SensorRecorder: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var isRecording = false
    @Published private(set) var samples: [RideSample] = []
    @Published private(set) var relativeAltitude: Double = 0
    @Published private(set) var speedKmh: Double = 0
    @Published private(set) var filteredDistance: Double = 0
    @Published private(set) var rejectedLocationCount = 0
    @Published private(set) var status = "Bereit"

    let accessoryManager = BLEAccessoryManager()

    private let motion = CMMotionManager()
    private let altimeter = CMAltimeter()
    private let location = CLLocationManager()
    private let queue = OperationQueue()
    private var latestAltitude: Double?
    private var latestPressure: Double?
    private var latestLocation: CLLocation?
    private var lastAcceptedLocation: CLLocation?
    private var startedAt: TimeInterval = 0

    override init() {
        super.init()
        location.delegate = self
        location.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        location.activityType = .automotiveNavigation
        location.distanceFilter = kCLDistanceFilterNone
        location.pausesLocationUpdatesAutomatically = false
    }

    func requestPermissions() {
        location.requestWhenInUseAuthorization()
        status = "Berechtigungen angefragt"
    }

    func start() {
        guard !isRecording else { return }
        samples.removeAll(keepingCapacity: true)
        filteredDistance = 0
        rejectedLocationCount = 0
        lastAcceptedLocation = nil
        startedAt = ProcessInfo.processInfo.systemUptime
        isRecording = true
        status = "Aufnahme läuft"
        location.startUpdatingLocation()

        if CMAltimeter.isRelativeAltitudeAvailable() {
            altimeter.startRelativeAltitudeUpdates(to: queue) { [weak self] data, _ in
                guard let self, let data else { return }
                Task { @MainActor in
                    self.latestAltitude = data.relativeAltitude.doubleValue
                    self.latestPressure = data.pressure.doubleValue
                    self.relativeAltitude = data.relativeAltitude.doubleValue
                }
            }
        }

        guard motion.isDeviceMotionAvailable else {
            status = "Device Motion nicht verfügbar"
            return
        }
        motion.deviceMotionUpdateInterval = 1.0 / 100.0
        motion.startDeviceMotionUpdates(using: .xArbitraryCorrectedZVertical, to: queue) { [weak self] data, error in
            guard let self, let data, error == nil else { return }
            let location = self.latestLocation
            let sample = RideSample(
                id: UUID(),
                timestamp: ProcessInfo.processInfo.systemUptime - self.startedAt,
                userAccelerationX: data.userAcceleration.x,
                userAccelerationY: data.userAcceleration.y,
                userAccelerationZ: data.userAcceleration.z,
                rotationX: data.rotationRate.x,
                rotationY: data.rotationRate.y,
                rotationZ: data.rotationRate.z,
                relativeAltitude: self.latestAltitude,
                pressureKPa: self.latestPressure,
                latitude: location?.coordinate.latitude,
                longitude: location?.coordinate.longitude,
                gpsAltitude: location?.altitude,
                speed: location?.speed,
                horizontalAccuracy: location?.horizontalAccuracy,
                source: "iphone"
            )
            Task { @MainActor in self.samples.append(sample) }
        }
    }

    func stop() {
        guard isRecording else { return }
        isRecording = false
        motion.stopDeviceMotionUpdates()
        altimeter.stopRelativeAltitudeUpdates()
        location.stopUpdatingLocation()
        status = "Aufnahme beendet: \(samples.count) Samples"
    }

    private func accept(_ value: CLLocation) -> Bool {
        guard value.horizontalAccuracy >= 0, value.horizontalAccuracy <= 35 else { return false }
        guard let previous = lastAcceptedLocation else { return true }
        let dt = max(0.2, value.timestamp.timeIntervalSince(previous.timestamp))
        let distance = value.distance(from: previous)
        let reportedSpeed = max(0, value.speed)
        let impliedSpeed = distance / dt
        let combinedAccuracy = max(3, (value.horizontalAccuracy + previous.horizontalAccuracy) / 2)
        let plausibleMaximum = max(18, reportedSpeed * 2.5 + 8)
        if impliedSpeed > plausibleMaximum && distance > combinedAccuracy { return false }
        let moving = reportedSpeed >= 1.2 || impliedSpeed >= 1.5
        let significance = max(3.5, min(12, combinedAccuracy * 0.65))
        if !moving && distance < significance { return false }
        if distance < 2 && dt < 2 { return false }
        return true
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for value in locations {
            guard accept(value) else {
                rejectedLocationCount += 1
                continue
            }
            if let previous = lastAcceptedLocation {
                filteredDistance += value.distance(from: previous)
            }
            lastAcceptedLocation = value
            latestLocation = value
            speedKmh = max(0, value.speed * 3.6)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        status = "Standortfehler: \(error.localizedDescription)"
    }
}
