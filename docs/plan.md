# Arbeitsplan

Ergänzt „Vorgehen und Meilensteine“ in [anforderungen.md](anforderungen.md). Zielplattformen:
Windows und macOS (kein Linux).

## Phase 2: Prototyp der Kern-Schleife

Jeder Schritt endet mit einer spielbaren Windows-Version.

| Schritt | Inhalt | Stand |
| --- | --- | --- |
| 1 | Echte Felder auf der Karte (feste IDs, Fläche, Zufahrt); Fahrzeuge arbeiten im echten Feld | umgesetzt (Kartendaten v3) |
| 2 | Kunden-Betriebe auf echten Feldern, Hof mit Startschlepper und Startkapital | umgesetzt |
| 3 | Anfrage → Auftrag (zuerst Grubbern), Annehmen/Ablehnen/Verhandeln, Fahrer und Maschine zuweisen, einfache Planungstafel; Anfragen als Liste (Smartphone in Phase 3) | umgesetzt (mit Besuch per Firmenwagen und Gerätekauf) |
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

## Felddaten (Stand 5. Nov. 2026)

| Land | Quelle | Lizenz | im Spiel |
| --- | --- | --- | --- |
| Niedersachsen, Bremen, Hamburg | Feldblöcke ML/SLA (sla.niedersachsen.de) | dl-de/by-2-0 | ja |
| Schleswig-Holstein | Feldblöcke (service.gdi-sh.de, Atom-Feed) | dl-de/zero-2-0 | ja |
| Brandenburg | Feldblockkataster (data.geobasis-bb.de) | dl-de/by-2-0 | ja |
| Mecklenburg-Vorpommern | Feldblockkataster (geodaten-mv.de) | unklar: WFS-Metadaten nennen Urheberrecht | nein, OSM-Ackerflächen |
| Sachsen-Anhalt | – | keine offenen Daten gefunden | nein, OSM-Ackerflächen |

Ein Feldblock kann mehrere Schläge verschiedener Betriebe umfassen. Im Prototyp gilt ein
Feldblock als ein Feld; eine Aufteilung in Schläge ist später möglich.

## Kundenbetriebe (Schritt 2, Annahmen)

- Rund 2.000 Betriebe (Festlegung im Doc), Anzahl = Fläche / 105 ha, höchstens 2.000.
- Felder per gewichteter Voronoi-Teilung um zufällige Startfelder: unterschiedliche Größen.
- Viehhaltung: Wahrscheinlichkeit 38 % + 50 % × Grünlandanteil (LZ 2020: gut die Hälfte der Betriebe).
- Kulturen auf dem Acker: Uelzen/Lüneburg Getreide 38 %, Mais 18 %, Kartoffeln 14 %, Rüben 12 %,
  Raps 10 %, Ackerfutter 8 % (Annahme); Altmark nach LBEG-Steckbrief; Viehbetriebe mehr Mais/Futter.
- Eigenmechanisierung 0–1 wächst mit der Betriebsgröße; bestimmt ab Schritt 3 den Bedarf an Lohnarbeit.
- Kontaktvorliebe Anruf oder Nachricht je zur Hälfte (KK-10); alle Betriebe zu Beginn unbekannt (KK-01).
- Namen erfunden aus häufigen norddeutschen Familiennamen.
- Startbetrieb: Fendt 720 Vario (Bj. 2014, 9.000 h, Wert nach Startformel 70.208 €), Firmenwagen
  (Annahme: Bj. 2018, Neupreis 38.000 €), 100.000 € Konto, 150.000 € Kreditrahmen.

## Anfragen und Aufträge (Schritt 3, Annahmen)

- Kontakt erst nach Besuch (KK-01): Der Chef fährt mit dem Firmenwagen auf echten Straßen
  zur Hofstelle, bleibt 30 min und fährt zurück. Beim Besuch fragt er, ob etwas ansteht (KK-04).
- Grubber-Saison: März–Mai (vor Mais, Rüben, Kartoffeln) und August–Oktober (Stoppel).
- Anfrage beim Besuch mit Wahrscheinlichkeit 20 % + 70 % × (1 − Eigenmechanisierung); danach
  täglich 6 % + 10 % × (1 − Eigenmechanisierung) per Anruf bzw. Nachricht (Vorliebe des Betriebs).
- Bis 3 Felder, zusammen ≤ 60 ha; Feldblöcke über 60 ha kommen nicht als Einzelauftrag.
- Preis: 55 €/ha (Annahme: Schlepper + Fahrer + Diesel; Anhaltspunkte: alter MR-Satz Tieflockern
  55 €/ha, Kleinanzeige 110 €/ha) ± 8 %. Gegenangebot: +10 % → 60 % Zusage, ab +25 % keine.
- Antwortfrist 2 Tage (KK-09), sonst verfällt die Anfrage (Zufriedenheit −5).
- Pünktlich fertig: Zufriedenheit +5, verspätet −10; Ablehnen −2, abgelehntes Gegenangebot −3.
- Gebrauchtgeräte zum Start (Annahme nach Inseraten): Horsch Terrano 4 FX 12.500 €,
  Köckerling Trio 300 7.900 €, Horsch Joker 3 CT 11.900 €.
- Betriebsstunden: Schlepper und Gerät je Feld um Fläche / Flächenleistung.
- Rechnung, Diesel- und Lohnkosten folgen mit Schritt 4/5.
