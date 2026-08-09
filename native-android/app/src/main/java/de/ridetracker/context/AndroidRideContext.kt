package de.ridetracker.context

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.text.HtmlCompat
import de.ridetracker.community.CatalogAttraction
import de.ridetracker.community.CatalogCountry
import de.ridetracker.community.CatalogPark
import de.ridetracker.community.OfficialRideFacts
import de.ridetracker.community.RideCatalog
import de.ridetracker.location.AndroidPlatformLocationProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.Locale
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
    val officialFacts: OfficialRideFacts?,
    val weatherStart: WeatherSnapshot?,
    val weatherEnd: WeatherSnapshot?,
    val thumbnail: RideThumbnail?,
)

class AndroidRideContextStore(private val context: Context) {
    private val preferences = context.getSharedPreferences("ridetracker_context_v1", Context.MODE_PRIVATE)
    private val locationProvider = AndroidPlatformLocationProvider(context)

    var currentLocation by mutableStateOf<GeoPoint?>(null); private set
    var parks by mutableStateOf<List<NearbyPark>>(emptyList()); private set
    var attractions by mutableStateOf<List<NearbyAttraction>>(emptyList()); private set
    var selectedPark by mutableStateOf<NearbyPark?>(null); private set
    var selectedAttraction by mutableStateOf<NearbyAttraction?>(null); private set
    var officialFacts by mutableStateOf<OfficialRideFacts?>(null); private set
    var weatherStart by mutableStateOf<WeatherSnapshot?>(null); private set
    var weatherEnd by mutableStateOf<WeatherSnapshot?>(null); private set
    var thumbnail by mutableStateOf<RideThumbnail?>(null); private set
    var stockCandidates by mutableStateOf<List<StockImageCandidate>>(emptyList()); private set
    var busy by mutableStateOf(false); private set
    var status by mutableStateOf("Noch keine externen Standortdaten geladen."); private set
    var weatherEnabled by mutableStateOf(preferences.getBoolean("weatherEnabled", false)); private set
    var autoParkLookupEnabled by mutableStateOf(preferences.getBoolean("autoParkLookupEnabled", true)); private set
    var radiusM by mutableStateOf(preferences.getInt("radiusM", 25_000)); private set
    var selectedCountryCode by mutableStateOf(
        preferences.getString("catalogCountry", null)
            ?.takeIf { code -> RideCatalog.countries.any { it.code == code } }
            ?: Locale.getDefault().country.takeIf { code -> RideCatalog.countries.any { it.code == code } }
            ?: "DE",
    ); private set

    val catalogCountries: List<CatalogCountry> get() = RideCatalog.countries
    val catalogParks: List<CatalogPark> get() = RideCatalog.parksForCountry(selectedCountryCode)

    fun updateWeatherEnabled(enabled: Boolean) {
        weatherEnabled = enabled
        preferences.edit().putBoolean("weatherEnabled", enabled).apply()
    }

    fun updateAutoParkLookupEnabled(enabled: Boolean) {
        autoParkLookupEnabled = enabled
        preferences.edit().putBoolean("autoParkLookupEnabled", enabled).apply()
    }

    fun setRadius(radius: Int) {
        radiusM = radius.coerceIn(5_000, 50_000)
        preferences.edit().putInt("radiusM", radiusM).apply()
    }

    fun resetRideMedia() {
        currentLocation = null
        parks = emptyList()
        attractions = emptyList()
        selectedPark = null
        selectedAttraction = null
        officialFacts = null
        weatherStart = null
        weatherEnd = null
        thumbnail = null
        stockCandidates = emptyList()
    }

    fun selectAttraction(attraction: NearbyAttraction?) {
        selectedAttraction = attraction
        officialFacts = RideCatalog.findAttraction(attraction?.id)?.second?.facts
        status = attraction?.let { "Ausgewählt: ${it.name} · ${selectedPark?.name ?: "Park"}" }
            ?: "Bitte die passende Attraktion auswählen."
    }

    fun selectManualAttraction(name: String) {
        val normalized = name.trim()
        if (normalized.isBlank()) {
            status = "Bitte einen Namen für die Attraktion eingeben."
            return
        }
        selectAttraction(
            NearbyAttraction(
                id = "manual/${normalized.lowercase().replace(Regex("[^a-z0-9äöüß]+"), "-").trim('-')}",
                name = normalized,
                latitude = currentLocation?.latitude,
                longitude = currentLocation?.longitude,
                distanceM = 0.0,
                provider = "Manuelle Auswahl",
            ),
        )
    }

    fun selectCountry(code: String) {
        if (RideCatalog.countries.none { it.code == code }) return
        selectedCountryCode = code
        preferences.edit().putString("catalogCountry", code).apply()
        status = "${RideCatalog.countries.first { it.code == code }.name}: ${catalogParks.size} Parks im Offline-Katalog."
    }

    suspend fun selectCatalogPark(park: CatalogPark) {
        selectCountry(park.countryCode)
        selectPark(
            NearbyPark(
                id = park.id,
                name = park.name,
                latitude = park.latitude,
                longitude = park.longitude,
                distanceM = currentLocation?.let { RideCatalog.distanceMeters(it.latitude, it.longitude, park) } ?: 0.0,
                provider = "RideTracker-Katalog",
            ),
        )
    }

    fun selectCatalogAttraction(attraction: CatalogAttraction) {
        selectAttraction(
            NearbyAttraction(
                id = attraction.id,
                name = attraction.name,
                latitude = selectedPark?.latitude,
                longitude = selectedPark?.longitude,
                distanceM = currentLocation?.let { location ->
                    selectedPark?.let { park -> distanceMeters(location.latitude, location.longitude, park.latitude, park.longitude) }
                },
                provider = "RideTracker-Katalog${attraction.manufacturer?.let { " · $it" }.orEmpty()}",
            ),
        )
    }

    suspend fun selectPark(park: NearbyPark) {
        selectedPark = park
        selectedAttraction = null
        officialFacts = null
        attractions = emptyList()
        status = "Attraktionen in ${park.name} werden geladen …"
        val catalogPark = RideCatalog.findPark(park.id)
        if (catalogPark != null) {
            attractions = catalogPark.attractions.map { attraction ->
                NearbyAttraction(
                    id = attraction.id,
                    name = attraction.name,
                    latitude = park.latitude,
                    longitude = park.longitude,
                    distanceM = currentLocation?.let { distanceMeters(it.latitude, it.longitude, park.latitude, park.longitude) },
                    provider = "RideTracker-Katalog${attraction.manufacturer?.let { " · $it" }.orEmpty()}",
                )
            }
            status = "${attractions.size} Attraktionen aus dem Offline-Katalog. Bitte die gefahrene Attraktion auswählen."
            return
        }
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
    suspend fun requestCurrentLocation(): GeoPoint = locationProvider.currentLocation().let { location ->
        GeoPoint(location.latitude, location.longitude, location.accuracy.toDouble())
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
            val data = runCatching { postOverpass(query) }.getOrNull()
            val elements = data?.optJSONArray("elements")
            val onlineResult = buildList {
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
            }
            val catalogResult = RideCatalog.parks.mapNotNull { park ->
                val distance = RideCatalog.distanceMeters(location.latitude, location.longitude, park)
                park.takeIf { distance <= radiusM }?.let {
                    NearbyPark(it.id, it.name, it.latitude, it.longitude, distance, "RideTracker-Katalog")
                }
            }
            val result = (catalogResult + onlineResult)
                .distinctBy { it.name.lowercase(Locale.ROOT).replace(Regex("[^a-z0-9]"), "") }
                .sortedBy { it.distanceM }
            parks = result
            val nearestCatalog = RideCatalog.nearestPark(location.latitude, location.longitude, radiusM.toDouble())
            if (selectedPark == null && result.isNotEmpty()) {
                val candidate = nearestCatalog?.let { catalog -> result.firstOrNull { it.id == catalog.id } } ?: result.first()
                selectPark(candidate)
            }
            status = when {
                result.isEmpty() -> "Im gewählten Umkreis wurde kein Park gefunden. Nutze die Länderauswahl oder trage die Attraktion manuell ein."
                data == null -> "${result.size} Parks aus dem Offline-Katalog gefunden; der Kartendienst ist gerade nicht erreichbar."
                else -> "${result.size} Parks im Umkreis gefunden. Der nächste Park ist vorausgewählt."
            }
        } finally {
            busy = false
        }
    }

    suspend fun prepareForRecording() {
        runCatching {
            if (currentLocation == null) currentLocation = requestCurrentLocation()
            if (weatherEnabled) captureWeather("start")
        }.onFailure { status = "Fahrt startet lokal; Kontextabruf fehlgeschlagen: ${it.message}" }
    }

    suspend fun completeAfterRecording() {
        val failures = mutableListOf<String>()
        if (weatherEnabled) runCatching { captureWeather("end") }
            .onFailure { failures += "Wetter: ${it.message}" }
        if (autoParkLookupEnabled) runCatching { loadNearbyParks() }
            .onFailure { failures += "Parks: ${it.message}" }
        if (failures.isNotEmpty()) status = "Fahrt ist lokal vollständig; Kontext teilweise nicht verfügbar · ${failures.joinToString(" · ")}"
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

    fun snapshot() = AndroidRideContextSnapshot(selectedPark, selectedAttraction, officialFacts, weatherStart, weatherEnd, thumbnail)

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
        val failures = mutableListOf<String>()
        for (endpoint in OVERPASS_ENDPOINTS) {
            val result = runCatching {
                val connection = URL(endpoint).openConnection() as HttpURLConnection
                try {
                    connection.requestMethod = "POST"
                    connection.connectTimeout = 12_000
                    connection.readTimeout = 22_000
                    connection.doOutput = true
                    connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
                    connection.setRequestProperty("User-Agent", USER_AGENT)
                    val body = "data=" + URLEncoder.encode(query, StandardCharsets.UTF_8.toString())
                    connection.outputStream.use { it.write(body.toByteArray(StandardCharsets.UTF_8)) }
                    readJsonResponse(connection)
                } finally { connection.disconnect() }
            }
            result.getOrNull()?.let { return@withContext it }
            failures += "${URL(endpoint).host}: ${result.exceptionOrNull()?.message ?: "unbekannter Fehler"}"
        }
        throw IllegalStateException("Kartendienste nicht erreichbar (${failures.joinToString("; ")})")
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

    private fun plain(value: String): String = HtmlCompat.fromHtml(value, HtmlCompat.FROM_HTML_MODE_LEGACY).toString().replace(Regex("\\s+"), " ").trim()
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
        private val OVERPASS_ENDPOINTS = listOf(
            "https://overpass.kumi.systems/api/interpreter",
            "https://overpass-api.de/api/interpreter",
            "https://overpass.private.coffee/api/interpreter",
        )

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
    .put("officialData", officialFacts?.toJson() ?: JSONObject.NULL)

private fun OfficialRideFacts.toJson(): JSONObject = JSONObject()
    .put("maxSpeedKmh", maxSpeedKmh ?: JSONObject.NULL)
    .put("heightM", heightM ?: JSONObject.NULL)
    .put("lengthM", lengthM ?: JSONObject.NULL)
    .put("durationSeconds", durationSeconds ?: JSONObject.NULL)
    .put("inversions", inversions ?: JSONObject.NULL)
    .put("publishedMaxG", publishedMaxG ?: JSONObject.NULL)
    .put("sourceTitle", sourceTitle)
    .put("sourceUrl", sourceUrl)
    .put("verifiedAt", verifiedAt)

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
