# RideTracker Community-Backend und 3D-Modelle

## Version und Rollback

- Produktversion: `2026.08.08-ice-telemetry-fire8.3`
- Gesicherter Ausgangsstand: `5a4f178947b144694543161e1f8a459ab19a07b5`
- Remote-Rollback-Branch: `rollback/pre-park-map-weather-20260808`
- Lokales Tag: `park-map-weather-baseline-20260808`
- Rollback-Link: <https://github.com/tweak87/RideTracker/tree/rollback/pre-park-map-weather-20260808>

Der Ausgangsstand bleibt unverändert. Ein Rollback erfolgt über einen neuen Branch oder Pull Request auf Basis des genannten Commits. Lokal gespeicherte Fahrten werden durch einen Code-Rollback nicht automatisch gelöscht oder verändert.

## Funktionsumfang

### Lokaler Modus

RideTracker funktioniert ohne Konto und ohne Backend weiter. RidePackages, Videos, Community-Entwürfe, Miniaturen und 3D-Modelle werden lokal verarbeitet. Ein Netzwerkausfall blockiert weder die Fahrtenbibliothek noch eine Aufnahme.

### Optionales Community-Backend

Das Backend umfasst:

1. Registrierung und Anmeldung per E-Mail und Passwort.
2. Profile mit `private`, `friends` und `public`.
3. Synchronisierung bewusst freigegebener Fahrten.
4. Freundschaftsanfragen und Annahme/Ablehnung.
5. Feed für öffentliche Inhalte und Inhalte von Freunden.
6. Meldesystem und rollenbasierte Moderationsliste.
7. Serverseitige Zusammenführung mehrerer Aufzeichnungen derselben Bahn.
8. Row Level Security für alle Community-Tabellen.

Die Web-App speichert ausschließlich einen clientseitigen Publishable-/Anon-Key. Ein `service_role`-Schlüssel wird aktiv abgewiesen. Rollen liegen in einer separaten, nicht durch normale Nutzer beschreibbaren Tabelle.

## Datenschutz der Streckendaten

Der Upload enthält keine Felder `latitude`, `longitude`, `lat` oder `lon`. Vor dem Sync werden GPS-Punkte in ein lokales Koordinatensystem überführt:

- `x`: Ost/West-Abstand in Metern
- `y`: relative Höhe in Metern
- `z`: Nord/Süd-Abstand in Metern

Damit lässt sich die Streckenform vergleichen, ohne den globalen Standort als absolutes Koordinatenpaar im öffentlichen Modell zu speichern. Private Fahrten fließen nicht in das serverseitige Gemeinschaftsmodell ein.

## 3D-Modell und Heatmaps

Aus einer Fahrt werden geglättete und abstandsnormalisierte Modellpunkte erzeugt. Verfügbare Heatmaps:

| Kanal | Bedeutung |
|---|---|
| Geschwindigkeit | gefilterte Geschwindigkeit in km/h |
| Vertikalkraft | normale Beschleunigung in g |
| Seitenkraft | laterale Beschleunigung in g |
| Längskraft | Beschleunigen/Bremsen in g |
| Gesamtkraft | Betrag der kombinierten Kräfte in g |
| Höhe | relative Höhe in Metern |
| Modellgüte | Konfidenz aus der Zahl zusammengeführter Fahrten |

Die serverseitige Zusammenführung bildet pro normalisiertem Streckenindex den Median der Position und Telemetrie. Ausreißer einzelner Telefone beeinflussen das Gemeinschaftsmodell dadurch weniger stark. Der Viewer zeigt sichtbare X-/Y-/Z-Achsen und unterstützt Drehen, Verschieben, Zoomen, feste Ansichten, Heatmap-Wechsel, Zurücksetzen und PNG-Export. Ein Klick oder Tipp auf einen Streckenpunkt öffnet Geschwindigkeit, vertikale/laterale/longitudinale und gesamte G-Kraft, lokale XYZ-Position, Höhe, Streckenfortschritt, Zeit und Modellgüte.

## Miniaturansichten

Parks, Bahnen und einzelne Fahrten erhalten automatisch erzeugte SVG-Miniaturen. Für einen Park oder eine Bahn werden mehrere lokal vorhandene Modelle zunächst zusammengeführt. Die Fahrtenbibliothek und der neue Community-Hub verwenden dieselbe Modellquelle.

## Backend einrichten

1. Ein eigenes Supabase-Projekt anlegen.
2. `backend/supabase/001_community_backend.sql` im SQL-Editor ausführen.
3. Danach `backend/supabase/002_privacy_security_hardening.sql` ausführen.
4. Die rechtliche und technische Checkliste in `docs/PRIVACY_AND_BACKEND_ROLLOUT.md` abschließen.
5. In RideTracker **Administration → Community-Backend & 3D → Backend konfigurieren** öffnen.
6. Projekt-URL, ausschließlich den Publishable-/Anon-Key und die HTTPS-Adresse des veröffentlichten Datenschutzhinweises eintragen.
7. Verbindung, Zustimmung, RLS-Isolation, Export und Löschung mit einem Testkonto prüfen.

Die direkte REST-/Auth-Anbindung benötigt kein zusätzliches JavaScript-SDK. Das Datenbankschema kann später hinter einer anderen kompatiblen API betrieben werden; die Browser-Schnittstelle liegt in `shared/core/community-backend.js`.

## Betrieb und Diagnose

Backend-Verbindungsfehler, fehlgeschlagene Synchronisierungen und Moderationsfehler werden an das vorhandene lokale Support-/Logcenter gemeldet. Die Synchronisierung arbeitet Fahrt für Fahrt weiter und zählt erfolgreiche sowie fehlgeschlagene Vorgänge getrennt. Ein fehlgeschlagener Upload entfernt keine lokale Fahrt.

## Noch nicht enthalten

- produktives Hosting und Secrets eines konkreten Backend-Projekts
- E-Mail-Vorlagen, Domain und rechtliche Community-Texte
- Push-Benachrichtigungen
- serverseitige Medien-/Videoablage
- Likes, Kommentare und Gruppen
- automatische globale Park-/Bahn-Auflösung gegen einen Referenzkatalog
- Missbrauchs- und Rate-Limit-Monitoring auf Infrastruktur-Ebene

Diese Punkte benötigen eine konkrete Hosting- und Betreiberentscheidung. Die aktuelle Version liefert dafür das abgesicherte Schema, die Browser-Schnittstelle und die UI-Grundlage.
