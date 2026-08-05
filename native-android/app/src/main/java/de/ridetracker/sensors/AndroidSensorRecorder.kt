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
import com.google.android.gms.location.*
import de.ridetracker.engine.*
import de.ridetracker.session.*
import java.io.File
import java.time.Instant
import java.util.UUID

class AndroidSensorRecorder(private val context: Context) : SensorEventListener {
    var isRecording by mutableStateOf(false); private set
    var status by mutableStateOf("Bereit"); private set
    var sampleCount by mutableStateOf(0); private set
    var speedKmh by mutableStateOf(0.0); private set
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

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val locationClient = LocationServices.getFusedLocationProviderClient(context)
    private val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    private val pressure = sensorManager.getDefaultSensor(Sensor.TYPE_PRESSURE)
    private val altitudeFusion = AltitudeFusion()
    private val phaseDetector = RidePhaseDetector()
    private val rideEngine = RideEngine()
    private val calibrationBuffer = ArrayDeque<Vector3>()
    private val sessionSamples = mutableListOf<RideSessionSample>()
    private val sessionEvents = mutableListOf<RideSessionEvent>()
    private var lastLocation: Location? = null
    private var latestLocation: Location? = null
    private var latestSpeedMs = 0.0
    private var latestAltitude = 0.0
    private var lastAltitudeTime = 0.0
    private var climbRate = 0.0
    private var startedAtNs = 0L
    private var startedAtInstant = Instant.now()
    private var previousPhase = "idle"
    private var sessionId = UUID.randomUUID().toString()

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) { result.locations.forEach(::handleLocation) }
    }

    init { accelerometer?.also { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) } }

    fun calibrateNow() {
        val calibration = CalibrationMath.build(calibrationBuffer.takeLast(150), forwardEdge)
        if (calibration == null) status = "Kalibrierung fehlgeschlagen: Gerät ruhig halten"
        else { rideEngine.calibration = calibration; status = "Kalibriert · ${forwardEdge.title}"; updateQuality() }
    }

    @SuppressLint("MissingPermission")
    fun start() {
        if (isRecording) return
        reset()
        isRecording = true
        sessionId = UUID.randomUUID().toString()
        startedAtNs = SystemClock.elapsedRealtimeNanos()
        startedAtInstant = Instant.now()
        status = "Aufnahme läuft · Session ${sessionId.take(8)}"
        locationClient.requestLocationUpdates(
            LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 500L).setMinUpdateIntervalMillis(200L).build(),
            locationCallback, null,
        )
        gyroscope?.also { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        pressure?.also { hasBarometer = true; sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
    }

    fun stop() {
        if (!isRecording) return
        isRecording = false
        locationClient.removeLocationUpdates(locationCallback)
        gyroscope?.let { sensorManager.unregisterListener(this, it) }
        pressure?.let { sensorManager.unregisterListener(this, it) }
        updateQuality()
        status = "Beendet: $sampleCount Samples"
    }

    fun saveSession(): File {
        val duration = sessionSamples.lastOrNull()?.timestamp ?: 0.0
        val document = RideSessionDocument(
            id = sessionId,
            startedAt = startedAtInstant,
            endedAt = Instant.now(),
            events = sessionEvents.toList(),
            samples = sessionSamples.toList(),
            summary = RideSessionSummary(duration, sampleCount, distanceMeters, acceptedLocations, rejectedLocations, qualityScore, ridePhase),
            calibrationMode = "manual",
            forwardEdge = forwardEdge.name.lowercase(),
            calibration = rideEngine.calibration,
            videoFilename = null,
            videoStartOffsetSeconds = 0.0,
        )
        return document.save(context).also { lastSavedPath = it.absolutePath; status = "Session gespeichert: ${it.name}" }
    }

    private fun reset() {
        sampleCount = 0; speedKmh = 0.0; relativeAltitudeM = 0.0; ridePhase = "idle"; previousPhase = "idle"
        qualityScore = 0; acceptedLocations = 0; rejectedLocations = 0; distanceMeters = 0.0
        lastLocation = null; latestLocation = null; latestSpeedMs = 0.0; latestAltitude = 0.0
        lastAltitudeTime = 0.0; climbRate = 0.0; hasBarometer = pressure != null; lastSavedPath = null
        sessionSamples.clear(); sessionEvents.clear(); altitudeFusion.reset(); rideEngine.reset()
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) {
            val vector = Vector3(
                event.values[0].toDouble() / SensorManager.GRAVITY_EARTH,
                event.values[1].toDouble() / SensorManager.GRAVITY_EARTH,
                event.values[2].toDouble() / SensorManager.GRAVITY_EARTH,
            )
            calibrationBuffer.addLast(vector)
            while (calibrationBuffer.size > 250) calibrationBuffer.removeFirst()
            calibrationSampleCount = calibrationBuffer.size
            if (!isRecording) return
            val t = (event.timestamp - startedAtNs) / 1_000_000_000.0
            val processed = rideEngine.processMotion(MotionInput(t, vector.x, vector.y, vector.z))
            sampleCount += 1
            ridePhase = phaseDetector.update(t, latestSpeedMs, processed.longitudinalG, climbRate, processed.totalG)
            if (ridePhase != previousPhase) { sessionEvents += RideSessionEvent(t, ridePhase); previousPhase = ridePhase }
            val loc = latestLocation
            sessionSamples += RideSessionSample(
                t, processed.normalG, processed.lateralG, processed.longitudinalG, processed.totalG,
                if (hasBarometer) relativeAltitudeM else null, latestSpeedMs,
                loc?.latitude, loc?.longitude, loc?.accuracy?.toDouble(), ridePhase, qualityScore,
            )
            if (sampleCount % 50 == 0) updateQuality()
            return
        }
        if (!isRecording) return
        val t = (event.timestamp - startedAtNs) / 1_000_000_000.0
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
        val point = LocationInput(
            t = (location.elapsedRealtimeNanos - startedAtNs) / 1_000_000_000.0,
            latitude = location.latitude,
            longitude = location.longitude,
            accuracy = location.accuracy.toDouble(),
            speed = if (location.hasSpeed()) location.speed.toDouble() else null,
        )
        val result = rideEngine.processLocation(point)
        if (!result.accepted) { rejectedLocations += 1; return }
        acceptedLocations += 1; distanceMeters = rideEngine.distanceM
        lastLocation = location; latestLocation = location
        latestSpeedMs = if (location.hasSpeed()) location.speed.toDouble().coerceAtLeast(0.0) else 0.0
        speedKmh = latestSpeedMs * 3.6; updateQuality()
    }

    private fun updateQuality() {
        qualityScore = QualityScore.calculate(sampleCount, acceptedLocations, rejectedLocations, 0, rideEngine.calibration != null, hasBarometer)
    }
}
