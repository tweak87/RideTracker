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
}

@MainActor
final class SensorRecorder: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var isRecording = false
    @Published private(set) var samples: [RideSample] = []
    @Published private(set) var relativeAltitude: Double = 0
    @Published private(set) var speedKmh: Double = 0
    @Published private(set) var status = "Bereit"

    private let motion = CMMotionManager()
    private let altimeter = CMAltimeter()
    private let location = CLLocationManager()
    private let queue = OperationQueue()
    private var latestAltitude: Double?
    private var latestPressure: Double?
    private var latestLocation: CLLocation?
    private var startedAt: TimeInterval = 0

    override init() {
        super.init()
        location.delegate = self
        location.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        location.activityType = .automotiveNavigation
        location.distanceFilter = kCLDistanceFilterNone
    }

    func requestPermissions() {
        location.requestWhenInUseAuthorization()
        status = "Berechtigungen angefragt"
    }

    func start() {
        guard !isRecording else { return }
        samples.removeAll(keepingCapacity: true)
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
                speed: location?.speed
            )
            Task { @MainActor in
                self.samples.append(sample)
            }
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

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let value = locations.last else { return }
        latestLocation = value
        speedKmh = max(0, value.speed * 3.6)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        status = "Standortfehler: \(error.localizedDescription)"
    }
}
