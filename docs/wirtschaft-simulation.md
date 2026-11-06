# Wirtschaftlichkeits-Simulation (2 Jahre, Seed 2027)

> Erzeugt mit `tests/unit/economy-sim.test.ts` (Bot: `tests/sim/economyBot.ts`) auf den echten
> Kartendaten. Neu erzeugen (bash): `ECONOMY_REPORT=docs/wirtschaft-simulation.md npx vitest run tests/unit/economy-sim.test.ts`
> (überschreibt diese Einleitung).
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
> **Befunde nach der Balance vom 6. Nov. 2026** (Feldpreise etwa +15 %, weniger Pannen, Pacht −80 €/ha):
> - **Jahr 1:** gut 200.000 € Umsatz und rund 46.000 € Gewinn nach AfA (vorher knapp 20.000 €).
> - **Jahr 2:** rund 256.000 € Umsatz und etwa 12.000 € Verlust (vorher rund 30.000 €). Reine Feldarbeit
>   bleibt saisonal und knapp; Wachstum braucht Ernte, Transport und Kommunal, siehe
>   `docs/wirtschaft-20-jahre.md`.
> - **Deckungsbeitrag je ha:** Gülle etwa 78 €, Hacken 51 €, Einzelkorn 46 €, Saat 44 €, Pressen 42 €,
>   Grubbern 34 €, Striegeln 28 €, Stoppel 22 €, Pflanzenschutz 17 €.
> - **Unstimmigkeit:** In der Bilanz zählen die Maschinen zum Marktwert, im Ergebnis mit der AfA.

## Monate

| Monat | Kasse | Eigenkapital | Schulden | Umsatz | Kosten | Aufträge fertig | offen | Kunden bekannt | Schlepper | Geräte | Personal | Ruf |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 03/2027 | 40.487 € | 196.754 € | 137.894 € | 10.826 € | 6.532 € | 16 | 1 | 13 | 1 | 4 | 2 | 74 |
| 04/2027 | 23.747 € | 217.136 € | 145.632 € | 34.742 € | 11.420 € | 40 | 1 | 27 | 1 | 5 | 2 | 100 |
| 05/2027 | 27.923 € | 237.226 € | 143.362 € | 28.547 € | 6.901 € | 70 | 0 | 30 | 1 | 6 | 2 | 100 |
| 06/2027 | 78.287 € | 256.975 € | 170.633 € | 31.056 € | 7.962 € | 119 | 1 | 32 | 1 | 6 | 2 | 100 |
| 07/2027 | 78.945 € | 257.743 € | 167.894 € | 18.919 € | 3.623 € | 129 | 0 | 33 | 1 | 7 | 2 | 100 |
| 08/2027 | 69.489 € | 270.950 € | 194.695 € | 11.943 € | 5.399 € | 144 | 1 | 35 | 1 | 8 | 2 | 99 |
| 09/2027 | 28.409 € | 288.008 € | 201.337 € | 18.284 € | 8.606 € | 158 | 1 | 36 | 1 | 9 | 2 | 100 |
| 10/2027 | -2.797 € | 305.316 € | 200.763 € | 32.032 € | 10.968 € | 171 | 0 | 36 | 1 | 10 | 2 | 100 |
| 11/2027 | 7.800 € | 304.243 € | 194.584 € | 15.051 € | 1.072 € | 171 | 0 | 36 | 1 | 10 | 2 | 100 |
| 12/2027 | 3.360 € | 273.737 € | 191.191 € | 0 € | 1.046 € | 171 | 0 | 36 | 1 | 10 | 2 | 100 |
| 01/2028 | -1.079 € | 272.703 € | 188.864 € | 0 € | 1.034 € | 171 | 0 | 36 | 1 | 10 | 2 | 100 |
| 02/2028 | -2.130 € | 279.308 € | 186.498 € | 4.763 € | 2.397 € | 176 | 2 | 37 | 1 | 10 | 2 | 95 |
| 03/2028 | -1.170 € | 297.723 € | 182.109 € | 11.203 € | 6.814 € | 197 | 1 | 37 | 1 | 10 | 2 | 100 |
| 04/2028 | 20.234 € | 324.126 € | 177.498 € | 35.406 € | 10.562 € | 221 | 1 | 43 | 1 | 10 | 2 | 100 |
| 05/2028 | 36.911 € | 332.336 € | 242.993 € | 34.224 € | 8.857 € | 261 | 1 | 51 | 2 | 10 | 3 | 100 |
| 06/2028 | 51.478 € | 360.862 € | 238.471 € | 28.997 € | 9.909 € | 327 | 1 | 56 | 2 | 10 | 3 | 100 |
| 07/2028 | 24.039 € | 358.379 € | 233.934 € | 29.226 € | 5.628 € | 338 | 3 | 58 | 2 | 12 | 3 | 100 |
| 08/2028 | 22.417 € | 368.601 € | 229.382 € | 21.417 € | 18.486 € | 372 | 1 | 63 | 2 | 12 | 3 | 100 |
| 09/2028 | 24.951 € | 379.844 € | 254.362 € | 27.893 € | 18.640 € | 405 | 2 | 66 | 2 | 14 | 3 | 100 |
| 10/2028 | 39.922 € | 399.283 € | 249.325 € | 39.685 € | 19.677 € | 439 | 2 | 69 | 2 | 14 | 3 | 100 |
| 11/2028 | 54.057 € | 399.795 € | 244.271 € | 21.167 € | 1.978 € | 441 | 0 | 71 | 2 | 14 | 3 | 100 |
| 12/2028 | 49.948 € | 363.237 € | 239.200 € | 2.253 € | 1.290 € | 441 | 0 | 72 | 2 | 14 | 3 | 100 |
| 01/2029 | 43.586 € | 361.964 € | 234.111 € | 0 € | 1.273 € | 270 | 0 | 72 | 2 | 14 | 3 | 100 |

## Jahresabschlüsse

| Jahr | Umsatz | Kosten | AfA | Gewinn |
| --- | ---: | ---: | ---: | ---: |
| 2027 | 201.399 € | 62.489 € | 92.759 € | 46.151 € |
| 2028 | 256.235 € | 105.029 € | 162.877 € | -11.671 € |

## Aufträge je Dienst

Fertig: 275, davon verspätet: 8; vom Kunden storniert: 4

| Dienst | Aufträge | ha | Umsatz | Deckungsbeitrag | DB/ha |
| --- | ---: | ---: | ---: | ---: | ---: |
| guelle | 35 | 827 | 77.619 € | 64.764 € | 78 € |
| grubbern | 46 | 746 | 42.558 € | 25.417 € | 34 € |
| einzelkorn | 10 | 179 | 10.969 € | 8.273 € | 46 € |
| pflanzenschutz | 85 | 1813 | 43.715 € | 30.801 € | 17 € |
| hacken | 17 | 218 | 14.755 € | 11.049 € | 51 € |
| striegeln | 6 | 91 | 3.504 € | 2.552 € | 28 € |
| stoppel | 33 | 566 | 22.181 € | 12.406 € | 22 € |
| pressen | 10 | 142 | 8.713 € | 5.902 € | 42 € |
| saat | 33 | 566 | 41.014 € | 24.683 € | 44 € |

## Käufe

- 3/2027 gebraucht grubber Köckerling Trio 300 für 7900 €
- 3/2027 gebraucht guellefass Joskin Volumetra 16500 D + Schleppschlauch 15 m für 62600 €
- 3/2027 gebraucht spritze Kverneland iXtrack T4 (30 m) für 54200 €
- 3/2027 weiteres spritze gebraucht für 77000 €
- 4/2027 neu striegel Einböck Aerostar 9 m (bestellt, Lieferung etwa 09.05.)
- 4/2027 gebraucht einzelkorn Kverneland Optima V 8-reihig (6 m) für 47800 €
- 6/2027 neu hacke Einböck Chopstar 6-reihig mit Kamera (bestellt, Lieferung etwa 09.08.)
- 7/2027 gebraucht kurzscheibenegge Horsch Joker 3 CT für 11900 €
- 8/2027 neu drille Amazone KE 3002 + Centaya 3000 (3 m) (bestellt, Lieferung etwa 09.10.)
- 9/2027 gebraucht presse Krone BiG Pack 1290 HDP II für 57400 €
- 5/2028 gebraucht Schlepper Deutz-Fahr 6165 TTV 165 PS für 66600 € (gekauft)
- 7/2028 weiteres kurzscheibenegge gebraucht für 12300 €
- 7/2028 weiteres kurzscheibenegge gebraucht für 34200 €
- 9/2028 weiteres grubber gebraucht für 12500 €
- 9/2028 weiteres guellefass gebraucht für 19200 €

## Einstellungen

- 3/2027 Tobias Möller (eingestellt)
- 5/2028 Bernd Köhler (eingestellt)

Darlehen aufgenommen: 320.000 €

## Protokoll

- 20.3.2027: Darlehen 50000 € (ausgezahlt, Rate 923,08 €/Monat)
- 20.3.2027: Darlehen 90000 € (ausgezahlt, Rate 1.661,55 €/Monat)
- 24.4.2027: Darlehen 10000 € (ausgezahlt, Rate 186,89 €/Monat)
- 21.6.2027: Darlehen 30000 € (ausgezahlt, Rate 553,85 €/Monat)
- 21.8.2027: Darlehen 30000 € (ausgezahlt, Rate 553,85 €/Monat)
- 7.9.2027: Darlehen 10000 € (ausgezahlt, Rate 186,89 €/Monat)
- 23.5.2028: Darlehen 70000 € (ausgezahlt, Rate 1.292,32 €/Monat)
- 2.9.2028: Darlehen 30000 € (ausgezahlt, Rate 553,85 €/Monat)
