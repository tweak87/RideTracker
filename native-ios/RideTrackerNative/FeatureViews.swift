import Foundation
import SwiftUI

struct LocalRideEntry: Identifiable {
    let id = UUID()
    let url: URL
    let title: String
    let date: Date
    let distanceMeters: Double
    let durationSeconds: Double
    let latitude: Double?
    let longitude: Double?
}

enum LocalRideLibrary {
    static func load() -> [LocalRideEntry] {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let urls = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
        return urls.filter { $0.lastPathComponent.hasSuffix(".ride.json") }.compactMap { url in
            guard let data = try? Data(contentsOf: url), let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
            let summary = root["summary"] as? [String: Any]
            let context = root["context"] as? [String: Any]
            let samples = root["samples"] as? [[String: Any]]
            let firstGps = samples?.first { ($0["latitude"] as? Double) != nil && ($0["longitude"] as? Double) != nil }
            let title = (context?["rideName"] as? String) ?? (context?["parkName"] as? String) ?? url.deletingPathExtension().lastPathComponent
            let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return LocalRideEntry(
                url: url,
                title: title,
                date: date,
                distanceMeters: summary?["distanceMeters"] as? Double ?? 0,
                durationSeconds: summary?["durationSeconds"] as? Double ?? 0,
                latitude: firstGps?["latitude"] as? Double,
                longitude: firstGps?["longitude"] as? Double
            )
        }.sorted { $0.date > $1.date }
    }
}

struct RideLibraryView: View {
    @State private var rides = LocalRideLibrary.load()
    var body: some View {
        NavigationStack {
            Group {
                if rides.isEmpty {
                    ContentUnavailableView("Keine Fahrten", systemImage: "list.bullet.rectangle", description: Text("Gespeicherte RidePackages erscheinen hier automatisch."))
                } else {
                    List(rides) { ride in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(ride.title).font(.headline)
                            Text(ride.date.formatted(date: .abbreviated, time: .shortened)).font(.caption).foregroundStyle(.secondary)
                            Text(String(format: "%.2f km · %.0f s", ride.distanceMeters / 1000, ride.durationSeconds)).font(.caption.monospacedDigit())
                        }
                    }
                }
            }
            .navigationTitle("Meine Fahrten")
            .toolbar { Button("Neu laden") { rides = LocalRideLibrary.load() } }
        }
    }
}

struct RideMapListView: View {
    @State private var rides = LocalRideLibrary.load().filter { $0.latitude != nil && $0.longitude != nil }
    var body: some View {
        NavigationStack {
            Group {
                if rides.isEmpty {
                    ContentUnavailableView("Keine GPS-Fahrten", systemImage: "map", description: Text("Fahrten mit Standortdaten werden hier nach Park und Startposition aufgeführt."))
                } else {
                    List(rides) { ride in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(ride.title).font(.headline)
                            Text(String(format: "%.5f, %.5f", ride.latitude ?? 0, ride.longitude ?? 0)).font(.caption.monospacedDigit())
                            Text(String(format: "%.2f km", ride.distanceMeters / 1000)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Parks & Strecken")
            .toolbar { Button("Neu laden") { rides = LocalRideLibrary.load().filter { $0.latitude != nil && $0.longitude != nil } } }
        }
    }
}

struct NativeSettingsView: View {
    @EnvironmentObject private var recorder: SensorRecorder
    var body: some View {
        NavigationStack {
            Form {
                Section("Aufnahme & Kalibrierung") {
                    Picker("Gerätekante nach vorne", selection: $recorder.forwardEdge) {
                        ForEach(ForwardEdge.allCases) { edge in Text(edge.title).tag(edge) }
                    }
                    Text("Diese Einstellungen werden außerhalb der Aufnahme verwaltet und beim nächsten Start verwendet.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("Externe Sensoren") {
                    Text(recorder.accessoryManager.connectedName ?? recorder.accessoryManager.state.rawValue)
                    Button("Pulsuhr suchen") { recorder.accessoryManager.scanHeartRate() }
                    Button("Erstes Gerät verbinden") { recorder.accessoryManager.connectFirst() }
                        .disabled(recorder.accessoryManager.discoveredNames.isEmpty)
                }
                Section("Berechtigungen") {
                    Button("Kamera, Mikrofon und Standort vorbereiten") { recorder.requestPermissions() }
                }
            }.navigationTitle("Einstellungen")
        }
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
        NavigationStack {
            Form {
                Section("Darstellung") {
                    LabeledContent("Panel-Transparenz") { Slider(value: $panelOpacity, in: 0.15...1) }
                    LabeledContent("HUD-Größe") { Slider(value: $scale, in: 0.5...1.8) }
                    LabeledContent("Schriftgröße") { Slider(value: $fontScale, in: 0.7...1.6) }
                }
                Section("Elemente") {
                    Toggle("Puls", isOn: $showPulse)
                    Toggle("G-Kräfte", isOn: $showG)
                    Toggle("Geschwindigkeit", isOn: $showSpeed)
                    Toggle("Vibration", isOn: $showVibration)
                }
                Section { Text("Die Werte werden lokal gespeichert und für Live-Anzeige sowie späteren Videoexport verwendet.").font(.caption).foregroundStyle(.secondary) }
            }.navigationTitle("HUD-Konfiguration")
        }
    }
}
