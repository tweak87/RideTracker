import CoreLocation
import CoreMotion
import Foundation
import simd

struct RideSample: Codable, Identifiable {
    let id: UUID
    let timestamp: TimeInterval
    let normalG: Double
    let lateralG: Double
    let longitudinalG: Double
    let totalG: Double
    let relativeAltitude: Double?
    let pressureKPa: Double?
    let latitude: Double?
    let longitude: Double?
    let gpsAltitude: Double?
    let speed: Double?
    let horizontalAccuracy: Double?
    let phase: String
    let qualityScore: Int
    let source: String
    let heartRateBpm: Int?
}

@MainActor
final class SensorRecorder: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var isRecording = false
    @Published private(set) var samples: [RideSample] = []
    @Published private(set) var relativeAltitude: Double = 0
    @Published private(set) var speedKmh: Double = 0
    @Published private(set) var filteredDistance: Double = 0
    @Published private(set) var rejectedLocationCount = 0
    @Published private(set) var acceptedLocationCount = 0
    @Published private(set) var ridePhase = "idle"
    @Published private(set) var qualityScore = 0
    @Published private(set) var status = "Bereit"
    @Published private(set) var lastSavedURL: URL?
    @Published private(set) var calibrationSampleCount = 0
    @Published var forwardEdge: ForwardEdge = .top
    @Published var recordVideo = true
    @Published var privateNote = ""
    @Published var communityComment = ""

    let accessoryManager = BLEAccessoryManager()
    let sourceRouter = TelemetrySourceRouter()
    let videoRecorder = VideoRecorder()
    let rideEngine = RideEngine()
    let altitudeFusion = AltitudeFusion()
    let phaseDetector = RidePhaseDetector()

    private let motion = CMMotionManager()
    private let altimeter = CMAltimeter()
    private let location = CLLocationManager()
    private let queue = OperationQueue()
    private var latestPressure: Double?
    private var latestLocation: CLLocation?
    private var startedAt: TimeInterval = 0
    private var startedAtDate = Date()
    private var endedAtDate = Date()
    private var latestClimbRate = 0.0
    private var lastAltitudeValue = 0.0
    private var lastAltitudeTimestamp = 0.0
    private var calibrationBuffer: [SIMD3<Double>] = []
    private(set) var sessionID = UUID()

    override init() {
        super.init()
        sourceRouter.policies = [
            .init(metric: "heartRateBpm", primarySource: "ble-heart/heartRate", fallbackSources: ["watch-heart/heartRate"], minimumQuality: 0.6, maxAgeMs: 3_000),
            .init(metric: "speedKmh", primarySource: "external-gnss/speed", fallbackSources: ["phone-gps/speed"], minimumQuality: 0.45, maxAgeMs: 2_000)
        ]
        location.delegate = self
        location.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        location.activityType = .automotiveNavigation
        location.distanceFilter = kCLDistanceFilterNone
        location.pausesLocationUpdatesAutomatically = false
        startMotionForCalibration()
    }

    func requestPermissions() {
        location.requestWhenInUseAuthorization()
        Task { await videoRecorder.requestPermissionsAndConfigure() }
        status = "Standort, Kamera und Mikrofon angefragt"
    }

    private func startMotionForCalibration() {
        guard motion.isDeviceMotionAvailable, !motion.isDeviceMotionActive else { return }
        motion.deviceMotionUpdateInterval = 1.0 / 100.0
        motion.startDeviceMotionUpdates(using: .xArbitraryCorrectedZVertical, to: queue) { [weak self] data, error in
            guard let self, let data, error == nil else { return }
            let gravity = SIMD3(data.gravity.x, data.gravity.y, data.gravity.z)
            let acceleration = SIMD3(data.gravity.x + data.userAcceleration.x, data.gravity.y + data.userAcceleration.y, data.gravity.z + data.userAcceleration.z)
            let uptime = ProcessInfo.processInfo.systemUptime
            let timestamp = self.isRecording ? uptime - self.startedAt : 0
            Task { @MainActor in
                self.calibrationBuffer.append(gravity)
                if self.calibrationBuffer.count > 250 { self.calibrationBuffer.removeFirst(self.calibrationBuffer.count - 250) }
                self.calibrationSampleCount = self.calibrationBuffer.count
                guard self.isRecording else { return }
                if let bpm = self.accessoryManager.latestHeartRate {
                    self.sourceRouter.ingest(metric: "heartRateBpm", sourceID: "ble-heart/heartRate", value: bpm, quality: 1, timestamp: uptime)
                }
                let routedHeartRate: RoutedTelemetrySample<Int>? = self.sourceRouter.resolve("heartRateBpm", at: uptime)
                let routedSpeed: RoutedTelemetrySample<Double>? = self.sourceRouter.resolve("speedKmh", at: uptime)
                let processed = self.rideEngine.processMotion(timestamp: timestamp, deviceG: acceleration)
                let speedMS = max(0, (routedSpeed?.value ?? 0) / 3.6)
                self.speedKmh = routedSpeed?.value ?? 0
                self.ridePhase = self.phaseDetector.update(timestamp: timestamp, speedMS: speedMS, longitudinalG: processed.longitudinalG, climbRateMS: self.latestClimbRate, totalG: processed.totalG)
                self.qualityScore = QualityScore.calculate(motionSamples: self.samples.count, gpsAccepted: self.acceptedLocationCount, gpsRejected: self.rejectedLocationCount, gaps: 0, calibrated: self.rideEngine.calibration != nil, hasBarometer: CMAltimeter.isRelativeAltitudeAvailable())
                let loc = self.latestLocation
                self.samples.append(RideSample(id: UUID(), timestamp: timestamp, normalG: processed.normalG, lateralG: processed.lateralG, longitudinalG: processed.longitudinalG, totalG: processed.totalG, relativeAltitude: self.altitudeFusion.relativeAltitudeM, pressureKPa: self.latestPressure, latitude: loc?.coordinate.latitude, longitude: loc?.coordinate.longitude, gpsAltitude: loc?.altitude, speed: speedMS, horizontalAccuracy: loc?.horizontalAccuracy, phase: self.ridePhase, qualityScore: self.qualityScore, source: "iphone", heartRateBpm: routedHeartRate?.value))
            }
        }
    }

    @discardableResult
    func calibrateNow() -> Bool {
        guard let calibration = CalibrationMath.build(gravitySamples: Array(calibrationBuffer.suffix(150)), forwardEdge: forwardEdge) else {
            status = "Kalibrierung fehlgeschlagen: Gerät ruhig halten"
            return false
        }
        rideEngine.calibration = calibration
        status = "Kalibriert · Fahrtrichtung: \(forwardEdge.title)"
        return true
    }

    func calibrateAndStart(video: Bool) {
        recordVideo = video
        guard calibrateNow() else { return }
        start()
    }

    func start() {
        guard !isRecording else { return }
        startMotionForCalibration()
        samples.removeAll(keepingCapacity: true)
        sourceRouter.reset()
        rideEngine.reset()
        if let calibration = CalibrationMath.build(gravitySamples: Array(calibrationBuffer.suffix(150)), forwardEdge: forwardEdge) { rideEngine.calibration = calibration }
        altitudeFusion.reset()
        filteredDistance = 0; rejectedLocationCount = 0; acceptedLocationCount = 0
        ridePhase = "idle"; qualityScore = 0; lastSavedURL = nil; sessionID = UUID()
        startedAt = ProcessInfo.processInfo.systemUptime; startedAtDate = Date(); isRecording = true
        status = "Aufnahme läuft · Session \(sessionID.uuidString.prefix(8))"
        location.startUpdatingLocation()
        if recordVideo { videoRecorder.start(sessionID: sessionID, sensorStartUptime: startedAt) }
        if CMAltimeter.isRelativeAltitudeAvailable() {
            altimeter.startRelativeAltitudeUpdates(to: queue) { [weak self] data, _ in
                guard let self, let data else { return }
                let altitude = data.relativeAltitude.doubleValue, pressure = data.pressure.doubleValue
                let timestamp = ProcessInfo.processInfo.systemUptime - self.startedAt
                Task { @MainActor in
                    self.latestPressure = pressure; self.relativeAltitude = self.altitudeFusion.updateBarometer(altitude)
                    if self.lastAltitudeTimestamp > 0, timestamp > self.lastAltitudeTimestamp { self.latestClimbRate = (self.relativeAltitude - self.lastAltitudeValue) / (timestamp - self.lastAltitudeTimestamp) }
                    self.lastAltitudeValue = self.relativeAltitude; self.lastAltitudeTimestamp = timestamp
                }
            }
        }
    }

    func stop() {
        guard isRecording else { return }
        isRecording = false; endedAtDate = Date(); altimeter.stopRelativeAltitudeUpdates(); location.stopUpdatingLocation()
        if recordVideo { videoRecorder.stop() }
        status = "Aufnahme beendet: \(samples.count) Samples"
    }

    @discardableResult
    func saveSession() throws -> URL {
        let duration = samples.last?.timestamp ?? 0
        let phaseEvents = phaseDetector.events.map { RideSessionEvent(id: UUID(), timestamp: $0.0, type: $0.1) }
        let sourceEvents = sourceRouter.switches.map { value in
            RideSessionEvent(id: UUID(), timestamp: max(0, value.timestamp - startedAt), type: "source-switch:\(value.metric):\(value.from ?? "none")->\(value.to ?? "none"):\(value.reason)")
        }
        let cal = rideEngine.calibration
        let document = RideSessionDocument(schemaVersion: "2.0.0", id: sessionID, platform: "ios", startedAt: startedAtDate, endedAt: endedAtDate, timebase: "systemUptime", calibration: RideSessionCalibration(mode: "manual", source: "iphone", isCalibrated: cal != nil, forwardEdge: forwardEdge.rawValue, up: cal.map { [$0.up.x, $0.up.y, $0.up.z] }, lateral: cal.map { [$0.lateral.x, $0.lateral.y, $0.lateral.z] }, forward: cal.map { [$0.forward.x, $0.forward.y, $0.forward.z] }), video: RideSessionVideo(sessionID: sessionID.uuidString, filename: videoRecorder.lastVideoURL?.lastPathComponent, startOffsetSeconds: videoRecorder.startOffsetSeconds), events: phaseEvents + sourceEvents, samples: samples, summary: RideSessionSummary(durationSeconds: duration, sampleCount: samples.count, distanceMeters: filteredDistance, acceptedLocations: acceptedLocationCount, rejectedLocations: rejectedLocationCount, qualityScore: qualityScore, finalPhase: ridePhase), notes: RideSessionNotes(privateNote: privateNote, communityComment: communityComment), heartRate: RideSessionHeartRate(source: sourceRouter.resolve("heartRateBpm", as: Int.self)?.sourceID ?? accessoryManager.connectedName, sampleCount: samples.compactMap(\.heartRateBpm).count, averageBpm: averageHeartRate()))
        let url = try RideSessionStore.save(document); lastSavedURL = url; status = "Session gespeichert: \(url.lastPathComponent)"; return url
    }

    private func averageHeartRate() -> Double? {
        let values = samples.compactMap(\.heartRateBpm); guard !values.isEmpty else { return nil }
        return Double(values.reduce(0,+)) / Double(values.count)
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for value in locations {
            if rideEngine.processLocation(value) {
                acceptedLocationCount += 1; latestLocation = value; filteredDistance = rideEngine.distanceMeters
                let quality = max(0, min(1, 1 - value.horizontalAccuracy / 100))
                sourceRouter.ingest(metric: "speedKmh", sourceID: "phone-gps/speed", value: max(0, value.speed * 3.6), quality: quality, timestamp: ProcessInfo.processInfo.systemUptime)
            } else { rejectedLocationCount += 1 }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) { status = "Standortfehler: \(error.localizedDescription)" }
}
