# RideTracker Community Roadmap

## Productziel

RideTracker soll sich von einem persönlichen Sensorlogger zu einer Community-Plattform für Achterbahn-Telemetrie entwickeln. Nutzer sollen Fahrten, Videos, Strecken, Messwerte, Bewertungen und Metadaten austauschen können. Mehrfach aufgezeichnete Fahrten derselben Bahn sollen gemeinsam ausgewertet werden, um einen zunehmend präzisen, versionierten Master Track beziehungsweise RideGraph zu erzeugen.

## Leitprinzipien

1. Ein stabiler persönlicher Tracker ist die Grundlage.
2. Jede Plattform nutzt dieselben Datenverträge und vergleichbare Auswertungslogik.
3. Rohdaten bleiben getrennt von abgeleiteten und gemeinschaftlich aggregierten Daten.
4. Jede automatische Streckenverbesserung erhält Qualitäts-, Herkunfts- und Unsicherheitsinformationen.
5. Datenschutz, Einwilligung und Löschbarkeit werden vor öffentlichem Upload umgesetzt.
6. Pro Entwicklungszyklus wird genau ein abgegrenzter Meilenstein umgesetzt und über CI geprüft.

## Entwicklungsreihenfolge

### Community Foundation — umgesetzt

- einheitliche mobile Navigation
- Aufnahme-Preflight und automatische Vorbereitung
- lokales Sichtbarkeits- und Veröffentlichungsmodell
- Support-/Logcenter und lokale Administration
- dokumentierter Rollback-Punkt
- Chromium-/WebKit-Browsertests für mobile Kernabläufe

### M1 — Stabile native Aufzeichnung

- Sensoren, Video und Zeitbasis auf iOS und Android stabilisieren
- Berechtigungs- und Fehlerzustände sauber behandeln
- lokales Sessionpaket aus Telemetrie, Ereignissen und Video-Metadaten
- Export und Web-Replay

### M2 — Gemeinsames Ride-Paket

- versionierter `.ride`-Container beziehungsweise manifestbasiertes Paket
- Integritätsprüfungen und Prüfsummen
- Importmigration für ältere Sessionversionen
- getrennte Rohdaten- und Analyseebenen

### M3 — Track Normalization Engine

- GPS-, Barometer- und IMU-Tracks auf gemeinsame Zeit- und Wegkoordinate bringen
- Ausreißer, Stillstandsdrift und Datenlücken markieren
- Fahrtrichtung und Start-/Endpunkt normalisieren
- Fahrt gegen vorhandenen Referenztrack ausrichten

### M4 — Multi-Ride Track Fusion

- mehrere Fahrten derselben Bahn räumlich und zeitlich matchen
- robuste Median-/M-Schätzer statt einfacher Mittelwerte
- segmentweise Konfidenz und Streuung berechnen
- Master Track versionieren und nur bei ausreichender Evidenz aktualisieren
- einzelne Fahrten niemals destruktiv überschreiben

### M5 — RideGraph

- Strecke als gerichteten Graph mit Segmenten modellieren
- Höhe, Geschwindigkeit, G-Kräfte, Neigung, Kurvenradius und Ereignisse je Segment aggregieren
- Lift, Launch, Drop, Inversion, Bremse und Station als semantische Knoten
- Vergleich einer neuen Fahrt mit dem RideGraph

### M6 — Lokale Park- und Bahn-Datenbank

- Parks, Bahnen, Züge, Sitzpositionen und Fahrten lokal verwalten
- OpenStreetMap-basierte Parkkarte
- automatische Zuordnung mit manueller Korrektur
- Kennzahlen pro Bahn und Fahrt

### M7 — Community-Backend

- Benutzerkonten und Profile
- private, geteilte und öffentliche Fahrten
- Upload von Ride-Paketen und Videos
- Moderation, Meldung, Löschung und Datenexport
- API für Parks, Bahnen, Fahrten und Master Tracks

### M8 — Community-Funktionen

- Kommentare, Bewertungen, Fotos und Videos
- Follows, Sammlungen und Fahrtenlisten
- Vergleiche nach Sitzreihe, Wetter, Tageszeit und Zug
- belastbare Bestenlisten mit Qualitätsfiltern

### M9 — Crowd-optimierte Strecken

- Uploads automatisch einer Bahn und Master-Track-Version zuordnen
- neue Messung gegen Referenz prüfen
- nur hochwertige, unabhängige Fahrten in Fusion aufnehmen
- Geräte-, Nutzer- und Fahrtenkorrelation berücksichtigen
- sichtbarer Confidence Score je Segment

### M10 — Ride Intelligence

- personalisierte Vergleiche
- Abweichungs- und Anomalieerkennung
- segmentbasierte Heatmaps
- automatische Video-/Telemetrie-Synchronisierung
- statistische Aussagen nur mit ausreichender Stichprobe und Unsicherheitsangabe

## Kontrollierter Entwicklungszyklus

Für jeden Meilenstein gilt:

1. neuesten CI-Status prüfen,
2. vorhandene Fehler zuerst beheben,
3. kleine testbare Änderung implementieren,
4. automatisierte Tests ergänzen,
5. Builds für betroffene Plattformen abwarten,
6. Fehler korrigieren,
7. Ergebnis dokumentieren,
8. nächsten Teil erst nach grüner CI beginnen.

Bei Kosten, Zugangsdaten, Datenschutzentscheidungen, Cloud-Anbietern, öffentlichen Veröffentlichungen oder inkompatiblen Datenmodelländerungen ist eine explizite Freigabe erforderlich.
