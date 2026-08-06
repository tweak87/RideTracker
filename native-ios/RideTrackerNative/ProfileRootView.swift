import SwiftUI

struct ProfileRootView: View {
    @EnvironmentObject private var profiles: UserProfileStore
    @EnvironmentObject private var recorder: SensorRecorder
    @State private var showProfiles = false
    @State private var showRideMedia = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            ContentView()

            HStack(spacing: 8) {
                Button { showRideMedia = true } label: {
                    Image(systemName: "photo.on.rectangle.angled")
                        .font(.caption.bold())
                        .padding(10)
                        .background(.ultraThinMaterial, in: Circle())
                }
                Button { showProfiles = true } label: {
                    Label(profiles.activeProfile.name, systemImage: "person.crop.circle.fill")
                        .font(.caption.bold())
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.ultraThinMaterial, in: Capsule())
                }
            }
            .padding(.top, 8)
            .padding(.trailing, 12)

            if recorder.isRecording {
                VStack {
                    Spacer()
                    HStack(spacing: 10) {
                        Circle().fill(.red).frame(width: 10, height: 10)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Aufnahme läuft").font(.headline)
                            Text("Sensoren und optional Video werden aufgezeichnet.").font(.caption).opacity(0.8)
                        }
                        Spacer()
                        Button("Stoppen", role: .destructive) { recorder.stop() }
                            .buttonStyle(.borderedProminent)
                            .tint(.red)
                    }
                    .padding(12)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                    .padding(.horizontal, 10)
                    .padding(.bottom, 6)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .zIndex(100)
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
