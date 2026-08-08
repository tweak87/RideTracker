# RideTracker Android

Native RideTracker-App mit Jetpack Compose und einer Kotlin-Portierung der Ride Engine.

Die Version `2026.08.08.1` enthält den automatischen Aufnahme-Dialog, Park-/Attraktionskarte, optionale Wetterdaten, lizenzierte Fahrtbilder, Stillstandfilter, Kompass, FAQ und ein frei dreh-/zoombares XYZ-Modell mit Punktinspektor.

## Vorgesehene Sensoren

- `SensorManager`: Beschleunigung, Gyroskop, Rotation Vector, Luftdruck
- Fused Location Provider: GPS X/Y und Geschwindigkeit
- CameraX: Video
- AudioRecord: relativer Audiopegel
- Bluetooth LE: externe IMU/GNSS-Sensoren
- Health Services auf Wear OS: Herzfrequenz und Watch-Sensoren

## Build ohne Android Studio

Der GitHub-Workflow `Build Android` kann über die GitHub-App oder Safari gestartet werden. Er testet die Kotlin-Logik, führt Android-Lint aus und erzeugt eine Debug-APK. Builds von `main` werden zusätzlich als Vorab-Release `android-v2026.08.08.1` veröffentlicht. Auf dem Testgerät muss die Installation aus dieser Browser-/Dateiquelle bewusst erlaubt werden.

## Architektur

- `MainActivity.kt`: Presentation Layer
- `engine/RideEngine.kt`: plattformunabhängige Berechnungen
- `sensors/`: Android Sensor Layer
- `session/`: lokaler Session- und Ride-Package-Speicher
- `context/`: Park, Attraktion, Wetter, Karte und Fahrtbild

Grenzwerte und Datenformat stehen unter `shared/contracts/`.
