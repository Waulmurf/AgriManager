# Arbeitsplan

Ergänzt „Vorgehen und Meilensteine“ in [anforderungen.md](anforderungen.md). Zielplattformen:
Windows und macOS (kein Linux).

## Phase 2: Prototyp der Kern-Schleife

Jeder Schritt endet mit einer spielbaren Windows-Version.

| Schritt | Inhalt | Stand |
| --- | --- | --- |
| 1 | Echte Felder auf der Karte (feste IDs, Fläche, Zufahrt); Fahrzeuge arbeiten im echten Feld | in Arbeit |
| 2 | Kunden-Betriebe auf echten Feldern, Hof mit Startschlepper und Startkapital | offen |
| 3 | Anfrage → Auftrag (zuerst Grubbern), Annehmen/Ablehnen/Verhandeln, Fahrer und Maschine zuweisen, einfache Planungstafel; Anfragen als Liste (Smartphone in Phase 3) | offen |
| 4 | Fahrt und Arbeit mit LWK-Flächenleistung, Anfahrt, Diesel, Betriebsstunden | offen |
| 5 | Rechnung, Kontostand, Kundenzufriedenheit; Spielstand in SQLite | offen |

## Vorgemerkt (aus Rückmeldungen von Nils)

- **Geschwindigkeiten je Fahrzeugart** (5. Nov. 2026): Pkw sind deutlich schneller als Schlepper
  und Selbstfahrer. Geplant sind eigene Fahrprofile mit Höchstgeschwindigkeit und Durchschnitt je
  Straßenklasse. Pkw/Firmenwagen fahren bis 100 km/h außerorts und 50 im Ort. Schlepper fahren 40
  oder 50 km/h je nach Zulassung, Selbstfahrer wie Feldhäcksler, Mähdrescher und Roder 20–40 km/h.
  Lkw fahren 60 km/h auf Landstraßen und 80 auf der Autobahn. Umsetzung mit Schritt 4, die
  Fahrzeugdaten kommen aus dem Maschinenkatalog. Folge für den Straßengraphen: Autobahnen und
  Kraftfahrstraßen sind nötig, mit Freigabe je Fahrzeugart (für Pkw und Lkw ja, für Schlepper nein).
- **Lkw** (5. Nov. 2026): In einer späteren Phase kommen Lkw-Zugmaschinen (Sattelzugmaschinen)
  dazu. Auflieger bzw. Anhänger (Kipper, Schubboden, Tankauflieger für Gülle) kauft der Spieler
  separat. Das passt zu den geplanten Transportaufträgen (siehe „Abgrenzung“) und braucht einen
  Führerschein-Skill (LKW, PA-10). Vorschlag: zusammen mit den Transportaufträgen nach Phase 5.
