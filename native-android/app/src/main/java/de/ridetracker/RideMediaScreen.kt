package de.ridetracker

import android.content.Context
import android.graphics.BitmapFactory
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
import org.json.JSONObject
import java.io.File

data class AndroidRideMediaItem(
    val id: String,
    val title: String,
    val park: String,
    val rating: Int,
    val imageFile: File?,
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
            val title = contextNode?.optString("rideName")?.takeIf { it.isNotBlank() } ?: "Unbenannte Bahn"
            val park = contextNode?.optString("parkName")?.takeIf { it.isNotBlank() } ?: "Park nicht erkannt"
            val imageName = prefs.getString("image.$profileId.$id", null)
            AndroidRideMediaItem(id, title, park, prefs.getInt("rating.$profileId.$id", 0), imageName?.let { File(context.filesDir, it) }?.takeIf(File::exists))
        }.getOrNull()
    }?.sortedByDescending { it.id } ?: emptyList()
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
            Text("Bilder & Bewertungen", style = MaterialTheme.typography.headlineMedium)
            Text("Persönliche Bilder und Sternebewertungen für gespeicherte Bahnen.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (rides.isEmpty()) item { Text("Noch keine gespeicherte Fahrt vorhanden.") }
        items(rides, key = { it.id }) { ride ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        val bitmap = remember(ride.imageFile?.absolutePath) { ride.imageFile?.let { BitmapFactory.decodeFile(it.absolutePath) } }
                        if (bitmap != null) {
                            Image(bitmap.asImageBitmap(), contentDescription = ride.title, modifier = Modifier.size(88.dp), contentScale = ContentScale.Crop)
                        } else {
                            Surface(Modifier.size(88.dp), shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceVariant) {}
                        }
                        Column {
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
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { targetRide = ride; picker.launch("image/*") }) { Text("Bild auswählen") }
                        if (ride.imageFile != null) OutlinedButton(onClick = {
                            ride.imageFile.delete()
                            context.getSharedPreferences("ridetracker_ride_media_v1", Context.MODE_PRIVATE).edit().remove("image.${profiles.activeProfileId}.${ride.id}").apply()
                            rides = loadRideMedia(context, profiles.activeProfileId)
                        }) { Text("Entfernen") }
                    }
                }
            }
        }
    }
}
