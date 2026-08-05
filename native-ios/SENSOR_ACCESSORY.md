# Optionales RideTracker-BLE-Zubehör

Die native App bleibt ohne externen Sensor voll funktionsfähig. Externe Sensoren werden nur verwendet, wenn sie einen klaren Qualitätsvorteil liefern.

## Sinnvolle Zubehörklassen

1. **Feste Fahrzeug-IMU** – höchste Aussagekraft für echte Fahrzeugachsen, aber nur mit ausdrücklicher Genehmigung des Betreibers und sicherer Montage.
2. **Brusthalter-IMU** – verbessert Reproduzierbarkeit gegenüber einer losen Tasche; misst weiterhin Körper- statt Fahrzeugbewegung.
3. **Externer GNSS-Empfänger** – kann die horizontale Position verbessern, wenn er Multiband-GNSS und eine gute Antennenlage bietet. In Stahlkonstruktionen bleiben Abschattung und Mehrwegeffekte bestehen.
4. **Handgelenksensor** – nur als zusätzliche Körper-/Pulsquelle geeignet; Armbewegungen verschlechtern die Eignung als primäre G-Kraft-Referenz.

## Vorbereitete GATT-Struktur

- Service: `7D1A0001-6F52-4A42-9D9F-524944455452`
- Telemetrie-Characteristic: `7D1A0002-6F52-4A42-9D9F-524944455452`
- Übertragung zunächst als UTF-8-JSON per Notification.

Beispiel:

```json
{
  "timestamp": 12.345,
  "accelerationX": 0.01,
  "accelerationY": -0.12,
  "accelerationZ": 1.84,
  "rotationX": 0.4,
  "rotationY": 2.1,
  "rotationZ": -0.8,
  "latitude": 48.266,
  "longitude": 7.721,
  "altitude": 171.4,
  "horizontalAccuracy": 0.8
}
```

## Empfohlene Eigenbau-Hardware

- Nordic nRF52840 oder ESP32-S3 mit BLE
- IMU mit mindestens ±16 g, besser ±32 g
- Gyroskop mindestens ±2000 °/s
- Abtastrate 100–200 Hz
- lokaler Ringspeicher, damit BLE-Aussetzer keine Daten verlieren
- monotone Sensorzeit und periodische Synchronisation mit dem iPhone
- mechanisch verriegeltes, spielfreies Gehäuse

Ein Sensor am Fahrgeschäft darf nur mit Zustimmung des Betreibers montiert werden. Eine lose oder improvisierte Befestigung ist ungeeignet.
