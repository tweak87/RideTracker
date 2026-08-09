package de.ridetracker

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import de.ridetracker.community.RideMetrics
import de.ridetracker.community.calculateRideMetrics
import de.ridetracker.session.LocalProfileStore
import de.ridetracker.session.rideSessionSamplesFromJson
import org.json.JSONObject

private data class LocalRideStory(
    val id: String,
    val author: String,
    val title: String,
    val park: String,
    val date: String,
    val comment: String,
    val publicationStatus: String,
    val metrics: RideMetrics,
)

private fun loadLocalRideStories(context: Context, profileName: String): List<LocalRideStory> =
    context.filesDir.listFiles { file -> file.name.endsWith(".ride.json") }.orEmpty().mapNotNull { file ->
        runCatching {
            val root = JSONObject(file.readText())
            val owner = root.optJSONObject("owner")
            val author = owner?.optString("displayName")?.takeIf { it.isNotBlank() } ?: profileName
            if (author != profileName) return@runCatching null
            val rideContext = root.optJSONObject("context")
            val notes = root.optJSONObject("notes")
            LocalRideStory(
                id = root.optString("id", file.name),
                author = author,
                title = rideContext?.optString("rideName")?.takeIf { it.isNotBlank() } ?: "Neue Ride Story",
                park = rideContext?.optString("parkName")?.takeIf { it.isNotBlank() } ?: "Park noch nicht zugeordnet",
                date = root.optString("startedAt").take(10),
                comment = notes?.optString("communityComment")?.takeIf { it.isNotBlank() }.orEmpty(),
                publicationStatus = root.optJSONObject("community")?.optString("publicationStatus", "private") ?: "private",
                metrics = calculateRideMetrics(rideSessionSamplesFromJson(root)),
            )
        }.getOrNull()
    }.sortedByDescending { it.id }

@Composable
internal fun AndroidCommunityOverview(modifier: Modifier, profileName: String) {
    val context = LocalContext.current
    val stories = remember { loadLocalRideStories(context, profileName) }
    LazyColumn(
        modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("Ride Feed", style = MaterialTheme.typography.headlineMedium)
            Text("Deine lokalen Ride Stories – bereit für Freunde, Parks und Community.", color = RideMuted)
        }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .72f))) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Surface(Modifier.size(42.dp), shape = CircleShape, color = RideGreen.copy(alpha = .2f)) {
                        Box(contentAlignment = Alignment.Center) { Text("$profileName".take(1).uppercase(), style = MaterialTheme.typography.titleLarge, color = RideGreen) }
                    }
                    Spacer(Modifier.width(11.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Lokaler, datenschutzorientierter Modus", style = MaterialTheme.typography.titleMedium)
                        Text("${stories.size} Ride Stories · nichts wird ungefragt hochgeladen", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        if (stories.isEmpty()) item {
            CommunityStatusCard("Dein Feed wartet", "Nimm deine erste Fahrt auf. Danach entsteht direkt eine Ride Story mit Video, Telemetrie, Park, Vergleich und 3D-Strecke.")
        }
        items(stories.take(20), key = { it.id }) { story ->
            LocalRideStoryCard(story)
        }
        item {
            CommunityStatusCard("Freunde & öffentlicher Feed", "Anmeldung, Reaktionen, Kommentare, Park-Follows und Moderation werden nach sicherer Backend-Aktivierung synchronisiert. Bis dahin bleibt diese Vorschau lokal.")
        }
    }
}

@Composable
private fun LocalRideStoryCard(story: LocalRideStory) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = RideSurface), border = androidx.compose.foundation.BorderStroke(1.dp, RideCyan.copy(alpha = .2f))) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(Brush.linearGradient(listOf(Color(0xFF17384E), Color(0xFF071522), Color(0xFF17362E))))
                    .padding(15.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(story.author, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                    Text(if (story.publicationStatus == "ready_to_publish") "COMMUNITY-BEREIT" else "PRIVAT", style = MaterialTheme.typography.labelSmall, color = if (story.publicationStatus == "ready_to_publish") RideGreen else RideMuted)
                }
                Text(story.title, style = MaterialTheme.typography.titleLarge)
                Text("${story.park} · ${story.date}", color = RideMuted, style = MaterialTheme.typography.bodySmall)
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                StoryValue("TEMPO", "${story.metrics.maxSpeedKmh.toInt()} km/h", RideCyan)
                StoryValue("VERTIKAL", "%+.1f G".format(story.metrics.maxNormalG), RideGreen)
                StoryValue("SEITLICH", "%.1f G".format(story.metrics.maxLateralG), RideAmber)
                StoryValue("QUALITÄT", "${story.metrics.qualityScore}%", RideRose)
            }
            if (story.comment.isNotBlank()) Text(story.comment, Modifier.padding(horizontal = 14.dp), style = MaterialTheme.typography.bodyMedium)
            Row(Modifier.fillMaxWidth().padding(start = 6.dp, end = 6.dp, bottom = 7.dp)) {
                TextButton(onClick = {}) { Text("♡ Reagieren") }
                TextButton(onClick = {}) { Text("○ Kommentieren") }
                Spacer(Modifier.weight(1f))
                TextButton(onClick = {}) { Text("Teilen") }
            }
        }
    }
}

@Composable
private fun StoryValue(label: String, value: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = RideMuted)
        Text(value, style = MaterialTheme.typography.labelLarge, color = color)
    }
}

@Composable
private fun CommunityStatusCard(title: String, text: String) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
internal fun AndroidProfileScreen(modifier: Modifier, profiles: LocalProfileStore) {
    var newName by remember { mutableStateOf("") }
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Profile", style = MaterialTheme.typography.headlineMedium)
        Text("Fahrten, Statistiken und Bewertungen bleiben nach lokalem Profil getrennt.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        profiles.profiles.forEach { profile ->
            Card(onClick = { profiles.select(profile.id) }, modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    RadioButton(selected = profile.id == profiles.activeProfileId, onClick = { profiles.select(profile.id) })
                    Column {
                        Text(profile.name, style = MaterialTheme.typography.titleMedium)
                        Text(if (profile.id == profiles.activeProfileId) "Aktives lokales Profil" else "Zum Wechseln antippen", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        HorizontalDivider()
        Text("Neues lokales Profil", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(newName, { newName = it }, label = { Text("Anzeigename") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Button(
            enabled = newName.trim().length >= 2,
            onClick = { profiles.create(newName); newName = "" },
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Profil anlegen und auswählen") }
    }
}
