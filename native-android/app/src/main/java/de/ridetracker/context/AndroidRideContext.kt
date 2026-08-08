package de.ridetracker.context

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.net.Uri
import android.text.Html
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.Instant
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.roundToInt

data class GeoPoint(
    val latitude: Double,
    val longitude: Double,
    val accuracyM: Double? = null,
)

data class NearbyPark(
    val id: String,
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val distanceM: Double,
    val provider: String = "OpenStreetMap",
)

data class NearbyAttraction(
    val id: String,
    val name: String,
    val latitude: Double?,
    val longitude: Double?,
    val distanceM: Double?,
    val provider: String = "OpenStreetMap",
)

data class WeatherSnapshot(
    val kind: String,
    val observedAt: String,
    val fetchedAt: String,
    val condition: String,
    val weatherCode: Int,
    val temperatureC: Double,
    val apparentTemperatureC: Double,
    val humidityPercent: Double,
    val precipitationMm: Double,
    val rainMm: Double,
    val cloudCoverPercent: Double,
    val pressureHpa: Double,
    val windSpeedKmh: Double,
    val windDirectionDeg: Double,
    val windGustKmh: Double,
    val source: String = "Open-Meteo",
    val license: String = "CC BY 4.0",
)

data class RideThumbnail(
    val kind: String,
    val fileName: String,
    val title: String,
    val creator: String,
    val attribution: String,
    val sourceUrl: String?,
    val license: String,
    val licenseUrl: String?,
    val provider: String,
    val rightsConfirmed: Boolean,
)

data class StockImageCandidate(
    val title: String,
    val creator: String,
    val attribution: String,
    val thumbnailUrl: String,
    val sourceUrl: String,
    val license: String,
    val licenseUrl: String?,
)

data class AndroidRideContextSnapshot(
    val park: NearbyPark?,
    val attraction: NearbyAttraction?,
    val weatherStart: WeatherSnapshot?,
    val weatherEnd: WeatherSnapshot?,
    val thumbnail: RideThumbnail?,
)

class AndroidRideContextStore(private val context: Context) {
    private val preferences = context.getSharedPreferences("ridetracker_context_v1", Context.MODE_PRIVATE)
    private val locationClient = LocationServices.getFusedLocationProviderClient(context)

    var currentLocation by mutableStateOf<GeoPoint?>(null); private set
    var parks by mutableStateOf<List<NearbyPark>>(emptyList()); private set
    var attractions by mutableStateOf<List<NearbyAttraction>>(emptyList()); private set
    var selectedPark by mutableStateOf<NearbyPark?>(null); private set
    var selectedAttraction by mutableStateOf<NearbyAttraction?>(null); private set
    var weatherStart by mutableStateOf<WeatherSnapshot?>(null); private set
    var weatherEnd by mutableStateOf<WeatherSnapshot?>(null); private set
    var thumbnail by mutableStateOf<RideThumbnail?>(null); private set
    var stockCandidates by mutableStateOf<List<StockImageCandidate>>(emptyList()); private set
    var busy by mutableStateOf(false); private set
    var status by mutableStateOf("Noch keine externen Standortdaten geladen."); private set
    var weatherEnabled by mutableStateOf(preferences.getBoolean("weatherEnabled", false)); private set
    var radiusM by mutableStateOf(preferences.getInt("radiusM", 25_000)); private set

    fun setWeatherEnabled(enabled: Boolean) {
        weatherEnabled = enabled
        preferences.edit().putBoolean("weatherEnabled", enabled).apply()
    }

    fun setRadius(radius: Int) {
        radiusM = radius.coerceIn(5_000, 50_000)
        preferences.edit().putInt("radiusM", radiusM).apply()
    }

    fun resetRideMedia() {
        weatherStart = null
        weatherEnd = null
        thumbnail = null
        stockCandidates = emptyList()
    }

    fun selectAttraction(attraction: NearbyAttraction?) {
        selectedAttraction = attraction
        status = attraction?.let { "Ausgewählt: ${it.name} · ${selectedPark?.name ?: "Park"}" }
            ?: "Bitte die passende Attraktion auswählen."
    }

    suspend fun selectPark(park: NearbyPark) {
        selectedPark = park
        selectedAttraction = null
        attractions = emptyList()
        status = "Attraktionen in ${park.name} werden geladen …"
        runCatching { loadAttractions(park) }
            .onSuccess { values ->
                attractions = values
                val closest = values.filter { it.distanceM != null }.minByOrNull { it.distanceM ?: Double.MAX_VALUE }
                selectedAttraction = closest?.takeIf { (it.distanceM ?: Double.MAX_VALUE) <= 600.0 }
                status = "${values.size} Attraktionen gefunden. Bitte die richtige Bahn auswählen."
            }
            .onFailure { error -> status = "Attraktionen konnten nicht geladen werden: ${error.message}" }
    }

    @SuppressLint("MissingPermission")
    suspend fun requestCurrentLocation(): GeoPoint = suspendCancellableCoroutine { continuation ->
        val cancellation = CancellationTokenSource()
        continuation.invokeOnCancellation { cancellation.cancel() }
        locationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancellation.token)
            .addOnSuccessListener { location ->
                if (!continuation.isActive) return@addOnSuccessListener
                if (location == null) continuation.resumeWithException(IllegalStateException("Standort konnte nicht ermittelt werden."))
                else continuation.resume(GeoPoint(location.latitude, location.longitude, location.accuracy.toDouble()))
            }
            .addOnFailureListener { error -> if (continuation.isActive) continuation.resumeWithException(error) }
    }

    suspend fun loadNearbyParks() {
        if (busy) return
        busy = true
        status = "Standort und Parks werden ermittelt …"
        try {
            val location = requestCurrentLocation()
            currentLocation = location
            val queryLat = "%.3f".format(java.util.Locale.US, location.latitude)
            val queryLon = "%.3f".format(java.util.Locale.US, location.longitude)
            val query = "[out:json][timeout:15];(nwr(around:$radiusM,$queryLat,$queryLon)[\"tourism\"=\"theme_park\"];nwr(around:$radiusM,$queryLat,$queryLon)[\"leisure\"=\"amusement_park\"];);out center tags;"
            val data = postOverpass(query)
            val elements = data.optJSONArray("elements")
            val result = buildList {
                if (elements != null) for (index in 0 until elements.length()) {
                    val element = elements.optJSONObject(index) ?: continue
                    val center = element.optJSONObject("center")
                    val latitude = if (center?.has("lat") == true) center.optDouble("lat") else element.optDouble("lat", Double.NaN)
                    val longitude = if (center?.has("lon") == true) center.optDouble("lon") else element.optDouble("lon", Double.NaN)
                    if (!latitude.isFinite() || !longitude.isFinite()) continue
                    val tags = element.optJSONObject("tags")
                    val name = tags?.optString("name")?.takeIf { it.isNotBlank() } ?: "Unbenannter Park"
                    val distance = distanceMeters(location.latitude, location.longitude, latitude, longitude)
                    if (distance <= radiusM) add(NearbyPark("${element.optString("type")}/${element.optLong("id")}", name, latitude, longitude, distance))
                }
            }.sortedBy { it.distanceM }
            parks = result
            if (selectedPark == null && result.isNotEmpty()) selectPark(result.first())
            status = if (result.isEmpty()) "Im gewählten Umkreis wurde kein Park gefunden. Park und Bahn können später manuell eingetragen werden."
            else "${result.size} Parks im Umkreis gefunden. Der nächste Park ist vorausgewählt."
        } finally {
            busy = false
        }
    }

    suspend fun prepareForRecording() {
        runCatching {
            if (currentLocation == null) currentLocation = requestCurrentLocation()
            if (preferences.getBoolean("externalLookupConsent", false) && parks.isEmpty()) loadNearbyParks()
            if (weatherEnabled) captureWeather("start")
        }.onFailure { status = "Fahrt startet lokal; Kontextabruf fehlgeschlagen: ${it.message}" }
    }

    fun markExternalLookupConsent() {
        preferences.edit().putBoolean("externalLookupConsent", true).apply()
    }

    suspend fun captureWeather(kind: String): WeatherSnapshot? {
        if (!weatherEnabled) return null
        val location = currentLocation ?: requestCurrentLocation().also { currentLocation = it }
        val latitude = "%.3f".format(java.util.Locale.US, location.latitude)
        val longitude = "%.3f".format(java.util.Locale.US, location.longitude)
        val fields = "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m"
        val url = "https://api.open-meteo.com/v1/forecast?latitude=$latitude&longitude=$longitude&current=$fields&wind_speed_unit=kmh&timezone=auto&forecast_days=1"
        val data = fetchJson(url)
        val current = data.optJSONObject("current") ?: throw IllegalStateException("Open-Meteo lieferte keine aktuellen Wetterdaten.")
        val code = current.optInt("weather_code", -1)
        val snapshot = WeatherSnapshot(
            kind = kind,
            observedAt = current.optString("time", Instant.now().toString()),
            fetchedAt = Instant.now().toString(),
            condition = weatherCodeText(code),
            weatherCode = code,
            temperatureC = current.optDouble("temperature_2m"),
            apparentTemperatureC = current.optDouble("apparent_temperature"),
            humidityPercent = current.optDouble("relative_humidity_2m"),
            precipitationMm = current.optDouble("precipitation"),
            rainMm = current.optDouble("rain"),
            cloudCoverPercent = current.optDouble("cloud_cover"),
            pressureHpa = current.optDouble("surface_pressure"),
            windSpeedKmh = current.optDouble("wind_speed_10m"),
            windDirectionDeg = current.optDouble("wind_direction_10m"),
            windGustKmh = current.optDouble("wind_gusts_10m"),
        )
        if (kind == "end") weatherEnd = snapshot else weatherStart = snapshot
        status = "${selectedPark?.name ?: "Park noch offen"} · ${snapshot.condition}, ${"%.1f".format(snapshot.temperatureC)} °C · Wind ${snapshot.windSpeedKmh.roundToInt()} km/h"
        return snapshot
    }

    suspend fun useUserImage(uri: Uri) {
        busy = true
        status = "Bild wird lokal gespeichert …"
        try {
            val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
            require(mime.startsWith("image/")) { "Bitte eine Bilddatei auswählen." }
            val filename = "RideTracker-cover-${System.currentTimeMillis()}.jpg"
            val file = File(context.filesDir, filename)
            context.contentResolver.openInputStream(uri)?.use { input -> copyLimited(input.readBytesLimited(12 * 1024 * 1024), file) }
                ?: throw IllegalStateException("Bild konnte nicht geöffnet werden.")
            thumbnail = RideThumbnail("user", filename, filename, "Nutzer-Upload", "Eigenes Nutzerbild", null, "user-provided", null, "user", false)
            status = "Eigenes Bild ausgewählt. Vor einer Veröffentlichung bitte die Bildrechte bestätigen."
        } finally { busy = false }
    }

    fun confirmImageRights(confirmed: Boolean) {
        thumbnail = thumbnail?.takeIf { it.kind == "user" }?.copy(rightsConfirmed = confirmed) ?: thumbnail
    }

    fun removeThumbnail() {
        thumbnail?.fileName?.let { File(context.filesDir, it).takeIf(File::exists)?.delete() }
        thumbnail = null
        stockCandidates = emptyList()
        status = "Fahrtbild entfernt."
    }

    suspend fun searchStockImages() {
        val query = listOfNotNull(selectedAttraction?.name, selectedPark?.name, "roller coaster").joinToString(" ")
        require(query.isNotBlank()) { "Bitte zuerst Park oder Attraktion auswählen." }
        busy = true
        status = "Wikimedia Commons wird durchsucht …"
        try {
            val encoded = URLEncoder.encode(query, StandardCharsets.UTF_8.toString())
            val url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=$encoded&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=800"
            val pages = fetchJson(url).optJSONObject("query")?.optJSONObject("pages")
            val values = buildList {
                pages?.keys()?.forEach { key ->
                    val page = pages.optJSONObject(key) ?: return@forEach
                    val info = page.optJSONArray("imageinfo")?.optJSONObject(0) ?: return@forEach
                    val meta = info.optJSONObject("extmetadata") ?: JSONObject()
                    fun meta(name: String) = plain(meta.optJSONObject(name)?.optString("value").orEmpty())
                    val license = meta("LicenseShortName")
                    val thumbnailUrl = info.optString("thumburl")
                    if (!allowedLicense(license) || !thumbnailUrl.startsWith("https://upload.wikimedia.org/")) return@forEach
                    val title = page.optString("title").removePrefix("File:")
                    val creator = meta("Artist").ifBlank { meta("Credit") }.ifBlank { "Unbekannt" }
                    add(StockImageCandidate(title, creator, "$title · $creator · $license", thumbnailUrl, info.optString("descriptionurl"), license, meta("LicenseUrl").takeIf { it.isNotBlank() }))
                }
            }.take(6)
            stockCandidates = values
            status = if (values.isEmpty()) "Kein ausreichend frei lizenziertes Bild gefunden." else "${values.size} freie Bilder gefunden. Quelle und Lizenz werden mitgespeichert."
        } finally { busy = false }
    }

    suspend fun selectStockImage(candidate: StockImageCandidate) {
        busy = true
        status = "Stockbild wird lokal gespeichert …"
        try {
            val bytes = fetchBytes(candidate.thumbnailUrl, 12 * 1024 * 1024)
            val filename = "RideTracker-stock-${System.currentTimeMillis()}.jpg"
            copyLimited(bytes, File(context.filesDir, filename))
            thumbnail = RideThumbnail("stock", filename, candidate.title, candidate.creator, candidate.attribution, candidate.sourceUrl, candidate.license, candidate.licenseUrl, "Wikimedia Commons", true)
            stockCandidates = emptyList()
            status = "Stockbild gespeichert · ${candidate.license} · Wikimedia Commons"
        } finally { busy = false }
    }

    fun snapshot() = AndroidRideContextSnapshot(selectedPark, selectedAttraction, weatherStart, weatherEnd, thumbnail)

    private suspend fun loadAttractions(park: NearbyPark): List<NearbyAttraction> {
        val query = "[out:json][timeout:15];(nwr(around:3500,${park.latitude},${park.longitude})[\"roller_coaster\"];nwr(around:3500,${park.latitude},${park.longitude})[\"attraction\"=\"roller_coaster\"];nwr(around:3500,${park.latitude},${park.longitude})[\"tourism\"=\"attraction\"];);out center tags;"
        val elements = postOverpass(query).optJSONArray("elements")
        return buildList {
            if (elements != null) for (index in 0 until elements.length()) {
                val element = elements.optJSONObject(index) ?: continue
                val tags = element.optJSONObject("tags") ?: JSONObject()
                val name = tags.optString("name").takeIf { it.isNotBlank() } ?: continue
                val center = element.optJSONObject("center")
                val latitude = if (center?.has("lat") == true) center.optDouble("lat") else element.optDouble("lat", Double.NaN)
                val longitude = if (center?.has("lon") == true) center.optDouble("lon") else element.optDouble("lon", Double.NaN)
                val distance = if (latitude.isFinite() && longitude.isFinite()) currentLocation?.let { distanceMeters(it.latitude, it.longitude, latitude, longitude) } else null
                add(NearbyAttraction("${element.optString("type")}/${element.optLong("id")}", name, latitude.takeIf { it.isFinite() }, longitude.takeIf { it.isFinite() }, distance))
            }
        }.distinctBy { it.name.lowercase() }.sortedBy { it.name }
    }

    private suspend fun postOverpass(query: String): JSONObject = withContext(Dispatchers.IO) {
        val connection = URL("https://overpass-api.de/api/interpreter").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
            connection.setRequestProperty("User-Agent", USER_AGENT)
            val body = "data=" + URLEncoder.encode(query, StandardCharsets.UTF_8.toString())
            connection.outputStream.use { it.write(body.toByteArray(StandardCharsets.UTF_8)) }
            readJsonResponse(connection)
        } finally { connection.disconnect() }
    }

    private suspend fun fetchJson(url: String): JSONObject = withContext(Dispatchers.IO) {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", USER_AGENT)
            readJsonResponse(connection)
        } finally { connection.disconnect() }
    }

    private fun readJsonResponse(connection: HttpURLConnection): JSONObject {
        val statusCode = connection.responseCode
        val stream = if (statusCode in 200..299) connection.inputStream else connection.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        if (statusCode !in 200..299) throw IllegalStateException("${connection.url.host}: HTTP $statusCode")
        return JSONObject(text)
    }

    private suspend fun fetchBytes(url: String, maximumBytes: Int): ByteArray = withContext(Dispatchers.IO) {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            connection.setRequestProperty("User-Agent", USER_AGENT)
            val statusCode = connection.responseCode
            if (statusCode !in 200..299) throw IllegalStateException("${connection.url.host}: HTTP $statusCode")
            connection.inputStream.use { it.readBytesLimited(maximumBytes) }
        } finally { connection.disconnect() }
    }

    private fun ByteArray.copyTo(file: File) = file.outputStream().use { it.write(this) }
    private fun copyLimited(bytes: ByteArray, file: File) = bytes.copyTo(file)

    private fun java.io.InputStream.readBytesLimited(maximumBytes: Int): ByteArray {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var total = 0
        while (true) {
            val count = read(buffer)
            if (count < 0) break
            total += count
            require(total <= maximumBytes) { "Das Bild darf maximal ${maximumBytes / 1024 / 1024} MB groß sein." }
            output.write(buffer, 0, count)
        }
        return output.toByteArray()
    }

    private fun plain(value: String): String = Html.fromHtml(value, Html.FROM_HTML_MODE_LEGACY).toString().replace(Regex("\\s+"), " ").trim()
    private fun allowedLicense(value: String): Boolean = Regex("^(CC0|Public domain|Public Domain|CC BY(?:\\s|-|$))", RegexOption.IGNORE_CASE).containsMatchIn(value) && !Regex("BY-(SA|NC|ND)", RegexOption.IGNORE_CASE).containsMatchIn(value)
    private fun weatherCodeText(code: Int) = when {
        code == 0 -> "Klar"
        code in 1..2 -> "Leicht bewölkt"
        code == 3 -> "Bedeckt"
        code in listOf(45, 48) -> "Nebel"
        code in 51..67 -> "Regen/Niesel"
        code in 71..77 -> "Schnee"
        code in 80..82 -> "Regenschauer"
        code in 85..86 -> "Schneeschauer"
        code >= 95 -> "Gewitter"
        else -> "Unbekannt"
    }

    companion object {
        const val OSM_ATTRIBUTION = "Kartendaten © OpenStreetMap-Mitwirkende"
        const val WEATHER_ATTRIBUTION = "Wetterdaten: Open-Meteo.com · CC BY 4.0"
        private const val USER_AGENT = "RideTracker-Android/2026.08.08 (https://github.com/tweak87/RideTracker)"

        fun distanceMeters(latA: Double, lonA: Double, latB: Double, lonB: Double): Double {
            val result = FloatArray(1)
            Location.distanceBetween(latA, lonA, latB, lonB, result)
            return result[0].toDouble()
        }
    }
}

fun AndroidRideContextSnapshot.contextJson(): JSONObject = JSONObject()
    .put("parkID", park?.id ?: JSONObject.NULL)
    .put("rideID", attraction?.id ?: JSONObject.NULL)
    .put("parkName", park?.name ?: JSONObject.NULL)
    .put("rideName", attraction?.name ?: JSONObject.NULL)
    .put("parkProvider", park?.provider ?: JSONObject.NULL)
    .put("rideProvider", attraction?.provider ?: JSONObject.NULL)

fun AndroidRideContextSnapshot.environmentJson(): JSONObject = JSONObject()
    .put("weather", JSONObject().put("start", weatherStart?.toJson() ?: JSONObject.NULL).put("end", weatherEnd?.toJson() ?: JSONObject.NULL))
    .put("source", if (weatherStart != null || weatherEnd != null) JSONObject().put("provider", "Open-Meteo").put("license", "CC BY 4.0").put("url", "https://open-meteo.com/") else JSONObject.NULL)

fun RideThumbnail.toJson(): JSONObject = JSONObject()
    .put("kind", kind).put("fileName", fileName).put("title", title).put("creator", creator)
    .put("attribution", attribution).put("sourceUrl", sourceUrl ?: JSONObject.NULL).put("license", license)
    .put("licenseUrl", licenseUrl ?: JSONObject.NULL).put("provider", provider).put("rightsConfirmed", rightsConfirmed)

private fun WeatherSnapshot.toJson(): JSONObject = JSONObject()
    .put("kind", kind).put("observedAt", observedAt).put("fetchedAt", fetchedAt)
    .put("condition", JSONObject().put("code", weatherCode).put("label", condition))
    .put("temperatureC", temperatureC).put("apparentTemperatureC", apparentTemperatureC)
    .put("relativeHumidityPercent", humidityPercent).put("precipitationMm", precipitationMm).put("rainMm", rainMm)
    .put("cloudCoverPercent", cloudCoverPercent).put("surfacePressureHpa", pressureHpa)
    .put("wind", JSONObject().put("speedKmh", windSpeedKmh).put("directionDeg", windDirectionDeg).put("gustKmh", windGustKmh))
    .put("source", JSONObject().put("provider", source).put("license", license).put("url", "https://open-meteo.com/"))
