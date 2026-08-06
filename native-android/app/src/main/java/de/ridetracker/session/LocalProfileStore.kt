package de.ridetracker.session

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

data class LocalUserProfile(val id: String, val name: String)

class LocalProfileStore(private val context: Context) {
    private val preferences = context.getSharedPreferences("ridetracker_profiles_v1", Context.MODE_PRIVATE)
    var profiles by mutableStateOf(loadProfiles()); private set
    var activeProfileId by mutableStateOf(preferences.getString("active", null) ?: profiles.first().id); private set

    val activeProfile: LocalUserProfile get() = profiles.firstOrNull { it.id == activeProfileId } ?: profiles.first()

    init { preferences.edit().putString("active", activeProfileId).apply() }

    fun create(name: String) {
        val trimmed = name.trim(); if (trimmed.isEmpty()) return
        val profile = LocalUserProfile(UUID.randomUUID().toString(), trimmed)
        profiles = profiles + profile
        persist(); select(profile.id)
    }

    fun select(id: String) {
        if (profiles.none { it.id == id }) return
        activeProfileId = id; preferences.edit().putString("active", id).apply()
    }

    fun resetActiveData() {
        context.filesDir.listFiles()?.forEach { file ->
            if (!file.name.endsWith(".ride.json") && !file.name.endsWith(".ride-package.json")) return@forEach
            val ownerId = runCatching { JSONObject(file.readText()).optJSONObject("owner")?.optString("profileID") }.getOrNull()
            if (ownerId == activeProfileId) file.delete()
        }
    }

    private fun persist() {
        val array = JSONArray(); profiles.forEach { array.put(JSONObject().put("id", it.id).put("name", it.name)) }
        preferences.edit().putString("profiles", array.toString()).apply()
    }

    private fun loadProfiles(): List<LocalUserProfile> {
        val raw = preferences.getString("profiles", null)
        if (raw != null) runCatching {
            val array = JSONArray(raw)
            return List(array.length()) { index -> array.getJSONObject(index).let { LocalUserProfile(it.getString("id"), it.getString("name")) } }
        }
        val initial = listOf(LocalUserProfile(UUID.randomUUID().toString(), "Standardnutzer"))
        val array = JSONArray().put(JSONObject().put("id", initial[0].id).put("name", initial[0].name))
        preferences.edit().putString("profiles", array.toString()).apply()
        return initial
    }

    companion object {
        fun current(context: Context): LocalUserProfile = LocalProfileStore(context).activeProfile
    }
}
