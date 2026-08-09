package de.ridetracker

import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import de.ridetracker.session.LocalProfileStore
import de.ridetracker.session.RideSessionSample
import de.ridetracker.session.rideSessionSamplesFromJson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File

data class AndroidRideMediaItem(
    val id: String,
    val title: String,
    val park: String,
    val rating: Int,
    val notes: String,
    val comment: String,
    val rideFile: File,
    val imageFile: File?,
    val videoFile: File?,
    val imageCredit: String?,
    val imageSourceUrl: String?,
    val weatherSummary: String?,
    val trackPoints: List<AndroidTrackPoint>,
    val telemetrySamples: List<RideSessionSample>,
    val videoStartOffsetSeconds: Double,
    val videoHudEmbedded: Boolean,
)

private fun loadRideMedia(context: Context, profileId: String): List<AndroidRideMediaItem> {
    val prefs = context.getSharedPreferences("ridetracker_ride_media_v1", Context.MODE_PRIVATE)
    return context.filesDir.listFiles { file -> file.name.endsWith(".ride.json") }?.mapNotNull { file ->
        runCatching {
            val root = JSONObject(file.readText())
            val owner = root.optJSONObject("owner")
            if ((owner?.optString("profileID") ?: profileId) != profileId) return@runCatching null
            val id = root.optString("id", file.nameWithoutExtension)
            val contextNode = root.optJSONObject("context")
            val noteNode = root.optJSONObject("notes")
            val videoNode = root.optJSONObject("video")
            val thumbnailNode = root.optJSONObject("thumbnail")
            val weather = root.optJSONObject("environment")?.optJSONObject("weather")?.optJSONObject("start")
            val title = contextNode?.optString("rideName")?.takeIf { it.isNotBlank() } ?: "Unbenannte Bahn"
            val park = contextNode?.optString("parkName")?.takeIf { it.isNotBlank() } ?: "Park nicht erkannt"
            val editedImageName = prefs.getString("image.$profileId.$id", null)
            val imageName = editedImageName ?: thumbnailNode?.optString("fileName")?.takeIf { it.isNotBlank() }
            val videoName = videoNode?.optString("filename")?.takeIf { it.isNotBlank() }
            val telemetrySamples = rideSessionSamplesFromJson(root)
            AndroidRideMediaItem(
                id = id,
                title = title,
                park = park,
                rating = prefs.getInt("rating.$profileId.$id", 0),
                notes = noteNode?.optString("privateNote")?.takeIf { it.isNotBlank() } ?: noteNode?.optString("private").orEmpty(),
                comment = noteNode?.optString("communityComment")?.takeIf { it.isNotBlank() } ?: noteNode?.optString("comment").orEmpty(),
                rideFile = file,
                imageFile = imageName?.let { File(context.filesDir, it) }?.takeIf(File::exists),
                videoFile = videoName?.let { File(context.filesDir, it) }?.takeIf(File::exists),
                imageCredit = if (editedImageName != null) "Eigenes Nutzerbild" else thumbnailNode?.optString("attribution")?.takeIf { it.isNotBlank() },
                imageSourceUrl = if (editedImageName != null) null else thumbnailNode?.optString("sourceUrl")?.takeIf { it.startsWith("https://") },
                weatherSummary = weather?.let {
                    val condition = it.optJSONObject("condition")?.optString("label") ?: "Wetter"
                    val wind = it.optJSONObject("wind")
                    "$condition · ${"%.1f".format(it.optDouble("temperatureC"))} °C · Wind ${wind?.optDouble("speedKmh")?.toInt() ?: 0} km/h"
                },
                trackPoints = deriveAndroidTrackPoints(telemetrySamples),
                telemetrySamples = telemetrySamples,
                videoStartOffsetSeconds = videoNode?.optDouble("startOffsetSeconds", 0.0) ?: 0.0,
                videoHudEmbedded = videoNode?.optBoolean("hudEmbedded", false) == true,
            )
        }.getOrNull()
    }?.sortedByDescending { it.id } ?: emptyList()
}

private fun saveRideEdits(item: AndroidRideMediaItem, title: String, park: String, notes: String, comment: String) {
    val root = JSONObject(item.rideFile.readText())
    val contextNode = root.optJSONObject("context") ?: JSONObject().also { root.put("context", it) }
    contextNode.put("rideName", title.trim())
    contextNode.put("parkName", park.trim())
    val noteNode = root.optJSONObject("notes") ?: JSONObject().also { root.put("notes", it) }
    noteNode.put("privateNote", notes)
    noteNode.put("communityComment", comment)
    item.rideFile.writeText(root.toString(2))
}

@Composable
fun RideMediaScreen(modifier: Modifier = Modifier, profiles: LocalProfileStore) {
    val context = LocalContext.current
    var rides by remember(profiles.activeProfileId) { mutableStateOf(loadRideMedia(context, profiles.activeProfileId)) }
    var targetRide by remember { mutableStateOf<AndroidRideMediaItem?>(null) }
    var videoToExport by remember { mutableStateOf<File?>(null) }
    var exportStatus by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val videoExporter = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("video/mp4")) { destination ->
        val source = videoToExport
        if (destination != null && source != null) scope.launch {
            exportStatus = runCatching {
                withContext(Dispatchers.IO) {
                    context.contentResolver.openOutputStream(destination, "w")?.use { output -> source.inputStream().use { it.copyTo(output) } }
                        ?: error("Zieldatei konnte nicht geöffnet werden")
                }
                "Video erfolgreich in Dateien gespeichert."
            }.getOrElse { "Videoexport fehlgeschlagen: ${it.message}" }
            videoToExport = null
        }
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val ride = targetRide ?: return@rememberLauncherForActivityResult
        if (uri != null) runCatching {
            val filename = "RideTracker-${ride.id}-cover.jpg"
            context.contentResolver.openInputStream(uri)?.use { input -> File(context.filesDir, filename).outputStream().use(input::copyTo) }
            context.getSharedPreferences("ridetracker_ride_media_v1", Context.MODE_PRIVATE).edit().putString("image.${profiles.activeProfileId}.${ride.id}", filename).apply()
            rides = loadRideMedia(context, profiles.activeProfileId)
        }
        targetRide = null
    }

    LazyColumn(modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("Gespeicherte Fahrten", style = MaterialTheme.typography.headlineMedium)
            Text("Videos ansehen und Titel, Park, Notizen, Kommentare, Bild und Bewertung bearbeiten.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (exportStatus.isNotBlank()) Text(exportStatus, style = MaterialTheme.typography.bodySmall)
        }
        if (rides.isEmpty()) item { Text("Noch keine bewusst gespeicherte Fahrt vorhanden.") }
        items(rides, key = { it.id }) { ride ->
            var expanded by remember(ride.id) { mutableStateOf(false) }
            var title by remember(ride.id, ride.title) { mutableStateOf(ride.title) }
            var park by remember(ride.id, ride.park) { mutableStateOf(ride.park) }
            var notes by remember(ride.id, ride.notes) { mutableStateOf(ride.notes) }
            var comment by remember(ride.id, ride.comment) { mutableStateOf(ride.comment) }
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        val bitmap = remember(ride.imageFile?.absolutePath) { ride.imageFile?.let { BitmapFactory.decodeFile(it.absolutePath) } }
                        if (bitmap != null) Image(bitmap.asImageBitmap(), contentDescription = ride.title, modifier = Modifier.size(88.dp), contentScale = ContentScale.Crop)
                        else Surface(Modifier.size(88.dp), shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant) {}
                        Column(Modifier.weight(1f)) {
                            Text(ride.title, style = MaterialTheme.typography.titleMedium)
                            Text(ride.park, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            ride.weatherSummary?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            Row {
                                (1..5).forEach { value ->
                                    TextButton(onClick = {
                                        context.getSharedPreferences("ridetracker_ride_media_v1", Context.MODE_PRIVATE).edit().putInt("rating.${profiles.activeProfileId}.${ride.id}", value).apply()
                                        rides = loadRideMedia(context, profiles.activeProfileId)
                                    }, contentPadding = PaddingValues(2.dp)) { Text(if (value <= ride.rating) "★" else "☆") }
                                }
                            }
                            TextButton(onClick = { expanded = !expanded }) { Text(if (expanded) "Details schließen" else "Öffnen & bearbeiten") }
                        }
                    }
                    if (expanded) {
                        ride.imageCredit?.let { credit ->
                            Text(credit, style = MaterialTheme.typography.labelSmall)
                            ride.imageSourceUrl?.let { source -> TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(source))) }) { Text("Bildquelle öffnen") } }
                        }
                        ride.videoFile?.let { file ->
                            AndroidRideVideoPreview(
                                file = file,
                                samples = ride.telemetrySamples,
                                startOffsetSeconds = ride.videoStartOffsetSeconds,
                                hudEmbedded = ride.videoHudEmbedded,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            OutlinedButton(onClick = {
                                videoToExport = file
                                videoExporter.launch("RideTracker-${ride.id.take(8)}.mp4")
                            }, modifier = Modifier.fillMaxWidth()) { Text("Video in Dateien speichern") }
                        } ?: Text("Für diese Fahrt ist keine Videodatei verfügbar.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        AndroidTrack3DViewer(ride.trackPoints, Modifier.fillMaxWidth())
                        OutlinedTextField(title, { title = it }, label = { Text("Bahn / Titel") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(park, { park = it }, label = { Text("Freizeitpark") }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(notes, { notes = it }, label = { Text("Private Notiz") }, minLines = 3, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(comment, { comment = it }, label = { Text("Kommentar") }, minLines = 3, modifier = Modifier.fillMaxWidth())
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { runCatching { saveRideEdits(ride, title, park, notes, comment) }; rides = loadRideMedia(context, profiles.activeProfileId) }) { Text("Änderungen speichern") }
                            OutlinedButton(onClick = { targetRide = ride; picker.launch("image/*") }) { Text("Bild auswählen") }
                        }
                        if (ride.imageFile != null) OutlinedButton(onClick = {
                            ride.imageFile.delete()
                            context.getSharedPreferences("ridetracker_ride_media_v1", Context.MODE_PRIVATE).edit().remove("image.${profiles.activeProfileId}.${ride.id}").apply()
                            rides = loadRideMedia(context, profiles.activeProfileId)
                        }) { Text("Bild entfernen") }
                    }
                }
            }
        }
    }
}
