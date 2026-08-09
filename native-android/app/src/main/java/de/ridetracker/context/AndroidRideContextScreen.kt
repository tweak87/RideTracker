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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import de.ridetracker.KeyboardDismissButton
import kotlinx.coroutines.launch
import java.io.File
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.sin

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AndroidRideContextPanel(
    store: AndroidRideContextStore,
    requestParkSearch: () -> Unit,
    parkLookupAllowed: Boolean = true,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var showAttractionPicker by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.launch { runCatching { store.useUserImage(uri) } }
    }

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Park, Attraktion & Wetter", style = MaterialTheme.typography.titleLarge)
            Text(
                "Die Aufnahme bleibt lokal. Die Parkermittlung startet erst nach dem Beenden; Wetter- und Bildabrufe sind optional.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            CatalogSelection(store)

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

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.weight(1f)) {
                    Text("Park nach Fahrt automatisch ermitteln")
                    Text("OpenStreetMap · erst nach Aufnahmeende", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(store.autoParkLookupEnabled, store::updateAutoParkLookupEnabled)
            }

            Button(
                onClick = { store.markExternalLookupConsent(); requestParkSearch() },
                enabled = !store.busy && parkLookupAllowed,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (store.busy) "Wird geladen …" else "Parks jetzt manuell suchen") }

            if (!parkLookupAllowed) Text(
                "Park und Attraktion werden bewusst erst nach dem Ende der Aufzeichnung gesucht.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
            )

            Text(store.status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

            if (store.currentLocation != null && store.parks.isNotEmpty()) {
                NearbyParkMap(
                    center = store.currentLocation!!,
                    parks = store.parks,
                    attractions = store.attractions,
                    selectedPark = store.selectedPark,
                    selectedAttraction = store.selectedAttraction,
                    radiusM = store.radiusM,
                    selectPark = { park -> scope.launch { store.selectPark(park) } },
                    selectAttraction = store::selectAttraction,
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

            if (store.selectedPark != null) {
                HorizontalDivider()
                Text("Attraktion auswählen", style = MaterialTheme.typography.titleMedium)
                store.selectedAttraction?.let { selected ->
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            RadioButton(true, null)
                            Spacer(Modifier.width(8.dp))
                            Column(Modifier.weight(1f)) {
                                Text(selected.name, style = MaterialTheme.typography.titleMedium)
                                Text(selected.provider, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                } ?: Text("Noch keine Attraktion ausgewählt.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(onClick = { showAttractionPicker = true }, modifier = Modifier.fillMaxWidth()) {
                    Text("${store.attractions.size} Attraktionen öffnen & auswählen")
                }
            }

            store.officialFacts?.let { facts ->
                OfficialFactsCard(facts)
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

    if (showAttractionPicker) AttractionPickerDialog(
        attractions = store.attractions,
        selected = store.selectedAttraction,
        onSelect = { store.selectAttraction(it); showAttractionPicker = false },
        onManual = { store.selectManualAttraction(it); showAttractionPicker = false },
        onDismiss = { showAttractionPicker = false },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CatalogSelection(store: AndroidRideContextStore) {
    val scope = rememberCoroutineScope()
    var countryExpanded by remember { mutableStateOf(false) }
    var parkExpanded by remember { mutableStateOf(false) }
    var attractionExpanded by remember { mutableStateOf(false) }
    var manualParkExpanded by remember { mutableStateOf(false) }
    var manualParkName by remember { mutableStateOf("") }
    val selectedCountry = store.catalogCountries.firstOrNull { it.code == store.selectedCountryCode }
    val selectedCatalogPark = store.catalogParks.firstOrNull { it.id == store.selectedPark?.id }

    Surface(
        color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = .32f),
        shape = MaterialTheme.shapes.large,
    ) {
        Column(Modifier.fillMaxWidth().padding(13.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Text("Parkkatalog", style = MaterialTheme.typography.titleMedium)
            Text(
                "Standortvorschläge und eine manuelle Auswahl nach Land funktionieren unabhängig voneinander.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (store.currentLocation != null) {
                Text(
                    "Das Land wurde aus der GPS-Position vorausgewählt. Parks und Attraktionen sind alphabetisch sortiert und jederzeit manuell änderbar.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            ExposedDropdownMenuBox(expanded = countryExpanded, onExpandedChange = { countryExpanded = it }) {
                OutlinedTextField(
                    value = selectedCountry?.name.orEmpty(),
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Land") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(countryExpanded) },
                    modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                )
                ExposedDropdownMenu(expanded = countryExpanded, onDismissRequest = { countryExpanded = false }) {
                    store.catalogCountries.forEach { country ->
                        DropdownMenuItem(
                            text = { Text(country.name) },
                            onClick = { store.selectCountry(country.code); countryExpanded = false },
                        )
                    }
                }
            }
            ExposedDropdownMenuBox(expanded = parkExpanded, onExpandedChange = { parkExpanded = it }) {
                OutlinedTextField(
                    value = selectedCatalogPark?.name ?: store.selectedPark?.name.orEmpty(),
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Park auswählen · ${store.catalogParks.size} verfügbar") },
                    placeholder = { Text("Park antippen") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(parkExpanded) },
                    modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                )
                ExposedDropdownMenu(expanded = parkExpanded, onDismissRequest = { parkExpanded = false }) {
                    store.catalogParks.forEach { park ->
                        DropdownMenuItem(
                            text = { Text(park.name) },
                            onClick = { scope.launch { store.selectCatalogPark(park) }; parkExpanded = false },
                        )
                    }
                }
            }
            TextButton(onClick = { manualParkExpanded = !manualParkExpanded }) {
                Text(if (manualParkExpanded) "Manuelle Parkeingabe schließen" else "Park nicht gelistet?")
            }
            if (manualParkExpanded) {
                OutlinedTextField(
                    value = manualParkName,
                    onValueChange = { manualParkName = it },
                    label = { Text("Freizeitpark manuell eingeben") },
                    trailingIcon = { KeyboardDismissButton() },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedButton(
                    onClick = { store.selectManualPark(manualParkName); manualParkExpanded = false },
                    enabled = manualParkName.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Diesen Park übernehmen") }
            }
            if (selectedCatalogPark != null) {
                ExposedDropdownMenuBox(expanded = attractionExpanded, onExpandedChange = { attractionExpanded = it }) {
                    OutlinedTextField(
                        value = store.selectedAttraction?.name.orEmpty(),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Attraktion · ${selectedCatalogPark.attractions.size} verfügbar") },
                        placeholder = { Text("Gefahrene Attraktion wählen") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(attractionExpanded) },
                        modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                    )
                    ExposedDropdownMenu(expanded = attractionExpanded, onDismissRequest = { attractionExpanded = false }) {
                        selectedCatalogPark.attractions.forEach { attraction ->
                            DropdownMenuItem(
                                text = {
                                    Column {
                                        Text(attraction.name)
                                        attraction.manufacturer?.let { Text(it, style = MaterialTheme.typography.labelSmall) }
                                    }
                                },
                                onClick = { store.selectCatalogAttraction(attraction); attractionExpanded = false },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun OfficialFactsCard(facts: de.ridetracker.community.OfficialRideFacts) {
    val context = LocalContext.current
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = .42f))) {
        Column(Modifier.fillMaxWidth().padding(13.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Offizielle Referenz", style = MaterialTheme.typography.titleMedium)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                facts.maxSpeedKmh?.let { AssistChip(onClick = {}, label = { Text("${it.toInt()} km/h") }) }
                facts.heightM?.let { AssistChip(onClick = {}, label = { Text("${"%.1f".format(it)} m") }) }
                facts.inversions?.let { AssistChip(onClick = {}, label = { Text("$it Inversionen") }) }
            }
            Text("Quelle: ${facts.sourceTitle} · geprüft ${facts.verifiedAt}", style = MaterialTheme.typography.labelSmall)
            TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(facts.sourceUrl))) }) {
                Text("Offizielle Quelle öffnen")
            }
        }
    }
}

@Composable
private fun AttractionPickerDialog(
    attractions: List<NearbyAttraction>,
    selected: NearbyAttraction?,
    onSelect: (NearbyAttraction) -> Unit,
    onManual: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var search by remember { mutableStateOf("") }
    var manualName by remember { mutableStateOf("") }
    val filtered = remember(attractions, search) {
        attractions.filter { search.isBlank() || it.name.contains(search.trim(), ignoreCase = true) }.take(100)
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Attraktion auswählen") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                OutlinedTextField(
                    value = search,
                    onValueChange = { search = it },
                    label = { Text("Gefundene Attraktionen filtern") },
                    trailingIcon = { KeyboardDismissButton() },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (filtered.isEmpty()) Text("Keine passende OSM-Attraktion gefunden. Du kannst sie unten manuell eintragen.", style = MaterialTheme.typography.bodySmall)
                else LazyColumn(Modifier.fillMaxWidth().heightIn(max = 330.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(filtered, key = { it.id }) { attraction ->
                        Card(
                            onClick = { onSelect(attraction) },
                            colors = CardDefaults.cardColors(
                                containerColor = if (selected?.id == attraction.id) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                            ),
                        ) {
                            Row(Modifier.fillMaxWidth().padding(horizontal = 9.dp, vertical = 7.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                RadioButton(selected?.id == attraction.id, onClick = { onSelect(attraction) })
                                Spacer(Modifier.width(7.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(attraction.name, style = MaterialTheme.typography.titleSmall)
                                    attraction.distanceM?.let { Text("${it.toInt()} m vom Aufnahmeort", style = MaterialTheme.typography.labelSmall) }
                                }
                            }
                        }
                    }
                }
                HorizontalDivider()
                OutlinedTextField(
                    value = manualName,
                    onValueChange = { manualName = it },
                    label = { Text("Nicht gelistet: Name manuell") },
                    trailingIcon = { KeyboardDismissButton() },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedButton(onClick = { onManual(manualName) }, enabled = manualName.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
                    Text("Manuellen Namen übernehmen")
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Fertig") } },
    )
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun NearbyParkMap(
    center: GeoPoint,
    parks: List<NearbyPark>,
    attractions: List<NearbyAttraction>,
    selectedPark: NearbyPark?,
    selectedAttraction: NearbyAttraction?,
    radiusM: Int,
    selectPark: (NearbyPark) -> Unit,
    selectAttraction: (NearbyAttraction) -> Unit,
) {
    val html = remember(center, parks, attractions, selectedPark, selectedAttraction, radiusM) { mapHtml(center, parks, attractions, selectedPark, selectedAttraction, radiusM) }
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
                        return handleMapUri(uri)
                    }

                    @Suppress("DEPRECATION")
                    override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                        return url?.let(Uri::parse)?.let(::handleMapUri) ?: false
                    }

                    private fun handleMapUri(uri: Uri): Boolean {
                        if (uri.scheme == "ridetracker" && uri.host == "park") {
                            uri.lastPathSegment?.toIntOrNull()?.let { index -> parks.getOrNull(index)?.let(selectPark) }
                            return true
                        }
                        if (uri.scheme == "ridetracker" && uri.host == "attraction") {
                            uri.lastPathSegment?.toIntOrNull()?.let { index -> attractions.getOrNull(index)?.let(selectAttraction) }
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

private fun mapHtml(center: GeoPoint, parks: List<NearbyPark>, attractions: List<NearbyAttraction>, selectedPark: NearbyPark?, selectedAttraction: NearbyAttraction?, radiusM: Int): String {
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
        attractions.take(50).forEachIndexed { index, attraction ->
            val latitude = attraction.latitude ?: return@forEachIndexed
            val longitude = attraction.longitude ?: return@forEachIndexed
            val pixel = project(latitude, longitude, zoom)
            val left = pixel.first - centerPixel.first
            val top = pixel.second - centerPixel.second
            val selected = if (attraction.id == selectedAttraction?.id) " selected" else ""
            append("<a class='marker attraction$selected' href='ridetracker://attraction/$index' title='${escapeHtml(attraction.name)}' style='left:calc(50% + ${left}px);top:calc(50% + ${top}px)'>◆</a>")
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
            Text("Gnormal = a · eoben / 9,80665\nGlateral = a · eseitlich / 9,80665\nGlongitudinal = a · evorne / 9,80665\nGhorizontal = √(Glateral² + Glongitudinal²)\nGgesamt = √(Gnormal² + Glateral² + Glongitudinal²)", style = MaterialTheme.typography.bodyMedium)
            Text("Im Stillstand sind ungefähr +1 G auf der Normalachse normal. Der horizontale Gesamtwert bleibt aussagekräftig, wenn Quer- und Längskraft durch eine falsche Vorwärtskante vertauscht sind. Kalibriere auf einem geraden, ruhigen Abschnitt mit endgültig befestigtem Gerät; eine Kalibrierung in einer Kurve kann Seitenkraft zu klein erscheinen lassen. RideTracker ist eine Freizeitmessung und kein sicherheitsrelevantes Prüfsystem.")
        }
        FaqCard("Funktionieren G-Kräfte ohne GPS?") {
            Text("Ja. G-Kräfte stammen aus dem Beschleunigungs- und Orientierungssensor. Ohne GPS fehlen jedoch eine belastbare Geschwindigkeit, der geografische Verlauf und das räumliche Streckenmodell. Eine doppelte Integration der Beschleunigung wird nicht als Positionsersatz verwendet, weil kleine Sensorfehler schnell stark anwachsen.")
        }
        FaqCard("Warum zeigt RideTracker im Stillstand nicht jeden GPS-Sprung?") {
            Text("Native GPS-Geschwindigkeit und aus mehreren Positionsfenstern abgeleitete Werte werden plausibilisiert. Ungenaue Fixes, unmögliche Sprünge und einzelne Ausreißer werden verworfen. Nach erkanntem Stillstand wird Bewegung durch konsistente Fixes außerhalb des Genauigkeitsclusters wieder freigegeben – ausdrücklich auch beim Gehen.")
        }
        FaqCard("Was fehlt ohne Barometer?") {
            Text("Geschwindigkeit, GPS-Strecke sowie Längs-, Seiten- und Vertikalkräfte funktionieren weiterhin. Für die Höhe verwendet RideTracker ersatzweise die relative GPS-Höhe und kennzeichnet die Quelle. Diese reagiert langsamer, kann um mehrere Meter schwanken und bildet kurze Kuppen, Abfahrten und Airtime deutlich ungenauer ab. Effizient testbar bleiben daher GPS-Distanz, Tempo, G-Kräfte, Video/HUD, Parkwahl und die horizontale 3D-Strecke; eingeschränkt testbar sind präzise Höhenprofile, Steigrate und Lift-/Drop-Erkennung.")
        }
        FaqCard("Warum kann im ICE keine Geschwindigkeit verfügbar sein?") {
            Text("Metallbedampfte Scheiben und der Wagenkasten können Satellitensignale abschirmen. Bleibt die absolute Position dadurch unverändert, lässt sich eine konstante Zuggeschwindigkeit nicht seriös aus dem Beschleunigungssensor ableiten. RideTracker zeigt in diesem Fall einen nicht verfügbaren Wert statt einer erfundenen Geschwindigkeit.")
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
