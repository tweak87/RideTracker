# RideTracker Architektur

RideTracker wird als plattformübergreifendes System mit klar getrennten Schichten aufgebaut.

## 1. Sensor Layer

Plattformspezifische Erfassung:

- Web: DeviceMotion, Geolocation, MediaDevices
- iOS: Core Motion, Core Location, CMAltimeter, Core Bluetooth, WatchConnectivity
- Android: SensorManager, Fused Location Provider, CameraX, Bluetooth LE, Wear OS
- Externe Sensoren: BLE-IMU, BLE-GNSS, Barometer, Apple Watch/Wear OS

Jede Quelle liefert normierte `SensorSample`-Objekte mit monotonem Zeitstempel und Quellenkennung.

## 2. Ride Engine

Plattformunabhängige Berechnungslogik:

- Kalibrierung und Sitzkoordinatensystem
- Normal-, Lateral- und Longitudinal-G
- GPS-Qualitätsfilter und Distanz
- Barometer-/GPS-Höhenfusion
- positive G-Mittelwerte
- Airtime-, Launch-, Lift- und Bremsereignisse
- Segmentqualität und Confidence Scores
- Streckenposition 0–100 %
- Vergleich mehrerer Fahrten

Referenzimplementierungen:

- Web: `shared/ride-engine/ride-engine.js`
- iOS: `native-ios/RideTrackerNative/RideEngine.swift`
- Android: `native-android/app/src/main/java/de/ridetracker/engine/RideEngine.kt`

Die Algorithmen sollen dieselben Grenzwerte und Formeln verwenden. Änderungen werden zuerst in `shared/contracts/engine-config.json` dokumentiert und anschließend in alle drei Implementierungen übernommen.

## 3. Session Store

Gemeinsames Datenformat:

- Rohdaten werden unverändert gespeichert.
- Verarbeitete Daten enthalten Algorithmusversion und Kalibrierung.
- Video bleibt als separate Datei mit gemeinsamem Nullzeitpunkt.
- Park, Bahn, Sitzreihe, Sensorquellen und Qualitätskennzahlen werden als Metadaten gespeichert.

Schema: `shared/contracts/ride-session.schema.json`

## 4. Presentation Layer

- Web/PWA: HUD, Replay, OpenStreetMap, Fahrtenbibliothek
- iOS: SwiftUI, MapKit, AVFoundation
- Android: Jetpack Compose, Google Maps oder MapLibre, CameraX

Die Darstellung darf keine Berechnungslogik enthalten. Sie liest ausschließlich Ergebnisse der Ride Engine.

## 5. Sensorquellen-Priorität

1. Fahrzeugfest montierte externe IMU, sofern Betreiberfreigabe vorliegt
2. Fest montiertes Smartphone / Brusthalter
3. Smartphone in enger Tasche
4. Smartwatch oder Wear OS als Zusatzquelle
5. Handgelenk-IMU niemals als alleinige Fahrzeugreferenz

Sensorquellen werden nicht blind gemittelt. Jede Quelle erhält einen eigenen Qualitätswert; die Engine entscheidet segmentweise, welche Quelle verwendet wird.

## 6. Entwicklung ohne Mac

- Web: GitHub Pages
- Android: GitHub Actions auf Ubuntu, APK-Artefakt
- iOS: GitHub Actions auf macOS für Build und Tests
- Installation auf realem iPhone später über TestFlight oder signierte IPA

Alle Workflows sind manuell über die GitHub-App oder Safari auf dem iPhone startbar.