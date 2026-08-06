package de.ridetracker

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.widget.MediaController
import android.widget.VideoView
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
import androidx.compose.ui.viewinterop.AndroidView
import de.ridetracker.session.LocalProfileStore
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
            val title = contextNode?.optString("rideName")?.takeIf { it.isNotBlank() } ?: "Unbenannte Bahn"
            val park = contextNode?.optString("parkName")?.takeIf { it.isNotBlank() } ?: "Park nicht erkannt"
            val imageName = prefs.getString("image.$profileId.$id", null)
            val videoName = videoNode?.optString("filename")?.takeIf { it.isNotBlank() }
            AndroidRideMediaItem(
                id = id,
                title = title,
                park = park,
                rating = prefs.getInt("rating.$profileId.$id", 0),
                notes = noteNode?.optString("privateNote") ?: "",
                comment = noteNode?.optString("communityComment") ?: "",
                rideFile = file,
                imageFile = imageName?.let { File(context.filesDir, it) }?.takeIf(File::exists),
                videoFile = videoName?.let { File(context.filesDir, it) }?.takeIf(File::exists),
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
                        ride.videoFile?.let { file ->
                            AndroidView(
                                factory = { ctx -> VideoView(ctx).apply { setMediaController(MediaController(ctx).also { it.setAnchorView(this) }); setVideoURI(Uri.fromFile(file)) } },
                                update = { it.setVideoURI(Uri.fromFile(file)) },
                                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f)
                            )
                        } ?: Text("Für diese Fahrt ist keine Videodatei verfügbar.", color = MaterialTheme.colorScheme.onSurfaceVariant)
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
