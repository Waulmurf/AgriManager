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
