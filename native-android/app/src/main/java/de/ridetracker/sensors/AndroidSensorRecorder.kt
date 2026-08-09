package de.ridetracker.sensors

import android.annotation.SuppressLint
import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.os.Build
import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import de.ridetracker.context.AndroidRideContextSnapshot
import de.ridetracker.core.CoreNativeSourceRoutingSnapshot
import de.ridetracker.core.RideTrackerCoreAdapter
import de.ridetracker.engine.*
import de.ridetracker.hud.AndroidHudConfigurationStore
import de.ridetracker.location.AndroidPlatformLocationProvider
import de.ridetracker.session.*
import de.ridetracker.video.CameraSourceManager
import java.io.File
import java.time.Instant
import java.util.UUID

data class AndroidLiveGForceSample(
    val timestampMs: Long = 0L,
    val normalG: Double = 1.0,
    val lateralG: Double = 0.0,
    val longitudinalG: Double = 0.0,
)

data class AndroidLiveSensorSample(
    val timestampMs: Long = 0L,
    val accelerationXG: Double = 0.0,
    val accelerationYG: Double = 0.0,
    val accelerationZG: Double = 0.0,
    val gyroscopeX: Double = 0.0,
    val gyroscopeY: Double = 0.0,
    val gyroscopeZ: Double = 0.0,
    val pressureHpa: Double? = null,
)

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
    var horizontalAccuracyM by mutableStateOf<Double?>(null); private set
    var verticalAccuracyM by mutableStateOf<Double?>(null); private set
    var speedAccuracyMS by mutableStateOf<Double?>(null); private set
    var locationProviderName by mutableStateOf<String?>(null); private set
    var satellitesVisible by mutableStateOf(0); private set
    var satellitesUsedInFix by mutableStateOf(0); private set
    var averageCn0DbHz by mutableStateOf<Double?>(null); private set
    var altitudeSource by mutableStateOf("none"); private set
    var hasBarometer by mutableStateOf(false); private set
    var lastSavedPath by mutableStateOf<String?>(null); private set
    var calibrationSampleCount by mutableStateOf(0); private set
    var forwardEdge by mutableStateOf(ForwardEdge.TOP)
    var sessionId by mutableStateOf(UUID.randomUUID().toString()); private set
    var recordingStartNs by mutableStateOf(0L); private set
    var privateNote by mutableStateOf("")
    var communityComment by mutableStateOf("")
    var publicationStatus by mutableStateOf("private")
    var shareExactLocation by mutableStateOf(false)
    var latestHeartRateBpm by mutableStateOf<Int?>(null); private set
    var heartRateSource by mutableStateOf<String?>(null); private set
    var locationProviderStatus by mutableStateOf("Android-Systemstandort bereit"); private set
    var liveGForceSample by mutableStateOf(AndroidLiveGForceSample()); private set
    var liveSensorSample by mutableStateOf(AndroidLiveSensorSample()); private set
    val isCalibrated: Boolean get() = rideEngine.calibration != null

    val coreAdapter = RideTrackerCoreAdapter()

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val locationProvider = AndroidPlatformLocationProvider(context)
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
    private var videoHudEmbedded = false
    private var rideContextSnapshot: AndroidRideContextSnapshot? = null
    private var diagnosticsActive = false
    private var lastLiveSensorPublishMs = 0L
    private var rawAcceleration = Vector3(0.0, 0.0, 0.0)
    private var rawGyroscope = Vector3(0.0, 0.0, 0.0)
    private var rawPressureHpa: Double? = null
    private var gpsAltitudeZero: Double? = null
    private var gpsSmoothedRelativeAltitude: Double? = null

    init {
        hasBarometer = pressure != null
        accelerometer?.also { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        rotationVector?.also { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
    }

    fun startDiagnostics() {
        diagnosticsActive = true
        gyroscope?.also { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        pressure?.also { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
    }

    fun stopDiagnostics() {
        diagnosticsActive = false
        if (!isRecording) {
            gyroscope?.let { sensorManager.unregisterListener(this, it) }
            pressure?.let { sensorManager.unregisterListener(this, it) }
        }
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
        val providers = runCatching {
            locationProvider.startUpdates(::handleLocation) { quality ->
                satellitesVisible = quality.satellitesVisible
                satellitesUsedInFix = quality.satellitesUsedInFix
                averageCn0DbHz = quality.averageCn0DbHz
            }
        }.getOrDefault(emptyList())
        locationProviderStatus = if (providers.isEmpty()) "Kein GPS/Netzwerk-Standort; Kraftsensoren laufen weiter" else "Systemstandort: ${providers.joinToString()}"
        status = "Aufnahme läuft · Session ${sessionId.take(8)} · $locationProviderStatus"
        gyroscope?.also { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        pressure?.also { hasBarometer = true; sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
    }

    fun attachVideo(filename: String?, startOffsetSeconds: Double, hudEmbedded: Boolean = false) {
        videoFilename = filename
        videoStartOffsetSeconds = startOffsetSeconds
        videoHudEmbedded = hudEmbedded
    }
    fun attachRideContext(snapshot: AndroidRideContextSnapshot) { rideContextSnapshot = snapshot }
    fun sessionSamplesSnapshot(): List<RideSessionSample> = sessionSamples.toList()

    fun stop() {
        if (!isRecording) return
        isRecording = false; locationProvider.stopUpdates()
        if (!diagnosticsActive) {
            gyroscope?.let { sensorManager.unregisterListener(this, it) }
            pressure?.let { sensorManager.unregisterListener(this, it) }
        }
        coreAdapter.recordingStopped()
        val gpsFallback = deriveGpsMotion(sessionSamples)
        distanceMeters = maxOf(distanceMeters, gpsFallback.distanceMeters)
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
        val accuracies = sessionSamples.mapNotNull { it.horizontalAccuracyM?.takeIf { value -> value.isFinite() } }
        val gpsFallback = deriveGpsMotion(sessionSamples)
        val maximumSpeedKmh = maxOf(sessionSamples.maxOfOrNull { it.speedMS * 3.6 } ?: 0.0, gpsFallback.maxSpeedMS * 3.6)
        val document = RideSessionDocument(
            id = sessionId, startedAt = startedAtInstant, endedAt = Instant.now(), events = sessionEvents.toList() + sourceEvents, samples = sessionSamples.toList(),
            summary = RideSessionSummary(
                durationSeconds = duration,
                sampleCount = sampleCount,
                distanceMeters = maxOf(distanceMeters, gpsFallback.distanceMeters),
                acceptedLocations = acceptedLocations,
                rejectedLocations = rejectedLocations,
                qualityScore = qualityScore,
                finalPhase = ridePhase,
                maxSpeedKmh = maximumSpeedKmh,
                bestHorizontalAccuracyM = accuracies.minOrNull(),
                averageHorizontalAccuracyM = accuracies.takeIf { it.isNotEmpty() }?.average(),
                maxSatellitesVisible = sessionSamples.mapNotNull { it.satellitesVisible }.maxOrNull(),
                maxSatellitesUsedInFix = sessionSamples.mapNotNull { it.satellitesUsedInFix }.maxOrNull(),
                altitudeSource = altitudeSource,
            ),
            calibrationMode = "automatic", forwardEdge = forwardEdge.name.lowercase(), calibration = rideEngine.calibration,
            videoFilename = videoFilename, videoStartOffsetSeconds = videoStartOffsetSeconds, videoHudEmbedded = videoHudEmbedded,
            privateNote = privateNote, communityComment = communityComment, publicationStatus = publicationStatus,
            shareExactLocation = shareExactLocation, heartRateSource = sourceRouter.resolve<Int>("heartRateBpm")?.sourceId ?: heartRateSource,
            configurationSnapshot = configurationSnapshot, rideContext = rideContextSnapshot,
        )
        return document.save(context).also { lastSavedPath = it.absolutePath; status = "Session gespeichert: ${it.name}" }
    }

    private fun reset() {
        sampleCount = 0; speedKmh = 0.0; speedSource = "unavailable"; stationaryLocked = false; relativeAltitudeM = 0.0; ridePhase = "idle"; previousPhase = "idle"
        qualityScore = 0; acceptedLocations = 0; rejectedLocations = 0; distanceMeters = 0.0
        horizontalAccuracyM = null; verticalAccuracyM = null; speedAccuracyMS = null; locationProviderName = null
        satellitesVisible = 0; satellitesUsedInFix = 0; averageCn0DbHz = null; altitudeSource = "none"
        latestLocation = null; latestSpeedMs = 0.0; latestAltitude = 0.0; lastAltitudeTime = 0.0; climbRate = 0.0
        hasBarometer = pressure != null; lastSavedPath = null; videoFilename = null; videoStartOffsetSeconds = 0.0; videoHudEmbedded = false
        privateNote = ""; communityComment = ""; publicationStatus = "private"; shareExactLocation = false
        liveGForceSample = AndroidLiveGForceSample(); gpsAltitudeZero = null; gpsSmoothedRelativeAltitude = null
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
            rawAcceleration = vector
            publishLiveSensors(event.timestamp)
            calibrationBuffer.addLast(vector); while (calibrationBuffer.size > 250) calibrationBuffer.removeFirst(); calibrationSampleCount = calibrationBuffer.size
            if (!isRecording) return
            val t = (event.timestamp - recordingStartNs) / 1_000_000_000.0
            val processed = rideEngine.processMotion(MotionInput(t, vector.x, vector.y, vector.z)); sampleCount += 1
            liveGForceSample = AndroidLiveGForceSample(
                timestampMs = event.timestamp / 1_000_000L,
                normalG = processed.normalG,
                lateralG = processed.lateralG,
                longitudinalG = processed.longitudinalG,
            )
            val routedSpeed = sourceRouter.resolve<Double>("speedKmh")
            latestSpeedMs = (routedSpeed?.value ?: 0.0) / 3.6
            speedKmh = routedSpeed?.value ?: 0.0
            val routedHeartRate = sourceRouter.resolve<Int>("heartRateBpm")
            routedSpeed?.let { coreAdapter.ingest(it.metric, it.sourceId, it.value, "km/h", it.quality, it.timestampMs) }
            routedHeartRate?.let { coreAdapter.ingest(it.metric, it.sourceId, it.value.toDouble(), "bpm", it.quality, it.timestampMs) }
            ridePhase = phaseDetector.update(t, latestSpeedMs, processed.longitudinalG, climbRate, processed.totalG)
            if (ridePhase != previousPhase) { sessionEvents += RideSessionEvent(t, ridePhase); previousPhase = ridePhase }
            val loc = latestLocation
            sessionSamples += RideSessionSample(
                timestamp = t,
                normalG = processed.normalG,
                lateralG = processed.lateralG,
                longitudinalG = processed.longitudinalG,
                totalG = processed.totalG,
                relativeAltitudeM = relativeAltitudeM.takeIf { altitudeSource != "none" },
                speedMS = latestSpeedMs,
                latitude = loc?.latitude,
                longitude = loc?.longitude,
                horizontalAccuracyM = horizontalAccuracyM,
                phase = ridePhase,
                qualityScore = qualityScore,
                heartRateBpm = routedHeartRate?.value,
                verticalAccuracyM = verticalAccuracyM,
                speedAccuracyMS = speedAccuracyMS,
                locationProvider = locationProviderName,
                satellitesVisible = satellitesVisible.takeIf { it > 0 },
                satellitesUsedInFix = satellitesUsedInFix.takeIf { it > 0 },
                averageCn0DbHz = averageCn0DbHz,
            )
            if (sampleCount % 50 == 0) updateQuality(); return
        }
        if (event.sensor.type == Sensor.TYPE_GYROSCOPE) {
            rawGyroscope = Vector3(event.values[0].toDouble(), event.values[1].toDouble(), event.values[2].toDouble())
            publishLiveSensors(event.timestamp)
            return
        }
        if (event.sensor.type == Sensor.TYPE_PRESSURE) {
            rawPressureHpa = event.values[0].toDouble()
            publishLiveSensors(event.timestamp)
        }
        if (!isRecording) return
        val t = (event.timestamp - recordingStartNs) / 1_000_000_000.0
        if (event.sensor.type == Sensor.TYPE_PRESSURE) {
            val absoluteAltitude = SensorManager.getAltitude(SensorManager.PRESSURE_STANDARD_ATMOSPHERE, event.values[0]).toDouble()
            relativeAltitudeM = altitudeFusion.updateBarometer(absoluteAltitude)
            altitudeSource = if (gpsAltitudeZero != null) "barometer+gps" else "barometer"
            if (lastAltitudeTime > 0.0 && t > lastAltitudeTime) climbRate = (relativeAltitudeM - latestAltitude) / (t - lastAltitudeTime)
            latestAltitude = relativeAltitudeM; lastAltitudeTime = t
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun publishLiveSensors(timestampNs: Long) {
        val timestampMs = timestampNs / 1_000_000L
        if (timestampMs - lastLiveSensorPublishMs < 50L) return
        lastLiveSensorPublishMs = timestampMs
        liveSensorSample = AndroidLiveSensorSample(
            timestampMs = timestampMs,
            accelerationXG = rawAcceleration.x,
            accelerationYG = rawAcceleration.y,
            accelerationZG = rawAcceleration.z,
            gyroscopeX = rawGyroscope.x,
            gyroscopeY = rawGyroscope.y,
            gyroscopeZ = rawGyroscope.z,
            pressureHpa = rawPressureHpa,
        )
    }

    private fun handleLocation(location: Location) {
        if (!isRecording) return
        if (!location.latitude.isFinite() || !location.longitude.isFinite() || !location.accuracy.isFinite() || location.accuracy > 100f) {
            rejectedLocations += 1
            updateQuality()
            return
        }
        val fixVerticalAccuracyM = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasVerticalAccuracy()) location.verticalAccuracyMeters.toDouble() else null
        val fixSpeedAccuracyMS = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasSpeedAccuracy()) location.speedAccuracyMetersPerSecond.toDouble() else null
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
        acceptedLocations += 1
        distanceMeters = rideEngine.distanceM
        latestLocation = location
        horizontalAccuracyM = location.accuracy.toDouble()
        verticalAccuracyM = fixVerticalAccuracyM
        speedAccuracyMS = fixSpeedAccuracyMS
        locationProviderName = location.provider
        if (location.hasAltitude() && (fixVerticalAccuracyM ?: 50.0) <= 60.0) {
            if (gpsAltitudeZero == null) gpsAltitudeZero = location.altitude
            val relativeGpsAltitude = location.altitude - (gpsAltitudeZero ?: location.altitude)
            if (hasBarometer) {
                altitudeFusion.correctWithGps(relativeGpsAltitude)
                if (altitudeSource == "barometer") altitudeSource = "barometer+gps"
            } else {
                gpsSmoothedRelativeAltitude = gpsSmoothedRelativeAltitude?.let { previous -> previous + 0.16 * (relativeGpsAltitude - previous).coerceIn(-8.0, 8.0) } ?: relativeGpsAltitude
                relativeAltitudeM = gpsSmoothedRelativeAltitude ?: 0.0
                altitudeSource = "gps"
            }
        }
        updateQuality()
    }

    private fun updateQuality() {
        qualityScore = QualityScore.calculate(
            motionSamples = sampleCount,
            gpsAccepted = acceptedLocations,
            gpsRejected = rejectedLocations,
            gaps = 0,
            calibrated = rideEngine.calibration != null,
            hasBarometer = hasBarometer,
            horizontalAccuracyM = horizontalAccuracyM,
            satellitesUsedInFix = satellitesUsedInFix.takeIf { it > 0 },
        )
    }
}
