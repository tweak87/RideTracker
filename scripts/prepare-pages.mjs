import fs from 'node:fs';

const path = 'index.html';
let html = fs.readFileSync(path, 'utf8');

const legacyHudStart = '<div class="hud" id="hud">';
const legacyHudEnd = '</div></div><input id="scrub"';
const start = html.indexOf(legacyHudStart);
const end = html.indexOf(legacyHudEnd, start);

if (start < 0 || end < 0) {
  throw new Error('Legacy-HUD in index.html konnte nicht eindeutig gefunden werden.');
}

const telemetryBridge = `<div id="rtLegacyTelemetryBridge" hidden aria-hidden="true">
  <div id="hud">
    <div id="moduleMain"><span id="hudNormal">–</span><span id="hudPhase">Bereit</span></div>
    <div id="moduleBars"><i id="barLat"></i><span id="hudLat">–</span><i id="barLong"></i><span id="hudLong">0</span></div>
    <div id="moduleStats"><span id="hudAvg">–</span><span id="hudMax">–</span><span id="hudSpeed">–</span><span id="hudTime">00:00</span></div>
    <canvas id="hudTrace" width="900" height="70"></canvas>
  </div>
</div>`;

html = html.slice(0, start) + telemetryBridge + '</div><input id="scrub"' + html.slice(end + legacyHudEnd.length);

html = html
  .replace('<button id="hudMode">Modus: Telemetrie</button>', '<button id="hudMode" hidden aria-hidden="true">Legacy HUD mode</button>')
  .replace(/<button id="hudSize">HUD:[^<]*<\/button>/, '<button id="hudSize" hidden aria-hidden="true">Legacy HUD size</button>')
  .replace('<div class="configGrid">', '<div class="configGrid" hidden aria-hidden="true">')
  .replace('</head>', `<style id="rtCanonicalHudOnly">
#rtLegacyTelemetryBridge,#hudMode,#hudSize,.configGrid{display:none!important}
#rtConfiguredLiveHud{display:block!important;visibility:visible!important}
</style></head>`);

const inlineShell = String.raw`
<style id="rtInlineShellStyle">
  body{padding-top:calc(max(env(safe-area-inset-top),12px) + 58px)!important}
  #rtInlineBar{position:fixed;top:0;left:0;right:0;z-index:2490000;height:calc(max(env(safe-area-inset-top),12px) + 58px);padding:max(env(safe-area-inset-top),12px) 12px 8px;display:grid;grid-template-columns:46px minmax(0,1fr) auto;align-items:center;gap:10px;background:rgba(6,15,27,.98);border-bottom:1px solid #29435f;color:#f5fbff}
  #rtInlineBar button{height:42px;min-width:44px;border:1px solid #31536b;border-radius:13px;background:#102436;color:#fff;font-weight:800;padding:0 11px}#rtInlineTitle{min-width:0}#rtInlineTitle strong{display:block;font-size:18px}#rtInlineTitle small{display:block;color:#96aac1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #rtInlineDashboard{position:fixed;inset:0;z-index:2480000;background:radial-gradient(circle at 50% -10%,#1a4168,#07111f 48%);overflow:auto;padding:calc(max(env(safe-area-inset-top),12px) + 86px) 16px calc(30px + env(safe-area-inset-bottom));color:#f5f8fc}
  #rtInlineDashboard[hidden]{display:none!important}.rt-inline-inner{max-width:780px;margin:auto}.rt-inline-hero{margin:18px 0 24px}.rt-inline-hero h2{font-size:clamp(38px,10vw,64px);line-height:1.02;letter-spacing:-.05em;margin:0}.rt-inline-hero p{color:#96aac1;font-size:16px;line-height:1.5}.rt-inline-menu{display:grid;gap:12px}.rt-inline-action{display:grid;grid-template-columns:42px 1fr;gap:14px;align-items:center;text-align:left;width:100%;padding:18px;border:1px solid #29435f;border-radius:18px;background:linear-gradient(180deg,#17304d,#10233a);color:#f5fbff}.rt-inline-action i{font-style:normal;font-size:26px}.rt-inline-action strong{display:block;font-size:18px}.rt-inline-action small{display:block;color:#96aac1;margin-top:4px;font-weight:500}
  #rtInlineScrim{position:fixed;inset:0;z-index:2490010;background:rgba(0,0,0,.58);display:none}#rtInlineScrim.open{display:block}#rtInlineDrawer{position:fixed;z-index:2490020;left:10px;top:calc(max(env(safe-area-inset-top),12px) + 63px);bottom:max(env(safe-area-inset-bottom),12px);width:min(360px,calc(100vw - 20px));padding:14px;border:1px solid #29435f;border-radius:20px;background:#091626;overflow:auto;transform:translateX(calc(-100% - 28px));transition:transform .2s ease}#rtInlineDrawer.open{transform:translateX(0)}#rtInlineDrawer h2{margin:2px 4px 12px}.rt-inline-nav{display:grid;gap:8px}.rt-inline-nav button{width:100%;padding:12px;text-align:left;border:1px solid #29435f;border-radius:14px;background:#102436;color:#fff;font-weight:750}
</style>
<script>
(function(){
  'use strict';
  if(document.getElementById('rtInlineBar')) return;
  var items=[['Neue Fahrt','🎢'],['Meine Fahrten','📁'],['Karte','🗺️'],['Statistiken','📈'],['Achievements','🏆'],['Profil','👤'],['HUD-Konfiguration','▣'],['Geräte & Sensoren','⌁'],['Import & Replay','⇩'],['Einstellungen','⚙️']];
  var bar=document.createElement('header');bar.id='rtInlineBar';bar.innerHTML='<button id="rtInlineMenu" type="button">☰</button><div id="rtInlineTitle"><strong>RideTracker</strong><small>Fahrten · Telemetrie · Community</small></div><button id="rtInlineProfile" type="button">👤</button>';
  var dash=document.createElement('section');dash.id='rtInlineDashboard';dash.innerHTML='<div class="rt-inline-inner"><div class="rt-inline-hero"><div class="label">RideTracker Community</div><h2>Deine Fahrt.<br>Unsere Strecke.</h2><p>Fahrten aufzeichnen, auswerten und aus mehreren Messungen präzisere Achterbahn-Modelle aufbauen.</p></div><div class="rt-inline-menu"><button class="rt-inline-action" data-inline-route="Neue Fahrt"><i>🎢</i><span><strong>Neue Fahrt</strong><small>Kalibrierung, Kamera und Sensoren gemeinsam starten</small></span></button><button class="rt-inline-action" data-inline-route="Meine Fahrten"><i>📁</i><span><strong>Meine Fahrten</strong><small>Gespeicherte Fahrten ansehen und bearbeiten</small></span></button><button class="rt-inline-action" data-inline-route="Karte"><i>🗺️</i><span><strong>Karte</strong><small>Parks, Bahnen und aufgezeichnete Strecken</small></span></button><button class="rt-inline-action" data-inline-route="Einstellungen"><i>⚙️</i><span><strong>Einstellungen</strong><small>Aufnahme, HUD, Sensoren, Profile und Importe</small></span></button></div></div>';
  var scrim=document.createElement('div');scrim.id='rtInlineScrim';var drawer=document.createElement('nav');drawer.id='rtInlineDrawer';drawer.innerHTML='<h2>Hauptmenü</h2><div class="rt-inline-nav"><button data-inline-route="Startseite">⌂ Startseite</button>'+items.map(function(x){return '<button data-inline-route="'+x[0]+'">'+x[1]+' '+x[0]+'</button>';}).join('')+'</div>';
  document.body.appendChild(bar);document.body.appendChild(dash);document.body.appendChild(scrim);document.body.appendChild(drawer);
  function close(){drawer.classList.remove('open');scrim.classList.remove('open');}
  function home(){close();dash.hidden=false;window.scrollTo(0,0);}
  function record(){close();dash.hidden=true;window.scrollTo(0,0);setTimeout(function(){var el=document.querySelector('.controls');if(el)el.scrollIntoView({block:'start'});},0);}
  function route(name){close();if(name==='Startseite')return home();if(name==='Neue Fahrt')return record();dash.hidden=true;setTimeout(function(){
    if(name==='Meine Fahrten'){if(window.RideTrackerRideLibrary&&window.RideTrackerRideLibrary.show)return window.RideTrackerRideLibrary.show();if(window.RideTrackerTools&&window.RideTrackerTools.showRides)return window.RideTrackerTools.showRides();}
    if(name==='Karte'){var b=document.querySelector('#rideDashboard [data-view="map"]');if(b)return b.click();var m=document.getElementById('parkMapCard');if(m)return m.scrollIntoView({block:'start'});}
    if(name==='Statistiken'&&window.RideTrackerStats)return window.RideTrackerStats.showStats&&window.RideTrackerStats.showStats();
    if(name==='Achievements'&&window.RideTrackerStats)return window.RideTrackerStats.showAchievements&&window.RideTrackerStats.showAchievements();
    if(name==='Profil'&&window.RideTrackerProfiles)return window.RideTrackerProfiles.showProfiles&&window.RideTrackerProfiles.showProfiles();
    if(name==='HUD-Konfiguration'&&window.RideTrackerStandaloneHudEditor)return window.RideTrackerStandaloneHudEditor.open&&window.RideTrackerStandaloneHudEditor.open();
    if(name==='Geräte & Sensoren'&&window.RideTrackerDeviceCenter)return window.RideTrackerDeviceCenter.open&&window.RideTrackerDeviceCenter.open();
    if(name==='Import & Replay'&&window.RideTrackerTools)return window.RideTrackerTools.showImports&&window.RideTrackerTools.showImports();
    if(name==='Einstellungen'&&window.RideTrackerSettings)return window.RideTrackerSettings.show&&window.RideTrackerSettings.show();
    dash.hidden=false;
  },0);}
  bar.querySelector('#rtInlineMenu').onclick=function(){drawer.classList.toggle('open');scrim.classList.toggle('open');};bar.querySelector('#rtInlineProfile').onclick=function(){route('Profil');};scrim.onclick=close;drawer.addEventListener('click',function(e){var b=e.target.closest('[data-inline-route]');if(b)route(b.getAttribute('data-inline-route'));});dash.addEventListener('click',function(e){var b=e.target.closest('[data-inline-route]');if(b)route(b.getAttribute('data-inline-route'));});
  window.RideTrackerInlineShell={home:home,route:route};
})();
</script>`;

if (!html.includes('id="rtInlineBar"')) {
  html = html.replace('</body>', inlineShell + '</body>');
}

const forbiddenVisibleFragments = [
  'Modus: Telemetrie',
  'HUD: Klein',
  'HUD: Mittel',
  'HUD: Groß',
  'HUD verschieben',
  'Positionen zurücksetzen'
];
for (const fragment of forbiddenVisibleFragments) {
  if (html.includes(`>${fragment}<`)) {
    throw new Error(`Veraltetes sichtbares HUD-Element verblieben: ${fragment}`);
  }
}

fs.writeFileSync(path, html);
