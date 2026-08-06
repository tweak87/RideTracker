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
