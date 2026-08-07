# Park- und Bahn-Erkennung

Geplanter nächster RideTracker-Block:

1. Aktuelle bzw. aufgezeichnete GPS-Koordinaten verwenden, um den wahrscheinlichsten Freizeitpark zu bestimmen.
2. Park-Kandidat mit Distanz/Confidence speichern und dem Nutzer anzeigen.
3. Wenn die konkrete Achterbahn nicht eindeutig erkannt werden kann, die Attraktionen/Achterbahnen des erkannten Parks als Dropdown anbieten.
4. Für die ausgewählte oder automatisch erkannte Bahn Referenzdaten laden (Name, Lage/Track-Geometrie, bekannte Streckenparameter, soweit Datenquelle und Lizenz dies erlauben).
5. Eigene aufgezeichnete GPS-/Höhen-/Dynamikdaten gegen die Referenzbahn vergleichen.
6. Mehrere Fahrten derselben Bahn gemeinsam ausrichten, Ausreißer filtern und ein verbessertes Streckenmodell erzeugen.
7. Herkunft, Aktualität und Lizenz der externen Referenzdaten im RidePackage dokumentieren.

Die Erkennung muss auch ohne externe Referenzdaten funktionieren: Park und Bahn bleiben manuell auswählbar/editierbar.
