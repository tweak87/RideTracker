import SwiftUI

@main
struct RideTrackerNativeApp: App {
    @StateObject private var recorder = SensorRecorder()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(recorder)
        }
    }
}
