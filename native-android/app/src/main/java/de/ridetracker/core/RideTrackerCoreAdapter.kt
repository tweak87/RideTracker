package de.ridetracker.core

import android.os.SystemClock
import de.ridetracker.video.CameraSourceManager
import org.json.JSONArray
import org.json.JSONObject

data class CoreTelemetrySample(
    val timestampMs:Long,
    val deviceId:String,
    val channelId:String,
    val metric:String,
    val value:Double,
    val unit:String?,
    val quality:Double,
    val sourceId:String,
)

data class CoreRuntimeEvent(
    val type:String,
    val timestampMs:Long,
    val sessionId:String?=null,
    val metric:String?=null,
    val sourceId:String?=null,
)

data class CoreNativeDeviceSnapshot(
    val id:String,
    val name:String,
    val type:String,
    val enabled:Boolean,
)

data class CoreNativeCameraSnapshot(
    val primaryId:String?,
    val fallbackIds:List<String>,
    val sources:List<de.ridetracker.video.CameraSourceDescriptor>,
)

data class CoreNativeConfigurationSnapshot(
    val coreVersion:String,
    val capturedAtEpochMs:Long,
    val platform:String,
    val devices:List<CoreNativeDeviceSnapshot>,
    val camera:CoreNativeCameraSnapshot,
    val calibrationMode:String,
    val forwardEdge:String,
)

fun CoreNativeConfigurationSnapshot.toJson():JSONObject = JSONObject().apply {
    put("coreVersion",coreVersion)
    put("capturedAtEpochMs",capturedAtEpochMs)
    put("platform",platform)
    put("devices",JSONArray().apply {
        devices.forEach { device -> put(JSONObject()
            .put("id",device.id)
            .put("name",device.name)
            .put("type",device.type)
            .put("enabled",device.enabled)) }
    })
    put("camera",JSONObject().apply {
        if(camera.primaryId==null) put("primaryId",JSONObject.NULL) else put("primaryId",camera.primaryId)
        put("fallbackIds",JSONArray(camera.fallbackIds))
        put("sources",JSONArray().apply {
            camera.sources.forEach { source -> put(JSONObject()
                .put("id",source.id)
                .put("name",source.name)
                .put("position",source.position)
                .put("transport",source.transport)
                .put("available",source.available)) }
        })
    })
    put("calibration",JSONObject()
        .put("mode",calibrationMode)
        .put("forwardEdge",forwardEdge))
}

class RideTrackerCoreAdapter {
    companion object { const val CORE_VERSION="2.0.0-alpha.1" }

    private val latestTelemetry=linkedMapOf<String,CoreTelemetrySample>()
    private val events=mutableListOf<CoreRuntimeEvent>()
    var activeSessionId:String?=null
        private set

    fun ingest(
        metric:String,
        sourceId:String,
        value:Double,
        unit:String?=null,
        quality:Double=1.0,
        timestampMs:Long=SystemClock.elapsedRealtime(),
    ) {
        if(!value.isFinite()) return
        val parts=sourceId.split('/',limit=2)
        val deviceId=parts.firstOrNull().orEmpty().ifBlank{"android-device"}
        val channelId=parts.getOrNull(1)?.ifBlank{metric}?:metric
        val sample=CoreTelemetrySample(
            timestampMs=timestampMs,
            deviceId=deviceId,
            channelId=channelId,
            metric=metric,
            value=value,
            unit=unit,
            quality=quality.coerceIn(0.0,1.0),
            sourceId=sourceId,
        )
        latestTelemetry["$deviceId/$channelId"]=sample
    }

    fun recordingStarted(sessionId:String,timestampMs:Long=SystemClock.elapsedRealtime()) {
        activeSessionId=sessionId
        append(CoreRuntimeEvent("recording.started",timestampMs,sessionId=sessionId))
    }

    fun recordingStopped(timestampMs:Long=SystemClock.elapsedRealtime()) {
        append(CoreRuntimeEvent("recording.stopped",timestampMs,sessionId=activeSessionId))
        activeSessionId=null
    }

    fun sourceSwitched(metric:String,sourceId:String?,timestampMs:Long=SystemClock.elapsedRealtime()) {
        append(CoreRuntimeEvent("source.switched",timestampMs,metric=metric,sourceId=sourceId))
    }

    fun resetRuntime() {
        latestTelemetry.clear()
        events.clear()
        activeSessionId=null
    }

    fun telemetrySnapshot():List<CoreTelemetrySample> = latestTelemetry.values.toList()
    fun eventSnapshot():List<CoreRuntimeEvent> = events.toList()

    fun configurationSnapshot(
        cameraSources:CameraSourceManager,
        forwardEdge:String,
        connectedHeartRateName:String?,
    ):CoreNativeConfigurationSnapshot {
        val devices=buildList {
            add(CoreNativeDeviceSnapshot("android-phone","Android Smartphone","internal",true))
            if(!connectedHeartRateName.isNullOrBlank()) add(CoreNativeDeviceSnapshot("ble-heart",connectedHeartRateName,"bluetooth-le",true))
        }
        return CoreNativeConfigurationSnapshot(
            coreVersion=CORE_VERSION,
            capturedAtEpochMs=System.currentTimeMillis(),
            platform="android",
            devices=devices,
            camera=CoreNativeCameraSnapshot(
                primaryId=cameraSources.primarySourceId,
                fallbackIds=cameraSources.fallbackSourceIds,
                sources=cameraSources.refresh(),
            ),
            calibrationMode="manual",
            forwardEdge=forwardEdge,
        )
    }

    private fun append(event:CoreRuntimeEvent) {
        events+=event
        if(events.size>2_000) repeat(events.size-2_000){events.removeAt(0)}
    }
}
