package de.ridetracker

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import de.ridetracker.community.RideHistory
import de.ridetracker.community.RideMetrics
import de.ridetracker.community.calculateRideMetrics
import de.ridetracker.community.loadRideHistory
import de.ridetracker.context.AndroidRideContextPanel
import de.ridetracker.context.AndroidRideContextStore
import de.ridetracker.sensors.AndroidSensorRecorder
import de.ridetracker.session.RideSessionSample
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch
import java.io.File
import kotlin.math.abs
import kotlin.math.max

private enum class RideDraftTab(val title: String, val icon: ImageVector) {
    STORY("Vorschau", Icons.Filled.PlayCircle),
    CONTEXT("Park & Bahn", Icons.Filled.LocationOn),
    COMPARE("Vergleich", Icons.Filled.CompareArrows),
    TRACK("3D-Strecke", Icons.Filled.ViewInAr),
}

@Composable
internal fun RideStoryDraftScreen(
    modifier: Modifier,
    recorder: AndroidSensorRecorder,
    rideContext: AndroidRideContextStore,
    samples: List<RideSessionSample>,
    trackPoints: List<AndroidTrackPoint>,
    videoFile: File?,
    videoStartOffsetSeconds: Double,
    videoHudEmbedded: Boolean,
    videoFinalizing: Boolean,
    videoStatus: String,
    requestParkSearch: () -> Unit,
    exportVideo: () -> Unit,
    exportStatus: String,
) {
    var tab by remember { mutableStateOf(RideDraftTab.STORY) }
    val metrics = remember(samples) { calculateRideMetrics(samples) }
    val title = rideContext.selectedAttraction?.name ?: "Neue Ride Story"
    val park = rideContext.selectedPark?.name ?: "Park noch auswählen"
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val completeness = buildRideCompleteness(
        samples = samples,
        recordedDistanceMeters = recorder.distanceMeters,
        calibrated = recorder.isCalibrated,
        rideContext = rideContext.snapshot(),
        hasVideo = videoFile?.exists() == true,
        videoHudEmbedded = videoHudEmbedded,
    )

    Box(modifier.fillMaxSize().imePadding()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            state = listState,
            contentPadding = PaddingValues(start = 16.dp, top = 16.dp, end = 16.dp, bottom = 210.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
        item {
            RideDraftHero(title, park, metrics, recorder.publicationStatus)
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(RideDraftTab.entries, key = { it.name }) { item ->
                    FilterChip(
                        selected = tab == item,
                        onClick = { tab = item },
                        label = { Text(item.title) },
                        leadingIcon = { Icon(item.icon, null, Modifier.size(18.dp)) },
                    )
                }
            }
        }
        item { RideCompletenessCard(completeness, Modifier.fillMaxWidth()) }
        when (tab) {
            RideDraftTab.STORY -> {
                item {
                    Text("Video & Telemetrie", style = MaterialTheme.typography.titleLarge)
                    Text("Prüfe deine Aufnahme wie einen späteren Community-Beitrag.", color = RideMuted, style = MaterialTheme.typography.bodySmall)
                }
                item {
                    when {
                        videoFile?.exists() == true -> AndroidRideVideoPreview(
                            file = videoFile,
                            samples = samples,
                            startOffsetSeconds = videoStartOffsetSeconds,
                            hudEmbedded = videoHudEmbedded,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        videoFinalizing -> StatusCard(Icons.Filled.HourglassTop, "Video wird vorbereitet", "Die Datei wird finalisiert und direkt danach hier angezeigt.", RideAmber)
                        else -> StatusCard(Icons.Filled.VideocamOff, "Keine Videovorschau verfügbar", "$videoStatus · Sensorwerte und 3D-Modell bleiben vollständig erhalten.", RideRose)
                    }
                }
                if (videoFile?.exists() == true) item {
                    OutlinedButton(exportVideo, Modifier.fillMaxWidth()) {
                        Icon(Icons.Filled.Download, null)
                        Spacer(Modifier.width(7.dp))
                        Text(if (videoHudEmbedded) "HUD-Video exportieren" else "Video exportieren")
                    }
                    if (exportStatus.isNotBlank()) Text(exportStatus, style = MaterialTheme.typography.bodySmall)
                }
                item { RideStoryMetricGrid(metrics) }
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = RideSurfaceHigh)) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                            Text("Deine Ride Story", style = MaterialTheme.typography.titleMedium)
                            OutlinedTextField(
                                recorder.communityComment,
                                { recorder.communityComment = it },
                                label = { Text("Kommentar für den Beitrag") },
                                placeholder = { Text("Wie war die Fahrt, welcher Sitz, welche Besonderheiten?") },
                                trailingIcon = { KeyboardDismissButton() },
                                minLines = 3,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Text("Sichtbarkeit", style = MaterialTheme.typography.labelLarge)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                FilterChip(
                                    selected = recorder.publicationStatus == "private",
                                    onClick = { recorder.publicationStatus = "private" },
                                    label = { Text("Privat") },
                                    leadingIcon = { Icon(Icons.Filled.Lock, null, Modifier.size(17.dp)) },
                                )
                                FilterChip(
                                    selected = recorder.publicationStatus == "ready_to_publish",
                                    onClick = { recorder.publicationStatus = "ready_to_publish" },
                                    label = { Text("Für Community vormerken") },
                                    leadingIcon = { Icon(Icons.Filled.Groups, null, Modifier.size(17.dp)) },
                                )
                            }
                            if (recorder.publicationStatus == "ready_to_publish") {
                                Text("Der Beitrag bleibt lokal, bis das Community-Backend aktiviert und der Upload nochmals bestätigt wurde.", style = MaterialTheme.typography.bodySmall, color = RideGreen)
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text("Exakte GPS-Strecke teilen")
                                        Text("Standardmäßig deaktiviert", style = MaterialTheme.typography.labelSmall, color = RideMuted)
                                    }
                                    Switch(recorder.shareExactLocation, { recorder.shareExactLocation = it })
                                }
                            }
                        }
                    }
                }
            }
            RideDraftTab.CONTEXT -> item {
                AndroidRideContextPanel(rideContext, requestParkSearch, parkLookupAllowed = true)
            }
            RideDraftTab.COMPARE -> item {
                RideComparisonPanel(recorder.sessionId, samples, rideContext)
            }
            RideDraftTab.TRACK -> {
                item {
                    Text("Interaktive 3D-Strecke", style = MaterialTheme.typography.titleLarge)
                    Text("Drehen, zoomen und einen Streckenpunkt für genaue Werte antippen.", color = RideMuted, style = MaterialTheme.typography.bodySmall)
                }
                item { AndroidTrack3DViewer(trackPoints, Modifier.fillMaxWidth()) }
            }
        }
        }
        if (listState.firstVisibleItemIndex > 0 || listState.firstVisibleItemScrollOffset > 500) {
            SmallFloatingActionButton(
                onClick = { scope.launch { listState.animateScrollToItem(0) } },
                modifier = Modifier.align(Alignment.BottomEnd).padding(end = 18.dp, bottom = 190.dp),
                containerColor = RideSurfaceHigh,
            ) { Icon(Icons.Filled.VerticalAlignTop, "Ganz nach oben") }
        }
    }
}

@Composable
private fun RideDraftHero(title: String, park: String, metrics: RideMetrics, publicationStatus: String) {
    Surface(shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, RideCyan.copy(alpha = .35f))) {
        Column(
            Modifier
                .fillMaxWidth()
                .background(Brush.linearGradient(listOf(Color(0xFF173B53), Color(0xFF071522), Color(0xFF102A29))))
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(color = if (publicationStatus == "private") Color.Black.copy(alpha = .32f) else RideGreen.copy(alpha = .18f), shape = CircleShape) {
                    Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(if (publicationStatus == "private") Icons.Filled.Lock else Icons.Filled.CloudUpload, null, Modifier.size(15.dp), tint = if (publicationStatus == "private") RideMuted else RideGreen)
                        Spacer(Modifier.width(5.dp))
                        Text(if (publicationStatus == "private") "PRIVATER ENTWURF" else "COMMUNITY-BEREIT", style = MaterialTheme.typography.labelSmall)
                    }
                }
                Spacer(Modifier.weight(1f))
                Text("Qualität ${metrics.qualityScore}%", style = MaterialTheme.typography.labelMedium, color = RideCyan)
            }
            Text(title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(park, color = RideMuted)
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                HeroValue("TEMPO", "${metrics.maxSpeedKmh.toInt()} km/h")
                HeroValue("VERTIKAL", "%+.1f G".format(metrics.maxNormalG))
                HeroValue("SEITLICH", "%.1f G".format(metrics.maxLateralG))
            }
        }
    }
}

@Composable
private fun HeroValue(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelSmall, color = RideMuted)
        Text(value, style = MaterialTheme.typography.titleMedium, color = RideText)
    }
}

@Composable
private fun RideStoryMetricGrid(metrics: RideMetrics) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DraftMetricCard("Max. Tempo", "%.1f".format(metrics.maxSpeedKmh), "km/h", Icons.Filled.Speed, RideCyan, Modifier.weight(1f))
            DraftMetricCard("Vertikal", "%+.2f".format(metrics.maxNormalG), "G", Icons.Filled.Height, RideGreen, Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DraftMetricCard("Seitlich", "%.2f".format(metrics.maxLateralG), "G", Icons.Filled.SwapHoriz, RideAmber, Modifier.weight(1f))
            DraftMetricCard("Dauer", "%.1f".format(metrics.durationSeconds), "s", Icons.Filled.Timer, RideRose, Modifier.weight(1f))
        }
    }
}

@Composable
private fun DraftMetricCard(title: String, value: String, unit: String, icon: ImageVector, color: Color, modifier: Modifier) {
    Card(modifier, colors = CardDefaults.cardColors(containerColor = RideSurfaceHigh)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(icon, null, tint = color, modifier = Modifier.size(20.dp))
            Text(title, style = MaterialTheme.typography.labelMedium, color = RideMuted)
            Row(verticalAlignment = Alignment.Bottom) {
                Text(value, style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.width(4.dp))
                Text(unit, style = MaterialTheme.typography.labelSmall, color = color)
            }
        }
    }
}

@Composable
private fun StatusCard(icon: ImageVector, title: String, detail: String, color: Color) {
    Card(colors = CardDefaults.cardColors(containerColor = color.copy(alpha = .12f)), border = BorderStroke(1.dp, color.copy(alpha = .45f))) {
        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = color)
            Spacer(Modifier.width(11.dp))
            Column { Text(title, style = MaterialTheme.typography.titleMedium); Text(detail, style = MaterialTheme.typography.bodySmall, color = RideMuted) }
        }
    }
}

@Composable
private fun RideComparisonPanel(sessionId: String, samples: List<RideSessionSample>, store: AndroidRideContextStore) {
    val context = LocalContext.current
    val current = remember(samples) { calculateRideMetrics(samples) }
    var history by remember { mutableStateOf(RideHistory()) }
    val attractionId = store.selectedAttraction?.id
    val attractionName = store.selectedAttraction?.name
    val parkName = store.selectedPark?.name
    LaunchedEffect(attractionId, attractionName, parkName, samples.size) {
        history = withContext(Dispatchers.IO) { loadRideHistory(context, attractionId, attractionName, parkName, sessionId) }
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Deine Fahrt im Vergleich", style = MaterialTheme.typography.titleLarge)
        Text(
            if (attractionId == null) "Wähle zuerst Park und Attraktion, damit historische und offizielle Referenzen zugeordnet werden können."
            else "Aktuelle Messung · ${history.rideCount} frühere eigene Fahrten · offizielle Angaben, sofern veröffentlicht.",
            color = RideMuted,
            style = MaterialTheme.typography.bodySmall,
        )
        ComparisonLegend()
        ComparisonMetricCard("Maximale Geschwindigkeit", current.maxSpeedKmh, "km/h", history.personalBest?.maxSpeedKmh, history.personalAverage?.maxSpeedKmh, store.officialFacts?.maxSpeedKmh, RideCyan)
        ComparisonMetricCard("Positive Vertikalkraft", current.maxNormalG, "G", history.personalBest?.maxNormalG, history.personalAverage?.maxNormalG, store.officialFacts?.publishedMaxG, RideGreen)
        ComparisonMetricCard("Seitliche Kraft", current.maxLateralG, "G", history.personalBest?.maxLateralG, history.personalAverage?.maxLateralG, null, RideAmber)
        ComparisonMetricCard("Fahrtdauer", current.durationSeconds, "s", history.personalBest?.durationSeconds, history.personalAverage?.durationSeconds, store.officialFacts?.durationSeconds, RideRose)
        store.officialFacts?.let { facts ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = .35f))) {
                Column(Modifier.padding(13.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text("Quelle & Einordnung", style = MaterialTheme.typography.titleMedium)
                    Text("${facts.sourceTitle} · geprüft ${facts.verifiedAt}", style = MaterialTheme.typography.bodySmall)
                    Text("Offizielle Konstruktionswerte und eine Smartphone-Messung sind nicht vollständig gleichartig. Sitzplatz, GPS-Empfang und Geräteausrichtung können Abweichungen verursachen.", style = MaterialTheme.typography.bodySmall, color = RideMuted)
                    TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(facts.sourceUrl))) }) { Text("Quelle öffnen") }
                }
            }
        }
        StatusCard(Icons.Filled.Groups, "Community-Vergleich vorbereitet", "Median und Perzentil werden eingeblendet, sobald das Community-Backend genügend qualitätsgeprüfte Aufzeichnungen enthält.", RideCyan)
    }
}

@Composable
private fun ComparisonLegend() {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        LegendDot(RideCyan, "Diese Fahrt")
        LegendDot(RideGreen, "Persönlich")
        LegendDot(RideAmber, "Offiziell")
    }
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Surface(Modifier.size(8.dp), color = color, shape = CircleShape) {}
        Spacer(Modifier.width(4.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, color = RideMuted)
    }
}

@Composable
private fun ComparisonMetricCard(
    title: String,
    measured: Double,
    unit: String,
    personalBest: Double?,
    personalAverage: Double?,
    official: Double?,
    color: Color,
) {
    val maximum = max(1.0, listOfNotNull(measured, personalBest, personalAverage, official).maxOrNull() ?: 1.0) * 1.08
    Card(colors = CardDefaults.cardColors(containerColor = RideSurface)) {
        Column(Modifier.padding(13.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            ComparisonBar("Diese Fahrt", measured, unit, maximum, color)
            personalBest?.let { ComparisonBar("Persönliche Bestleistung", it, unit, maximum, RideGreen) }
            personalAverage?.let { ComparisonBar("Dein Durchschnitt", it, unit, maximum, RideGreen.copy(alpha = .68f)) }
            official?.let { ComparisonBar("Offizielle Angabe", it, unit, maximum, RideAmber) }
            if (personalBest == null && official == null) Text("Noch keine passende Referenz vorhanden.", style = MaterialTheme.typography.labelSmall, color = RideMuted)
        }
    }
}

@Composable
private fun ComparisonBar(label: String, value: Double, unit: String, maximum: Double, color: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(Modifier.fillMaxWidth()) {
            Text(label, Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, color = RideMuted)
            Text("${if (abs(value) < 10) "%.2f".format(value) else "%.1f".format(value)} $unit", style = MaterialTheme.typography.labelLarge)
        }
        LinearProgressIndicator(
            progress = { (abs(value) / maximum).toFloat().coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth().height(7.dp),
            color = color,
            trackColor = RideSurfaceHigh,
        )
    }
}
