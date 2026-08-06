import AVFoundation
import Foundation

@MainActor
final class VideoRecorder: NSObject, ObservableObject, AVCaptureFileOutputRecordingDelegate {
    @Published private(set) var isConfigured = false
    @Published private(set) var isRecording = false
    @Published private(set) var status = "Video nicht initialisiert"
    @Published private(set) var lastVideoURL: URL?
    @Published private(set) var startOffsetSeconds: Double = 0

    let captureSession = AVCaptureSession()
    let cameraSources = CameraSourceManager()
    private let movieOutput = AVCaptureMovieFileOutput()
    private let sessionQueue = DispatchQueue(label: "de.ridetracker.camera")
    private var sensorStartUptime: TimeInterval = 0

    func requestPermissionsAndConfigure() async {
        let camera = await AVCaptureDevice.requestAccess(for: .video)
        let microphone = await AVCaptureDevice.requestAccess(for: .audio)
        guard camera else { status = "Kamerazugriff verweigert"; return }
        cameraSources.refresh()
        configure(includeAudio: microphone, camera: cameraSources.selectedDevice())
    }

    func reconfigureSelectedCamera() {
        guard !isRecording else { status = "Kamera kann während der Aufnahme nicht gewechselt werden"; return }
        cameraSources.refresh()
        isConfigured = false
        configure(includeAudio: AVCaptureDevice.authorizationStatus(for: .audio) == .authorized, camera: cameraSources.selectedDevice())
    }

    private func configure(includeAudio: Bool, camera: AVCaptureDevice?) {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            self.captureSession.stopRunning()
            self.captureSession.beginConfiguration()
            self.captureSession.sessionPreset = .high
            self.captureSession.inputs.forEach(self.captureSession.removeInput)
            self.captureSession.outputs.forEach(self.captureSession.removeOutput)
            defer { self.captureSession.commitConfiguration() }

            guard let camera,
                  let videoInput = try? AVCaptureDeviceInput(device: camera),
                  self.captureSession.canAddInput(videoInput) else {
                Task { @MainActor in self.status = "Ausgewählte Kamera nicht verfügbar" }
                return
            }
            self.captureSession.addInput(videoInput)

            if includeAudio,
               let microphone = AVCaptureDevice.default(for: .audio),
               let audioInput = try? AVCaptureDeviceInput(device: microphone),
               self.captureSession.canAddInput(audioInput) {
                self.captureSession.addInput(audioInput)
            }
            guard self.captureSession.canAddOutput(self.movieOutput) else {
                Task { @MainActor in self.status = "Videoausgabe nicht verfügbar" }
                return
            }
            self.captureSession.addOutput(self.movieOutput)
            self.captureSession.startRunning()
            Task { @MainActor in
                self.isConfigured = true
                self.status = "Video bereit: \(camera.localizedName)"
            }
        }
    }

    func start(sessionID: UUID, sensorStartUptime: TimeInterval) {
        guard isConfigured, !movieOutput.isRecording else { return }
        self.sensorStartUptime = sensorStartUptime
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let url = directory.appendingPathComponent("RideTracker-\(sessionID.uuidString).mov")
        try? FileManager.default.removeItem(at: url)
        let cameraStart = ProcessInfo.processInfo.systemUptime
        startOffsetSeconds = cameraStart - sensorStartUptime
        lastVideoURL = url
        movieOutput.startRecording(to: url, recordingDelegate: self)
        isRecording = true
        status = "Videoaufnahme läuft"
    }

    func stop() {
        guard movieOutput.isRecording else { return }
        movieOutput.stopRecording()
    }

    nonisolated func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        Task { @MainActor in
            self.isRecording = false
            self.lastVideoURL = outputFileURL
            self.status = error == nil ? "Video gespeichert: \(outputFileURL.lastPathComponent)" : "Videofehler: \(error!.localizedDescription)"
        }
    }
}
