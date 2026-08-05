# RideTracker Native iOS

Dieses Verzeichnis enthält das parallele SwiftUI-Grundgerüst für die native iPhone-App.

## Enthalten

- Core Motion Device Motion mit bis zu 100 Hz
- `CMAltimeter` für relative barometrische Höhe und Luftdruck
- Core Location für GPS, Geschwindigkeit und horizontale Position
- lokales Sample-Modell als Grundlage für JSON/CSV/GPX
- SwiftUI-Testoberfläche

## Projekt erzeugen

Benötigt werden ein Mac, Xcode und optional XcodeGen.

```bash
brew install xcodegen
cd native-ios
xcodegen generate
open RideTrackerNative.xcodeproj
```

Danach in Xcode unter **Signing & Capabilities** das eigene Apple-Entwicklerteam auswählen und die App auf einem echten iPhone starten. Der Simulator liefert keine realistischen Bewegungs- oder Barometerdaten.

## Nächste native Schritte

1. Kalibrierung und fahrzeugbezogene Achsen aus der Web-App portieren.
2. Barometer-, GPS- und IMU-Daten auf eine gemeinsame monotone Zeitbasis bringen.
3. Aufzeichnung binär und verlustarm speichern.
4. MapKit-/OpenStreetMap-Fahrtenbibliothek anbinden.
5. Kameraaufnahme über AVFoundation synchronisieren.
6. WatchOS-Begleit-App ergänzen.
