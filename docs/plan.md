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
- **Warteschlange je Fahrer** (5. Nov. 2026, für den Chef umgesetzt): Ist der Chef unterwegs,
  werden Besuche und Aufträge eingeplant statt abgelehnt. Sie starten nacheinander, sobald er
  frei ist: zwischen 06:00 und 20:00 und nur, solange er noch Arbeitszeit übrig hat. Die
  Reihenfolge lässt sich ändern, einzelne Einträge lassen sich streichen (Planungstafel im Reiter
  Aufträge). Ein Eintrag, der beim Start nicht mehr möglich ist (z. B. Auftrag schon fertig),
  wird mit einer Warnung übersprungen. In Phase 3 bekommt jeder Mitarbeiter eine eigene
  Warteschlange.
- **Kundenbindung und Konkurrenz** (5. Nov. 2026, umgesetzt):
  - Zufriedenheit sinkt: Anfrage nicht beantwortet −5, abgelehnt −2, Gegenangebot abgelehnt −3,
    Auftrag verspätet −10, Zahlungserinnerung −3. Sie steigt durch pünktliche Aufträge (+5) und
    Besuche (+2).
  - Fällt sie unter 20 %, wechselt der Kunde für 60–120 Tage zur Konkurrenz. In der Zeit kommen
    keine Anfragen, offene Anfragen verfallen, ein Besuch bringt nichts. Es gibt eine Warnung.
  - Danach startet er bei 25 % in einer Probephase: nur kleine Anfragen (ein Feld bis 10 ha),
    halb so häufig. Ab 40 % gibt es wieder normale Aufträge.
  - Folge fürs Spiel: Lieber ablehnen als nicht antworten oder zu spät liefern.
- **Zeitschätzung** (5. Nov. 2026, umgesetzt): Für jede offene Anfrage und jeden Auftrag
  zeigt das Spiel Dauer und Arbeitstage an, dazu den voraussichtlichen Fertigtermin hinter
  allem, was schon läuft oder geplant ist. Eine Ampel vergleicht ihn mit dem Termin des Kunden.
  - Grundlage: Rüstzeiten, Fahrten (Luftlinie × 1,35 bei 28 km/h, nächstes Feld zuerst) und die
    Flächenleistung des besten eigenen Grubbers bzw. des Marktangebots.
  - Abgleich im Test: geschätzt 1.179 min, tatsächlich 1.173 min.
- **Planungsboard** (5. Nov. 2026, geplant für Phase 3 mit Personal und mehreren Maschinen):
  - Zeitleiste: Zeilen je Fahrer, Spalten je Tag (06–20 Uhr), Wochenansicht mit Blättern.
    Aufträge sind Balken mit der Länge aus der Zeitschätzung. Unten liegen ungeplante Aufträge
    und Anfragen mit Termin.
  - Per Ziehen: Auftrag auf einen Fahrer und Tag legen, verschieben, Reihenfolge tauschen. Am
    Balken lassen sich Schlepper, Gerät und bei Ketten weitere Rollen (Abfahrer, Radlader)
    zuweisen.
  - Prüfungen mit Warnung am Balken: Maschine doppelt belegt, Gerät passt nicht zum Schlepper
    (PS), Führerschein fehlt, Arbeitszeit überschritten, Termin des Kunden verpasst, Fahrer hat
    Urlaub.
  - Technik: Das Board schreibt in die Warteschlangen der Fahrer, die Simulation arbeitet sie
    ab (heutige Warteschlange des Chefs = erste Ausbaustufe). Mit Startzeit je Eintrag („nicht
    vor Di 07:00“), damit sich Ketten mit mehreren Fahrern gleichzeitig starten lassen.
  - Anfragen lassen sich direkt aus dem Board annehmen oder ablehnen. So sieht man vor der
    Zusage, ob noch Platz ist.
- **Arbeitsketten** (5. Nov. 2026): Häcksler arbeitet nur mit Abfahrer nebenher; Drescher und
  Roder laden auf Anhänger (angekoppelt oder abgestellt) im Feld bzw. am Feldrand ab; der
  Rübenroder legt eine Feldrandmiete an, die ein Reinigungslader („Rübenmaus“) auf Anhänger
  verlädt. Man kann sich auch mit Abfahrgespannen an fremden Ketten beteiligen, oder der
  Landwirt bucht nur den Häcksler und stellt den Rest selbst. Radlader und Siloverteiler bzw.
  Walze gehören zur Kette am Silo. Recherchierte Abläufe aller Maschinen mit Kennzahlen und Quellen: `docs/ablaeufe.md`.
  Grundlagen (Rollen im Auftrag, Anhänger als eigene Einheit) in Phase 3, Ernteketten in Phase 4.

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
  Zahlungsziel 30 Tage (geändert nach Rückmeldung von Nils, 5. Nov. 2026). Der Kunde zahlt an
  einem beliebigen Tag innerhalb der 30 Tage. Mit der Wahrscheinlichkeit
  0,05 + 0,35 × (1 − Zufriedenheit/100) zahlt er nicht von selbst.
- **Mahnwesen:** Ist eine Rechnung nach 30 Tagen offen, wird sie „überfällig“: Warnung in den
  Meldungen, blinkender Hinweis in der oberen Leiste und Zähler am Reiter Finanzen. Der Spieler
  muss den Kunden innerhalb von 14 Tagen kontaktieren: Knopf „Kunden anrufen“ an der Rechnung
  (10 min Arbeitszeit des Chefs) oder ein Besuch auf dem Hof. Danach zahlt der Kunde in 1–10
  Tagen, die Zufriedenheit sinkt um 3. Ohne Kontakt verfällt die Rechnung (Forderungsausfall,
  im Finanzen-Reiter ausgewiesen).
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

## Phase 3: Fuhrpark und Personal (ab 5. Nov. 2026)

Schritte:
1. **Personal** (umgesetzt, siehe unten)
2. **Fuhrpark:** Händler mit Standort und Marken (`docs/maschinen.md`), Kauf neu oder gebraucht,
   Verkauf und Inzahlungnahme, Verschleiß, Wartung, Pannen und Werkstatt (MF-04 bis MF-07,
   HM-04 bis HM-08, MZ-01 bis MZ-12)
3. **Planungsboard** (siehe „Vorgemerkt“)
4. **Urlaub, Krankheit, Zufriedenheit der Mitarbeiter, Zuschläge** (PA-05, PA-11, PA-16, PA-17,
   ZU-01 bis ZU-03)

### Schritt 1: Personal (Annahmen)

- **Bewerbungen (PA-01):** Mit 25 % Wahrscheinlichkeit am Tag kommt eine Bewerbung, höchstens
  5 liegen gleichzeitig vor, jede 7–20 Tage lang. Am ersten Tag gibt es sicher eine.
  - Alter 18–62. Skills: Bodenbearbeitung 1–5 je nach Erfahrung (Alter), weitere Tätigkeiten mit
    35 % Wahrscheinlichkeit. 30 % haben einen Lkw-Führerschein (C/CE).
  - Gehaltswunsch (PA-13): Ecklohn 17 € − 2 € + 1,10 € je Stufe der besten Tätigkeit + 0,15 € je
    weiterer Stufe + 0,80 € mit Führerschein C/CE ± 0,50 €, mindestens Mindestlohn 14,60 €.
  - Der Ecklohn ist eine Annahme: Tarif BLU/IG BAU 2022 15,40 € ([IG BAU](https://igbau.de/Binaries/Binary18281/2022-10-11-TI-zum-Tarifabschluss-BLU.pdf)),
    2025 +3,7 % ([DGB](https://www.dgb.de/service/weiterer-service/tarifmeldungen/tarifmeldung/neuer-entgelttarifvertrag-fuer-lohnunternehmen-mehr-geld-und-bessere-leistungen/)),
    hochgerechnet auf 2027. Die Lohntabelle nach Gruppen ist noch zu recherchieren (ZU-04).
- **Einstellen:** fest (Monatsgehalt = Stundenlohn × 173 h) oder als Saisonkraft
  (Stundenlohn + 8 %, nur geleistete Stunden). Entlassen geht sofort, nicht während der Fahrt.
  Kündigungsfristen kommen mit Schritt 4.
- **Löhne (PA-14, PA-15):** Arbeitgeberanteil 21 % (Annahme). Feste Mitarbeiter je
  Kalendertag 1/30 des Monatsgehalts. Gebucht wird am Monatsersten als „Löhne“ in der neuen
  Kategorie Personal. Der Chef kostet keinen Lohn (KK-15).
- **Skills (PA-02, PA-07, PA-08):** neun Tätigkeiten, Stufe 1–5.
  - Bodenbearbeitung wirkt beim Grubbern: Tempo 90 % (Stufe 1) bis 110 % (Stufe 5), Diesel +6 %
    bis −6 %.
  - Erfahrung: Stufe n → n+1 nach n × 100 Arbeitsstunden in der Tätigkeit.
  - Der Chef startet mit Boden 3, Saat 2, Gülle 2, Transport 2.
- **Fahrer je Auftrag:** Beim Start wählt man den Fahrer. Jeder Fahrer hat eigene 10 h am Tag
  und eine eigene Warteschlange.
  - Ist der Schlepper oder das Gerät gerade bei einem anderen Fahrer, wartet der Auftrag in der
    Warteschlange, bis die Maschine frei ist.
  - Besuche und Zahlungserinnerungen macht immer der Chef.
- **Fuhrpark (Vorgriff auf Schritt 2):** Gekaufte Schlepper erscheinen sofort als Fahrzeug am
  Hof. Der Markt bietet zwei gebrauchte Schlepper an:
  - Fendt 516 Vario, 165 PS, Bj. 2016, 69.500 €
  - John Deere 6130R, 130 PS, Bj. 2015, 44.000 €

### Schritt 2: Fuhrpark (Annahmen)

- **Katalog** (`src/data/catalog.ts`, HM-09): 20 Schlepper in den Klassen S, M und L von acht
  Marken, 6 Grubber (3–6 m) und 2 Kurzscheibeneggen.
  - Neupreise: Anker aus `docs/maschinen.md`, die übrigen als Annahme bei etwa 1.000–1.150 € je
    PS.
  - Geräteleistung nach LWK, größere Breiten hochgerechnet.
  - Deutz-Fahr und Valtra haben angenommene Farben (in `src/data/brands.ts` markiert).
- **Händler** (HM-04): sechs fiktive Händler an echten Orten, Markenmix laut
  `docs/maschinen.md`, als Punkte auf der Karte.
  - Neu bestellen: Lieferzeit Schlepper 8 Wochen (L 12), Geräte 4 Wochen, jeweils ±1 Woche.
    Bezahlt wird bei Lieferung, dazu 24 Monate Gewährleistung.
  - Rabatt 5 %, plus 1 % je 50.000 € Umsatz beim Händler, höchstens 12 % (HM-07).
  - Ab 50.000 € Umsatz kommt man bei der Wartung schneller dran.
- **Gebrauchtmarkt** (MZ-10, MZ-11):
  - Händler: bis 3 Angebote der eigenen Marken, Preis 105–115 % des Marktwerts, 6 Monate
    Gewährleistung.
  - Börse: bis 6 private Angebote, 85–100 % des Marktwerts, ohne Gewährleistung.
  - Jedes vierte Börsenangebot hat einen versteckten Mangel: Der Zustand ist 20 Punkte
    schlechter, die Pannengefahr dreifach. Ein Werkstattcheck für 180 € deckt ihn auf.
  - Angebote laufen nach 14–43 Tagen aus.
  - Marktwert nach Startformel × (0,9 + Zustand/500).
- **Verkauf** (MZ-12): Inzahlungnahme sofort zu 80 % des Werts. Privat inseriert verkauft sich
  die Maschine nach 5–25 Tagen zu 95–105 %. Der letzte Firmenwagen ist nicht verkäuflich.
- **Verschleiß** (MZ-03): Zustand je Betriebsstunde −0,006 Punkte beim Schlepper und −0,02
  Punkte beim Gerät, doppelt bei überfälliger Wartung. Reparaturkosten je Stunde in der
  Auswertung: 4 € + 0,50 € je 1.000 h.
- **Wartung** (MZ-05): Intervall Schlepper 500 h, Geräte 250 h.
  - Kosten: Schlepper 400 € + 0,4 % des Neupreises, Gerät 150 € + 0,3 %.
  - Dauer: 6 h plus Hin- und Rückfahrt zum Markenhändler (40 km/h). Von Juli bis Oktober
    warten Maschinen 2 Tage auf einen Termin (HM-08).
  - Wirkung: Zustand +3.
- **Pannen** (MZ-04, MZ-06, MZ-07, HM-05):
  - Risiko je Betriebsstunde: 0,2 % × (1 + (100 − Zustand)/25), dreifach bei überfälliger
    Wartung und dreifach bei Mangel.
  - Reparatur durch den Service des nächsten Markenhändlers: 1,5 h + Anfahrt (50 km/h) +
    Ersatzteil (60 % sofort, 25 % 4 h, 15 % 1–2 Tage), in der Ernte ×1,5.
  - Kosten: (200 € + 0,2–0,8 % des Neupreises) × Zustandsfaktor; mit Gewährleistung kostenlos.
  - Solange das Gespann steht, steht der Auftrag. Je angefangenem Tag sinkt die Zufriedenheit
    des Kunden um 1.
- **Anzeige** (MF-07, MZ-09): Reiter Fuhrpark mit Wert, Zustand, Stunden, nächster Wartung,
  Pannen, Werkstattkosten, Ausfallzeit und Gewährleistung.
- **Offen** (MZ-08, Phase 4): Leih- und Mietmaschinen, eigene Werkstatt, Kredit und Leasing für
  Neukäufe.

### Schritt 3: Planungsboard (umgesetzt)

- Knopf „Planung“ in der oberen Leiste öffnet das Board über der Karte, Esc schließt es.
- Zeitleiste: eine Zeile je Fahrer, sieben Tage je Seite, blätterbar. Jeder Tag zeigt
  06–22 Uhr, eine rote Linie markiert die aktuelle Zeit.
  - Balken: laufender Auftrag (dunkelgrün), Besuch (blau), geplant (hellgrün). Mehrtägige
    Aufträge werden je Tag geteilt.
  - Länge aus der Zeitschätzung, mit 10 h Arbeitszeit am Tag und Start neuer Aufgaben bis 20:00.
- Ziehen und Ablegen:
  - Ungeplanten Auftrag auf Fahrer und Tag ziehen. Das Spiel wählt das Gespann mit der höchsten
    Flächenleistung, das zusammenpasst.
  - Geplante Balken auf einen anderen Fahrer oder Tag ziehen. Ablegen auf heute heißt
    „sofort“, auf einen späteren Tag „nicht vor 06:00 dieses Tages“.
- Auswahl: Klick auf einen Balken zeigt Zeitraum, Termin und Warnungen. Dort lassen sich Fahrer,
  Schlepper, Gerät und „Start frühestens“ ändern oder der Eintrag streichen.
- Warnungen am Balken (rote Umrandung, ⚠):
  - Termin des Kunden wird überschritten
  - Schlepper oder Gerät zur selben Zeit bei einem anderen Fahrer (der spätere wartet)
  - Maschine in der Werkstatt
  - Gerät zu schwer für den Schlepper oder Auftrag nicht mehr startbar
- Offene Anfragen stehen mit geschätztem Fertigtermin und ✓/⚠ daneben und lassen sich direkt
  annehmen oder ablehnen.
- Technik: Das Board schreibt nur in die Warteschlangen der Fahrer (Befehle `plan` und
  `queueEdit`, Feld `notBefore`). Die Balken berechnet `Simulation.planBoard()` und schickt
  sie mit dem Geschäftszustand.
- Später: Startzeit auf die Stunde genau, Ketten mit mehreren Rollen (Phase 4), Urlaub und
  Krankheit als gesperrte Zeiten (Schritt 4).

### Schritt 4: Urlaub, Krankheit, Zufriedenheit, Zuschläge (Annahmen)

- **Arbeitszeit (PA-04, PA-06):** höchstens 10 h am Tag je Fahrer. Ruhezeit 11 h: Wer bis spät
  gearbeitet hat, beginnt am nächsten Tag entsprechend später, auch bei Feierabend mitten im
  Auftrag. Der Arbeitstag beginnt und endet am Hof.
- **Zuschläge (ZU-01 bis ZU-03)** nach § 3b EStG (`src/sim/calendar.ts`):
  - Nacht 20–6 Uhr 25 %, 0–4 Uhr 40 %; Sonntag 50 %; Feiertage in Niedersachsen 125 %;
    1. Mai, 25. und 26.12. sowie 24.12. ab 14 Uhr 150 %.
  - Nacht wird zu Sonntag bzw. Feiertag addiert, Sonntag und Feiertag nicht.
  - Überstunden über 8 h am Tag +25 %. Feste bekommen die Überstunden zusätzlich bezahlt.
  - Ostern wird berechnet, die Feiertage liegen im Kalender.
- **Krankheit (PA-05, PA-11, KK-11):**
  - Wahrscheinlichkeit je Tag 0,8 % × (1,6 − Zuverlässigkeit) × (1 + Überstundenstress), im
    Mittel etwa 8–12 Tage im Jahr.
  - Dauer: 50 % 1–2 Tage, 35 % 3–5 Tage, 15 % 1–2 Wochen.
  - Krankmeldung um 06:00. Ein laufender Auftrag des Fahrers wartet, bis er zurück ist oder
    man das Gespann zurückruft.
  - Feste werden weiterbezahlt (Lohnfortzahlung), Saisonkräfte nicht.
- **Urlaub:** Feste haben 26 Tage im Jahr, im ersten Jahr anteilig. Urlaub trägt man im Reiter
  Personal ein, oder der Mitarbeiter stellt einen Antrag (etwa alle zwei Monate).
  - Antwortfrist 5 Tage. Ablehnen oder Nichtantworten kostet Zufriedenheit.
  - Zum Jahreswechsel kommen 26 Tage dazu, übertragbar sind höchstens 10.
- **Zufriedenheit (PA-16):** nähert sich täglich um 2 % einem Zielwert:
  70 + 150 × (Lohn/Marktlohn − 1) − Überstunden der letzten 30 Tage × (1,3 − Belastbarkeit)
  − 10 bei schlechtem Fuhrpark (Zustand der Schlepper < 50 %) − Ärger über abgelehnte Wünsche
  (klingt mit 3 % je Tag ab).
  - Der Marktlohn steigt mit den Skills (gleiche Formel wie der Gehaltswunsch). Wer
    Erfahrung sammelt, will also mehr Geld.
- **Gehalt und Kündigung (PA-17):**
  - Unter 45 % Zufriedenheit oder mehr als 1 € unter Markt fordert der Mitarbeiter mehr Lohn,
    Antwort binnen 14 Tagen.
  - Unter 25 % kündigt er mit 4 Wochen Frist. Gute Fahrer (Boden ab 4) werden von der
    Konkurrenz abgeworben.
  - Den Lohn kann man jederzeit selbst setzen, eine Kürzung verärgert.
- **Kündigung durch den Chef:** Feste mit 4 Wochen Frist (arbeiten und werden bezahlt bis
  dahin), Saisonkräfte sofort. Ihre Planung entfällt beim Abgang.
- **Planungsboard:** Urlaub und Krankheit erscheinen als schraffierte Balken. Geplante
  Aufträge rücken hinter die Abwesenheit, Warnung bei Überschneidung oder Abgang.

### Ergänzung: Zeitarbeit und Fahrerwechsel (Wunsch von Nils, 5. Nov. 2026)

- **Zeitarbeitsfirma:** Morgens bietet sie 2–4 Leiharbeiter an, mit Skills Stufe 1–3 und
  einem Angebot, das 3–10 Tage gilt.
  - Buchung für 1–180 Tage, Einsatz ab dem nächsten Morgen 06:00. Verlängern oder
    abbestellen (zum nächsten Morgen) geht jederzeit.
  - Stundensatz (Annahme): 27 € netto bei Stufe 1, +3 € je Stufe, +2 € mit Führerschein C/CE.
    Die Firma rechnet mindestens 4 h je gebuchtem Einsatztag ab, Nacht- und Sonntagsarbeit
    mit halbem Zuschlag auf den Satz. Arbeitgeberanteil fällt nicht an, Buchung unter Personal.
  - Leiharbeiter werden auch krank; die Firma schickt dann keinen Ersatz.
- **Übernahme:** Ein bewährter Leiharbeiter lässt sich fest oder als Saisonkraft übernehmen,
  zum Marktlohn für seine Skills. Provision der Zeitarbeitsfirma nach Einsatzdauer: unter 3
  Monaten zwei Bruttomonatslöhne, 3–6 Monate 1,5, 6–9 Monate 1, 9–12 Monate 0,5, danach frei
  (übliche Staffel, Annahme).
- **Fahrerwechsel** (präzisiert nach Rückmeldung von Nils): Ein Fahrer kann nur gewechselt
  werden, wenn das Gespann am Hof steht (Rüsten, Abstellen), oder wenn ein dritter Fahrer
  den Ersatz mit dem Firmenwagen zum Gespann fährt.
  - Weg: Rechtsklick aufs Fahrzeug oder Balken im Planungsboard, dann neuen Fahrer und
    Fahrer für den Firmenwagen wählen.
  - Der Firmenwagen fährt wirklich hin. Ist das Gespann inzwischen mehr als 1,5 km
    weitergefahren, fährt er bis zu dreimal hinterher.
  - Übergabe 5 min, das Gespann steht so lange. Danach nimmt der Wagen den abgelösten Fahrer
    mit zurück zum Hof.
  - Arbeitszeit zählt für den Fahrer des Wagens und für den Ersatz während der Hinfahrt. Der
    Firmenwagen ist in der Zeit belegt, geplante Besuche warten.
  - Tempo und Diesel richten sich ab dann nach dem Skill des neuen Fahrers. Hatte der alte
    Fahrer Feierabend, macht der neue sofort weiter.
  - Ist der Fahrer eines laufenden Auftrags krank, steht das Gespann. Am Balken erscheint die
    Warnung „Fahrer wechseln“.

### Ergänzung: Firmenwagen, Berufe, eigene Werkstatt (Wunsch von Nils, 5. Nov. 2026)

**Firmenwagen (umgesetzt)**

| Art | Plätze inkl. Fahrer | Neupreis netto (Annahme) | Zweck |
| --- | --- | --- | --- |
| Kombi | 5 | 38.000 € | Kundenbesuche, Fahrerwechsel |
| Kleinbus | 8 | 49.000 € | Mannschaft zu den Maschinen bringen (Ketten, Phase 4) |
| Werkstattwagen | 3 | 68.000 € | eigener Pannendienst mit Mechaniker |

- Händler „Nutzfahrzeuge Uelzen“ (fiktiv) verkauft sie neu, die Börse bietet sie gebraucht an.
  Auf der Karte hat jede Art eine eigene Farbe.
- Für eine Fahrt nimmt das Spiel den kleinsten freien Wagen mit genug Plätzen, den
  Werkstattwagen nur, wenn nichts anderes frei ist. Besuch: 1 Platz. Fahrerwechsel: 2 Plätze
  (Fahrer + Ersatz hin, Fahrer + Abgelöster zurück).

**Berufe und Skills (umgesetzt)**

- Stufe 0 = nicht qualifiziert, 1–5 wie bisher. Elf Tätigkeiten: Traktor (Bodenbearbeitung),
  Saat, Gülle, Pflanzenschutz (Sachkunde), Radlader/Teleskoplader, Feldhäcksler, Mähdrescher,
  Rübenroder, Kartoffeltechnik, Lkw/Transport, Werkstatt.
- Berufsbilder für Bewerbungen und Zeitarbeit:

  | Beruf | Anteil | Skills (Spanne) |
  | --- | --- | --- |
  | Traktorfahrer | 34 % | Traktor 1–5, Saat/Gülle 0–3, Radlader 0–2 |
  | Helfer | 14 % | Traktor 1, Radlader 0–1 (günstig) |
  | Radladerfahrer | 12 % | Radlader 2–5, Traktor 1–2 |
  | Erntemaschinenfahrer | 12 % | Traktor 2–3, Häcksler/Drescher/Roder bis 4 (mindestens einer ab 2) |
  | Werkstattmitarbeiter | 10 % | Werkstatt 2–5, Traktor 1–2 |
  | Fahrer Pflanzenschutz und Düngung | 10 % | Traktor 1–3, Pflanzenschutz 1–4 |
  | Lkw-Fahrer | 8 % | Lkw 2–4, immer Führerschein C/CE |

- Der Beruf wird aus den Skills abgeleitet und überall angezeigt. Marktlohn und Gehaltswunsch
  steigen mit der besten Tätigkeit; Mechaniker und Erntemaschinenfahrer zählen eine halbe
  Stufe mehr (gesucht).
- Mindeststufe je Maschine (PA-10, Tabelle `MACHINE_SKILL`): Schlepper ab Traktor 1, eigene
  Reparatur ab Werkstatt 2. Weitere Einträge kommen mit den Maschinen:

  | Maschine (geplant) | Tätigkeit | Mindeststufe | Phase |
  | --- | --- | --- | --- |
  | Radlader, Teleskoplader, Siloschieber | Radlader | 1 (Silo walzen 2) | 4 |
  | Feldhäcksler | Häcksler | 2 | 4 |
  | Mähdrescher | Drescher | 2 | 4 |
  | Rübenroder, Rübenmaus | Roder | 2 | 4 |
  | Feldspritze | Pflanzenschutz | 1 (Sachkundenachweis) | 4 |
  | Lkw-Zugmaschine | Lkw + Führerschein C/CE | 1 | nach 5 |

- Der Chef startet mit Traktor 3, Saat 2, Gülle 2 und je 1 in Pflanzenschutz, Radlader, Lkw
  und Werkstatt. Er kann also selbst keine Reparaturen in eigener Regie machen.

**Pannen und eigene Werkstatt (umgesetzt, inkl. Ersatzteillage)**

- Bei einer Panne steht die Maschine. Der Spieler entscheidet im Reiter Fuhrpark: Händler-Service
  rufen oder eigenen Werkstattwagen mit Mechaniker schicken. Ohne Entscheidung ruft der Fahrer
  nach einer Stunde den Händler.
- **Ersatzteil** (präzisiert nach Rückmeldung von Nils):
  - Art: Verschleißteil (Schlepper 35 %, Geräte 60 %, Wert 60–400 €, Reparatur 0,5–2 h)
    oder sonstiges Teil (Reparatur 1–3,5 h).
  - **Verschleißteile** hat der Betrieb im eigenen Lager am Hof (Startbestand 1.000 €). Der
    Werkstattwagen hat sie zu 65 % an Bord, sonst lädt er sie am Hof (10 min). Ist das Lager
    leer, muss bestellt werden.
  - **Sonstige Teile:** 30 % im Lager am Hof, 45 % beim Händler vorrätig (abholen), 25 % muss
    bestellt werden.
  - Bestellt: vor 10 Uhr um 14 Uhr beim Händler, sonst am nächsten Morgen um 8 Uhr, also
    spätestens am nächsten Tag.
  - Verschleißteile fallen nicht unter die Gewährleistung.
- **Verschleißteillager:** Grubbern verbraucht etwa 3 € je ha (Schare, Zinken). Nachkauf im
  Reiter Fuhrpark, Lieferung am nächsten Morgen. Unter 200 € gibt es eine Warnung. Bei leerem
  Lager fallen Geräte doppelt so oft aus. Eigene Reparaturen mit Teilen aus dem Lager
  verbrauchen nur Lagerbestand (schon bezahlt).
- **Händler:** Anfahrt (Hin- und Rückweg bei 50 km/h) und Reparatur 1–3,5 h, frühestens
  wenn das Teil da ist. In der Ernte dauert es 1,5-mal so lange. Volle Kosten, mit Gewährleistung
  kostenlos.
- **Eigene Werkstatt:** Der Mechaniker fährt den Werkstattwagen, falls nötig zuerst zum
  Händler (Teil abholen, 15 min), dann zur Maschine.
  - Er folgt dem Gespann, falls es weitergefahren ist.
  - Reparaturzeit 120 % (Stufe 2) bis 90 % (Stufe 5) der Profizeit. Kosten nur die Teile: aus
    dem eigenen Lager der Teilewert, sonst etwa 45 % des Händlerpreises.
  - Ist das Teil bestellt, wartet der Einsatz bis zur Lieferung. Ebenso, wenn Mechaniker oder
    Werkstattwagen gerade beschäftigt sind.
  - Zurückrufen bricht ab, dann ist die Panne wieder offen.

**Noch geplant**

- Kleinbus für Mannschaftsfahrten: morgens mehrere Fahrer zu Maschinen am Feld bringen und
  abends abholen (mit Ketten in Phase 4).
- Wartung durch den eigenen Mechaniker am Hof (günstiger, braucht später eine Werkstatthalle,
  siehe Standorte und Gebäude).
- Werkstattmitarbeiter senken den Verschleiß (Pflege), Schulungen heben Skills (PA-09).

## Phase 4: Wirtschaft (ab 5. Nov. 2026)

Schritte:
1. **Finanzen** (umgesetzt, siehe unten)
2. **Wetter:** Regen und Bodenfeuchte nach dem Klima von Uelzen, Vorhersage, Feldarbeit bei
   nassem Boden gesperrt, Arbeitsdauer nach Wetter (AK-07)
3. **Jahreslauf:** Bedarf je Jahreszeit (AK-04), Stoppelbearbeitung mit der Kurzscheibenegge
   als zweite Dienstleistung, ruhiger Winter mit Wintercheck (MZ-05)
4. **Arbeitsketten:** Kleinbus-Mannschaftsfahrten, Radlader/Silo, später Häcksler
   (siehe `docs/ablaeufe.md`)

### Schritt 1: Finanzen (Annahmen und Quellen)

- **Darlehen (WF-01):** Annuität mit monatlicher Rate, Laufzeit 3, 5, 8 oder 10 Jahre.
  - Zins bei Bonität A: 3,85 % (3 Jahre), 4,1 % (5), 4,4 % (8), 4,6 % (10). Anker ist der
    LR-Basis-Satz der Rentenbank für 3 Jahre in Preisklasse A
    ([topagrar](https://www.topagrar.com/betriebsleitung/news/200-mio-eur-programm-rentenbank-nennt-zinssatz-a-20025940.html)),
    die längeren Laufzeiten sind angenommen.
  - Aufschlag je Bonität: B +0,5, C +1,2, D +2,5 Prozentpunkte.
  - Sondertilgung ohne Gebühr; die Laufzeit verkürzt sich.
- **Bonität und Kreditrahmen:**
  - Bonität A bei mindestens 60 % Eigenkapitalquote und keinem Verlust im Vorjahr, B ab 40 %,
    C ab 20 %, sonst D.
  - Kreditrahmen = 80 % des Eigenkapitals, auf 10.000 € abgerundet. Das ergibt zum Start
    150.000 €, passend zu den Startbedingungen.
  - Eigenkapital = Konto + Marktwert der eigenen Maschinen + offene Rechnungen +
    Verschleißteillager − Darlehen − Minus auf dem Konto.
  - Neu berechnet am Monatsersten.
- **Kontokorrent:** Rahmen 30.000 € zu 11 % (Annahme Hausbank). Käufe dürfen das Konto bis zum
  Rahmen ins Minus bringen. Dispozinsen werden täglich aufgelaufen und am Monatsersten gebucht.
  Über dem Rahmen gibt es täglich eine Warnung, und Käufe sind gesperrt.
- **Leasing (WF-02):** bei Neubestellung über 36, 48 oder 60 Monate, Zins 5,9 % + Aufschlag
  nach Bonität (Annahme).
  - Restwert 45, 35 bzw. 25 %. Die Rate ist der Barwert ohne abgezinsten Restwert, verrentet
    über die Laufzeit.
  - Keine Anzahlung und keine Abschreibung; die Maschine lässt sich nicht verkaufen.
  - Am Ende wird sie zurückgegeben oder auf Wunsch zum Restwert übernommen (danach AfA über
    4 Jahre).
- **Abschreibung (WF-03):** linear, monatsgenau.
  - Nutzungsdauer: Traktoren 12 Jahre nach AfA-Tabelle des BMF (laut
    [Lexware](https://www.lexware.de/wissen/buchhaltung-finanzen/abschreibungstabelle/traktor/)),
    Firmenwagen 6, Geräte 10 (Annahme).
  - Gebrauchte über die Restnutzungsdauer, mindestens 3 Jahre.
  - Die Startmaschinen gelten als Einlage zum Marktwert.
  - Beim Verkauf zählt der Buchgewinn bzw. -verlust zum Ergebnis.
- **Versicherung (WF-05, Annahme):** Betriebshaftpflicht 1.800 € im Jahr. Je Schlepper und
  Fahrzeug 400 € Haftpflicht + 0,8 % vom Wert Kasko, Geräte 0,3 %. Gebucht monatlich.
- **Steuern (WF-04, vereinfacht):** Jahresabschluss am 1. Januar. Gewinn = Umsatz − Kosten
  (ohne Investitionen und Tilgung) − AfA ± Buchgewinne.
  - Gewerbesteuer: (Gewinn − 24.500 €) × 3,5 % × Hebesatz 380 % (Annahme).
  - Einkommensteuer: Grundfreibetrag 12.348 €, Grenzsatz linear von 14 % auf 42 % bis
    68.480 €, darüber 42 %, ab 277.826 € 45 %. Die Gewerbesteuer wird bis zum 3,8-fachen
    Messbetrag angerechnet.
  - Fällig am 31. Mai des Folgejahres, ohne Vorauszahlungen.
- **Diesel (WF-07):** Preis netto, ohne MwSt, Start 1,62 €/l. Zufallspfad mit Rückkehr zum
  Mittel von 1,58 €/l, ±0,6 ct am Tag. Gebucht wird zum Tagespreis.
  - Agrardiesel-Rückvergütung (21,48 ct/l seit 2026,
    [topagrar](https://www.topagrar.com/management-und-politik/news/agrardiesel-ruckerstattung-zum-1-januar-2026-wieder-in-voller-hohe-20015641.html)):
    Annahme, dass sie der Landwirt für die Lohnarbeit beantragt und nicht das Lohnunternehmen.
    Noch zu prüfen.
- **Übersicht (WF-08):** Reiter Finanzen mit Konto, Bonität, Darlehen, laufendem Jahr,
  Jahresabschlüssen und Monatsübersicht (Finanzierung und Abgaben zusammengefasst).
  Leasingangebote im Markt, Leasingverträge im Fuhrpark.

### Schritt 2: Wetter (Annahmen und Quellen)

- Ein Wetter je Tag für das ganze Spielgebiet, deterministisch aus dem Seed (`src/sim/weather.ts`).
- **Niederschlag und Regentage** je Monat nach der DWD-Station Uelzen
  ([wetterdienst.de](https://www.wetterdienst.de/Deutschlandwetter/Bad_Bevensen/Klima/)):
  zusammen etwa 700 mm an rund 180 Tagen.
  - Regen als Markow-Kette: Nach einem Regentag ist Regen wahrscheinlicher.
  - Menge schief verteilt mit dem Monatsmittel je Regentag; der Regen beginnt zu einer
    zufälligen Stunde.
- **Temperatur:** Monatsmittel (Annahme Lüneburger Heide, Jahresmittel etwa 9,6 °C laut
  [klima.org](https://klima.org/deutschland/klima-uelzen/)) mit träger Abweichung. Frost unter
  −1,5 °C.
- **Bodenfeuchte:** Speicher von 40 mm im Oberboden.
  - Zufluss: Regen zu 90 %.
  - Abfluss: Verdunstung 0,3–4 mm am Tag nach Temperatur, Versickerung 12 % des Überschusses
    über 20 mm (Sandböden um Uelzen).
  - Über 30 mm gilt der Boden als zu nass.
- **Feldarbeit ruht:**
  - bei gefrorenem oder zu nassem Boden
  - am Tag nach Starkregen (mindestens 10 mm)
  - ab Regenbeginn bei Tagen mit mindestens 5 mm
  - Ergebnis über vier Jahre: Januar und Februar zu 40–60 % gesperrt, Dezember etwa 40 %,
    März wenige Tage, April bis Oktober etwa 5–10 %.
- **Folgen:** Ein Gespann auf dem Feld wartet, die Wartezeit zählt nicht als Arbeitszeit.
  Aufträge in der Warteschlange starten erst bei passendem Wetter. Bei Bodenfeuchte über 25 mm
  ist die Arbeit 10 % langsamer (AK-07).
- **Vorhersage** über 7 Tage mit Regenwahrscheinlichkeit, unsicherer je weiter weg. Die
  Zeitschätzung überspringt die voraussichtlich gesperrten Tage der nächsten 5 Tage.
- **Anzeige:** Wetter und „Feldarbeit möglich/ruht“ in der oberen Leiste, Vorhersage im Kopf des
  Planungsboards (gesperrte Tage blau hinterlegt).

### Schritt 3: Jahreslauf (Annahmen)

- **Zweite Dienstleistung Stoppelbearbeitung** mit der Kurzscheibenegge: Startpreis 38 €/ha
  (Grubbern 55 €/ha, Annahme), Diesel 6 l/ha, Flächenleistung nach Gerät (LWK 3 m: 2 ha/h).
  Grubberaufträge brauchen einen Grubber, Stoppelaufträge eine Kurzscheibenegge.
- **Saisonkalender** (AK-04, `seasonServices`):

  | Zeitraum | Dienstleistung | Kulturen | Gewicht |
  | --- | --- | --- | --- |
  | 1.3.–15.5. | Grubbern vor der Saat | Mais, Rüben, Kartoffeln | April 1,2, sonst 1 |
  | 15.7.–31.7. | Stoppelbearbeitung nach Raps | Raps | 0,8 |
  | 1.8.–15.9. | Stoppelbearbeitung nach Getreide und Raps | Getreide, Raps | August 1,3 |
  | 1.9.–31.10. | Grubbern (Grundbodenbearbeitung) | Getreide, Raps, Ackerfutter | bis 15.10. 0,9, dann 0,6 |
  | Juni, November–Februar | keine Bodenbearbeitung | – | – |

- **Winter:** Am 1. November kommt der Hinweis auf den Wintercheck. Wartung beim Händler kostet
  von November bis Februar 20 % weniger. Ein Wintercheck senkt das Pannenrisiko in den folgenden
  300 Tagen um 30 % (MZ-05).
- **Noch offen:** Fruchtwechsel der Kundenfelder je Jahr (heute behält jedes Feld seine Kultur),
  weitere Dienstleistungen (Saat, Gülle, Ernte) mit den Maschinen aus Phase 4, Schritt 4.

### Schritt 4a: Gülle als erste Arbeitskette (Annahmen und Quellen)

- **Dienstleistung „Gülle ausbringen“:** nur für Betriebe mit Vieh, aus deren Güllelager an der
  Hofstelle.
  - Saison: 1.2.–30.4. Getreide und Raps (Kopfdüngung, 20 m³/ha), 1.3.–15.5. Mais und Rüben
    (vor der Saat, 25 m³/ha), 1.8.–20.9. wenig zu Raps und Getreide.
  - Sperrfrist auf Ackerland von der Ernte bis 31. Januar
    ([topagrar](https://www.topagrar.com/acker/news/guelle-sperrfrist-endet-am-31-januar-12461860.html)).
  - Bei nassem oder gefrorenem Boden ruht die Ausbringung (Wetter, Schritt 2).
  - Preis um 4 €/m³ (Spanne für Lohnausbringung 2,50–8 €/m³ je nach Entfernung und System,
    [LK Niederösterreich](https://noe.lko.at/rindergülle-wirtschaftlich-bodennah-ausbringen+2400+3635932)).
    Abgerechnet wird je m³, verhandelt auch.
- **Technik:** Güllefässer mit Schleppschlauch bzw. Schleppschuh, Pflicht auf bestelltem Ackerland
  ([topagrar](https://www.topagrar.com/acker/news/breitverteilerverbot-2025-wo-gelten-ausnahmen-1-20008994.html)).
  - Modelle: Joskin 7,1 m³, Kotte 13,9 m³, Joskin 16,5 m³, Zunhammer 18,5 m³, Preise aus
    `docs/maschinen.md`. Zubringer Kotte 24 m³ und Joskin 20 m³ (Annahme).
  - Flächenleistung = Breite × 8 km/h × 0,7.
  - Fahrer brauchen die Tätigkeit Gülle ab Stufe 1.
- **Umlauf ohne Zubringer:** Rüsten am Hof → Güllelager → Füllen (3 m³/min) → Feld → anteilig
  Bahnen abfahren, bis das Fass leer ist → zurück zum Lager → … → nächstes Feld → Hof. Der
  Fortschritt je Feld wird gemerkt; bei der Rückkehr ans Feld gibt es keine neue Rüstzeit.
- **Kette mit Zubringer:** zweites Gespann mit eigenem Fahrer, Schlepper und Zubringerfass.
  - Der Zubringer pendelt Lager ↔ Feldrand und füllt um (4 m³/min + 2 min). Das Ausbringfass
    bleibt auf dem Feld und wartet am Feldrand.
  - Der Zubringer holt nur so viel, wie noch fehlt, folgt zum nächsten Feld und fährt am Ende
    heim.
  - Ruft man den Zubringer zurück, macht das Fass allein weiter.
- **Zeitschätzung:** Umläufe aus Füllen, Fahrt, Ausbringen. Mit Zubringer zählt der Engpass aus
  Ausbringen und Zubringerumlauf, daher schneller bei weiten Wegen.
- **Später:** Lkw-Zubringer mit Tankauflieger, Feldrandcontainer, Gärrest aus Biogasanlagen,
  Häckselkette (Häcksler + Abfahrer + Silo mit Radlader/Walze), Kleinbus-Mannschaftsfahrten.

### Schritt 4b: Häckselkette (Annahmen)

- **Dienstleistung „Maishäckseln“** (Silomais) vom 10.9. bis 20.10., am stärksten vom 20.9. bis
  10.10. Kurze Termine (3–7 Tage), weil der Mais reif ist.
  - Zwei Arten: **nur Häcksler** (Kunde stellt Abfahrer und Walze, etwa 230 €/ha) oder
    **Komplettkette** (Häcksler, Abfahrer und Walzen, etwa 430 €/ha). Betriebe mit viel eigener
    Technik geben eher nur den Häcksler in Auftrag.
  - Kostenanker: Häcksler 241 €/h, Transport 87 €/h, Walzschlepper 110 €/h (Bayerisches
    Wochenblatt, siehe `docs/ablaeufe.md`).
  - Ertrag 42 t Frischmasse je ha (Annahme Niedersachsen 40–45 t).
- **Maschinen:**
  - Feldhäcksler mit passendem Maisgebiss: Claas Jaguar 940 (2,4 ha/h), Krone BiG X 780
    (3,0 ha/h), John Deere 8500i (3,3 ha/h). Preisanker Krone BiG X 780 Bj. 2023 398.000 €.
    Fahrer: Häcksler ab Stufe 2.
  - Häckselwagen mit 11 bzw. 14 t Nutzlast (36 bzw. 45 m³).
  - Radlader JCB, Liebherr, Volvo mit 12–15 t Betriebsgewicht. Walzleistung = Betriebsgewicht ×
    4 t/h (Faustregel Walzgewicht = Anlieferung ÷ 4).
  - Neuer fiktiver Händler „Baumaschinen Lüneburg“. Krampe und Fliegl gibt es in Salzwedel.
- **Ablauf:**
  - Der Häcksler fährt die Feldbahnen nur, solange ein Abfahrer nebenher fährt; sonst steht er.
  - Der Abfahrer fährt sichtbar mit und wird mit Flächenleistung × Ertrag gefüllt.
  - Ist er voll, fährt er zum Silo an der Hofstelle des Kunden, der nächste wartende Wagen
    übernimmt.
  - Am Silo wird abgekippt (5 min), sobald der Rückstau unter 20 t liegt, sonst wartet der
    Wagen. Radlader bzw. Walze bauen den Rückstau mit ihrer Walzleistung ab.
  - Nur Häcksler: 3 Wagen des Kunden à 12 t mit Umlaufzeit aus der Entfernung, nicht als
    Fahrzeuge auf der Karte, Annahme am Silo 120 t/h. Eigene Abfahrer können zusätzlich mitfahren.
  - Komplettkette: mindestens ein eigener Abfahrer. Ohne eigenen Radlader kommt eine Fremdwalze
    (100 t/h, 110 €/h, gebucht unter Sonstiges und in der Auftragsauswertung).
- **Einteilung** im Reiter Aufträge: Häcksler und Fahrer, beliebig viele Abfahrer (Fahrer,
  Schlepper, Wagen), optional Radlader mit Fahrer. Im Planungsboard lässt sich „nur Häcksler“
  einplanen.
- **Später:** Mannschaftsfahrten mit dem Kleinbus, Grasernte (Pickup), Walzschlepper als
  Alternative zum Radlader, Silage-Qualität nach Verdichtung.

## Phase 5: Markt und Konkurrenz (ab 5. Nov. 2026, umgesetzt)

- **Konkurrenten (MK-01):** 11 erfundene Lohnunternehmen an echten Orten (`src/sim/market.ts`),
  nach der Festlegung in `docs/anforderungen.md`.
  - 2 große: Bodenbearbeitung, Gülle, Häckseln, Preisniveau etwa +4 %.
  - 5 mittlere: Bodenbearbeitung und Gülle, etwa ±0.
  - 4 kleine: nur Bodenbearbeitung, etwa −8 % (oft Nebenerwerb).
  - Je Anbieter ±4 % Streuung. Sie sind nicht als Fahrzeuge simuliert, sondern bieten auf die
    Anfragen mit. Auf der Karte stehen sie als graue Punkte, im Preiskampf rot.
- **Wer den Auftrag bekommt (MK-02):** Zu jeder Anfrage gibt es das beste Konkurrenzangebot
  (Marktpreis × Preisniveau × Preiskampf × Anfahrt, ab 15 km +0,4 % je km, Anbieter bis 45 km
  entfernt).
  - Der Kunde bietet höchstens 2 % darüber, Stammkunden 6 %.
  - Gegenangebote nimmt er nur bis zum Konkurrenzangebot + 8 % (Stammkunde) + Ruf/10 % an.
  - Abgelehnte, zu teure und unbeantwortete Anfragen gehen an den Konkurrenten
    (Statistik gewonnen/verloren).
- **Stammkunden (MK-03):** ab 3 erledigten Aufträgen und mindestens 70 % Zufriedenheit. Sie
  fragen 1,5-mal so oft an, geben doppelt so lange Zeit für die Antwort und bleiben im
  Preiskampf.
- **Preiskampf (MK-04):** Im Mittel alle drei Monate senkt ein großer oder mittlerer Anbieter für
  30–60 Tage die Preise um 10–20 %.
  - Im Umkreis von 25 km fragen Nicht-Stammkunden seltener an (×0,6).
  - Unzufriedene Kunden (unter 65 %) wechseln mit 0,4 % je Tag zum Konkurrenten.
- **Ruf (MK-05), Start 50 von 100:**
  - +1,5 je pünktlichem Auftrag, −3 je verspätetem.
  - −1 je unbeantworteter Anfrage, −0,5 je Tag Stillstand durch Panne.
  - Monatlich +0,3 je Stammkunde, höchstens +3.
  - Wirkung: Anfragehäufigkeit ×0,7 bis ×1,3, mehr Spielraum beim Preis. Ab 60 meldet sich
    monatlich gelegentlich ein Nachbar eines Stammkunden auf Empfehlung.
- **Anzeige:** neuer Reiter Wettbewerb (Ruf, Quote, Stammkunden, Konkurrenten mit Preisen und
  Preiskampf). An jeder Anfrage steht das Konkurrenzangebot.
- **Später:** Konkurrenten mit echtem Fuhrpark und Auslastung (in der Ernte ausgebucht),
  Abwerben von Personal durch bestimmte Konkurrenten, Übernahme kleiner Anbieter.

## Weitere Schichten: Standorte, Pacht, Ackerbau, Biogas (ab 5. Nov. 2026)

Schritte: 1. Standorte und Gebäude (umgesetzt), 2. Pacht und eigener Ackerbau (umgesetzt), 3. Biogasanlage (umgesetzt).

### Schritt 1: Standorte und Gebäude (Annahmen)

- **Stammhof Groß Thondorf** ist Standort 1 (Matschplatz). Gebäude (`src/data/sites.ts`):

  | Gebäude | Kosten | Bauzeit | Wirkung |
  | --- | --- | --- | --- |
  | Befestigter Platz | 45.000 € | 3 Wochen | ohne ihn bei nassem Boden +10 min Rangieren beim Rüsten |
  | Maschinenhalle 600 m² | 150.000 € | 8 Wochen + Genehmigung | 25 % weniger Verschleiß für Maschinen am Standort |
  | Werkstatt mit Grube | 220.000 € | 10 Wochen + Genehmigung | Wartung am Hof durch eigene Mechaniker: halber Preis, 4 h |
  | Dieseltank und Waschplatz | 40.000 € | 3 Wochen + Genehmigung | Diesel 6 ct/l günstiger, 10 % weniger Verschleiß |
  | Büro und Sozialräume | 85.000 € | 6 Wochen + Genehmigung | Zufriedenheit der Mitarbeiter +5 |
  | Fahrsilo 3.000 t | 120.000 € | 6 Wochen + Genehmigung | Lager für eigene Silage (Ackerbau, Biogas) |

  - Hallenkosten etwa 250 €/m² (Hausjournal: Leimbinderhalle 20 × 15 m bis etwa 80.000 €).
  - Laufende Kosten je Gebäude 500–3.000 € im Jahr (Strom, Grundsteuer, Versicherung,
    Instandhaltung), monatlich gebucht.
  - Gebäude werden über 33 Jahre abgeschrieben.
- **Genehmigung (ST-03, vereinfacht):** Außenbereich 16 Wochen und 3.000 € (ein Lohnunternehmen
  ist nicht privilegiert), Resthof 10 Wochen und 2.000 €, Gewerbegebiet 6 Wochen und 1.500 €.
- **Weitere Standorte (ST-01, ST-04):**
  - zu kaufen: Gewerbegrundstücke in Uelzen (225.000 €), Dannenberg (125.000 €) und Salzwedel
    (100.000 €) sowie ein Resthof bei Bad Bevensen mit Platz und Halle (380.000 €)
  - zu pachten: Resthof Neuhaus rechts der Elbe (1.400 €/Monat)
  - Aufgeben bringt 80 % des Grundstückspreises und 50 % der Gebäude.
- **Zuordnung (ST-07):** Jede Maschine steht an einem Standort, dort starten und enden ihre
  Fahrten. Überführung mit Fahrer, Geräte fahren am Schlepper mit. Der Pendelweg der Fahrer ist
  noch nicht eingerechnet.
- **Später:** Stellplatzgrenzen, Disponent im Büro (ST-08), Übernahme ganzer Lohnunternehmen
  (ST-02), Lager für Dünger und Saatgut, Gülle- und Gärrestlager.

### Schritt 2: Pacht und eigener Ackerbau (Annahmen)

- **Pachtangebote (PB-01 bis PB-03):** im Mittel zwei im Monat (Betriebsaufgabe,
  Generationswechsel), 1–3 Ackerfelder bis 45 ha, Laufzeit 9 oder 12 Jahre, 21 Tage Gebotsfrist.
  Bekannte Betriebe mit mindestens 55 % Zufriedenheit kann man einmal im Jahr selbst fragen
  (Kartenfenster „Land anfragen“).
  - Ortsüblicher Preis: 620 €/ha bei Ackerzahl 35, je Punkt ±12 €, beregnet +140 €
    (Niedersachsen: 643 € im Bestand, 755 € bei Neupacht).
  - Nachbarn und andere Betriebe bieten verdeckt 95–120 % davon. Wer mehr bietet, bekommt den
    Zuschlag; die Felder gehören dann zum eigenen Betrieb (Karte blau).
  - Pacht und Beregnung (140 €/ha) sind am 1. Oktober fällig. Nach Pachtende gehen die Felder
    nach der letzten Ernte zurück.
- **Boden:** Ackerzahl je Feld 25–50 (Uelzener Sand), Beregnung bei 60 % der Felder (beides fest
  aus dem Feld-Index).
- **Kulturen (`src/sim/farming.ts`):** Winterweizen 7,5 t × 215 €, Winterraps 3,8 t × 450 €,
  Silomais 42 t × 40 €, Zuckerrüben 80 t × 45 € (Nordzucker Uelzen), Kartoffeln 45 t × 140 €.
  - Arbeitsgänge mit Zeitfenster: Stoppel, Grubbern und Häckseln fährt der eigene Fuhrpark als
    Eigenauftrag (Reiter Aufträge, ohne Rechnung).
  - Saat, Düngung/Pflanzenschutz, Drusch und Roden werden zum Fenster-Beginn als Fremdleistung
    inkl. Betriebsmittel gebucht (KTBL-Größenordnung).
- **Ertrag (PB-05, PF-01):** Basis × Bodenfaktor (±1,2 % je Ackerzahlpunkt) × Fruchtfolge
  (Selbstfolge −15 %, Raps/Rüben/Kartoffeln −25 %) × Trockenheit × Termintreue.
  - Trockenheit gilt nur ohne Beregnung: Sommerregen April–August gegen 300 mm.
  - Termintreue: verpasster Pflicht-Arbeitsgang −10 %, späte Ernte −2 % je Tag,
    Stoppelbearbeitung +3 %.
  - Verkauf zum Marktpreis ±10 % (Buchung „Ernte“, zählt als Umsatz).
- **Später:** Lagerung und Vermarktung (Vorkontrakte), eigener Mähdrescher und Roder,
  Düngebedarf, Flächenkauf, Silomais in die eigene Biogasanlage.

### Schritt 3: Biogasanlage (Annahmen)

- **Bau (PB-07, `src/sim/biogas.ts`):**

  | Größe | Baukosten | Genehmigung | Bau | Silo | Gärrestlager |
  | --- | --- | --- | --- | --- | --- |
  | 250 kW | 1,25 Mio. € (5.000 €/kW) | 20 Wochen, 25.000 € | 26 Wochen | 4.000 t | 6.000 m³ |
  | 500 kW | 2,1 Mio. € (4.200 €/kW) | 26 Wochen, 40.000 € | 30 Wochen | 8.000 t | 12.000 m³ |

  - Nur auf Hofstelle oder Resthof: Abstand zur Wohnbebauung, im Gewerbegebiet nicht.
  - Privilegierung: mindestens 10 ha eigener Ackerbau (Pacht).
- **EEG-Ausschreibung:** Gebotstermine 1. April und 1. Oktober, Höchstwert 19,43 ct/kWh.
  - Zuschlagsgrenze je Runde verdeckt 17,6–19,43 ct; Zuschlag zum eigenen Gebot, 20 Jahre.
  - Erst mit Zuschlag wird gebaut und bezahlt; ohne Geld verfällt der Zuschlag.
- **Substrat (PB-08):** Strom je t Frischmasse: Maissilage 400 kWh, GPS 360, Grassilage 330,
  Gülle 45 kWh/m³. Daraus folgen rund 2 kW je ha Mais.
  - Maisdeckel 25 % der Masse. Ration: Gülle zuerst, dann Mais bis zum Deckel, Rest GPS und Gras;
    fehlt Substrat, sinkt die Leistung.
  - Einkauf frei Silo: Mais 45 €/t, GPS 42 €/t, Gras 38 €/t, außerhalb der Ernte +20 %.
  - Eigener Silomais geht ins Silo statt in den Verkauf.
  - Mais auf dem Halm (August–Oktober, 32 €/t) erntet die eigene Häckselkette ins Silo der
    Anlage (PB-10).
  - Gülle-Lieferverträge mit bekannten Viehbetrieben: 0,5 GV/ha × 15 m³ im Jahr, Anfuhr
    2,5 €/m³. Die Lieferanten nehmen ihren Anteil Gärrest von Februar bis September zurück.
- **Erlös und Kosten (PB-09):** 95 % Volllast. Strom wird monatlich abgerechnet (Kategorie
  „Strom“).
  - Betrieb und Wartung 3,5 ct/kWh, fixe Kosten 1,5 % der Baukosten im Jahr (Kategorie „Biogas“).
  - Abschreibung 20 Jahre.
  - Beispiel 500 kW: rund 4,2 GWh = 800.000 € Erlös gegen etwa 700.000 € Kosten inkl. AfA.
- **Gärrest:** 0,75 m³ je t Silage, 0,95 m³ je m³ Gülle. Ist das Lager voll, fährt die Anlage
  herunter.
  - Ausbringen auf eigenen Pachtflächen als Eigenauftrag mit dem Güllefass (20 m³/ha, spart
    4 €/m³ Mineraldünger), Quelle ist das Lager der Anlage.
  - Oder an die Gärrestbörse abgeben (6 €/m³).
  - Sperrfrist auf Ackerland vereinfacht 1. Oktober bis 31. Januar.
- **Später:** Wärmeverkauf, Flexzuschlag, Gärrest als Dienstleistung für viehlose Kunden,
  Gülle-Anfuhr mit eigenen Fahrzeugen, Rüben als Substrat, Silo festfahren als eigener Arbeitsgang.

## Vorschläge für die nächsten Schichten (5. Nov. 2026, noch nicht bestätigt)

Nils wählt aus, was umgesetzt wird. Empfehlung für den nächsten Block: 4, 1, 13 und 5.

### A. Neue Geschäftsfelder

1. **Transport mit Lkw** (umgesetzt, siehe unten): Getreide, Rüben in der Rübenkampagne zu Nordzucker Uelzen, Kartoffeln,
   Gülle mit dem Tankauflieger. Mit Fahrerlaubnis CE, Lenk- und Ruhezeiten und Maut.
2. **Winterdienst:** Verträge mit Gemeinden und Gewerbe. Bei Glätte oder Schnee kommen nachts
   Einsätze mit Streuer und Schild am Schlepper, mit Bereitschaftszuschlag (Wetter liefert
   Frost und Niederschlag).
3. **Kommunale Arbeiten:** Böschungs- und Grabenmähen, Heckenschnitt, Wegebau. Ausschreibungen
   der Gemeinden und Kreise.
4. **Weitere Ackerdienste** (Mähdrusch und Rübenroden umgesetzt, siehe unten): Mähdrusch, Rübenroden und Kartoffelroden als eigene Ketten mit
   Abfahrern, Rübenmiete und Verladung (siehe docs/ablaeufe.md). Dazu Saat, Pflanzenschutz
   (Sachkunde nötig) und Ballenpressen. Eigener Ackerbau kann diese Arbeitsgänge dann selbst fahren.

### B. Vertiefung der vorhandenen Systeme

5. **Gärrest als Dienstleistung** (umgesetzt, siehe unten): Viehlose Kunden fragen Gärrest aus der eigenen Anlage an.
   Gülle-Anfuhr mit eigenen Fahrzeugen statt durch Dritte.
6. **Vermarktung und Lager:** Vorkontrakte, Getreidelager am Hof, Preise schwanken übers Jahr,
   Verkauf zum besten Zeitpunkt.
7. **Rahmenverträge mit Kunden:** Jahresverträge, z. B. alle Gülle eines Betriebs für 3 Jahre.
   Das gibt Planungssicherheit, bindet aber Kapazität.
8. **Flächenkauf und Düngebedarf:** Land kaufen statt pachten, Nährstoffbilanz nach
   Düngeverordnung, Gärrest spart gezielt Dünger.
9. **Biogas ausbauen:** Wärmeverkauf ans Dorf, Flexzuschlag (Strom zu teuren Stunden),
   „Silo festfahren“ als eigener Arbeitsgang.

### C. Personal und Betrieb

10. **Disponent im Büro (ST-08):** übernimmt Routineaufträge nach festgelegten Regeln und spart
    Chef-Zeit, wenn der Betrieb groß wird.
11. **Ausbildung:** Azubis, Meisterkurs, Lehrgänge (Pflanzenschutz-Sachkunde, CE-Führerschein)
    schalten Skills frei.
12. **Konkurrenz mit echtem Fuhrpark:** In der Ernte ist die Konkurrenz ausgebucht, sie wirbt
    Personal ab, kleine Anbieter lassen sich übernehmen (ST-02).

### D. Spielgefühl und Oberfläche

13. **Auswertungen** (umgesetzt, siehe unten): Diagramme zu Umsatz und Gewinn je Monat und Sparte (Lohnarbeit, Ackerbau,
    Biogas), Auslastung je Maschine und Fahrer, Kundenkarte mit Deckungsbeitrag.
14. **Ereignisse und Zufälle:** Unwetter, Hagel auf eigenen Flächen, Kontrollen (Lenkzeit,
    Fahrzeug), Feldtage und Messen mit Rabatten.
15. **Tutorial und Ziele:** geführter Einstieg, Kampagnenziele (z. B. 500 ha Kundenfläche in
    3 Jahren), Erfolge.
16. **Schwierigkeitsgrade und Startszenarien:** Neugründung, Hofnachfolge mit altem Fuhrpark,
    wohlhabender Einstieg.

### E. Technik

17. **Leistung bei großem Betrieb:** Simulation mit 50+ eigenen Fahrzeugen messen und optimieren.
18. **macOS-Build prüfen:** gezielter Lauf mit `[mac]` und Selbsttest (zehnfache CI-Minuten,
    nur auf Wunsch).

### F. Dokumentation

19. **Spielerhandbuch:** Anleitung für Spieler auf Deutsch, laufend gepflegt mit jeder neuen
    Schicht.
    - Inhalt: Einstieg (erster Besuch, erste Anfrage, erster Auftrag), jeder Reiter der
      Oberfläche, Arbeitsketten (Gülle, Häckseln …), Personal und Skills, Fuhrpark und
      Werkstatt, Finanzen, Wetter und Jahreslauf, Markt, Standorte, Pacht und Ackerbau,
      Biogas.
    - Dazu: Tastenkürzel, Begriffe von A bis Z (z. B. Gabe, Maisdeckel, Sperrfrist,
      Rüstzeit), Tipps für die ersten Spieljahre.
    - Zahlen und Annahmen kommen aus dem Code bzw. aus docs/plan.md, damit das Handbuch
      nicht veraltet.
    - Form: Quelle als Markdown in `docs/handbuch/` mit Bildschirmfotos aus Playwright.
      Im Spiel als Reiter „Hilfe“ und zusätzlich als PDF für Windows und macOS.
    - Kontexthilfe: Ein „?“ an Reitern und Fenstern springt zum passenden Kapitel.

## Umsetzung Vorschlag 4: Mähdrusch und Rübenroden (5. Nov. 2026)

- **Maschinen (`src/data/catalog.ts`):**
  - Mähdrescher: Deutz-Fahr C7206 TS (6,3 m, 1,9 ha/h, Korntank 7 t, 310.000 €), Claas Lexion 6800
    (9,3 m, 3,0 ha/h, 9 t, 520.000 €), New Holland CR 8.90 (10,7 m, 3,4 ha/h, 11 t, 580.000 €),
    John Deere S785i (10,7 m, 3,5 ha/h, 11 t, 610.000 €).
  - Kipper zum Kornabfahren: Krampe HP 20 (18 t), Fliegl TDK 302 (22 t).
  - Rübenroder 6-reihig: Grimme Rexor 6300 (1,6 ha/h, Bunker 30 t, 690.000 €), Ropa Tiger 6S
    (1,8 ha/h, 33 t, 760.000 €). Händler: Kartoffel- und Rübentechnik Uelzen.
  - Fahrer brauchen Drescher bzw. Roder ab Stufe 2.
- **Mähdrusch:** Raps 10.7.–5.8., Getreide 20.7.–30.8.
  - „Nur Drusch“ 150 €/ha: Der Kunde stellt zwei Anhänger am Feldrand.
  - „Mit Abfuhr“ 195 €/ha: eigene Kipper fahren das Korn zum Hof des Kunden (Annahme Gosse 150 t/h).
  - Der Drescher füllt den Korntank und steht erst, wenn er voll ist und kein Wagen da ist.
  - Wetter: Drusch erst ab etwa 9 Uhr (Tau), nicht im Regen, nach über 2 mm Regen am Vortag erst
    ab Mittag.
  - Erträge für die Logistik: Weizen 7,5 t/ha, Raps 3,8 t/ha.
- **Rübenroden:** 15.9.–30.11. (Kampagne Nordzucker Uelzen), 280 €/ha. Der Roder bunkert und
  entleert in die Feldrandmiete (etwa 4 min je Bunker). Abfahrer sind nicht nötig; Verladung und
  Abfuhr übernimmt die Zuckerfabrik. Ertrag 80 t/ha.
- **Konkurrenz:** große Anbieter dreschen und roden, mittlere dreschen.
- **Eigener Ackerbau:** Mit eigenem Drescher bzw. Roder wird die Ernte zum Eigenauftrag (das Korn
  holt der Landhandel am Feldrand ab), sonst bleibt sie Fremdleistung.
- **Später:** Überladewagen, Kartoffelroden, Rübenmaus und Lkw-Abfuhr (Vorschlag 1),
  Schneidwerkswagen und Straßenfahrt mit Überbreite.

## Umsetzung Vorschlag 1: Lkw-Transport (5. Nov. 2026)

- **Lkw (`src/data/catalog.ts`, Händler Lkw-Zentrum Uelzen):** MAN TGX 18.510, Mercedes-Benz
  Actros 1848, Scania R 500, jeweils mit Kippsattel (25–26 t, 178.000–192.000 €).
  - Fahrer brauchen den Führerschein CE (Skill Lkw ab Stufe 1).
  - Fahrprofil Lkw (`astar.ts`): bis 80 km/h, Landstraße 60 km/h, innerorts 45 km/h,
    Feldwege 12 km/h.
- **Aufträge (`transport`):**
  - Rübenabfuhr in der Kampagne (20.9. bis 15.1.) von der Feldrandmiete zur Zuckerfabrik Uelzen.
  - Korn vom Hoflager zum nächsten Landhandel (25.7. bis 15.9.). Landhandel und Getreidelager in
    Uelzen, Bad Bevensen, Lüchow, Wittingen und Salzwedel sind erfunden (`src/data/destinations.ts`).
  - Menge = Fläche × Ertrag (Rüben 80 t/ha, Weizen 7,5, Raps 3,8). Verhandelt wird in €/t.
  - Fracht: 1,80 €/t + 0,12 €/t je Straßen-km (Straße ≈ Luftlinie × 1,3). Eine Rübenfuhre über
    20 km bringt also etwa 4–5 €/t.
- **Ablauf:** Der Lkw pendelt Ladestelle → Ziel, bis alles abgefahren ist.
  - Laden: Rübenmaus an der Miete 8 min, Hoflager 15 min.
  - Abladen inkl. Waage und Probe: Zuckerfabrik 20 min, Landhandel 15 min.
  - Lenkzeit: nach 4,5 h Fahrt 45 min Pause.
  - Reicht die Arbeitszeit nicht mehr für eine Runde, fährt der Lkw heim und macht am nächsten
    Morgen weiter. Erreicht der Fahrer die Höchstarbeitszeit unterwegs, steht der Lkw über Nacht.
  - Kein Wetterstopp.
- **Kosten:** Diesel 32 l/100 km. Maut 0,35 €/km auf Abschnitten ab 65 km/h (Bundesstraßen,
  Autobahn), täglich gebucht (Kategorie „Maut“) und in der Auftragsauswertung als Fremdkosten.
- **Später:** mehrere Lkw je Auftrag, Abfuhrplan der Zuckerfabrik mit Zeitfenstern,
  Wartezeiten an der Waage, Fahrtenschreiber und Wochenlenkzeit, Kartoffeltransporte,
  Rückfracht (z. B. Kalk oder Dünger).

## Umsetzung Vorschlag 13: Auswertungen (5. Nov. 2026)

- **Reiter „Auswertung“ (`src/ui/Analytics.tsx`, Daten `Business.analytics()`):** einmal je Spieltag
  berechnet.
- **Umsatz je Sparte und Monat (letzte 12 Monate)** als gestapelte Säulen:
  - Lohnarbeit und Transport nach Rechnungsdatum.
  - Ackerbau (Ernte) und Biogas (Strom) nach Buchung.
  - Farben: Kategorien 1–4 der Referenzpalette, geprüft mit dem Palettenprüfer. Dazu Legende,
    Tooltip und Tabellenansicht.
- **Ergebnis je Monat:** Umsatz − direkte Kosten (Ackerbau und Pacht, Biogas, Maut) − allgemeine
  Kosten (Diesel, Personal, Werkstatt, Gebäude, Zinsen, Leasing, Versicherung), ohne AfA.
- **Auslastung Maschinen:** Einsatzstunden aus den Aufträgen des laufenden Jahres gegen einen
  anteiligen Richtwert (selbstfahrend 800 h, Geräte 300 h im Jahr).
- **Auslastung Personal:** Arbeitsminuten im Jahr (`Business.workMinutesYear`) gegen 1.900 h.
- **Kunden nach Deckungsbeitrag:** Rechnungsbetrag − Diesel − Maschinenkosten, dazu offene
  Rechnungen.
- **Später:** Vergleich zum Vorjahr, Deckungsbeitrag je Maschine inkl. AfA und Zinsen, Export als
  CSV, Ziele und Warnungen (z. B. Maschine unter 50 % ausgelastet).

## Umsetzung Vorschlag 5: Gärrest als Dienstleistung (5. Nov. 2026)

- **Gärrest für viehlose Kunden:** Läuft die eigene Anlage und liegen mindestens 300 m³ im Lager,
  fragen in der Gülle-Saison auch Betriebe ohne Vieh an.
  - Der Gärrest ist für den Kunden gratis (er spart Mineraldünger). Er zahlt nur die Ausbringung,
    etwa 3 €/m³ statt 4 €/m³ bei Gülle (Annahme).
  - Keine Konkurrenz, weil der Gärrest aus der eigenen Anlage kommt.
  - Beim Annehmen wird die Menge im Gärrestlager reserviert. Das Güllefass holt sie dort
    (`Order.sourceNode`).
  - Leert das Lager und bringt Umsatz statt 6 €/m³ Kosten an der Gärrestbörse.
- **Gülle selbst abholen:** Ein Liefervertrag kann „Anfuhr durch Dritte“ (2,50 €/m³, täglich)
  oder „selbst abholen“ sein.
  - Bei Selbstabholung legt „Gülle holen“ einen Eigenauftrag über rund 14 Tage Liefermenge an
    (höchstens bis die Vorgrube voll ist).
  - Den Auftrag fährt ein Schlepper mit Zubringer- oder Güllefass: pendeln Hof des Lieferanten →
    Anlage, Ansaugen und Abpumpen je 6 min.
  - Spart die Anfuhrkosten und lastet Schlepper und Fass im Winter aus.
- **Später:** Gärrest mit dem Lkw-Tankauflieger, Gärrestabgabe an Nachbarn im Tausch gegen
  Substrat, Nährstoffbilanz je Feld (Vorschlag 8).

## Mehrere Maschinen auf einem Feld (5. Nov. 2026)

- Ein laufender Auftrag kann weitere Maschinen bekommen, zum Beispiel einen zweiten Drescher oder
  Roder. Bei Gülle geht das nicht (dafür gibt es den Zubringer).
- **Verteilung (`Simulation.joinPlan`):**
  - Zuerst übernimmt die neue Maschine die Hälfte der noch nicht begonnenen Felder, von hinten.
  - Sonst teilt sie das aktuelle Feld. Vor Arbeitsbeginn gehen beide Maschinen je die Hälfte der
    Bahnen.
  - Erntemaschinen steigen auch mitten im Feld ein: Die erste hört auf halber Reststrecke auf
    (`stopAt`), die zweite übernimmt den Rest.
- **Abschluss:** Ein Feld gilt als fertig, wenn alle Anteile erledigt sind (`Order.shareDone`,
  `Business.fieldPartDone`).
- **Später:** abgestimmte Bahnen (nebeneinander statt hintereinander), gemeinsamer Abfahrer-Pool
  für mehrere Drescher, Planung mehrerer Maschinen im Board.
- **Weitere Ideen 20–45** (Mietpool, Präzisionstechnik, Überbreite, Bodenschonung,
  Kundencharaktere, Ökobetriebe, PV, Firmenwert u. a.) stehen in der Unterhaltung vom 5. Nov. und
  warten auf Auswahl.

## Gülle und Gärrest fremder Höfe und Biogasanlagen (5. Nov. 2026)

- **Fremde Biogasanlagen:** Jeder zehnte größere Betrieb (ab 120 ha) betreibt eine Anlage
  (`hasBga`, deterministisch).
  - Solche Betriebe fragen Gärrestausbringung an, auch ohne Vieh. Das Fass holt den Gärrest an
    ihrer Anlage.
  - Sie fragen auch **nur Transport** an: Gärrest von der Anlage zum Feldrandcontainer, Schlepper
    mit Zubringer- oder Güllefass, 1,00 €/m³ + 0,15 €/m³ je km, Saison Februar–Mai und
    August–September.
- **Gülle von fremden Höfen:** Etwa jeder dritte viehlose Betrieb nimmt Gülle oder Gärrest vom
  nächsten Viehbetrieb bzw. der nächsten BGA im Umkreis von 15 km auf (Gülle-/Gärrestbörse).
  Das Fass holt dort ab (`Request.sourceFarmId`, `Order.sourceNode`).

## Umsetzung 4b: weitere Ackerdienste (5. Nov. 2026)

- **Neue Dienste mit Saisonzeiten:**
  - Drillsaat (Raps 15.8.–10.9., Getreide 20.9.–31.10., 65 €/ha)
  - Einzelkornsaat Mais/Rüben (20.3.–10.5., 55 €/ha)
  - Pflanzenschutz (20.3.–30.6. und 15.9.–31.10., 22 €/ha ohne Mittel, Sachkunde nötig)
  - Stroh pressen (25.7.–15.9., 60 €/ha)
  - Kartoffelroden (1.9.–15.10.; nur Roden 330 €/ha, mit Abfuhr 420 €/ha, 45 t/ha)
- **Maschinen:**
  - Drillen: Amazone KE/Centaya 3 m, Horsch Pronto 6 DC
  - Einzelkorn: Kverneland Optima V 8-reihig, Horsch Maestro 12 SW
  - Spritzen: Amazone UX 5201 (24 m), Kverneland iXtrack T4 (30 m)
  - Pressen: Krone BiG Pack 1290 HDP II, Claas Quadrant 5300 FC
  - Kartoffelroder gezogen mit Bunker: Grimme SE 260 (6 t), EVO 290 (8 t)
  - Überladewagen: Fliegl ULW 2000/3000
- **Kartoffelroder:** wird vom Schlepper gezogen (`HARVEST_TOWED`) und arbeitet als Erntekette mit
  Bunker, Anhängern des Kunden oder eigenen Kippern.
- **Überladewagen:** Abfahrer für Drusch und Kartoffeln. Er lädt am Feldrand über, statt zum Hof zu
  fahren (kurzer Umlauf).
- **Eigener Ackerbau:** Mit eigener Drille, Einzelkornsämaschine, Spritze bzw. eigenem
  Kartoffelroder werden die Arbeitsgänge zu Eigenaufträgen. Gebucht werden dann nur die
  Betriebsmittel (`CropStep.materialHa`).

## Umsetzung Paket 2: Vermarktung, Rahmenverträge, Flächenkauf und Düngung, Biogas-Ausbau (5. Nov. 2026)

- **6 Vermarktung und Lager (`src/sim/marketing.ts`):**
  - Preise je Kultur bewegen sich täglich (Zufallsgang um den Basispreis, eigener Zufallsstrom).
  - Weizen und Raps haben dazu ein Saisonmuster: August −8 %, März/April +6 %.
  - Getreidelager 1.500 t (210.000 €) als Gebäude. Weizen und Raps werden zur Ernte eingelagert
    (abschaltbar) und später verkauft. Lagerkosten 1,50 €/t im Monat.
  - Vorkontrakte für Weizen, Raps und Kartoffeln: 1–12 Monate zum Terminpreis.
  - Geliefert wird am Termin aus dem Lager. Für Fehlmengen zahlt man die Preisdifferenz plus
    10 €/t.
- **7 Rahmenverträge:** Stammkunden bieten gelegentlich Verträge über 2–4 Jahre an. Sie decken die
  Dienste ab, die man für sie schon gefahren hat, zu 93–98 % des Marktpreises.
  - Anfragen werden automatisch Aufträge.
  - Der Kunde wechselt nicht zur Konkurrenz.
  - Drei Verspätungen beenden den Vertrag.
- **8 Flächenkauf und Düngung:** Jedes vierte Flächenangebot ist ein Verkauf. Preis: 30.000 €/ha
  bei Ackerzahl 35, je Punkt ±800 €, Beregnung +4.000 € (Annahme).
  - Eigentum zahlt keine Pacht und zählt in der Bilanz zum Vermögen.
  - Stickstoff: N-Bedarf je Kultur, organischer N aus Gärrest (3,5 kg/m³).
  - Düngeverordnung: höchstens 170 kg organischer N je ha und Jahr.
- **9 Biogas ausbauen:**
  - Nahwärmenetz (180.000 €, 8 Wochen): 36 % der Strommenge als Wärme zu 4,5 ct/kWh.
  - Flexibilisierung (600 €/kW): Flexzuschlag 65 €/kW im Jahr und +0,8 ct/kWh.
  - Silo festfahren: Neue Silage muss gewalzt werden. Mit eigenem Radlader (Betriebsgewicht × 4 t/h)
    geht das als Aufgabe `compact`, sonst walzt nach 2 Tagen eine Fremdwalze (100 t/h, 110 €/h).

## Umsetzung Paket 3: Disponent, Ausbildung, Konkurrenz mit Fuhrpark (5. Nov. 2026)

- **10 Disponent:** braucht ein Büro und kostet 3.900 € im Monat (Annahme). Jede Aufgabe ist
  einzeln schaltbar:
  - Routineanfragen (Grubbern, Stoppel, Saat, Einzelkorn, Pflanzenschutz, Pressen) zum
    Kundenpreis annehmen, wenn er mindestens 95 % des Marktpreises beträgt und höchstens zwei
    offene Routineaufträge je Schlepper bestehen.
  - Diese Aufträge stündlich zwischen 6 und 14 Uhr mit freien Fahrern und Gespannen starten.
  - Bei überfälligen Rechnungen am nächsten Tag anrufen.
- **11 Ausbildung:** Lehrgänge, während derer der Mitarbeiter als abwesend gilt („auf Lehrgang“):
  - Lkw-Führerschein CE (3.500 €, 20 Arbeitstage)
  - Pflanzenschutz-Sachkunde (300 €, 3 Tage)
  - Fahrerlehrgang (600 €, 5 Tage, eine Tätigkeit +1)
  - Landwirtschaftsmeister (8.000 €, 60 Tage, alle Tätigkeiten +1, Lohn +2 €/h)
  - Auszubildende: 3 Jahre, 6,40 €/h (etwa 1.100 € im Monat), lernen 50 % schneller und werden
    danach Facharbeiter zum Marktlohn.
- **12 Konkurrenz mit Fuhrpark:** Große Anbieter haben je Dienst 3 Maschinen, mittlere 2, kleine 1.
  - Gewonnene Aufträge belegen eine Maschine (etwa 25 ha am Tag).
  - Dazu kommt eine Grundauslastung: in der Erntespitze 55 %, sonst 15–25 %, deterministisch je Tag.
  - Ein ausgebuchter Anbieter bietet nicht mit.
  - Abwerben: selten bietet ein Konkurrent einer guten, nicht ganz zufriedenen Kraft
    1,50–3,00 €/h mehr. Gleichziehen oder gehen lassen (7 Tage Frist).
  - Übernahme: Ein kleiner Anbieter sucht selten einen Nachfolger (150.000–300.000 €). Die Kunden
    im Umkreis von 20 km kommen dazu, außerdem ein gebrauchter Schlepper und ein Grubber.

## Umsetzung Paket 4: Winterdienst, Kommunale Arbeiten, Ereignisse (5. Nov. 2026)

- **Gemeinden (`src/sim/municipal.ts`):** Uelzen, Bad Bevensen, Ebstorf, Bienenbüttel, Suderburg,
  Rosche, Bodenteich, Wrestedt, Lüchow und Wittingen.
  - Gemeinden sind Kunden mit eigener Id (−100 − Index).
  - Rechnungen und Zahlung laufen wie bei Betrieben.
- **2 Winterdienst:** Im Oktober bieten Gemeinden Verträge bis Ende März an: 1.200 € Bereitschaft
  im Monat und 95 € je Einsatzstunde. Nötig: Streuer mit Schneeschild.
  - Glätte: höchstens 1 °C mit Niederschlag, oder Frost nach Regen am Vortag.
  - Dann muss je Vertrag binnen 2 Stunden eine Tour starten. Sonst kostet es 300 € Strafe und
    Ruf; nach drei verpassten Einsätzen kündigt die Gemeinde.
- **3 Kommunale Arbeiten:** laufende Ausschreibungen in der Saison:
  - Böschungsmähen (Mai–Sept., 15–40 km, um 60 €/km)
  - Heckenschnitt (Okt.–Febr., 5–15 km, um 150 €/km)
  - Wegebau (Apr.–Okt., 3–8 km, um 400 €/km)
  - Ein verdecktes Gegengebot liegt bei 90–115 % des üblichen Preises; das günstigste Angebot
    gewinnt. Fertig binnen 30 Tagen.
- **Tour (Aufgabe `tour`):** Rundkurs um den Ort über 8 Straßenpunkte etwa 2 km von der Mitte, mit
  Arbeitstempo (Winterdienst 25, Mähen 4, Hecke 2, Wegebau 3 km/h), bis die Strecke geschafft ist.
- **Geräte:** Rauch AXEO + Frontschild, Mulag MKM 700, Dücker USK 63, Dücker Astschere, Dücker
  Wegepflegegerät (Händler Agrarservice Wittingen).
- **14 Ereignisse:**
  - Unwetter mit Sturm (April–Sept., selten): Feldarbeit ruht den Tag, eine Maschine Zustand −15.
  - Hagel (Juni/Juli): eigene stehende Kultur −20 %, außer mit Hagelversicherung (25 €/ha, am
    1. April).
  - Verkehrskontrollen: bei überfälliger Wartung oder schlechtem Zustand 250 € Bußgeld.
  - Messen: Agritechnica (November, ungerade Jahre) 8 %, DLG-Feldtage (Juni, gerade Jahre) 4 %
    Rabatt auf Neumaschinen.

## Umsetzung Ideen 26–30 und macOS-Kompatibilität (5. Nov. 2026)

Recherche (Quellen siehe unten): Niedersachsen 2024 rund 7,9 % Ökobetriebe bzw. 6,0 % Ökofläche;
von 2010 bis 2023 fiel die Zahl der Betriebe von etwa 41.730 auf 34.040 (rund 1,5 % im Jahr).
Bei rund 63 % der Einzelunternehmen mit Leitung über 55 ist die Hofnachfolge offen.
Die Nordzucker-Kampagne läuft von Anfang September bis Mitte Januar. Die Abfuhr wird eng
getaktet, im Werk Nordstemmen kommen täglich 800–900 Lkw-Ladungen an. Einen belastbaren
Lohnsatz fürs Hacken und Striegeln gibt es nicht; für Striegeln mit eigener Maschine werden
40–55 €/ha genannt.

- **26 Kundencharaktere** (`farmCharacter`, fest aus der Id): 40 % unkompliziert, 15 % pedantisch,
  20 % Preisdrücker, 10 % zahlt gern spät, 15 % sehr treu.
  - Pedantisch: 2 Tage kürzere Fristen, Ärger ×1,8, Lob ×1,3.
  - Preisdrücker: bieten 7 % weniger.
  - Spätzahler: +30 % Wahrscheinlichkeit, nicht pünktlich zu zahlen.
  - Treu: halber Ärger, wechseln erst unter 10 % Zufriedenheit.
- **27 Empfehlungen:** Nach pünktlicher Arbeit empfiehlt ein zufriedener Kunde (ab 75 %) den Betrieb
  weiter: Stammkunde mit 35 %, sonst mit 15 % Chance, Treue ×1,5.
  - Der nächste unbekannte Nachbar (bis 8 km) kommt ins Adressbuch, Ruf +0,5.
  - Auf der Karte erscheinen blaue gestrichelte Linien.
- **28 Strukturwandel** (1. Januar):
  - Rund 1,5 % der Betriebe geben auf; die Flächen gehen an den nächsten größeren Nachbarn, der
    Betrieb verschwindet von der Karte.
  - Rund 3 % haben einen Generationswechsel: neue Ansprechperson (Zufriedenheit 50), mehr oder
    weniger Eigenmechanisierung.
  - Rund 0,6 % stellen auf Öko um.
  - Der Spielstand speichert die Änderungen.
- **29 Ökobetriebe** (Start rund 8 %, `isOrganic`): kein chemischer Pflanzenschutz.
  - Dafür Striegeln (20.3.–31.5., 35 €/ha, Annahme) und Hacken (1.5.–30.6., 60 €/ha, Annahme).
  - Auflage: Die Maschinen werden vor dem Einsatz gereinigt (+20 min).
  - Geräte: Einböck Aerostar 9 m, Treffler Zinkenstriegel 12 m, Einböck Chopstar mit Kamera.
- **30 Zuckerfabrik-Kampagnenplanung:** Wer einen eigenen Lkw hat, wird am 10. September von
  Nordzucker eingeplant: 100 t + 4 t je Zuverlässigkeitspunkt (0–100, Start 50) je Lkw (höchstens
  drei zählen) und Woche.
  - Jeden Montag kommt ein Abfuhrfenster von 5 Tagen: Miete → Zuckerfabrik, Fracht je t nach
    Entfernung.
  - Pünktlich +3 Punkte, verspätet −8.
- **macOS-Kompatibilität:**
  - WKWebView entspricht dem Safari der jeweiligen macOS-Version.
  - MapLibre braucht WebGL 2, die Simulation Module-Worker; beides gibt es erst ab Safari 15.
    Mindestversion deshalb jetzt macOS 12 (Monterey).
  - `src/polyfills.ts` ergänzt `structuredClone` (Safari 15.4), `Array.at` (15.4) und
    `CanvasRenderingContext2D.roundRect` (16).
  - Fehlt WebGL 2, erscheint beim Start eine verständliche Meldung statt einer leeren Karte.
  - Tastenkürzel reagieren nicht mehr zusammen mit Cmd, Strg oder Alt (Cmd+1 usw. gehören dem
    System).
  - Das Standard-App-Menü von Tauri 2 unter macOS bleibt aktiv (Kopieren/Einfügen, Beenden).
  - Kartenprotokoll: `convertFileSrc` erzeugt je System die richtige URL
    (`mapdata://localhost/` bzw. `http://mapdata.localhost/`).
  - CI: Der macOS-Job (bei `[mac]`) startet die gebaute Universal-App im Selbsttest mit WKWebView,
    macht ein Bildschirmfoto und prüft das Ergebnis.
- **Quellen:**
  [Landtag Niedersachsen 19/6841](https://www.landtag-niedersachsen.de/drucksachen/drucksachen_19_07500/06501-07000/19-06841.pdf),
  [Agrarstrukturerhebung Niedersachsen 2023](https://www.statistischebibliothek.de/mir/servlets/MCRFileNodeServlet/NIMonografie_derivate_00001219/Agrarstrukturerhebung-Niedersachsen-2023-Statistisch-gesehen_pdfa.pdf),
  [Bundestag 20/8577 (Hofnachfolge)](https://dserver.bundestag.de/btd/20/085/2008577.pdf),
  [Lebensmittel Zeitung: Kampagne 2025/26](https://www.lebensmittelzeitung.net/industrie/nachrichten/kampagne-202526-nordzucker-startet-ruebenernte-186325),
  [leinetal24: Kampagne Nordstemmen](https://www.leinetal24.de/lokales/nordstemmen/ruebenkampagne-in-nordstemmer-zuckerfabrik-ist-angelaufen-90047674.html),
  [Landtreff (Striegelkosten)](https://www.landtreff.de/okologische-landwirtschaft-t92385-2550.html),
  [Khronos WebGL/WebKit](https://wikis.khronos.org/webgl/Implementations/WebKit),
  [Tauri: Custom-Protokolle](https://github.com/tauri-apps/tauri/commit/ba025588f3559858f43547e8c04424c47a3c445b).

## Wirtschaftlichkeits-Simulation (6. Nov. 2026)

- **Test:** `tests/unit/economy-sim.test.ts` mit Bot `tests/sim/economyBot.ts`, auf den echten
  Kartendaten.
  - Simuliert standardmäßig 2 Spieljahre in wenigen Sekunden; `ECONOMY_YEARS`, `ECONOMY_SEED` und
    `ECONOMY_REPORT` steuern den Lauf.
  - Prüft Plausibilitätsgrenzen: Aufträge, Verspätungen, Absagen, Wachstum, Umsatz je Schlepper
    30–300 T€, Eigenkapital positiv, Schulden unter 500 T€, kein Goldesel.
- **Ergebnisse und Befunde:** `docs/wirtschaft-simulation.md`.
- **Neue Spielregel:** Nie begonnene Aufträge sagt der Kunde eine Woche nach der Frist ab
  (Zufriedenheit −15, Ruf −2, `Order.cancelled`).
- **Behoben:** Endlosschleife des Güllefasses bei gerundeter Auftragsfläche.
- **Balance-Kandidaten (noch nicht geändert):**
  - Bilanz zum Buchwert statt Marktwert.
  - Pflanzenschutz-Satz (14 €/ha DB) und Stoppel prüfen.
  - Bot um Erntedienste und Winterarbeit erweitern, um Wachstumsstrategien zu vergleichen.
