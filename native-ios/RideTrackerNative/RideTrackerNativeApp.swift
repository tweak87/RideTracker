import SwiftUI

@main
struct RideTrackerNativeApp: App {
    @StateObject private var recorder = SensorRecorder()
    @StateObject private var profiles = UserProfileStore()

    var body: some Scene {
        WindowGroup {
            AppShellView()
                .environmentObject(recorder)
                .environmentObject(profiles)
        }
    }
}
