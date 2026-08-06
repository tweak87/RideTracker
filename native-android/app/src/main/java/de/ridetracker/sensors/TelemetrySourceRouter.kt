package de.ridetracker.sensors

import android.os.SystemClock

data class TelemetrySourcePolicy(
    val metric:String,
    val primarySource:String,
    val fallbackSources:List<String> = emptyList(),
    val minimumQuality:Double = 0.0,
    val maxAgeMs:Long = Long.MAX_VALUE,
)

data class TelemetrySourceSwitch(
    val timestampMs:Long,
    val metric:String,
    val from:String?,
    val to:String?,
    val reason:String,
)

data class RoutedTelemetrySample<T>(
    val metric:String,
    val sourceId:String,
    val value:T,
    val quality:Double,
    val timestampMs:Long,
)

class TelemetrySourceRouter {
    private data class Stored(val metric:String,val value:Any,val quality:Double,val timestampMs:Long)
    private val latest=mutableMapOf<String,Stored>()
    private val active=mutableMapOf<String,String?>()
    val switches=mutableListOf<TelemetrySourceSwitch>()
    var policies:List<TelemetrySourcePolicy> = emptyList()

    fun reset() {
        latest.clear()
        active.clear()
        switches.clear()
    }

    fun ingest(metric:String,sourceId:String,value:Any,quality:Double=1.0,timestampMs:Long=SystemClock.elapsedRealtime()) {
        latest[sourceId]=Stored(metric,value,quality.coerceIn(0.0,1.0),timestampMs)
    }

    inline fun <reified T> resolve(metric:String,nowMs:Long=SystemClock.elapsedRealtime()):RoutedTelemetrySample<T>? = resolve(metric,nowMs,T::class.java)

    fun <T> resolve(metric:String,nowMs:Long,type:Class<T>):RoutedTelemetrySample<T>? {
        val policy=policies.firstOrNull{it.metric==metric}
        val ordered=(listOfNotNull(policy?.primarySource)+(policy?.fallbackSources?:emptyList())).ifEmpty{latest.filterValues{it.metric==metric}.keys.toList()}
        var selected:RoutedTelemetrySample<T>?=null
        for(source in ordered){
            val sample=latest[source]?:continue
            if(sample.metric!=metric||!type.isInstance(sample.value))continue
            val age=(nowMs-sample.timestampMs).coerceAtLeast(0)
            if(sample.quality<(policy?.minimumQuality?:0.0)||age>(policy?.maxAgeMs?:Long.MAX_VALUE))continue
            selected=RoutedTelemetrySample(metric,source,type.cast(sample.value),sample.quality,sample.timestampMs)
            break
        }
        val next=selected?.sourceId
        if(active[metric]!=next){
            switches+=TelemetrySourceSwitch(nowMs,metric,active[metric],next,if(next==null)"no-valid-source" else "selected")
            active[metric]=next
        }
        return selected
    }
}
