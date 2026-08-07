import Foundation

struct RideSessionEvent: Codable, Identifiable { let id: UUID; let timestamp: TimeInterval; let type: String }
struct RideSessionCalibration: Codable { let mode: String; let source: String; let isCalibrated: Bool; let forwardEdge: String?; let up: [Double]?; let lateral: [Double]?; let forward: [Double]? }
struct RideSessionVideo: Codable { let sessionID: String; let filename: String?; let startOffsetSeconds: Double }
struct RideSessionSummary: Codable { let durationSeconds: TimeInterval; let sampleCount: Int; let distanceMeters: Double; let acceptedLocations: Int; let rejectedLocations: Int; let qualityScore: Int; let finalPhase: String }
struct RideSessionNotes: Codable { let privateNote: String; let communityComment: String }
struct RideSessionHeartRate: Codable { let source: String?; let sampleCount: Int; let averageBpm: Double? }
struct RideSessionOwner: Codable { let profileID: String; let displayName: String }

struct RideSessionDocument: Codable, Identifiable {
    let schemaVersion: String
    let id: UUID
    let platform: String
    let startedAt: Date
    let endedAt: Date
    let timebase: String
    var owner: RideSessionOwner = {
        let profile = UserProfileStore.current
        return RideSessionOwner(profileID: profile.id.uuidString, displayName: profile.name)
    }()
    let calibration: RideSessionCalibration
    let video: RideSessionVideo
    let events: [RideSessionEvent]
    let samples: [RideSample]
    let summary: RideSessionSummary
    let notes: RideSessionNotes
    let heartRate: RideSessionHeartRate
    var configurationSnapshot: CoreNativeConfigurationSnapshot? = nil
}

enum RideSessionStore {
    static func save(_ session: RideSessionDocument) throws -> URL {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]; encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(session)
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let formatter = DateFormatter(); formatter.dateFormat = "yyyyMMdd-HHmmss"
        let filename = "RideTracker-\(formatter.string(from: session.startedAt))-\(session.id.uuidString.prefix(8)).ride.json"
        let url = directory.appendingPathComponent(filename)
        try data.write(to: url, options: .atomic)
        _ = try RidePackageStore.save(session: session, telemetryURL: url)
        return url
    }
}
