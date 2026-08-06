package de.ridetracker.video

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager

data class CameraSourceDescriptor(
    val id:String,
    val name:String,
    val position:String,
    val transport:String,
    val available:Boolean,
)

class CameraSourceManager(context:Context) {
    private val appContext=context.applicationContext
    private val prefs=appContext.getSharedPreferences("rideTracker",Context.MODE_PRIVATE)
    private val cameraManager=appContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager

    var primarySourceId:String?
        get()=prefs.getString("camera.primary",null)
        set(value){prefs.edit().putString("camera.primary",value).apply()}

    var fallbackSourceIds:List<String>
        get()=prefs.getStringSet("camera.fallbacks",emptySet())?.toList()?:emptyList()
        set(value){prefs.edit().putStringSet("camera.fallbacks",value.toSet()).apply()}

    fun refresh():List<CameraSourceDescriptor> {
        val sources=cameraManager.cameraIdList.map { id ->
            val characteristics=cameraManager.getCameraCharacteristics(id)
            val facing=when(characteristics.get(CameraCharacteristics.LENS_FACING)){
                CameraCharacteristics.LENS_FACING_FRONT->"front"
                CameraCharacteristics.LENS_FACING_BACK->"back"
                else->"external"
            }
            CameraSourceDescriptor(id,"Kamera $id",facing,if(facing=="external")"external" else "internal",true)
        }
        if(primarySourceId==null) primarySourceId=sources.firstOrNull{it.position=="back"}?.id?:sources.firstOrNull()?.id
        return sources
    }

    fun orderedSources():List<CameraSourceDescriptor> {
        val sources=refresh()
        return (listOfNotNull(primarySourceId)+fallbackSourceIds).distinct().mapNotNull { id -> sources.firstOrNull{it.id==id} }
    }
}
