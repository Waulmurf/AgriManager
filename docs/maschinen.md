# Marken, Händler und Maschinen

> Quelle: Claude Doc „Lohnbetrieb-Simulation – Anforderungen“, Tab „Marken & Maschinen“ (https://claude.ai/artifact/8ixJJZJSEDKsVTwLeKeVeY). Bei Abweichungen gilt das Doc.

## Markenfarben

Nur John Deere veröffentlicht exakte Markenfarben; für die anderen Marken sind die Werte Logofarben oder Lacknäherungen. Die Lackhersteller nennen eigene Farbtöne wie „Claas Saatengrün“ oder „Massey Ferguson Superrot“, aber meist ohne RAL- oder Hex-Wert. Für die Darstellung auf der 2D-Karte reicht diese Genauigkeit.

| Marke | Hauptfarbe | Hex Hauptfarbe | Felgen / Akzent | Hex Akzent | Wie gesichert |
| --- | --- | --- | --- | --- | --- |
| John Deere | Grün | #367C2B | Gelb | #FFDE00 | Offizielle Markenfarben ([Quelle](https://brandpalettes.com/john-deere-colors/)) |
| Fendt | Grün („Nature Green“) | #006225 | Rot (Felgen) | #AF2B1E | Grün = Logofarbe, Fendt nennt keinen RAL-Wert ([Quelle](https://www.terre-net.fr/fendt/article/121481/exclusif-les-tracteurs-fendt-changent-de-couleur-verte)); Felgenrot laut Forum RAL 3000 ([Quelle](https://www.landtreff.de/threads/das-fendt-rot.1831/)) |
| Claas | Saatengrün | #B4C618 | Hellgrau | #D7D7D7 | Grün = Logofarbe ([Quelle](https://www.brandcolorcode.com/claas)); Claas-Hellgrau als RAL 7035 im Lackhandel ([Quelle](https://partao.com/granit-27012047-claas-light-gray-1-l-can.html)) |
| Case IH | Rot | #D0002D | Schwarz | #1A1A1A | Logofarben ([Quelle](https://www.brandcolorcode.com/case-ih)) |
| New Holland | Blau | #003F7D | Gelb | #FECD1A | Logofarben ([Quelle](https://www.brandcolorcode.com/new-holland-agriculture)); Lack ist heller, Wert anpassen |
| Massey Ferguson | Rot | #C71121 | Grau | #606163 | Logofarben ([Quelle](https://www.brandcolorcode.com/massey-ferguson)) |
| Amazone | Grün | offen | Orange | offen | Farbkombination belegt ([Quelle](https://world-agritech.com/2024/11/18/amazone-towards-one-brand-identity)) |
| Rabe | Himmelblau | #2874B2 | Rot (Laufrad) | #AF2B1E | Laut Forum RAL 5015 und RAL 3000 ([Quelle](https://www.landwirt.com/forum/rabe-ral-code-643272)) |

Noch offen und vor der Umsetzung zu klären: Deutz-Fahr, Valtra, Kubota, Krone, Lemken, Horsch, Grimme, Pöttinger, Kverneland, Joskin, Kotte, Zunhammer und Ropa.

**Weitere Gerätemarken** (aus Allgemeinwissen, vor der Grafik anhand von Herstellerfotos prüfen)

| Marke | Hauptfarbe | Akzent | Sicherheit |
| --- | --- | --- | --- |
| Amazone | Grün | Orange | hoch |
| Lemken | Blau | Weiß | hoch |
| Kverneland | Rot | Grau/Schwarz | hoch |
| Pöttinger | Rot | Weiß/Grau | hoch |
| Grimme | Rot | Weiß/Grau | mittel |
| Horsch | Rot | Grau/Schwarz | mittel |
| Väderstad | Gelb | Schwarz/Rot | mittel |
| Joskin | Grün | verzinkt/Grau | mittel |
| Krone | Grün | Rot | unsicher |
| Holmer | Grün | Weiß | unsicher |
| Rauch, Kotte, Zunhammer, Ropa, Krampe, Bauer | offen | offen | anhand Herstellerfotos festlegen |

## Händler

Im Spiel gibt es sechs fiktive Händler an echten Orten. Ihr Markenmix folgt den realen Mustern; echte Firmennamen setzen wir erst ein, wenn die Händlersuchen der Hersteller geprüft sind.

**Reale Muster**

- John Deere bündelt seinen Vertrieb zunehmend bei großen, spezialisierten Händlergruppen ([Quelle](https://www.berliner-zeitung.de/article/schon-wieder-auslaendischer-investor-uebernimmt-john-deere-haendler-im-osten-10267671)). Ein solcher Vertriebspartner ist z. B. LVA, aktiv in Sachsen-Anhalt, Brandenburg und Niedersachsen ([Quelle](https://www.topagrar.com/technik/news/john-deere-vertriebspartner-lva-und-lva-brandenburg-fusionieren-13520797.html)).
- Mehrmarkenhändler führen oft eine Konzernfamilie plus Gerätemarken, z. B. Valtra, Fendt und Massey Ferguson zusammen mit Amazone, Pöttinger und Lemken ([Quelle](https://www.agriaffaires.de/pros/list/1-deutschland/fendt.html)).
- In Uelzen sitzen ein Landtechnik-Standort mit Verkauf und Werkstatt in der Hansestraße ([AGRAVIS Technik](https://www.agravis.de/de/agravis-regional/landtechnik/agravis-technik-raiffeisen/standorte/uelzen)) und ein Grimme-Standort ([Quelle](https://www.agriaffaires.us/pros/list/1-germany_niedersachsen.html)).

**Händler im Spiel (Annahme)**

| Ort | Schleppermarken | Gerätemarken | Vorbild |
| --- | --- | --- | --- |
| Uelzen | Fendt, Massey Ferguson, Valtra | Amazone, Lemken, Pöttinger | Mehrmarkenhändler-Muster |
| Uelzen | – | Grimme (Kartoffel- und Rübentechnik) | Grimme-Standort Uelzen |
| Lüneburg | John Deere | Kverneland, Krone | Großer John-Deere-Vertriebspartner |
| Suhlendorf | Claas | Horsch, Kotte, Zunhammer | Gebrauchte Claas-Schlepper bei einem Landmaschinenhändler in Suhlendorf ([Quelle](https://www.landwirt.com/traktoren/standard-traktoren/claas?page=2)) |
| Salzwedel | Case IH, New Holland | Kverneland, Joskin | Annahme |
| Wittingen | Deutz-Fahr | Rabe, Köckerling | Annahme |

Gebrauchtmaschinen gibt es zusätzlich über einen überregionalen Markt, aber ohne Werkstattservice vor Ort.

## Schlepper

Vier Größenklassen decken alles ab; der Startschlepper mit 200 PS liegt in Klasse M. Die Beispielmodelle stammen aus Nils' LS25-Mod-Ordner (442 Mods, rund 300 Maschinen mit Markenangabe).

| Klasse | PS | Beispiele | Typischer Einsatz |
| --- | --- | --- | --- |
| S | 100–150 | Fendt 300 und 500 Vario, John Deere 6R 110–150, New Holland T6, Valtra N | Hofarbeit, Transport, Pflege |
| M | 150–250 | Fendt 700 Vario, John Deere 6R 175–215, Case IH Puma CVX, New Holland T7, Valtra T und Q | Bodenbearbeitung 4–6 m, Güllefässer bis rund 20 m³, Transport |
| L | 250–400 | Fendt 800 und 900 Vario, John Deere 7R und 8R, New Holland T7 HD | Schwere Bodenbearbeitung 6–8 m, große Güllefässer |
| XL | über 400 | Claas Xerion Saddle Trac | Gülle-Selbstfahrer, Spezialeinsätze |

### Schlepper je Marke

Alle acht Schleppermarken haben echte Baureihen in S, M, L und XL. Bei Massey Ferguson ist das Spitzenmodell um 425 PS noch zu prüfen. PS-Angaben sind Maximalleistungen laut Hersteller oder Fachpresse; einige Baureihen überlappen zwei Klassen.

| Marke | S (100–150 PS) | M (150–250 PS) | L (250–400 PS) | XL (über 400 PS) |
| --- | --- | --- | --- | --- |
| [Fendt](https://www.fendt.com/int/11916) | 300 Vario (113–152) | 500 Vario (144–174), 600 Vario (149–224), 700 Vario (223–303) | 800 Vario (283–343), 900 Vario (296–415) | 1000 Vario (426–550) |
| John Deere | 6M ([bis 281 mit IPM](https://www.topagrar.com/technik/news/john-deere-erweitert-6m-traktorenpalette-nach-oben-20003994.html)) | 6R ([121–275](https://www.reussir.fr/machinisme/john-deere)) | 7R (297–385) | 8R und 8RX ([440–540, Boost bis 634](https://www.auto-motor-und-sport.de/neuheiten/john-deere-8r-traktor-premiere-mit-634-ps-staerkster-standard-traktor-der-welt-vorgestellt/)), 9R |
| [Claas](https://www.claas.com/caas/claas/media/1093450/data/675f60e4f4b536260668996dbce4d08e) | Arion 400 und 500 (90–155) | Arion 600 (125–205), Axion 800 (205–295) | Axion 900 (325–445) | Xerion 4200–5000 (462–530), Xerion 12 (585–653) |
| Case IH | [Maxxum](https://www.topagrar.com/technik/news/neue-maxxum-baureihe-von-case-ih-9241873.html) (115–145 Nenn) | Puma (150–240) | Optum (250–300, neu [bis 435](https://landbrugsavisen.dk/traktortech/ny-stortraktor-laegger-arm-med-magnum-237870)), Magnum | [Steiger und Quadtrac (370–628)](https://caseih.cc.cnh.com/emea/en-gb/products/tractors/maxxum-series/maxxum) |
| New Holland | T6 ([121–175](<https://specs.lectura.de/datasheet-downloads/t6_de(5fe).pdf>)) | T7 SWB und LWB ([180–300 Nenn](<https://www.lectura-specs.com/datasheet-downloads/t7.230-7.245-7.260-7.270-de(0c4).pdf>)) | T7 HD, T8 | T9 ([470–620 mit SmartTrax](https://www.agdealer.com/equipmentcorner/2023-tractor-guide-new-holland-high-horsepower)) |
| Massey Ferguson | 6S ([135–200](https://www.topagrar.com/technik/news/massey-ferguson-praesentiert-neue-baureihen-6s-und-7s-sowie-staerkere-8s-12666733.html)) | 7S (155–220), 8S (bis 305) | 9S (zu prüfen) | 9S-Topmodell um 425 (zu prüfen) |
| Deutz-Fahr | Serie 6 (126–192) | [Serie 7 (bis 247), 8280 TTV (287)](https://www.agropool.ch/static/ams-prod/qTx9CEy0tkKAeqDwnFZjDg) | Serie 9 TTV (295–336) | [Serie 11 TTV (bis 440)](https://www.deutz-fahr.com/media/article_DF_NEWS_DE.pdf) |
| Valtra | [G (105–135)](https://www.topagrar.com/technik/news/neue-valtra-g-serie-im-feldeinsatz-12421271.html), N | T (bis rund 255) | [Q (230–305)](https://www.reussir.fr/bovins-viande/valtra-les-tracteurs-de-la-serie-q-entre-deux-gammes) | [S (z. B. S416 mit 421)](https://www.landwirt.com/marke-valtra?page=2) |

**Preisanker für den Markt (neu oder fast neu, netto)**

| Maschine | Baujahr / Stunden | Preis netto |
| --- | --- | --- |
| [Case IH Puma CVX 175](https://www.landwirt.com/tags/case-ih?page=16) | 2025 / 5 h | 164.900 € |
| [Case IH Maxxum 150](https://www.landwirt.com/tags/case-ih?page=16) | 2023 / 625 h | 149.900 € |
| [Claas Axion 960](https://www.landwirt.com/traktoren/standard-traktoren/claas?page=2) | 2024 / 905 h | ca. 252.000 € |
| [John Deere X9 1100](https://www.landwirt.com/erntetechnik-ackerbau/maehdrescher/modell-w650?page=14) | 2021 / 650 h | 499.000 € |
| [Fendt Ideal 7 PL](https://www.landwirt.com/erntetechnik-ackerbau/maehdrescher/eigenschaften-chx_grp20) | 2025 / 77 h | 339.000 € |
| [Krone BiG X 780](https://www.landwirt.com/gebrauchte/kategorie,1341,13,Feldhaecksler-Deutschland.html) | 2023 / 1.060 h | 398.000 € |
| [Ropa Keiler 2](https://www.landwirt.com/sl/tehnologija-krompirja/drzava-nemcija) | 2024 / 350 h | 199.500 € |

## Anbaugeräte und Erntetechnik

Die Spannen stammen aus den Mods im Ordner und zeigen, welche Größen es je Gerätetyp gibt und welchen Schlepper sie brauchen. Die PS-Werte sind Spielwerte aus dem LS25 und werden vor der Umsetzung mit Herstellerangaben abgeglichen.

| Gerätetyp | Arbeitsbreite / Volumen | PS-Bedarf | Beispiele |
| --- | --- | --- | --- |
| Pflug | 2–3,5 m (4–7 Schare) | 130–220 | Lemken Juwel 8, Kverneland Ecomat |
| Grubber | 3–6 m | 100–300 | Köckerling Trio, Horsch Tiger 6 DT, Horsch Finer 6 SL |
| Kurzscheibenegge | 3–8 m | 95–190 | Horsch Joker 4 CT, Köckerling Rebell 600T, Kverneland Qualidisc 6001T |
| Kreiselegge mit Drille | 3–4 m | 85–195 | Amazone KG 4001 mit Centaya, Rabe |
| Sämaschine gezogen | 3–12 m | 120–300 | Horsch Pronto 3 und 6 DC, Horsch Avatar 12.25 |
| Einzelkornsaat (Mais, Rüben) | 4,5–6,7 m | 150–170 | Amazone Precea 4500, Horsch Maestro, Väderstad Tempo V8, Lemken Azurit 9 |
| Kartoffellegen | 3–6 m | 150–240 | Grimme GL 420 und GL 860, Dewulf Certa |
| Kartoffelroder | 1,5–1,8 m (2-reihig) | 110–200 | Grimme SE 260 und Evo 280, Ropa Keiler 2 |
| Güllefass | 12–32 m³ | 155–350 | Kumm KTR 20000 und 30000, Veenhuis, Samson PG II, Kotte PQ 32.000 |
| Güllezubringer | 22–30 m³ | Sattelzug oder Schlepper | Kotte TSA |
| Schleppschuh / Injektor | 6–30 m | 80–440 | Bomech Multi (18–30 m), Kumm SD 700, Evers Toric, Horsch Tiger 8 MT |
| Düngerstreuer | bis 42 m | – | Amazone ZA-TS und ZA-V, Rauch Axis |
| Feldspritze | 21–36 m | – | Amazone UX, Kverneland iXtrack, John Deere R975i |
| Feldhäcksler | 650–925 PS | selbstfahrend | Fendt Katana, John Deere 9000, Claas Jaguar 900 |
| Maisgebiss | 4,5–9 m | – | Kemper 345 bis 390 Plus |
| Mähdrescher | 255–600 PS | selbstfahrend | John Deere W und S7, New Holland CX5.80, Claas Lexion 8000 |
| Getreideschneidwerk | 4–12,3 m | – | Claas Convio Flex, John Deere 600R, New Holland Varifeed |
| Überladewagen | 25–30 m³ | 250–300 | Hawe ULW 2500 und 3000 |

Rübenroder und Mietenlader fehlen im Mod-Ordner; sie stehen unten bei der Erntetechnik.

### Erntetechnik mit passenden Vorsätzen

Vorsätze passen nur an ihre Grundmaschine: Ein Claas-Häcksler bekommt ein Claas-Orbis-Gebiss, ein John Deere ein Kemper-Gebiss. Im Spiel hat jeder Vorsatz eine Liste kompatibler Grundmaschinen.

**Feldhäcksler und Maisgebisse**

| Marke | Häcksler (PS) | Passende Maisgebisse | Weitere Vorsätze |
| --- | --- | --- | --- |
| Claas | Jaguar 900 (z. B. 940 mit 530 PS bis 990 mit 925 PS), neu [Jaguar 1000 (850–1.100)](https://www.topagrar.com/technik/news/neue-feldhacksler-auf-der-agritechnica-hohere-durchsatze-besser-aufbereiten-20019360.html) | [Orbis 600 (6,04 m)](https://www.topagrar.com/technik/landtechnik/erntemaschinen/jaguar%20940%20+%20pu%20300%20+%20orbis%20600%20sd%20ts/8743817/), Orbis 750 (7,5 m, 10 Reihen); [Orbis 9000 und 10500 nur für Jaguar 1000](https://www.claas.com/en-be/agricultural-machinery/forage-harvesters/orbis-10500-9000) | Pickup PU 300 (3 m) |
| Krone | BiG X 580 bis 1180 (580–1.100), neu BiG X 860 (843) | EasyCollect 600 (8 Reihen), 903 (9 m), [1053 (10,5 m, 14 Reihen)](https://www.landwirt.com/erntetechnik-ackerbau/feldhaecksler/modell-7750?page=6) | Pickup EasyFlow (3 m) |
| John Deere | 8000 und 9000 (z. B. [9900i mit 970 PS](https://www.landwirt.com/gebrauchte/kategorie,1341,81,Feldhaecksler-Bayern.html)), F9 | [Kemper 360 Plus (8 Reihen), 390 Plus (9 m, 12 Reihen), 460–490 Plus](https://www.landwirt.com/it/raccolto-agricolo/testata-di-raccolta/kemper) | Pickup |

**Mähdrescher und Schneidwerke**

| Marke | Mähdrescher (PS) | Schneidwerke |
| --- | --- | --- |
| Claas | Trion (Mittelklasse), Lexion 8000 (Topklasse) | Vario 930 (9,3 m), Convio Flex (7,7–12,3 m), bis 13,8 m |
| John Deere | [T-Serie (305–388)](https://www.landwirt.com/erntetechnik-ackerbau/maehdrescher/modell-1158?page=17), S7, [X9 1100 (700)](https://www.topagrar.com/technik/news/maehdrescher-mittelklasse-holt-auf-topklasse-setzt-einen-drauf-12715927.html) | 600R und HDF bis 12,2 m |
| New Holland | [CX (258–415)](https://www.landwirt.com/erntetechnik-ackerbau/maehdrescher/modell-6335-c?page=6), CR (z. B. CR 9.80 mit 490) | Varifeed, Superflex |
| Fendt | [Ideal 7 (451), Ideal 8 (550)](https://www.landwirt.com/erntetechnik-ackerbau/maehdrescher/eigenschaften-chx_grp20), Ideal 9T (647) | PowerFlow |
| Case IH | Axial-Flow (bis rund 630) | Case-IH-Schneidwerke |

**Kartoffelroder**

| Reihen | Bauart | Modelle |
| --- | --- | --- |
| 1-reihig | gezogen, mit Bunker | [Grimme SE 75-55 und SE 85-55, Ropa Keiler 1](https://www.topagrar.com/technik/landtechnik/kartoffeltechnik/) |
| 2-reihig | gezogen, mit Bunker | [Grimme SE 150-60, Grimme EVO 280 und 290, Ropa Keiler 2](https://www.landwirt.com/en/potato-technology/potato-harvesters?page=2) |
| 4-reihig | selbstfahrend | [Grimme Varitron 470 (435 PS, 7-t-Bunker)](https://www.topagrar.com/technik/news/grimme-varitron-470-platinum-terra-trac-der-neue-vierreihige-kartoffelroder-9374482.html) |

**Zuckerrüben**

| Aufgabe | Modelle |
| --- | --- |
| Rübenroder (6-reihig, selbstfahrend) | [Ropa Tiger 6S und Panther 2S, Holmer Terra Dos T4-40, Grimme Rexor](https://www.agriexpo.online/de/landwirtschaftlich-hersteller/erntemaschine-8-reihen-11575.html); neue Generationen [Holmer Terra Dos 5](https://www.topagrar.com/technik/news/holmer-praesentiert-neuen-terra-dos-5-ruebenroder-und-terra-variant-650-trac-13508726.html) und Grimme Rexor 6200/6300 |
| Mietenlader (Reinigungslader) | [Ropa Maus 6 (12-m³-Ladekorb)](https://www.topagrar.com/technik/news/die-neue-ropa-bunkermaus-6-20001457.html), [Holmer Terra Felis 3 evo](https://www.agriexpo.online/de/landwirtschaftlich-hersteller/reinigungslader-eigenantrieb-1923.html) |

## Weitere Geräte aus der Recherche

Preise sind netto, sofern nicht anders vermerkt. Hersteller veröffentlichen kaum Listenpreise; die Werte stammen aus Händler-, Vorführ- und Gebrauchtangeboten und dienen als Preisanker für die Wertformel. „offen“ heißt: noch nicht recherchiert.

### Düngerstreuer

| Marke | Modell | Arbeitsbreite | Behälter | Antrieb | Teilbreiten | Waage | Preisanker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Rauch | Axis-M 30.2 EMC (V8 / VariSpread pro) | 12–42 m | 1.400 l, 3.200 kg Nutzlast | Zapfwelle, EMC-Regelung | V8: 8 manuell; VariSpread pro: stufenlos | +W-Variante | Bj. 2021 (EMC+W, VS pro): 21.000 € brutto |
| Rauch | Axis-H 30.2 / 50.2 EMC | 12–42 m (30.2) | 1.400 l | hydraulisch | VariSpread pro | +W | offen |
| Amazone | ZA-TS (Anbau) | 15–54 m | 1.400–4.200 l | mechanisch oder hydraulisch, bis 650 kg/min | mechanisch 8–16; hydraulisch mit GPS bis 128 | Profis-Wiegerahmen | offen |
| Amazone | ZG-TS (gezogen) | 15–54 m | bis 10.000 l | gezogen | bis 128 | ja | offen |
| Amazone | ZA-TS 01 AutoSpread | 15–54 m | 4.200–5.000 l | hydraulisch | 128, regelt Streubild selbst | ja | offen |
| Kuhn | Axis 40.2 / 50.2 (M/H-EMC-W) | 12–50 m | 1.000–4.200 l | Zapfwelle oder hydraulisch | VariSpread 8; VariSpread Pro stufenlos | ja | offen |
| Bogballe | M60W plus | 10–42 m | bis 5.550 l | Zapfwelle | Section Control; „Dynamic“ gleitend (8 × 5 Sektionen) | serienmäßig | offen |
| Kverneland | Exacta Geospread | bis ca. 42 m | offen | – | GPS, 1-m-Sektoren | ja | offen |

Kleine Betriebe fahren meist 18 m mit rund 1.400 l im Dreipunkt. Lohnunternehmer fahren 30–42 m mit 3.000–4.200 l und Waage. Großflächenstreuer (6 t) rechnet die LWK nach Menge ab: 1,85 €/dt, 47,5 dt/h.

### Güllefässer und Selbstfahrer

| Marke | Modell | Volumen | Pumpe / Leistung | Ausbringtechnik | Preisanker |
| --- | --- | --- | --- | --- | --- |
| Vakutec | VA 7300 | 7,3 m³ | Vakuum, Einachser | – | neu 27.990 € brutto (AT) |
| Joskin | Alpina 2 7100 S | 7,1 m³ | Garda | Schleppschuh 7,5 m optional | 43.553 € brutto (AT) |
| Kotte | Garant VT 13900/5 | 13,9 m³ | Vakuum, Tandem | – | neu 109.896 € brutto (AT) |
| Joskin | Volumetra 16500 D | 16,5 m³ | Drehkolben | – | neu 139.000 € |
| Joskin | Volumetra 18500 D | 18,5 m³, 24 t zGG | – | – | Bj. 2017: 69.900 € |
| Zunhammer | SKE 18,5 PU Eco + Bomech Multi 15 | 18,5 m³ | Drehkolben | Schleppschuh 15 m | 86.885 € |
| Zunhammer | SKE 18,5 (20) PU | 20 m³ | 5.430 l/min | Schleppschlauch 18 m, ISOBUS, NIR-Sensor | Bj. 2025: 212.000 € |
| Joskin | Quadra 20000 TS + Penditwist 18 m | 20 m³ | Vakuum | Schleppschlauch 18 m | Bj. 2014: 64.500 € |
| Holmer | Terra Variant 600 (Selbstfahrer) | 21 m³ | ca. 600 PS, 9.000–9.800 l/min | Wechselaufbauten (Schleppschlauch, Injektor) | Bj. 2014, 14.600 h: 125.000 €; Bj. 2019, 1.660 h: 215.000 € |

### Gülle-Verteiltechnik

| Marke | Typ | Arbeitsbreite | Schläuche / Abstand | Teilbreiten |
| --- | --- | --- | --- | --- |
| Vogelsang | SwingUp (Schleppschlauch) | 7,5–18 m | – | CFC: halbseitig |
| Vogelsang | SwingMax 36 | 36 m, Klappstufen 18–33 m | 120 Schläuche, 30 cm | 3 Gruppen à 12 m per Luftbalg |
| Vogelsang | ExaCut-Gestänge (DLG-Test) | 27 m | 96 Schläuche | Querverteilung ±8 % |
| Vogelsang | BlackBird (Schleppschuh) | 12 / 15 m | 25 cm | – |
| Kotte / Vogelsang / Bomech | Schleppschuh | 7,5–30 m | 22,5–31,25 cm | pneumatisch, Basis für Section Control |
| Kotte / Vogelsang | Schleppschlauch | 7,5–36 m | 25–34 cm | CFC optional |

LWK-Kosten: Vakuumfass 8 m³ 75 €/h, je weiterem m³ +3,30 €/h; Schleppschuh, Schlitzgerät und Güllegrubber je 1,0 ha/h; Zubringer 20–25 m³ 85–107 €/h.

### Feldspritzen

| Marke | Modell | Arbeitsbreite | Tank | Leistung | Teilbreiten | Preisanker |
| --- | --- | --- | --- | --- | --- | --- |
| Amazone | Pantera 4504 (Selbstfahrer) | 21–40 m | 4.500 l | 218 PS, 50 km/h | 7–9; AmaSwitch/AmaSelect 50-cm-Einzeldüse | offen |
| Horsch Leeb | LT (gezogen) | 18–45 m | 4.000–6.000 l | Pumpe 400–600 l/min | 6–42; Einzeldüse optional | 5 LT Bj. 2020, 36 m: 105.000 €; 6 LT: 125.000 € |
| Horsch Leeb | 8 GS (gezogen) | bis über 30 m | 8.000 l | – | – | 119.900 € |
| Typ | Anbauspritze (Durchschnitt) | 17 m | 1.650 l | ab ca. 80 PS | – | – |

LWK-Flächenleistung: Anbauspritze 3,5 ha/h, Anhängespritze 5,0–6,5 ha/h. RTK-Teilbreiten bzw. Einzeldüse: +2,50 €/ha. Offen: Fendt Rogator, John Deere R-Serie, Kverneland iXtrack, Lemken Vega, Dammann.

### Bodenbearbeitung

| Typ | Modell | Arbeitsbreite | PS-Bedarf | Preisanker | Flächenleistung (LWK) |
| --- | --- | --- | --- | --- | --- |
| Drehpflug 5-Schar | Lemken Juwel 8 M V 5 N 100 | 1,5–2,75 m | 130–200 PS | neu 34.400–34.800 €; Bj. 2014: 19.500 € | 1,04 ha/h |
| Drehpflug 4-Schar | Amazone Cayros M 1020 | ca. 1,6–1,8 m | ca. 100–150 PS | Bj. 2023: 18.200 € brutto (AT) | 0,80 ha/h |
| Kurzscheibenegge | 3 m / 5 m aufgesattelt | 3 / 5 m | offen | offen | 2,0 / 3,2 ha/h |
| Stoppelgrubber | 5–20 cm Tiefe | 3–4 m | offen | offen | 1,49–1,89 ha/h |
| Flachgrubber | 5 m aufgesattelt | 5 m | offen | offen | 3,0–3,2 ha/h |
| Kreiselegge | 3 m | 3 m | offen | offen | 1,35 ha/h |
| Tiefenlockerer | 6 Zinken | 3 m | offen | offen | 1,37 ha/h |

### Sätechnik

| Marke | Modell | Reihen / Breite | PS-Bedarf | Teilbreiten | Preisanker |
| --- | --- | --- | --- | --- | --- |
| Väderstad | Tempo T 6 / T 7 | 6–7 Reihen, 2,70–4,50 m | ab ca. 100 PS | Einzelreihe | offen |
| Väderstad | Tempo V 6–12 | 6–12 Reihen, 45–80 cm | 100–180 PS | automatische Einzelreihe | offen |
| Väderstad | Tempo R 12–18 / L 24 | 12–24 Reihen | 150–350 PS | Einzelreihe | offen |
| Grimme | GL 410 (Kartoffel) | 4-reihig, 75 cm | ab 70 PS | – | offen |
| Grimme | GL 420 / Exacta | 4-reihig | Exacta ab 140 PS | Reihenabschaltung, Section Control als Lizenz | GL 420 + Lemken Zirkon 12, Vorführer 2023: 93.400 € |
| Grimme | GL 430 | 4-reihig, 3,5 t Bunker | ab ca. 147 PS | Reihenabschaltung | offen |

LWK-Flächenleistung: Kreiselegge + Drille 3 m 1,1–1,2 ha/h; Mulchsaat 3 m 2,0 ha/h; Direktsaat 3 m 1,5 ha/h; Rüben 12-reihig 2,0 ha/h; Mais 6-reihig 1,67 ha/h, 8-reihig 2,5 ha/h; Kartoffeln 4-reihig 0,91–1,0 ha/h. Offen: Drillmaschinen (Amazone Cirrus/Centaya, Horsch Pronto/Avatar, Lemken Solitair, Pöttinger Terrasem), 2- und 6-reihige Legemaschinen, Mais-Einzelkorn von Amazone und Kverneland.

### Transport

| Marke | Modell | Volumen | zGG | PS-Bedarf | Preisanker |
| --- | --- | --- | --- | --- | --- |
| Krampe | BigBody 460 | 15,7–21,8 m³ | 16 t | offen | offen |
| Krampe | BigBody 640 | 21,9–36,2 m³ | 22 t | offen | offen |
| Krampe | BigBody 750 / 750 S | 25,3–41,8 m³ | 24 t | offen | 750 S Bj. 2022: 48.000 €; neu 2026: 54.000 € |
| Krampe | Bandit 750.2 (Rollband) | 25,9–39,4 m³ | 24 t | ab 180 PS | gebraucht 39.500 € |
| Krampe | Bandit 980.2 (Tridem) | 33,7–51,3 m³ | 31–34 t | 200 PS | offen |
| Krampe | AS 750.3 (Abschiebewagen) | 44 m³ | 24 t | offen | Bj. 2024: 66.583 € |
| Krone | ZX 430 GD (Lade-/Häckselwagen) | 43 m³ | ca. 20 t | offen | Bj. 2024: 149.500 €; Bj. 2021, 2.930 h: 77.900 € |

Drehschemel-Kipper (Zug mit zwei Anhängern möglich): Fliegl ZDK 180 und Krampe Zweiachs-Dreiseitenkipper, 18 t zGG, rund 13 t Nutzlast, 34.000–36.000 € (Annahme, Modellbezeichnungen vereinfacht). Mulden, Tandem-/Tridemkipper und Häckselwagen lassen sich nicht koppeln.
LWK: Dreiachs-Dreiseitenkipper 18 t 94,50 €/h, Muldenkipper 10 t 74,50 €/h. Offen: Kröger, Fliegl, Annaburger, Brantner, Joskin-Kipper, Überladewagen, Ladewagen anderer Marken.

### Hof- und Silotechnik

| Marke | Modell | Leistung | Hubkraft | Hubhöhe | Preisanker |
| --- | --- | --- | --- | --- | --- |
| Merlo | TF42.7 | 116 / 136 PS | 4.200 kg | ca. 7,0–7,4 m | offen |
| JCB | 542-70 Agri bis Agri Pro | 109–173 PS | 4.200 kg | 7,01 m | offen |
| Claas | Scorpion 741 VariPower | 136–143 PS | 4.100 kg | 6,93 m | Bj. 2022, 1.900 h: 86.000 €; 220 h: 117.900 € |
| Manitou | MLT 737-130 PS+ | 129 PS | 3.700 kg | 6,90 m | offen |
| Volvo | L70H (Radlader) | ca. 170 PS | ca. 8.700 kg Kipplast | Schaufel 1,8–6,4 m³ | offen |
| Volvo | L90H (Radlader) | 184 PS | ca. 10.100 kg Kipplast | Schaufel 2,2–7,0 m³ | offen |
| Liebherr | L 538 / L 550 XPower | offen | 9.500 / ca. 12.300 kg Kipplast | Schaufel 2,6–3,4 m³ | offen |
| Kramer | 8115 (Hoflader) | 75–101 PS | 2.900 kg Nutzlast | 3,20 m | offen |
| Weidemann | 4080 / 4080 T | 75 / 102 PS | 3.270 kg | 3,6 / 5,2 m | 4080 T gebraucht: 63.000 € |

LWK-Silosätze: Silageverteiler 49–53 €/h; Walzschlepper 241–260 PS 88,50 €/h ohne Fahrer; Teleskoplader 3,5 t 39 €/h.

### Grünland und Futterernte

| Marke | Modell | Arbeitsbreite / Format | PS-Bedarf | Preisanker | Flächenleistung |
| --- | --- | --- | --- | --- | --- |
| Pöttinger | Novacat A10 + Frontmähwerk | 8,8–10 m | ca. 180 PS | Bj. 2021: 31.750 € | bis 12 ha/h (Hersteller) |
| Typ | Front-Heck-Kombination 6 m | 6 m | offen | – | 3–4 ha/h |
| Claas | Liner 4900 Business | 10,1–15 m | ca. 140–200 PS | Bj. 2023: 75.630 € | 5–7 ha/h |
| Typ | Kreiselheuer 8,5 m | 8,5 m | offen | – | 3,5–4,5 ha/h |
| Krone | Comprima V150 XC (Rundballen) | bis 1,50 m | offen | Bj. 2024: 52.417 € | 18–24 Ballen/h |
| Krone | BiG Pack 1290 HDP | 120 × 90 cm | ab ca. 177 PS | Bj. 2020: 139.900 €; Bj. 2013: 54.500 € | 30–50 Ballen/h |
| Typ | Rundballenwickler | – | – | 8,50–10 €/Ballen inkl. Folie | 45–50 Ballen/h |

### Rüben- und Kartoffeltechnik ergänzend

| Typ | Modell | Reihen | Preisanker / Kosten | Flächenleistung |
| --- | --- | --- | --- | --- |
| Rübenroder Selbstfahrer | Grimme Rexor 6300 Platinum | 6 | Bj. 2021: 290.000–325.000 €; Bj. 2023, 1.365 h: 435.000 €; Gen. III: 510.000 € | 0,83–1,0 ha/h |
| Krautschläger | Typ | 4 | 73,50 €/h | 1,0 ha/h |
| Dammformer | Typ | 4 | 62 €/h | 1,1 ha/h |
| Bunkerroder gezogen | Typ | 2 | 421–465 €/ha | 0,30–0,40 ha/h |
| Bunkerroder Selbstfahrer | Typ | 4 | 484–524 €/ha | 0,93–1,10 ha/h |

Offen: gezogene Rübenroder (Grimme Rootster), Mietenlader (Ropa Maus, Holmer Terra Felis), Separatoren.

### Beregnung

Im Raum Uelzen wichtig, da viele Betriebe beregnen.

| Marke | Modell | Rohr | Durchsatz | Streifenbreite | Preisanker |
| --- | --- | --- | --- | --- | --- |
| Bauer | Rainstar T61 85-450 | 85 mm / 450 m | 14–44 m³/h | 53–76 m | offen |
| Bauer | Rainstar T61 90-390 bis 450 | 90 mm / 390–450 m | 17–55 m³/h | 55–83 m | offen |
| Bauer | Rainstar T61 100-300 bis 350 | 100 mm / 300–350 m | 17–73 m³/h | 55–90 m | neu 2025: 29.800 €; Bj. 2013: 11.000 € |
| Bauer | Rainstar E200 / E21 110-420 | 110 mm / 420 m | offen | offen | 38.300–39.900 € |

LWK-Kostenbeispiel: Brunnen 50 m³/h, E-Pumpe, 1 km Zuleitung, 500-m-Trommel. 7,5 ha mit 30 mm brauchen 45 h und kosten 1.688 €, also 225 €/ha oder 7,50 €/mm. Offen: Kreis- und Linearregner (Bauer Centerliner, Valley), weitere Marken (Beinlich, Irtec, Ocmis).

## Quellen

- Nils' LS25-Mod-Ordner (`FarmingSimulator2025\mods`), ausgewertet am 04.11.2026: Marken, Modelle, PS, Arbeitsbreiten, Volumen und Spielmechaniken
- [John Deere Farbcodes](https://brandpalettes.com/john-deere-colors/)
- [Fendt „Nature Green“](https://www.terre-net.fr/fendt/article/121481/exclusif-les-tracteurs-fendt-changent-de-couleur-verte) und [Fendt-Felgenrot im Forum](https://www.landtreff.de/threads/das-fendt-rot.1831/)
- Logofarben von [Claas](https://www.brandcolorcode.com/claas), [Case IH](https://www.brandcolorcode.com/case-ih), [New Holland](https://www.brandcolorcode.com/new-holland-agriculture) und [Massey Ferguson](https://www.brandcolorcode.com/massey-ferguson)
- [Claas Hellgrau RAL 7035](https://partao.com/granit-27012047-claas-light-gray-1-l-can.html)
- [Amazone grün-orange](https://world-agritech.com/2024/11/18/amazone-towards-one-brand-identity)
- [Rabe RAL-Farben im Forum](https://www.landwirt.com/forum/rabe-ral-code-643272)
- [John-Deere-Händlerkonzentration](https://www.berliner-zeitung.de/article/schon-wieder-auslaendischer-investor-uebernimmt-john-deere-haendler-im-osten-10267671) und [LVA-Fusion](https://www.topagrar.com/technik/news/john-deere-vertriebspartner-lva-und-lva-brandenburg-fusionieren-13520797.html)
- [Landmaschinenhändler-Verzeichnis Agriaffaires](https://www.agriaffaires.de/pros/list/1-deutschland/fendt.html)
- [AGRAVIS Technik Uelzen](https://www.agravis.de/de/agravis-regional/landtechnik/agravis-technik-raiffeisen/standorte/uelzen)

**Quellen Geräte-Recherche**

- [LWK NRW / RLV: Erfahrungssätze 2026](https://www.landwirtschaftskammer.de/landwirtschaft/beratung/pdf/erfahrungssaetze-rh.pdf)
- [top agrar: Wie viele Teilbreiten braucht man?](https://www.topagrar.com/technik/news/teilbreitenschaltung-wie-viele-teilbreiten-braucht-man-eigentlich-12082420.html)
- [Rauch: Tipps und Tricks](https://rauch.de/aktuelles/tipps-tricks.html)
- [Amazone ZA-TS Prospekt](https://mueller-landtechnik.de/wp-content/uploads/2021/09/amazone_za-ts_duengerstreuer.pdf)
- [Bogballe M60W plus](https://www.bogballe.com/fertiliser-spreaders/models/m60w-plus/specifications/)
- [top agrar: 36-m-Schleppschlauch von Vogelsang](https://www.topagrar.com/technik/news/36-m-schleppschlauch-von-vogelsang-9233177.html)
- [DLG-Prüfbericht 5354F (Vogelsang ExaCut)](https://pruefberichte.dlg.org/filestorage/pbdocs/5354F.pdf)
- [Garant-Kotte Applikationstechnik](https://www.garant-kotte.de/produkt/applikationstechnik/schleppschlauchverteiler/)
- [Amazone Pantera 4504](https://amazone.de/de-de/produkte-digitale-loesungen/landtechnik/pflanzenschutztechnik/selbstfahrende-feldspritze/selbstfahrende-feldspritze-pantera-4503-75904/selbstfahrende-feldspritze-pantera-4504-75868)
- [Horsch Leeb Prospekt](https://cdn.horsch.com/celum/370_original.pdf)
- [profi: Praxistest Lemken Juwel 8](https://www.profi.de/test/praxistest/pflug-lemken-juwel-8i-pflugen-mit-i-30179.html)
- [Väderstad Tempo V](https://www.vaderstadverken.com/de/einzelkorntechnik/tempo-planter/tempo-v)
- [Grimme GL 420](https://grimme.com/de/producttypes/legetechnik/gl-420)
- [Krampe Muldenkipper](https://www.krampe.de/de/produkte/muldenkipper)
- [Merlo TF42.7](https://www.merlo.de/teleskoplader/standard/42-7/)
- [BayWa: Bauer Rainstar T61](https://www.baywa.de/de/pflanzenbau/bewaesserung/ueberkopfbewaesserung/regenmaschinen/regenmaschinen/bauer-regenmaschine-rainstar-t-/e-000000000010314709/)
- [traktorpool: Grimme Rübentechnik gebraucht](https://www.traktorpool.de/gebraucht/a-Erntemaschinen/6/b-Ruebenerntetechnik/7/c-Grimme/7/)
