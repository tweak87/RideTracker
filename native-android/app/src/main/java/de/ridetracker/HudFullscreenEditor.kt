package de.ridetracker

import android.content.pm.ActivityInfo
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import kotlin.math.max

private data class HudItem(var x: Float, var y: Float, val width: Float, val height: Float, var scale: Float = 1f, var visible: Boolean = true)
private enum class HudMode { Portrait, Landscape }

@Composable
fun AndroidHudFullscreenEditor(modifier: Modifier = Modifier) {
    val activity = LocalActivity.current
    var editing by remember { mutableStateOf(false) }
    if (!editing) {
        Column(modifier.fillMaxSize().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text("HUD-Konfiguration", style = MaterialTheme.typography.headlineLarge)
            Spacer(Modifier.height(12.dp))
            Text("Bearbeite Hoch- und Querformat in einer eigenen Vollbild-Vorschau. Die Kameraaufnahme bleibt davon getrennt.")
            Spacer(Modifier.height(18.dp))
            Button(onClick = { editing = true; activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED }) { Text("Vollbild-Editor öffnen") }
        }
        return
    }

    DisposableEffect(Unit) {
        activity?.window?.decorView?.systemUiVisibility = 5894
        onDispose { activity?.window?.decorView?.systemUiVisibility = 0; activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED }
    }

    var mode by remember { mutableStateOf(HudMode.Portrait) }
    var selected by remember { mutableStateOf("pulse") }
    val portrait = remember { mutableStateMapOf<String, HudItem>().apply { putAll(defaultItems(true)) } }
    val landscape = remember { mutableStateMapOf<String, HudItem>().apply { putAll(defaultItems(false)) } }
    val items = if (mode == HudMode.Portrait) portrait else landscape
    var stageSize by remember { mutableStateOf(IntSize.Zero) }

    Surface(Modifier.fillMaxSize(), color = Color.Black) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val wide = maxWidth > maxHeight
            if (wide) {
                Row(Modifier.fillMaxSize().padding(10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    HudControls(mode, { mode = it }, selected, { selected = it }, items, { editing = false }, Modifier.width(250.dp))
                    HudStage(mode, selected, { selected = it }, items, stageSize, { stageSize = it }, Modifier.weight(1f))
                }
            } else {
                Column(Modifier.fillMaxSize().padding(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    HudStage(mode, selected, { selected = it }, items, stageSize, { stageSize = it }, Modifier.weight(1f))
                    HudControls(mode, { mode = it }, selected, { selected = it }, items, { editing = false }, Modifier.heightIn(max = 260.dp))
                }
            }
        }
    }
}

@Composable
private fun HudControls(mode: HudMode, setMode: (HudMode) -> Unit, selected: String, select: (String) -> Unit, items: MutableMap<String, HudItem>, close: () -> Unit, modifier: Modifier) {
    Column(modifier.verticalScroll(rememberScrollState()).background(Color(0xFF07131F), RoundedCornerShape(14.dp)).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(mode == HudMode.Portrait, { setMode(HudMode.Portrait) }, { Text("9:16") })
            FilterChip(mode == HudMode.Landscape, { setMode(HudMode.Landscape) }, { Text("16:9") })
        }
        labels.forEach { (key, label) ->
            Button(onClick = { select(key) }, colors = ButtonDefaults.buttonColors(containerColor = if (selected == key) Color(0x3300E5FF) else Color(0xFF102436)), modifier = Modifier.fillMaxWidth()) {
                Text(label, modifier = Modifier.weight(1f)); Text(if (selected == key) "✥" else "⚙")
            }
            val item = items[key] ?: return@forEach
            Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(item.visible, { item.visible = it }); Text("Sichtbar") }
            Text("Größe", style = MaterialTheme.typography.labelSmall)
            Slider(item.scale, { item.scale = it }, valueRange = .3f..2.5f)
        }
        Button(onClick = close, modifier = Modifier.fillMaxWidth()) { Text("Fertig") }
    }
}

@Composable
private fun HudStage(mode: HudMode, selected: String, select: (String) -> Unit, items: MutableMap<String, HudItem>, size: IntSize, setSize: (IntSize) -> Unit, modifier: Modifier) {
    Box(modifier.aspectRatio(if (mode == HudMode.Portrait) 9f / 16f else 16f / 9f).onSizeChanged(setSize).background(Color(0xFF102331), RoundedCornerShape(16.dp))) {
        items.forEach { (key, item) -> if (item.visible) {
            var dragStart by remember(key, mode) { mutableStateOf(Offset.Zero) }
            Box(
                Modifier
                    .offset((item.x * size.width).dp / max(androidx.compose.ui.platform.LocalDensity.current.density, .1f), (item.y * size.height).dp / max(androidx.compose.ui.platform.LocalDensity.current.density, .1f))
                    .width((item.width * item.scale * size.width).dp / max(androidx.compose.ui.platform.LocalDensity.current.density, .1f))
                    .height((item.height * item.scale * size.height).dp / max(androidx.compose.ui.platform.LocalDensity.current.density, .1f))
                    .background(Color(0xDD061416), RoundedCornerShape(12.dp))
                    .pointerInput(key, mode, size) {
                        detectDragGestures(
                            onDragStart = { select(key); dragStart = Offset(item.x, item.y) },
                            onDrag = { change, amount ->
                                change.consume()
                                if (size.width > 0 && size.height > 0) {
                                    item.x = (item.x + amount.x / size.width).coerceIn(0f, max(0f, 1f - item.width * item.scale))
                                    item.y = (item.y + amount.y / size.height).coerceIn(0f, max(0f, 1f - item.height * item.scale))
                                }
                            }
                        )
                    },
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) { Text(labels.first { it.first == key }.second.uppercase(), style = MaterialTheme.typography.labelSmall); Text(samples[key] ?: "–", color = Color.Cyan, style = MaterialTheme.typography.titleMedium) }
                Text("✥", modifier = Modifier.align(Alignment.TopEnd).background(Color.Cyan, RoundedCornerShape(50)).padding(5.dp), color = Color.Black)
            }
        } }
    }
}

private val labels = listOf("pulse" to "Puls", "gDial" to "G-Kraft-Kreis", "gValues" to "G-Achsen", "speed" to "Geschwindigkeit", "vibration" to "Vibration", "dynamics" to "Fahrdynamik")
private val samples = mapOf("pulse" to "142 BPM", "gDial" to "+0.8 / +2.4 G", "gValues" to "LAT +0.8 · VERT +2.4", "speed" to "87 KM/H", "vibration" to "6.8 m/s²", "dynamics" to "2.58 G · 4.1 G/s")
private fun defaultItems(portrait: Boolean): Map<String, HudItem> = if (portrait) mapOf(
    "vibration" to HudItem(.04f,.04f,.42f,.15f), "dynamics" to HudItem(.54f,.04f,.42f,.15f), "gDial" to HudItem(.18f,.22f,.64f,.30f), "gValues" to HudItem(.07f,.54f,.86f,.10f), "pulse" to HudItem(.05f,.69f,.43f,.25f), "speed" to HudItem(.52f,.69f,.43f,.25f)
) else mapOf(
    "pulse" to HudItem(.02f,.62f,.29f,.31f), "gDial" to HudItem(.42f,.48f,.17f,.30f), "gValues" to HudItem(.33f,.84f,.34f,.11f), "speed" to HudItem(.70f,.61f,.28f,.33f), "vibration" to HudItem(.80f,.06f,.18f,.24f), "dynamics" to HudItem(.03f,.06f,.24f,.18f)
)
