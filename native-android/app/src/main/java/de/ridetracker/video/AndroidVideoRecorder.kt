package de.ridetracker.video

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaMetadataRetriever
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraEffect
import androidx.camera.core.Preview
import androidx.camera.core.UseCaseGroup
import androidx.camera.effects.OverlayEffect
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
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
import androidx.core.util.Consumer
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.delay
import java.io.File

@androidx.annotation.OptIn(markerClass = [ExperimentalCamera2Interop::class])
class AndroidVideoRecorder(
    private val context: Context,
    private val lifecycleOwner: LifecycleOwner,
) {
    var isRecording by mutableStateOf(false)
        private set
    var isStarting by mutableStateOf(false)
        private set
    var isConfigured by mutableStateOf(false)
        private set
    var isConfiguring by mutableStateOf(false)
        private set
    var isFinalizing by mutableStateOf(false)
        private set
    var status by mutableStateOf("Video bereit zur Initialisierung")
        private set
    var lastVideoFile by mutableStateOf<File?>(null)
        private set
    var playableVideoFile by mutableStateOf<File?>(null)
        private set
    var videoDurationMs by mutableStateOf(0L)
        private set
    var startOffsetSeconds by mutableStateOf(0.0)
        private set
    var isHudEmbedded by mutableStateOf(false)
        private set

    val cameraSources = CameraSourceManager(context)
    private var videoCapture: VideoCapture<Recorder>? = null
    private var previewUseCase: Preview? = null
    private var previewSurfaceProvider: Preview.SurfaceProvider? = null
    private var activeRecording: Recording? = null
    private val hudRenderer = VideoHudOverlayRenderer()
    private val hudThread = HandlerThread("RideTrackerVideoHud").apply { start() }
    private val hudEffect = OverlayEffect(
        CameraEffect.VIDEO_CAPTURE,
        0,
        Handler(hudThread.looper),
        Consumer { error ->
            isHudEmbedded = false
            status = "Video-HUD-Fallback: ${error.localizedMessage ?: error.javaClass.simpleName}"
        },
    ).apply {
        setOnDrawListener { frame -> hudRenderer.draw(frame.overlayCanvas) }
    }

    fun updateHud(sample: VideoHudSample) = hudRenderer.update(sample)

    fun configure() {
        if (isConfiguring || isRecording) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            isConfigured = false
            status = "Kamerafreigabe wird beim Start angefragt"
            return
        }
        isConfiguring = true
        isConfigured = false
        status = "Kamera wird initialisiert …"
        val providerFuture = ProcessCameraProvider.getInstance(context)
        providerFuture.addListener({
            runCatching {
                val provider = providerFuture.get()
                val recorder = Recorder.Builder()
                    .setQualitySelector(
                        QualitySelector.fromOrderedList(
                            listOf(Quality.FHD, Quality.HD, Quality.SD),
                            FallbackStrategy.lowerQualityOrHigherThan(Quality.SD),
                        ),
                    )
                    .build()
                val capture = VideoCapture.withOutput(recorder)
                val preview = Preview.Builder().build().also { preview ->
                    previewSurfaceProvider?.let(preview::setSurfaceProvider)
                }
                videoCapture = capture
                previewUseCase = preview
                provider.unbindAll()

                val useCaseGroup = UseCaseGroup.Builder()
                    .addUseCase(preview)
                    .addUseCase(capture)
                    .addEffect(hudEffect)
                    .build()

                val orderedIds = cameraSources.orderedSources().map { it.id }
                var boundId: String? = null
                var lastError: Throwable? = null
                var hudBound = false
                for (cameraId in orderedIds) {
                    val selector = CameraSelector.Builder()
                        .addCameraFilter { infos -> infos.filter { Camera2CameraInfo.from(it).cameraId == cameraId } }
                        .build()
                    try {
                        provider.bindToLifecycle(lifecycleOwner, selector, useCaseGroup)
                        boundId = cameraId
                        hudBound = true
                        break
                    } catch (error: Throwable) {
                        lastError = error
                        provider.unbindAll()
                    }
                }
                if (boundId == null) {
                    runCatching { provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, useCaseGroup) }
                        .onSuccess { hudBound = true }
                        .onFailure {
                            lastError = it
                            provider.unbindAll()
                            provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture)
                        }
                    boundId = "fallback-back"
                }
                isHudEmbedded = hudBound
                isConfigured = true
                status = "Video bereit: $boundId · HUD ${if (hudBound) "wird eingebettet" else "erscheint synchron in der App"}"
                lastError?.let { if (orderedIds.isNotEmpty() && !hudBound) status += " (Kameraeffekt-Fallback)" }
            }.onFailure {
                isConfigured = false
                isHudEmbedded = false
                status = "Kamerafehler: ${it.localizedMessage ?: it.javaClass.simpleName}"
            }
            isConfiguring = false
        }, ContextCompat.getMainExecutor(context))
    }

    fun attachPreview(surfaceProvider: Preview.SurfaceProvider) {
        previewSurfaceProvider = surfaceProvider
        previewUseCase?.setSurfaceProvider(surfaceProvider)
        if (!isConfigured && !isConfiguring) configure()
    }

    fun reconfigureSelectedCamera() {
        if (isRecording) {
            status = "Kamera kann während der Aufnahme nicht gewechselt werden"
            return
        }
        configure()
    }

    fun start(sessionId: String, sensorStartNs: Long) {
        if (activeRecording != null || isStarting || isRecording) return
        val capture = videoCapture?.takeIf { isConfigured } ?: run {
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
        playableVideoFile = null
        videoDurationMs = 0L
        isFinalizing = false
        hudRenderer.reset()

        var pending = capture.output.prepareRecording(context, output)
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            pending = pending.withAudioEnabled()
        }
        isStarting = true
        activeRecording = pending.start(ContextCompat.getMainExecutor(context)) { event ->
            when (event) {
                is VideoRecordEvent.Start -> {
                    isStarting = false
                    isRecording = true
                    status = "Videoaufnahme läuft"
                }
                is VideoRecordEvent.Finalize -> {
                    isStarting = false
                    isRecording = false
                    isFinalizing = false
                    activeRecording = null
                    if (event.hasError()) {
                        playableVideoFile = null
                        status = "Videofehler beim Abschließen: ${event.error}"
                    } else {
                        val duration = validateVideo(file)
                        if (duration != null) {
                            videoDurationMs = duration
                            playableVideoFile = file
                            status = "Video sicher gespeichert: ${file.name}"
                        } else {
                            playableVideoFile = null
                            status = "Video wurde geschrieben, ist aber nicht abspielbar"
                        }
                    }
                }
            }
        }
    }

    fun stop() {
        val recording = activeRecording
        if (recording == null) {
            isStarting = false
            isRecording = false
            return
        }
        isFinalizing = true
        status = "Video wird abgeschlossen und geprüft …"
        recording.stop()
    }

    suspend fun awaitFinalized(timeoutMs: Long = 15_000L): File? {
        var waited = 0L
        while ((isRecording || isStarting || isFinalizing || activeRecording != null) && waited < timeoutMs) {
            delay(100L)
            waited += 100L
        }
        if (playableVideoFile == null && waited >= timeoutMs) status = "Videoabschluss dauert zu lange; Fahrtdaten bleiben erhalten"
        return playableVideoFile
    }

    private fun validateVideo(file: File): Long? {
        if (!file.exists() || file.length() < 4_096L) return null
        return runCatching {
            val retriever = MediaMetadataRetriever()
            try {
                retriever.setDataSource(file.absolutePath)
                retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
                    ?.takeIf { it > 0L }
                    ?: 1L
            } finally {
                retriever.release()
            }
        }.getOrNull()
    }
}
