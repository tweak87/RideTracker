import AVFoundation
import Foundation

struct CameraSourceDescriptor: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let position: String
    let transport: String
    let available: Bool
}

@MainActor
final class CameraSourceManager: ObservableObject {
    @Published private(set) var sources: [CameraSourceDescriptor] = []
    @Published var primarySourceID: String? {
        didSet { UserDefaults.standard.set(primarySourceID, forKey: "rideTracker.camera.primary") }
    }
    @Published var fallbackSourceIDs: [String] = [] {
        didSet { UserDefaults.standard.set(fallbackSourceIDs, forKey: "rideTracker.camera.fallbacks") }
    }

    init() {
        primarySourceID = UserDefaults.standard.string(forKey: "rideTracker.camera.primary")
        fallbackSourceIDs = UserDefaults.standard.stringArray(forKey: "rideTracker.camera.fallbacks") ?? []
        refresh()
    }

    func refresh() {
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .builtInUltraWideCamera, .builtInTelephotoCamera, .external],
            mediaType: .video,
            position: .unspecified
        )
        sources = discovery.devices.map { device in
            CameraSourceDescriptor(
                id: device.uniqueID,
                name: device.localizedName,
                position: device.position == .front ? "front" : device.position == .back ? "back" : "external",
                transport: device.deviceType == .external ? "external" : "internal",
                available: device.isConnected
            )
        }
        if primarySourceID == nil { primarySourceID = sources.first(where: { $0.position == "back" })?.id ?? sources.first?.id }
    }

    func orderedSources() -> [CameraSourceDescriptor] {
        ([primarySourceID].compactMap { $0 } + fallbackSourceIDs)
            .compactMap { id in sources.first(where: { $0.id == id }) }
    }

    func selectedDevice() -> AVCaptureDevice? {
        orderedSources().lazy.compactMap { source in AVCaptureDevice(uniqueID: source.id) }.first(where: { $0.isConnected })
    }
}
