import SwiftUI

struct ProfileRootView: View {
    @EnvironmentObject private var profiles: UserProfileStore
    @EnvironmentObject private var recorder: SensorRecorder
    @State private var showProfiles = false
    @State private var showRideMedia = false

    var body: some View {
        ContentView()
            .safeAreaInset(edge: .top, spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "line.3.horizontal")
                        .font(.headline)
                        .frame(width: 38, height: 38)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
                    VStack(alignment: .leading, spacing: 1) {
                        Text("RideTracker").font(.headline)
                        Text("Fahrten · Telemetrie · Community")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 8)
                    Button { showRideMedia = true } label: {
                        Image(systemName: "photo.on.rectangle.angled")
                            .frame(width: 38, height: 38)
                            .background(.thinMaterial, in: Circle())
                    }
                    Button { showProfiles = true } label: {
                        Label(profiles.activeProfile.name, systemImage: "person.crop.circle.fill")
                            .font(.caption.bold())
                            .lineLimit(1)
                            .padding(.horizontal, 10)
                            .frame(height: 38)
                            .background(.thinMaterial, in: Capsule())
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial)
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if recorder.isRecording {
                    HStack(spacing: 10) {
                        Circle().fill(.red).frame(width: 10, height: 10)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Aufnahme läuft").font(.headline)
                            Text("Sensoren und optional Video werden aufgezeichnet.")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Stoppen", role: .destructive) { recorder.stop() }
                            .buttonStyle(.borderedProminent)
                            .tint(.red)
                    }
                    .padding(12)
                    .background(.ultraThinMaterial)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.easeInOut, value: recorder.isRecording)
            .sheet(isPresented: $showProfiles) { ProfileManagementView() }
            .sheet(isPresented: $showRideMedia) { RideMediaView(profiles: profiles).environmentObject(profiles) }
    }
}

private struct ProfileManagementView: View {
    @EnvironmentObject private var profiles: UserProfileStore
    @Environment(\.dismiss) private var dismiss
    @State private var newName = ""
    @State private var showReset = false
    @State private var resetMessage: String?

    var body: some View {
        NavigationStack {
            List {
                Section("Angemeldeter Benutzer") {
                    ForEach(profiles.profiles) { profile in
                        Button { profiles.select(profile.id) } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(profile.name)
                                    Text("Lokales Profil").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if profile.id == profiles.activeProfileID { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
                            }
                        }
                    }
                }
                Section("Benutzer anlegen") {
                    TextField("Benutzername", text: $newName)
                    Button("Profil anlegen und anmelden") { profiles.create(name: newName); newName = "" }
                        .disabled(newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                Section("Daten") {
                    Button("Statistiken und Fahrten zurücksetzen", role: .destructive) { showReset = true }
                    if let resetMessage { Text(resetMessage).font(.caption).foregroundStyle(.secondary) }
                }
                Section {
                    Text("Diese Anmeldung ist lokal auf dem Gerät. Cloud-Konto und geräteübergreifende Synchronisierung folgen mit dem Community-Backend.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Benutzer")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fertig") { dismiss() } } }
            .confirmationDialog("Daten von \(profiles.activeProfile.name) zurücksetzen?", isPresented: $showReset) {
                Button("Endgültig löschen", role: .destructive) {
                    do { try profiles.resetActiveData(); resetMessage = "Lokale Fahrten und Statistiken wurden zurückgesetzt." }
                    catch { resetMessage = error.localizedDescription }
                }
                Button("Abbrechen", role: .cancel) {}
            }
        }
    }
}
