import SwiftUI

@main
struct RideTrackerNativeApp: App {
    @StateObject private var recorder = SensorRecorder()
    @StateObject private var profiles = UserProfileStore()

    var body: some Scene {
        WindowGroup {
            ProfileRootView()
                .environmentObject(recorder)
                .environmentObject(profiles)
        }
    }
}
