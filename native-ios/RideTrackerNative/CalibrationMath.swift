import Foundation
import simd

enum ForwardEdge: String, CaseIterable, Codable, Identifiable {
    case top, bottom, left, right
    var id: String { rawValue }
    var title: String {
        switch self {
        case .top: return "Oberkante"
        case .bottom: return "Unterkante"
        case .left: return "Linke Kante"
        case .right: return "Rechte Kante"
        }
    }
    var vector: SIMD3<Double> {
        switch self {
        case .top: return SIMD3(0, -1, 0)
        case .bottom: return SIMD3(0, 1, 0)
        case .left: return SIMD3(-1, 0, 0)
        case .right: return SIMD3(1, 0, 0)
        }
    }
}

enum CalibrationMath {
    static func build(gravitySamples: [SIMD3<Double>], forwardEdge: ForwardEdge) -> SeatCalibration? {
        guard gravitySamples.count >= 20 else { return nil }
        let sum = gravitySamples.reduce(SIMD3<Double>(repeating: 0), +)
        let average = sum / Double(gravitySamples.count)
        guard simd_length(average) > 0.5 else { return nil }
        let up = simd_normalize(average)
        let hint = forwardEdge.vector
        var projected = hint - simd_dot(hint, up) * up
        if simd_length(projected) < 0.2 {
            let fallback = abs(up.x) < 0.8 ? SIMD3<Double>(1, 0, 0) : SIMD3<Double>(0, 1, 0)
            projected = simd_cross(up, fallback)
        }
        let forward = simd_normalize(projected)
        let lateral = simd_normalize(simd_cross(forward, up))
        let correctedForward = simd_normalize(simd_cross(up, lateral))
        return SeatCalibration(up: up, lateral: lateral, forward: correctedForward, source: "manual")
    }
}
