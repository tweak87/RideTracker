import fs from 'node:fs';

const required = [
  'update28.js','update29.js','update36.js','update37.js','update46.js','update47.js','update49.js','update50.js','update51.js','update52.js',
  'core/adapters/web-plugin-runtimes.mjs','core/adapters/web-plugin-ui.mjs','shared/core/plugin-diagnostics.json','shared/core/plugin-capabilities.schema.json'
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing frontend artifact: ${file}`);
const text = file => fs.readFileSync(file,'utf8');
const u28=text('update28.js'),u29=text('update29.js'),u36=text('update36.js'),u47=text('update47.js'),u49=text('update49.js'),u50=text('update50.js'),u51=text('update51.js'),u52=text('update52.js'),plugins=text('core/adapters/web-plugin-runtimes.mjs'),pluginUi=text('core/adapters/web-plugin-ui.mjs'),capabilities=text('shared/core/plugin-capabilities.schema.json');
const need=(src,token,msg)=>{if(!src.includes(token))throw new Error(msg)};

for (const token of ['landscape','portrait','rtHudMode','RideTrackerStandaloneHudEditor']) need(u28,token,`HUD editor missing ${token}`);
for (const token of ['profiles?.[mode]','portrait','landscape','overlayEnabled','recordingActive']) need(u29,token,`HUD renderer missing state/orientation support: ${token}`);
need(u29,'#hud,#rtSharedOverlay{display:none!important}','Legacy HUD must stay disabled');
for (const token of ['RideTrackerNavigationRegistry','RideTrackerDialogManager','RideTrackerOverlayManager','RideTrackerOrientationManager','rtHudClosePortal','data-registry-route','requestAnimationFrame']) need(u49,token,`Frontend manager missing ${token}`);
for (const route of ['Startseite','Neue Fahrt','Meine Fahrten','Karte','Statistiken','Achievements','Profil','HUD-Konfiguration','Geräte & Sensoren','Import & Replay','Einstellungen']) need(u49,route,`Navigation registry missing route: ${route}`);
need(u49,"route !== 'record'",'Overlay manager must clear replay outside recording route');
need(u49,'RideTrackerHudReplay?.detach','Route cleanup must detach replay HUD');
need(u47,'showMap','Canonical map view must remain available');
need(pluginUi,'RideTrackerSensorDiagnostics','Plugin sensor diagnostics must be loaded in production');
need(pluginUi,'RideTrackerRenderedExport','Rendered telemetry video export must remain available');

for (const token of ['fitHudStage','availableW','availableH','16 / 9','9 / 16','RideTrackerHudStageFit','visualViewport']) need(u50,token,`HUD viewport containment missing ${token}`);
for (const token of ['devicemotion','ridetracker:plugin-telemetry','watchPosition','RideTrackerLiveSensorDiagnostics']) need(u50,token,`True live sensor diagnostics missing ${token}`);
for (const token of ['rt-camera-diagnostic','previewStream','ensurePreview','RideTrackerCameraDiagnostics','Livebild aktivieren']) need(u50,token,`Camera live diagnostic missing ${token}`);
if (u50.includes('e.currentTarget.textContent=ok')) throw new Error('Async motion handler must not dereference event.currentTarget after await.');

for (const token of ['height:auto!important','position:absolute!important','translate(-50%,-50%)','RideTrackerHudPortraitFit']) need(u52,token,`Portrait HUD geometry fix missing ${token}`);
for (const token of ['#flip','Frontkamera verwenden','Rückkamera verwenden','Kamerawechsel während einer laufenden Aufnahme']) need(u52,token,`Camera switch guard missing ${token}`);
for (const token of ['facingMode','syncFromStream','!video.deviceId&&!video.facingMode']) need(u36,token,`Camera source manager must respect explicit facing mode: ${token}`);

for (const token of ['RideTrackerExternalSensorConnections','Suchen & verbinden','ble-heart-rate','external-imu','navigator.bluetooth']) need(u51,token,`External sensor connection dialog missing ${token}`);
for (const token of ['HEART_RATE_SERVICE','RIDE_SERVICE','scanAndConnect','connectHeartRate','connectAccessory','ridetracker:plugin-connection']) need(plugins,token,`Plugin connection runtime missing ${token}`);
for (const token of ['device.discovery','device.connection']) need(capabilities,token,`Capability schema missing ${token}`);

if (fs.existsSync('index.html')) {
  const html=text('index.html');
  const built=html.includes('update49.js?v=');
  if (built) {
    for (const token of ['update49.js?v=','update50.js?v=','update51.js?v=','update52.js?v=','core/adapters/web-plugin-ui.mjs?v=']) need(html,token,`Built page missing ${token}`);
    const p47=html.indexOf('update47.js?v='),p49=html.indexOf('update49.js?v='),pui=html.indexOf('core/adapters/web-plugin-ui.mjs?v='),p50=html.indexOf('update50.js?v='),p51=html.indexOf('update51.js?v='),p52=html.indexOf('update52.js?v=');
    if (!(p47>=0 && p49>p47 && pui>p49 && p50>pui && p51>p50 && p52>p51)) throw new Error('Frontend boot order must be routes -> managers -> plugin UI -> diagnostics -> connections -> final geometry');
  }
}
console.log('Frontend manager audit passed.');
