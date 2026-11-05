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

