# Wirtschaftlichkeit über 20 Jahre (alle Dienste als Ziel)

Bot `tests/sim/economyBotFull.ts`, Test `tests/unit/economy-full.test.ts`, echte Karte, Seed 2027, 2027–2046.
Neu erzeugen: `ECONOMY_FULL_YEARS=20 ECONOMY_FULL_REPORT=<datei> npx vitest run tests/unit/economy-full.test.ts`
(etwa 10 min). Ohne Variablen läuft der Test in CI mit 3 Jahren.

## Ergebnis nach Balance und Fehlerbehebung (6. Nov. 2026)

| | vorher | nachher |
| --- | --- | --- |
| Dienste im Angebot | 11 von 18, Ernteketten erst 2034, nie Häckseln, Roden, Kommunal | alle 18 ab 2036 |
| Umsatz | Spitze rund 800 T€ (2035) | 1,45–2,1 Mio. € ab 2034 |
| Gewinn | 17 von 20 Jahren Verlust | 16 von 20 Jahren Gewinn, Verlustjahre bei großen Investitionen |
| Insolvenz | ab 2035, Eigenkapital 2046 −2,4 Mio. € | nie; 2046: Eigenkapital 3,1 Mio. €, schuldenfrei |

- **Gewinnspanne:** Ab 2039 liegt der Gewinn bei 4–23 % vom Umsatz.
- **Spätjahre geschönt:** Der Bot ersetzt alte Maschinen nicht. Die AfA sinkt deshalb gegen null, der Gewinn wirkt
  höher als bei einem Spieler, der den Fuhrpark erneuert.
- **Umsatzstärkste Sparten ab 2037:**
  - Rübenroden 200–380 T€ im Jahr
  - Lkw-Transport rund 220 T€
  - Feldarbeit 450–620 T€
  - eigener Ackerbau 160–950 T€ auf 165–310 ha
- **Jahr 2 bleibt knapp:** Der Ausbau auf 5 Schlepper bringt einen Verlust. Das soll so sein: Wachstum kostet erst.

## Was geändert wurde

### Balance

- **Preise der Felddienste rund +15 %**, Richtung LWK-Sätze und übliche Lohnunternehmer-Preise:
  - Grubbern 63 €/ha, Stoppel 44, Drillsaat 78, Einzelkorn 64, Pflanzenschutz 25, Pressen 68, Striegeln 39, Hacken 68
  - Gülle 4,60 €/m³
- **Erntepreise rund +10 %:**
  - Drusch 165 €/ha bzw. 215 €/ha mit Abfuhr
  - Häckseln 250 bzw. 470 €/ha
  - Rübenroden 310 €/ha
  - Kartoffelroden 360 bzw. 460 €/ha
- **Pannen seltener:** Grundrate 0,14 % statt 0,2 % je Stunde; schlechter Zustand wirkt schwächer (÷35 statt ÷25).
- **Mehr Erntenachfrage:** Drusch, Häckseln und Roden werden in ihrer Saison öfter angefragt (Gewichte etwa +40–50 %).
- **Ortsübliche Pacht** auf Uelzener Sand 540 statt 620 €/ha bei Ackerzahl 35.

### Fehler im Spiel, gefunden über den Langzeitlauf

- **Abfahrer wartete für immer am alten Feld.** Wechselte die Erntemaschine das Feld, während Kipper oder
  Häckselwagen unterwegs war, wartete der Wagen am alten Feldrand. Drescher bzw. Häcksler stand mit vollem Tank, der
  Auftrag lief ewig weiter, und Fahrer und Maschinen waren blockiert. Im Lauf vorher führte das ab 2039 zu 8.760
  Druschstunden im Jahr und am Ende zur Insolvenz.
  - Jetzt fährt der Wagen nach (`haulWait` in `engine.ts`).
  - Test: `harvest.test.ts`, „Abfahrer bei Feldwechsel“.
- **Eigene Ernte blockierte die Pachtfläche dauerhaft.** Wurde eine eigene Ernte nie begonnen, blieb die Fläche
  belegt: keine neue Kultur, aber weiter Pacht.
  - Jetzt erntet drei Wochen nach dem Fenster ein fremder Lohnunternehmer (Kosten wie Fremdleistung, Ertrag −2 %
    je Tag Verspätung, höchstens −50 %).
  - Test: `farming.test.ts`.
- **Bereits früher behoben:**
  - Gülle-Pendeln am Auftragsende
  - Katalogwerte gingen beim Kauf verloren
  - Winterdienst-Pünktlichkeit
  - Storno nie begonnener Aufträge
  - Insolvenz
  - Rechnungsnummern nach dem Archiv

### Bot

- Rücklage nach großen Käufen: 30 % des Preises.
- Zusätzliche Spalten im Bericht: Durchschnittslohn, Leiharbeiter, Fahrzeugstunden je Aufgabe.
- Lange Aufgaben (über 30 Tage) werden protokolliert. Das sind meist Rübentransporte über die ganze Kampagne.

## Offene Punkte

- In der Bilanz zählen Maschinen zum Marktwert, im Ergebnis mit der AfA.
- Insolvenz beendet das Spiel bisher nicht; Kredite und Käufe sind dann nur gesperrt.
- Der Ruf schwankt stark (3–100), weil der Bot viele Aufträge zu spät fertig macht (rund 200 im Jahr).

Rechenzeit: 593 s

### Jahre (Beträge in T€)

| Jahr | Umsatz | Feld | Ernte | Transport | Kommunal | Ackerbau | Kosten | AfA | Gewinn | Kasse | Eigenkapital | Schulden | Schlepper | Maschinen | fest | Saison | Leih | Ø Lohn €/h | Pacht ha | Kunden | Aufträge | verspätet | storniert | Ruf | Dienste |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2027 | 298 | 296 | 0 | 3 | 0 | 0 | 115 | 103 | 80 | 83 | 321 | 261 | 3 | 14 | 1 | 2 | 0 | 21,7 | 0 | 60 | 236 | 11 | 5 | 91 | 7 |
| 2028 | 444 | 440 | 0 | 4 | 0 | 0 | 301 | 187 | -44 | -17 | 369 | 363 | 5 | 20 | 1 | 4 | 0 | 21,9 | 72 | 94 | 409 | 22 | 14 | 97 | 9 |
| 2029 | 855 | 729 | 0 | 7 | 0 | 118 | 499 | 235 | 121 | 36 | 600 | 496 | 7 | 25 | 1 | 6 | 0 | 20,8 | 72 | 177 | 716 | 24 | 10 | 99 | 9 |
| 2030 | 955 | 815 | 0 | 14 | 0 | 126 | 609 | 210 | 140 | 53 | 649 | 579 | 8 | 29 | 1 | 7 | 0 | 20,6 | 100 | 234 | 901 | 45 | 1 | 100 | 10 |
| 2031 | 1.026 | 842 | 0 | 44 | 0 | 154 | 632 | 193 | 202 | 103 | 908 | 729 | 9 | 32 | 1 | 8 | 0 | 20,7 | 100 | 276 | 1069 | 58 | 1 | 85 | 10 |
| 2032 | 1.091 | 764 | 75 | 141 | 9 | 117 | 763 | 287 | 46 | 231 | 988 | 754 | 9 | 35 | 1 | 9 | 0 | 21,1 | 127 | 310 | 1060 | 86 | 29 | 76 | 12 |
| 2033 | 1.403 | 825 | 56 | 130 | 22 | 352 | 882 | 262 | 263 | 44 | 1.310 | 1.169 | 9 | 41 | 3 | 9 | 0 | 20,8 | 127 | 344 | 1308 | 125 | 9 | 67 | 13 |
| 2034 | 1.513 | 780 | 378 | 139 | 24 | 201 | 1.151 | 465 | -103 | 298 | 1.412 | 1.157 | 9 | 41 | 4 | 9 | 0 | 21,2 | 159 | 413 | 1348 | 185 | 23 | 68 | 16 |
| 2035 | 1.856 | 765 | 325 | 134 | 27 | 596 | 1.281 | 429 | 147 | 615 | 1.822 | 1.014 | 10 | 43 | 4 | 9 | 0 | 21,6 | 175 | 482 | 1475 | 124 | 35 | 87 | 15 |
| 2036 | 1.617 | 728 | 486 | 238 | 32 | 166 | 1.365 | 547 | -294 | 334 | 1.773 | 1.278 | 10 | 48 | 5 | 9 | 0 | 21,8 | 192 | 533 | 1616 | 197 | 22 | 67 | 18 |
| 2037 | 1.672 | 611 | 417 | 232 | 31 | 369 | 1.295 | 360 | 23 | 478 | 1.966 | 1.027 | 10 | 47 | 5 | 9 | 0 | 21,8 | 165 | 549 | 1378 | 232 | 52 | 3 | 18 |
| 2038 | 1.665 | 617 | 474 | 220 | 40 | 360 | 1.384 | 335 | -52 | 552 | 2.143 | 799 | 10 | 46 | 5 | 9 | 0 | 22 | 219 | 578 | 1487 | 181 | 52 | 74 | 18 |
| 2039 | 1.692 | 600 | 416 | 213 | 41 | 391 | 1.426 | 162 | 105 | 600 | 2.241 | 575 | 10 | 47 | 5 | 9 | 0 | 22,2 | 228 | 611 | 1499 | 164 | 46 | 59 | 18 |
| 2040 | 1.788 | 511 | 456 | 212 | 29 | 542 | 1.426 | 138 | 224 | 753 | 2.413 | 383 | 10 | 47 | 5 | 9 | 0 | 22,4 | 235 | 621 | 1344 | 207 | 35 | 79 | 16 |
| 2041 | 1.640 | 529 | 505 | 235 | 25 | 362 | 1.353 | 138 | 149 | 798 | 2.523 | 204 | 10 | 47 | 5 | 9 | 0 | 22,4 | 260 | 649 | 1450 | 184 | 49 | 84 | 18 |
| 2042 | 1.681 | 509 | 423 | 222 | 46 | 519 | 1.513 | 38 | 144 | 827 | 2.564 | 101 | 10 | 46 | 5 | 9 | 0 | 22,5 | 275 | 669 | 1386 | 216 | 42 | 64 | 17 |
| 2043 | 1.866 | 539 | 415 | 230 | 29 | 652 | 1.551 | 30 | 284 | 1.033 | 2.737 | 20 | 10 | 46 | 5 | 9 | 0 | 22,8 | 289 | 699 | 1437 | 162 | 32 | 61 | 18 |
| 2044 | 1.602 | 461 | 466 | 220 | 40 | 402 | 1.382 | 22 | 201 | 1.145 | 2.751 | 0 | 10 | 45 | 5 | 9 | 0 | 22,9 | 307 | 706 | 1424 | 236 | 28 | 71 | 18 |
| 2045 | 1.454 | 472 | 285 | 208 | 42 | 423 | 1.373 | 16 | 65 | 1.180 | 2.656 | 0 | 10 | 45 | 5 | 9 | 0 | 22,9 | 292 | 706 | 1329 | 224 | 37 | 53 | 18 |
| 2046 | 2.074 | 457 | 380 | 238 | 47 | 954 | 1.587 | 10 | 484 | 1.653 | 3.062 | 0 | 10 | 45 | 5 | 9 | 0 | 23 | 282 | 704 | 1485 | 160 | 32 | 91 | 18 |

### Ausgaben je Kategorie (T€, Zahlungen inkl. Investitionen)

| Jahr | Ackerbau | Bau | Diesel | Gebäude | Maschinenkauf | Maut | Pacht | Personal | Sonstiges | Steuern | Tilgung | Versicherung | Werkstatt | Zinsen |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2027 | 0 | 0 | 51 | 0 | 460 | 0 | 0 | 31 | 0 | 0 | 19 | 4 | 22 | 8 |
| 2028 | 15 | 0 | 81 | 0 | 307 | 0 | 51 | 88 | 0 | 21 | 35 | 8 | 45 | 13 |
| 2029 | 50 | 45 | 142 | 0 | 406 | 0 | 51 | 171 | 0 | 0 | 51 | 11 | 56 | 18 |
| 2030 | 62 | 150 | 162 | 4 | 228 | 0 | 73 | 202 | 0 | 38 | 76 | 13 | 68 | 25 |
| 2031 | 65 | 0 | 174 | 2 | 449 | 1 | 73 | 205 | 0 | 46 | 91 | 14 | 72 | 26 |
| 2032 | 100 | 85 | 193 | 6 | 78 | 8 | 89 | 246 | 0 | 72 | 125 | 16 | 77 | 34 |
| 2033 | 110 | 0 | 221 | 4 | 1.118 | 7 | 89 | 323 | 0 | 8 | 145 | 16 | 85 | 34 |
| 2034 | 71 | 0 | 275 | 4 | 0 | 8 | 105 | 514 | 0 | 97 | 212 | 19 | 107 | 56 |
| 2035 | 214 | 0 | 267 | 4 | 122 | 7 | 123 | 499 | 0 | 0 | 213 | 19 | 97 | 50 |
| 2036 | 77 | 0 | 323 | 4 | 752 | 17 | 138 | 625 | 9 | 49 | 246 | 22 | 104 | 60 |
| 2037 | 109 | 0 | 286 | 4 | 0 | 15 | 121 | 588 | 2 | 0 | 251 | 21 | 96 | 54 |
| 2038 | 142 | 0 | 291 | 4 | 0 | 14 | 154 | 595 | 0 | 2 | 229 | 21 | 119 | 43 |
| 2039 | 125 | 0 | 292 | 4 | 14 | 15 | 161 | 625 | 6 | 0 | 224 | 21 | 145 | 33 |
| 2040 | 195 | 0 | 278 | 4 | 0 | 16 | 162 | 611 | 2 | 31 | 192 | 20 | 112 | 23 |
| 2041 | 136 | 0 | 292 | 4 | 0 | 15 | 192 | 575 | 0 | 81 | 180 | 21 | 102 | 14 |
| 2042 | 203 | 0 | 283 | 4 | 14 | 14 | 221 | 621 | 0 | 50 | 103 | 21 | 140 | 7 |
| 2043 | 227 | 0 | 289 | 4 | 0 | 17 | 215 | 625 | 0 | 47 | 81 | 20 | 148 | 3 |
| 2044 | 144 | 0 | 278 | 4 | 0 | 16 | 222 | 584 | 4 | 107 | 20 | 20 | 109 | 0 |
| 2045 | 207 | 0 | 249 | 4 | 0 | 15 | 221 | 581 | 0 | 72 | 0 | 20 | 81 | 0 |
| 2046 | 307 | 0 | 279 | 4 | 9 | 14 | 226 | 616 | 0 | 14 | 0 | 20 | 118 | 0 |

### Umsatz je Dienst (T€)

| Jahr | drusch | einzelkorn | grubbern | guelle | hacken | haeckseln | hecke | kartoffelroden | maehen | pflanzenschutz | pressen | roden | saat | stoppel | striegeln | transport | wegebau | winterdienst |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2027 | 0 | 23 | 102 | 87 | 0 | 0 | 0 | 0 | 0 | 56 | 0 | 0 | 0 | 26 | 1 | 3 | 0 | 0 |
| 2028 | 0 | 27 | 116 | 113 | 37 | 0 | 0 | 0 | 0 | 57 | 0 | 0 | 22 | 53 | 14 | 4 | 0 | 0 |
| 2029 | 0 | 47 | 154 | 144 | 76 | 0 | 0 | 0 | 0 | 80 | 0 | 0 | 125 | 85 | 19 | 7 | 0 | 0 |
| 2030 | 0 | 66 | 118 | 161 | 61 | 0 | 0 | 0 | 0 | 121 | 37 | 0 | 141 | 81 | 29 | 14 | 0 | 0 |
| 2031 | 0 | 80 | 108 | 177 | 59 | 0 | 0 | 0 | 0 | 110 | 42 | 0 | 150 | 74 | 42 | 44 | 0 | 0 |
| 2032 | 75 | 79 | 73 | 135 | 78 | 0 | 0 | 0 | 0 | 98 | 25 | 0 | 146 | 65 | 66 | 141 | 0 | 2 |
| 2033 | 56 | 85 | 189 | 108 | 41 | 0 | 0 | 0 | 9 | 126 | 46 | 0 | 142 | 63 | 25 | 130 | 0 | 1 |
| 2034 | 71 | 79 | 171 | 77 | 22 | 90 | 0 | 18 | 8 | 123 | 35 | 198 | 178 | 72 | 23 | 139 | 0 | 3 |
| 2035 | 72 | 75 | 162 | 84 | 45 | 16 | 0 | 0 | 12 | 120 | 23 | 237 | 143 | 73 | 40 | 134 | 0 | 3 |
| 2036 | 70 | 89 | 173 | 60 | 28 | 20 | 4 | 27 | 5 | 110 | 26 | 370 | 134 | 70 | 38 | 238 | 6 | 5 |
| 2037 | 76 | 75 | 133 | 35 | 15 | 91 | 2 | 37 | 3 | 106 | 33 | 213 | 120 | 74 | 19 | 232 | 9 | 5 |
| 2038 | 62 | 58 | 75 | 116 | 57 | 42 | 8 | 2 | 4 | 89 | 19 | 368 | 111 | 58 | 33 | 220 | 12 | 7 |
| 2039 | 41 | 69 | 87 | 44 | 33 | 2 | 7 | 21 | 11 | 109 | 28 | 352 | 148 | 65 | 17 | 213 | 9 | 5 |
| 2040 | 69 | 57 | 63 | 58 | 44 | 7 | 0 | 0 | 5 | 73 | 24 | 380 | 121 | 65 | 7 | 212 | 8 | 5 |
| 2041 | 60 | 54 | 86 | 39 | 34 | 77 | 8 | 15 | 1 | 80 | 21 | 353 | 124 | 64 | 27 | 235 | 2 | 2 |
| 2042 | 35 | 51 | 66 | 41 | 68 | 11 | 11 | 0 | 10 | 58 | 33 | 377 | 119 | 57 | 15 | 222 | 9 | 4 |
| 2043 | 37 | 54 | 73 | 81 | 56 | 62 | 4 | 4 | 4 | 72 | 25 | 313 | 85 | 61 | 33 | 230 | 7 | 2 |
| 2044 | 44 | 41 | 88 | 43 | 32 | 22 | 5 | 40 | 4 | 78 | 18 | 360 | 89 | 51 | 20 | 220 | 13 | 5 |
| 2045 | 50 | 44 | 88 | 44 | 26 | 15 | 4 | 20 | 2 | 79 | 16 | 200 | 115 | 40 | 19 | 208 | 20 | 4 |
| 2046 | 65 | 49 | 62 | 58 | 34 | 8 | 9 | 2 | 11 | 72 | 23 | 304 | 87 | 48 | 24 | 238 | 11 | 4 |

### Fahrzeugstunden je Aufgabe (Stichprobe alle 10 min, inkl. Feierabend-Wartezeit)

| Jahr | haul | haul:drusch | haul:haeckseln | job | job:drusch | job:einzelkorn | job:grubbern | job:guelle | job:hacken | job:haeckseln | job:kartoffelroden | job:pflanzenschutz | job:pressen | job:roden | job:saat | job:stoppel | job:striegeln | silo:haeckseln | tour:hecke | tour:maehen | tour:wegebau | tour:winterdienst | truck | truck:transport | visit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2027 | 0 | 0 | 0 | 1.402 | 0 | 187 | 2.353 | 1.153 | 0 | 0 | 0 | 315 | 0 | 0 | 0 | 732 | 0 | 0 | 0 | 0 | 0 | 0 | 9 | 59 | 32 |
| 2028 | 0 | 0 | 0 | 2.870 | 0 | 240 | 1.873 | 3.503 | 564 | 0 | 0 | 646 | 0 | 0 | 335 | 1.231 | 50 | 0 | 0 | 0 | 0 | 0 | 0 | 206 | 14 |
| 2029 | 0 | 0 | 0 | 3.741 | 0 | 248 | 3.568 | 2.989 | 1.289 | 0 | 0 | 763 | 0 | 0 | 2.527 | 2.170 | 171 | 0 | 0 | 0 | 0 | 0 | 64 | 341 | 0 |
| 2030 | 0 | 0 | 0 | 4.594 | 0 | 457 | 3.019 | 4.021 | 1.200 | 0 | 0 | 533 | 750 | 0 | 2.427 | 2.007 | 148 | 0 | 0 | 0 | 0 | 0 | 44 | 989 | 0 |
| 2031 | 0 | 0 | 0 | 5.036 | 0 | 381 | 2.878 | 3.594 | 1.191 | 0 | 0 | 796 | 634 | 0 | 2.175 | 1.761 | 222 | 0 | 0 | 0 | 0 | 0 | 71 | 2.215 | 0 |
| 2032 | 3 | 286 | 0 | 3.923 | 691 | 626 | 2.131 | 3.513 | 1.707 | 0 | 0 | 765 | 387 | 0 | 2.884 | 1.741 | 393 | 0 | 0 | 0 | 0 | 41 | 331 | 4.647 | 0 |
| 2033 | 0 | 76 | 0 | 2.013 | 922 | 1.253 | 5.302 | 2.631 | 903 | 0 | 0 | 2.193 | 933 | 0 | 3.119 | 1.325 | 262 | 0 | 0 | 48 | 0 | 33 | 411 | 4.320 | 0 |
| 2034 | 0 | 11 | 743 | 1.877 | 1.041 | 1.078 | 4.831 | 2.039 | 465 | 789 | 210 | 2.117 | 581 | 1.562 | 3.837 | 1.729 | 202 | 746 | 0 | 47 | 0 | 73 | 537 | 4.294 | 0 |
| 2035 | 9 | 55 | 0 | 1.892 | 749 | 1.036 | 4.891 | 1.865 | 876 | 47 | 1.092 | 2.295 | 519 | 1.636 | 3.794 | 2.562 | 527 | 0 | 0 | 71 | 0 | 73 | 302 | 4.524 | 0 |
| 2036 | 0 | 183 | 524 | 1.425 | 685 | 1.180 | 5.023 | 2.017 | 610 | 547 | 350 | 2.326 | 622 | 3.992 | 3.252 | 2.541 | 505 | 356 | 16 | 29 | 11 | 102 | 699 | 8.209 | 0 |
| 2037 | 0 | 15 | 454 | 1.234 | 857 | 1.278 | 4.458 | 1.325 | 463 | 491 | 412 | 2.463 | 684 | 3.720 | 3.657 | 2.341 | 187 | 420 | 11 | 18 | 17 | 154 | 827 | 7.237 | 0 |
| 2038 | 0 | 121 | 427 | 1.851 | 788 | 639 | 2.960 | 3.022 | 1.377 | 526 | 231 | 1.941 | 294 | 3.245 | 2.583 | 2.151 | 295 | 428 | 38 | 25 | 21 | 173 | 571 | 7.691 | 0 |
| 2039 | 4 | 190 | 970 | 1.625 | 901 | 1.088 | 2.624 | 1.562 | 703 | 980 | 259 | 2.509 | 500 | 3.449 | 3.642 | 1.902 | 166 | 894 | 38 | 63 | 17 | 115 | 807 | 8.184 | 0 |
| 2040 | 0 | 152 | 884 | 1.152 | 792 | 952 | 2.509 | 1.780 | 1.245 | 883 | 333 | 2.069 | 540 | 3.096 | 3.065 | 2.272 | 158 | 852 | 0 | 25 | 18 | 120 | 570 | 7.457 | 0 |
| 2041 | 14 | 132 | 135 | 1.168 | 652 | 732 | 2.872 | 1.044 | 1.204 | 520 | 310 | 2.011 | 420 | 3.014 | 2.716 | 2.258 | 268 | 137 | 41 | 8 | 4 | 60 | 723 | 6.595 | 0 |
| 2042 | 0 | 137 | 942 | 1.553 | 777 | 879 | 2.648 | 1.569 | 2.077 | 999 | 395 | 1.368 | 586 | 3.047 | 3.175 | 1.807 | 148 | 941 | 54 | 54 | 17 | 102 | 563 | 7.595 | 0 |
| 2043 | 0 | 57 | 389 | 2.113 | 880 | 519 | 2.384 | 2.050 | 1.191 | 419 | 495 | 2.147 | 559 | 3.361 | 2.457 | 1.781 | 455 | 392 | 17 | 22 | 16 | 62 | 716 | 7.862 | 0 |
| 2044 | 0 | 91 | 481 | 872 | 926 | 683 | 2.610 | 1.588 | 786 | 508 | 442 | 2.316 | 320 | 3.144 | 2.501 | 1.939 | 333 | 335 | 27 | 25 | 27 | 102 | 818 | 7.492 | 0 |
| 2045 | 0 | 13 | 481 | 890 | 816 | 1.253 | 2.713 | 1.102 | 660 | 478 | 299 | 2.287 | 354 | 2.191 | 2.481 | 1.600 | 285 | 522 | 24 | 14 | 38 | 87 | 607 | 7.310 | 0 |
| 2046 | 0 | 139 | 1.117 | 1.633 | 842 | 676 | 2.200 | 1.483 | 943 | 1.131 | 499 | 2.040 | 409 | 3.057 | 2.731 | 1.841 | 363 | 1.117 | 49 | 62 | 21 | 82 | 763 | 7.039 | 0 |

### Dienste je Jahr

- 2027: einzelkorn, grubbern, guelle, pflanzenschutz, stoppel, striegeln, transport
- 2028: einzelkorn, grubbern, guelle, hacken, pflanzenschutz, saat, stoppel, striegeln, transport
- 2029: einzelkorn, grubbern, guelle, hacken, pflanzenschutz, saat, stoppel, striegeln, transport
- 2030: einzelkorn, grubbern, guelle, hacken, pflanzenschutz, pressen, saat, stoppel, striegeln, transport
- 2031: einzelkorn, grubbern, guelle, hacken, pflanzenschutz, pressen, saat, stoppel, striegeln, transport
- 2032: drusch, einzelkorn, grubbern, guelle, hacken, pflanzenschutz, pressen, saat, stoppel, striegeln, transport, winterdienst
- 2033: drusch, einzelkorn, grubbern, guelle, hacken, maehen, pflanzenschutz, pressen, saat, stoppel, striegeln, transport, winterdienst
- 2034: drusch, einzelkorn, grubbern, guelle, hacken, haeckseln, kartoffelroden, maehen, pflanzenschutz, pressen, roden, saat, stoppel, striegeln, transport, winterdienst
- 2035: drusch, einzelkorn, grubbern, guelle, hacken, haeckseln, maehen, pflanzenschutz, pressen, roden, saat, stoppel, striegeln, transport, winterdienst
- 2036: drusch, einzelkorn, grubbern, guelle, hacken, haeckseln, hecke, kartoffelroden, maehen, pflanzenschutz, pressen, roden, saat, stoppel, striegeln, transport, wegebau, winterdienst
- 2037: drusch, einzelkorn, grubbern, guelle, hacken, haeckseln, hecke, kartoffelroden, maehen, pflanzenschutz, pressen, roden, saat, stoppel, striegeln, transport, wegebau, winterdienst
- 2038: drusch, einzelkorn, grubbern, guelle, hacken, haeckseln, hecke, kartoffelroden, maehen, pflanzenschutz, pressen, roden, saat, stoppel, striegeln, transport, wegebau, winterdienst
- 2039: drusch, einzelkorn, grubbern, guelle, hacken, haeckseln, hecke, kartoffelroden, maehen, pflanzenschutz, pressen, roden, saat, stoppel, striegeln, transport, wegebau, winterdienst
- 2040: drusch, einzelkorn, grubbern, guelle, hacken, haeckseln, maehen, pflanzenschutz, pressen, roden, saat, stoppel, striegeln, transport, wegebau, winterdienst
- 2041: drusch, einzelkorn, grubbern, guelle, hacken, haeckseln, hecke, kartoffelroden, maehen, pflanzenschutz, pressen, roden, saat, stoppel, striegeln, transport, wegebau, winterdienst
- 2042: drusch, einzelkorn, grubbern, guelle, hacken, haeckseln, hecke, maehen, pflanzenschutz, pressen, roden, saat, stoppel, striegeln, transport, wegebau, winterdienst
- 2043: drusch, einzelkorn, grubbern, guelle, hacken, haeckseln, hecke, kartoffelroden, maehen, pflanzenschutz, pressen, roden, saat, stoppel, striegeln, transport, wegebau, winterdienst
- 2044: drusch, einzelkorn, grubbern, guelle, hacken, haeckseln, hecke, kartoffelroden, maehen, pflanzenschutz, pressen, roden, saat, stoppel, striegeln, transport, wegebau, winterdienst
- 2045: drusch, einzelkorn, grubbern, guelle, hacken, haeckseln, hecke, kartoffelroden, maehen, pflanzenschutz, pressen, roden, saat, stoppel, striegeln, transport, wegebau, winterdienst
- 2046: drusch, einzelkorn, grubbern, guelle, hacken, haeckseln, hecke, kartoffelroden, maehen, pflanzenschutz, pressen, roden, saat, stoppel, striegeln, transport, wegebau, winterdienst

### Investitionen

- 3/2027: grubber gebraucht Köckerling Trio 300 7.900 € (Anfrage grubbern)
- 3/2027: guellefass gebraucht Joskin Volumetra 16500 D + Schleppschlauch 15 m 62.600 € (Anfrage guelle)
- 3/2027: schlepper gebraucht Fendt 516 Vario 69.500 € (Schlepper ausgelastet)
- 3/2027: einzelkorn gebraucht Kverneland Optima V 8-reihig (6 m) 31.700 € (Anfrage einzelkorn)
- 4/2027: guellefass gebraucht Joskin Alpina 2 7100 S + Schleppschuh 7,5 m 32.700 € (Dienst ausgelastet)
- 5/2027: striegel gebraucht Einböck Aerostar 9 m 7.100 € (Anfrage striegeln)
- 5/2027: spritze gebraucht Kverneland iXtrack T4 (30 m) 71.900 € (Anfrage pflanzenschutz)
- 6/2027: hacke neu gekauft Einböck Chopstar 6-reihig mit Kamera 45.000 € (Anfrage hacken)
- 6/2027: spritze gebraucht Amazone UX 5201 Super (24 m) 58.800 € (Dienst ausgelastet)
- 7/2027: kurzscheibenegge gebraucht Horsch Joker 3 CT 11.900 € (Anfrage stoppel)
- 9/2027: grubber gebraucht Horsch Terrano 4 FX 12.500 € (Dienst ausgelastet)
- 10/2027: schlepper gebraucht Deutz-Fahr 6165 TTV 51.100 € (Schlepper ausgelastet)
- 4/2028: schlepper gebraucht Claas Arion 550 64.200 € (Schlepper ausgelastet)
- 6/2028: hacke neu gekauft Einböck Chopstar 6-reihig mit Kamera 45.000 € (Dienst ausgelastet)
- 8/2028: kurzscheibenegge neu gekauft Horsch Joker 3 CT 21.000 € (Dienst ausgelastet)
- 8/2028: drille neu gekauft Amazone KE 3002 + Centaya 3000 (3 m) 52.000 € (Anfrage saat)
- 8/2028: kurzscheibenegge gebraucht Horsch Joker 3 CT 16.500 € (Dienst ausgelastet)
- 9/2028: schlepper gebraucht Deutz-Fahr 6165 TTV 117.600 € (Schlepper ausgelastet)
- 7/2029: presse neu gekauft Krone BiG Pack 1290 HDP II 160.000 € (Anfrage pressen)
- 8/2029: drille neu gekauft Amazone KE 3002 + Centaya 3000 (3 m) 52.000 € (Dienst ausgelastet)
- 8/2029: drille gebraucht Amazone KE 3002 + Centaya 3000 (3 m) 34.700 € (Dienst ausgelastet)
- 8/2029: schlepper gebraucht Deutz-Fahr 6165 TTV 86.900 € (Schlepper ausgelastet)
- 9/2029: schlepper gebraucht Massey Ferguson 6S.145 89.100 € (Schlepper ausgelastet)
- 4/2030: einzelkorn gebraucht Kverneland Optima V 8-reihig (6 m) 30.400 € (Dienst ausgelastet)
- 5/2030: grubber gebraucht Amazone Cenius 6003-2TX 38.100 € (Dienst ausgelastet)
- 5/2030: striegel neu gekauft Einböck Aerostar 9 m 16.000 € (Dienst ausgelastet)
- 8/2030: presse gebraucht Krone BiG Pack 1290 HDP II 77.600 € (Dienst ausgelastet)
- 9/2030: schlepper gebraucht Valtra N155e 67.900 € (Schlepper ausgelastet)
- 8/2031: schlepper neu gekauft Massey Ferguson 6S.145 138.000 € (Schlepper ausgelastet)
- 11/2031: lkw gebraucht MAN TGX 18.510 + Kippsattel 117.200 € (Ausbauplan)
- 12/2031: maehdrescher gebraucht Deutz-Fahr C7206 TS + 6,3 m 210.400 € (Ausbauplan)
- 1/2032: kipper gebraucht Fliegl TDK 302 Tridem-Kipper (22 t) 36.200 € (Ausbauplan)
- 3/2032: streuer gebraucht Rauch AXEO 18.1 + Frontschild 3 m 10.400 € (Ausbauplan)
- 9/2032: grubber neu gekauft Köckerling Trio 300 19.000 € (Dienst ausgelastet)
- 9/2032: grubber gebraucht Horsch Terrano 4 FX 14.000 € (Dienst ausgelastet)
- 11/2032: auslegemaeher neu gekauft Mulag MKM 700 Auslegemäher 48.000 € (Ausbauplan)
- 11/2033: feldhaecksler gebraucht Claas Jaguar 940 + Orbis 600 221.300 € (Ausbauplan)
- 11/2033: haeckselwagen gebraucht Fliegl Gigant ASW 391 (45 m³) 73.100 € (Ausbauplan)
- 12/2033: haeckselwagen gebraucht Fliegl Gigant ASW 391 (45 m³) 57.700 € (Ausbauplan)
- 12/2033: ruebenroder gebraucht Grimme Rexor 6300 Platinum 497.700 € (Ausbauplan)
- 12/2033: radlader gebraucht Liebherr L 526 75.200 € (Ausbauplan)
- 12/2033: kartoffelroder gebraucht Grimme EVO 290 (3-reihig, Bunker 8 t) 149.500 € (Ausbauplan)
- 11/2034: ueberladewagen neu gekauft Fliegl Überladewagen ULW 2000 (16 t) 62.000 € (Ausbauplan)
- 9/2035: schlepper gebraucht Massey Ferguson 6S.145 64.500 € (Schlepper ausgelastet)
- 1/2036: astschere neu gekauft Dücker Astschere am Ausleger 38.000 € (Ausbauplan)
- 1/2036: wegehobel gebraucht Dücker Wegepflegegerät 3 m 17.900 € (Ausbauplan)
- 1/2036: lkw gebraucht Mercedes-Benz Actros 1848 + Kippsattel 86.000 € (Ausbauplan)
- 1/2036: ruebenroder gebraucht Grimme Rexor 6300 Platinum 600.000 € (Ausbauplan)
- 5/2036: striegel gebraucht Einböck Aerostar 9 m 14.300 € (Dienst ausgelastet)
- 3/2039: grubber gebraucht Köckerling Trio 300 13.600 € (Dienst ausgelastet)
- 10/2042: grubber gebraucht Lemken Karat 10/400 13.500 € (Dienst ausgelastet)
- 9/2046: grubber gebraucht Köckerling Trio 300 9.100 € (Dienst ausgelastet)

### Protokoll (Auszug)

- 3/2030: grubber verschlissen in Zahlung gegeben (in Zahlung gegeben für 4.000 €)
- 5/2032: grubber verschlissen in Zahlung gegeben (in Zahlung gegeben für 5.600 €)
- 5/2033: striegel verschlissen in Zahlung gegeben (in Zahlung gegeben für 3.800 €)
- 11/2033: fest eingestellt (wird für haecksler geschult): Jan Voß
- 11/2033: Jan Voß auf Lehrgang (haecksler)
- 11/2033: fest eingestellt für haecksler: Wiebke Beckmann
- 12/2033: Jan Voß auf Lehrgang (haecksler)
- 12/2033: Jan Voß auf Lehrgang (kartoffel)
- 1/2034: Wiebke Beckmann auf Lehrgang (kartoffel)
- 1/2034: fest eingestellt (wird für kartoffel geschult): Bernd Wilkens
- 1/2034: Bernd Wilkens auf Lehrgang (kartoffel)
- 1/2036: fest eingestellt für roder: Niklas Wilkens
- 2/2036: lange Aufgabe (über 30 Tage): Fahrzeug 9 truck Auftrag 61273 (transport ) seit 5.1.2036
- 10/2036: lange Aufgabe (über 30 Tage): Fahrzeug 9 truck Auftrag 69526 (transport ) seit 23.9.2036
- 12/2036: lange Aufgabe (über 30 Tage): Fahrzeug 9 truck Auftrag 71342 (transport ) seit 20.11.2036
- 5/2037: grubber verschlissen in Zahlung gegeben (in Zahlung gegeben für 6.100 €)
- 11/2037: lange Aufgabe (über 30 Tage): Fahrzeug 17 job Auftrag 81943 (roden ) seit 31.10.2037
- 11/2038: grubber verschlissen in Zahlung gegeben (in Zahlung gegeben für 7.700 €)
- 11/2038: lange Aufgabe (über 30 Tage): Fahrzeug 9 truck Auftrag 90978 (transport ) seit 15.10.2038
- 12/2038: lange Aufgabe (über 30 Tage): Fahrzeug 16 truck Auftrag 92068 (transport ) seit 21.11.2038
- 2/2039: lange Aufgabe (über 30 Tage): Fahrzeug 9 truck Auftrag 93500 (transport ) seit 18.1.2039
- 11/2039: lange Aufgabe (über 30 Tage): Fahrzeug 16 truck Auftrag 102067 (transport ) seit 12.10.2039
- 1/2040: lange Aufgabe (über 30 Tage): Fahrzeug 9 truck Auftrag 103549 (transport ) seit 2.12.2039
- 2/2040: lange Aufgabe (über 30 Tage): Fahrzeug 16 truck Auftrag 104506 (transport ) seit 18.1.2040
- 11/2040: lange Aufgabe (über 30 Tage): Fahrzeug 9 truck Auftrag 112288 (transport ) seit 2.10.2040
- 1/2041: lange Aufgabe (über 30 Tage): Fahrzeug 9 truck Auftrag 114091 (transport ) seit 3.12.2040
- 12/2041: lange Aufgabe (über 30 Tage): Fahrzeug 9 truck Auftrag 124260 (transport ) seit 7.11.2041
- 1/2042: lange Aufgabe (über 30 Tage): Fahrzeug 16 truck Auftrag 125355 (transport ) seit 27.12.2041
- 10/2042: grubber verschlissen in Zahlung gegeben (in Zahlung gegeben für 6.600 €)
- 10/2042: drille verschlissen in Zahlung gegeben (in Zahlung gegeben für 8.500 €)
- 12/2042: lange Aufgabe (über 30 Tage): Fahrzeug 9 truck Auftrag 134474 (transport ) seit 4.11.2042
- 2/2043: lange Aufgabe (über 30 Tage): Fahrzeug 9 truck Auftrag 136087 (transport ) seit 5.1.2043
- 11/2043: lange Aufgabe (über 30 Tage): Fahrzeug 9 truck Auftrag 145130 (transport ) seit 15.10.2043
- 11/2043: lange Aufgabe (über 30 Tage): Fahrzeug 16 truck Auftrag 145504 (transport ) seit 22.10.2043
- 1/2044: lange Aufgabe (über 30 Tage): Fahrzeug 16 truck Auftrag 147217 (transport ) seit 30.12.2043
- 9/2044: kurzscheibenegge verschlissen in Zahlung gegeben (in Zahlung gegeben für 2.400 €)
- 12/2044: lange Aufgabe (über 30 Tage): Fahrzeug 9 truck Auftrag 156942 (transport ) seit 9.11.2044
- 1/2045: lange Aufgabe (über 30 Tage): Fahrzeug 16 truck Auftrag 157442 (transport ) seit 6.12.2044
- 12/2045: lange Aufgabe (über 30 Tage): Fahrzeug 16 truck Auftrag 168472 (transport ) seit 29.11.2045
- 5/2046: grubber verschlissen in Zahlung gegeben (in Zahlung gegeben für 6.600 €)
- 11/2046: lange Aufgabe (über 30 Tage): Fahrzeug 9 truck Auftrag 177600 (transport ) seit 2.10.2046
- 2/2047: lange Aufgabe (über 30 Tage): Fahrzeug 9 truck Auftrag 180455 (transport ) seit 16.1.2047
