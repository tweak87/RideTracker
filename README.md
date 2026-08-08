# RideTracker

## Aktuelle Web-Version

Die aktuelle Version `2026.08.08-speed-compass-3d.1` erweitert die Community-Grundlage um eine robuste iOS-GPS-Geschwindigkeit, ein konfigurierbares Kompass-HUD und einen räumlichen XYZ-Streckeninspektor. Jeder Modellpunkt kann ausgewählt werden und zeigt dort Geschwindigkeit, Kräfte, Höhe, Strecke und Modellgüte. Das optionale Backend für Anmeldung, Synchronisierung, Freunde, Feed, Meldungen und Moderation bleibt enthalten.

Der unmittelbar vorherige stabile Produktionsstand bleibt unter Commit `9a0d225bd291f1c5c3b65cb4f507f898dcf5a83b` und Branch [`rollback/pre-speed-compass-3d-20260808`](https://github.com/tweak87/RideTracker/tree/rollback/pre-speed-compass-3d-20260808) erhalten. Sensormathematik und Bedienung sind in [`docs/SPEED_COMPASS_3D.md`](docs/SPEED_COMPASS_3D.md) dokumentiert; Backend und Datenschutz stehen in [`docs/COMMUNITY_BACKEND_3D.md`](docs/COMMUNITY_BACKEND_3D.md).

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
- Android: Jetpack Compose, Android-Sensoren, Fused Location und BLE

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

Der Android-Workflow erzeugt eine Debug-APK als Artefakt. Der iOS-Workflow prüft den Swift-Code mit einem Simulator-Build; für die Installation auf einem realen iPhone ist später Signierung erforderlich.
