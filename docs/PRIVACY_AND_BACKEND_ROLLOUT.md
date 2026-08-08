# Sichere Aktivierung von Supabase, Standortdiensten und Community

Stand: 8. August 2026. Dieses Dokument ist eine technische Umsetzungs- und Prüfcheckliste, keine Rechtsberatung.

## Sicherheitsstatus dieser Version

Die Web-App arbeitet ohne Backend lokal. Parkkarte, Wetter und Wikimedia-Suche werden erst nach einer bewussten Aktion des Nutzers aufgerufen. Die Community-Synchronisierung lädt keine rohen GPS-Koordinaten und keine Videos hoch, sondern ein normalisiertes lokales XYZ-Modell und abgeleitete Telemetrie.

Für Supabase müssen zwei Migrationen in dieser Reihenfolge ausgeführt werden:

1. `backend/supabase/001_community_backend.sql`
2. `backend/supabase/002_privacy_security_hardening.sql`

Migration 002 ergänzt:

- versionierte Zustimmung zum Community-Datenschutzhinweis;
- ein serverseitiges Gate vor jeder Fahrt-Synchronisierung;
- Entzug direkter Schreibrechte für Browser-Rollen; Schreibvorgänge laufen nur über geprüfte RPCs;
- Export und Löschung der eigenen Community-Daten;
- Neuberechnung zusammengeführter Streckenmodelle nach Löschungen.

## Empfohlene Aktivierungsreihenfolge

1. Ein eigenes Supabase-Projekt in einer konkret ausgewählten EU-Region anlegen. Projektregion, Verantwortlichen und Auftragsverarbeitungsvertrag dokumentieren.
2. In Authentication E-Mail-Bestätigung aktivieren, erlaubte Redirect-URLs exakt begrenzen und für Administratoren MFA erzwingen.
3. Beide SQL-Migrationen im SQL Editor ausführen. Danach die Tabellen, RLS-Policies, Funktionsrechte und Trigger mit einem Testkonto prüfen.
4. In RideTracker unter **Administration → Community-Backend & 3D** ausschließlich Project URL, Publishable-/Anon-Key und die HTTPS-Adresse des veröffentlichten Datenschutzhinweises eintragen. Ohne diesen Link bleibt die Registrierung technisch gesperrt. Niemals Secret-/Service-Role-Key, Datenbankpasswort oder JWT-Secret in die Web-App, GitHub oder diesen Chat kopieren.
5. Eine vollständig ausgefüllte Datenschutzerklärung und Nutzungs-/Community-Regeln veröffentlichen. Die Vorlage `docs/PRIVACY_NOTICE_TEMPLATE_DE.md` enthält absichtlich Pflicht-Platzhalter und darf so nicht veröffentlicht werden.
6. Testfälle für Registrierung, Zustimmung, Widerruf, Export, Löschung, RLS-Isolation, Meldung und Moderation durchführen.
7. Erst danach Community-Synchronisierung öffentlich ankündigen. Bis dahin bleibt der lokale Modus der sichere Standard.

Supabase beschreibt Publishable-/Anon-Keys als für öffentliche Clients geeignet, sofern Row Level Security korrekt aktiv ist; Secret-/Service-Role-Keys umgehen Schutzmechanismen und gehören nur auf einen vertrauenswürdigen Server. Siehe [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Securing your data](https://supabase.com/docs/guides/database/secure-data) und [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Datenflüsse und Datenschutz-Standards

| Funktion | Übertragung | Standard | Empfehlung |
|---|---|---|---|
| Fahrt aufzeichnen | Sensorik, GPS, optional Video nur lokal | aktiv | Rohdaten lokal halten; klare Löschfunktion anbieten |
| Parkkarte | gerundeter Standort an OSM-Kacheln/Overpass | aus | erst nach Klick; Caching und fair-use-konforme Tile-Nutzung |
| Wetter | gerundeter Standort an Open-Meteo | aus | gesondert aktivieren; Quelle und Abrufzeit mitspeichern |
| Stockbild | Suchbegriff an Wikimedia Commons | nur nach Klick | nur PD/CC0/CC BY; Urheber, Lizenz und Quelle dauerhaft anzeigen |
| Community | Profil, Freigaben, XYZ-Modell, abgeleitete Telemetrie | aus | Zustimmung, RLS, Sichtbarkeit, Widerruf, Export und Löschung |

Die DSGVO-Grundsätze verlangen unter anderem Transparenz, Zweckbindung, Datenminimierung, Speicherbegrenzung, Sicherheit und Nachweisbarkeit. Quelle: [Europäische Kommission – Datenschutzgrundsätze](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en).

Vor dem öffentlichen Start sollte eine Datenschutz-Folgenabschätzung geprüft und dokumentiert werden. Eine App, die Standortverläufe systematisch erfasst und mit Community-Profilen verbindet, kann ein erhöhtes Risiko erzeugen. Orientierung: [EDPB – Be compliant](https://www.edpb.europa.eu/sme-data-protection-guide/be-compliant_en) und [BfDI – Location Based Services](https://www.bfdi.bund.de/DE/Buerger/Inhalte/Telefon-Internet/TelekommunikationAllg/LocationBasedServices.html).

## Was rechtlich und organisatorisch noch festgelegt werden muss

- vollständiger Verantwortlicher mit ladungsfähiger Anschrift und Kontakt;
- Rechtsgrundlage je Zweck: lokale Messung, externe Standortabfrage, Wetter, Community-Veröffentlichung, Moderation und Support-Logs;
- Aufbewahrungs- und Löschfristen je Datenklasse, einschließlich Backups und Diagnose-Logs;
- Verfahren für Auskunft, Berichtigung, Löschung, Datenübertragbarkeit, Widerspruch und Widerruf;
- Alterskonzept und gegebenenfalls elterliche Zustimmung;
- Community-Regeln, Meldesystem, Sperr-/Beschwerdeprozess und Reaktionszeiten;
- Bildrechte, Rechte abgebildeter Personen und Marken-/Hausrechtsfragen bei Park- und Attraktionsbildern;
- Auftragsverarbeitungsverträge und Drittlandtransfers aller eingesetzten Anbieter;
- Incident-Response, Berechtigungskonzept, Admin-Audit-Log, Backups und Wiederherstellungstest.

Die eingebaute Löschung entfernt Community-Inhalte, aber nicht automatisch das Supabase-Auth-Konto. Für eine vollständige Kontolöschung ist eine serverseitige Edge Function oder ein eigener Serverendpunkt erforderlich. Nur dort darf ein Service-Role-/Secret-Key verwendet werden. Der Endpunkt muss die aktuelle Sitzung prüfen, erneute Bestätigung verlangen, rate-limitiert sein und die Aktion revisionssicher protokollieren, ohne gelöschte Inhaltsdaten im Log zu duplizieren.

## Kostenrahmen

Die [Supabase-Preisseite](https://supabase.com/pricing) nennt für Pro derzeit 25 US-Dollar pro Monat. Der Plan enthält unter anderem 100.000 MAU, 8 GB Datenbank, 250 GB Egress und tägliche Backups; das konkrete Projekt-Compute wird über ein enthaltenes Compute-Guthaben verrechnet. Die aktuellen Free-Kontingente nennt die [Billing-Dokumentation](https://supabase.com/docs/guides/platform/billing-on-supabase), unter anderem 50.000 MAU, 500 MB Datenbank, 1 GB Storage und 5 GB Egress. Free-Projekte können bei geringer Aktivität pausiert werden; siehe [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

Praktisch:

- Für Entwicklung und wenige Testnutzer reicht meist Free.
- Für eine verlässlich erreichbare öffentliche Community ist Pro ab 25 US-Dollar/Monat die realistische Untergrenze.
- Bilder und besonders Videos treiben Storage/Egress schnell hoch. Die aktuelle Synchronisierung lädt deshalb keine Videos hoch.
- Hinzu kommen gegebenenfalls E-Mail-Versand, Fehlerüberwachung, Moderation, Backups außerhalb von Supabase und ein kostenpflichtiger Wetterdienst.

Open-Meteo stellt die Wetterdaten unter CC BY 4.0 bereit. Das kostenlose API-Angebot ist laut [Lizenzseite](https://open-meteo.com/en/license) und [Bedingungen](https://open-meteo.com/en/terms) für nicht-kommerzielle Nutzung mit Grenzen vorgesehen; vor Monetarisierung sollte ein passender kommerzieller Tarif vereinbart werden. Die App speichert die Attribution mit dem Wetter-Snapshot.

Für OpenStreetMap sind Attribution und die Nutzungsregeln des öffentlichen Tile-Servers einzuhalten; die öffentliche Infrastruktur ist kein garantiertes, unbegrenzt nutzbares CDN. Quelle: [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/). Bei relevantem Wachstum sollte ein eigener oder kommerzieller Tile-Anbieter eingesetzt werden.

Bei Wikimedia Commons ist die Lizenz jedes einzelnen Bildes maßgeblich. RideTracker akzeptiert bei der automatischen Auswahl nur Public Domain, CC0 oder CC BY und speichert Titel, Urheber, Lizenz und Quell-URL. Trotzdem muss die konkrete Credit Line sichtbar bleiben. Orientierung: [Commons – Credit line](https://commons.wikimedia.org/wiki/Commons:Credit_line).

## Abnahmetests vor Produktion

- Ein Nutzer kann niemals Daten eines fremden privaten Profils oder einer privaten Fahrt lesen.
- Direkte REST-Schreibversuche auf Community-Tabellen schlagen fehl.
- Synchronisierung ohne aktuelle Datenschutzzustimmung schlägt serverseitig fehl.
- Nach Widerruf kann nicht weiter synchronisiert werden.
- Export enthält nur Daten der aktuellen Identität.
- Löschung entfernt eigene Community-Daten und aktualisiert betroffene Streckenmodelle.
- Ein gestohlener Publishable-Key allein eröffnet keine zusätzlichen Rechte.
- Moderator- und Admin-RPCs schlagen für normale Mitglieder fehl.
- Diagnose- und Moderationslogs enthalten keine Rohkoordinaten, Passwörter, Token oder unnötige Inhaltskopien.
- Wiederherstellung und Schlüsselrotation wurden in einer Testumgebung geprobt.
