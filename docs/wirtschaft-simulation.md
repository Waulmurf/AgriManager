# Wirtschaftlichkeits-Simulation (2 Jahre, Seed 2027)

> Erzeugt mit `tests/unit/economy-sim.test.ts` (Bot: `tests/sim/economyBot.ts`) auf den echten
> Kartendaten. Neu erzeugen (bash): `ECONOMY_REPORT=docs/wirtschaft-simulation.md npx vitest run tests/unit/economy-sim.test.ts`.
>
> **Was der Bot tut:** Er fährt nur Feldarbeit mit Schlepper und Gerät (Grubbern, Stoppel, Saat,
> Einzelkorn, Pflanzenschutz, Pressen, Gülle, Striegeln, Hacken), keine Ernteketten, Transporte,
> Kommunal- oder Winterdienste.
> - Er besucht die nächsten Betriebe und nimmt machbare Anfragen zum Kundenpreis an (höchstens zwei
>   offene Aufträge je Schlepper).
> - Fehlende Geräte kauft er gebraucht, notfalls mit Darlehen.
> - Lehnt er Anfragen wegen voller Auslastung ab, stellt er Saisonkräfte ein und kauft gebrauchte
>   Schlepper (höchstens sechs).
>
> **Befunde (6. Nov. 2026):**
> - **Jahr 1 mit einem Gespann:** gut 200.000 € Umsatz und knapp 20.000 € Gewinn nach AfA.
> - **Jahr 2 mit 4–5 Gespannen:** rund 325.000 € Umsatz, aber etwa 30.000 € Verlust. Gründe:
>   - Die AfA auf gebrauchte Schlepper und viele Geräte (rund 160.000 €) ist hoch.
>   - Je Schlepper kommen nur etwa 65.000 € Umsatz im Jahr zusammen, weil die reine Feldarbeit
>     stark saisonal ist (Juli/August und November bis Februar fast leer).
> - **Wachstum braucht mehr Geschäftsfelder:** Ernteketten, Transport, Winterdienst und Kommunal
>   füllen die Lücken. Das ist so gewollt und plausibel.
> - **Deckungsbeitrag je ha:** Gülle etwa 70 €, Einzelkorn etwa 39 €, Pressen etwa 35 €, Saat etwa
>   33 €, Grubbern etwa 27 €, Stoppel etwa 17 €, Pflanzenschutz etwa 14 €.
> - **Unstimmigkeit:** In der Bilanz zählen die Maschinen zum Marktwert, im Ergebnis mit der AfA.
>   Das Eigenkapital steigt deshalb, obwohl das Jahresergebnis negativ ist.
> - **Gefundene und behobene Fehler:**
>   - Ein Gülleauftrag konnte am Ende leer zwischen Lager und Feld pendeln (Rundung der
>     Auftragsfläche).
>   - Nie begonnene Aufträge blieben ewig offen. Jetzt sagt der Kunde eine Woche nach der Frist ab.

## Monate

| Monat | Kasse | Eigenkapital | Schulden | Umsatz | Kosten | Aufträge fertig | offen | Kunden bekannt | Schlepper | Geräte | Personal | Ruf |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 03/2027 | 107.541 € | 200.005 € | 78.796 € | 3.919 € | 4.675 € | 13 | 2 | 13 | 1 | 2 | 2 | 70 |
| 04/2027 | 35.530 € | 226.386 € | 156.385 € | 32.924 € | 25.224 € | 45 | 3 | 26 | 3 | 4 | 4 | 99 |
| 05/2027 | -55.563 € | 256.943 € | 229.231 € | 62.108 € | 22.085 € | 80 | 3 | 51 | 3 | 7 | 4 | 100 |
| 06/2027 | -36.627 € | 275.875 € | 207.569 € | 26.989 € | 5.327 € | 129 | 4 | 66 | 3 | 7 | 4 | 100 |
| 07/2027 | -23.568 € | 274.895 € | 191.775 € | 18.666 € | 2.872 € | 133 | 0 | 68 | 3 | 7 | 4 | 100 |
| 08/2027 | -23.635 € | 275.742 € | 189.097 € | 4.217 € | 1.538 € | 135 | 0 | 68 | 3 | 7 | 4 | 100 |
| 09/2027 | 6.985 € | 284.996 € | 211.965 € | 8.037 € | 23.920 € | 166 | 1 | 68 | 3 | 7 | 4 | 100 |
| 10/2027 | 25.310 € | 293.420 € | 208.455 € | 42.261 € | 20.426 € | 193 | 1 | 68 | 3 | 7 | 4 | 100 |
| 11/2027 | 36.814 € | 293.531 € | 204.933 € | 16.751 € | 1.724 € | 194 | 0 | 68 | 3 | 7 | 4 | 100 |
| 12/2027 | 33.579 € | 264.708 € | 201.399 € | 1.514 € | 1.215 € | 194 | 0 | 68 | 3 | 7 | 4 | 100 |
| 01/2028 | 28.830 € | 263.506 € | 197.852 € | 0 € | 1.202 € | 194 | 0 | 68 | 3 | 7 | 4 | 100 |
| 02/2028 | 23.550 € | 267.143 € | 194.292 € | 5.332 € | 7.053 € | 206 | 6 | 68 | 3 | 7 | 4 | 91 |
| 03/2028 | 5.774 € | 293.510 € | 190.720 € | 22.835 € | 37.039 € | 266 | 6 | 69 | 3 | 7 | 4 | 100 |
| 04/2028 | 54.716 € | 327.353 € | 216.684 € | 77.671 € | 36.793 € | 332 | 6 | 74 | 3 | 8 | 4 | 100 |
| 05/2028 | 36.335 € | 346.723 € | 252.031 € | 62.380 € | 25.862 € | 393 | 6 | 85 | 4 | 9 | 5 | 99 |
| 06/2028 | 20.188 € | 361.293 € | 247.363 € | 49.062 € | 9.641 € | 446 | 9 | 95 | 5 | 9 | 6 | 100 |
| 07/2028 | -11.602 € | 364.103 € | 254.280 € | 16.050 € | 2.155 € | 455 | 0 | 103 | 5 | 10 | 6 | 97 |
| 08/2028 | 9.483 € | 367.547 € | 277.382 € | 9.537 € | 11.256 € | 476 | 9 | 104 | 5 | 11 | 6 | 76 |
| 09/2028 | -8.299 € | 369.684 € | 280.366 € | 25.534 € | 38.001 € | 515 | 2 | 106 | 5 | 11 | 6 | 66 |
| 10/2028 | 3.403 € | 370.524 € | 266.734 € | 37.897 € | 20.862 € | 544 | 4 | 107 | 5 | 11 | 6 | 100 |
| 11/2028 | 9.063 € | 371.655 € | 261.382 € | 16.080 € | 5.068 € | 548 | 0 | 109 | 5 | 11 | 6 | 100 |
| 12/2028 | 4.691 € | 332.819 € | 256.011 € | 2.548 € | 1.549 € | 548 | 0 | 110 | 5 | 11 | 6 | 100 |
| 01/2029 | -2.229 € | 331.289 € | 252.850 € | 0 € | 1.530 € | 548 | 0 | 111 | 5 | 11 | 6 | 100 |

## Jahresabschlüsse

| Jahr | Umsatz | Kosten | AfA | Gewinn |
| --- | ---: | ---: | ---: | ---: |
| 2027 | 217.385 € | 107.802 € | 92.327 € | 17.256 € |
| 2028 | 324.927 € | 196.146 € | 158.859 € | -30.078 € |

## Aufträge je Dienst

Fertig: 551, davon verspätet: 49; vom Kunden storniert: 15

| Dienst | Aufträge | ha | Umsatz | Deckungsbeitrag | DB/ha |
| --- | ---: | ---: | ---: | ---: | ---: |
| grubbern | 204 | 4271 | 212.255 € | 116.252 € | 27 € |
| guelle | 103 | 2168 | 190.819 € | 153.314 € | 71 € |
| pflanzenschutz | 185 | 4188 | 88.597 € | 57.390 € | 14 € |
| einzelkorn | 20 | 463 | 24.879 € | 17.931 € | 39 € |
| striegeln | 7 | 201 | 6.899 € | 5.035 € | 25 € |
| stoppel | 32 | 747 | 26.187 € | 13.199 € | 18 € |

## Käufe

- 3/2027 gebraucht grubber Köckerling Trio 300 für 7900 €
- 3/2027 gebraucht guellefass Joskin Volumetra 16500 D + Schleppschlauch 15 m für 62600 €
- 3/2027 neu einzelkorn Kverneland Optima V 8-reihig (6 m) (bestellt, Lieferung etwa 23.05.)
- 3/2027 neu spritze Amazone UX 5201 Super (24 m) (bestellt, Lieferung etwa 23.05.)
- 4/2027 gebraucht Schlepper Fendt 516 Vario 165 PS für 69500 € (gekauft)
- 4/2027 weiteres guellefass gebraucht für 18900 €
- 4/2027 weiteres grubber gebraucht für 11200 €
- 4/2027 neu striegel Einböck Aerostar 9 m (Nicht genug Geld für Bestellung und Lieferung – Kredit oder Leasing?)
- 4/2027 neu striegel Einböck Aerostar 9 m (Nicht genug Geld für Bestellung und Lieferung – Kredit oder Leasing?)
- 4/2027 gebraucht Schlepper Deutz-Fahr 6165 TTV 165 PS für 57700 € (gekauft)
- 5/2027 neu hacke Einböck Chopstar 6-reihig mit Kamera (Nicht genug Geld für Bestellung und Lieferung – Kredit oder Leasing?)
- 5/2027 weiteres grubber gebraucht für 12500 €
- 5/2027 neu striegel Einböck Aerostar 9 m (Nicht genug Geld für Bestellung und Lieferung – Kredit oder Leasing?)
- 5/2027 neu striegel Einböck Aerostar 9 m (Nicht genug Geld für Bestellung und Lieferung – Kredit oder Leasing?)
- 5/2027 neu hacke Einböck Chopstar 6-reihig mit Kamera (Nicht genug Geld für Bestellung und Lieferung – Kredit oder Leasing?)
- 5/2027 neu hacke Einböck Chopstar 6-reihig mit Kamera (Nicht genug Geld für Bestellung und Lieferung – Kredit oder Leasing?)
- 4/2028 gebraucht striegel Treffler Präzisions-Zinkenstriegel TS 1220 (12 m) für 17900 €
- 5/2028 gebraucht Schlepper Valtra N155e 155 PS für 43300 € (gekauft)
- 5/2028 neu hacke Einböck Chopstar 6-reihig mit Kamera (bestellt, Lieferung etwa 04.07.)
- 5/2028 weiteres spritze gebraucht für 46200 €
- 6/2028 gebraucht Schlepper Claas Arion 550 165 PS für 50900 € (gekauft)
- 8/2028 gebraucht kurzscheibenegge Horsch Joker 3 CT für 11900 €

## Einstellungen

- 3/2027 Dennis Voß (eingestellt)
- 4/2027 Timo Stöver (eingestellt)
- 4/2027 Mihai Pape (eingestellt)
- 5/2028 Jana Wilkens (eingestellt)
- 6/2028 Malte Martens (eingestellt)

Darlehen aufgenommen: 340.000 €

## Protokoll

- 21.3.2027: Darlehen 60000 € (ausgezahlt, Rate 1.107,70 €/Monat)
- 28.3.2027: Darlehen 20000 € (ausgezahlt, Rate 369,23 €/Monat)
- 13.4.2027: Darlehen 30000 € (ausgezahlt, Rate 553,85 €/Monat)
- 25.4.2027: Darlehen 50000 € (ausgezahlt, Rate 923,08 €/Monat)
- 10.5.2027: Darlehen 20000 € (ausgezahlt, Rate 373,77 €/Monat)
- 1.9.2027: Darlehen 50.000 € (ausgezahlt, Rate 934,43 €/Monat)
- 3.4.2028: Darlehen 30000 € (ausgezahlt, Rate 553,85 €/Monat)
- 16.5.2028: Darlehen 40000 € (ausgezahlt, Rate 738,47 €/Monat)
- 8.8.2028: Darlehen 40000 € (ausgezahlt, Rate 747,54 €/Monat)
