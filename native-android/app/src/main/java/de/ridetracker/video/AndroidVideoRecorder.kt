package de.ridetracker.video

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.SystemClock
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.CameraSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.io.File

@androidx.annotation.OptIn(markerClass = [ExperimentalCamera2Interop::class])
class AndroidVideoRecorder(
    private val context: Context,
    private val lifecycleOwner: LifecycleOwner,
) {
    var isRecording by mutableStateOf(false)
        private set
    var status by mutableStateOf("Video bereit zur Initialisierung")
        private set
    var lastVideoFile by mutableStateOf<File?>(null)
        private set
    var startOffsetSeconds by mutableStateOf(0.0)
        private set

    val cameraSources = CameraSourceManager(context)
    private var videoCapture: VideoCapture<Recorder>? = null
    private var activeRecording: Recording? = null

    fun configure() {
        val providerFuture = ProcessCameraProvider.getInstance(context)
        providerFuture.addListener({
            runCatching {
                val provider = providerFuture.get()
                val recorder = Recorder.Builder()
                    .setQualitySelector(QualitySelector.from(Quality.FHD))
                    .build()
                videoCapture = VideoCapture.withOutput(recorder)
                provider.unbindAll()

                val orderedIds = cameraSources.orderedSources().map { it.id }
                var boundId: String? = null
                var lastError: Throwable? = null
                for (cameraId in orderedIds) {
                    val selector = CameraSelector.Builder()
                        .addCameraFilter { infos -> infos.filter { Camera2CameraInfo.from(it).cameraId == cameraId } }
                        .build()
                    try {
                        provider.bindToLifecycle(lifecycleOwner, selector, videoCapture)
                        boundId = cameraId
                        break
                    } catch (error: Throwable) {
                        lastError = error
                        provider.unbindAll()
                    }
                }
                if (boundId == null) {
                    provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, videoCapture)
                    boundId = "fallback-back"
                }
                status = "Video bereit: $boundId"
                lastError?.let { if (orderedIds.isNotEmpty()) status += " (Fallback aktiv)" }
            }.onFailure { status = "Kamerafehler: ${it.localizedMessage}" }
        }, ContextCompat.getMainExecutor(context))
    }

    fun reconfigureSelectedCamera() {
        if (isRecording) {
            status = "Kamera kann während der Aufnahme nicht gewechselt werden"
            return
        }
        configure()
    }

    fun start(sessionId: String, sensorStartNs: Long) {
        val capture = videoCapture ?: run {
            status = "Kamera noch nicht initialisiert"
            return
        }
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            status = "Kameraberechtigung fehlt"
            return
        }

        val file = File(context.filesDir, "RideTracker-$sessionId.mp4")
        if (file.exists()) file.delete()
        val output = FileOutputOptions.Builder(file).build()
        val cameraStartNs = SystemClock.elapsedRealtimeNanos()
        startOffsetSeconds = (cameraStartNs - sensorStartNs) / 1_000_000_000.0
        lastVideoFile = file

        var pending = capture.output.prepareRecording(context, output)
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            pending = pending.withAudioEnabled()
        }
        activeRecording = pending.start(ContextCompat.getMainExecutor(context)) { event ->
            when (event) {
                is VideoRecordEvent.Start -> {
                    isRecording = true
                    status = "Videoaufnahme läuft"
                }
                is VideoRecordEvent.Finalize -> {
                    isRecording = false
                    activeRecording = null
                    status = if (event.hasError()) "Videofehler: ${event.error}" else "Video gespeichert: ${file.name}"
                }
            }
        }
    }

    fun stop() {
        activeRecording?.stop()
    }
}
