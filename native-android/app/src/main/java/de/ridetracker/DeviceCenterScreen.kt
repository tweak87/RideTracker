package de.ridetracker

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorManager
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.unit.dp
import de.ridetracker.sensors.AndroidHeartRateManager
import de.ridetracker.sensors.AndroidSensorRecorder
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.sqrt

internal data class AndroidDeviceChannel(
    var id: String,
    var metric: String,
    var unit: String,
    var enabled: Boolean,
    var sampleRateHz: Double,
    var calibratedAt: String? = null,
)

internal data class AndroidDeviceDescriptor(
    var id: String,
    var name: String,
    var type: String,
    var transport: String,
    var enabled: Boolean,
    var autoReconnect: Boolean,
    var channels: MutableList<AndroidDeviceChannel>,
)

internal data class AndroidMetricBinding(
    var metric: String,
    var primarySource: String,
    var fallbackSources: MutableList<String>,
    var minimumQuality: Double,
    var maxAgeMs: Int,
    var interpolation: String,
    var widgetId: String? = null,
)

internal class AndroidDeviceRegistry(private val context: Context) {
    private val prefs = context.getSharedPreferences("rideTracker", Context.MODE_PRIVATE)
    var devices by mutableStateOf(loadDevices())
    var bindings by mutableStateOf(loadBindings())

    private fun defaults() = mutableListOf(
        AndroidDeviceDescriptor("phone-motion", "Smartphone Bewegung", "phone", "internal", true, true, mutableListOf(AndroidDeviceChannel("motion", "gForce", "g", true, 100.0))),
        AndroidDeviceDescriptor("phone-gps", "Smartphone GPS", "gnss", "internal", true, true, mutableListOf(AndroidDeviceChannel("location", "location", "deg", true, 1.0), AndroidDeviceChannel("speed", "speedKmh", "km/h", true, 1.0))),
        AndroidDeviceDescriptor("phone-camera", "Smartphone Kamera", "camera", "internal", true, true, mutableListOf(AndroidDeviceChannel("video", "video", "stream", true, 30.0))),
        AndroidDeviceDescriptor("phone-barometer", "Smartphone Barometer", "barometer", "internal", (context.getSystemService(Context.SENSOR_SERVICE) as SensorManager).getDefaultSensor(Sensor.TYPE_PRESSURE) != null, true, mutableListOf(AndroidDeviceChannel("pressure", "pressureHpa", "hPa", true, 10.0), AndroidDeviceChannel("altitude", "relativeAltitude", "m", true, 10.0))),
        AndroidDeviceDescriptor("ble-heart", "BLE Herzfrequenz", "heartRate", "bluetooth-le", false, true, mutableListOf(AndroidDeviceChannel("heartRate", "heartRateBpm", "bpm", true, 1.0))),
        AndroidDeviceDescriptor("external-imu", "Externe IMU", "imu", "bluetooth-le", false, true, mutableListOf(AndroidDeviceChannel("acceleration", "acceleration", "m/s²", true, 200.0), AndroidDeviceChannel("gyroscope", "gyroscope", "rad/s", true, 200.0))),
        AndroidDeviceDescriptor("external-gnss", "Externer GNSS-Empfänger", "gnss", "bluetooth-le", false, true, mutableListOf(AndroidDeviceChannel("position", "location", "deg", true, 10.0), AndroidDeviceChannel("speed", "speedKmh", "km/h", true, 10.0))),
        AndroidDeviceDescriptor("external-camera", "Externe Kamera", "camera", "wifi", false, true, mutableListOf(AndroidDeviceChannel("video", "video", "stream", true, 30.0))),
    )

    private fun defaultBindings() = mutableListOf(
        AndroidMetricBinding("heartRateBpm", "ble-heart/heartRate", mutableListOf(), 0.7, 3000, "hold", "pulse"),
        AndroidMetricBinding("speedKmh", "external-gnss/speed", mutableListOf("phone-gps/speed"), 0.65, 1500, "linear", "speed"),
        AndroidMetricBinding("gForce", "external-imu/acceleration", mutableListOf("phone-motion/motion"), 0.7, 250, "hold", "gDial"),
        AndroidMetricBinding("location", "external-gnss/position", mutableListOf("phone-gps/location"), 0.6, 3000, "linear"),
        AndroidMetricBinding("video", "phone-camera/video", mutableListOf("external-camera/video"), 0.5, 1000, "hold"),
    )

    private fun loadDevices(): MutableList<AndroidDeviceDescriptor> = runCatching {
        val raw = prefs.getString("devices", null) ?: return@runCatching defaults()
        val array = JSONArray(raw)
        val loaded = MutableList(array.length()) { i ->
            val d = array.getJSONObject(i)
            val channels = d.getJSONArray("channels")
            AndroidDeviceDescriptor(
                d.getString("id"), d.getString("name"), d.getString("type"), d.getString("transport"),
                d.getBoolean("enabled"), d.optBoolean("autoReconnect", true),
                MutableList(channels.length()) { j ->
                    val c = channels.getJSONObject(j)
                    AndroidDeviceChannel(c.getString("id"), c.getString("metric"), c.optString("unit"), c.getBoolean("enabled"), c.optDouble("sampleRateHz", 1.0), c.optString("calibratedAt").ifBlank { null })
                },
            )
        }
        defaults().forEach { fallback -> if (loaded.none { it.id == fallback.id }) loaded += fallback }
        loaded
    }.getOrElse { defaults() }

    private fun loadBindings(): MutableList<AndroidMetricBinding> = runCatching {
        val raw = prefs.getString("metricBindings", null) ?: return@runCatching defaultBindings()
        val array = JSONArray(raw)
        MutableList(array.length()) { i ->
            val b = array.getJSONObject(i)
            val fallback = b.optJSONArray("fallbackSources") ?: JSONArray()
            AndroidMetricBinding(
                b.getString("metric"), b.optString("primarySource"),
                MutableList(fallback.length()) { j -> fallback.getString(j) },
                b.optDouble("minimumQuality", 0.6), b.optInt("maxAgeMs", 1000),
                b.optString("interpolation", "hold"), b.optString("widgetId").ifBlank { null },
            )
        }
    }.getOrElse { defaultBindings() }

    fun save() {
        val array = JSONArray()
        devices.forEach { device ->
            val channels = JSONArray()
            device.channels.forEach { channel ->
                channels.put(JSONObject().put("id", channel.id).put("metric", channel.metric).put("unit", channel.unit).put("enabled", channel.enabled).put("sampleRateHz", channel.sampleRateHz).put("calibratedAt", channel.calibratedAt ?: ""))
            }
            array.put(JSONObject().put("id", device.id).put("name", device.name).put("type", device.type).put("transport", device.transport).put("enabled", device.enabled).put("autoReconnect", device.autoReconnect).put("channels", channels))
        }
        prefs.edit().putString("devices", array.toString()).apply()
        devices = devices.toMutableList()
    }

    fun saveBindings() {
        val array = JSONArray()
        bindings.forEach { b ->
            array.put(JSONObject().put("metric", b.metric).put("primarySource", b.primarySource).put("fallbackSources", JSONArray(b.fallbackSources)).put("minimumQuality", b.minimumQuality).put("maxAgeMs", b.maxAgeMs).put("interpolation", b.interpolation).put("widgetId", b.widgetId ?: ""))
        }
        prefs.edit().putString("metricBindings", array.toString()).apply()
        bindings = bindings.toMutableList()
    }

    fun add(type: String) {
        val existingId = when (type) {
            "heartRate" -> "ble-heart"
            "imu" -> "external-imu"
            "gnss" -> "external-gnss"
            "camera" -> "external-camera"
            "barometer" -> "phone-barometer"
            else -> null
        }
        val existing = existingId?.let { id -> devices.firstOrNull { it.id == id } }
        if (existing != null) {
            existing.enabled = true
        } else {
            devices.add(AndroidDeviceDescriptor("custom-${System.currentTimeMillis()}", "Benutzerdefinierter Sensor", "custom", "bluetooth-le", true, true, mutableListOf(AndroidDeviceChannel("value", "customValue", "", true, 1.0))))
        }
        save()
    }

    fun sources(metric: String): List<String> = devices.flatMap { device ->
        device.channels.filter { it.metric == metric || (metric == "gForce" && it.metric == "acceleration") }.map { "${device.id}/${it.id}" }
    }
}

@Composable
internal fun AndroidDeviceCenter(
    modifier: Modifier,
    registry: AndroidDeviceRegistry,
    heartRate: AndroidHeartRateManager,
    recorder: AndroidSensorRecorder,
) {
    var showRouting by remember { mutableStateOf(false) }
    var showAddDialog by remember { mutableStateOf(false) }
    if (showAddDialog) AddDeviceDialog(
        hasBarometer = recorder.hasBarometer,
        close = { showAddDialog = false },
        select = { type -> registry.add(type); showAddDialog = false },
    )
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row {
            Text(if (showRouting) "Quellen & Prioritäten" else "Geräte & Sensoren", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
            if (showRouting) Button(onClick = { showRouting = false }) { Text("Zurück") }
            else Button(onClick = { showAddDialog = true }) { Text("Hinzufügen") }
        }
        if (showRouting) RoutingEditor(registry) else DeviceList(registry, heartRate, recorder) { showRouting = true }
    }
}

@Composable
private fun AddDeviceDialog(hasBarometer: Boolean, close: () -> Unit, select: (String) -> Unit) {
    AlertDialog(
        onDismissRequest = close,
        title = { Text("Gerät oder Sensor hinzufügen") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                listOf(
                    Triple("heartRate", "BLE-Herzfrequenz", "Brustgurt oder kompatibler Pulssensor"),
                    Triple("imu", "Externe IMU", "Beschleunigung und Gyroskop über Bluetooth LE"),
                    Triple("gnss", "Externer GNSS-Empfänger", "Präzisere Position und Geschwindigkeit"),
                    Triple("camera", "Externe Kamera", "WLAN-/Kameraquelle konfigurieren"),
                    Triple("custom", "Benutzerdefinierter Sensor", "Eigenen Kanal und Einheit anlegen"),
                ).forEach { (id, title, subtitle) ->
                    OutlinedButton(onClick = { select(id) }, modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.fillMaxWidth()) {
                            Text(title)
                            Text(subtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                Text(
                    if (hasBarometer) "Das interne Barometer wurde erkannt und ist bereits verfügbar."
                    else "Kein internes Barometer erkannt. Ein nicht vorhandener Telefonsensor kann nicht nachinstalliert werden.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        confirmButton = { TextButton(close) { Text("Schließen") } },
    )
}

@Composable
private fun RoutingEditor(registry: AndroidDeviceRegistry) {
    registry.bindings.forEach { binding ->
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(binding.metric, style = MaterialTheme.typography.titleMedium)
                var expanded by remember(binding.metric) { mutableStateOf(false) }
                Box {
                    OutlinedButton(onClick = { expanded = true }) {
                        Text("Primär: ${binding.primarySource.ifBlank { "Keine" }}")
                    }
                    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        DropdownMenuItem(text = { Text("Keine") }, onClick = {
                            binding.primarySource = ""
                            registry.saveBindings()
                            expanded = false
                        })
                        registry.sources(binding.metric).forEach { source ->
                            DropdownMenuItem(text = { Text(source) }, onClick = {
                                binding.primarySource = source
                                registry.saveBindings()
                                expanded = false
                            })
                        }
                    }
                }
                OutlinedTextField(
                    value = binding.fallbackSources.joinToString(", "),
                    onValueChange = {
                        binding.fallbackSources = it.split(',').map(String::trim).filter(String::isNotEmpty).toMutableList()
                        registry.saveBindings()
                    },
                    label = { Text("Ersatzquellen") },
                    trailingIcon = { KeyboardDismissButton() },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Mindestqualität: ${"%.2f".format(binding.minimumQuality)}")
                Slider(
                    value = binding.minimumQuality.toFloat(),
                    onValueChange = { binding.minimumQuality = it.toDouble() },
                    onValueChangeFinished = registry::saveBindings,
                    valueRange = 0f..1f,
                    steps = 19,
                )
                OutlinedTextField(
                    value = binding.maxAgeMs.toString(),
                    onValueChange = {
                        binding.maxAgeMs = it.toIntOrNull() ?: binding.maxAgeMs
                        registry.saveBindings()
                    },
                    label = { Text("Maximales Alter ms") },
                    trailingIcon = { KeyboardDismissButton() },
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("none", "hold", "linear").forEach { mode ->
                        FilterChip(selected = binding.interpolation == mode, onClick = {
                            binding.interpolation = mode
                            registry.saveBindings()
                        }, label = { Text(mode) })
                    }
                }
            }
        }
    }
}

@Composable
private fun DeviceList(registry: AndroidDeviceRegistry, heartRate: AndroidHeartRateManager, recorder: AndroidSensorRecorder, openRouting: () -> Unit) {
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        if (heartRate.permissionsGranted()) heartRate.scan()
    }
    LiveSensorDiagnostics(recorder, heartRate)
    Card {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("BLE Herzfrequenz", style = MaterialTheme.typography.titleMedium)
            Text(heartRate.status)
            heartRate.latestHeartRate?.let { Text("$it BPM") }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                    if (heartRate.permissionsGranted()) heartRate.scan() else permissionLauncher.launch(heartRate.requiredPermissions())
                }) { Text("Suchen") }
                Button(onClick = heartRate::connect) { Text("Verbinden") }
            }
        }
    }
    Button(onClick = openRouting, modifier = Modifier.fillMaxWidth()) { Text("Quellen & Prioritäten") }
    registry.devices.forEach { device ->
        var expanded by remember(device.id) { mutableStateOf(false) }
        Card(onClick = { expanded = !expanded }, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(device.name, style = MaterialTheme.typography.titleMedium)
                Text("${device.transport} · ${device.channels.size} Kanäle")
                if (expanded) {
                    OutlinedTextField(device.name, { device.name = it; registry.save() }, label = { Text("Name") }, trailingIcon = { KeyboardDismissButton() }, modifier = Modifier.fillMaxWidth())
                    Row { Text("Aktiv", Modifier.weight(1f)); Switch(device.enabled, { device.enabled = it; registry.save() }) }
                    Row { Text("Automatisch verbinden", Modifier.weight(1f)); Switch(device.autoReconnect, { device.autoReconnect = it; registry.save() }) }
                    device.channels.forEach { channel ->
                        HorizontalDivider()
                        Text(channel.metric, style = MaterialTheme.typography.titleSmall)
                        Row { Text("Kanal aktiv", Modifier.weight(1f)); Switch(channel.enabled, { channel.enabled = it; registry.save() }) }
                        OutlinedTextField(channel.sampleRateHz.toString(), { channel.sampleRateHz = it.toDoubleOrNull() ?: channel.sampleRateHz; registry.save() }, label = { Text("Messrate Hz") }, trailingIcon = { KeyboardDismissButton() }, modifier = Modifier.fillMaxWidth())
                        Button(onClick = { channel.calibratedAt = java.time.Instant.now().toString(); registry.save() }) {
                            Text(if (channel.calibratedAt == null) "Separat kalibrieren" else "Neu kalibrieren")
                        }
                    }
                }
            }
        }
    }
}

private data class TimedSensorValue(val timestampMs: Long, val value: Double)

@Composable
private fun LiveSensorDiagnostics(recorder: AndroidSensorRecorder, heartRate: AndroidHeartRateManager) {
    val acceleration = remember { mutableStateListOf<TimedSensorValue>() }
    val gyroscope = remember { mutableStateListOf<TimedSensorValue>() }
    val pressure = remember { mutableStateListOf<TimedSensorValue>() }
    val speed = remember { mutableStateListOf<TimedSensorValue>() }
    val heart = remember { mutableStateListOf<TimedSensorValue>() }
    DisposableEffect(recorder) {
        recorder.startDiagnostics()
        onDispose { recorder.stopDiagnostics() }
    }
    val sample = recorder.liveSensorSample
    LaunchedEffect(sample.timestampMs, recorder.speedKmh, heartRate.latestHeartRate) {
        if (sample.timestampMs <= 0L) return@LaunchedEffect
        val now = android.os.SystemClock.elapsedRealtime()
        fun add(list: MutableList<TimedSensorValue>, value: Double?) {
            if (value != null && value.isFinite()) list += TimedSensorValue(now, value)
            while (list.isNotEmpty() && now - list.first().timestampMs > 8_000L) list.removeAt(0)
        }
        add(acceleration, sqrt(sample.accelerationXG * sample.accelerationXG + sample.accelerationYG * sample.accelerationYG + sample.accelerationZG * sample.accelerationZG))
        add(gyroscope, sqrt(sample.gyroscopeX * sample.gyroscopeX + sample.gyroscopeY * sample.gyroscopeY + sample.gyroscopeZ * sample.gyroscopeZ))
        add(pressure, sample.pressureHpa)
        add(speed, recorder.speedKmh)
        add(heart, heartRate.latestHeartRate?.toDouble())
    }
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .35f))) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Live-Sensordiagnose", style = MaterialTheme.typography.titleMedium)
            Text("Die letzten 8 Sekunden werden direkt vom Gerät dargestellt. So erkennst du vor der Fahrt Ausfälle und eingefrorene Sensoren.", style = MaterialTheme.typography.bodySmall)
            SensorGraph("Beschleunigung", "${"%.2f".format(acceleration.lastOrNull()?.value ?: 0.0)} G", acceleration, Color(0xFF5FD0FF))
            SensorGraph("Gyroskop", "${"%.2f".format(gyroscope.lastOrNull()?.value ?: 0.0)} rad/s", gyroscope, Color(0xFFFFD166))
            if (recorder.hasBarometer) SensorGraph("Luftdruck", "${"%.1f".format(pressure.lastOrNull()?.value ?: 0.0)} hPa", pressure, Color(0xFF65F0B7))
            else Text("Barometer · auf diesem Gerät nicht vorhanden", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            SensorGraph("GPS-Geschwindigkeit", "${"%.1f".format(recorder.speedKmh)} km/h", speed, Color(0xFFFF6B81))
            SensorGraph("Herzfrequenz", heartRate.latestHeartRate?.let { "$it bpm" } ?: "nicht verbunden", heart, Color(0xFFFF5A9D))
        }
    }
}

@Composable
private fun SensorGraph(title: String, value: String, values: List<TimedSensorValue>, color: Color) {
    val graphBackground = MaterialTheme.colorScheme.surface.copy(alpha = .65f)
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(title, style = MaterialTheme.typography.labelMedium)
            Text(value, style = MaterialTheme.typography.labelMedium, color = color)
        }
        Canvas(Modifier.fillMaxWidth().height(54.dp)) {
            drawRoundRect(graphBackground, cornerRadius = androidx.compose.ui.geometry.CornerRadius(10f, 10f))
            if (values.size < 2) return@Canvas
            val minimum = values.minOf { it.value }
            val maximum = values.maxOf { it.value }
            val range = max(maximum - minimum, 0.02)
            val start = values.first().timestampMs
            val duration = max((values.last().timestampMs - start).toDouble(), 1.0)
            val path = Path()
            values.forEachIndexed { index, point ->
                val x = ((point.timestampMs - start) / duration * size.width).toFloat()
                val y = (size.height - 7f - ((point.value - minimum) / range * (size.height - 14f))).toFloat()
                if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            drawPath(path, color, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 3.5f))
        }
    }
}
