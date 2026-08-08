# Vorlage Datenschutzhinweis RideTracker – nicht ungeprüft veröffentlichen

Version: `2026-08-08-v1`

Diese Vorlage enthält Pflicht-Platzhalter. Sie muss vor einer produktiven Community-Aktivierung durch den tatsächlichen Betreiber ausgefüllt und rechtlich geprüft werden.

## 1. Verantwortlicher

**[Vollständiger Name/Firma]**

**[Ladungsfähige Anschrift]**

**[E-Mail und weitere Kontaktdaten]**

**[gegebenenfalls Datenschutzbeauftragter]**

## 2. Zwecke, Datenarten und Rechtsgrundlagen

| Zweck | Daten | Rechtsgrundlage | Speicherdauer |
|---|---|---|---|
| Lokale Fahrtmessung | Sensor-, GPS-, Fahrt- und optionale Videodaten auf dem Gerät | **[festlegen]** | bis zur lokalen Löschung |
| Parkkarte | gerundeter Standort, IP-/Verbindungsdaten bei OSM/Overpass | **[festlegen]** | **[festlegen/verlinken]** |
| Wetter | gerundeter Standort, Wetterabfrage bei Open-Meteo | **[festlegen]** | lokaler Snapshot bis zur Fahrtlöschung; Anbieterlogs siehe Anbieter |
| Community-Konto | E-Mail, Profil, technische Sitzungsdaten | **[festlegen]** | bis zur Kontolöschung bzw. gesetzlicher Frist |
| Community-Freigabe | Park/Bahn, XYZ-Modell, abgeleitete Geschwindigkeit/G-Kräfte, Sichtbarkeit, Beitrag | **[festlegen]** | bis Widerruf/Löschung bzw. definierter Frist |
| Freunde/Feed/Meldungen | Beziehungen, Beiträge, Meldungs- und Moderationsdaten | **[festlegen]** | **[festlegen]** |
| Support/Diagnose | Geräte-/Appzustand, Fehler und Aktionen ohne Rohkoordinaten | **[festlegen]** | **[festlegen]** |

Rohe GPS-Koordinaten und Videos werden in der aktuellen Community-Synchronisierung nicht an Supabase übertragen. Nutzer müssen ausdrücklich darauf hingewiesen werden, falls sich dies später ändert.

## 3. Empfänger und Auftragsverarbeitung

- Supabase: **[Projektregion, Vertragsgrundlage, DPA/AVV, Transfermechanismus]**
- OpenStreetMap/Overpass: **[konkrete Endpunkte und Hinweise]**
- Open-Meteo: **[Tarif, Vertrag und Hinweise]**
- Wikimedia Commons: nur bei aktiver Bildsuche; **[Hinweise]**
- Hosting/GitHub Pages: **[Vertrag, Serverlogs, Transfer]**
- weitere Anbieter: **[vollständig ergänzen]**

## 4. Freiwilligkeit und Widerruf

Der lokale Modus funktioniert ohne Community-Konto. Optionale Park-, Wetter- und Bildabfragen werden erst nach Nutzeraktion ausgeführt. **[Beschreiben, wie Zustimmung widerrufen wird und welche Folgen dies hat.]**

## 5. Sichtbarkeit und Community

**[Private/Freunde/Öffentlich detailliert erklären.]** Öffentliche Inhalte können von Dritten kopiert oder außerhalb des Dienstes weiterverbreitet werden. **[Moderations-, Melde- und Beschwerdeprozess verlinken.]**

## 6. Betroffenenrechte

**[Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch, Widerruf und Beschwerderecht mit zuständiger Aufsichtsbehörde beschreiben.]** Der integrierte Export und die Community-Löschung ersetzen nicht die Bearbeitung weitergehender Anfragen oder die vollständige Löschung des Auth-Kontos.

## 7. Minderjährige

**[Mindestalter, Altersprüfung und gegebenenfalls elterliche Zustimmung festlegen.]**

## 8. Sicherheit und Speicherfristen

**[RLS, Zugriffskontrollen, Verschlüsselung, Backups, Logfristen, Incident-Response und Löschung aus Sicherungskopien in verständlicher Form beschreiben.]**

## 9. Änderungen

Bei einer Änderung der Zwecke, Empfänger oder Datenarten wird eine neue Hinweisversion veröffentlicht und – soweit erforderlich – eine erneute aktive Zustimmung eingeholt. Die technische Version dieser Vorlage lautet `2026-08-08-v1` und muss mit `current_privacy_notice_version()` in Migration 002 übereinstimmen.
