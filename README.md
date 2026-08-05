# RideTracker

Plattformübergreifende Telemetrie- und Analyseplattform für Achterbahnen und Fahrgeschäfte.

## Anwendungen

- Web/PWA: aktuelle Testversion über GitHub Pages
- iOS: SwiftUI, Core Motion, Core Location, CMAltimeter und BLE
- Android: Jetpack Compose, Android-Sensoren, Fused Location und BLE

## Gemeinsame Architektur

- `shared/contracts/` – Datenformat und zentrale Algorithmusparameter
- `shared/ride-engine/` – Referenzimplementierung der Ride Engine für Web
- `native-ios/` – native iPhone-App
- `native-android/` – native Android-App
- `docs/ARCHITECTURE.md` – Architektur und Sensorstrategie

## Builds vom iPhone aus

Unter **Actions** können folgende Workflows manuell gestartet werden:

- `Deploy RideTracker to GitHub Pages`
- `Build iOS`
- `Build Android`

Der Android-Workflow erzeugt eine Debug-APK als Artefakt. Der iOS-Workflow prüft den Swift-Code mit einem Simulator-Build; für die Installation auf einem realen iPhone ist später Signierung erforderlich.
