package de.ridetracker.sensors

import android.annotation.SuppressLint
import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult as GoogleLocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import de.ridetracker.context.AndroidRideContextSnapshot
import de.ridetracker.core.CoreNativeSourceRoutingSnapshot
import de.ridetracker.core.RideTrackerCoreAdapter
import de.ridetracker.engine.*
import de.ridetracker.hud.AndroidHudConfigurationStore
import de.ridetracker.session.*
import de.ridetracker.video.CameraSourceManager
import java.io.File
import java.time.Instant
import java.util.UUID

class AndroidSensorRecorder(private val context: Context) : SensorEventListener {
    var isRecording by mutableStateOf(false); private set
    var status by mutableStateOf("Bereit"); private set
    var sampleCount by mutableStateOf(0); private set
    var speedKmh by mutableStateOf(0.0); private set
    var speedSource by mutableStateOf("unavailable"); private set
    var stationaryLocked by mutableStateOf(false); private set
    var headingDegrees by mutableStateOf<Double?>(null); private set
    var relativeAltitudeM by mutableStateOf(0.0); private set
    var ridePhase by mutableStateOf("idle"); private set
    var qualityScore by mutableStateOf(0); private set
    var acceptedLocations by mutableStateOf(0); private set
    var rejectedLocations by mutableStateOf(0); private set
    var distanceMeters by mutableStateOf(0.0); private set
    var hasBarometer by mutableStateOf(false); private set
    var lastSavedPath by mutableStateOf<String?>(null); private set
    var calibrationSampleCount by mutableStateOf(0); private set
    var forwardEdge by mutableStateOf(ForwardEdge.TOP)
    var sessionId by mutableStateOf(UUID.randomUUID().toString()); private set
    var recordingStartNs by mutableStateOf(0L); private set
    var privateNote by mutableStateOf("")
    var communityComment by mutableStateOf("")
    var latestHeartRateBpm by mutableStateOf<Int?>(null); private set
    var heartRateSource by mutableStateOf<String?>(null); private set

    val coreAdapter = RideTrackerCoreAdapter()

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val locationClient = LocationServices.getFusedLocationProviderClient(context)
    private val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    private val pressure = sensorManager.getDefaultSensor(Sensor.TYPE_PRESSURE)
    private val rotationVector = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val altitudeFusion = AltitudeFusion()
    private val phaseDetector = RidePhaseDetector()
    private val rideEngine = RideEngine()
    private val gpsSpeedEstimator = GpsSpeedEstimator()
    private val sourceRouter = TelemetrySourceRouter().apply {
        policies = listOf(
            TelemetrySourcePolicy("heartRateBpm", "ble-heart/heartRate", listOf("watch-heart/heartRate"), 0.6, 3_000L),
            TelemetrySourcePolicy("speedKmh", "external-gnss/speed", listOf("phone-gps/speed"), 0.45, 2_000L),
        )
    }
    private val calibrationBuffer = ArrayDeque<Vector3>()
    private val sessionSamples = mutableListOf<RideSessionSample>()
    private val sessionEvents = mutableListOf<RideSessionEvent>()
    private var latestLocation: Location? = null
    private var latestSpeedMs = 0.0
    private var latestAltitude = 0.0
    private var lastAltitudeTime = 0.0
    private var climbRate = 0.0
    private var startedAtInstant = Instant.now()
    private var previousPhase = "idle"
    private var videoFilename: String? = null
    private var videoStartOffsetSeconds = 0.0
    private var rideContextSnapshot: AndroidRideContextSnapshot? = null

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: GoogleLocationResult) { result.locations.forEach(::handleLocation) }
    }

    init {
        accelerometer?.also { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        rotationVector?.also { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
    }

    fun calibrateNow(): Boolean {
        val calibration = CalibrationMath.build(calibrationBuffer.takeLast(150), forwardEdge)
        return if (calibration == null) { status = "Kalibrierung fehlgeschlagen: Gerät ruhig halten"; false }
        else { rideEngine.calibration = calibration; status = "Kalibriert · ${forwardEdge.title}"; updateQuality(); true }
    }

    fun setHeartRate(bpm: Int?, source: String?) {
        latestHeartRateBpm = bpm
        heartRateSource = source
        if (bpm != null) sourceRouter.ingest("heartRateBpm", "ble-heart/heartRate", bpm, 1.0)
    }

    @SuppressLint("MissingPermission")
    fun start() {
        if (isRecording) return
        val calibration = CalibrationMath.build(calibrationBuffer.takeLast(150), forwardEdge)
        reset()
        if (calibration != null) rideEngine.calibration = calibration
        sessionId = UUID.randomUUID().toString(); recordingStartNs = SystemClock.elapsedRealtimeNanos(); startedAtInstant = Instant.now(); isRecording = true
        coreAdapter.recordingStarted(sessionId, recordingStartNs / 1_000_000L)
        status = "Aufnahme läuft · Session ${sessionId.take(8)}"
        locationClient.requestLocationUpdates(LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 500L).setMinUpdateIntervalMillis(200L).build(), locationCallback, null)
        gyroscope?.also { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        pressure?.also { hasBarometer = true; sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
    }

    fun attachVideo(filename: String?, startOffsetSeconds: Double) { videoFilename = filename; videoStartOffsetSeconds = startOffsetSeconds }
    fun attachRideContext(snapshot: AndroidRideContextSnapshot) { rideContextSnapshot = snapshot }

    fun stop() {
        if (!isRecording) return
        isRecording = false; locationClient.removeLocationUpdates(locationCallback)
        gyroscope?.let { sensorManager.unregisterListener(this, it) }; pressure?.let { sensorManager.unregisterListener(this, it) }
        coreAdapter.recordingStopped()
        updateQuality(); status = "Beendet: $sampleCount Samples"
    }

    fun saveSession(): File {
        val duration = sessionSamples.lastOrNull()?.timestamp ?: 0.0
        val sourceEvents = sourceRouter.switches.map {
            val relativeSeconds = ((it.timestampMs * 1_000_000L - recordingStartNs).coerceAtLeast(0L)) / 1_000_000_000.0
            coreAdapter.sourceSwitched(it.metric, it.to, it.timestampMs)
            RideSessionEvent(relativeSeconds, "source-switch:${it.metric}:${it.from ?: "none"}->${it.to ?: "none"}:${it.reason}")
        }
        val routingSnapshot = sourceRouter.policies.map { policy ->
            CoreNativeSourceRoutingSnapshot(
                metric = policy.metric,
                primarySource = policy.primarySource,
                fallbackSources = policy.fallbackSources,
                minimumQuality = policy.minimumQuality.coerceIn(0.0,1.0),
                maxAgeMs = policy.maxAgeMs.coerceAtLeast(0),
            )
        }
        val configurationSnapshot = coreAdapter.configurationSnapshot(
            cameraSources = CameraSourceManager(context),
            sourceRouting = routingSnapshot,
            forwardEdge = forwardEdge.name.lowercase(),
            connectedHeartRateName = heartRateSource,
            hud = AndroidHudConfigurationStore.snapshot(context),
        )
        val document = RideSessionDocument(
            id = sessionId, startedAt = startedAtInstant, endedAt = Instant.now(), events = sessionEvents.toList() + sourceEvents, samples = sessionSamples.toList(),
            summary = RideSessionSummary(duration, sampleCount, distanceMeters, acceptedLocations, rejectedLocations, qualityScore, ridePhase),
            calibrationMode = "automatic", forwardEdge = forwardEdge.name.lowercase(), calibration = rideEngine.calibration,
            videoFilename = videoFilename, videoStartOffsetSeconds = videoStartOffsetSeconds,
            privateNote = privateNote, communityComment = communityComment, heartRateSource = sourceRouter.resolve<Int>("heartRateBpm")?.sourceId ?: heartRateSource,
            configurationSnapshot = configurationSnapshot, rideContext = rideContextSnapshot,
        )
        return document.save(context).also { lastSavedPath = it.absolutePath; status = "Session gespeichert: ${it.name}" }
    }

    private fun reset() {
        sampleCount = 0; speedKmh = 0.0; speedSource = "unavailable"; stationaryLocked = false; relativeAltitudeM = 0.0; ridePhase = "idle"; previousPhase = "idle"
        qualityScore = 0; acceptedLocations = 0; rejectedLocations = 0; distanceMeters = 0.0
        latestLocation = null; latestSpeedMs = 0.0; latestAltitude = 0.0; lastAltitudeTime = 0.0; climbRate = 0.0
        hasBarometer = pressure != null; lastSavedPath = null; videoFilename = null; videoStartOffsetSeconds = 0.0
        rideContextSnapshot = null; sessionSamples.clear(); sessionEvents.clear(); sourceRouter.reset(); coreAdapter.resetRuntime(); altitudeFusion.reset(); rideEngine.reset(); gpsSpeedEstimator.reset()
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type == Sensor.TYPE_ROTATION_VECTOR) {
            val matrix = FloatArray(9)
            val orientation = FloatArray(3)
            SensorManager.getRotationMatrixFromVector(matrix, event.values)
            SensorManager.getOrientation(matrix, orientation)
            headingDegrees = (Math.toDegrees(orientation[0].toDouble()) + 360.0) % 360.0
            return
        }
        if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) {
            val vector = Vector3(event.values[0].toDouble() / SensorManager.GRAVITY_EARTH, event.values[1].toDouble() / SensorManager.GRAVITY_EARTH, event.values[2].toDouble() / SensorManager.GRAVITY_EARTH)
            calibrationBuffer.addLast(vector); while (calibrationBuffer.size > 250) calibrationBuffer.removeFirst(); calibrationSampleCount = calibrationBuffer.size
            if (!isRecording) return
            val t = (event.timestamp - recordingStartNs) / 1_000_000_000.0
            val processed = rideEngine.processMotion(MotionInput(t, vector.x, vector.y, vector.z)); sampleCount += 1
            val routedSpeed = sourceRouter.resolve<Double>("speedKmh")
            latestSpeedMs = (routedSpeed?.value ?: 0.0) / 3.6
            speedKmh = routedSpeed?.value ?: 0.0
            val routedHeartRate = sourceRouter.resolve<Int>("heartRateBpm")
            routedSpeed?.let { coreAdapter.ingest(it.metric, it.sourceId, it.value, "km/h", it.quality, it.timestampMs) }
            routedHeartRate?.let { coreAdapter.ingest(it.metric, it.sourceId, it.value.toDouble(), "bpm", it.quality, it.timestampMs) }
            ridePhase = phaseDetector.update(t, latestSpeedMs, processed.longitudinalG, climbRate, processed.totalG)
            if (ridePhase != previousPhase) { sessionEvents += RideSessionEvent(t, ridePhase); previousPhase = ridePhase }
            val loc = latestLocation
            sessionSamples += RideSessionSample(t, processed.normalG, processed.lateralG, processed.longitudinalG, processed.totalG, if (hasBarometer) relativeAltitudeM else null, latestSpeedMs, loc?.latitude, loc?.longitude, loc?.accuracy?.toDouble(), ridePhase, qualityScore, heartRateBpm = routedHeartRate?.value)
            if (sampleCount % 50 == 0) updateQuality(); return
        }
        if (!isRecording) return
        val t = (event.timestamp - recordingStartNs) / 1_000_000_000.0
        if (event.sensor.type == Sensor.TYPE_PRESSURE) {
            val absoluteAltitude = SensorManager.getAltitude(SensorManager.PRESSURE_STANDARD_ATMOSPHERE, event.values[0]).toDouble()
            relativeAltitudeM = altitudeFusion.updateBarometer(absoluteAltitude)
            if (lastAltitudeTime > 0.0 && t > lastAltitudeTime) climbRate = (relativeAltitudeM - latestAltitude) / (t - lastAltitudeTime)
            latestAltitude = relativeAltitudeM; lastAltitudeTime = t
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun handleLocation(location: Location) {
        if (!isRecording) return
        val nativeSpeed = if (location.hasSpeed()) location.speed.toDouble().coerceAtLeast(0.0) else null
        val estimate = gpsSpeedEstimator.update(GpsObservation(location.elapsedRealtimeNanos / 1_000_000L, location.latitude, location.longitude, location.accuracy.toDouble(), nativeSpeed))
        speedKmh = estimate.speedKmh ?: 0.0
        speedSource = estimate.source
        stationaryLocked = estimate.stationaryLocked
        sourceRouter.ingest("speedKmh", "phone-gps/speed", speedKmh, estimate.confidence, location.elapsedRealtimeNanos / 1_000_000L)
        if (estimate.suppressPosition) { rejectedLocations += 1; updateQuality(); return }
        val point = LocationInput(t = (location.elapsedRealtimeNanos - recordingStartNs) / 1_000_000_000.0, latitude = location.latitude, longitude = location.longitude, accuracy = location.accuracy.toDouble(), speed = estimate.speedMS)
        val result = rideEngine.processLocation(point)
        if (!result.accepted) { rejectedLocations += 1; return }
        acceptedLocations += 1; distanceMeters = rideEngine.distanceM; latestLocation = location
        updateQuality()
    }

    private fun updateQuality() { qualityScore = QualityScore.calculate(sampleCount, acceptedLocations, rejectedLocations, 0, rideEngine.calibration != null, hasBarometer) }
}
