package de.ridetracker.sensors

import android.os.SystemClock

data class ExternalTelemetryChannel(
    val metric:String,
    val channelId:String,
    val value:Double,
    val quality:Double = 1.0,
)

data class ExternalTelemetryPacket(
    val deviceId:String,
    val timestampMs:Long = SystemClock.elapsedRealtime(),
    val channels:List<ExternalTelemetryChannel>,
)

class ExternalTelemetryGateway(private val router:TelemetrySourceRouter) {
    fun ingest(packet:ExternalTelemetryPacket) {
        val timestamp=if(packet.timestampMs>0)packet.timestampMs else SystemClock.elapsedRealtime()
        packet.channels.filter{it.value.isFinite()}.forEach{channel->
            router.ingest(
                metric=channel.metric,
                sourceId="${packet.deviceId}/${channel.channelId}",
                value=channel.value,
                quality=channel.quality.coerceIn(0.0,1.0),
                timestampMs=timestamp,
            )
        }
    }

    fun ingestGnssSpeed(speedMs:Double,quality:Double=1.0,deviceId:String="external-gnss") {
        if(!speedMs.isFinite())return
        ingest(ExternalTelemetryPacket(deviceId=deviceId,channels=listOf(ExternalTelemetryChannel("speedKmh","speed",speedMs.coerceAtLeast(0.0)*3.6,quality))))
    }

    fun ingestHeartRate(bpm:Int,quality:Double=1.0,deviceId:String="external-heart") {
        if(bpm<=0)return
        ingest(ExternalTelemetryPacket(deviceId=deviceId,channels=listOf(ExternalTelemetryChannel("heartRateBpm","heartRate",bpm.toDouble(),quality))))
    }

    fun ingestImu(x:Double,y:Double,z:Double,quality:Double=1.0,deviceId:String="external-imu") {
        ingest(ExternalTelemetryPacket(deviceId=deviceId,channels=listOf(
            ExternalTelemetryChannel("accelerationX","accelerationX",x,quality),
            ExternalTelemetryChannel("accelerationY","accelerationY",y,quality),
            ExternalTelemetryChannel("accelerationZ","accelerationZ",z,quality),
        )))
    }
}
