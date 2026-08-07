package de.ridetracker.core

import de.ridetracker.video.CameraSourceDescriptor

class CoreDeviceManager {
    private val devices = linkedMapOf<String, CoreNativeDeviceSnapshot>()

    fun upsert(device: CoreNativeDeviceSnapshot): CoreNativeDeviceSnapshot {
        require(device.id.isNotBlank()) { "device.id is required" }
        devices[device.id] = device
        return device
    }

    fun remove(id: String): Boolean = devices.remove(id) != null

    fun get(id: String): CoreNativeDeviceSnapshot? = devices[id]

    fun list(): List<CoreNativeDeviceSnapshot> = devices.values.toList()

    fun clear() = devices.clear()
}

class CoreSensorManager {
    private val latest = linkedMapOf<String, CoreTelemetrySample>()

    fun ingest(sample: CoreTelemetrySample): CoreTelemetrySample {
        require(sample.deviceId.isNotBlank()) { "sample.deviceId is required" }
        require(sample.channelId.isNotBlank()) { "sample.channelId is required" }
        require(sample.metric.isNotBlank()) { "sample.metric is required" }
        require(sample.value.isFinite()) { "sample.value must be finite" }
        require(sample.quality in 0.0..1.0) { "sample.quality must be 0..1" }
        latest[key(sample.deviceId, sample.channelId)] = sample
        return sample
    }

    fun latestFor(deviceId: String, channelId: String): CoreTelemetrySample? = latest[key(deviceId, channelId)]

    fun snapshot(): List<CoreTelemetrySample> = latest.values.toList()

    fun clear() = latest.clear()

    private fun key(deviceId: String, channelId: String) = "$deviceId/$channelId"
}

class CoreCameraManager {
    private val sources = linkedMapOf<String, CameraSourceDescriptor>()
    var primaryId: String? = null
        private set
    var fallbackIds: List<String> = emptyList()
        private set

    fun sync(
        availableSources: List<CameraSourceDescriptor>,
        primaryId: String?,
        fallbackIds: List<String>,
    ) {
        sources.clear()
        availableSources.forEach { source ->
            require(source.id.isNotBlank()) { "camera source id is required" }
            sources[source.id] = source
        }
        this.primaryId = primaryId?.takeIf { sources.containsKey(it) }
        this.fallbackIds = fallbackIds
            .filter { it != this.primaryId && sources.containsKey(it) }
            .distinct()
    }

    fun get(id: String): CameraSourceDescriptor? = sources[id]

    fun list(): List<CameraSourceDescriptor> = sources.values.toList()

    fun ordered(): List<CameraSourceDescriptor> = (listOfNotNull(primaryId) + fallbackIds)
        .mapNotNull(::get)

    fun snapshot(): CoreNativeCameraSnapshot = CoreNativeCameraSnapshot(
        primaryId = primaryId,
        fallbackIds = fallbackIds,
        sources = list(),
    )

    fun clear() {
        sources.clear()
        primaryId = null
        fallbackIds = emptyList()
    }
}
