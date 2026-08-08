package de.ridetracker

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import de.ridetracker.session.LocalProfileStore

@Composable
internal fun AndroidCommunityOverview(modifier: Modifier, profileName: String) {
    val context = LocalContext.current
    val rides = remember { context.filesDir.listFiles { file -> file.name.endsWith(".ride.json") }?.size ?: 0 }
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Community", style = MaterialTheme.typography.headlineMedium)
        Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Lokaler, datenschutzorientierter Modus", style = MaterialTheme.typography.titleMedium)
                Text("$profileName · $rides lokal gespeicherte Fahrten")
                Text("Ohne eingerichtetes Supabase-Projekt werden keine Profile, GPS-Rohdaten, Videos oder Fahrten hochgeladen.", style = MaterialTheme.typography.bodySmall)
            }
        }
        CommunityStatusCard("Fahrten vorbereiten", "Titel, Park, Bahn, Bild, Bewertung und Community-Kommentar lassen sich unter „Fahrten“ bearbeiten.")
        CommunityStatusCard("Feed & Freunde", "Werden nach sicherer Anmeldung und ausdrücklicher Community-Aktivierung synchronisiert. Bis dahin bleibt die Ansicht lokal.")
        CommunityStatusCard("Gemeinsame Streckenmodelle", "Für eine spätere Veröffentlichung werden normalisierte XYZ-Modelle und abgeleitete Telemetrie vorbereitet – keine Videos und keine ungefilterten GPS-Rohdaten.")
        CommunityStatusCard("Moderation & Meldungen", "Die serverseitigen Rollen und Meldeprozesse sind vorbereitet; die öffentliche Aktivierung erfolgt erst nach Datenschutz- und Sicherheitstest.")
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
