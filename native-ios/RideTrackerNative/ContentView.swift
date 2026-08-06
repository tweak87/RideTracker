import SwiftUI

enum AppSection: String, CaseIterable, Identifiable {
    case home, record, rides, map
    var id: String { rawValue }
    var title: String {
        switch self {
        case .home: "Übersicht"
        case .record: "Neue Fahrt"
        case .rides: "Fahrten"
        case .map: "Karte"
        }
    }
    var icon: String {
        switch self {
        case .home: "house.fill"
        case .record: "record.circle"
        case .rides: "list.bullet.rectangle"
        case .map: "map.fill"
        }
    }
}

struct ContentView: View {
    @EnvironmentObject private var recorder: SensorRecorder
    @State private var section: AppSection = .home

    var body: some View {
        TabView(selection: $section) {
            DashboardView(section: $section).tag(AppSection.home)
                .tabItem { Label("Start", systemImage: AppSection.home.icon) }
            RecordingView().tag(AppSection.record)
                .tabItem { Label("Aufzeichnen", systemImage: AppSection.record.icon) }
            PlaceholderView(title: "Meine Fahrten", icon: "list.bullet.rectangle", text: "Hier erscheinen lokal gespeicherte RidePackages. Listen-, Such- und Detailansicht folgen im nächsten Datenbank-Schritt.").tag(AppSection.rides)
                .tabItem { Label("Fahrten", systemImage: AppSection.rides.icon) }
            PlaceholderView(title: "Parkkarte", icon: "map.fill", text: "Hier werden aufgezeichnete Fahrten, Parks und später Community-Master-Tracks auf OpenStreetMap dargestellt.").tag(AppSection.map)
                .tabItem { Label("Karte", systemImage: AppSection.map.icon) }
        }
    }
}

private struct DashboardView: View {
    @Binding var section: AppSection
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("RideTracker").font(.largeTitle.bold())
                        Text("Aufzeichnen, auswerten und gemeinsam präzisere Achterbahn-Strecken aufbauen.").foregroundStyle(.secondary)
                    }
                    MenuCard(title: "Neue Fahrt", subtitle: "Kalibrieren, Kamera und Sensoren gemeinsam starten", icon: "record.circle.fill") { section = .record }
                    MenuCard(title: "Meine Fahrten", subtitle: "Gespeicherte RidePackages und Auswertungen", icon: "list.bullet.rectangle.fill") { section = .rides }
                    MenuCard(title: "Karte", subtitle: "Parks, Bahnen und aufgezeichnete Strecken", icon: "map.fill") { section = .map }
                    Text("Community-Ziel").font(.headline)
                    Text("Mehrfach aufgezeichnete Fahrten werden später robust ausgerichtet, von Ausreißern bereinigt und zu versionierten Master-Tracks zusammengeführt.").font(.callout).foregroundStyle(.secondary)
                }.padding()
            }.navigationTitle("Übersicht")
        }
    }
}

private struct RecordingView: View {
    @EnvironmentObject private var recorder: SensorRecorder
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
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Aufnahme vorbereiten").font(.headline)
                        Picker("Gerätekante nach vorne", selection: $recorder.forwardEdge) {
                            ForEach(ForwardEdge.allCases) { edge in Text(edge.title).tag(edge) }
                        }.pickerStyle(.segmented)
                        Toggle("Video synchron aufzeichnen", isOn: $recorder.recordVideo).disabled(recorder.isRecording)
                        Text("Das Telefon in die endgültige Position bringen und ruhig halten. Beim Start werden Kalibrierung, Sensorlogger und Kamera in einem Ablauf ausgeführt.")
                            .font(.caption).foregroundStyle(.secondary)
                        Text("\(recorder.calibrationSampleCount) Lagewerte verfügbar").font(.caption2).foregroundStyle(.secondary)
                    }.padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Status").font(.caption).foregroundStyle(.secondary)
                        Text(recorder.status)
                        Text(recorder.videoRecorder.status).font(.caption).foregroundStyle(.secondary)
                    }.frame(maxWidth: .infinity, alignment: .leading).padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))

                    Button("Berechtigungen vorbereiten") { recorder.requestPermissions() }.buttonStyle(.bordered)
                    Button(recorder.isRecording ? "Aufnahme stoppen" : "Kalibrieren & Aufnahme starten") {
                        if recorder.isRecording { recorder.stop() }
                        else { recorder.calibrateNow(); recorder.start() }
                    }.buttonStyle(.borderedProminent).tint(recorder.isRecording ? .red : .blue)
                    Button("RidePackage speichern") { _ = try? recorder.saveSession() }
                        .buttonStyle(.bordered).disabled(recorder.isRecording || recorder.samples.isEmpty)
                }.padding()
            }.navigationTitle("Neue Fahrt")
        }
    }
}

private struct MenuCard: View {
    let title: String; let subtitle: String; let icon: String; let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: icon).font(.title).frame(width: 42)
                VStack(alignment: .leading, spacing: 4) { Text(title).font(.headline); Text(subtitle).font(.caption).foregroundStyle(.secondary) }
                Spacer(); Image(systemName: "chevron.right").foregroundStyle(.secondary)
            }.padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18))
        }.buttonStyle(.plain)
    }
}

private struct PlaceholderView: View {
    let title: String; let icon: String; let text: String
    var body: some View {
        NavigationStack { ContentUnavailableView(title, systemImage: icon, description: Text(text)).navigationTitle(title) }
    }
}

private struct MetricCard: View {
    let title: String; let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) { Text(title).font(.caption).foregroundStyle(.secondary); Text(value).font(.title3.bold()).monospacedDigit() }
            .frame(maxWidth: .infinity, alignment: .leading).padding().background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}
