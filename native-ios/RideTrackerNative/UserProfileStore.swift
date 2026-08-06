import Foundation

struct LocalUserProfile: Codable, Identifiable, Hashable {
    let id: UUID
    var name: String
    let createdAt: Date
}

final class UserProfileStore: ObservableObject {
    @Published private(set) var profiles: [LocalUserProfile]
    @Published private(set) var activeProfileID: UUID

    private static let profilesKey = "RideTracker.LocalProfiles.v1"
    private static let activeKey = "RideTracker.ActiveProfile.v1"

    init() {
        let loaded = Self.loadProfiles()
        profiles = loaded
        if let raw = UserDefaults.standard.string(forKey: Self.activeKey), let id = UUID(uuidString: raw), loaded.contains(where: { $0.id == id }) {
            activeProfileID = id
        } else {
            activeProfileID = loaded[0].id
            UserDefaults.standard.set(loaded[0].id.uuidString, forKey: Self.activeKey)
        }
    }

    var activeProfile: LocalUserProfile {
        profiles.first(where: { $0.id == activeProfileID }) ?? profiles[0]
    }

    func create(name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let profile = LocalUserProfile(id: UUID(), name: trimmed, createdAt: Date())
        profiles.append(profile)
        persist()
        select(profile.id)
    }

    func select(_ id: UUID) {
        guard profiles.contains(where: { $0.id == id }) else { return }
        activeProfileID = id
        UserDefaults.standard.set(id.uuidString, forKey: Self.activeKey)
    }

    func resetActiveData() throws {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let urls = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        for url in urls where url.lastPathComponent.hasSuffix(".ride.json") || url.lastPathComponent.hasSuffix(".ride-package.json") {
            guard let data = try? Data(contentsOf: url),
                  let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let owner = root["owner"] as? [String: Any],
                  owner["profileID"] as? String == activeProfileID.uuidString else { continue }
            try? FileManager.default.removeItem(at: url)
        }
    }

    static var current: LocalUserProfile {
        let profiles = loadProfiles()
        if let raw = UserDefaults.standard.string(forKey: activeKey), let id = UUID(uuidString: raw), let profile = profiles.first(where: { $0.id == id }) { return profile }
        return profiles[0]
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(profiles) { UserDefaults.standard.set(data, forKey: Self.profilesKey) }
    }

    private static func loadProfiles() -> [LocalUserProfile] {
        if let data = UserDefaults.standard.data(forKey: profilesKey), let decoded = try? JSONDecoder().decode([LocalUserProfile].self, from: data), !decoded.isEmpty { return decoded }
        let initial = LocalUserProfile(id: UUID(), name: "Standardnutzer", createdAt: Date())
        if let data = try? JSONEncoder().encode([initial]) { UserDefaults.standard.set(data, forKey: profilesKey) }
        return [initial]
    }
}
