package de.ridetracker.session

import android.content.Context
import de.ridetracker.engine.SeatCalibration
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.UUID

data class RideSessionEvent(val timestamp: Double, val type: String)

data class RideSessionSample(
    val timestamp: Double,
    val normalG: Double,
    val lateralG: Double,
    val longitudinalG: Double,
    val totalG: Double,
    val relativeAltitudeM: Double?,
    val speedMS: Double,
    val latitude: Double?,
    val longitude: Double?,
    val horizontalAccuracyM: Double?,
    val phase: String,
    val qualityScore: Int,
    val source: String = "android_phone",
    val heartRateBpm: Int? = null,
)

data class RideSessionSummary(
    val durationSeconds: Double,
    val sampleCount: Int,
    val distanceMeters: Double,
    val acceptedLocations: Int,
    val rejectedLocations: Int,
    val qualityScore: Int,
    val finalPhase: String,
)

data class RideSessionDocument(
    val id: String = UUID.randomUUID().toString(),
    val startedAt: Instant,
    val endedAt: Instant,
    val events: List<RideSessionEvent>,
    val samples: List<RideSessionSample>,
    val summary: RideSessionSummary,
    val calibrationMode: String = "manual",
    val forwardEdge: String,
    val calibration: SeatCalibration?,
    val videoFilename: String? = null,
    val videoStartOffsetSeconds: Double = 0.0,
    val privateNote: String = "",
    val communityComment: String = "",
    val heartRateSource: String? = null,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("schemaVersion", "2.0.0")
        put("id", id)
        put("platform", "android")
        put("startedAt", startedAt.toString())
        put("endedAt", endedAt.toString())
        put("timebase", "elapsedRealtimeNanos")
        put("calibration", JSONObject().apply {
            put("mode", calibrationMode); put("source", "android_phone"); put("isCalibrated", calibration != null); put("forwardEdge", forwardEdge)
            putVector("up", calibration?.up); putVector("lateral", calibration?.lateral); putVector("forward", calibration?.forward)
        })
        put("video", JSONObject().apply { put("sessionID", id); putNullable("filename", videoFilename); put("startOffsetSeconds", videoStartOffsetSeconds) })
        put("notes", JSONObject().apply { put("private", privateNote); put("comment", communityComment) })
        val heartRates = samples.mapNotNull { it.heartRateBpm }
        put("heartRate", JSONObject().apply {
            putNullable("source", heartRateSource); put("sampleCount", heartRates.size)
            putNullable("averageBpm", heartRates.takeIf { it.isNotEmpty() }?.average())
        })
        put("events", JSONArray().apply { events.forEach { put(JSONObject().put("timestamp", it.timestamp).put("type", it.type)) } })
        put("samples", JSONArray().apply {
            samples.forEach { sample -> put(JSONObject().apply {
                put("timestamp", sample.timestamp); put("normalG", sample.normalG); put("lateralG", sample.lateralG); put("longitudinalG", sample.longitudinalG); put("totalG", sample.totalG)
                putNullable("relativeAltitudeM", sample.relativeAltitudeM); put("speedMS", sample.speedMS); putNullable("latitude", sample.latitude); putNullable("longitude", sample.longitude); putNullable("horizontalAccuracyM", sample.horizontalAccuracyM)
                put("phase", sample.phase); put("qualityScore", sample.qualityScore); put("source", sample.source); putNullable("heartRateBpm", sample.heartRateBpm)
            }) }
        })
        put("summary", JSONObject().apply {
            put("durationSeconds", summary.durationSeconds); put("sampleCount", summary.sampleCount); put("distanceMeters", summary.distanceMeters); put("acceptedLocations", summary.acceptedLocations); put("rejectedLocations", summary.rejectedLocations); put("qualityScore", summary.qualityScore); put("finalPhase", summary.finalPhase)
        })
    }

    fun save(context: Context): File {
        val stamp = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC).format(startedAt)
        val file = File(context.filesDir, "RideTracker-$stamp-${id.take(8)}.ride.json")
        file.writeText(toJson().toString(2)); RidePackageStore.save(context, this, file); return file
    }
}

private fun JSONObject.putNullable(key: String, value: Any?) { if (value == null) put(key, JSONObject.NULL) else put(key, value) }
private fun JSONObject.putVector(key: String, value: de.ridetracker.engine.Vector3?) { if (value == null) put(key, JSONObject.NULL) else put(key, JSONArray(listOf(value.x, value.y, value.z))) }
