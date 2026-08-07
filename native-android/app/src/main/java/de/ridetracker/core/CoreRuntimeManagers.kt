package de.ridetracker.core

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
