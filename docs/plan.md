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
| 4 | Fahrt und Arbeit mit LWK-Flächenleistung, Anfahrt, Diesel, Betriebsstunden | umgesetzt (dazu Fahrprofile, Kurven, Rüstzeiten, Arbeitszeit des Chefs, Rechtsklick-Menü) |
| 5 | Rechnung, Kontostand, Kundenzufriedenheit; Spielstand in SQLite | umgesetzt |

## Vorgemerkt (aus Rückmeldungen von Nils)

- **Geschwindigkeiten je Fahrzeugart** (5. Nov. 2026, umgesetzt in Schritt 4 für Pkw und Schlepper): Pkw sind deutlich schneller als Schlepper
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

## Fahrt und Arbeit (Schritt 4, Annahmen)

- **Fahrprofile:** Schlepper 40 km/h (Landstraße Ø 38, innerorts 30, Feldweg 15). Pkw bis
  100 km/h (Landstraße Ø 85–95, innerorts 45, Feldweg 25). Tempolimits aus OSM (`maxspeed`,
  `zone:maxspeed`); Pkw fahren im Schnitt 95 % des Limits. Selbstfahrer und Lkw folgen mit dem
  Maschinenkatalog.
- **Kurven:** Vor und nach Richtungswechseln wird auf einer Strecke von 25 m (Schlepper) bzw.
  40 m (Pkw) abgebremst: über 90° 10/15 km/h, 60–90° 15/25, 30–60° 25/45, 15–30° 32/70 km/h.
  Angefahren und angehalten wird ebenso langsam.
- **Feldarbeit:** Bahnen im Arbeitstempo des Geräts (Grubber 10 km/h, Kurzscheibenegge 12 km/h),
  Wenden 6 km/h. Die übrige Zeit bis zur LWK-Flächenleistung (ha/h) steht das Gespann am Vorgewende.
- **Rüstzeiten:** 15 min Anbauen am Hof, 5 min Einrichten je Feld, 10 min Abbauen.
- **Diesel:** Schlepper auf der Straße 0,35 l/km, bei der Arbeit Grubber 9 l/ha und
  Kurzscheibenegge 6 l/ha, Pkw 0,07 l/km. Preis 1,35 €/l netto (Agrardiesel). Die Kosten gehen
  sofort vom Konto ab und werden je Auftrag festgehalten.
- **Arbeitszeit des Chefs:** höchstens 10 h am Tag (ArbZG § 3), Tageswechsel um 06:00. Danach
  macht das Gespann Feierabend, wo es gerade ist, und fährt am nächsten Morgen weiter.
- **Rechtsklick auf Fahrzeuge:** Status, Tempo, Betriebsstunden, Auftrag mit Diesel; Befehl
  „Zurück zum Hof“, auch mitten im Feld. Ein unterbrochener Auftrag bleibt offen, erledigte
  Felder zählen.
- **Karte:** kein Umkreis mehr. Verschieben und Zoomen nur innerhalb der Kartendaten,
  Hintergrund in Landfarbe, damit keine grauen Ränder entstehen.

## Rechnung, Konto, Spielstand (Schritt 5)

- **Rechnung (AK-09):** Nach Abschluss eines Auftrags automatisch, netto, Nummer `RE-Jahr-0001`,
  Zahlungsziel 14 Tage. Wann der Kunde zahlt, hängt von seiner Zufriedenheit ab: ab 60 % nach
  3–12 Tagen, 40–60 % nach 10–20 Tagen, darunter nach 18–35 Tagen (dann oft überfällig).
- **Konto (WF-08):** Buchungen für Zahlungseingänge, Maschinenkäufe und Diesel (täglich
  zusammengefasst), Monatsübersicht nach Kategorien im Reiter „Finanzen“.
- **Auswertung je Auftrag (WF-09):** Erlös minus Diesel minus kalkulatorische Maschinenkosten
  (Annahmen: Reparatur Schlepper 8 €/h, Verschleiß Grubber 3 €/ha). Lohn des Chefs nicht eingerechnet.
- **Spielstand:** In der App eine SQLite-Datei je Spielstand im App-Datenordner
  (`spielstand-<name>.db`, Verzeichnis `spielstaende.db`). Die Datei enthält Tabellen `meta` (mit
  Schema-Version), `zustand` (vollständiger Zustand als JSON), `buchungen`, `rechnungen` und
  `kunden`. Im Browser landet der Spielstand im localStorage. Autosave einmal je Spieltag; beim
  Start geht es mit dem Autosave weiter (`?neu` startet ein neues Spiel). Laden ist bitgleich:
  Ein geladener Stand rechnet exakt so weiter wie das Original.
