# RideTracker Android

Native RideTracker-App mit Jetpack Compose und einer Kotlin-Portierung der Ride Engine.

Die Version `2026.08.09.4` ergänzt eine korrigierte Geh- und GPS-Ersatzgeschwindigkeit, GNSS-Qualität mit Genauigkeit und Satelliten, ein gemeinsames Live-/Editor-HUD, verbesserte Scroll- und Tastaturbedienung, alphabetische Park-/Attraktionswahl, eine Vollständigkeitsanzeige je Fahrt und ein geglättetes 3D-Achterbahnmodell mit künstlichem Boden, Schienen, Schwellen und Stützen. Der moderne Ride-Draft mit Video-Vorschau, Vergleichen und lokaler Community-Story bleibt vollständig erhalten. Ohne Barometer nutzt das Höhenmodell eine ausdrücklich gekennzeichnete GPS-Höhenannäherung.

## Vorgesehene Sensoren

- `SensorManager`: Beschleunigung, Gyroskop, Rotation Vector, Luftdruck
- Android `LocationManager`: GPS/Netzwerk X/Y und Geschwindigkeit, ohne Google Play Services
- CameraX: Video
- AudioRecord: relativer Audiopegel
- Bluetooth LE: externe IMU/GNSS-Sensoren
- Health Services auf Wear OS: Herzfrequenz und Watch-Sensoren

## Build ohne Android Studio

Der GitHub-Workflow `Build Android` kann über die GitHub-App oder Safari gestartet werden. Er testet Kotlin-Logik, Android-Lint, Paket-IDs, SDK, APK-v2-Signaturen und ZIP-Strukturen. Builds von `main` erscheinen als Vorab-Release `android-v2026.08.09.4`. Für Huawei/Android `INSTALL-RideTracker-ANDROID-DEVICE-v2026.08.09.4.apk`, für Fire OS 8 `INSTALL-RideTracker-FIRE-OS-8-v2026.08.09.4.apk` verwenden. Die App-Namen **RideTracker DEVICE v8** beziehungsweise **RideTracker FIRE 8 v8** bestätigen den richtigen Build. Die v8-Pakete werden parallel zu älteren Testversionen installiert, damit wechselnde Debug-Zertifikate keine Aktualisierung blockieren. Auf dem Testgerät muss die Installation aus dieser Browser-/Dateiquelle bewusst erlaubt werden. Hinweise für Amazon-Tablets stehen in [`../docs/ANDROID_FIRE_INSTALL.md`](../docs/ANDROID_FIRE_INSTALL.md).

## Architektur

- `MainActivity.kt`: Presentation Layer
- `engine/RideEngine.kt`: plattformunabhängige Berechnungen
- `sensors/`: Android Sensor Layer
- `session/`: lokaler Session- und Ride-Package-Speicher
- `context/`: Park, Attraktion, Wetter, Karte und Fahrtbild

Grenzwerte und Datenformat stehen unter `shared/contracts/`.
