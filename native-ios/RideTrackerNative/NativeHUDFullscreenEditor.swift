import SwiftUI

private struct NativeHUDElement: Identifiable, Codable {
    let id: String
    var x: Double
    var y: Double
    var width: Double
    var height: Double
    var scale: Double = 1
    var opacity: Double = 1
    var visible: Bool = true
}

private struct NativeHUDProfile: Codable {
    var elements: [NativeHUDElement]
}

private enum NativeHUDOrientation: String, CaseIterable, Identifiable {
    case portrait, landscape
    var id: String { rawValue }
    var title: String { self == .portrait ? "Hochformat 9:16" : "Querformat 16:9" }
}

struct NativeHUDFullscreenEditor: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("nativeHudPortrait") private var portraitJSON = ""
    @AppStorage("nativeHudLandscape") private var landscapeJSON = ""
    @State private var orientation: NativeHUDOrientation = .portrait
    @State private var selected = "pulse"
    @State private var profile = NativeHUDFullscreenEditor.defaults(.portrait)
    @State private var dragOrigin: CGPoint?
    @State private var elementOrigin: CGPoint?

    var body: some View {
        GeometryReader { proxy in
            let available = proxy.size
            VStack(spacing: 0) {
                HStack {
                    Text("HUD-Layout").font(.headline)
                    Picker("Ansicht", selection: $orientation) {
                        ForEach(NativeHUDOrientation.allCases) { Text($0.title).tag($0) }
                    }.pickerStyle(.segmented)
                    Button("Fertig") { save(); dismiss() }.buttonStyle(.borderedProminent)
                }.padding().background(.ultraThinMaterial)

                HStack(spacing: 12) {
                    controls.frame(width: available.width > available.height ? 260 : nil)
                    stage
                }
                .padding(12)
            }
            .background(Color.black.ignoresSafeArea())
        }
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
        .onAppear { load() }
        .onChange(of: orientation) { _, _ in save(); load() }
    }

    private var controls: some View {
        ScrollView {
            VStack(spacing: 8) {
                ForEach(profile.elements) { element in
                    Button {
                        selected = element.id
                    } label: {
                        HStack {
                            Text(label(element.id))
                            Spacer()
                            Image(systemName: element.id == selected ? "move.3d" : "gearshape")
                        }
                        .padding(10)
                        .background(element.id == selected ? Color.cyan.opacity(0.2) : Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
                    }.buttonStyle(.plain)
                }
                Button("Positionen zurücksetzen", role: .destructive) {
                    profile = Self.defaults(orientation)
                    save()
                }.buttonStyle(.bordered)
            }
        }
    }

    private var stage: some View {
        GeometryReader { geo in
            ZStack {
                LinearGradient(colors: [.blue.opacity(0.35), .black], startPoint: .top, endPoint: .bottom)
                ForEach(profile.elements) { element in
                    if element.visible {
                        elementView(element)
                            .frame(width: geo.size.width * element.width * element.scale,
                                   height: geo.size.height * element.height * element.scale)
                            .position(x: geo.size.width * (element.x + element.width * element.scale / 2),
                                      y: geo.size.height * (element.y + element.height * element.scale / 2))
                            .opacity(element.opacity)
                            .gesture(dragGesture(element, in: geo.size))
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.cyan.opacity(0.6)))
            .contentShape(Rectangle())
        }
        .aspectRatio(orientation == .portrait ? 9.0 / 16.0 : 16.0 / 9.0, contentMode: .fit)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func elementView(_ element: NativeHUDElement) -> some View {
        ZStack(alignment: .topTrailing) {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(red: 0.02, green: 0.08, blue: 0.09).opacity(0.88))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(element.id == selected ? .white : .cyan, lineWidth: element.id == selected ? 3 : 2))
            VStack(alignment: .leading, spacing: 4) {
                Text(label(element.id).uppercased()).font(.caption2.weight(.semibold))
                Text(sample(element.id)).font(.title3.bold()).foregroundStyle(.cyan).monospacedDigit()
            }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center).padding(8)
            Image(systemName: "arrow.up.and.down.and.arrow.left.and.right")
                .font(.caption.bold()).foregroundStyle(.black).padding(7).background(.cyan, in: Circle()).offset(x: 8, y: -8)
        }
        .contentShape(Rectangle())
        .onTapGesture { selected = element.id }
    }

    private func dragGesture(_ element: NativeHUDElement, in size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { value in
                selected = element.id
                if dragOrigin == nil {
                    dragOrigin = value.startLocation
                    elementOrigin = CGPoint(x: element.x, y: element.y)
                }
                guard let origin = elementOrigin,
                      let index = profile.elements.firstIndex(where: { $0.id == element.id }) else { return }
                let width = profile.elements[index].width * profile.elements[index].scale
                let height = profile.elements[index].height * profile.elements[index].scale
                let nx = origin.x + value.translation.width / max(size.width, 1)
                let ny = origin.y + value.translation.height / max(size.height, 1)
                profile.elements[index].x = min(max(0, nx), max(0, 1 - width))
                profile.elements[index].y = min(max(0, ny), max(0, 1 - height))
            }
            .onEnded { _ in dragOrigin = nil; elementOrigin = nil; save() }
    }

    private func load() {
        let json = orientation == .portrait ? portraitJSON : landscapeJSON
        if let data = json.data(using: .utf8), let decoded = try? JSONDecoder().decode(NativeHUDProfile.self, from: data) {
            profile = decoded
        } else {
            profile = Self.defaults(orientation)
        }
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(profile), let json = String(data: data, encoding: .utf8) else { return }
        if orientation == .portrait { portraitJSON = json } else { landscapeJSON = json }
    }

    private func label(_ id: String) -> String {
        ["pulse":"Puls", "gDial":"G-Kraft-Kreis", "gValues":"G-Achsen", "speed":"Geschwindigkeit", "vibration":"Vibration", "dynamics":"Fahrdynamik"][id] ?? id
    }
    private func sample(_ id: String) -> String {
        ["pulse":"142 BPM", "gDial":"+0.8 / +2.4 G", "gValues":"LAT +0.8 · VERT +2.4", "speed":"87 KM/H", "vibration":"6.8 m/s²", "dynamics":"2.58 G · 4.1 G/s"][id] ?? "–"
    }

    private static func defaults(_ orientation: NativeHUDOrientation) -> NativeHUDProfile {
        let values: [NativeHUDElement]
        if orientation == .portrait {
            values = [
                .init(id:"vibration",x:0.04,y:0.04,width:0.42,height:0.15), .init(id:"dynamics",x:0.54,y:0.04,width:0.42,height:0.15),
                .init(id:"gDial",x:0.18,y:0.22,width:0.64,height:0.30), .init(id:"gValues",x:0.07,y:0.54,width:0.86,height:0.10),
                .init(id:"pulse",x:0.05,y:0.69,width:0.43,height:0.25), .init(id:"speed",x:0.52,y:0.69,width:0.43,height:0.25)
            ]
        } else {
            values = [
                .init(id:"pulse",x:0.02,y:0.62,width:0.29,height:0.31), .init(id:"gDial",x:0.42,y:0.48,width:0.17,height:0.30),
                .init(id:"gValues",x:0.33,y:0.84,width:0.34,height:0.11), .init(id:"speed",x:0.70,y:0.61,width:0.28,height:0.33),
                .init(id:"vibration",x:0.80,y:0.06,width:0.18,height:0.24), .init(id:"dynamics",x:0.03,y:0.06,width:0.24,height:0.18)
            ]
        }
        return NativeHUDProfile(elements: values)
    }
}
