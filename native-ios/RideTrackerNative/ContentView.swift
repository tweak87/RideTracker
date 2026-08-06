import Foundation
import SwiftUI

enum AppSection: String, CaseIterable, Identifiable {
    case home, record, rides, map, statistics, achievements
    var id: String { rawValue }
    var title: String {
        switch self {
        case .home: "Übersicht"
        case .record: "Neue Fahrt"
        case .rides: "Fahrten"
        case .map: "Karte"
        case .statistics: "Statistiken"
        case .achievements: "Achievements"
        }
    }
    var icon: String {
        switch self {
        case .home: "house.fill"
        case .record: "record.circle"
        case .rides: "list.bullet.rectangle"
        case .map: "map.fill"
        case .statistics: "chart.bar.fill"
        case .achievements: "trophy.fill"
        }
    }
}

struct ContentView: View {
    @State private var section: AppSection = .home
    var body: some View {
        TabView(selection: $section) {
            DashboardView(section: $section).tag(AppSection.home).tabItem { Label("Start", systemImage: AppSection.home.icon) }
            RecordingView().tag(AppSection.record).tabItem { Label("Aufzeichnen", systemImage: AppSection.record.icon) }
            PlaceholderView(title: "Meine Fahrten", icon: "list.bullet.rectangle", text: "Hier erscheinen lokal gespeicherte RidePackages.").tag(AppSection.rides).tabItem { Label("Fahrten", systemImage: AppSection.rides.icon) }
            PlaceholderView(title: "Parkkarte", icon: "map.fill", text: "Hier werden aufgezeichnete Fahrten, Parks und Community-Master-Tracks dargestellt.").tag(AppSection.map).tabItem { Label("Karte", systemImage: AppSection.map.icon) }
            StatisticsView().tag(AppSection.statistics).tabItem { Label("Statistik", systemImage: AppSection.statistics.icon) }
            AchievementsView().tag(AppSection.achievements).tabItem { Label("Erfolge", systemImage: AppSection.achievements.icon) }
        }
    }
}

private struct DashboardView: View {
    @Binding var section: AppSection
    var body: some View {
        NavigationStack { ScrollView { VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) { Text("RideTracker").font(.largeTitle.bold()); Text("Aufzeichnen, auswerten und gemeinsam präzisere Achterbahn-Strecken aufbauen.").foregroundStyle(.secondary) }
            MenuCard(title: "Neue Fahrt", subtitle: "Kalibrierung, Sensoren und optional Video gemeinsam starten", icon: "record.circle.fill") { section = .record }
            MenuCard(title: "Meine Fahrten", subtitle: "Gespeicherte RidePackages und Auswertungen", icon: "list.bullet.rectangle.fill") { section = .rides }
            MenuCard(title: "Karte", subtitle: "Parks, Bahnen und aufgezeichnete Strecken", icon: "map.fill") { section = .map }
            MenuCard(title: "Statistiken", subtitle: "Gefahrene Kilometer, Fahrzeit und persönliche Rekorde", icon: "chart.bar.fill") { section = .statistics }
            MenuCard(title: "Achievements", subtitle: "Meilensteine und persönliche Erfolge", icon: "trophy.fill") { section = .achievements }
        }.padding() }.navigationTitle("Übersicht") }
    }
}

private struct RecordingView: View {
    @EnvironmentObject private var recorder: SensorRecorder
    @State private var showStartChoice = false
    @State private var showAdvanced = false
    @State private var showNotes = false
    @State private var showSensors = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    HStack(spacing: 12) {
                        MetricCard(title: "Höhe", value: String(format: "%.1f m", recorder.relativeAltitude))
                        MetricCard(title: "Tempo", value: String(format: "%.1f km/h", recorder.speedKmh))
                    }
                    HStack(spacing: 12) {
                        MetricCard(title: "Phase", value: recorder.ridePhase)
                        MetricCard(title: "Qualität", value: "\(recorder.qualityScore)/100")
                    }
                    DisclosureGroup("Aufnahme vorbereiten", isExpanded: $showAdvanced) {
                        VStack(alignment: .leading, spacing: 10) {
                            Picker("Gerätekante nach vorne", selection: $recorder.forwardEdge) { ForEach(ForwardEdge.allCases) { edge in Text(edge.title).tag(edge) } }.pickerStyle(.segmented)
                            Text("Telefon in die endgültige Position bringen und ruhig halten. Die Videoauswahl erfolgt beim Start.").font(.caption).foregroundStyle(.secondary)
                            Text("\(recorder.calibrationSampleCount) Lagewerte verfügbar").font(.caption2).foregroundStyle(.secondary)
                        }.padding(.top, 8)
                    }.padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                    DisclosureGroup("Notizen & Kommentare", isExpanded: $showNotes) {
                        VStack(spacing: 10) {
                            TextField("Private Notiz", text: $recorder.privateNote, axis: .vertical).textFieldStyle(.roundedBorder)
                            TextField("Kommentar für spätere Community-Freigabe", text: $recorder.communityComment, axis: .vertical).textFieldStyle(.roundedBorder)
                        }.padding(.top, 8)
                    }.padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                    DisclosureGroup("Externe Sensoren", isExpanded: $showSensors) {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack { Text("Puls"); Spacer(); Text(recorder.accessoryManager.latestHeartRate.map { "\($0) bpm" } ?? "–").font(.title3.bold()).monospacedDigit() }
                            Text(recorder.accessoryManager.connectedName ?? recorder.accessoryManager.state.rawValue).font(.caption).foregroundStyle(.secondary)
                            HStack { Button("Pulsuhr suchen") { recorder.accessoryManager.scanHeartRate() }; Button("Erstes Gerät verbinden") { recorder.accessoryManager.connectFirst() }.disabled(recorder.accessoryManager.discoveredNames.isEmpty) }.buttonStyle(.bordered)
                        }.padding(.top, 8)
                    }.padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                    VStack(alignment: .leading, spacing: 6) { Text("Status").font(.caption).foregroundStyle(.secondary); Text(recorder.status); Text(recorder.videoRecorder.status).font(.caption).foregroundStyle(.secondary) }.frame(maxWidth: .infinity, alignment: .leading).padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
                    Button("Berechtigungen vorbereiten") { recorder.requestPermissions() }.buttonStyle(.bordered)
                    Button(recorder.isRecording ? "Aufnahme stoppen" : "Kalibrieren & Fahrt starten") { if recorder.isRecording { recorder.stop() } else { showStartChoice = true } }.buttonStyle(.borderedProminent).tint(recorder.isRecording ? .red : .blue)
                    Button("RidePackage speichern") { _ = try? recorder.saveSession() }.buttonStyle(.bordered).disabled(recorder.isRecording || recorder.samples.isEmpty)
                }.padding()
            }.navigationTitle("Neue Fahrt")
            .confirmationDialog("Video mit aufzeichnen?", isPresented: $showStartChoice, titleVisibility: .visible) {
                Button("Mit Video starten") { recorder.calibrateAndStart(video: true) }
                Button("Ohne Video starten") { recorder.calibrateAndStart(video: false) }
                Button("Abbrechen", role: .cancel) {}
            } message: { Text("Kalibrierung, Sensoren und Kamera werden in einem Ablauf gestartet. Stoppen beendet alle aktiven Aufzeichnungen.") }
        }
    }
}

private struct LocalRideStats {
    var rides = 0
    var distanceMeters = 0.0
    var durationSeconds = 0.0
    var bestQuality = 0
    var maxSpeedKmh = 0.0
    var maxG = 0.0

    static func load() -> LocalRideStats {
        var result = LocalRideStats()
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let urls = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        for url in urls where url.lastPathComponent.hasSuffix(".ride.json") {
            guard let data = try? Data(contentsOf: url), let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
            result.rides += 1
            if let summary = root["summary"] as? [String: Any] {
                result.distanceMeters += summary["distanceMeters"] as? Double ?? 0
                result.durationSeconds += summary["durationSeconds"] as? Double ?? 0
                result.bestQuality = max(result.bestQuality, summary["qualityScore"] as? Int ?? 0)
            }
            if let samples = root["samples"] as? [[String: Any]] {
                for sample in samples {
                    result.maxSpeedKmh = max(result.maxSpeedKmh, (sample["speedMS"] as? Double ?? 0) * 3.6)
                    result.maxG = max(result.maxG, sample["totalG"] as? Double ?? 0)
                }
            }
        }
        return result
    }
}

private struct StatisticsView: View {
    @State private var stats = LocalRideStats()
    var body: some View {
        NavigationStack { ScrollView { LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            MetricCard(title: "Fahrten", value: "\(stats.rides)")
            MetricCard(title: "Gesamtstrecke", value: String(format: "%.2f km", stats.distanceMeters / 1000))
            MetricCard(title: "Fahrzeit", value: String(format: "%.0f min", stats.durationSeconds / 60))
            MetricCard(title: "Max. Tempo", value: String(format: "%.1f km/h", stats.maxSpeedKmh))
            MetricCard(title: "Max. Gesamt-G", value: String(format: "%.2f g", stats.maxG))
            MetricCard(title: "Beste Qualität", value: "\(stats.bestQuality)/100")
        }.padding() }.navigationTitle("Statistiken").onAppear { stats = .load() } }
    }
}

private struct AchievementsView: View {
    @State private var stats = LocalRideStats()
    var body: some View {
        NavigationStack { List {
            AchievementRow(title: "Erste Fahrt", detail: "Eine Fahrt speichern", done: stats.rides >= 1)
            AchievementRow(title: "Stammgast", detail: "10 Fahrten speichern", done: stats.rides >= 10)
            AchievementRow(title: "Kilometersammler", detail: "10 km Gesamtstrecke", done: stats.distanceMeters >= 10_000)
            AchievementRow(title: "Datenprofi", detail: "Eine Fahrt mit Qualität 90+", done: stats.bestQuality >= 90)
            AchievementRow(title: "High Speed", detail: "Mindestens 100 km/h messen", done: stats.maxSpeedKmh >= 100)
            AchievementRow(title: "G-Force", detail: "Mindestens 4,0 g messen", done: stats.maxG >= 4)
        }.navigationTitle("Achievements").onAppear { stats = .load() } }
    }
}

private struct AchievementRow: View {
    let title: String; let detail: String; let done: Bool
    var body: some View { HStack { Image(systemName: done ? "checkmark.seal.fill" : "circle").foregroundStyle(done ? .green : .secondary); VStack(alignment: .leading) { Text(title).font(.headline); Text(detail).font(.caption).foregroundStyle(.secondary) } } }
}

private struct MenuCard: View {
    let title: String; let subtitle: String; let icon: String; let action: () -> Void
    var body: some View { Button(action: action) { HStack(spacing: 14) { Image(systemName: icon).font(.title).frame(width: 42); VStack(alignment: .leading, spacing: 4) { Text(title).font(.headline); Text(subtitle).font(.caption).foregroundStyle(.secondary) }; Spacer(); Image(systemName: "chevron.right").foregroundStyle(.secondary) }.padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18)) }.buttonStyle(.plain) }
}

private struct PlaceholderView: View {
    let title: String; let icon: String; let text: String
    var body: some View { NavigationStack { ContentUnavailableView(title, systemImage: icon, description: Text(text)).navigationTitle(title) } }
}

private struct MetricCard: View {
    let title: String; let value: String
    var body: some View { VStack(alignment: .leading, spacing: 6) { Text(title).font(.caption).foregroundStyle(.secondary); Text(value).font(.title3.bold()).monospacedDigit() }.frame(maxWidth: .infinity, alignment: .leading).padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16)) }
}
