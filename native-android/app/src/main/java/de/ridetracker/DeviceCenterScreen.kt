package de.ridetracker

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject

internal data class AndroidDeviceChannel(var id:String,var metric:String,var unit:String,var enabled:Boolean,var sampleRateHz:Double,var calibratedAt:String?=null)
internal data class AndroidDeviceDescriptor(var id:String,var name:String,var type:String,var transport:String,var enabled:Boolean,var autoReconnect:Boolean,var channels:MutableList<AndroidDeviceChannel>)

internal class AndroidDeviceRegistry(private val context:Context) {
    var devices by mutableStateOf(load())
    private fun defaults()= mutableListOf(
        AndroidDeviceDescriptor("phone-motion","Smartphone Bewegung","phone","internal",true,true, mutableListOf(AndroidDeviceChannel("motion","gForce","g",true,100.0))),
        AndroidDeviceDescriptor("phone-gps","Smartphone GPS","gnss","internal",true,true, mutableListOf(AndroidDeviceChannel("location","location","deg",true,1.0),AndroidDeviceChannel("speed","speedKmh","km/h",true,1.0))),
        AndroidDeviceDescriptor("phone-camera","Smartphone Kamera","camera","internal",true,true, mutableListOf(AndroidDeviceChannel("video","video","stream",true,30.0))),
        AndroidDeviceDescriptor("ble-heart","BLE Herzfrequenz","heartRate","bluetooth-le",false,true, mutableListOf(AndroidDeviceChannel("heartRate","heartRateBpm","bpm",true,1.0))),
        AndroidDeviceDescriptor("external-imu","Externe IMU","imu","bluetooth-le",false,true, mutableListOf(AndroidDeviceChannel("acceleration","acceleration","m/s²",true,200.0),AndroidDeviceChannel("gyroscope","gyroscope","rad/s",true,200.0))),
        AndroidDeviceDescriptor("external-gnss","Externer GNSS-Empfänger","gnss","bluetooth-le",false,true, mutableListOf(AndroidDeviceChannel("position","location","deg",true,10.0))),
        AndroidDeviceDescriptor("external-camera","Externe Kamera","camera","wifi",false,true, mutableListOf(AndroidDeviceChannel("video","video","stream",true,30.0)))
    )
    private fun load():MutableList<AndroidDeviceDescriptor> = runCatching {
        val raw=context.getSharedPreferences("rideTracker",Context.MODE_PRIVATE).getString("devices",null) ?: return@runCatching defaults()
        val array=JSONArray(raw); MutableList(array.length()){i->val d=array.getJSONObject(i);val ca=d.getJSONArray("channels");AndroidDeviceDescriptor(d.getString("id"),d.getString("name"),d.getString("type"),d.getString("transport"),d.getBoolean("enabled"),d.optBoolean("autoReconnect",true),MutableList(ca.length()){j->val c=ca.getJSONObject(j);AndroidDeviceChannel(c.getString("id"),c.getString("metric"),c.optString("unit"),c.getBoolean("enabled"),c.optDouble("sampleRateHz",1.0),c.optString("calibratedAt").ifBlank{null})})}
    }.getOrElse{defaults()}
    fun save(){val a=JSONArray();devices.forEach{d->val channels=JSONArray();d.channels.forEach{c->channels.put(JSONObject().put("id",c.id).put("metric",c.metric).put("unit",c.unit).put("enabled",c.enabled).put("sampleRateHz",c.sampleRateHz).put("calibratedAt",c.calibratedAt ?: ""))};a.put(JSONObject().put("id",d.id).put("name",d.name).put("type",d.type).put("transport",d.transport).put("enabled",d.enabled).put("autoReconnect",d.autoReconnect).put("channels",channels))};context.getSharedPreferences("rideTracker",Context.MODE_PRIVATE).edit().putString("devices",a.toString()).apply();devices=devices.toMutableList()}
    fun add(){devices.add(AndroidDeviceDescriptor("custom-${System.currentTimeMillis()}","Neues Gerät","custom","bluetooth-le",false,true, mutableListOf(AndroidDeviceChannel("value","customValue","",true,1.0))));save()}
}

@Composable internal fun AndroidDeviceCenter(modifier:Modifier, registry:AndroidDeviceRegistry){
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){
        Row{Text("Geräte & Sensoren",style=MaterialTheme.typography.headlineMedium,modifier=Modifier.weight(1f));Button(onClick=registry::add){Text("Hinzufügen")}}
        registry.devices.forEach{device->var expanded by remember(device.id){mutableStateOf(false)};Card(onClick={expanded=!expanded},modifier=Modifier.fillMaxWidth()){Column(Modifier.padding(14.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){Text(device.name,style=MaterialTheme.typography.titleMedium);Text("${device.transport} · ${device.channels.size} Kanäle");if(expanded){OutlinedTextField(device.name,{device.name=it;registry.save()},label={Text("Name")},modifier=Modifier.fillMaxWidth());Row{Text("Aktiv",Modifier.weight(1f));Switch(device.enabled,{device.enabled=it;registry.save()})};Row{Text("Automatisch verbinden",Modifier.weight(1f));Switch(device.autoReconnect,{device.autoReconnect=it;registry.save()})};device.channels.forEach{channel->HorizontalDivider();Text(channel.metric,style=MaterialTheme.typography.titleSmall);Row{Text("Kanal aktiv",Modifier.weight(1f));Switch(channel.enabled,{channel.enabled=it;registry.save()})};OutlinedTextField(channel.sampleRateHz.toString(),{channel.sampleRateHz=it.toDoubleOrNull()?:channel.sampleRateHz;registry.save()},label={Text("Messrate Hz")},modifier=Modifier.fillMaxWidth());Button(onClick={channel.calibratedAt=java.time.Instant.now().toString();registry.save()}){Text(if(channel.calibratedAt==null)"Separat kalibrieren" else "Neu kalibrieren")};channel.calibratedAt?.let{Text("Kalibriert: $it",style=MaterialTheme.typography.labelSmall)}}}}}}
    }
}
