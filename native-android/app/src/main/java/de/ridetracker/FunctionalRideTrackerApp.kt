package de.ridetracker

import android.Manifest
import android.app.Activity
import android.content.Context
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import de.ridetracker.sensors.AndroidHeartRateManager
import de.ridetracker.sensors.AndroidSensorRecorder
import de.ridetracker.session.LocalProfileStore
import de.ridetracker.video.AndroidVideoRecorder
import org.json.JSONObject
import java.io.File

enum class FunctionalSection { HOME, RECORD, RIDES, MAP, DEVICES, SETTINGS, HUD, STATISTICS, ACHIEVEMENTS, MEDIA }
data class AndroidRideEntry(val file:File,val title:String,val distanceMeters:Double,val durationSeconds:Double,val latitude:Double?,val longitude:Double?)
private fun loadRides(context:Context):List<AndroidRideEntry> = context.filesDir.walkTopDown().filter{it.isFile&&it.name.endsWith(".ride.json")}.mapNotNull{file->runCatching{val root=JSONObject(file.readText());val summary=root.optJSONObject("summary");val contextJson=root.optJSONObject("context");val samples=root.optJSONArray("samples");var lat:Double?=null;var lon:Double?=null;if(samples!=null)for(i in 0 until samples.length()){val s=samples.optJSONObject(i)?:continue;if(s.has("latitude")&&s.has("longitude")){lat=s.optDouble("latitude");lon=s.optDouble("longitude");break}};AndroidRideEntry(file,contextJson?.optString("rideName")?.takeIf{it.isNotBlank()}?:contextJson?.optString("parkName")?.takeIf{it.isNotBlank()}?:file.nameWithoutExtension,summary?.optDouble("distanceMeters")?:0.0,summary?.optDouble("durationSeconds")?:0.0,lat,lon)}.getOrNull()}.sortedByDescending{it.file.lastModified()}.toList()

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun FunctionalRideTrackerApp(activity:Activity){
    val context=activity.applicationContext
    val recorder=remember{AndroidSensorRecorder(context)}
    val videoRecorder=remember{AndroidVideoRecorder(context,activity as androidx.activity.ComponentActivity)}
    val heartRate=remember{AndroidHeartRateManager(context)}
    val profiles=remember{LocalProfileStore(context)}
    val devices=remember{AndroidDeviceRegistry(context)}
    var section by remember{mutableStateOf(FunctionalSection.HOME)}
    var menuOpen by remember{mutableStateOf(false)}
    var pendingVideo by remember{mutableStateOf(false)}
    LaunchedEffect(Unit){videoRecorder.configure()}
    LaunchedEffect(heartRate.latestHeartRate,heartRate.deviceName){recorder.setHeartRate(heartRate.latestHeartRate,heartRate.deviceName)}
    val permissions=buildList{add(Manifest.permission.ACCESS_FINE_LOCATION);add(Manifest.permission.ACCESS_COARSE_LOCATION);add(Manifest.permission.CAMERA);add(Manifest.permission.RECORD_AUDIO);if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.S){add(Manifest.permission.BLUETOOTH_SCAN);add(Manifest.permission.BLUETOOTH_CONNECT)}}.toTypedArray()
    val permissionLauncher=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){result->val locationGranted=result[Manifest.permission.ACCESS_FINE_LOCATION]==true||result[Manifest.permission.ACCESS_COARSE_LOCATION]==true;if(locationGranted&&recorder.calibrateNow()){recorder.start();if(pendingVideo)videoRecorder.start(recorder.sessionId,recorder.recordingStartNs)}}
    val navigate:(FunctionalSection)->Unit={section=it;menuOpen=false}
    Scaffold(contentWindowInsets=WindowInsets.safeDrawing,topBar={TopAppBar(title={Column{Text("RideTracker");Text(profiles.activeProfile.name,style=MaterialTheme.typography.labelSmall)}},navigationIcon={IconButton(onClick={menuOpen=true}){Text("☰")}})},bottomBar={Column{if(recorder.isRecording)Surface(color=MaterialTheme.colorScheme.errorContainer){Row(Modifier.fillMaxWidth().padding(12.dp),verticalAlignment=Alignment.CenterVertically){Text("● Aufnahme läuft",Modifier.weight(1f));Button(onClick={videoRecorder.stop();recorder.attachVideo(videoRecorder.lastVideoFile?.name,videoRecorder.startOffsetSeconds);recorder.stop()}){Text("Stoppen")}}};NavigationBar{listOf(FunctionalSection.HOME to "Start",FunctionalSection.RECORD to "Aufzeichnen",FunctionalSection.DEVICES to "Geräte",FunctionalSection.RIDES to "Fahrten",FunctionalSection.SETTINGS to "Einstellungen").forEach{(target,label)->NavigationBarItem(section==target,{section=target},{Text(label.take(1))},label={Text(label)})}}}}){padding->when(section){
        FunctionalSection.HOME->AndroidDashboard(Modifier.padding(padding),profiles.activeProfile.name,navigate)
        FunctionalSection.RECORD->AndroidRecording(Modifier.padding(padding),recorder,videoRecorder){withVideo->pendingVideo=withVideo;permissionLauncher.launch(permissions)}
        FunctionalSection.RIDES->AndroidRideLibrary(Modifier.padding(padding),context)
        FunctionalSection.MAP->AndroidRideMapList(Modifier.padding(padding),context)
        FunctionalSection.DEVICES->AndroidDeviceCenter(Modifier.padding(padding),devices)
        FunctionalSection.SETTINGS->AndroidSettings(Modifier.padding(padding),recorder,heartRate,{navigate(FunctionalSection.HUD)},{navigate(FunctionalSection.DEVICES)})
        FunctionalSection.HUD->AndroidHudFullscreenEditor(Modifier.padding(padding))
        FunctionalSection.STATISTICS->StatisticsScreen(Modifier.padding(padding))
        FunctionalSection.ACHIEVEMENTS->AchievementsScreen(Modifier.padding(padding))
        FunctionalSection.MEDIA->RideMediaScreen(Modifier.padding(padding),profiles)
    }}
    if(menuOpen)ModalBottomSheet(onDismissRequest={menuOpen=false}){Column(Modifier.fillMaxWidth().padding(16.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){Text("Hauptmenü",style=MaterialTheme.typography.headlineSmall);FunctionalSection.entries.forEach{target->TextButton(onClick={navigate(target)},modifier=Modifier.fillMaxWidth()){Text(target.displayName(),modifier=Modifier.fillMaxWidth())}}}}
}
private fun FunctionalSection.displayName()=when(this){FunctionalSection.HOME->"Start";FunctionalSection.RECORD->"Neue Fahrt";FunctionalSection.RIDES->"Meine Fahrten";FunctionalSection.MAP->"Parks & Strecken";FunctionalSection.DEVICES->"Geräte & Sensoren";FunctionalSection.SETTINGS->"Einstellungen";FunctionalSection.HUD->"HUD-Konfiguration";FunctionalSection.STATISTICS->"Statistiken";FunctionalSection.ACHIEVEMENTS->"Achievements";FunctionalSection.MEDIA->"Bilder & Bewertungen"}

@Composable private fun AndroidDashboard(modifier:Modifier,profile:String,select:(FunctionalSection)->Unit){Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){Text("Übersicht",style=MaterialTheme.typography.headlineLarge);Text("Angemeldet: $profile");DashboardCard("Neue Fahrt","Video und Telemetrie aufzeichnen"){select(FunctionalSection.RECORD)};DashboardCard("Meine Fahrten","Gespeicherte RidePackages öffnen"){select(FunctionalSection.RIDES)};DashboardCard("Parks & Strecken","GPS-Fahrten und Startpositionen"){select(FunctionalSection.MAP)};DashboardCard("Geräte & Sensoren","Interne und externe Quellen konfigurieren"){select(FunctionalSection.DEVICES)};DashboardCard("Einstellungen","Kalibrierung, Sensoren und Berechtigungen"){select(FunctionalSection.SETTINGS)};DashboardCard("HUD-Konfiguration","Vollbild-Editor für Hoch- und Querformat"){select(FunctionalSection.HUD)};DashboardCard("Statistiken","Kilometer, Fahrzeit und Rekorde"){select(FunctionalSection.STATISTICS)};DashboardCard("Achievements","Persönliche Meilensteine"){select(FunctionalSection.ACHIEVEMENTS)};DashboardCard("Bilder & Bewertungen","Bahnbilder und Sterne"){select(FunctionalSection.MEDIA)}}}
@Composable private fun DashboardCard(title:String,subtitle:String,click:()->Unit){Card(onClick=click,modifier=Modifier.fillMaxWidth()){Column(Modifier.padding(16.dp)){Text(title,style=MaterialTheme.typography.titleMedium);Text(subtitle,style=MaterialTheme.typography.bodySmall)}}}
@Composable private fun AndroidRecording(modifier:Modifier,recorder:AndroidSensorRecorder,video:AndroidVideoRecorder,start:(Boolean)->Unit){var dialog by remember{mutableStateOf(false)};if(dialog)AlertDialog(onDismissRequest={dialog=false},title={Text("Video mit aufzeichnen?")},confirmButton={TextButton(onClick={dialog=false;start(true)}){Text("Mit Video")}},dismissButton={Row{TextButton(onClick={dialog=false;start(false)}){Text("Ohne Video")};TextButton(onClick={dialog=false}){Text("Abbrechen")}}});Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){Text("Neue Fahrt",style=MaterialTheme.typography.headlineMedium);Surface(color=MaterialTheme.colorScheme.surfaceVariant,shape=MaterialTheme.shapes.large){Box(Modifier.fillMaxWidth().aspectRatio(16/9f),contentAlignment=Alignment.Center){Text("Kamera: ${video.status}")}};Text("Status: ${recorder.status}");Text("Tempo: ${"%.1f".format(recorder.speedKmh)} km/h · Höhe: ${"%.1f".format(recorder.relativeAltitudeM)} m");if(!recorder.isRecording)Button(onClick={dialog=true},modifier=Modifier.fillMaxWidth()){Text("Kalibrieren & Fahrt starten")};Button(enabled=!recorder.isRecording&&recorder.sampleCount>0,onClick={recorder.attachVideo(video.lastVideoFile?.name,video.startOffsetSeconds);recorder.saveSession()},modifier=Modifier.fillMaxWidth()){Text("RidePackage speichern")}}}
@Composable private fun AndroidRideLibrary(modifier:Modifier,context:Context){var rides by remember{mutableStateOf(loadRides(context))};Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){Row(verticalAlignment=Alignment.CenterVertically){Text("Meine Fahrten",style=MaterialTheme.typography.headlineMedium,modifier=Modifier.weight(1f));TextButton(onClick={rides=loadRides(context)}){Text("Neu laden")}};if(rides.isEmpty())Text("Noch keine lokalen RidePackages vorhanden.");rides.forEach{ride->Card(Modifier.fillMaxWidth()){Column(Modifier.padding(14.dp)){Text(ride.title,style=MaterialTheme.typography.titleMedium);Text("${"%.2f".format(ride.distanceMeters/1000)} km · ${"%.0f".format(ride.durationSeconds)} s");Text(ride.file.name,style=MaterialTheme.typography.labelSmall)}}}}}
@Composable private fun AndroidRideMapList(modifier:Modifier,context:Context){val rides=remember{loadRides(context).filter{it.latitude!=null&&it.longitude!=null}};Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){Text("Parks & Strecken",style=MaterialTheme.typography.headlineMedium);if(rides.isEmpty())Text("Noch keine Fahrten mit GPS-Daten vorhanden.");rides.forEach{ride->Card(Modifier.fillMaxWidth()){Column(Modifier.padding(14.dp)){Text(ride.title,style=MaterialTheme.typography.titleMedium);Text("${"%.5f".format(ride.latitude)}, ${"%.5f".format(ride.longitude)}");Text("${"%.2f".format(ride.distanceMeters/1000)} km")}}}}}
@Composable private fun AndroidSettings(modifier:Modifier,recorder:AndroidSensorRecorder,heartRate:AndroidHeartRateManager,openHud:()->Unit,openDevices:()->Unit){Column(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(18.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){Text("Einstellungen",style=MaterialTheme.typography.headlineMedium);Card{Column(Modifier.padding(14.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){Text("Aufnahme & Kalibrierung",style=MaterialTheme.typography.titleMedium);Text("Fahrtrichtung: ${recorder.forwardEdge.title}");Button(onClick={val all=de.ridetracker.engine.ForwardEdge.entries;recorder.forwardEdge=all[(recorder.forwardEdge.ordinal+1)%all.size]}){Text("Fahrtrichtung wechseln")}}};Card{Column(Modifier.padding(14.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){Text("BLE Herzfrequenz",style=MaterialTheme.typography.titleMedium);Text(heartRate.status);Row{Button(onClick=heartRate::scan){Text("Suchen")};Spacer(Modifier.width(8.dp));Button(onClick=heartRate::connect){Text("Verbinden")}}}};Button(onClick=openDevices,modifier=Modifier.fillMaxWidth()){Text("Geräte & Sensoren konfigurieren")};Button(onClick=openHud,modifier=Modifier.fillMaxWidth()){Text("HUD-Konfiguration öffnen")}}}
