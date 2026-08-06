import SwiftUI

private struct LiveHudElement: Codable {
    var x: Double; var y: Double; var width: Double; var height: Double
    var scale: Double = 1; var opacity: Double = 1; var visible: Bool = true
}
private struct LiveHudProfile: Codable { var elements: [LiveHudElement] }

struct NativeLiveHUDOverlay: View {
    @ObservedObject var recorder: SensorRecorder
    @AppStorage("nativeHudPortrait") private var portraitJSON = ""
    @AppStorage("nativeHudLandscape") private var landscapeJSON = ""

    var body: some View {
        GeometryReader { proxy in
            let portrait = proxy.size.height > proxy.size.width
            let elements = load(portrait: portrait)
            ZStack {
                ForEach(Array(elements.enumerated()), id: \.offset) { index, element in
                    if element.visible {
                        panel(element, index: index, size: proxy.size)
                    }
                }
            }
        }
        .allowsHitTesting(false)
    }

    @ViewBuilder private func panel(_ element: LiveHudElement, index: Int, size: CGSize) -> some View {
        let labels = ["PULS","G-KRÄFTE","G-ACHSEN","GESCHWINDIGKEIT","VIBRATION","FAHRDYNAMIK"]
        let latest = recorder.samples.last
        let values = [
            latest?.heartRateBpm.map { "\($0) BPM" } ?? "– BPM",
            String(format: "%.1f / %.1f G", latest?.lateralG ?? 0, latest?.normalG ?? 1),
            String(format: "LAT %+.1f · VERT %+.1f · LONG %+.1f", latest?.lateralG ?? 0, latest?.normalG ?? 1, latest?.longitudinalG ?? 0),
            String(format: "%.0f KM/H", recorder.speedKmh),
            "– m/s²",
            String(format: "%.2f G", latest?.totalG ?? 1)
        ]
        VStack(alignment: .leading, spacing: 4) {
            Text(labels[min(index, labels.count - 1)]).font(.caption2.weight(.semibold))
            Text(values[min(index, values.count - 1)]).font(.headline.monospacedDigit()).foregroundStyle(.cyan)
        }
        .padding(8)
        .frame(width: size.width * element.width * element.scale, height: size.height * element.height * element.scale, alignment: .center)
        .background(Color(red: 0.02, green: 0.08, blue: 0.09).opacity(0.86), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.cyan, lineWidth: 1.5))
        .opacity(element.opacity)
        .position(x: size.width * (element.x + element.width * element.scale / 2), y: size.height * (element.y + element.height * element.scale / 2))
    }

    private func load(portrait: Bool) -> [LiveHudElement] {
        let json = portrait ? portraitJSON : landscapeJSON
        if let data = json.data(using: .utf8), let profile = try? JSONDecoder().decode(LiveHudProfile.self, from: data) { return profile.elements }
        return portrait ? [
            .init(x:0.04,y:0.04,width:0.42,height:0.15),.init(x:0.54,y:0.04,width:0.42,height:0.15),.init(x:0.18,y:0.22,width:0.64,height:0.30),.init(x:0.07,y:0.54,width:0.86,height:0.10),.init(x:0.05,y:0.69,width:0.43,height:0.25),.init(x:0.52,y:0.69,width:0.43,height:0.25)
        ] : [
            .init(x:0.02,y:0.62,width:0.29,height:0.31),.init(x:0.42,y:0.48,width:0.17,height:0.30),.init(x:0.33,y:0.84,width:0.34,height:0.11),.init(x:0.70,y:0.61,width:0.28,height:0.33),.init(x:0.80,y:0.06,width:0.18,height:0.24),.init(x:0.03,y:0.06,width:0.24,height:0.18)
        ]
    }
}
