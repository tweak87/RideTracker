import Foundation

struct HUDElementConfiguration: Codable, Equatable {
    var visible: Bool = true
    var x: Double
    var y: Double
    var width: Double
    var height: Double
    var scale: Double = 1
    var opacity: Double = 1
    var fontScale: Double = 1
}

struct HUDProfileConfiguration: Codable, Equatable {
    var panelOpacity: Double = 0.86
    var globalOpacity: Double = 1
    var fontScale: Double = 1
    var fontFamily: String = "system"
    var elements: [String: HUDElementConfiguration]
}

struct HUDWatermarkConfiguration: Codable, Equatable {
    var enabled: Bool = false
    var imageFilename: String?
    var x: Double = 0.82
    var y: Double = 0.04
    var width: Double = 0.14
    var opacity: Double = 0.65
}

struct HUDConfiguration: Codable, Equatable {
    var version: String = "1.0.0"
    var profiles: [String: HUDProfileConfiguration]
    var watermark = HUDWatermarkConfiguration()

    static func defaults(from overlay: OverlayConfiguration) -> HUDConfiguration {
        func profile(_ layout: [String: [Double]]) -> HUDProfileConfiguration {
            let elements = layout.reduce(into: [String: HUDElementConfiguration]()) { result, pair in
                guard pair.value.count == 4 else { return }
                result[pair.key] = HUDElementConfiguration(
                    x: pair.value[0], y: pair.value[1], width: pair.value[2], height: pair.value[3]
                )
            }
            return HUDProfileConfiguration(elements: elements)
        }
        return HUDConfiguration(profiles: [
            "landscape": profile(overlay.layouts["landscape"] ?? [:]),
            "portrait": profile(overlay.layouts["portrait"] ?? [:])
        ])
    }
}
