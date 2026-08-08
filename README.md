# RideTracker

## Aktuelle Web-Version

Die aktuelle Version `2026.08.08-context-map-weather.1` ergänzt Web und Android um eine wählbare Parkkarte im Umkreis, optionale Wetter-/Wind-Snapshots, lizenzierte Fahrtbilder als Miniaturen, einen automatischen Aufnahme-Dialog und einen strengeren Stillstandfilter gegen GPS-Sprünge. FAQ, Kompass und frei navigierbares XYZ-Modell mit Punktinspektor sind in beiden Oberflächen verfügbar. Das Supabase-Backend erhält versionierte Datenschutzzustimmung, serverseitige Synchronisierungssperre sowie Export und Löschung der eigenen Community-Daten.

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

Der Android-Workflow testet und prüft die App, erzeugt eine normale sowie eine separat installierbare Fire-Test-APK und veröffentlicht Builds von `main` zusätzlich als Vorab-Release unter [`android-v2026.08.08.2`](https://github.com/tweak87/RideTracker/releases/tag/android-v2026.08.08.2). Die Test-APKs sind nicht für einen App-Store signiert; für wiederholte Updates und eine öffentliche Verteilung wird ein geschützter Release-Key benötigt. Fire-Hinweise stehen in [`docs/ANDROID_FIRE_INSTALL.md`](docs/ANDROID_FIRE_INSTALL.md). Der iOS-Workflow prüft den Swift-Code mit einem Simulator-Build; für die Installation auf einem realen iPhone ist ebenfalls Signierung erforderlich.
