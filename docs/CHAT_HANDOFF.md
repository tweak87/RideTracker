# RideTracker – Chat-Handoff / aktueller Entwicklungsstand

Stand: 2026-08-08

Dieses Dokument ist die verbindliche Übergabe für einen neuen Chat. Vor Änderungen zuerst `main`, die letzten Actions und dieses Dokument lesen. Danach nur auf Basis des tatsächlichen Repository-Stands weiterarbeiten.

Aktuelle Zielversion: `2026.08.08-video-gforce-trails.4`. Der vorherige stabile Produktionsstand ist am Commit `5a4f178947b144694543161e1f8a459ab19a07b5` und Branch `rollback/pre-park-map-weather-20260808` dokumentiert. Neu sind der aus dem ursprünglichen Fingertipp gestartete iOS-Berechtigungsablauf, App-Vollbild bereits während der Aufnahmevorbereitung, ein garantiert sichtbares konfiguriertes HUD, ausschließlich nachgelagerte Park-/Attraktionsermittlung und die zweigeteilte G-Ball-/Vertikallastanzeige mit ausblendendem Verlaufsschweif. Die bisherigen Funktionen wie Parkkarte, Wetter, lizenzierte Thumbnails, ICE-GPS-Zeitbasis, Kalibrierungs-Lageprüfung, Fire-OS-8-Testbuild und Supabase-Datenschutzfunktionen bleiben erhalten.

## 1. Produktziel

RideTracker ist eine plattformübergreifende Telemetrie-/Community-App für Achterbahnen und Fahrgeschäfte mit Web/PWA, nativer iOS-App und nativer Android-App.

Kernziele:

- Fahrten mit Video + Sensoren aufzeichnen.
- Smartphone- und externe Sensoren kombinieren.
- Sensorquellen pro Metrik priorisieren/fallbacken.
- HUD im Livebild und im Replay zeitlich synchron anzeigen.
- Videos mit eingebettetem HUD/Sensordaten exportieren.
- Fahrten bewusst speichern und später bearbeiten, nicht nach jedem Edit einen neuen Datensatz erzeugen.
- Fahrten nach Park/Achterbahn bündeln und mehrere Fahrten derselben Bahn vergleichen.
- GPS → Park → Bahn → Referenzdaten → Confidence → Vergleich.
- Community-Daten und wiederholte Fahrten langfristig für bessere Streckenmodelle verwenden.

## 2. Wichtige UX-Regeln

- `Neue Fahrt` startet direkt die Aufnahmevorbereitung; keine zweite Zwischenmaske `Neue Fahrt`.
- Hauptmenü/Drawer/Schnellnavigation sollen dieselben Routen verwenden.
- Jede Detailansicht muss zurück zur Hauptnavigation können.
- `Meine Fahrten` ist eine reine Bibliothek/Analyse, kein neuer Aufnahme-Start innerhalb der Detailseite.
- Bibliothek: Parks → Achterbahnen → einzelne Aufnahmen → Fahrtdetails.
- Mehrere Aufnahmen derselben Bahn werden gruppiert und mit Unterschieden angezeigt.
- Nach Aufnahmeende ersetzt die Videoaufnahme das Livebild im selben Fenster.
- Neue Aufnahme bei ungespeichertem Video nur nach expliziter Bestätigung zum Ersetzen.
- Aufnahme-Vollbild kann verlassen werden, ohne die Aufnahme zu stoppen.
- Während REC: sichtbarer REC-Timer + Stop; Vorschau/REC-Badges dürfen niemals auf fremden Menüebenen schweben.
- HUD-Konfiguration ist getrennt vom Aufnahmebild; Portrait 9:16 und Landscape 16:9 werden separat gespeichert.
- Parkkarte und Attraktionskandidaten dürfen nie den Aufnahmebeginn verzögern und erscheinen ausschließlich nach `ridetracker:recording-stopped` im Dialog `Fahrt fertigstellen`.

## 3. HUD-System – verbindlicher Zustand

Historische HUD-Systeme wurden bereinigt. Zielzustand:

- `update28.js`: einziger Standalone HUD-Editor.
- `update29.js`: konfigurierbarer Live-/Replay-HUD-Renderer.
- `shared/overlay/g-force-visualizer.js`: gemeinsames Modell und Canvas-Rendering für horizontalen G-Ball, Vertikallast und zeitlich ausblendenden Schweif.
- Alte Basis-HUD-/Toolbar-Systeme dürfen nicht wieder aktiviert werden.

Achsen nach Kalibrierung:

- X = lateral, rechts positiv.
- Y = longitudinal, vorwärts positiv.
- Z = vertikal, oben positiv.
- Ruhendes Telefon nach Kalibrierung: vertikal ungefähr +1 G.

Replay-HUD muss aus `video.currentTime` und gespeicherten Telemetrie-Timestamps lesen, nicht aus Live-DOM-Werten.

Die G-Kraft-Anzeige besteht aus zwei gekoppelten Punkten: Draufsicht für lateral/longitudinal und Vertikallast für normal G. Beide zeigen ungefähr die letzten drei Sekunden als ausblendenden Schweif. Bei einem Rückwärtssprung der Replay-Zeit muss die Historie geleert werden.

## 4. Aufnahme / Speicherung

### Ride-ID / Upsert

- `Neue Fahrt` → neue `rideId` erst beim bewussten Speichern.
- Bestehende Fahrt bearbeiten → dieselbe `rideId`.
- Titel, Park, Bahn, Bewertung, Notiz, Kommentar, Video etc. aktualisieren denselben Datensatz.
- `createdAt` bleibt, `updatedAt` wird fortgeschrieben.

### Storage

Zentraler Web-Storage: `RideTrackerDatabase` in `core/storage/web-database-service.js`.

Stores:

- `videos`
- `ridePackages`
- `settings`
- `cache`

Aktive UI-Module dürfen keinen eigenen `indexedDB.open()`-/`transaction()`-Pfad mehr einführen.

Löschregeln:

- Video endgültig löschen → Video-Blob aus RideTracker-IndexedDB löschen, Telemetrie/Fahrt kann bestehen bleiben.
- Fahrt vollständig löschen → Metadaten + RidePackage + Video-Blob löschen.
- User-/Werksreset → gesamte lokale RideTracker-Datenbank + Konfiguration löschen.
- Bereits nach Safari `Dateien/Downloads` exportierte Dateien kann eine Website technisch nicht nachträglich löschen.

## 5. GPS – aktueller Stand

### Aktive Module

- `update54.js`: unabhängige GPS-Aufnahme, `watchPosition`, GPS-Punkte und Persistenz in RidePackages.
- `update58.js`: GPS-Härtung/Diagnose, Geschwindigkeitsableitung und RidePackage-Validierung.

Wichtiger Befund aus realem Test: iOS/Safari liefert `coords.speed` teilweise `null`/0 trotz Bewegung. Deshalb berechnet `update58.js` Geschwindigkeit robust:

1. native GPS-Geschwindigkeit verwenden, wenn plausibel,
2. sonst Distanz zwischen GPS-Fixes / Zeitdifferenz,
3. GPS-Genauigkeit als Rauschschwelle berücksichtigen,
4. Geschwindigkeit glätten,
5. als `ridetracker:internal-telemetry` in SourceRouter/HUD einspeisen,
6. nach dem Speichern GPS erneut in das RidePackage mergen und validieren.

`RideTrackerGpsHealth` liefert Diagnose: Punkte, Geschwindigkeit, Genauigkeit, Quelle, Fehler, persistierte Punkte, Validation.

Noch praktisch zu testen: neue Fahrt im Freien mit Standortfreigabe; prüfen, dass GPS-Diagnose Punkte zählt, Geschwindigkeit >0 liefert und gespeicherte Fahrt `document.gps.points` enthält.

## 6. Park-/Bahn-Erkennung

### Aktive Module

- `update54.js`: Reference Engine / OSM / ThemeParks.wiki / Wikidata / Länderpakete.
- `update55.js`: Confidence Engine.
- `update56.js`: Community-/Coaster-Referenzen und technische Vergleichswerte.
- `update57.js`: leichte Land→Park-Abfrage und Overpass-Fallbacks.

Provider-Strategie:

- OpenStreetMap/Overpass: Position, Parkgrenzen, Attraktionen, Streckengeometrie.
- ThemeParks.wiki: Park-/Attraktionsverzeichnis.
- Wikidata/Wikipedia: strukturierte Metadaten/technische Daten, wo verfügbar.
- Coasterpedia: coaster-spezifische Community-Referenzwerte (Quelle/Lizenz beachten).
- RideTracker Community: langfristig wichtigste Messdatenquelle.

RCDB/Coaster-Count nicht automatisiert scrapen, solange API-/Lizenzgrundlage nicht klar ist.

Fallback ohne GPS:

Land → Park → Attraktion → Referenzdaten → Vergleich.

Offline-Unterstützung:

- Normalbetrieb online.
- Land kann explizit als Offline-Paket gecacht werden.
- Parkauswahl darf NICHT den kompletten Länderdownload erzwingen.

Confidence soll verfügbare Evidenz gewichtet kombinieren, z. B. GPS-Nähe, Park-/Namensmatch, Attraktionsnähe, Geschwindigkeit, Dauer, Streckenlänge, Community-Match. Fehlende Evidenz nicht automatisch als Fehler werten.

## 7. Externe Sensoren / Plugin-Architektur

Gemeinsame Capabilities liegen in `core/builtin-plugins.mjs` und `shared/core/plugin-capabilities.schema.json`.

Wichtige Plugins:

- `internal-sensors`
- `ble-heart-rate`
- `external-imu`
- `external-gnss`
- `camera-source`
- `media-export`

Capabilities u. a.:

- motion.acceleration
- motion.gyroscope
- motion.orientation
- location.position
- location.speed
- location.altitude
- heart-rate.bpm
- camera.preview
- camera.recording
- device.discovery
- device.connection
- sensor.channels
- diagnostics.live
- hud.widget-source

### Sensor Channel Discovery

- `update59.js` beobachtet `ridetracker:plugin-telemetry`.
- Nach Verbindung werden tatsächlich verfügbare Kanäle erkannt: Metrik, Channel-ID, Unit, letzter Wert, min/max, Samplezahl, geschätzte SampleRate.
- Widget-Vorschläge werden aus dem Metriknamen abgeleitet.
- Ziel: verbundener Sensor → verfügbare Werte erkennen → sinnvolle HUD-Widgets automatisch vorschlagen; wenn nicht eindeutig, Nutzer konfiguriert Zuordnung.

### BLE

- Standard BLE Heart Rate für Brustgurt/Uhr im kompatiblen Broadcast-Modus.
- iPhone-Safari hat kein Web Bluetooth; native iOS-App nutzt BLE.
- iOS besitzt Sensor-Connection-Sheet: Sensortyp → suchen → Gerät auswählen → verbinden.
- Android/iOS sollen dieselben Plugin-Capabilities verwenden.

## 8. Kamera

- `update36.js`: Web CameraSourceManager.
- `camera-source` Plugin verwaltet Preview/Recording-State.
- Explizites `facingMode` muss Vorrang vor gespeicherter Device-ID haben, damit Front ↔ Rear funktioniert.
- Kamerawechsel während laufender MediaRecorder-Aufnahme bleibt gesperrt, sofern Track-Swap nicht sauber unterstützt wird.
- Sensor-Kameradiagnose soll echtes Livebild zeigen.
- Bloße Kamera-Initialisierung darf kein REC-/Sensor-HUD einblenden.

## 9. Diagnose / Safe Boot

Neu: `update60.js`.

Ziele:

- Runtime-Logs für Fehler, wichtige Events, Navigation, GPS, Plugins und Storage.
- Beim Reload stale Scrims/Dialoge/Overlays schließen, wenn keine Aufnahme läuft.
- Startseite/Home-Actions wieder freigeben.
- Diagnosebericht als JSON exportieren.
- Exakte GPS-Koordinaten standardmäßig NICHT im Diagnoseexport aufnehmen.

Aktivieren:

- URL mit `?diag=1`, oder
- später über `window.RideTrackerDiagnostics.enable()` / zukünftige Admin-Einstellung.

API:

- `RideTrackerDiagnostics.enable()`
- `RideTrackerDiagnostics.disable()`
- `RideTrackerDiagnostics.open()`
- `RideTrackerDiagnostics.export()`
- `RideTrackerDiagnostics.snapshot()`
- `RideTrackerDiagnostics.safeBoot()`

Zukünftige Admin-Erweiterung:

- geschützter Diagnose-/Admin-Modus mit PIN/Passwort,
- zusätzliche technische Daten nur im Adminmodus,
- niemals Security durch ein im Frontend hartcodiertes Passwort vortäuschen; echter privilegierter Adminzugriff benötigt serverseitige Authentifizierung. Für lokale Diagnose kann ein PIN nur UI-Schutz sein.

## 10. Historischer Web-Bug und heutige Absicherung

Der User meldete in einem früheren Stand:

> Seite neu geladen; Bild/Startseite hängt, Startseiten-Menüpunkte lassen sich nicht auswählen.

Die rekursive Fehlerbehandlung und blockierende Overlay-Zustände wurden danach abgesichert. Der automatische Aufnahme-Dialog liegt nun oberhalb der Bottom-Navigation und blendet die konkurrierenden manuellen Start-/Kalibrierungsaktionen im Aufnahmeweg aus. Regressionstests prüfen Klickbarkeit, Safe Boot, Runtime-Fehler-Deduplizierung und die neue Park-/Wetter-/FAQ-Oberfläche.

Letzter bekannter erfolgreicher Stand vor Diagnose-Härtung:

- Web Publish #454: success, Commit `ba791c7e48471eed42265d6afd762c3a81ba5a97`.
- Pages Deploy #179: success.
- Android Build #116: success (`055e2e98...`).
- iOS Build #100: success (`055e2e98...`).

Bei einem erneuten Auftreten zuerst den aktuellen Publish/Deploy prüfen und dann auf dem betroffenen iPhone testen, ob Startseiten-Buttons und Aufnahme-Dialog nach Reload reagieren.

Wenn weiterhin blockiert:

1. URL mit `?diag=1` öffnen.
2. `DIAG` → `Prüfen & UI freigeben`.
3. `Diagnose exportieren` und JSON im Chat bereitstellen.
4. In Logs besonders auf NavigationRegistry, sichtbare Scrims/Dialoge, RuntimeErrors und route achten.

## 11. G-Kraft / Sensor-Fusion – Kurzfassung

GPS berechnet NICHT die hochfrequenten G-Kräfte. GPS dient für Position, Geschwindigkeit, Richtung über längere Zeit, Park/Bahn und spätere Streckenrekonstruktion.

Primär für G-Kräfte:

- Beschleunigungssensor / Accelerometer: spezifische Beschleunigung.
- Gyroskop: Winkelgeschwindigkeit/Orientierungsänderung.
- Kalibrierung: Transformation Gerätekoordinaten → Fahrzeugkoordinaten.

Nach Kalibrierung:

`gRide = R_device_to_ride × aDevice / 9.80665`

mit X=lateral, Y=longitudinal, Z=vertikal. Ruhend ungefähr Z=+1 G.

Gyro liefert keine Kraft direkt; es stabilisiert/aktualisiert die Orientierung. Magnetometer ist bei Stahlachterbahnen störanfällig. GPS-Richtung kann bei ausreichend hoher Geschwindigkeit langfristig als Orientierungshilfe dienen.

Siehe `docs/DIAGNOSTICS_AND_SENSOR_MATH.md`.

## 12. Nächste Prioritäten – Reihenfolge

1. GPS in realen Stillstands- und Außenfahrtests verifizieren: keine Einzelfix-Sprünge, saubere Freigabe beim Anfahren, RidePackage-Persistenz.
2. Supabase-Testprojekt in EU-Region anlegen, Migration 001 und 002 ausführen und die Abnahmetests aus `PRIVACY_AND_BACKEND_ROLLOUT.md` durchlaufen.
3. Betreiberangaben, Datenschutztext, Community-Regeln, Aufbewahrungsfristen und Alterskonzept rechtlich prüfen und veröffentlichen.
4. GPS-Diagnose um eine klare Qualitätsampel erweitern; Browser bietet auf iOS keine verlässliche Satellitenanzahl, daher nicht erfinden.
5. Sensor-Channel-Discovery vollständig in Device Center und HUD-Konfigurator integrieren.
6. Dynamische Widgets: erkannte Kanäle automatisch vorschlagen, User kann Metriken/Units/Widgettyp/Position konfigurieren.
7. Externe IMU niemals ungekalibriert direkt als Ride-Achsen verwenden; pro Gerät Bias, Scale und Orientation Matrix/Quaternion speichern.
8. Park/Bahn-Provider um Cache, Provider-Fallback, Rate Limits und transparentere Confidence erweitern.
9. Native iOS/Android funktional mit Webänderungen nachziehen.
10. Für Wachstum serverseitige Kontolöschung, Abuse-Rate-Limits, Admin-Audit-Log und Medienstrategie ergänzen.

## 13. Arbeitsweise im nächsten Chat

- Nicht raten: vor Änderungen GitHub `main`, relevante Datei und Actions lesen.
- Nach jedem funktionalen Paket Actions prüfen.
- Infrastrukturfehler von echten Compile-/Runtimefehlern unterscheiden.
- Web-Änderungen mit iOS/Android vergleichen, wenn sie gemeinsame Plugin-/Datenverträge betreffen.
- Keine neuen parallelen Legacy-Systeme einführen; vorhandene zentrale Services/Registry/PluginHost erweitern.
- Bei Web-UI-Bugs möglichst die zentrale Route/Dialog/Overlay-/Plugin-Schicht korrigieren statt einen weiteren konkurrierenden Handler darüberzulegen.
