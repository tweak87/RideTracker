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
                ForEach(Array(elements.enumerated()), id: \.offset) { _, element in
                    if element.visible {
                        panel(element, size: proxy.size)
                    }
                }
            }
        }
        .allowsHitTesting(false)
    }

    @ViewBuilder private func panel(_ element: LiveHudElement, size: CGSize) -> some View {
        let index = load(portrait: size.height > size.width).firstIndex(where: { $0.x == element.x && $0.y == element.y }) ?? 0
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
            .init(x:.04,y:.04,width:.42,height:.15),.init(x:.54,y:.04,width:.42,height:.15),.init(x:.18,y:.22,width:.64,height:.30),.init(x:.07,y:.54,width:.86,height:.10),.init(x:.05,y:.69,width:.43,height:.25),.init(x:.52,y:.69,width:.43,height:.25)
        ] : [
            .init(x:.02,y:.62,width:.29,height:.31),.init(x:.42,y:.48,width:.17,height:.30),.init(x:.33,y:.84,width:.34,height:.11),.init(x:.70,y:.61,width:.28,height:.33),.init(x:.80,y:.06,width:.18,height:.24),.init(x:.03,y:.06,width:.24,height:.18)
        ]
    }
}
