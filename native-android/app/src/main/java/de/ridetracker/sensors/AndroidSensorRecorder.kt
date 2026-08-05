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
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import de.ridetracker.engine.AltitudeFusion
import de.ridetracker.engine.QualityScore
import de.ridetracker.engine.RidePhaseDetector
import de.ridetracker.session.RideSessionDocument
import de.ridetracker.session.RideSessionEvent
import de.ridetracker.session.RideSessionSample
import de.ridetracker.session.RideSessionSummary
import java.io.File
import java.time.Instant
import kotlin.math.sqrt

class AndroidSensorRecorder(private val context: Context) : SensorEventListener {
    var isRecording by mutableStateOf(false)
        private set
    var status by mutableStateOf("Bereit")
        private set
    var sampleCount by mutableStateOf(0)
        private set
    var speedKmh by mutableStateOf(0.0)
        private set
    var relativeAltitudeM by mutableStateOf(0.0)
        private set
    var ridePhase by mutableStateOf("idle")
        private set
    var qualityScore by mutableStateOf(0)
        private set
    var acceptedLocations by mutableStateOf(0)
        private set
    var rejectedLocations by mutableStateOf(0)
        private set
    var distanceMeters by mutableStateOf(0.0)
        private set
    var hasBarometer by mutableStateOf(false)
        private set
    var lastSavedPath by mutableStateOf<String?>(null)
        private set

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val locationClient: FusedLocationProviderClient = LocationServices.getFusedLocationProviderClient(context)
    private val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    private val pressure = sensorManager.getDefaultSensor(Sensor.TYPE_PRESSURE)
    private val altitudeFusion = AltitudeFusion()
    private val phaseDetector = RidePhaseDetector()
    private val sessionSamples = mutableListOf<RideSessionSample>()
    private val sessionEvents = mutableListOf<RideSessionEvent>()
    private var lastLocation: Location? = null
    private var latestLocation: Location? = null
    private var latestSpeedMs = 0.0
    private var latestTotalG = 1.0
    private var latestLongitudinalG = 0.0
    private var latestAltitude = 0.0
    private var lastAltitudeTime = 0.0
    private var climbRate = 0.0
    private var startedAtNs = 0L
    private var startedAtInstant = Instant.now()
    private var previousPhase = "idle"

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.locations.forEach(::handleLocation)
        }
    }

    @SuppressLint("MissingPermission")
    fun start() {
        if (isRecording) return
        reset()
        isRecording = true
        startedAtNs = SystemClock.elapsedRealtimeNanos()
        startedAtInstant = Instant.now()
        status = "Aufnahme läuft"
        locationClient.requestLocationUpdates(
            LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 500L)
                .setMinUpdateIntervalMillis(200L)
                .setMinUpdateDistanceMeters(0f)
                .build(),
            locationCallback,
            null,
        )
        accelerometer?.also { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        gyroscope?.also { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        pressure?.also {
            hasBarometer = true
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
    }

    fun stop() {
        if (!isRecording) return
        isRecording = false
        sensorManager.unregisterListener(this)
        locationClient.removeLocationUpdates(locationCallback)
        updateQuality()
        status = "Beendet: $sampleCount Samples"
    }

    fun saveSession(): File {
        val duration = if (startedAtNs == 0L) 0.0 else
            (SystemClock.elapsedRealtimeNanos() - startedAtNs) / 1_000_000_000.0
        val document = RideSessionDocument(
            startedAt = startedAtInstant,
            endedAt = Instant.now(),
            events = sessionEvents.toList(),
            samples = sessionSamples.toList(),
            summary = RideSessionSummary(
                durationSeconds = duration,
                sampleCount = sampleCount,
                distanceMeters = distanceMeters,
                acceptedLocations = acceptedLocations,
                rejectedLocations = rejectedLocations,
                qualityScore = qualityScore,
                finalPhase = ridePhase,
            ),
            calibrationMode = "manual",
            calibrated = false,
        )
        return document.save(context).also {
            lastSavedPath = it.absolutePath
            status = "Session gespeichert: ${it.name}"
        }
    }

    private fun reset() {
        sampleCount = 0
        speedKmh = 0.0
        relativeAltitudeM = 0.0
        ridePhase = "idle"
        previousPhase = "idle"
        qualityScore = 0
        acceptedLocations = 0
        rejectedLocations = 0
        distanceMeters = 0.0
        lastLocation = null
        latestLocation = null
        latestSpeedMs = 0.0
        latestTotalG = 1.0
        latestLongitudinalG = 0.0
        latestAltitude = 0.0
        lastAltitudeTime = 0.0
        climbRate = 0.0
        hasBarometer = pressure != null
        lastSavedPath = null
        sessionSamples.clear()
        sessionEvents.clear()
        altitudeFusion.reset()
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (!isRecording) return
        val t = (event.timestamp - startedAtNs) / 1_000_000_000.0
        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                val gx = event.values[0] / SensorManager.GRAVITY_EARTH
                val gy = event.values[1] / SensorManager.GRAVITY_EARTH
                val gz = event.values[2] / SensorManager.GRAVITY_EARTH
                latestTotalG = sqrt((gx * gx + gy * gy + gz * gz).toDouble())
                latestLongitudinalG = gy.toDouble()
                sampleCount += 1
                ridePhase = phaseDetector.update(t, latestSpeedMs, latestLongitudinalG, climbRate, latestTotalG)
                if (ridePhase != previousPhase) {
                    sessionEvents += RideSessionEvent(t, ridePhase)
                    previousPhase = ridePhase
                }
                val loc = latestLocation
                sessionSamples += RideSessionSample(
                    timestamp = t,
                    totalG = latestTotalG,
                    longitudinalG = latestLongitudinalG,
                    relativeAltitudeM = if (hasBarometer) relativeAltitudeM else null,
                    speedMS = latestSpeedMs,
                    latitude = loc?.latitude,
                    longitude = loc?.longitude,
                    horizontalAccuracyM = loc?.accuracy?.toDouble(),
                    phase = ridePhase,
                    qualityScore = qualityScore,
                )
                if (sampleCount % 50 == 0) updateQuality()
            }
            Sensor.TYPE_PRESSURE -> {
                val absoluteAltitude = SensorManager.getAltitude(
                    SensorManager.PRESSURE_STANDARD_ATMOSPHERE,
                    event.values[0],
                ).toDouble()
                relativeAltitudeM = altitudeFusion.updateBarometer(absoluteAltitude)
                if (lastAltitudeTime > 0.0 && t > lastAltitudeTime) {
                    climbRate = (relativeAltitudeM - latestAltitude) / (t - lastAltitudeTime)
                }
                latestAltitude = relativeAltitudeM
                lastAltitudeTime = t
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun handleLocation(location: Location) {
        if (!isRecording) return
        if (location.accuracy < 0f || location.accuracy > 40f) {
            rejectedLocations += 1
            return
        }
        val previous = lastLocation
        if (previous != null) {
            val dt = ((location.elapsedRealtimeNanos - previous.elapsedRealtimeNanos) / 1_000_000_000.0)
                .coerceAtLeast(0.001)
            val distance = previous.distanceTo(location).toDouble()
            val impliedSpeed = distance / dt
            val uncertainty = maxOf(location.accuracy, previous.accuracy) * 0.55
            val reportedSpeed = if (location.hasSpeed()) location.speed.toDouble().coerceAtLeast(0.0) else 0.0
            val stationary = reportedSpeed < 0.8 && distance <= uncertainty
            val tooSmall = distance < 1.5 && dt < 2.0
            val impossible = impliedSpeed > 90.0
            if (stationary || tooSmall || impossible) {
                rejectedLocations += 1
                return
            }
            distanceMeters += distance
        }
        lastLocation = location
        latestLocation = location
        acceptedLocations += 1
        latestSpeedMs = if (location.hasSpeed()) location.speed.toDouble().coerceAtLeast(0.0) else 0.0
        speedKmh = latestSpeedMs * 3.6
        updateQuality()
    }

    private fun updateQuality() {
        qualityScore = QualityScore.calculate(
            motionSamples = sampleCount,
            gpsAccepted = acceptedLocations,
            gpsRejected = rejectedLocations,
            gaps = 0,
            calibrated = false,
            hasBarometer = hasBarometer,
        )
    }
}
