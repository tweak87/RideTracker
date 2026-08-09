package de.ridetracker.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.location.GnssStatus
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Google-independent location access for Android and Fire OS.
 *
 * Fire tablets do not normally ship Google Play Services, so the platform
 * LocationManager is the canonical source. GPS and network fixes are both
 * accepted; the existing GpsSpeedEstimator remains responsible for quality,
 * stationary locking and outlier rejection.
 */
class AndroidPlatformLocationProvider(context: Context) {
    private val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var continuousListener: LocationListener? = null
    private var gnssCallback: Any? = null

    data class GnssQuality(
        val satellitesVisible: Int = 0,
        val satellitesUsedInFix: Int = 0,
        val averageCn0DbHz: Double? = null,
    )

    val availableProviders: List<String>
        get() = preferredProviders().filter(::providerEnabled)

    @SuppressLint("MissingPermission")
    fun startUpdates(
        onLocation: (Location) -> Unit,
        onGnssQuality: (GnssQuality) -> Unit = {},
    ): List<String> {
        stopUpdates()
        val listener = listener(onLocation)
        val registered = mutableListOf<String>()
        preferredProviders().filter(::providerEnabled).forEach { provider ->
            runCatching {
                manager.requestLocationUpdates(provider, 200L, 0f, listener, Looper.getMainLooper())
                registered += provider
            }
        }
        if (registered.isNotEmpty()) continuousListener = listener
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && registered.contains(LocationManager.GPS_PROVIDER)) {
            val callback = object : GnssStatus.Callback() {
                override fun onSatelliteStatusChanged(status: GnssStatus) {
                    var used = 0
                    var cn0Sum = 0.0
                    var cn0Count = 0
                    for (index in 0 until status.satelliteCount) {
                        if (status.usedInFix(index)) used += 1
                        val cn0 = status.getCn0DbHz(index).toDouble()
                        if (cn0.isFinite() && cn0 > 0.0) { cn0Sum += cn0; cn0Count += 1 }
                    }
                    onGnssQuality(GnssQuality(status.satelliteCount, used, if (cn0Count > 0) cn0Sum / cn0Count else null))
                }
            }
            if (runCatching { manager.registerGnssStatusCallback(callback, Handler(Looper.getMainLooper())) }.getOrDefault(false)) {
                gnssCallback = callback
            }
        }
        return registered
    }

    fun stopUpdates() {
        continuousListener?.let { runCatching { manager.removeUpdates(it) } }
        continuousListener = null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            (gnssCallback as? GnssStatus.Callback)?.let { callback -> runCatching { manager.unregisterGnssStatusCallback(callback) } }
        }
        gnssCallback = null
    }

    @SuppressLint("MissingPermission")
    suspend fun currentLocation(timeoutMs: Long = 12_000L): Location = suspendCancellableCoroutine { continuation ->
        val providers = preferredProviders().filter(::providerEnabled)
        if (providers.isEmpty()) {
            continuation.resumeWithException(IllegalStateException("Kein Android-Standortanbieter ist aktiviert."))
            return@suspendCancellableCoroutine
        }

        val handler = Handler(Looper.getMainLooper())
        val cacheCutoff = System.currentTimeMillis() - 10 * 60 * 1_000L
        val cached = providers.mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }
            .filter { it.time >= cacheCutoff && it.accuracy <= 1_000f }
            .maxByOrNull { it.time }
        var bestLocation = cached
        lateinit var locationListener: LocationListener
        fun finish(location: Location?, error: Throwable? = null) {
            handler.removeCallbacksAndMessages(locationListener)
            runCatching { manager.removeUpdates(locationListener) }
            if (!continuation.isActive) return
            when {
                location != null -> continuation.resume(location)
                error != null -> continuation.resumeWithException(error)
                else -> continuation.resumeWithException(IllegalStateException("Standort konnte nicht rechtzeitig ermittelt werden."))
            }
        }

        locationListener = listener { location ->
            val best = bestLocation
            if (best == null || location.accuracy < best.accuracy || location.time > best.time + 5_000L) {
                bestLocation = location
            }
            if (location.accuracy <= 100f) finish(location)
        }
        continuation.invokeOnCancellation {
            handler.removeCallbacksAndMessages(locationListener)
            runCatching { manager.removeUpdates(locationListener) }
        }

        var registered = false
        providers.forEach { provider ->
            runCatching {
                manager.requestLocationUpdates(provider, 0L, 0f, locationListener, Looper.getMainLooper())
                registered = true
            }
        }
        if (!registered) {
            finish(cached, IllegalStateException("Android hat keinen Standortanbieter freigegeben."))
            return@suspendCancellableCoroutine
        }
        handler.postAtTime({ finish(bestLocation) }, locationListener, android.os.SystemClock.uptimeMillis() + timeoutMs)
    }

    private fun preferredProviders(): List<String> = listOf(
        LocationManager.GPS_PROVIDER,
        LocationManager.NETWORK_PROVIDER,
    ).filter { provider -> manager.allProviders.contains(provider) }

    private fun providerEnabled(provider: String): Boolean = runCatching { manager.isProviderEnabled(provider) }.getOrDefault(false)

    @Suppress("DEPRECATION")
    private fun listener(onLocation: (Location) -> Unit) = object : LocationListener {
        override fun onLocationChanged(location: Location) = onLocation(location)
        override fun onProviderEnabled(provider: String) = Unit
        override fun onProviderDisabled(provider: String) = Unit
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
    }
}
