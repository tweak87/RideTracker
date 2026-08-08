# RideTracker Android

Native RideTracker-App mit Jetpack Compose und einer Kotlin-Portierung der Ride Engine.

Die Version `2026.08.08.3` enthält zusätzlich einen Google-unabhängigen Standortdienst für Fire OS, einen eindeutig benannten und technisch verifizierten Fire-OS-8-Testbuild, eine Geräte-/Sensordiagnose sowie direkte Community- und Profilbereiche. Automatischer Aufnahme-Dialog, Park-/Attraktionskarte, optionale Wetterdaten, lizenzierte Fahrtbilder, Stillstandfilter, Kompass, FAQ und das frei dreh-/zoombare XYZ-Modell mit Punktinspektor bleiben erhalten.

## Vorgesehene Sensoren

- `SensorManager`: Beschleunigung, Gyroskop, Rotation Vector, Luftdruck
- Android `LocationManager`: GPS/Netzwerk X/Y und Geschwindigkeit, ohne Google Play Services
- CameraX: Video
- AudioRecord: relativer Audiopegel
- Bluetooth LE: externe IMU/GNSS-Sensoren
- Health Services auf Wear OS: Herzfrequenz und Watch-Sensoren

## Build ohne Android Studio

Der GitHub-Workflow `Build Android` kann über die GitHub-App oder Safari gestartet werden. Er testet die Kotlin-Logik, führt Android-Lint aus, prüft Paket-ID, SDK, APK-v2-Signatur sowie ZIP-Struktur und erzeugt eine normale sowie eine separat installierbare Fire-Test-APK. Builds von `main` werden zusätzlich als Vorab-Release `android-v2026.08.08.3` veröffentlicht. Für Fire OS 8 ausschließlich `INSTALL-RideTracker-FIRE-OS-8-v2026.08.08.3.apk` verwenden; im Installer muss **RideTracker FIRE 8 TEST** erscheinen. Auf dem Testgerät muss die Installation aus dieser Browser-/Dateiquelle bewusst erlaubt werden. Hinweise für Amazon-Tablets stehen in [`../docs/ANDROID_FIRE_INSTALL.md`](../docs/ANDROID_FIRE_INSTALL.md).

## Architektur

- `MainActivity.kt`: Presentation Layer
- `engine/RideEngine.kt`: plattformunabhängige Berechnungen
- `sensors/`: Android Sensor Layer
- `session/`: lokaler Session- und Ride-Package-Speicher
- `context/`: Park, Attraktion, Wetter, Karte und Fahrtbild

Grenzwerte und Datenformat stehen unter `shared/contracts/`.
