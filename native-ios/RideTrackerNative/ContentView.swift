import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var recorder: SensorRecorder

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    HStack(spacing: 12) {
                        MetricCard(title: "Relative Höhe", value: String(format: "%.1f m", recorder.relativeAltitude))
                        MetricCard(title: "Geschwindigkeit", value: String(format: "%.1f km/h", recorder.speedKmh))
                    }
                    HStack(spacing: 12) {
                        MetricCard(title: "Fahrphase", value: recorder.ridePhase)
                        MetricCard(title: "Qualität", value: "\(recorder.qualityScore)/100")
                    }
                    HStack(spacing: 12) {
                        MetricCard(title: "Strecke", value: String(format: "%.1f m", recorder.filteredDistance))
                        MetricCard(title: "Samples", value: "\(recorder.samples.count)")
                    }
                    MetricCard(
                        title: "GPS-Filter",
                        value: "\(recorder.acceptedLocationCount) ✓ / \(recorder.rejectedLocationCount) verworfen"
                    )

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Status").font(.caption).foregroundStyle(.secondary)
                        Text(recorder.status).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding()
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))

                    Button("Berechtigungen anfragen") { recorder.requestPermissions() }
                        .buttonStyle(.bordered)

                    Button(recorder.isRecording ? "Aufnahme stoppen" : "Aufnahme starten") {
                        recorder.isRecording ? recorder.stop() : recorder.start()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(recorder.isRecording ? .red : .blue)
                }
                .padding()
            }
            .navigationTitle("RideTracker Native")
        }
    }
}

private struct MetricCard: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.title3.bold()).monospacedDigit()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}
