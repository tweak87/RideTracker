# RideTracker

## Aktuelle Web-Version

Die aktuelle Web-Version `2026.08.08-video-gforce-trails.4` startet den iOS-/Safari-Berechtigungsablauf unmittelbar aus dem Fingertipp, öffnet die Videoansicht schon während der Vorbereitung im App-Vollbild und hält das konfigurierte HUD während der Aufnahme sichtbar. Die Park- und Attraktionsermittlung ist aus dem Startablauf entfernt: Karte, automatische Kandidaten und Auswahl erscheinen erst nach dem Stoppen im Dialog „Fahrt fertigstellen“. Die neue G-Ball-Anzeige trennt die Draufsicht für Seiten-/Längskräfte von der Vertikallast; beide Punkte ziehen einen ausblendenden Verlaufsschweif nach. Bestehende angepasste HUD-Layouts bleiben erhalten, während unveränderte Standardlayouts automatisch auf die größere Visualisierung migriert werden.

Die vorherigen Funktionen bleiben bestehen: wählbare Parkkarte im Umkreis, optionale Wetter-/Wind-Snapshots, lizenzierte Fahrtbilder, ICE-GPS-Zeitstempelreparatur, ehrliche Kennzeichnung abgeschirmter Positionen, Lageprüfung der Kalibrierung, FAQ, Kompass und frei navigierbares XYZ-Modell mit Punktinspektor. Das Supabase-Backend enthält weiterhin Datenschutzzustimmung, serverseitige Synchronisierungssperre sowie Export und Löschung der eigenen Community-Daten.

Der unmittelbar vorherige stabile Produktionsstand bleibt unter Commit `5a4f178947b144694543161e1f8a459ab19a07b5` und Branch [`rollback/pre-park-map-weather-20260808`](https://github.com/tweak87/RideTracker/tree/rollback/pre-park-map-weather-20260808) erhalten. Sensormathematik und Bedienung sind in [`docs/SPEED_COMPASS_3D.md`](docs/SPEED_COMPASS_3D.md) dokumentiert; die sichere Backend-Aktivierung steht in [`docs/PRIVACY_AND_BACKEND_ROLLOUT.md`](docs/PRIVACY_AND_BACKEND_ROLLOUT.md).

Plattformübergreifende Telemetrie- und Analyseplattform für Achterbahnen und Fahrgeschäfte.

## Aktueller Entwicklungsstand / Chat-Handoff

Vor einer Fortsetzung in einem neuen Chat zuerst lesen:

- `docs/CHAT_HANDOFF.md` – aktueller Stand, aktive Module, bekannte Probleme, Buildstatus und nächste Prioritäten
- `docs/DIAGNOSTICS_AND_SENSOR_MATH.md` – G-Kraft-/Sensorlogik, GPS-Qualität und Diagnose-/Admin-Konzept
- `docs/ARCHITECTURE.md` – allgemeine Architektur und Sensorstrategie
- `docs/COMMUNITY_ROADMAP.md` – Community-Zielbild
- `docs/COMMUNITY_BACKEND_3D.md` – Backend, Rollen, Synchronisierung, Miniaturen, 3D und Rollback
- `docs/park-track-identification.md` – Park-/Bahn-Erkennung

## Anwendungen

- Web/PWA: aktuelle Testversion über GitHub Pages
- iOS: SwiftUI, Core Motion, Core Location, CMAltimeter und BLE
- Android/Fire OS: Jetpack Compose, Android-Sensoren, Google-unabhängiger Systemstandort und BLE

## Gemeinsame Architektur

- `shared/contracts/` – Datenformat und zentrale Algorithmusparameter
- `shared/ride-engine/` – Referenzimplementierung der Ride Engine für Web
- `native-ios/` – native iPhone-App
- `native-android/` – native Android-App
- `core/` – PluginHost, Built-in Plugins, Runtime-Adapter und zentraler Web-Storage

## Web-Diagnose

Der Web-Diagnosemodus kann mit `?diag=1` an der GitHub-Pages-URL aktiviert werden. Danach erscheint ein `DIAG`-Button zum Prüfen/Freigeben der UI und zum Export eines Diagnose-JSON. Exakte GPS-Koordinaten werden im normalen Diagnoseexport nicht mit ausgegeben.

## Builds vom iPhone aus

Unter **Actions** können folgende Workflows manuell gestartet werden:

- `Publish RideTracker to gh-pages`
- `Build iOS`
- `Build Android`

Der Android-Workflow testet und prüft die App, verifiziert die Geräte- und Fire-APK zusätzlich mit `apksigner`, `aapt` und vollständigen Archivtests und veröffentlicht Builds von `main` als Vorab-Release unter [`android-v2026.08.09.3`](https://github.com/tweak87/RideTracker/releases/tag/android-v2026.08.09.3). Auf Huawei/Android `INSTALL-RideTracker-ANDROID-DEVICE-v2026.08.09.3.apk`, auf Fire OS 8 ausschließlich `INSTALL-RideTracker-FIRE-OS-8-v2026.08.09.3.apk` öffnen. Die Version ergänzt den modernen Ride-Draft, Offline-Parkkatalog samt Länderauswahl, Standortvorschläge, historische und belegte offizielle Vergleichswerte sowie lokale Community-Ride-Stories. Beide Testpakete verwenden neue v7-Paket-IDs und können deshalb ohne Signaturkonflikt neben älteren Builds installiert werden. Die Test-APKs sind nicht für einen App-Store signiert; für wiederholte Updates und eine öffentliche Verteilung wird ein geschützter Release-Key benötigt. Fire-Hinweise stehen in [`docs/ANDROID_FIRE_INSTALL.md`](docs/ANDROID_FIRE_INSTALL.md). Der iOS-Workflow prüft den Swift-Code mit einem Simulator-Build; für die Installation auf einem realen iPhone ist ebenfalls Signierung erforderlich.
