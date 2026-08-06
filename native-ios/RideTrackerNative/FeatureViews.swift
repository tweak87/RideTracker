import AVKit
import Foundation
import SwiftUI

struct LocalRideEntry: Identifiable {
    let id: String
    let url: URL
    var title: String
    var park: String
    let date: Date
    let distanceMeters: Double
    let durationSeconds: Double
    let latitude: Double?
    let longitude: Double?
    var privateNote: String
    var communityComment: String
    var rating: Int
    let videoURL: URL?
}

enum LocalRideLibrary {
    static func load() -> [LocalRideEntry] {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let urls = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
        return urls.filter { $0.lastPathComponent.hasSuffix(".ride.json") }.compactMap { url in
            guard let data = try? Data(contentsOf: url), let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
            let id = root["id"] as? String ?? url.deletingPathExtension().lastPathComponent
            let summary = root["summary"] as? [String: Any]
            let context = root["context"] as? [String: Any]
            let notes = root["notes"] as? [String: Any]
            let video = root["video"] as? [String: Any]
            let samples = root["samples"] as? [[String: Any]]
            let firstGps = samples?.first { ($0["latitude"] as? Double) != nil && ($0["longitude"] as? Double) != nil }
            let filename = video?["filename"] as? String
            let videoURL = filename.map { directory.appendingPathComponent($0) }.flatMap { FileManager.default.fileExists(atPath: $0.path) ? $0 : nil }
            let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return LocalRideEntry(
                id: id,
                url: url,
                title: (context?["rideName"] as? String)?.nonEmpty ?? "Unbenannte Bahn",
                park: (context?["parkName"] as? String)?.nonEmpty ?? "Park nicht erkannt",
                date: date,
                distanceMeters: summary?["distanceMeters"] as? Double ?? 0,
                durationSeconds: summary?["durationSeconds"] as? Double ?? 0,
                latitude: firstGps?["latitude"] as? Double,
                longitude: firstGps?["longitude"] as? Double,
                privateNote: notes?["privateNote"] as? String ?? "",
                communityComment: notes?["communityComment"] as? String ?? "",
                rating: UserDefaults.standard.integer(forKey: "RideTracker.Rating.\(id)"),
                videoURL: videoURL
            )
        }.sorted { $0.date > $1.date }
    }

    static func save(_ ride: LocalRideEntry) throws {
        let data = try Data(contentsOf: ride.url)
        guard var root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        var context = root["context"] as? [String: Any] ?? [:]
        context["rideName"] = ride.title
        context["parkName"] = ride.park
        root["context"] = context
        var notes = root["notes"] as? [String: Any] ?? [:]
        notes["privateNote"] = ride.privateNote
        notes["communityComment"] = ride.communityComment
        root["notes"] = notes
        let updated = try JSONSerialization.data(withJSONObject: root, options: [.prettyPrinted, .sortedKeys])
        try updated.write(to: ride.url, options: .atomic)
        UserDefaults.standard.set(ride.rating, forKey: "RideTracker.Rating.\(ride.id)")
    }
}

private extension String { var nonEmpty: String? { trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : self } }

struct RideLibraryView: View {
    @State private var rides = LocalRideLibrary.load()
    var body: some View {
        NavigationStack {
            Group {
                if rides.isEmpty {
                    ContentUnavailableView("Keine Fahrten", systemImage: "list.bullet.rectangle", description: Text("Nur bewusst gespeicherte RidePackages erscheinen hier."))
                } else {
                    List(rides) { ride in
                        NavigationLink {
                            RideDetailEditor(ride: ride) { rides = LocalRideLibrary.load() }
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(ride.title).font(.headline)
                                Text(ride.park).font(.caption).foregroundStyle(.secondary)
                                Text(ride.date.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                                Text(String(format: "%.2f km · %.0f s", ride.distanceMeters / 1000, ride.durationSeconds)).font(.caption.monospacedDigit())
                            }
                        }
                    }
                }
            }
            .navigationTitle("Meine Fahrten")
            .toolbar { Button("Neu laden") { rides = LocalRideLibrary.load() } }
        }
    }
}

private struct RideDetailEditor: View {
    @State var ride: LocalRideEntry
    let onSaved: () -> Void
    @State private var saved = false
    var body: some View {
        Form {
            if let url = ride.videoURL {
                Section("Videovorschau") { VideoPlayer(player: AVPlayer(url: url)).frame(minHeight: 220).aspectRatio(16/9, contentMode: .fit) }
            } else {
                Section("Videovorschau") { Text("Für diese Fahrt ist keine Videodatei verfügbar.").foregroundStyle(.secondary) }
            }
            Section("Fahrt") {
                TextField("Bahn / Titel", text: $ride.title)
                TextField("Freizeitpark", text: $ride.park)
                Picker("Bewertung", selection: $ride.rating) { Text("Keine").tag(0); ForEach(1...5, id: \.self) { Text("\($0) Sterne").tag($0) } }
            }
            Section("Notizen") {
                TextField("Private Notiz", text: $ride.privateNote, axis: .vertical).lineLimit(3...8)
                TextField("Kommentar", text: $ride.communityComment, axis: .vertical).lineLimit(3...8)
            }
            Section {
                Button("Änderungen speichern") { try? LocalRideLibrary.save(ride); saved = true; onSaved() }
                if saved { Text("Gespeichert").foregroundStyle(.green) }
            }
        }.navigationTitle(ride.title)
    }
}

struct RideMapListView: View {
    @State private var rides = LocalRideLibrary.load().filter { $0.latitude != nil && $0.longitude != nil }
    var body: some View {
        NavigationStack {
            Group {
                if rides.isEmpty { ContentUnavailableView("Keine GPS-Fahrten", systemImage: "map", description: Text("Fahrten mit Standortdaten werden hier nach Park und Startposition aufgeführt.")) }
                else { List(rides) { ride in VStack(alignment: .leading, spacing: 5) { Text(ride.title).font(.headline); Text(ride.park).font(.caption).foregroundStyle(.secondary); Text(String(format: "%.5f, %.5f", ride.latitude ?? 0, ride.longitude ?? 0)).font(.caption.monospacedDigit()); Text(String(format: "%.2f km", ride.distanceMeters / 1000)).font(.caption).foregroundStyle(.secondary) } } }
            }.navigationTitle("Parks & Strecken").toolbar { Button("Neu laden") { rides = LocalRideLibrary.load().filter { $0.latitude != nil && $0.longitude != nil } } }
        }
    }
}

struct NativeSettingsView: View {
    @EnvironmentObject private var recorder: SensorRecorder
    var body: some View {
        NavigationStack { Form {
            Section("Aufnahme & Kalibrierung") { Picker("Gerätekante nach vorne", selection: $recorder.forwardEdge) { ForEach(ForwardEdge.allCases) { edge in Text(edge.title).tag(edge) } }; Text("Diese Einstellungen werden außerhalb der Aufnahme verwaltet und beim nächsten Start verwendet.").font(.caption).foregroundStyle(.secondary) }
            Section("Externe Sensoren") { Text(recorder.accessoryManager.connectedName ?? recorder.accessoryManager.state.rawValue); Button("Pulsuhr suchen") { recorder.accessoryManager.scanHeartRate() }; Button("Erstes Gerät verbinden") { recorder.accessoryManager.connectFirst() }.disabled(recorder.accessoryManager.discoveredNames.isEmpty) }
            Section("Berechtigungen") { Button("Kamera, Mikrofon und Standort vorbereiten") { recorder.requestPermissions() } }
        }.navigationTitle("Einstellungen") }
    }
}

struct NativeHUDSettingsView: View {
    @AppStorage("hudPanelOpacity") private var panelOpacity = 0.86
    @AppStorage("hudScale") private var scale = 1.0
    @AppStorage("hudFontScale") private var fontScale = 1.0
    @AppStorage("hudShowPulse") private var showPulse = true
    @AppStorage("hudShowG") private var showG = true
    @AppStorage("hudShowSpeed") private var showSpeed = true
    @AppStorage("hudShowVibration") private var showVibration = true
    var body: some View {
        NavigationStack { Form {
            Section("Darstellung") { LabeledContent("Panel-Transparenz") { Slider(value: $panelOpacity, in: 0.15...1) }; LabeledContent("HUD-Größe") { Slider(value: $scale, in: 0.5...1.8) }; LabeledContent("Schriftgröße") { Slider(value: $fontScale, in: 0.7...1.6) } }
            Section("Elemente") { Toggle("Puls", isOn: $showPulse); Toggle("G-Kräfte", isOn: $showG); Toggle("Geschwindigkeit", isOn: $showSpeed); Toggle("Vibration", isOn: $showVibration) }
            Section { Text("Die Werte werden lokal gespeichert und für Live-Anzeige sowie späteren Videoexport verwendet.").font(.caption).foregroundStyle(.secondary) }
        }.navigationTitle("HUD-Konfiguration") }
    }
}
