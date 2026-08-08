# RideTracker auf Amazon Fire Tablets

Stand: 8. August 2026

## Welches Paket verwenden?

- `RideTracker-Fire-2026.08.08.2-fireTest.apk` ist der empfohlene Testbuild für Fire OS.
- Die Paket-ID `de.ridetracker.firetest` unterscheidet sich bewusst von `de.ridetracker`. Dadurch kann die Fire-Version neben einer früheren RideTracker-Testversion installiert werden und umgeht Signaturkonflikte mit älteren Debug-APKs.
- Der Build unterstützt Android API 21 und neuer, also Fire OS 5 und neuer. Fire OS 4 und ältere Versionen werden von der aktuellen AndroidX-/Compose-Oberfläche nicht unterstützt.
- Das Fire-Paket enthält nur die auf Fire-Tablets benötigten ARM-Varianten (`armeabi-v7a` und `arm64-v8a`), um Download und Installationsspeicher kleiner zu halten.

## Installation

1. Unter **Einstellungen → Sicherheit und Datenschutz → Apps unbekannter Herkunft** die verwendete Download-App (Silk oder Dateien) freigeben.
2. Mindestens 200 MB freien Speicher sicherstellen.
3. Die Fire-Test-APK vollständig herunterladen und danach aus **Dateien/Downloads** öffnen.
4. Wird weiterhin nur „App wurde nicht installiert“ angezeigt, Fire-OS-Version, Modell/Generation, freien Speicher und den Namen der heruntergeladenen APK notieren.

Nach erfolgreicher Installation kann unter **Menü → Kompatibilität & Diagnose** ein vollständiger Geräte- und Sensorbericht kopiert und bei einem Fehler weitergegeben werden.

Die normale APK `de.ridetracker` kann beim Aktualisieren einer früheren Debug-Version abgelehnt werden, wenn beide Builds mit unterschiedlichen Debug-Zertifikaten signiert wurden. Vor einer Deinstallation zuerst wichtige Fahrten exportieren. Eine Deinstallation löscht lokale App-Daten.

## Fire-OS-Kompatibilität

RideTracker verwendet für GPS, Parksuche und Wetter ausschließlich Androids `LocationManager`. Google Play Services sind nicht erforderlich. Falls das Tablet kein GPS besitzt, zeichnet RideTracker Bewegungssensoren und G-Kräfte weiter auf; Geschwindigkeit, geografische Strecke und das räumliche GPS-Modell können dann fehlen.

Kamera, Mikrofon, GPS, Gyroskop, Kompass und Bluetooth LE sind optionale Gerätefunktionen. Die App bleibt installierbar, zeigt fehlende Sensoren aber als eingeschränkte Messquelle an.

## Signierung vor einer öffentlichen Veröffentlichung

Die derzeitigen APKs sind Debug-Testbuilds. Für dauerhafte Updates muss ein eigener Android-Release-Key einmalig erzeugt, offline gesichert und verschlüsselt als GitHub-Actions-Secret hinterlegt werden. Der private Schlüssel darf niemals in das öffentliche Repository oder in einen Chat kopiert werden. Erst danach sollte eine öffentliche oder Amazon-Appstore-Version mit unveränderlicher Paket-ID veröffentlicht werden.
