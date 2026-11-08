# Strategie-Tests: Spielbarkeit und Wirtschaftlichkeit (6. Nov. 2026)

Ein regelbasierter Spieler (Bot, `tests/sim/economyBotFull.ts`) spielt auf den echten Kartendaten (Seed 2027).
Er führt unterschiedliche Betriebe, vom Spezialisten bis zum Allrounder, jeweils mit drei Stufen der
Investitionsfreude. Test: `tests/unit/strategies.test.ts`.

## Strategien

| Kürzel | Betrieb | Kernmaschinen |
| --- | --- | --- |
| guelle | Gülle-Spezialist: Ausbringung, Zubringer, Gärrest-Transport | Güllefass, Zubringer |
| drusch | Drusch-Spezialist: Mähdrusch mit Abfuhr, Stroh pressen | Mähdrescher, Kipper, Überladewagen |
| rueben | Rüben-Spezialist: Einzelkornsaat, Roden, Lkw-Abfuhr | Rübenroder, Lkw |
| transport | Transport-Spezialist | Lkw |
| kommunal | Kommunal-Dienstleister: Winterdienst, Böschungen, Hecken, Wege | Streuer, Auslegemäher, Astschere, Wegehobel |
| feld | Feldarbeit-Allrounder: alle Felddienste, keine Ernte | Schlepper und Anbaugeräte |
| allround | Allrounder: alle Dienste und eigener Ackerbau | alles nach Ausbauplan |

| Investitionsfreude | Verhalten |
| --- | --- |
| vorsichtig | Nur gebraucht, kein Leasing. 50 % Rücklage nach dem Kauf. Ausbau erst ein Jahr später, höchstens 5 Schlepper. |
| normal | Gebraucht bevorzugt, nach 6 Monaten auch neu (Darlehen). Leasing ab 500.000 € Eigenkapital, höchstens 10 Schlepper. Kernmaschinen der Spezialisten notfalls geleast. |
| mutig | Sofort neu oder geleast, 15 % Rücklage. Ausbau ein Jahr früher, höchstens 16 Schlepper. |

## Was geprüft wird

- **Spielbarkeit, immer:**
  - keine ungültigen Zahlen
  - keine hängende Erntekette: 72 Arbeitsstunden ohne Fortschritt, obwohl kein Mitglied krank ist, Feierabend hat, wegen Wetter ruht oder eine Panne hat
  - Spielstand lässt sich speichern, laden und weiterspielen
  - der Lauf geht bis zum Ende, außer bei endgültiger Insolvenz
- **Wirtschaft, nur in den kurzen Läufen bis 2 Jahre (CI):**
  - die Hauptsparte bringt Umsatz (außer bei „vorsichtig“)
  - wer vorsichtig investiert, gerät nicht in die Sanierung
  - weniger als 15 % Stornos
  - kein Geldsegen: Gewinn höchstens halber Umsatz bzw. 100.000 €
- **Läufe:**
  - CI rechnet jede Strategie 1 Jahr „normal“ und den Allrounder 2 Jahre vorsichtig und mutig (etwa 20 s).
  - Die Langläufe unten liefen lokal: 21 Kombinationen über 2 und 10 Jahre, 9 über 50 Jahre.

Neu erzeugen:

```bash
STRATEGY_PROFILES=allround:normal,drusch:mutig STRATEGY_YEARS=50 STRATEGY_OUT=<ordner> npx vitest run tests/unit/strategies.test.ts
STRATEGY_REPORT_FROM=<ordner> STRATEGY_REPORT=<datei.md> npx vitest run tests/unit/strategies.test.ts
```

## Ergebnis in Kürze

**Spielbarkeit:** In allen 51 Läufen gab es keine ungültigen Zahlen und keine hängenden Ketten, und jeder
Spielstand ließ sich laden.
- Gefunden und behoben im Spiel: Nach einer gescheiterten Sanierung wuchsen die Schulden durch 11 %
  Überziehungszins endlos weiter, bis in dreistellige Millionen. Jetzt endet das Spiel mit der endgültigen
  Insolvenz: nach vier Verlängerungen der Sanierung oder wenn nichts mehr zu verwerten ist.
- Gefunden im Bot (nur Test): Er holte Meldungen und Routen nie ab und brauchte deshalb bis 3,6 GB Speicher.
  Außerdem kaufte er zu schwere Geräte und hatte zu wenig Fahrer.

**Wirtschaftlichkeit:**

| Strategie | Ergebnis |
| --- | --- |
| Feldarbeit-Allrounder | Bester Weg. In jedem Jahr Gewinn (10/10 bzw. 50/50), nach 10 Jahren 1,3–1,5 Mio. € und nach 50 Jahren 5,5 Mio. € Eigenkapital. |
| Allrounder normal | Wächst auf 1,5–2 Mio. € Umsatz, 34 von 50 Jahren mit Gewinn, nach 50 Jahren 3,6 Mio. € Eigenkapital. Ab etwa Jahr 30 stagniert er (Ø −24 T€ in den letzten 5 Jahren), weil der Bot den Fuhrpark nicht erneuert. |
| Allrounder vorsichtig | Gut bis Jahr 10 (1,1 Mio. €). Nach großen Erntemaschinen-Käufen 2037 Sanierung, 2044 insolvent. |
| Allrounder mutig | Wächst schnell (2. Jahr 627 T€ Umsatz). Zu viel Leasing, Sanierung 2030, insolvent 2032. |
| Gülle-Spezialist | Etwa ±0: 40–70 T€ Umsatz, kleine Gewinne und Verluste, überlebt 50 Jahre knapp. |
| Drusch-Spezialist | Nicht tragfähig. Ein (geleaster) Drescher schafft nur 35–100 T€ Umsatz im Jahr. Normal und mutig sind nach 5–6 Jahren insolvent; vorsichtig findet keinen bezahlbaren Gebrauchten und macht kaum Umsatz. |
| Rüben-Spezialist | Nicht tragfähig. Ein neuer Rexor kostet geleast 126 T€ im Jahr, der Umsatz liegt bei 60–270 T€. Mutig ist nach 5 Jahren insolvent, normal nach 10 Jahren. |
| Transport-Spezialist | Nicht tragfähig. Lkw-Aufträge gibt es nur in der Ernte- und Rübenkampagne, den Rest des Jahres steht der Lkw. Insolvenz nach 8 (mutig) bzw. 10 Jahren (normal). |
| Kommunal-Dienstleister | Nicht tragfähig. Nur 5–40 T€ Umsatz im Jahr: wenige Ausschreibungen, Winterdienst nur an Glättetagen. Insolvenz nach 18 Jahren (normal). |

## Ursachen und Vorschläge (Entscheidung Nils)

1. **Erntemaschinen sind zu wenig ausgelastet.**
   - Ursache: Der 10-Stunden-Tag, der Morgentau und die kurze Saison begrenzen den Drescher auf 300–400 ha.
     Lohnunternehmer schaffen in der Praxis 600–1.000 ha.
   - Vorschlag: In Ernte und Kampagne bis 12 Stunden Arbeitszeit erlauben. Das ArbZG lässt für Saison- und
     Kampagnebetriebe längere Arbeitszeiten auf Antrag zu (§ 15).
   - Vorschlag: Weitere Druschfrüchte ergänzen (Körnermais im Oktober, Leguminosen).
2. **Spezialisten finden zu wenig Kunden.** Vorschlag: Spezialisten ziehen Anfragen aus dem ganzen Umkreis von
   50 km an, zum Beispiel durch Werbung oder Ruf je Dienst.
3. **Transport ist nur saisonal.** Vorschlag: Ganzjährige Frachten (Dünger, Baustoffe, Holz, Futtermittel)
   für Lkw.
4. **Kommunal ist zu klein.** Vorschlag: Mehr Ausschreibungen und mehrjährige Rahmenverträge der Gemeinden
   (Mähen, Hecken, Wege), Winterdienst-Bereitschaft je Gemeinde höher.
5. **Großmaschinen neu sind zu teuer für den Einstieg.** Vorschlag: Mehr Gebrauchtangebote für Roder und
   Drescher, Maschinengemeinschaften oder Mietmaschinen.
6. **Sanierung:** Die Bank verkauft die wertvollsten Maschinen zuerst. Danach kann sich der Betrieb nicht mehr
   erholen. Vorschlag: zuerst kaum genutzte Maschinen verkaufen.
7. **Bot:** Er erneuert den Fuhrpark nicht und tauscht kranke Fahrer nicht aus. Ein Spieler würde das tun; die
   Spätjahre der Allrounder sind deshalb eher zu schlecht.

## Nachtrag: Absagen ohne Folgen und organisch wachsender Betrieb

### Absagen für Dienste, die der Betrieb nicht anbietet

**Bisher:**
- Jede Absage kostete beim Kunden −2 Zufriedenheit.
- Eine unbeantwortete Anfrage kostete −5 Zufriedenheit und −1 Ruf.
- Das galt auch für Dienste, für die der Betrieb gar keine Maschine hat. Kunden fragen jeden Dienst der Saison an.
- Spezialisten verloren dadurch laufend Zufriedenheit. Unter 20 % wechselt ein Kunde zur Konkurrenz, also blieben
  die Kunden auch für den eigentlichen Dienst weg.

**Jetzt:** Absage und Verfall sind folgenlos, wenn der Betrieb den Dienst nicht anbietet.
- Ein Dienst gilt als nicht angeboten, wenn keine passende Maschine im Fuhrpark ist oder bestellt wurde.
- Bei Ketten mit Abfuhr fehlt ein Abfahrwagen, beim Pflanzenschutz ein Fahrer mit Sachkunde.
- Die Anfrage zeigt den Hinweis „Bieten wir (noch) nicht an“.
- Code: `Business.offersService`; Test in `business.test.ts`.

**Wirkung über 10 Jahre (normal):**

| Strategie | vorher | nachher |
| --- | --- | --- |
| Gülle | 6 Gewinnjahre, Gewinn gesamt −3 T€ | 9 Gewinnjahre, +350 T€, Umsatz 68 → 118 T€ |
| Rüben | insolvent 2036 | 6 Gewinnjahre, +37 T€, Umsatz 57 → 285 T€ |
| Transport | insolvent 2036 | überlebt, −59 T€ |
| Drusch | insolvent 2031 | insolvent 2033 |
| Feldarbeit | +1.190 T€ | +1.279 T€ |

### Organisch wachsender Betrieb (Strategie `organisch`)

**So wächst er:**
- Er startet mit dem Schlepper vom Hof.
- Geräte kauft er erst, wenn ein Kunde den Dienst anfragt; Schlepper und Saisonkräfte erst, wenn er ausgelastet ist.
- Erntemaschinen, Lkw und Kommunalgeräte kommen erst, wenn Kunden sie im Vorjahr mindestens 12-mal angefragt haben
  (Kommunal: 3 Ausschreibungen).
- Er kauft nur gebraucht, aus der Kasse plus höchstens dem halben freien Kreditrahmen, ohne Leasing.

| Investitionsfreude | 2 Jahre | 10 Jahre | 50 Jahre |
| --- | --- | --- | --- |
| vorsichtig | +76 T€, 9 Dienste | 1,3 Mio. € Eigenkapital, 4 Gewinnjahre | Sanierung 2041, insolvent 2046 |
| normal | +38 T€, 10 Dienste | 1,5 Mio. € Eigenkapital, 7 Gewinnjahre, 15 Dienste | Sanierung 2041, insolvent 2048 |
| mutig | −11 T€ | 1,9 Mio. € Eigenkapital, 7 Gewinnjahre, 16 Schlepper | 50 Jahre durchgespielt, 25 Gewinnjahre, Spitze 3,9 Mio. € Eigenkapital (2049), dann Abstieg, Sanierung ab 2071, Ende −0,57 Mio. € |

Offen: Im mutigen 50-Jahres-Lauf meldet die Prüfung zweimal eine Erntekette, die 72 Arbeitsstunden ohne Fortschritt
stand. Das ist noch nicht untersucht; der Lauf dauert gut 80 Minuten.

Der organische Betrieb wächst gesund bis etwa Jahr 15 (über 2 Mio. € Umsatz). Danach steigen die Personalkosten auf
über 1 Mio. € im Jahr, weil der Bot je Erntemaschine und Lkw einen festen Fahrer einstellt (am Ende 12 feste plus
9 Saisonkräfte). Dazu kommen ältere Maschinen mit steigenden Werkstattkosten (bis 200 T€). Dann folgen Verluste,
Sanierung und Insolvenz.

## Warum gehen Betriebe pleite, obwohl die Aufträge profitabel sind?

Jeder einzelne Auftrag bringt mehr ein, als er an Diesel, Lohnstunden und Verschleiß kostet. Ein Betrieb muss aber
auch die festen Kosten tragen. Pleite geht er, wenn die Aufträge im Jahr nicht reichen, um die festen Kosten zu
decken.

1. **Feste Kosten gegen Saisonarbeit.** Am Beispiel Drusch-Spezialist, normal, Werte aus dem Lauf:
   - Ein Hektar bringt 165 € (mit Abfuhr 215 €). Diesel kostet etwa 25 €/ha, das Fahrerentgelt je Stunde ist im
     festen Lohn enthalten. Es bleiben gut 140 €/ha Deckungsbeitrag.
   - Feste Kosten im Jahr:
     - Leasing des Dreschers: 55 T€
     - Personal (fester Fahrer für den Drescher, Saisonkraft): 57 T€
     - AfA für Kipper und Zugschlepper: 59 T€
     - Versicherung: 5 T€
     - zusammen rund 175 T€
   - Daraus folgt eine Gewinnschwelle von rund 1.250 ha im Jahr. Der Drescher schafft in 6–7 Wochen Ernte (10-h-Tag,
     morgens Tau, Regentage) aber nur 300–550 ha, also bleiben 80–100 T€ Verlust im Jahr.
2. **Fester Lohn für Saisonmaschinen.** Erntemaschinen und Lkw arbeiten 2–4 Monate. Ein fest angestellter Fahrer
   kostet 12 Monate, rund 45–55 T€. Beim organischen Betrieb fallen dadurch 2040 1,07 Mio. € Personalkosten bei
   2,2 Mio. € Umsatz an. Saisonkräfte, die nur für geleistete Stunden bezahlt werden, wären günstiger. Der Bot nutzt
   sie für Erntefahrer bisher nicht.
3. **Teure neue Großmaschinen.** Ein neuer Rexor kostet geleast 123 T€ im Jahr. Die Rübenkampagne bringt einem
   kleinen Betrieb 90–175 T€ Roder-Umsatz. Gebrauchte Großmaschinen sind selten und für Neulinge kaum bezahlbar.
4. **Saisonale Nachfrage.** Lkw-Fracht gibt es nur in der Ernte- und Rübenkampagne. Kommunal bringt wenige
   Ausschreibungen, und Winterdienst gibt es nur an Glättetagen. Maschinen und Leute stehen den Rest des Jahres.
5. **Kunden gingen verloren** durch Absagen für nicht angebotene Dienste (bis heute; jetzt behoben, siehe oben).
6. **Schuldenspirale.**
   - Ein Verlustjahr mit großen Käufen drückt das Konto über den Rahmen.
   - Dort kostet jeder Euro 11 % Zins.
   - Dann kommt die Sanierung, und die Bank verwertet die wertvollsten Maschinen.
   - Danach fehlt der Umsatz, um je wieder herauszukommen.
7. **Alternder Fuhrpark.** Der Bot erneuert alte Maschinen nicht. Die Werkstattkosten steigen, die Pannen nehmen zu,
   Aufträge kommen zu spät, und der Ruf sinkt.

**Was trägt:**
- Feldarbeit mit Schlepper und Anbaugeräten: über 10 Monate verteilt, günstige Geräte, Saisonkräfte nach Stunden.
- Spezialisierung nur dort, wo die Saison lang ist (Gülle Februar bis Mai und August/September).
- Erntemaschinen erst, wenn genug Fläche zusammenkommt, und mit Saisonfahrern statt fester Stelle.

## Nachtrag 8. Nov.: realistische Arbeitszeiten, Schichten, Landwirte als Abfahrer

Neu im Spiel:
- Schichtbetrieb: Drescher und Häcksler in 2 Schichten, Rübenroder und Lkw-Kampagne rund um die Uhr.
- Arbeitszeitgesetz: 10 h am Tag, 48 h im Mittel, Ruhezeit 10 bzw. 11 h.
- Arbeitszeitkonto für Feste statt sofortiger Überstundenzuschläge.
- Landwirte als Abfahrer: 90 €/h, auf dem eigenen Feld kostenlos.
- Korrektur: Abfahrer, die auf eine ruhende Erntemaschine warten, sammeln keine Arbeitszeit mehr.

Der Bot nutzt Schichten, Saisonkräfte als Ablösung und Landwirte, wenn eigene Wagen fehlen.

**Vergleich über 10 Jahre (normal), vorher (6. Nov., mit Absage-Korrektur) gegen nachher:**

| Strategie | Gewinn gesamt vorher | nachher | Gewinnjahre nachher | Eigenkapital Ende nachher |
| --- | ---: | ---: | ---: | ---: |
| Rüben | +37 T€ | **+1.431 T€** | 10/10 | 1,25 Mio. € |
| Transport | −59 T€ | **+699 T€** | 8/10 | 0,73 Mio. € |
| Allrounder | −152 T€ | **+1.342 T€** | 9/10 | 2,18 Mio. € |
| Organisch | +414 T€ | **+741 T€** | 8/10 | 1,77 Mio. € |
| Gülle | +350 T€ | +350 T€ | 9/10 | 0,39 Mio. € |
| Feldarbeit | +1.279 T€ | +858 T€ | 10/10 | 1,31 Mio. € |
| Drusch | insolvent 2033 | insolvent 2032 | 0/6 | – |
| Kommunal | −308 T€ | −308 T€ | 0/10 | 0 |

**Warum:**
- **Rüben und Transport:** Roder und Lkw laufen in der Kampagne rund um die Uhr. So kommt die Fläche zusammen, die die
  teure Maschine braucht.
- **Allrounder und Organisch:** Sie profitieren von den Schichten in der Ernte, vom Arbeitszeitkonto und davon, dass die
  Wartezeit der Abfahrer nicht mehr bezahlt wird.
- **Drusch:** Mit 2 Schichten steigt der Umsatz von 57–87 auf 101–138 T€ im Jahr. Leasing (82 T€) und Personal (64 T€)
  bleiben aber zu hoch; ein Drescher allein findet nicht genug Fläche.
- **Feldarbeit:** schlechter als vorher. Das 48-h-Mittel begrenzt Saisonkräfte, die im Frühjahr und Sommer 60 h in der
  Woche fahren; nach etwa 19 Wochen ist ihr Kontingent ausgeschöpft. Ab 2032 trennen sich auch die Kaufentscheidungen.
- **Kommunal:** keine Erntearbeit, daher unverändert.

**Über 50 Jahre (normal):**

| Strategie | vorher | nachher |
| --- | --- | --- |
| Organisch | Sanierung 2041, insolvent 2048 | **47/50 Gewinnjahre, +22,95 Mio. €, Eigenkapital 17,1 Mio. €, nie Sanierung** |
| Allrounder | 34/50 Gewinnjahre, Eigenkapital 3,6 Mio. € | **49/50 Gewinnjahre, +17,93 Mio. €, Eigenkapital 13,2 Mio. €** (eine Sanierung 2034, überstanden) |

In den späten Jahren liegt die Marge bei etwa 17–20 % vom Umsatz. Das ist eher großzügig, denn der Bot erneuert den
Fuhrpark kaum, und die Abschreibung fällt deshalb niedrig aus. Für einen Spieler, der Maschinen ersetzt, liegt sie
niedriger.

**Neuer Fehler gefunden (Spielstand-Prüfung):** Angeheuerte Gespanne bekamen Maschinennummern, die schon für bestellte
Lieferungen vergeben waren. Bei der Lieferung gab es die Nummer doppelt, und der Spielstand ließ sich nicht laden.
Behoben, mit Test.

## Alle Läufe

| Strategie | Invest | Jahre (geplant) | Umsatz Ø letzte 5 J. (T€) | Gewinn Ø letzte 5 J. (T€) | Gewinnjahre | Gewinn gesamt (T€) | Eigenkapital Ende (T€) | EK min (T€) | Schulden max (T€) | Sanierung ab | Insolvenz | Dienste | Schlepper / Maschinen / Personal | verspätet % | storniert % | Ruf Ende (min) | hängende Ernte | Rechenzeit |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- | ---: | ---: | --- | ---: | ---: |
| guelle | vorsichtig | 2 | 43 | -4 | 1/2 | -8 | 236 | 221 | 27 | – | – | 2 | 1 / 4 / 1 | 22.9 | 5.4 | 63 (52) | 0 | 3 s |
| guelle | normal | 2 | 57 | -7 | 1/2 | -13 | 252 | 224 | 28 | – | – | 2 | 1 / 4 / 1 | 10.9 | 2.1 | 95 (85) | 0 | 2 s |
| guelle | mutig | 2 | 39 | -11 | 0/2 | -22 | 228 | 201 | 0 | – | – | 2 | 1 / 4 / 1 | 10.6 | 2.1 | 96 (58) | 0 | 3 s |
| drusch | vorsichtig | 2 | 0 | -35 | 0/2 | -69 | 166 | 166 | 77 | – | – | 1 | 1 / 3 / 1 | 0 | 0 | 52 (50) | 0 | 1 s |
| drusch | normal | 2 | 84 | -77 | 0/2 | -154 | 110 | 110 | 61 | – | – | 1 | 2 / 5 / 2 | 44.3 | 6.2 | 12 (2) | 0 | 4 s |
| drusch | mutig | 2 | 100 | -82 | 0/2 | -164 | 122 | 122 | 199 | – | – | 1 | 3 / 7 / 3 | 53.6 | 0 | 6 (6) | 0 | 3 s |
| rueben | vorsichtig | 2 | 27 | -16 | 0/2 | -31 | 206 | 206 | 0 | – | – | 1 | 1 / 3 / 1 | 0 | 0 | 100 (88) | 0 | 1 s |
| rueben | normal | 2 | 235 | -31 | 1/2 | -63 | 232 | 232 | 82 | – | – | 3 | 1 / 5 / 2 | 21.8 | 0.9 | 89 (55) | 0 | 4 s |
| rueben | mutig | 2 | 322 | 14 | 1/2 | 29 | 299 | 299 | 210 | – | – | 3 | 1 / 6 / 3 | 17.3 | 1.5 | 66 (66) | 0 | 4 s |
| transport | vorsichtig | 2 | 32 | -32 | 0/2 | -63 | 206 | 183 | 107 | – | – | 1 | 1 / 3 / 1 | 14.9 | 0 | 89 (50) | 0 | 2 s |
| transport | normal | 2 | 70 | -19 | 0/2 | -38 | 261 | 219 | 82 | – | – | 1 | 1 / 3 / 1 | 33.3 | 1.4 | 48 (20) | 0 | 2 s |
| transport | mutig | 2 | 116 | -38 | 0/2 | -76 | 233 | 206 | 199 | – | – | 1 | 1 / 4 / 2 | 27.1 | 0.8 | 89 (24) | 0 | 3 s |
| kommunal | vorsichtig | 2 | 6 | -57 | 0/2 | -114 | 144 | 144 | 98 | – | – | 2 | 3 / 6 / 3 | 30 | 0 | 51 (50) | 0 | 2 s |
| kommunal | normal | 2 | 16 | -68 | 0/2 | -136 | 140 | 140 | 74 | – | – | 2 | 3 / 6 / 3 | 44.4 | 0 | 32 (32) | 0 | 3 s |
| kommunal | mutig | 2 | 28 | -71 | 0/2 | -142 | 152 | 152 | 129 | – | – | 4 | 3 / 8 / 3 | 36.4 | 0 | 44 (44) | 0 | 3 s |
| feld | vorsichtig | 2 | 294 | 47 | 2/2 | 94 | 403 | 269 | 280 | – | – | 8 | 4 / 16 / 4 | 3.6 | 0.5 | 100 (100) | 0 | 7 s |
| feld | normal | 2 | 273 | 34 | 2/2 | 67 | 366 | 288 | 259 | – | – | 8 | 4 / 15 / 4 | 6.7 | 1.9 | 100 (98) | 0 | 6 s |
| feld | mutig | 2 | 365 | 58 | 2/2 | 115 | 458 | 306 | 324 | – | – | 10 | 4 / 20 / 5 | 3.2 | 1.2 | 96 (96) | 0 | 8 s |
| allround | vorsichtig | 2 | 282 | 17 | 1/2 | 35 | 351 | 269 | 300 | – | – | 8 | 3 / 15 / 4 | 3.8 | 0.6 | 100 (100) | 0 | 6 s |
| allround | normal | 2 | 245 | -20 | 1/2 | -41 | 259 | 259 | 305 | – | – | 8 | 4 / 15 / 4 | 6.2 | 2.1 | 99 (98) | 0 | 5 s |
| allround | mutig | 2 | 627 | 33 | 2/2 | 65 | 339 | 314 | 312 | – | – | 10 | 4 / 19 / 5 | 18.6 | 1.2 | 61 (59) | 0 | 13 s |
| guelle | vorsichtig | 10 | 38 | -27 | 2/10 | -165 | 14 | 14 | 69 | – | – | 2 | 1 / 4 / 2 | 9 | 2.4 | 99 (52) | 0 | 12 s |
| guelle | normal | 10 | 68 | 4 | 6/10 | -3 | 260 | 224 | 84 | – | – | 2 | 2 / 5 / 2 | 7.8 | 5.3 | 100 (85) | 0 | 12 s |
| guelle | mutig | 10 | 45 | 9 | 4/10 | -61 | 129 | 129 | 136 | – | – | 2 | 2 / 6 / 2 | 12.5 | 2.6 | 100 (58) | 0 | 10 s |
| drusch | vorsichtig | 10 | 0 | -5 | 1/10 | -212 | 20 | 20 | 77 | – | – | 1 | 1 / 2 / 1 | 0 | 0 | 55 (50) | 0 | 7 s |
| drusch | normal | 5 (10) | 50 | -80 | 0/5 | -401 | -198 | -198 | 214 | 2030 | 2031 | 1 | 0 / 2 / 2 | 28.5 | 3 | 67 (2) | 0 | 8 s |
| drusch | mutig | 6 (10) | 35 | -120 | 0/6 | -631 | -424 | -424 | 439 | 2029 | 2032 | 1 | 0 / 1 / 3 | 24.5 | 11.7 | 66 (6) | 0 | 8 s |
| rueben | vorsichtig | 10 | 7 | 1 | 2/10 | -73 | 165 | 165 | 0 | – | – | 1 | 1 / 3 / 1 | 0 | 0 | 97 (88) | 0 | 6 s |
| rueben | normal | 10 | 57 | -37 | 1/10 | -425 | -186 | -186 | 196 | 2035 | 2036 | 3 | 0 / 1 / 2 | 15.9 | 0.2 | 85 (55) | 0 | 17 s |
| rueben | mutig | 5 (10) | 274 | -133 | 1/5 | -664 | -370 | -370 | 386 | 2030 | 2031 | 3 | 0 / 3 / 4 | 16.1 | 1.2 | 100 (54) | 0 | 11 s |
| transport | vorsichtig | 10 | 23 | -23 | 3/10 | -158 | -6 | -6 | 107 | – | – | 1 | 1 / 2 / 1 | 17.6 | 0 | 77 (50) | 0 | 9 s |
| transport | normal | 10 | 118 | -66 | 2/10 | -540 | -319 | -319 | 330 | 2035 | 2036 | 1 | 0 / 1 / 3 | 17.4 | 0.6 | 83 (20) | 0 | 17 s |
| transport | mutig | 8 (10) | 138 | -99 | 0/8 | -618 | -284 | -284 | 310 | 2033 | 2034 | 1 | 0 / 3 / 4 | 17.6 | 0.2 | 100 (24) | 0 | 14 s |
| kommunal | vorsichtig | 10 | 21 | 1 | 4/10 | -276 | 11 | 11 | 105 | – | – | 2 | 2 / 4 / 3 | 44.1 | 0 | 0 (0) | 0 | 8 s |
| kommunal | normal | 10 | 22 | -6 | 0/10 | -308 | -1 | -1 | 127 | – | – | 2 | 2 / 5 / 3 | 44.7 | 0 | 0 (0) | 0 | 10 s |
| kommunal | mutig | 10 | 41 | 8 | 4/10 | -214 | 110 | 94 | 129 | – | – | 4 | 3 / 8 / 3 | 37 | 0 | 3 (3) | 0 | 11 s |
| feld | vorsichtig | 10 | 667 | 165 | 10/10 | 1.198 | 1.325 | 269 | 337 | – | – | 10 | 5 / 24 / 5 | 3.6 | 0.8 | 100 (95) | 0 | 135 s |
| feld | normal | 10 | 898 | 163 | 10/10 | 1.190 | 1.542 | 288 | 472 | – | – | 10 | 10 / 30 / 10 | 5 | 0.7 | 100 (54) | 0 | 200 s |
| feld | mutig | 10 | 841 | 119 | 10/10 | 895 | 1.530 | 306 | 486 | – | – | 10 | 13 / 32 / 14 | 6.1 | 0.7 | 62 (40) | 0 | 229 s |
| allround | vorsichtig | 10 | 1.115 | 58 | 7/10 | 438 | 1.134 | 269 | 590 | – | – | 14 | 5 / 31 / 7 | 7.4 | 1.4 | 88 (60) | 0 | 136 s |
| allround | normal | 10 | 1.558 | 35 | 6/10 | 423 | 1.527 | 259 | 1.078 | – | – | 18 | 9 / 45 / 14 | 9.6 | 1.3 | 64 (48) | 0 | 219 s |
| allround | mutig | 6 (10) | 705 | -283 | 2/6 | -1.362 | -1.140 | -1.140 | 1.157 | 2030 | 2032 | 13 | 2 / 11 / 6 | 15.4 | 7.1 | 98 (59) | 0 | 42 s |
| guelle | normal | 50 | 43 | -33 | 22/50 | -317 | -51 | -51 | 131 | – | – | 2 | 2 / 4 / 2 | 8.2 | 2.7 | 98 (85) | 0 | 68 s |
| drusch | normal | 5 (50) | 50 | -80 | 0/5 | -401 | -198 | -198 | 214 | 2030 | 2031 | 1 | 0 / 2 / 2 | 28.5 | 3 | 67 (2) | 0 | 6 s |
| rueben | normal | 10 (50) | 57 | -37 | 1/10 | -425 | -186 | -186 | 196 | 2035 | 2036 | 3 | 0 / 1 / 2 | 15.9 | 0.2 | 85 (55) | 0 | 13 s |
| transport | normal | 10 (50) | 118 | -66 | 2/10 | -540 | -319 | -319 | 330 | 2035 | 2036 | 1 | 0 / 1 / 3 | 17.4 | 0.6 | 83 (20) | 0 | 13 s |
| kommunal | normal | 18 (50) | 5 | -7 | 2/18 | -379 | -169 | -169 | 177 | 2039 | 2044 | 2 | 0 / 1 / 3 | 42 | 0 | 3 (0) | 0 | 12 s |
| feld | normal | 50 | 703 | 93 | 50/50 | 6.849 | 5.503 | 288 | 472 | – | – | 10 | 10 / 31 / 10 | 6.5 | 0.4 | 100 (19) | 0 | 1107 s |
| allround | vorsichtig | 18 (50) | 997 | -65 | 9/18 | -747 | -657 | -657 | 954 | 2038 | 2044 | 16 | 0 / 1 / 9 | 8.9 | 2.2 | 0 (0) | 0 | 334 s |
| allround | normal | 50 | 1.477 | -24 | 34/50 | 3.769 | 3.641 | 259 | 1.078 | – | – | 18 | 10 / 40 / 14 | 10.6 | 1.5 | 71 (8) | 0 | 2047 s |
| allround | mutig | 6 (50) | 705 | -283 | 2/6 | -1.362 | -1.140 | -1.140 | 1.157 | 2030 | 2032 | 13 | 2 / 11 / 6 | 15.4 | 7.1 | 98 (59) | 0 | 44 s |
