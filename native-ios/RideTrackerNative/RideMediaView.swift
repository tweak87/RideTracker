import PhotosUI
import SwiftUI

struct LocalRideMediaItem: Identifiable {
    let id: String
    let title: String
    let park: String
    let fileURL: URL
    var rating: Int
    var imageFilename: String?
}

@MainActor
final class RideMediaStore: ObservableObject {
    @Published var rides: [LocalRideMediaItem] = []
    private let profiles: UserProfileStore

    init(profiles: UserProfileStore) {
        self.profiles = profiles
        reload()
    }

    func reload() {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let urls = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        rides = urls.filter { $0.lastPathComponent.hasSuffix(".ride.json") }.compactMap { url in
            guard let data = try? Data(contentsOf: url),
                  let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let id = root["id"] as? String else { return nil }
            let owner = root["owner"] as? [String: Any]
            guard (owner?["profileID"] as? String ?? profiles.activeProfileID.uuidString) == profiles.activeProfileID.uuidString else { return nil }
            let context = root["context"] as? [String: Any]
            let title = context?["rideName"] as? String ?? "Unbenannte Bahn"
            let park = context?["parkName"] as? String ?? "Park nicht erkannt"
            let rating = UserDefaults.standard.integer(forKey: ratingKey(id))
            let image = UserDefaults.standard.string(forKey: imageKey(id))
            return LocalRideMediaItem(id: id, title: title, park: park, fileURL: url, rating: rating, imageFilename: image)
        }.sorted { $0.fileURL.lastPathComponent > $1.fileURL.lastPathComponent }
    }

    func setRating(_ rating: Int, for rideID: String) {
        UserDefaults.standard.set(rating, forKey: ratingKey(rideID))
        reload()
    }

    func setImage(data: Data, for rideID: String) throws {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let filename = "RideTracker-\(rideID)-cover.jpg"
        let url = directory.appendingPathComponent(filename)
        try data.write(to: url, options: .atomic)
        UserDefaults.standard.set(filename, forKey: imageKey(rideID))
        reload()
    }

    func removeImage(for rideID: String) {
        if let filename = UserDefaults.standard.string(forKey: imageKey(rideID)) {
            let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
            try? FileManager.default.removeItem(at: directory.appendingPathComponent(filename))
        }
        UserDefaults.standard.removeObject(forKey: imageKey(rideID))
        reload()
    }

    func imageURL(for item: LocalRideMediaItem) -> URL? {
        guard let filename = item.imageFilename else { return nil }
        return FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?.appendingPathComponent(filename)
    }

    private func ratingKey(_ id: String) -> String { "RideTracker.Rating.\(profiles.activeProfileID.uuidString).\(id)" }
    private func imageKey(_ id: String) -> String { "RideTracker.Image.\(profiles.activeProfileID.uuidString).\(id)" }
}

struct RideMediaView: View {
    @EnvironmentObject private var profiles: UserProfileStore
    @StateObject private var store: RideMediaStore

    init(profiles: UserProfileStore) {
        _store = StateObject(wrappedValue: RideMediaStore(profiles: profiles))
    }

    var body: some View {
        NavigationStack {
            Group {
                if store.rides.isEmpty {
                    ContentUnavailableView("Noch keine Fahrten", systemImage: "photo.on.rectangle", description: Text("Nach der ersten gespeicherten Fahrt kannst du ein Bahnbild hinterlegen und Sterne vergeben."))
                } else {
                    List(store.rides) { ride in RideMediaRow(ride: ride, store: store) }
                }
            }
            .navigationTitle("Bilder & Bewertungen")
            .onAppear { store.reload() }
        }
    }
}

private struct RideMediaRow: View {
    let ride: LocalRideMediaItem
    @ObservedObject var store: RideMediaStore
    @State private var pickerItem: PhotosPickerItem?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                Group {
                    if let url = store.imageURL(for: ride), let data = try? Data(contentsOf: url), let image = UIImage(data: data) {
                        Image(uiImage: image).resizable().scaledToFill()
                    } else {
                        ZStack { Color.secondary.opacity(0.15); Image(systemName: "photo").foregroundStyle(.secondary) }
                    }
                }
                .frame(width: 86, height: 86).clipShape(RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 5) {
                    Text(ride.title).font(.headline)
                    Text(ride.park).font(.caption).foregroundStyle(.secondary)
                    HStack(spacing: 2) {
                        ForEach(1...5, id: \.self) { value in
                            Button { store.setRating(value, for: ride.id) } label: {
                                Image(systemName: value <= ride.rating ? "star.fill" : "star").foregroundStyle(value <= ride.rating ? .yellow : .secondary)
                            }.buttonStyle(.plain)
                        }
                    }
                }
            }
            HStack {
                PhotosPicker("Bild auswählen", selection: $pickerItem, matching: .images)
                if ride.imageFilename != nil { Button("Bild entfernen", role: .destructive) { store.removeImage(for: ride.id) } }
            }.buttonStyle(.bordered)
        }
        .padding(.vertical, 4)
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self) { try? store.setImage(data: data, for: ride.id) }
            }
        }
    }
}
