package de.ridetracker.hud

import android.content.Context
import de.ridetracker.core.CoreNativeHUDSnapshot
import org.json.JSONArray
import org.json.JSONObject

data class AndroidHudItem(
    val x: Float,
    val y: Float,
    val width: Float,
    val height: Float,
    val scale: Float = 1f,
    val visible: Boolean = true,
)

data class AndroidHudConfiguration(
    val portrait: Map<String, AndroidHudItem>,
    val landscape: Map<String, AndroidHudItem>,
)

object AndroidHudConfigurationStore {
    private const val PREFS = "ride_tracker_hud"
    private const val KEY = "configuration_v1"
    const val VERSION = "1.0.0"

    fun load(context: Context): AndroidHudConfiguration {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
            ?: return defaults()
        return runCatching {
            val root = JSONObject(raw)
            AndroidHudConfiguration(
                portrait = decodeProfile(root.optJSONObject("portrait"), defaults().portrait),
                landscape = decodeProfile(root.optJSONObject("landscape"), defaults().landscape),
            )
        }.getOrElse { defaults() }
    }

    fun save(context: Context, configuration: AndroidHudConfiguration) {
        val root = JSONObject()
            .put("version", VERSION)
            .put("portrait", encodeProfile(configuration.portrait))
            .put("landscape", encodeProfile(configuration.landscape))
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, root.toString())
            .apply()
    }

    fun snapshot(context: Context): CoreNativeHUDSnapshot {
        val configuration = load(context)
        return CoreNativeHUDSnapshot(
            version = VERSION,
            activeProfile = null,
            profiles = mapOf(
                "portrait" to snapshotProfile(configuration.portrait),
                "landscape" to snapshotProfile(configuration.landscape),
            ),
        )
    }

    fun defaults(): AndroidHudConfiguration = AndroidHudConfiguration(
        portrait = mapOf(
            "vibration" to AndroidHudItem(.04f, .04f, .42f, .15f),
            "dynamics" to AndroidHudItem(.54f, .04f, .42f, .15f),
            "gDial" to AndroidHudItem(.18f, .22f, .64f, .30f),
            "gValues" to AndroidHudItem(.07f, .54f, .86f, .10f),
            "pulse" to AndroidHudItem(.05f, .69f, .43f, .25f),
            "speed" to AndroidHudItem(.52f, .69f, .43f, .25f),
        ),
        landscape = mapOf(
            "pulse" to AndroidHudItem(.02f, .62f, .29f, .31f),
            "gDial" to AndroidHudItem(.42f, .48f, .17f, .30f),
            "gValues" to AndroidHudItem(.33f, .84f, .34f, .11f),
            "speed" to AndroidHudItem(.70f, .61f, .28f, .33f),
            "vibration" to AndroidHudItem(.80f, .06f, .18f, .24f),
            "dynamics" to AndroidHudItem(.03f, .06f, .24f, .18f),
        ),
    )

    private fun encodeProfile(profile: Map<String, AndroidHudItem>): JSONObject = JSONObject().apply {
        profile.forEach { (id, item) ->
            put(id, JSONObject()
                .put("x", item.x.toDouble())
                .put("y", item.y.toDouble())
                .put("width", item.width.toDouble())
                .put("height", item.height.toDouble())
                .put("scale", item.scale.toDouble())
                .put("visible", item.visible))
        }
    }

    private fun decodeProfile(source: JSONObject?, fallback: Map<String, AndroidHudItem>): Map<String, AndroidHudItem> {
        if (source == null) return fallback
        return fallback.mapValues { (id, defaults) ->
            val item = source.optJSONObject(id) ?: return@mapValues defaults
            AndroidHudItem(
                x = item.optDouble("x", defaults.x.toDouble()).toFloat(),
                y = item.optDouble("y", defaults.y.toDouble()).toFloat(),
                width = item.optDouble("width", defaults.width.toDouble()).toFloat(),
                height = item.optDouble("height", defaults.height.toDouble()).toFloat(),
                scale = item.optDouble("scale", defaults.scale.toDouble()).toFloat(),
                visible = item.optBoolean("visible", defaults.visible),
            )
        }
    }

    private fun snapshotProfile(profile: Map<String, AndroidHudItem>): JSONObject = JSONObject().apply {
        put("panelOpacity", 0.86)
        put("globalOpacity", 1.0)
        put("fontScale", 1.0)
        put("fontFamily", "system")
        put("elements", JSONObject().apply {
            profile.forEach { (id, item) ->
                put(id, JSONObject()
                    .put("visible", item.visible)
                    .put("x", item.x.toDouble())
                    .put("y", item.y.toDouble())
                    .put("width", item.width.toDouble())
                    .put("height", item.height.toDouble())
                    .put("scale", item.scale.toDouble())
                    .put("opacity", 1.0)
                    .put("fontScale", 1.0))
            }
        })
    }
}
