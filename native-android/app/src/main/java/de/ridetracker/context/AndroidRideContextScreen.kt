package de.ridetracker.context

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.launch
import java.io.File
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.sin

@Composable
fun AndroidRideContextPanel(
    store: AndroidRideContextStore,
    requestParkSearch: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.launch { runCatching { store.useUserImage(uri) } }
    }

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Park, Attraktion & Wetter", style = MaterialTheme.typography.titleLarge)
            Text(
                "Die Aufnahme bleibt lokal. Externe Standort-, Wetter- und Bildabrufe erfolgen erst nach deiner Auswahl.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Text("Umkreis", style = MaterialTheme.typography.labelMedium)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf(listOf(5_000 to "5 km", 15_000 to "15 km"), listOf(25_000 to "25 km", 50_000 to "50 km")).forEach { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { (radius, label) ->
                            FilterChip(
                                selected = store.radiusM == radius,
                                onClick = { store.setRadius(radius) },
                                label = { Text(label) },
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.weight(1f)) {
                    Text("Wetter bei Start und Ende")
                    Text("Open-Meteo · optional", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(store.weatherEnabled, store::updateWeatherEnabled)
            }

            Button(
                onClick = { store.markExternalLookupConsent(); requestParkSearch() },
                enabled = !store.busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (store.busy) "Wird geladen …" else "Parks im Umkreis suchen") }

            Text(store.status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

            if (store.currentLocation != null && store.parks.isNotEmpty()) {
                NearbyParkMap(
                    center = store.currentLocation!!,
                    parks = store.parks,
                    attractions = store.attractions,
                    selectedPark = store.selectedPark,
                    radiusM = store.radiusM,
                    selectPark = { park -> scope.launch { store.selectPark(park) } },
                )
                Text(AndroidRideContextStore.OSM_ATTRIBUTION, style = MaterialTheme.typography.labelSmall)
                store.parks.take(12).forEachIndexed { index, park ->
                    OutlinedButton(
                        onClick = { scope.launch { store.selectPark(park) } },
                        modifier = Modifier.fillMaxWidth(),
                        colors = if (store.selectedPark?.id == park.id) ButtonDefaults.outlinedButtonColors(containerColor = MaterialTheme.colorScheme.secondaryContainer) else ButtonDefaults.outlinedButtonColors(),
                    ) {
                        Text("${index + 1}. ${park.name} · ${"%.1f".format(park.distanceM / 1000.0)} km")
                    }
                }
            }

            if (store.attractions.isNotEmpty()) {
                HorizontalDivider()
                Text("Attraktion auswählen", style = MaterialTheme.typography.titleMedium)
                store.attractions.take(20).forEach { attraction ->
                    FilterChip(
                        selected = store.selectedAttraction?.id == attraction.id,
                        onClick = { store.selectAttraction(attraction) },
                        label = { Text(attraction.name) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            weatherSummary(store.weatherStart)?.let {
                HorizontalDivider()
                Text("Wetter gespeichert", style = MaterialTheme.typography.titleMedium)
                Text(it, style = MaterialTheme.typography.bodySmall)
                Text(AndroidRideContextStore.WEATHER_ATTRIBUTION, style = MaterialTheme.typography.labelSmall)
            }

            HorizontalDivider()
            Text("Fahrtbild & Thumbnail", style = MaterialTheme.typography.titleMedium)
            store.thumbnail?.let { image ->
                val file = File(context.filesDir, image.fileName)
                val bitmap = remember(image.fileName, file.lastModified()) { BitmapFactory.decodeFile(file.absolutePath) }
                if (bitmap != null) Image(bitmap.asImageBitmap(), image.title, Modifier.fillMaxWidth().height(190.dp), contentScale = ContentScale.Crop)
                Text(image.attribution, style = MaterialTheme.typography.bodySmall)
                Text("${image.provider} · ${image.license}", style = MaterialTheme.typography.labelSmall)
                image.sourceUrl?.let { source ->
                    TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(source))) }) { Text("Bildquelle öffnen") }
                }
                if (image.kind == "user") {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Bildrechte für Veröffentlichung bestätigt", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                        Checkbox(image.rightsConfirmed, store::confirmImageRights)
                    }
                }
            } ?: Text("Noch kein Fahrtbild ausgewählt.", color = MaterialTheme.colorScheme.onSurfaceVariant)

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { picker.launch("image/*") }, modifier = Modifier.weight(1f)) { Text("Eigenes Bild") }
                OutlinedButton(onClick = { scope.launch { runCatching { store.searchStockImages() } } }, enabled = !store.busy, modifier = Modifier.weight(1f)) { Text("Freies Stockbild") }
            }
            if (store.thumbnail != null) TextButton(store::removeThumbnail) { Text("Bild entfernen") }

            store.stockCandidates.forEach { candidate ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        StockImagePreview(candidate.thumbnailUrl, candidate.title)
                        Text(candidate.title, style = MaterialTheme.typography.titleSmall)
                        Text("${candidate.creator} · ${candidate.license}", style = MaterialTheme.typography.bodySmall)
                        Button(onClick = { scope.launch { runCatching { store.selectStockImage(candidate) } } }) { Text("Dieses Bild verwenden") }
                    }
                }
            }

            Text(
                "Stockbilder stammen ausschließlich aus Wikimedia Commons und werden auf Public Domain, CC0 oder CC BY beschränkt. Quelle, Urheber und Lizenz bleiben in der Fahrt gespeichert.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun NearbyParkMap(
    center: GeoPoint,
    parks: List<NearbyPark>,
    attractions: List<NearbyAttraction>,
    selectedPark: NearbyPark?,
    radiusM: Int,
    selectPark: (NearbyPark) -> Unit,
) {
    val html = remember(center, parks, attractions, selectedPark, radiusM) { mapHtml(center, parks, attractions, selectedPark, radiusM) }
    AndroidView(
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.domStorageEnabled = false
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                        val uri = request?.url ?: return false
                        if (uri.scheme == "ridetracker" && uri.host == "park") {
                            uri.lastPathSegment?.toIntOrNull()?.let { index -> parks.getOrNull(index)?.let(selectPark) }
                            return true
                        }
                        return uri.host != "tile.openstreetmap.org" && uri.host != "www.openstreetmap.org"
                    }
                }
                tag = html.hashCode()
                loadDataWithBaseURL("https://tile.openstreetmap.org/", html, "text/html", "UTF-8", null)
            }
        },
        update = { view ->
            if (view.tag != html.hashCode()) {
                view.tag = html.hashCode()
                view.loadDataWithBaseURL("https://tile.openstreetmap.org/", html, "text/html", "UTF-8", null)
            }
        },
        modifier = Modifier.fillMaxWidth().height(270.dp),
    )
}

@Composable
private fun StockImagePreview(url: String, title: String) {
    if (!url.startsWith("https://upload.wikimedia.org/")) return
    AndroidView(
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.domStorageEnabled = false
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean = true
                }
            }
        },
        update = { view ->
            if (view.tag != url) {
                view.tag = url
                view.loadDataWithBaseURL(
                    "https://upload.wikimedia.org/",
                    "<html><meta name='viewport' content='width=device-width,initial-scale=1'><style>html,body{margin:0;height:100%;background:#111}img{width:100%;height:100%;object-fit:cover}</style><body><img src='${escapeHtml(url)}' alt='${escapeHtml(title)}'></body></html>",
                    "text/html",
                    "UTF-8",
                    null,
                )
            }
        },
        modifier = Modifier.fillMaxWidth().height(130.dp),
    )
}

private fun mapHtml(center: GeoPoint, parks: List<NearbyPark>, attractions: List<NearbyAttraction>, selectedPark: NearbyPark?, radiusM: Int): String {
    val zoom = when { radiusM <= 5_000 -> 13; radiusM <= 15_000 -> 11; radiusM <= 30_000 -> 10; else -> 9 }
    val centerPixel = project(center.latitude, center.longitude, zoom)
    val tileCount = 1 shl zoom
    val centerTileX = floor(centerPixel.first / 256.0).toInt()
    val centerTileY = floor(centerPixel.second / 256.0).toInt()
    val tiles = buildString {
        for (tileX in centerTileX - 2..centerTileX + 2) for (tileY in centerTileY - 1..centerTileY + 1) {
            if (tileY !in 0 until tileCount) continue
            val wrappedX = ((tileX % tileCount) + tileCount) % tileCount
            val left = tileX * 256.0 - centerPixel.first
            val top = tileY * 256.0 - centerPixel.second
            append("<img class='tile' src='https://tile.openstreetmap.org/$zoom/$wrappedX/$tileY.png' style='left:calc(50% + ${left}px);top:calc(50% + ${top}px)'>")
        }
    }
    val markers = buildString {
        append("<span class='marker current' style='left:50%;top:50%'>●</span>")
        parks.take(40).forEachIndexed { index, park ->
            val pixel = project(park.latitude, park.longitude, zoom)
            val left = pixel.first - centerPixel.first
            val top = pixel.second - centerPixel.second
            val selected = if (park.id == selectedPark?.id) " selected" else ""
            append("<a class='marker park$selected' href='ridetracker://park/$index' title='${escapeHtml(park.name)}' style='left:calc(50% + ${left}px);top:calc(50% + ${top}px)'>${index + 1}</a>")
        }
        attractions.take(50).forEach { attraction ->
            val latitude = attraction.latitude ?: return@forEach
            val longitude = attraction.longitude ?: return@forEach
            val pixel = project(latitude, longitude, zoom)
            val left = pixel.first - centerPixel.first
            val top = pixel.second - centerPixel.second
            append("<span class='marker attraction' title='${escapeHtml(attraction.name)}' style='left:calc(50% + ${left}px);top:calc(50% + ${top}px)'>◆</span>")
        }
    }
    return """
        <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
        <style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0c1b2c}.map{position:relative;width:100%;height:100%;overflow:hidden}.tile{position:absolute;width:256px;height:256px}.marker{position:absolute;z-index:2;transform:translate(-50%,-100%);min-width:24px;height:24px;line-height:22px;padding:0 4px;text-align:center;border:2px solid white;border-radius:20px;background:#175d89;color:white;font:900 11px system-ui;text-decoration:none;box-sizing:border-box}.current{background:#e63956}.attraction{background:#0f9d87}.selected{outline:3px solid #ffd166}.credit{position:absolute;z-index:4;right:4px;bottom:3px;background:white;color:#17415d;padding:2px 4px;border-radius:3px;font:9px system-ui}</style></head>
        <body><div class="map">$tiles$markers<a class="credit" href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a></div></body></html>
    """.trimIndent()
}

private fun project(latitude: Double, longitude: Double, zoom: Int): Pair<Double, Double> {
    val size = 256.0 * (1 shl zoom)
    val sine = sin(latitude * PI / 180.0).coerceIn(-0.9999, 0.9999)
    val x = (longitude + 180.0) / 360.0 * size
    val y = (0.5 - ln((1 + sine) / (1 - sine)) / (4 * PI)) * size
    return x to y
}

private fun escapeHtml(value: String) = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")

private fun weatherSummary(weather: WeatherSnapshot?): String? = weather?.let {
    "${it.condition} · ${"%.1f".format(it.temperatureC)} °C · gefühlt ${"%.1f".format(it.apparentTemperatureC)} °C · Wind ${it.windSpeedKmh.toInt()} km/h, Böen ${it.windGustKmh.toInt()} km/h"
}

@Composable
fun AndroidSensorFaq(modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("FAQ: Messwerte verstehen", style = MaterialTheme.typography.headlineMedium)
        Text("Wie G-Kräfte, Geschwindigkeit, Richtung und Messqualität berechnet und bewertet werden.")
        FaqCard("Wie werden G-Kräfte berechnet?") {
            Text("Die automatische Kalibrierung bestimmt die Fahrzeugachsen normal (oben/unten), lateral (links/rechts) und longitudinal (vorwärts/rückwärts). Der Beschleunigungsvektor inklusive Erdanziehung wird auf diese Achsen projiziert und durch 9,80665 m/s² geteilt.")
            Text("Gnormal = a · eoben / 9,80665\nGlateral = a · eseitlich / 9,80665\nGlongitudinal = a · evorne / 9,80665\nGgesamt = √(Gnormal² + Glateral² + Glongitudinal²)", style = MaterialTheme.typography.bodyMedium)
            Text("Im Stillstand sind ungefähr +1 G auf der Normalachse normal. RideTracker ist eine Freizeitmessung und kein sicherheitsrelevantes Prüfsystem.")
        }
        FaqCard("Funktionieren G-Kräfte ohne GPS?") {
            Text("Ja. G-Kräfte stammen aus dem Beschleunigungs- und Orientierungssensor. Ohne GPS fehlen jedoch eine belastbare Geschwindigkeit, der geografische Verlauf und das räumliche Streckenmodell. Eine doppelte Integration der Beschleunigung wird nicht als Positionsersatz verwendet, weil kleine Sensorfehler schnell stark anwachsen.")
        }
        FaqCard("Warum zeigt RideTracker im Stillstand nicht jeden GPS-Sprung?") {
            Text("Native GPS-Geschwindigkeit und aus mehreren Positionsfenstern abgeleitete Werte werden plausibilisiert. Ungenaue Fixes, unmögliche Sprünge und einzelne Ausreißer werden verworfen. Nach erkanntem Stillstand wird Bewegung erst durch mehrere konsistente Fixes freigegeben.")
        }
        FaqCard("Wie funktioniert der Kompass?") {
            Text("Android verwendet den Rotation-Vector-Sensor und zeigt die Richtung relativ zum magnetischen Norden. Stahlkonstruktionen, Lautsprecher oder magnetische Halterungen können den Wert beeinflussen.")
        }
        FaqCard("Welche Standortdaten werden extern übertragen?") {
            Text("Parkkarte und Wetter sind optional. Erst beim aktiven Laden werden auf drei Nachkommastellen gerundete Koordinaten an OpenStreetMap/Overpass beziehungsweise Open-Meteo übertragen. Fahrt-, Video- und Sensor-Rohdaten bleiben lokal.")
        }
    }
}

@Composable
private fun FaqCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            content()
        }
    }
}
