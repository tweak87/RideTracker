package de.ridetracker.engine

import kotlin.math.abs
import kotlin.math.sqrt

enum class ForwardEdge(val title: String, val vector: Vector3) {
    TOP("Oberkante", Vector3(0.0, -1.0, 0.0)),
    BOTTOM("Unterkante", Vector3(0.0, 1.0, 0.0)),
    LEFT("Linke Kante", Vector3(-1.0, 0.0, 0.0)),
    RIGHT("Rechte Kante", Vector3(1.0, 0.0, 0.0)),
}

object CalibrationMath {
    fun build(samples: List<Vector3>, edge: ForwardEdge): SeatCalibration? {
        if (samples.size < 20) return null
        val avg = samples.reduce(::add).let { scale(it, 1.0 / samples.size) }
        if (length(avg) < 0.5) return null
        val up = normalize(avg)
        val hint = edge.vector
        var projected = subtract(hint, scale(up, dot(hint, up)))
        if (length(projected) < 0.2) {
            val fallback = if (abs(up.x) < 0.8) Vector3(1.0, 0.0, 0.0) else Vector3(0.0, 1.0, 0.0)
            projected = cross(up, fallback)
        }
        val forward = normalize(projected)
        val lateral = normalize(cross(forward, up))
        val correctedForward = normalize(cross(up, lateral))
        return SeatCalibration(up, lateral, correctedForward, "manual")
    }

    private fun add(a: Vector3, b: Vector3) = Vector3(a.x + b.x, a.y + b.y, a.z + b.z)
    private fun subtract(a: Vector3, b: Vector3) = Vector3(a.x - b.x, a.y - b.y, a.z - b.z)
    private fun scale(v: Vector3, s: Double) = Vector3(v.x * s, v.y * s, v.z * s)
    private fun dot(a: Vector3, b: Vector3) = a.x * b.x + a.y * b.y + a.z * b.z
    private fun cross(a: Vector3, b: Vector3) = Vector3(a.y*b.z-a.z*b.y, a.z*b.x-a.x*b.z, a.x*b.y-a.y*b.x)
    private fun length(v: Vector3) = sqrt(dot(v, v))
    private fun normalize(v: Vector3): Vector3 { val l = length(v).coerceAtLeast(1e-9); return scale(v, 1.0/l) }
}
