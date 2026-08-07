import fs from 'node:fs';

const required = [
  'update28.js','update29.js','update37.js','update46.js','update47.js','update49.js','update50.js','update51.js',
  'core/adapters/web-plugin-ui.mjs','shared/core/plugin-diagnostics.json'
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing frontend artifact: ${file}`);
const text = file => fs.readFileSync(file,'utf8');
const u28=text('update28.js'),u29=text('update29.js'),u47=text('update47.js'),u49=text('update49.js'),u50=text('update50.js'),u51=text('update51.js'),pluginUi=text('core/adapters/web-plugin-ui.mjs');
const need=(src,token,msg)=>{if(!src.includes(token))throw new Error(msg)};

for (const token of ['landscape','portrait','rtHudMode','RideTrackerStandaloneHudEditor']) need(u28,token,`HUD editor missing ${token}`);
for (const token of ['profiles?.[mode]','portrait','landscape']) need(u29,token,`HUD renderer missing orientation profile support: ${token}`);
for (const token of ['RideTrackerNavigationRegistry','RideTrackerDialogManager','RideTrackerOverlayManager','RideTrackerOrientationManager','rtHudClosePortal','data-registry-route','requestAnimationFrame']) need(u49,token,`Frontend manager missing ${token}`);
for (const route of ['Startseite','Neue Fahrt','Meine Fahrten','Karte','Statistiken','Achievements','Profil','HUD-Konfiguration','Geräte & Sensoren','Import & Replay','Einstellungen']) need(u49,route,`Navigation registry missing route: ${route}`);
need(u49,"route !== 'record'",'Overlay manager must clear replay outside recording route');
need(u49,'RideTrackerHudReplay?.detach','Route cleanup must detach replay HUD');
need(u49,'orientationchange','HUD orientation manager must react to device rotation');
need(u49,'screen.orientation','HUD orientation manager must consult screen orientation');
need(u47,'showMap','Canonical map view must remain available');
need(pluginUi,'RideTrackerSensorDiagnostics','Plugin sensor diagnostics must be loaded in production');
need(pluginUi,'RideTrackerRenderedExport','Rendered telemetry video export must remain available');

for (const token of ['fitHudStage','availableW','availableH','16 / 9','9 / 16','RideTrackerHudStageFit']) need(u50,token,`HUD contain fix missing ${token}`);
for (const token of ['devicemotion','ridetracker:plugin-telemetry','ridetracker:routed-telemetry','watchPosition','RideTrackerLiveSensorDiagnostics']) need(u50,token,`True live sensor diagnostics missing ${token}`);
for (const token of ['wrapMethod','RideTrackerRideLibrary','RideTrackerStats','RideTrackerProfiles','RideTrackerSettings','RideTrackerDeviceCenter','RideTrackerCanonicalRoutes']) need(u50,token,`Canonical route adapter missing ${token}`);
if (u50.includes("readNumber('latVal'")) throw new Error('Live sensor diagnostics must not depend on polled HUD text values.');

for (const token of ['visualViewport','fitHudStage51','maxByViewportW','maxByViewportH','9 / 16','16 / 9']) need(u51,token,`Safari HUD viewport containment missing ${token}`);
for (const token of ['data-motion-live','stopImmediatePropagation','Berechtigung wird geprüft','button.isConnected']) need(u51,token,`Async motion permission guard missing ${token}`);
for (const token of ['rt-camera-diagnostic','previewStream','ensurePreview','RideTrackerCameraDiagnostics','Livebild aktivieren']) need(u51,token,`Camera live diagnostic missing ${token}`);
if (u51.includes('e.currentTarget.textContent=ok')) throw new Error('Async motion handler must not dereference event.currentTarget after await.');

if (fs.existsSync('index.html')) {
  const html=text('index.html');
  const built=html.includes('update49.js?v=');
  if (built) {
    need(html,'update49.js?v=','Built page must load frontend managers');
    need(html,'update50.js?v=','Built page must load final frontend fixes');
    need(html,'update51.js?v=','Built page must load HUD/camera correction layer');
    need(html,'core/adapters/web-plugin-ui.mjs?v=','Built page must load plugin UI diagnostics/export');
    const p47=html.indexOf('update47.js?v='),p49=html.indexOf('update49.js?v='),pui=html.indexOf('core/adapters/web-plugin-ui.mjs?v='),p50=html.indexOf('update50.js?v='),p51=html.indexOf('update51.js?v=');
    if (!(p47>=0 && p49>p47 && pui>p49 && p50>pui && p51>p50)) throw new Error('Frontend boot order must be canonical routes -> frontend managers -> plugin UI -> live fixes -> HUD/camera fixes');
  }
}
console.log('Frontend manager audit passed.');