# Wirtschaftlichkeit über 20 Jahre (alle Dienste als Ziel)

Bot `tests/sim/economyBotFull.ts`, Test `tests/unit/economy-full.test.ts`, echte Karte, Seed 2027, 2027–2046.
Neu erzeugen: `ECONOMY_FULL_YEARS=20 ECONOMY_FULL_REPORT=<datei> npx vitest run tests/unit/economy-full.test.ts`
(ca. 4 min). Ohne Variablen läuft der Test in CI mit 3 Jahren.

## Ergebnis in Kürze

- **Das Ziel „alle Dienste“ wird nicht erreicht.** Der Bot investiert nur bei gesunder Kasse und Gewinn. Das ist
  selten der Fall. Darum kommen Lkw (11/2032) und Mähdrescher (2/2034) spät, Häcksler, Roder, Winterdienst und
  Kommunal nie. Mit Leasing ohne Bremse (früherer Lauf) gab es zwar alle Ernteketten, aber 424–455 T€ Leasing im Jahr
  bei schlechter Auslastung.
- **Umsatz wächst** von 286 T€ (2027) auf rund 800 T€ (2035). Die Feldarbeit sättigt bei 550–600 T€ mit 7 Schleppern.
- **Gewinn meist negativ.** Ausnahmen sind +37 T€ (2027), +24 T€ (2031) und +33 T€ (2033). Sonst liegt das Ergebnis
  zwischen −40 und −130 T€.
- **Ab 2035 insolvent** (Konto mehr als 100 T€ über dem Rahmen für 90 Tage). Danach folgt eine Abwärtsspirale:
  Kontokorrentzinsen bis 281 T€ im Jahr, Eigenkapital 2046 bei −2,4 Mio. €.

## Ursachen

1. **Lohnarbeit auf dem Feld deckt kaum die Vollkosten.** Beispiel 2031:
   - Feldumsatz 602 T€
   - dagegen Personal 164 T€, Diesel 132 T€, Werkstatt 93 T€, AfA 176 T€, Versicherung 12 T€, Zinsen 21 T€
2. **Deckungsbeitrag je ha** (Umsatz minus Diesel, Lohn und Verschleiß):
   - Gülle ~70 €, Einzelkorn ~39 €, Pressen ~35 €, Saat ~33 €, Grubbern ~27 €, Stoppel ~17 €, Pflanzenschutz ~14 €
   - Das reicht nicht für Abschreibung und Fixkosten.
3. **Werkstatt und Verschleiß sind hoch:** 90–125 T€ im Jahr bei 25 Maschinen, viele davon gebraucht gekauft.
4. **Eigener Ackerbau verliert Geld.** Auf den Sandböden übersteigen Pacht und Betriebsmittel den Ernteerlös.
5. **Erntemaschinen sind schlecht ausgelastet.** Der Drescher bringt 70–84 T€ im Jahr, das sind etwa 250–550 ha.
   Realistisch wären 600–1000 ha. Dazu kommt die Leasingrate von 89 T€ im Jahr.
6. **Saisonalität:** Feste Löhne und Schlepper laufen im Winter weiter. Ohne Winterdienst gibt es keine Arbeit.

## Gefundene und behobene Fehler im Spiel

- Gülle-Auftrag pendelte am Ende leer zwischen Lager und Feld (Rundung der Fläche).
- Neue und gebrauchte Maschinen verloren Nutzlast, Tankvolumen und Gewicht aus dem Katalog.
- Winterdienst galt als verspätet und kostete je Tour Ruf. Maßgeblich ist jetzt der Beginn.
- Nie begonnene Aufträge blieben ewig offen. Jetzt storniert der Kunde 7 Tage nach Frist.
- Keine Insolvenz: Die Kasse konnte beliebig ins Minus laufen. Jetzt gibt es Warnungen nach 30 und 60 Tagen und die
  Insolvenz nach 90 Tagen; Kredite und Käufe sind dann gesperrt.
- Rechnungsnummern hätten sich nach dem Archivieren wiederholt (jetzt `invoiceSeq`).
- Jahresarchiv am 2.1. hält den Spielstand klein: Aufträge und Rechnungen älter als 1 Jahr, Anfragen älter als
  60 Tage, Buchungen älter als 2 Jahre.

## Stellschrauben (Balance, noch nicht umgesetzt)

- Preise der Felddienste um 15–20 % anheben, Richtung LWK-Sätze in `docs/maschinen.md`.
- Werkstatt- und Verschleißkosten senken (`repairPerHour`, `wear`), vor allem bei Gebrauchten.
- Mehr Erntenachfrage je Maschine, damit 600–1000 ha je Drescher bzw. Roder möglich sind.
- Pachtpreise bzw. Erträge so, dass Ackerbau auf mittleren Böden eine kleine Marge bringt.
- Winterarbeit (Winterdienst, Kommunal, Holz) früher erreichbar machen.
- Bilanz zum Buchwert statt Marktwert.
- Insolvenz als Spielende oder mit Sanierungsphase.

Rechenzeit: 246 s

### Jahre (Beträge in T€)

| Jahr | Umsatz | Feld | Ernte | Transport | Kommunal | Ackerbau | Kosten | AfA | Gewinn | Kasse | Eigenkapital | Schulden | Schlepper | Maschinen | fest | Saison | Pacht ha | Kunden | Aufträge | verspätet | storniert | Ruf | Dienste |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2027 | 286 | 281 | 0 | 5 | 0 | 0 | 147 | 102 | 37 | 43 | 287 | 174 | 3 | 13 | 1 | 2 | 0 | 71 | 255 | 7 | 2 | 94 | 8 |
| 2028 | 341 | 328 | 0 | 13 | 0 | 0 | 289 | 165 | -113 | 82 | 289 | 258 | 3 | 15 | 1 | 3 | 62 | 100 | 366 | 27 | 11 | 95 | 8 |
| 2029 | 540 | 424 | 0 | 16 | 0 | 99 | 373 | 209 | -39 | -9 | 380 | 349 | 5 | 20 | 1 | 4 | 62 | 147 | 544 | 25 | 8 | 100 | 10 |
| 2030 | 688 | 574 | 0 | 9 | 0 | 106 | 549 | 187 | -41 | -21 | 428 | 437 | 6 | 22 | 1 | 5 | 100 | 191 | 705 | 22 | 2 | 100 | 10 |
| 2031 | 756 | 602 | 0 | 5 | 0 | 148 | 555 | 176 | 24 | 61 | 551 | 450 | 7 | 25 | 1 | 6 | 100 | 235 | 746 | 56 | 2 | 100 | 10 |
| 2032 | 634 | 564 | 0 | 15 | 0 | 55 | 594 | 171 | -131 | 90 | 520 | 440 | 7 | 25 | 1 | 7 | 123 | 276 | 813 | 76 | 5 | 93 | 10 |
| 2033 | 715 | 555 | 0 | 111 | 0 | 60 | 595 | 114 | 33 | 65 | 494 | 419 | 7 | 26 | 1 | 7 | 123 | 326 | 893 | 47 | 28 | 79 | 10 |
| 2034 | 691 | 475 | 76 | 102 | 0 | 32 | 708 | 101 | -101 | -58 | 404 | 444 | 7 | 27 | 2 | 7 | 123 | 349 | 939 | 135 | 21 | 21 | 11 |
| 2035 (insolvent) | 798 | 542 | 76 | 143 | 0 | 37 | 837 | 82 | -121 | -183 | 313 | 478 | 7 | 27 | 2 | 7 | 123 | 376 | 1054 | 121 | 9 | 79 | 11 |
| 2036 (insolvent) | 787 | 543 | 84 | 125 | 0 | 36 | 819 | 48 | -81 | -289 | 239 | 503 | 7 | 27 | 2 | 7 | 123 | 410 | 1085 | 106 | 13 | 98 | 11 |
| 2037 (insolvent) | 741 | 547 | 70 | 125 | 0 | 0 | 831 | 20 | -110 | -444 | 107 | 589 | 7 | 27 | 2 | 7 | 123 | 442 | 1025 | 145 | 28 | 42 | 11 |
| 2038 (insolvent) | 635 | 520 | 81 | 25 | 0 | 0 | 756 | 19 | -138 | -606 | -59 | 697 | 7 | 25 | 2 | 7 | 123 | 449 | 949 | 82 | 33 | 100 | 11 |
| 2039 (insolvent) | 420 | 410 | 0 | 10 | 0 | 0 | 594 | 14 | -185 | -814 | -268 | 866 | 7 | 23 | 2 | 7 | 123 | 464 | 838 | 21 | 86 | 96 | 9 |
| 2040 (insolvent) | 416 | 405 | 0 | 11 | 0 | 0 | 596 | 9 | -189 | -1.024 | -482 | 1.048 | 7 | 23 | 2 | 7 | 123 | 482 | 828 | 19 | 78 | 98 | 9 |
| 2041 (insolvent) | 342 | 333 | 0 | 9 | 0 | 0 | 557 | 9 | -203 | -1.238 | -730 | 1.245 | 7 | 21 | 2 | 7 | 123 | 482 | 729 | 44 | 79 | 66 | 8 |
| 2042 (insolvent) | 330 | 321 | 0 | 9 | 0 | 0 | 571 | 9 | -250 | -1.488 | -995 | 1.488 | 7 | 21 | 2 | 7 | 123 | 477 | 769 | 33 | 74 | 100 | 8 |
| 2043 (insolvent) | 342 | 336 | 0 | 6 | 0 | 0 | 622 | 8 | -280 | -1.763 | -1.297 | 1.763 | 7 | 20 | 2 | 7 | 123 | 479 | 809 | 31 | 76 | 79 | 8 |
| 2044 (insolvent) | 251 | 241 | 0 | 10 | 0 | 0 | 595 | 6 | -313 | -2.073 | -1.667 | 2.073 | 7 | 18 | 2 | 7 | 123 | 478 | 573 | 47 | 79 | 89 | 7 |
| 2045 (insolvent) | 341 | 333 | 0 | 8 | 0 | 0 | 657 | 3 | -319 | -2.392 | -1.998 | 2.392 | 7 | 18 | 2 | 7 | 123 | 478 | 751 | 46 | 44 | 52 | 7 |
| 2046 (insolvent) | 271 | 265 | 0 | 5 | 0 | 0 | 681 | 3 | -413 | -2.806 | -2.424 | 2.806 | 7 | 18 | 2 | 7 | 123 | 477 | 644 | 46 | 51 | 26 | 7 |

### Ausgaben je Kategorie (T€, Zahlungen inkl. Investitionen)

| Jahr | Ackerbau | Bau | Diesel | Gebäude | Leasing | Maschinenkauf | Maut | Pacht | Personal | Sonstiges | Steuern | Tilgung | Versicherung | Werkstatt | Zinsen |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2027 | 0 | 0 | 55 | 0 | 0 | 369 | 0 | 0 | 42 | 0 | 0 | 16 | 5 | 40 | 6 |
| 2028 | 11 | 0 | 67 | 0 | 0 | 92 | 0 | 45 | 75 | 0 | 5 | 26 | 6 | 75 | 9 |
| 2029 | 44 | 0 | 90 | 0 | 0 | 344 | 0 | 45 | 106 | 0 | 0 | 38 | 8 | 66 | 13 |
| 2030 | 51 | 0 | 132 | 0 | 0 | 233 | 0 | 72 | 163 | 0 | 0 | 53 | 11 | 102 | 19 |
| 2031 | 60 | 0 | 132 | 0 | 0 | 151 | 0 | 72 | 164 | 0 | 0 | 67 | 12 | 93 | 21 |
| 2032 | 64 | 0 | 129 | 0 | 0 | 0 | 0 | 72 | 170 | 0 | 2 | 79 | 12 | 126 | 20 |
| 2033 | 27 | 85 | 143 | 3 | 32 | 67 | 6 | 89 | 180 | 0 | 0 | 91 | 13 | 88 | 20 |
| 2034 | 36 | 0 | 156 | 2 | 70 | 80 | 5 | 89 | 241 | 0 | 4 | 103 | 13 | 86 | 20 |
| 2035 | 18 | 0 | 164 | 2 | 89 | 0 | 8 | 89 | 308 | 0 | 0 | 91 | 13 | 123 | 28 |
| 2036 | 14 | 0 | 173 | 2 | 89 | 0 | 8 | 89 | 302 | 0 | 0 | 81 | 13 | 91 | 38 |
| 2037 | 17 | 0 | 166 | 2 | 89 | 0 | 7 | 89 | 305 | 0 | 0 | 70 | 13 | 97 | 49 |
| 2038 | 5 | 0 | 139 | 2 | 56 | 0 | 1 | 89 | 271 | 0 | 0 | 53 | 12 | 115 | 61 |
| 2039 | 5 | 0 | 96 | 2 | 14 | 0 | 0 | 89 | 222 | 0 | 0 | 39 | 11 | 72 | 79 |
| 2040 | 5 | 0 | 97 | 2 | 0 | 0 | 0 | 89 | 226 | 0 | 0 | 28 | 11 | 67 | 101 |
| 2041 | 5 | 0 | 76 | 2 | 0 | 0 | 0 | 89 | 199 | 0 | 0 | 17 | 11 | 56 | 123 |
| 2042 | 5 | 0 | 75 | 2 | 0 | 0 | 0 | 89 | 192 | 0 | 0 | 7 | 11 | 53 | 147 |
| 2043 | 5 | 0 | 77 | 2 | 0 | 0 | 0 | 89 | 194 | 0 | 0 | 0 | 11 | 71 | 176 |
| 2044 | 5 | 0 | 59 | 2 | 0 | 0 | 0 | 89 | 168 | 0 | 0 | 0 | 11 | 57 | 208 |
| 2045 | 5 | 0 | 74 | 2 | 0 | 0 | 0 | 89 | 189 | 0 | 0 | 0 | 10 | 49 | 242 |
| 2046 | 5 | 0 | 60 | 2 | 0 | 0 | 0 | 89 | 174 | 0 | 0 | 0 | 10 | 63 | 281 |

### Umsatz je Dienst (T€)

| Jahr | drusch | einzelkorn | grubbern | guelle | hacken | pflanzenschutz | pressen | saat | stoppel | striegeln | transport |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2027 | 0 | 24 | 92 | 75 | 6 | 44 | 0 | 0 | 33 | 7 | 5 |
| 2028 | 0 | 14 | 102 | 103 | 21 | 44 | 0 | 0 | 30 | 13 | 13 |
| 2029 | 0 | 22 | 113 | 104 | 25 | 74 | 16 | 21 | 34 | 15 | 16 |
| 2030 | 0 | 30 | 118 | 142 | 47 | 66 | 34 | 68 | 48 | 21 | 9 |
| 2031 | 0 | 37 | 91 | 167 | 47 | 61 | 33 | 86 | 55 | 26 | 5 |
| 2032 | 0 | 32 | 86 | 129 | 46 | 81 | 40 | 79 | 50 | 22 | 15 |
| 2033 | 0 | 32 | 36 | 155 | 49 | 74 | 46 | 91 | 51 | 20 | 111 |
| 2034 | 76 | 47 | 79 | 57 | 32 | 81 | 50 | 54 | 59 | 17 | 102 |
| 2035 | 76 | 47 | 70 | 88 | 54 | 97 | 40 | 84 | 34 | 27 | 143 |
| 2036 | 84 | 50 | 74 | 78 | 51 | 85 | 50 | 90 | 41 | 23 | 125 |
| 2037 | 70 | 45 | 70 | 94 | 69 | 79 | 47 | 84 | 38 | 22 | 125 |
| 2038 | 81 | 36 | 43 | 110 | 68 | 66 | 47 | 85 | 37 | 27 | 25 |
| 2039 | 0 | 45 | 0 | 64 | 60 | 82 | 29 | 83 | 33 | 15 | 10 |
| 2040 | 0 | 44 | 0 | 89 | 45 | 63 | 36 | 83 | 30 | 15 | 11 |
| 2041 | 0 | 43 | 0 | 74 | 45 | 63 | 37 | 51 | 0 | 21 | 9 |
| 2042 | 0 | 38 | 0 | 79 | 50 | 56 | 37 | 49 | 0 | 12 | 9 |
| 2043 | 0 | 32 | 0 | 72 | 37 | 88 | 31 | 62 | 0 | 14 | 6 |
| 2044 | 0 | 0 | 0 | 79 | 21 | 47 | 26 | 54 | 0 | 16 | 10 |
| 2045 | 0 | 0 | 0 | 142 | 39 | 55 | 22 | 52 | 0 | 22 | 8 |
| 2046 | 0 | 0 | 0 | 106 | 26 | 43 | 33 | 40 | 0 | 17 | 5 |

### Dienste je Jahr

- 2027: einzelkorn, grubbern, guelle, hacken, pflanzenschutz, stoppel, striegeln, transport
- 2028: einzelkorn, grubbern, guelle, hacken, pflanzenschutz, stoppel, striegeln, transport
- 2029: einzelkorn, grubbern, guelle, hacken, pflanzenschutz, pressen, saat, stoppel, striegeln, transport
- 2030: einzelkorn, grubbern, guelle, hacken, pflanzenschutz, pressen, saat, stoppel, striegeln, transport
- 2031: einzelkorn, grubbern, guelle, hacken, pflanzenschutz, pressen, saat, stoppel, striegeln, transport
- 2032: einzelkorn, grubbern, guelle, hacken, pflanzenschutz, pressen, saat, stoppel, striegeln, transport
- 2033: einzelkorn, grubbern, guelle, hacken, pflanzenschutz, pressen, saat, stoppel, striegeln, transport
- 2034: drusch, einzelkorn, grubbern, guelle, hacken, pflanzenschutz, pressen, saat, stoppel, striegeln, transport
- 2035: drusch, einzelkorn, grubbern, guelle, hacken, pflanzenschutz, pressen, saat, stoppel, striegeln, transport
- 2036: drusch, einzelkorn, grubbern, guelle, hacken, pflanzenschutz, pressen, saat, stoppel, striegeln, transport
- 2037: drusch, einzelkorn, grubbern, guelle, hacken, pflanzenschutz, pressen, saat, stoppel, striegeln, transport
- 2038: drusch, einzelkorn, grubbern, guelle, hacken, pflanzenschutz, pressen, saat, stoppel, striegeln, transport
- 2039: einzelkorn, guelle, hacken, pflanzenschutz, pressen, saat, stoppel, striegeln, transport
- 2040: einzelkorn, guelle, hacken, pflanzenschutz, pressen, saat, stoppel, striegeln, transport
- 2041: einzelkorn, guelle, hacken, pflanzenschutz, pressen, saat, striegeln, transport
- 2042: einzelkorn, guelle, hacken, pflanzenschutz, pressen, saat, striegeln, transport
- 2043: einzelkorn, guelle, hacken, pflanzenschutz, pressen, saat, striegeln, transport
- 2044: guelle, hacken, pflanzenschutz, pressen, saat, striegeln, transport
- 2045: guelle, hacken, pflanzenschutz, pressen, saat, striegeln, transport
- 2046: guelle, hacken, pflanzenschutz, pressen, saat, striegeln, transport

### Investitionen

- 3/2027: grubber gebraucht Köckerling Trio 300 7.900 € (Anfrage grubbern)
- 3/2027: guellefass gebraucht Joskin Volumetra 16500 D + Schleppschlauch 15 m 62.600 € (Anfrage guelle)
- 3/2027: schlepper gebraucht Fendt 516 Vario 69.500 € (Schlepper ausgelastet)
- 3/2027: einzelkorn gebraucht Kverneland Optima V 8-reihig (6 m) 31.700 € (Anfrage einzelkorn)
- 4/2027: spritze gebraucht Amazone UX 5201 Super (24 m) 49.900 € (Anfrage pflanzenschutz)
- 5/2027: striegel gebraucht Einböck Aerostar 9 m 8.900 € (Anfrage striegeln)
- 5/2027: schlepper gebraucht New Holland T6.180 55.500 € (Schlepper ausgelastet)
- 6/2027: hacke gebraucht Einböck Chopstar 6-reihig mit Kamera 38.400 € (Anfrage hacken)
- 7/2027: kurzscheibenegge gebraucht Horsch Joker 3 CT 11.900 € (Anfrage stoppel)
- 7/2027: kurzscheibenegge gebraucht Köckerling Rebell 600 T 20.400 € (Dienst ausgelastet)
- 9/2027: grubber gebraucht Horsch Terrano 4 FX 12.000 € (Dienst ausgelastet)
- 3/2028: guellefass gebraucht Joskin Alpina 2 7100 S + Schleppschuh 7,5 m 18.700 € (Dienst ausgelastet)
- 5/2028: spritze gebraucht Kverneland iXtrack T4 (30 m) 73.500 € (Dienst ausgelastet)
- 6/2029: hacke neu gekauft Einböck Chopstar 6-reihig mit Kamera 45.000 € (Dienst ausgelastet)
- 7/2029: presse gebraucht Krone BiG Pack 1290 HDP II 82.500 € (Anfrage pressen)
- 8/2029: drille neu gekauft Amazone KE 3002 + Centaya 3000 (3 m) 52.000 € (Anfrage saat)
- 8/2029: schlepper gebraucht Valtra N155e 65.300 € (Schlepper ausgelastet)
- 9/2029: grubber gebraucht Horsch Terrano 4 FX 12.500 € (Dienst ausgelastet)
- 9/2029: schlepper gebraucht John Deere 6R 215 94.900 € (Schlepper ausgelastet)
- 7/2030: presse gebraucht Claas Quadrant 5300 FC 140.800 € (Dienst ausgelastet)
- 8/2030: drille gebraucht Amazone KE 3002 + Centaya 3000 (3 m) 25.800 € (Dienst ausgelastet)
- 9/2030: schlepper gebraucht Deutz-Fahr 6165 TTV 66.700 € (Schlepper ausgelastet)
- 9/2031: grubber neu gekauft Köckerling Trio 300 19.000 € (Dienst ausgelastet)
- 9/2031: schlepper gebraucht Claas Axion 870 95.200 € (Schlepper ausgelastet)
- 9/2031: grubber gebraucht Horsch Tiger 6 DT 38.000 € (Dienst ausgelastet)
- 11/2032: lkw neu geleast Mercedes-Benz Actros 1848 + Kippsattel 178.000 € (Ausbauplan)
- 5/2033: spritze gebraucht Kverneland iXtrack T4 (30 m) 53.000 € (Dienst ausgelastet)
- 5/2033: striegel neu gekauft Einböck Aerostar 9 m 16.000 € (Dienst ausgelastet)
- 2/2034: maehdrescher neu geleast Deutz-Fahr C7206 TS + 6,3 m 310.000 € (Ausbauplan)
- 2/2034: kipper gebraucht Fliegl TDK 302 Tridem-Kipper (22 t) 33.800 € (Ausbauplan)
- 9/2034: drille neu gekauft Amazone KE 3002 + Centaya 3000 (3 m) 52.000 € (Dienst ausgelastet)

### Protokoll (Auszug)

- 3/2029: grubber verschlissen in Zahlung gegeben (in Zahlung gegeben für 4.300 €)
- 10/2030: grubber verschlissen in Zahlung gegeben (in Zahlung gegeben für 6.900 €)
- 4/2033: grubber verschlissen in Zahlung gegeben (in Zahlung gegeben für 5.400 €)
- 4/2033: spritze verschlissen in Zahlung gegeben (in Zahlung gegeben für 22.400 €)
- 5/2034: drille verschlissen in Zahlung gegeben (in Zahlung gegeben für 12.900 €)
- 5/2034: fest eingestellt (wird für drescher geschult): Svenja Evers
- 5/2034: Svenja Evers auf Lehrgang (drescher)
- 5/2034: Svenja Evers auf Lehrgang (drescher)
- 9/2034: kurzscheibenegge verschlissen in Zahlung gegeben (in Zahlung gegeben für 4.400 €)
- 5/2038: grubber verschlissen in Zahlung gegeben (in Zahlung gegeben für 7.400 €)
- 7/2039: striegel verschlissen in Zahlung gegeben (in Zahlung gegeben für 2.600 €)
- 6/2041: kurzscheibenegge verschlissen in Zahlung gegeben (in Zahlung gegeben für 5.500 €)
- 8/2041: drille verschlissen in Zahlung gegeben (in Zahlung gegeben für 14.700 €)
- 5/2043: einzelkorn verschlissen in Zahlung gegeben (in Zahlung gegeben für 7.200 €)
- 4/2044: spritze verschlissen in Zahlung gegeben (in Zahlung gegeben für 17.500 €)
- 8/2044: presse verschlissen in Zahlung gegeben (in Zahlung gegeben für 19.700 €)
