# RideTracker Android

Android-Grundgerüst mit Jetpack Compose und einer Kotlin-Portierung der Ride Engine.

## Vorgesehene Sensoren

- `SensorManager`: Beschleunigung, Gyroskop, Rotation Vector, Luftdruck
- Fused Location Provider: GPS X/Y und Geschwindigkeit
- CameraX: Video
- AudioRecord: relativer Audiopegel
- Bluetooth LE: externe IMU/GNSS-Sensoren
- Health Services auf Wear OS: Herzfrequenz und Watch-Sensoren

## Build ohne Android Studio

Der GitHub-Workflow `Build Android` kann über die GitHub-App oder Safari gestartet werden. Er erzeugt eine Debug-APK als Actions-Artefakt.

## Architektur

- `MainActivity.kt`: Presentation Layer
- `engine/RideEngine.kt`: plattformunabhängige Berechnungen
- zukünftiger Ordner `sensors/`: Android Sensor Layer
- zukünftiger Ordner `storage/`: Session Store

Grenzwerte und Datenformat stehen unter `shared/contracts/`.