# RideTracker Community Foundation

## Version

- Produktversion: `2026.08.08-community-foundation.1`
- Stabiler Ausgangspunkt: `8485df203665f8e93558fcbcac72a890fc6e9c3b`
- Remote-Rollback-Branch: `rollback/pre-community-foundation-20260808`
- Rollback-Link: <https://github.com/tweak87/RideTracker/tree/rollback/pre-community-foundation-20260808>

Der Ausgangspunkt bleibt als eigener Branch unverändert erhalten. Ein Code-Rollback erfolgt durch einen neuen Branch oder Pull Request auf Basis dieses Commits; die Web-App selbst verändert keine Git-Referenzen.

## Enthaltene Grundlagen

1. Fünf mobile Hauptziele: Start, Entdecken, Aufnehmen, Fahrten und Profil.
2. Geführter Aufnahme-Preflight für GPS, Bewegung, Kamera, Kalibrierung, Speicher, IndexedDB und externe Sensoren.
3. Fahrtentwurf nach dem Stoppen mit `draft`, `private`, `friends` und `public`.
4. Datenschutzstandard mit geschützten Start-/Endpunkten und ausdrücklicher Freigabe exakter Tracks.
5. Lokale Community-Vorschau. Öffentliche Einträge erhalten den Status `ready-for-backend`, werden ohne Backend aber nicht hochgeladen.
6. Supportcenter mit Selbsttests, Aktions-/Fehler-/Performance-Log und bereinigtem Support-Paket.
7. Lokaler Administrationsbereich mit Versionsanzeige, Datenqualität, Datenbankprüfung, UI-Reparatur, Feature-Schaltern und lokalem Backup.
8. Playwright-Matrix für Chromium Android, WebKit iPhone und Chromium Desktop.

## Diagnose- und Backup-Grenzen

Das normale Support-Paket entfernt exakte Koordinaten und Rohdaten. Das ausdrücklich bestätigte lokale Vollbackup kann hingegen genaue GPS-Daten enthalten und darf nicht öffentlich geteilt werden. Videos werden wegen ihrer Größe nicht in das JSON-Vollbackup eingebettet.

## Nächster Backend-Schritt

Der lokale Status `ready-for-backend` ist noch keine Veröffentlichung. Für echte Community-Funktionen werden Authentifizierung, Rollen, zentrale Datenbank, Upload, Moderation, Meldungen, Löschung und ein Datenschutzkonzept benötigt.
