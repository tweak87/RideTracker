# RideTracker – GPS-Tempo, Kompass und räumlicher 3D-Inspektor

## Version und Rollback

- Version: `2026.08.08-speed-compass-3d.1`
- gesicherter Ausgangsstand: `9a0d225bd291f1c5c3b65cb4f507f898dcf5a83b`
- Rollback-Branch: `rollback/pre-speed-compass-3d-20260808`
- lokales Tag: `speed-compass-3d-baseline-20260808`

Der Rollback-Punkt enthält das Community-Backend und den bisherigen 3D-Viewer, aber noch nicht die Änderungen dieses Pakets.

## Geschwindigkeit

`GeolocationCoordinates.speed` wird in Metern pro Sekunde geliefert, kann in iOS Safari aber `null`, veraltet oder vorübergehend `0` sein. RideTracker kombiniert deshalb eine plausible native Angabe mit einer geometrischen Schätzung aus mehreren Fixes der letzten zwölf Sekunden. Längere Zeitfenster erhalten Vorrang, aus bis zu vier Fenstern wird der Median gebildet und unrealistische Sprünge werden verworfen. Die horizontale Genauigkeit beeinflusst Rauschabzug und Konfidenz, darf bei einem schlechten ersten Fix aber nicht mehr die gesamte erkennbare Bewegung auslöschen.

Ohne belastbare Quelle wird `–` angezeigt. Das ist fachlich korrekter als eine scheinbar genaue `0 km/h`.

## G-Kräfte ohne GPS

Für G-Kräfte ist kein GPS nötig. Das Telefon liefert mit `accelerationIncludingGravity` die drei Geräteachsen in `m/s²`. Nach der Kalibrierung bestehen drei Einheitsvektoren für oben, seitlich und vorwärts. Für den Beschleunigungsvektor **a** gilt:

```text
normalG       = dot(a, up)      / 9.80665
lateralG      = dot(a, lateral) / 9.80665
longitudinalG = dot(a, forward) / 9.80665
totalG        = sqrt(normalG² + lateralG² + longitudinalG²)
```

Im Stillstand liegt `normalG` deshalb ungefähr bei `+1 g`. GPS liefert getrennt davon Position, Strecke, Tempo und eine langfristige Fahrtrichtung. Aus Beschleunigung allein wird keine Geschwindigkeit berechnet: Bias, Schwerkraftanteil und kleinste Orientierungsfehler würden bei der Integration schnell ein falsches Tempo erzeugen.

## Kompass-Widget

Das Element **Kompass** steht im HUD-Editor für Hoch- und Querformat zur Verfügung. Die Quellenpriorität ist:

1. `webkitCompassHeading` auf iOS,
2. absolute `DeviceOrientation`,
3. GPS-Kurs bei mindestens `1,5 m/s`.

Die Anzeige wird kreisförmig geglättet, damit der Übergang von `359°` zu `0°` nicht springt. In Stahlachterbahnen kann das Magnetfeld stark gestört sein; während der Fahrt ist der GPS-Kurs daher ein wichtiger Rückfall.

## Räumlicher Inspektor

- X: Ost/West in Metern
- Y: relative Höhe in Metern
- Z: Nord/Süd in Metern

Ziehen dreht das Modell. Zwei Finger oder Umschalt-Ziehen verschieben es, Pinch oder Mausrad zoomt. Die Ansichten **3D**, **Oben**, **Vorne** und **Seite** richten die Kamera definiert aus. Ein Tipp auf die Strecke wählt den nächsten sichtbaren Modellpunkt und zeigt alle dort vorhandenen Telemetriewerte.

Die räumliche Strecke benötigt GPS-/GNSS-Punkte und eine Höhenquelle. Ohne GPS können Kraftverläufe weiter ausgewertet werden, aber RideTracker erzeugt bewusst keine scheinpräzise XYZ-Route durch doppelte Integration des Accelerometers.

## Laufzeitfehler

Browserfehler werden nur einmal pro Fehlerquelle und kurzem Zeitfenster verarbeitet. Der Hinweis blockiert die Navigation nicht und verschwindet automatisch; Stack, Datei und Zeile bleiben im Support-Paket erhalten.
