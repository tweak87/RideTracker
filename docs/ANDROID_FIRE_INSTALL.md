# RideTracker auf Amazon Fire Tablets

Stand: 8. August 2026

Für ein normales Android-Gerät wie das Huawei P20 Pro wird `INSTALL-RideTracker-ANDROID-DEVICE-v2026.08.08.4.apk` verwendet. Der sichtbare App-Name **RideTracker DEVICE v4** und die neue Paket-ID `de.ridetracker.devicev4` vermeiden Konflikte mit älteren Debug-Signaturen.

## Welches Paket verwenden?

- `INSTALL-RideTracker-FIRE-OS-8-v2026.08.08.4.apk` ist der einzige empfohlene Testbuild für Fire OS 8. Die ähnlich große Datei `RideTracker-Android-…-debug.apk` ist **nicht** für diesen Installationstest gedacht.
- Im Installationsdialog muss als App-Name **RideTracker FIRE 8 v4** stehen. Steht dort nur **RideTracker**, wurde die normale APK geöffnet.
- Die Paket-ID `de.ridetracker.fire8v4` unterscheidet sich bewusst von `de.ridetracker` und vorherigen Fire-Test-IDs. Dadurch kann diese Diagnoseversion neben früheren RideTracker-Paketen installiert werden und umgeht deren Debug-Signaturkonflikte.
- Der Build unterstützt Android API 21 und neuer, also Fire OS 5 und neuer. Fire OS 4 und ältere Versionen werden von der aktuellen AndroidX-/Compose-Oberfläche nicht unterstützt.
- Das Fire-Paket enthält nur die auf Fire-Tablets benötigten ARM-Varianten (`armeabi-v7a` und `arm64-v8a`). Native Bibliotheken werden im älteren, auf Fire OS robusteren Extraktionsformat verpackt.

## Installation

1. Unter **Einstellungen → Sicherheit und Datenschutz → Apps unbekannter Herkunft** die verwendete Download-App (Silk oder Dateien) freigeben.
2. Mindestens 200 MB freien Speicher sicherstellen.
3. Die Datei `INSTALL-RideTracker-FIRE-OS-8-v2026.08.08.4.apk` vollständig herunterladen und danach aus **Dateien/Downloads** öffnen. Im Installer den Namen **RideTracker FIRE 8 v4** kontrollieren.
4. Wird weiterhin nur „App wurde nicht installiert“ angezeigt, Fire-OS-Version, Modell/Generation, freien Speicher und den Namen der heruntergeladenen APK notieren.

Nach erfolgreicher Installation kann unter **Menü → Kompatibilität & Diagnose** ein vollständiger Geräte- und Sensorbericht kopiert und bei einem Fehler weitergegeben werden.

Die normale APK `de.ridetracker` kann beim Aktualisieren einer früheren Debug-Version abgelehnt werden, wenn beide Builds mit unterschiedlichen Debug-Zertifikaten signiert wurden. Das ist sehr wahrscheinlich der Grund, wenn der Installationsdialog aus dem Foto nur **RideTracker** anzeigt. Vor einer Deinstallation zuerst wichtige Fahrten exportieren. Eine Deinstallation löscht lokale App-Daten.

## Fire-OS-Kompatibilität

RideTracker verwendet für GPS, Parksuche und Wetter ausschließlich Androids `LocationManager`. Google Play Services sind nicht erforderlich. Falls das Tablet kein GPS besitzt, zeichnet RideTracker Bewegungssensoren und G-Kräfte weiter auf; Geschwindigkeit, geografische Strecke und das räumliche GPS-Modell können dann fehlen.

Kamera, Mikrofon, GPS, Gyroskop, Kompass und Bluetooth LE sind optionale Gerätefunktionen. Die App bleibt installierbar, zeigt fehlende Sensoren aber als eingeschränkte Messquelle an.

## Signierung vor einer öffentlichen Veröffentlichung

Die derzeitigen APKs sind Debug-Testbuilds. Für dauerhafte Updates muss ein eigener Android-Release-Key einmalig erzeugt, offline gesichert und verschlüsselt als GitHub-Actions-Secret hinterlegt werden. Der private Schlüssel darf niemals in das öffentliche Repository oder in einen Chat kopiert werden. Erst danach sollte eine öffentliche oder Amazon-Appstore-Version mit unveränderlicher Paket-ID veröffentlicht werden.
