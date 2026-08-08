# RideTracker – Sensor-Mathematik und Diagnosemodell

## G-Ball mit Verlaufsschweif

Die aktuelle Oberfläche stellt G-Kräfte in zwei bewusst getrennten Bildern dar:

- **Draufsicht:** Die horizontale Position kombiniert Seitenkraft (links/rechts) und Längskraft (beschleunigen/bremsen). Der Abstand vom Mittelpunkt entspricht dem horizontalen Gesamtwert `sqrt(lateral² + longitudinal²)`.
- **Vertikallast:** Ein eigener Punkt läuft von negativer Last beziehungsweise Airtime bis zu hoher positiver Last. Die Referenz bei `+1 g` entspricht näherungsweise dem ruhenden Telefon.
- **Schweif:** Die letzten rund drei Sekunden werden mit abnehmender Deckkraft nachgezogen. Beim Zurückspringen im Replay wird der alte Schweif verworfen, damit keine zeitlich falsche Verbindung entsteht.

Farben dienen als Orientierung und nicht als sicherheitstechnische Grenzwertbewertung: Violett kennzeichnet sehr geringe Vertikallast/Airtime, Cyan/Grün den normalen Bereich, Gelb erhöhte und Rot/Pink hohe gemessene Last.

## Reihenfolge der Kontextbestimmung

Vor dem Start werden nur Aufnahmekette, Sensoren, Kamera, Kalibrierung und – nach ausdrücklicher Aktivierung – ein Wetter-Snapshot vorbereitet. Eine Parkabfrage findet nicht statt. Erst das Ereignis `ridetracker:recording-stopped` erzeugt aus den aufgezeichneten GPS-Punkten einen robusten repräsentativen Standort und bietet danach Karte, Parkkandidaten und Attraktionsauswahl an.

## 1. Welche Sensoren wofür verwendet werden

### Accelerometer / Beschleunigung

Primäre Quelle für hochfrequente G-Kräfte. Liefert gerätebezogene Beschleunigung bzw. spezifische Kraft. Für RideTracker wird auf die Erdbeschleunigung normiert:

`gDevice = aDevice / g0`

mit `g0 = 9.80665 m/s²`.

### Gyroskop

Misst Winkelgeschwindigkeit um die Geräteachsen. Das Gyro misst keine G-Kraft direkt. Es hilft, die Orientierung des Smartphones relativ zur Fahrt über kurze Zeit stabil zu verfolgen.

### GPS / GNSS

Verwendet für:

- Position / Strecke
- Geschwindigkeit
- Höhen-/Positionskontext
- Fahrtrichtung über längere Zeit
- Park-/Bahn-Erkennung
- spätere Streckenrekonstruktion

GPS ist zu langsam und zu verrauscht, um schnelle G-Kraft-Spitzen direkt zu bestimmen.

Fehlt GPS vollständig, bleiben die G-Kräfte deshalb weiterhin verfügbar. Nicht verfügbar sind dann nur belastbare Geschwindigkeit, globale Position und eine GPS-basierte räumliche Strecke. Eine doppelte Integration der Telefonbeschleunigung wird für die Geschwindigkeit bewusst nicht verwendet, weil kleinste Bias- und Orientierungsfehler innerhalb weniger Sekunden stark anwachsen.

### Barometer

Wenn verfügbar bevorzugte Quelle für relative Höhenänderungen. GPS-Höhe ist meist deutlich verrauschter.

### Magnetometer

Kann prinzipiell Heading unterstützen, ist bei Stahlkonstruktionen, Motoren und Magnetbremsen stark störanfällig. Daher nicht als alleinige Orientierungsquelle verwenden.

## 2. Fahrzeugkoordinaten

Nach der Kalibrierung verwendet RideTracker:

- X: lateral, rechts positiv
- Y: longitudinal, vorwärts positiv
- Z: vertikal, oben positiv

Die Kalibrierung bestimmt eine Transformationsmatrix bzw. Quaternion von Geräteachsen in Fahrzeugachsen.

Vereinfachte Darstellung:

`gRide = R_device_to_ride × gDevice`

Danach:

- `lateralG = gRide.x`
- `longitudinalG = gRide.y`
- `normalG / verticalG = gRide.z`
- `totalG = sqrt(x² + y² + z²)`

Bei ruhendem, korrekt kalibriertem Telefon soll vertikal ungefähr `+1 G` angezeigt werden.

## 3. Kalibrierung

Die Kalibrierung muss mindestens bestimmen:

1. Ruhelage / Gravitation.
2. Geräte-Vorwärtsrichtung relativ zur Fahrtrichtung.
3. Achsenvorzeichen.
4. optional Sensorbias / Skalierung.

Für externe IMUs zusätzlich speichern:

- Bias/Offset pro Achse
- Scale pro Achse
- Orientation Matrix oder Quaternion
- Zeitpunkt der Kalibrierung
- erwartete SampleRate
- Qualitätsstatus

Eine externe IMU darf ohne eigenes Kalibrierungsprofil nicht einfach als Fahrzeug-X/Y/Z in die Ride Engine eingespeist werden.

## 4. Sensor-Fusion

Empfohlener Ansatz:

- Accelerometer: direkte spezifische Kraft mit hoher Abtastrate.
- Gyro: kurzfristige Orientierungsänderungen.
- Gravitation/Accelerometer: langsame Orientierungsstabilisierung nur in geeigneten Phasen.
- GPS Heading: nur bei ausreichender Geschwindigkeit und guter Genauigkeit als langsame Orientierungshilfe.
- Track-/Streckengeometrie: im Postprocessing als zusätzliche Constraint.

Für die erste robuste Version ist ein Complementary-/Quaternion-Filter sinnvoll. Ein EKF/UKF kann später folgen, wenn Sensormodelle und externe Geräte stabil definiert sind.

## 5. GPS-Geschwindigkeit

Browser und Betriebssysteme liefern `coords.speed` nicht immer zuverlässig. RideTracker verwendet deshalb:

1. native GPS-Geschwindigkeit, wenn plausibel,
2. ansonsten mehrere Zeitfenster aus den letzten zwölf Sekunden statt nur zwei benachbarter Fixes,
3. den Median der längsten plausiblen Streckenfenster,
4. eine gedeckelte Rauschschwelle abhängig von horizontaler Accuracy,
5. Plausibilitätsgrenze gegen extreme Ausreißer,
6. kurze Haltezeit für einen einzelnen fehlenden Fix und zeitliche Glättung.

Ein nativer Nullwert wird bei sehr ungenauer Position nicht mehr automatisch als Stillstand übernommen. Solange weder native noch geometrisch abgeleitete Geschwindigkeit belastbar ist, zeigt RideTracker `–` statt `0 km/h`.

Die abgeleitete Geschwindigkeit wird wieder als normale Telemetriequelle in den SourceRouter eingespeist.

## 6. GPS-Qualität

Relevante verfügbare Größen:

- horizontale Genauigkeit / Accuracy in Metern
- Alter des letzten Fixes
- Anzahl gültiger Fixes
- Geschwindigkeit / Plausibilität
- ggf. Höhenaccuracy

### Satellitenanzahl

Auf Web/iOS-Safari liefert die Geolocation API keine verlässliche Satellitenanzahl. Daher darf RideTracker dort keine erfundene Satellitenzahl anzeigen.

In nativen oder externen GNSS-Protokollen kann Satellite Count, HDOP/VDOP/PDOP, Fix Type, RTK Status etc. ergänzt werden, wenn die jeweilige API bzw. Hardware diese Werte tatsächlich bereitstellt.

## 7. Diagnosemodus

`update60.js` stellt einen Web-Diagnosemodus bereit.

Aktivierung:

- `?diag=1` an die Web-App-URL anhängen.
- Danach erscheint ein `DIAG`-Button.

Diagnose enthält u. a.:

- App-/Commitversion
- aktuelle Route
- NavigationRegistry-Audit
- sichtbare/stale Overlays/Scrims
- deduplizierte Runtimefehler und Promise-Rejections mit Stack, Datei und Zeile
- GPS-Health: Punkte, Accuracy, Speed, Source, Persistenzstatus
- Sensor-Channel-Registry
- Plugin-Verbindungsereignisse
- Source-Switches
- IndexedDB-Store-Status und Anzahl RidePackages/Videos
- Browser-/Viewportdaten

Exakte GPS-Koordinaten werden im normalen Diagnoseexport absichtlich entfernt.

### Safe Boot

Der Diagnose-Layer kann bekannte stale Dialoge/Scrims/Drawer schließen und die Home-Navigation wiederherstellen, sofern keine Aufnahme läuft.

## 8. Zukünftiger Adminmodus

Geplant:

- Diagnosemodus über Einstellungen aktivieren.
- lokale PIN optional als UI-Schutz.
- serverseitig authentifizierter Adminmodus für echte privilegierte Aktionen.
- erweiterte Rohdaten nur nach expliziter Zustimmung.
- Log-Level: normal / debug / sensor-raw.
- Export eines Support-Bundles mit JSON-Log + Konfigurationssnapshot, optional anonymisierten Sensordaten.

Wichtig: Ein Passwort, das nur im Frontend-Code gespeichert/geprüft wird, ist kein echter Sicherheitsschutz. Privilegierte Community-/Backend-Funktionen benötigen serverseitige Authentifizierung und Rollenprüfung.

## 9. Empfohlene Diagnose bei Fehlern

1. App mit `?diag=1` öffnen.
2. Problem reproduzieren.
3. `DIAG` öffnen.
4. `Prüfen & UI freigeben` nur verwenden, wenn die Oberfläche blockiert ist.
5. `Diagnose exportieren`.
6. JSON im Chat bereitstellen.

Bei GPS-Problemen zusätzlich notieren:

- draußen/drinnen
- Standortberechtigung erteilt?
- GPS-Diagnose: Accuracy, Punkte, Speed Source
- ob externe GNSS-Quelle verbunden ist
- ob die Fahrt anschließend gespeichert wurde
