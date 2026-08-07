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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import de.ridetracker.hud.AndroidHudConfiguration
import de.ridetracker.hud.AndroidHudConfigurationStore
import de.ridetracker.hud.AndroidHudItem
import kotlin.math.max

private enum class HudMode { Portrait, Landscape }

@Composable
fun AndroidHudFullscreenEditor(modifier: Modifier = Modifier) {
    val activity = LocalActivity.current
    val context = LocalContext.current
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

    val saved = remember { AndroidHudConfigurationStore.load(context) }
    var mode by remember { mutableStateOf(HudMode.Portrait) }
    var selected by remember { mutableStateOf("pulse") }
    val portrait = remember { mutableStateMapOf<String, AndroidHudItem>().apply { putAll(saved.portrait) } }
    val landscape = remember { mutableStateMapOf<String, AndroidHudItem>().apply { putAll(saved.landscape) } }
    val items = if (mode == HudMode.Portrait) portrait else landscape
    var stageSize by remember { mutableStateOf(IntSize.Zero) }

    fun persist() {
        AndroidHudConfigurationStore.save(
            context,
            AndroidHudConfiguration(portrait = portrait.toMap(), landscape = landscape.toMap()),
        )
    }

    fun closeEditor() {
        persist()
        editing = false
    }

    Surface(Modifier.fillMaxSize(), color = Color.Black) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val wide = maxWidth > maxHeight
            if (wide) {
                Row(Modifier.fillMaxSize().padding(10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    HudControls(mode, { mode = it }, selected, { selected = it }, items, ::persist, ::closeEditor, Modifier.width(250.dp))
                    HudStage(mode, selected, { selected = it }, items, stageSize, { stageSize = it }, ::persist, Modifier.weight(1f))
                }
            } else {
                Column(Modifier.fillMaxSize().padding(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    HudStage(mode, selected, { selected = it }, items, stageSize, { stageSize = it }, ::persist, Modifier.weight(1f))
                    HudControls(mode, { mode = it }, selected, { selected = it }, items, ::persist, ::closeEditor, Modifier.heightIn(max = 260.dp))
                }
            }
        }
    }
}

@Composable
private fun HudControls(
    mode: HudMode,
    setMode: (HudMode) -> Unit,
    selected: String,
    select: (String) -> Unit,
    items: MutableMap<String, AndroidHudItem>,
    persist: () -> Unit,
    close: () -> Unit,
    modifier: Modifier,
) {
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
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(item.visible, {
                    items[key] = item.copy(visible = it)
                    persist()
                })
                Text("Sichtbar")
            }
            Text("Größe", style = MaterialTheme.typography.labelSmall)
            Slider(
                value = item.scale,
                onValueChange = { value -> items[key] = (items[key] ?: item).copy(scale = value) },
                onValueChangeFinished = persist,
                valueRange = .3f..2.5f,
            )
        }
        Button(onClick = close, modifier = Modifier.fillMaxWidth()) { Text("Fertig") }
    }
}

@Composable
private fun HudStage(
    mode: HudMode,
    selected: String,
    select: (String) -> Unit,
    items: MutableMap<String, AndroidHudItem>,
    size: IntSize,
    setSize: (IntSize) -> Unit,
    persist: () -> Unit,
    modifier: Modifier,
) {
    Box(modifier.aspectRatio(if (mode == HudMode.Portrait) 9f / 16f else 16f / 9f).onSizeChanged(setSize).background(Color(0xFF102331), RoundedCornerShape(16.dp))) {
        items.forEach { (key, item) -> if (item.visible) {
            Box(
                Modifier
                    .offset((item.x * size.width).dp / max(androidx.compose.ui.platform.LocalDensity.current.density, .1f), (item.y * size.height).dp / max(androidx.compose.ui.platform.LocalDensity.current.density, .1f))
                    .width((item.width * item.scale * size.width).dp / max(androidx.compose.ui.platform.LocalDensity.current.density, .1f))
                    .height((item.height * item.scale * size.height).dp / max(androidx.compose.ui.platform.LocalDensity.current.density, .1f))
                    .background(Color(0xDD061416), RoundedCornerShape(12.dp))
                    .pointerInput(key, mode, size, item.scale) {
                        detectDragGestures(
                            onDragStart = { select(key) },
                            onDragEnd = persist,
                            onDragCancel = persist,
                            onDrag = { change, amount ->
                                change.consume()
                                if (size.width > 0 && size.height > 0) {
                                    val current = items[key] ?: item
                                    val nextX = (current.x + amount.x / size.width).coerceIn(0f, max(0f, 1f - current.width * current.scale))
                                    val nextY = (current.y + amount.y / size.height).coerceIn(0f, max(0f, 1f - current.height * current.scale))
                                    items[key] = current.copy(x = nextX, y = nextY)
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
