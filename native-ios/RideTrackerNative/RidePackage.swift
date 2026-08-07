import CryptoKit
import Foundation

private struct RidePackageTelemetry: Codable {
    let filename: String
    let schemaVersion: String
    let sessionID: String
    let sampleCount: Int
    let durationSeconds: Double
}

private struct RidePackageMedia: Codable {
    let kind: String
    let filename: String
    let sessionID: String
    let startOffsetSeconds: Double
    let mimeType: String
    let sizeBytes: Int?
}

private struct RidePackagePrivacy: Codable {
    let visibility: String
    let locationPrecision: String
}

private struct RidePackageIntegrity: Codable {
    let algorithm: String
    let files: [String: String]
}

private struct RidePackageManifest: Codable {
    let packageVersion: String
    let sessionID: String
    let createdAt: Date
    let platform: String
    let telemetry: RidePackageTelemetry
    let media: [RidePackageMedia]
    let configurationSnapshot: CoreNativeConfigurationSnapshot?
    let privacy: RidePackagePrivacy
    let integrity: RidePackageIntegrity
}

enum RidePackageStore {
    static func save(session: RideSessionDocument, telemetryURL: URL) throws -> URL {
        var hashes = [telemetryURL.lastPathComponent: try sha256(telemetryURL)]
        var media: [RidePackageMedia] = []

        if let filename = session.video.filename {
            let videoURL = telemetryURL.deletingLastPathComponent().appendingPathComponent(filename)
            let exists = FileManager.default.fileExists(atPath: videoURL.path)
            if exists { hashes[filename] = try sha256(videoURL) }
            let size = exists
                ? (try? FileManager.default.attributesOfItem(atPath: videoURL.path)[.size] as? NSNumber)?.intValue
                : nil
            media.append(RidePackageMedia(
                kind: "video",
                filename: filename,
                sessionID: session.id.uuidString,
                startOffsetSeconds: session.video.startOffsetSeconds,
                mimeType: filename.lowercased().hasSuffix(".mov") ? "video/quicktime" : "video/mp4",
                sizeBytes: size
            ))
        }

        let manifest = RidePackageManifest(
            packageVersion: "1.0.0",
            sessionID: session.id.uuidString,
            createdAt: Date(),
            platform: "ios",
            telemetry: RidePackageTelemetry(
                filename: telemetryURL.lastPathComponent,
                schemaVersion: session.schemaVersion,
                sessionID: session.id.uuidString,
                sampleCount: session.summary.sampleCount,
                durationSeconds: session.summary.durationSeconds
            ),
            media: media,
            configurationSnapshot: session.configurationSnapshot,
            privacy: RidePackagePrivacy(visibility: "private", locationPrecision: "exact"),
            integrity: RidePackageIntegrity(algorithm: "sha256", files: hashes)
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(manifest)
        let filename = telemetryURL.lastPathComponent.replacingOccurrences(of: ".ride.json", with: ".ride-package.json")
        let url = telemetryURL.deletingLastPathComponent().appendingPathComponent(filename)
        try data.write(to: url, options: .atomic)
        return url
    }

    private static func sha256(_ url: URL) throws -> String {
        let data = try Data(contentsOf: url)
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
