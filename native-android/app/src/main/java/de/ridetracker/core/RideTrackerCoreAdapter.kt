package de.ridetracker.core

import android.os.SystemClock
import de.ridetracker.video.CameraSourceManager
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

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

data class CoreNativeSourceRoutingSnapshot(
    val metric:String,
    val primarySource:String,
    val fallbackSources:List<String>,
    val minimumQuality:Double,
    val maxAgeMs:Long,
    val interpolation:String="hold",
    val widgetId:String?=null,
)

data class CoreNativeCameraSnapshot(
    val primaryId:String?,
    val fallbackIds:List<String>,
    val sources:List<de.ridetracker.video.CameraSourceDescriptor>,
)

data class CoreNativeHUDSnapshot(
    val version:String="1.0.0",
    val activeProfile:String?=null,
    val profiles:Map<String,JSONObject> = emptyMap(),
)

data class CoreNativeCalibrationSnapshot(
    val mode:String,
    val forwardEdge:String,
)

data class CoreNativeConfigurationSnapshot(
    val schemaVersion:String,
    val coreVersion:String,
    val capturedAt:String,
    val platform:String,
    val devices:List<CoreNativeDeviceSnapshot>,
    val sourceRouting:List<CoreNativeSourceRoutingSnapshot>,
    val camera:CoreNativeCameraSnapshot,
    val hud:CoreNativeHUDSnapshot,
    val calibration:CoreNativeCalibrationSnapshot,
)

fun CoreNativeConfigurationSnapshot.toJson():JSONObject = JSONObject().apply {
    put("schemaVersion",schemaVersion)
    put("coreVersion",coreVersion)
    put("capturedAt",capturedAt)
    put("platform",platform)
    put("devices",JSONArray().apply {
        devices.forEach { device -> put(JSONObject()
            .put("id",device.id)
            .put("name",device.name)
            .put("type",device.type)
            .put("enabled",device.enabled)) }
    })
    put("sourceRouting",JSONArray().apply {
        sourceRouting.forEach { route -> put(JSONObject()
            .put("metric",route.metric)
            .put("primarySource",route.primarySource)
            .put("fallbackSources",JSONArray(route.fallbackSources))
            .put("minimumQuality",route.minimumQuality.coerceIn(0.0,1.0))
            .put("maxAgeMs",route.maxAgeMs.coerceAtLeast(0))
            .put("interpolation",route.interpolation)
            .put("widgetId",route.widgetId ?: JSONObject.NULL)) }
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
    put("hud",JSONObject().apply {
        put("version",hud.version)
        put("activeProfile",hud.activeProfile ?: JSONObject.NULL)
        put("profiles",JSONObject().apply { hud.profiles.forEach { (key,value) -> put(key,value) } })
        put("watermark",JSONObject.NULL)
    })
    put("calibration",JSONObject()
        .put("mode",calibration.mode)
        .put("forwardEdge",calibration.forwardEdge)
        .put("deviceCalibration",JSONObject.NULL))
}

class RideTrackerCoreAdapter {
    companion object {
        const val CORE_VERSION="2.0.0-alpha.1"
        const val SNAPSHOT_SCHEMA_VERSION="1.0.0"
    }

    val devices = CoreDeviceManager()
    val sensors = CoreSensorManager()

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
        sensors.ingest(CoreTelemetrySample(
            timestampMs=timestampMs,
            deviceId=deviceId,
            channelId=channelId,
            metric=metric,
            value=value,
            unit=unit,
            quality=quality.coerceIn(0.0,1.0),
            sourceId=sourceId,
        ))
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
        sensors.clear()
        events.clear()
        activeSessionId=null
    }

    fun telemetrySnapshot():List<CoreTelemetrySample> = sensors.snapshot()
    fun eventSnapshot():List<CoreRuntimeEvent> = events.toList()

    fun configurationSnapshot(
        cameraSources:CameraSourceManager,
        sourceRouting:List<CoreNativeSourceRoutingSnapshot>,
        forwardEdge:String,
        connectedHeartRateName:String?,
        hud:CoreNativeHUDSnapshot = CoreNativeHUDSnapshot(),
    ):CoreNativeConfigurationSnapshot {
        devices.clear()
        devices.upsert(CoreNativeDeviceSnapshot("android-phone","Android Smartphone","internal",true))
        if(!connectedHeartRateName.isNullOrBlank()) {
            devices.upsert(CoreNativeDeviceSnapshot("ble-heart",connectedHeartRateName,"bluetooth-le",true))
        }
        return CoreNativeConfigurationSnapshot(
            schemaVersion=SNAPSHOT_SCHEMA_VERSION,
            coreVersion=CORE_VERSION,
            capturedAt=Instant.now().toString(),
            platform="android",
            devices=devices.list(),
            sourceRouting=sourceRouting,
            camera=CoreNativeCameraSnapshot(
                primaryId=cameraSources.primarySourceId,
                fallbackIds=cameraSources.fallbackSourceIds,
                sources=cameraSources.refresh(),
            ),
            hud=hud,
            calibration=CoreNativeCalibrationSnapshot("manual",forwardEdge),
        )
    }

    private fun append(event:CoreRuntimeEvent) {
        events+=event
        if(events.size>2_000) repeat(events.size-2_000){events.removeAt(0)}
    }
}
