import SwiftUI

struct ProfileRootView: View {
    @EnvironmentObject private var profiles: UserProfileStore
    @State private var showProfiles = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            ContentView()
            Button {
                showProfiles = true
            } label: {
                Label(profiles.activeProfile.name, systemImage: "person.crop.circle.fill")
                    .font(.caption.bold())
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial, in: Capsule())
            }
            .padding(.top, 8)
            .padding(.trailing, 12)
        }
        .sheet(isPresented: $showProfiles) { ProfileManagementView() }
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
                        Button {
                            profiles.select(profile.id)
                        } label: {
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
