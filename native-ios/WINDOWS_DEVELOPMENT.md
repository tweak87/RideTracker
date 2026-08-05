# Native iOS-Entwicklung von Windows aus

Xcode und der iOS-Simulator laufen nicht unter Windows. Der Quellcode kann dennoch auf Windows bearbeitet und über GitHub verwaltet werden.

## Empfohlener Workflow

1. Code auf Windows mit VS Code oder einer vergleichbaren IDE bearbeiten.
2. Änderungen nach GitHub pushen.
3. Einen macOS-Cloud-Runner für automatisierte Builds und Tests verwenden.
4. Für Signierung und Installation auf einem echten iPhone Apple-Zertifikate und Provisioning sicher als Repository-Secrets hinterlegen.
5. Für interaktive Fehlersuche, Simulator und App-Store-Upload zeitweise einen gemieteten Cloud-Mac oder einen Mac im eigenen Netzwerk verwenden.

## Was auf Windows möglich ist

- Swift-Dateien bearbeiten
- Web-App vollständig testen
- Datenformate und Algorithmen entwickeln
- GitHub Actions konfigurieren
- Unit-Tests auf einem macOS-Runner ausführen
- Build-Artefakte erzeugen, wenn Signierung korrekt eingerichtet ist

## Was einen Mac benötigt

- Xcode-Oberfläche
- iOS-Simulator
- lokale Geräteinstallation und Debugging
- Verwaltung bestimmter Signing- und Provisioning-Schritte
- visuelle SwiftUI-Previews

## Projektgenerierung

Das Repository verwendet `project.yml` für XcodeGen. Ein macOS-Runner oder Cloud-Mac führt aus:

```bash
brew install xcodegen
cd native-ios
xcodegen generate
xcodebuild -project RideTrackerNative.xcodeproj -scheme RideTrackerNative -sdk iphonesimulator build
```

Ein separater GitHub-Actions-Workflow für einen unsignierten Simulator-Build ist als nächster Schritt vorgesehen.
