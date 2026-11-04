# Lohnbetrieb-Simulation – Anforderungen

Stand: 4. Nov. 2026 · Nils

> Quelle: Claude Doc „Lohnbetrieb-Simulation – Anforderungen“, Tab „Tab 1“ (https://claude.ai/artifact/8ixJJZJSEDKsVTwLeKeVeY). Bei Abweichungen gilt das Doc.

## Ziel und Rahmen

Wir bauen ein Managementspiel, in dem der Spieler ein Agrar-Lohnunternehmen in Groß Thondorf aufbaut – klein, mit einem Schlepper und Startkapital, als Endlos-Sandbox. Spielgebiet ist ein 50-km-Radius um 29584 auf einer echten Karte.

- **Spielertyp:** Der Spieler ist Chef: Er besucht Kunden mit dem Firmenwagen, nimmt Aufträge an und teilt Fahrer und Maschinen ein. Zu Beginn und wenn es eng wird, arbeitet er selbst als Fahrer mit.
- **Kern-Schleife:** Kunden besuchen → Anfrage prüfen und als Auftrag anlegen → Maschine und Fahrer zuweisen → Anfahrt und Arbeit laufen sichtbar auf der Karte → Abrechnung → Geld in Fuhrpark und Personal investieren.
- **Anspruch:** Arbeitszeiten, Kosten und Preise beruhen auf realen Daten und Regeln (siehe Datengrundlage).
- **Rollen:** Nils liefert die Anforderungen und gibt sie frei. Claude schreibt und testet den Code.

## Technik und Entwicklungsumgebung

Das Spiel wird eine Desktop-Anwendung auf Web-Technik für **Windows und macOS**, auch nativ auf Apple Silicon (M1 Pro). Eine Spiele-Engine wie Unity, Godot oder Unreal brauchen wir nicht: Der Kern sind Karte, Planungstafel, Tabellen und ein Rechenmodell. Geminis Architekturvorschlag deckt sich weitgehend mit unserem Plan. Wir übernehmen ihn und schärfen ihn an den markierten Stellen nach.

| Thema | Festlegung | Gegenüber Gemini |
| --- | --- | --- |
| Programmgerüst | Tauri 2 (Rust). Windows als .exe/.msi, macOS als .dmg mit Universal-Build (arm64 und x86\_64), läuft nativ auf M1 Pro | Wie Gemini. Ergänzt: Mac-Version signiert und notarisiert, sonst blockiert macOS den Start |
| Oberfläche | TypeScript, React 19, Vite | Wie Gemini |
| Karte | MapLibre GL JS mit WebGL2, 2D | Wie Gemini. Ergänzt: Tauri nutzt auf dem Mac WKWebView (Safari-Technik), auf Windows WebView2 (Chromium). Karte und Grafik werden ab dem ersten Prototyp auf beiden Systemen geprüft |
| Kartendaten | Eine PMTiles-Datei der Region (50 km um 29584), lokal per Byte-Range gelesen, ohne Tile-Server | Wie Gemini. Ergänzt: eigenes Tauri-Protokoll für Range-Requests mit eigenem Test; Schriften und Kartensymbole ebenfalls lokal. PMTiles nur für die Grundkarte |
| Spielobjekte auf der Karte | Felder (Feldblöcke), Hofstellen, Händler und Standorte als eigene Geodaten mit festen IDs, getrennt von der Grundkarte | Neu |
| Fahrzeuge auf der Karte | Simulation schickt Positionen 4- bis 10-mal pro Sekunde als kompaktes Zahlenfeld (Transferable) an die Oberfläche; dort werden sie flüssig interpoliert und als Symbol-Layer gezeichnet. Bei sehr vielen Fahrzeugen deck.gl als Option | Neu |
| Simulation | Web Worker mit festem Zeitschritt (1 Spielminute), deterministisch mit Zufalls-Seed. 100x bedeutet mehr Schritte pro Sekunde, nicht gröbere Schritte | Gemini: Worker. Ergänzt: Determinismus, damit Tests und Fehler reproduzierbar sind und 1x und 100x dasselbe Ergebnis liefern |
| Routing | Straßengraph vorab aus OpenStreetMap berechnet: Straßentypen, Gewichts- und Breitenbeschränkungen für Landmaschinen, Feldzufahrten. Im Spiel A\*-Suche mit Routen-Cache | Ergänzt: Vorberechnung beim Bauen statt im Spiel; Rust oder WASM nur, wenn Messungen es verlangen |
| Datenhaltung | SQLite über das Tauri-SQL-Plugin: eine Datei je Spielstand mit Buchhaltung, Kundenakten, Maschinenlebenslauf und Historie. Autosave, Schema-Versionen mit Migration | Gemini: JSON oder SQLite. Wir legen uns auf SQLite fest, weil die Historie über Jahre wächst und auswertbar bleiben soll |
| Stammdaten | Maschinenkatalog, KTBL- und LWK-Sätze, Preise und DWD-Wetter als versionierte Dateien im Repo, beim Bauen auf Plausibilität geprüft | Neu |
| Code und Builds | GitHub-Repo; GitHub Actions baut bei jedem Stand eine Windows- und eine Mac-Version und führt alle Tests aus | Neu |
| Tests | Vitest für das Rechenmodell, Playwright für Oberflächen-Screenshots, Leistungstest „100x mit 30 Fahrzeugen bleibt flüssig“ | Konkretisiert |
| Arbeitsweise | Claude entwickelt autonom: plant, baut, testet und dokumentiert selbst und meldet Zwischenstände. Nils gibt Anforderungen und prüft Ergebnisse | Neu |

Warum so: Web-Technik ist stark bei Karten, Tabellen und Menüs, Claude kann alles selbst bauen und testen, und Tauri macht daraus schlanke Programme für Windows und Mac mit Dateizugriff. Die größten Risiken sind die zwei unterschiedlichen Browser-Engines und die Leistung bei 100x. Deshalb prüfen wir beides im ersten Prototyp, bevor Spielinhalte entstehen.

## Realistische Datengrundlage

Zeiten, Kosten und Preise kommen aus etablierten Quellen der Landwirtschaft. Die genauen Datensätze und Lizenzen prüft Claude vor dem Einbau.

| Bereich | Grundlage | Verwendung im Spiel |
| --- | --- | --- |
| Karte und Wege | OpenStreetMap | Straßennetz und Orte von Lüneburg über Uelzen und Wittingen bis Dannenberg und Salzwedel; Fahrzeiten mit 40 bzw. 60 km/h |
| Elbe | OpenStreetMap | Echtes Hindernis: Übergang nur per Fähre oder über die Brücken bei Lauenburg und Dömitz |
| Felder | Offene Geodaten (Feldblöcke, wo verfügbar) | Reale Feldformen und -größen; Betriebe darauf sind ausgedacht |
| Leistung und Zeitbedarf | KTBL-Daten | ha/h je Arbeitsgang und Maschine, Rüstzeiten, Diesel je ha |
| Auftragspreise | Verrechnungssätze der Maschinenringe, übliche Lohnunternehmer-Preise | Startniveau der Preise je Dienstleistung |
| Maschinenpreise | Reale Listen- und Gebrauchtpreise als Anhaltspunkt | Neu- und Gebrauchtmarkt |
| Regionale Kulturen | Kartoffeln, Zuckerrüben (Nordzucker Uelzen, Rübenkampagne), Mais für Biogas, Getreide, Beregnung | Auftragslage im Jahreslauf |
| Wetter | Historische Wetterjahre des Deutschen Wetterdienstes, Stationen aus der Region | Wann gedroschen, gehäckselt oder gefahren werden darf |
| Regeln | Düngeverordnung, Arbeitszeitgesetz | Sperrfristen für Gülle, Höchstarbeits- und Ruhezeiten |

## Spielablauf und Darstellung

| ID | Anforderung |
| --- | --- |
| SA-01 | Das Spiel ist ein Managementspiel mit 2D-Karte, keine 3D-Grafik. |
| SA-02 | Fahrzeuge sind auf der Karte sichtbar: Sie fahren auf echten Straßen zum Feld und arbeiten sichtbar auf dem Feld. |
| SA-03 | Die Zeit läuft durchgehend, mit Pause und den Geschwindigkeiten 1x, 10x und 100x. |
| SA-04 | Der Spieler ist Chef: Er nimmt Aufträge an und teilt Fahrer und Maschinen ein. Er kann sich auch selbst als Fahrer einplanen (siehe Kundenkontakt und eigene Mitarbeit). Gesteuert wird über die Planung, nicht durch Selbstfahren. |
| SA-05 | Der Hof liegt in Groß Thondorf. Spielgebiet ist der 50-km-Radius um 29584. |
| SA-06 | Spielstart: ein gebrauchter 200-PS-Schlepper, Startkapital und Kreditrahmen (siehe Startbedingungen). |
| SA-07 | Das Spiel ist eine Endlos-Sandbox ohne festes Spielende. |
| SA-08 | Eine Planungstafel zeigt, welcher Fahrer und welche Maschine wann wo eingeplant sind. |
| SA-09 | Die Oberfläche ist auf Deutsch. |

## Aufträge und Kunden

| ID | Anforderung |
| --- | --- |
| AK-01 | Dienstleistungen zum Start: Maishäckseln, Mähdrusch, Gülle/Gärrest ausbringen, Rüben roden, Kartoffeln legen und roden, Bodenbearbeitung, Saat. |
| AK-02 | Kunden sind ausgedachte Betriebe auf realen Feldern im Spielgebiet. |
| AK-03 | Nicht jeder Betrieb nimmt jede Dienstleistung: Jeder Betrieb hat eigene Kulturen, eigene Technik und damit einen eigenen Bedarf. |
| AK-04 | Der Bedarf folgt dem Jahreslauf (z. B. Gülle nach Ende der Sperrfrist, Drusch im Sommer, Maishäckseln und Rübenkampagne im Herbst). |
| AK-05 | Ein Auftrag nennt Kunde, Feld(er), Fläche, Dienstleistung, Zeitfenster und Preis. |
| AK-06 | Der Spieler kann Aufträge annehmen, ablehnen und den Preis verhandeln. |
| AK-07 | Die Arbeitsdauer ergibt sich aus Fläche, Maschinenleistung, Feldform, Anfahrt und Wetter. |
| AK-08 | Kunden haben eine Zufriedenheit: Pünktlichkeit, Qualität und Preis wirken darauf. Zufriedene Kunden werden Stammkunden. |
| AK-09 | Nach Abschluss wird automatisch eine Rechnung erstellt. |

## Kundenkontakt, Nachrichten und eigene Mitarbeit

Kunden muss man sich erarbeiten: Erst nach einem Besuch auf dem Hof ist ein Landwirt im Adressbuch und per Nachricht oder Anruf erreichbar. Jede Anfrage wird im Auftragssystem geprüft, bevor sie ein Auftrag wird.

**Besuche und Firmenwagen**

| ID | Anforderung |
| --- | --- |
| KK-01 | Den ersten Kontakt zu einem Betrieb gibt es nur durch einen Besuch: Der Spieler fährt mit dem Firmenwagen auf echten Straßen zum Hof. Danach steht der Landwirt im Adressbuch. |
| KK-02 | Firmenwagen (z. B. Pkw, Pickup, Servicewagen) werden gekauft oder geleast und verursachen Kosten für Kraftstoff, Versicherung und Verschleiß. |
| KK-03 | Der Firmenwagen bringt auch Fahrer zu ihren Maschinen oder holt sie ab, z. B. beim Fahrerwechsel auf dem Feld. |
| KK-04 | Beim Besuch oder Anruf öffnet sich ein Interaktionsmenü: fragen, ob etwas ansteht; Leistungen und Preise vorstellen; Felder ansehen; Rechnungen oder Reklamationen besprechen; nach Pachtflächen fragen; Beziehung pflegen. |
| KK-05 | Das Interaktionsmenü bietet je nach Beziehung und Jahreszeit passende Optionen; Besuche kosten Zeit, bringen aber mehr als Nachrichten. |

**Nachrichten und Anfragen**

| ID | Anforderung |
| --- | --- |
| KK-06 | Ein Smartphone im Spiel bündelt Messenger (WhatsApp-ähnlich), SMS und Anrufe. |
| KK-07 | Landwirte melden sich von selbst mit Anfragen, oft ungenau („Kannst du nächste Woche bei mir häckseln?“). Fehlende Angaben wie Feld, Fläche oder Termin muss der Spieler nachfragen. |
| KK-08 | Jede Anfrage landet zuerst als Anfrage im Auftragssystem. Erst nach Prüfung von Maschine, Fahrer, Termin und Preis wird sie als Auftrag angelegt und dem Kunden bestätigt oder abgesagt. |
| KK-09 | Anrufe kommen in Spielzeit, auch zu ungünstigen Zeiten. Verpasste Anrufe landen auf der Mailbox; die Antwortzeit wirkt auf die Kundenzufriedenheit. |
| KK-10 | Landwirte haben Vorlieben: Manche rufen nur an, andere schreiben lieber. |
| KK-11 | Mitarbeiter melden sich ebenfalls, z. B. bei Krankheit, Panne oder fertigem Auftrag. |
| KK-12 | Zu jedem Kunden gibt es eine Kundenakte mit Nachrichtenverlauf, Feldern, Aufträgen, Preisen und Notizen. |

**Eigene Mitarbeit des Chefs**

| ID | Anforderung |
| --- | --- |
| KK-13 | Der Spieler hat eigene Skills wie ein Mitarbeiter und kann sich in der Planungstafel selbst als Fahrer einplanen. |
| KK-14 | Solange er selbst einen Auftrag fährt, ist er nicht im Büro und nur per Telefon und Nachricht erreichbar. Unterwegs kann er Anfragen entgegennehmen und einfache Zusagen unter Vorbehalt machen; Aufträge anlegen, umplanen, einkaufen und Kunden besuchen geht erst wieder im Büro. |
| KK-15 | Auch für den Chef gelten Arbeits- und Ruhezeiten; er kostet keinen Lohn, aber seine Zeit fehlt bei Kundenpflege und Planung. |

## Maschinen und Fuhrpark

| ID | Anforderung |
| --- | --- |
| MF-01 | Maschinen gibt es in Größenklassen: Schlepper nach PS, Geräte nach Arbeitsbreite, Fässer und Wagen nach Füllvolumen, Erntemaschinen nach Leistung. |
| MF-02 | Die Größenklasse bestimmt Flächenleistung, Dieselverbrauch, Preis und Straßentempo. |
| MF-03 | Geräte brauchen einen passenden Schlepper (PS-Bedarf). |
| MF-04 | Kauf neu und gebraucht; Verkauf und Inzahlungnahme. Gebrauchtpreise hängen von Alter, Betriebsstunden und Zustand ab. |
| MF-05 | Finanzierung über Kredit oder Leasing (siehe Wirtschaft). |
| MF-06 | Maschinen verschleißen mit Betriebsstunden. Wartung, Reparaturen und Ausfälle kosten Geld und Zeit in der Werkstatt. |
| MF-07 | Die Fahrzeugliste zeigt je Maschine Standort, Zustand, Betriebsstunden, Auslastung und Kosten. |

**Teilbreitenschaltung** (Gerätedaten im Tab „Marken & Maschinen“)

| ID | Anforderung |
| --- | --- |
| TB-01 | Düngerstreuer, Feldspritzen, Güllefässer und Legemaschinen haben eine Ausstattungsstufe für Teilbreiten: 0 keine, 1 manuell, 2 GPS-Section-Control, 3 stufenlos bzw. Einzeldüse. Die Stufe wird beim Kauf gewählt oder später als Lizenz nachgerüstet. |
| TB-02 | Realistische Spannen je Gerät: Streuer Stufe 1 = 2–8 Teilbreiten, Stufe 2 = 16–128, Stufe 3 = stufenlos. Spritze Stufe 1 = 5–9, Stufe 2 = 7–42, Stufe 3 = 50- oder 25-cm-Einzeldüse. Güllefass Stufe 1 = halbseitig, Stufe 2 = 3–4 Schlauchgruppen; Einzelschlauch nur als seltene Premium-Option. |
| TB-03 | Jeder Schlag hat einen Formfaktor K für Keile und Vorgewende (Rechteck 0,1, Normalschlag 0,5, Keilschlag 1,0). Kleine Schläge bekommen einen höheren K. |
| TB-04 | Ohne Technik wird überdosiert: Streuer Faktor 1 + 0,20 × K, höchstens +15 %. Spritze 7–15 % Restüberlappung. Jede Stufe reduziert die Überlappung: Stufe 1 um 40 %, Stufe 2 um 75 %, Stufe 3 um 90 %. |
| TB-05 | Mehrverbrauch an Dünger, Mittel oder Gülle geht in die Kosten des Auftrags bzw. des eigenen Ackerbaus ein und ist in der Auftragsabrechnung sichtbar. |
| TB-06 | Qualität: Ohne Technik liegen nur 48 % der Fläche innerhalb ±10 % der Sollmenge (33 % über-, 19 % untergedüngt), mit Section Control 83 %. Das wirkt auf Ertrag, Lagergefahr und Kundenzufriedenheit. |
| TB-07 | DüV-Abstände: kein N- oder P-Dünger innerhalb 4 m zum Gewässer, mit Grenzstreueinrichtung bzw. streifenförmiger Gülletechnik 1 m. Verstöße können Bußgeld und Ansehensverlust auslösen. |
| TB-08 | Flächenleistung und Kosten nach den LWK-Erfahrungssätzen 2026. Für Lohnunternehmer kommt ein Gewinnaufschlag hinzu, weil die Sätze ohne Risiko- und Gewinnzuschlag gerechnet sind. Große Uelzener Schläge dürfen bis zu 10 % schneller sein. |
| TB-09 | Kalibrierung: Einsparung durch Section Control am Streuer im Mittel 2–15 %, typisch 5–10 % (Innovation Farm Mold ca. 10 %, BOKU 7 %, Amazone 2–5 % bei Durchschnittsschlägen). Einzeldüse bringt gegenüber guten Teilbreiten unter 1 %. |

## Händler und Fahrzeugmarkt

Maschinen kauft der Spieler bei Händlern in der Region, und nicht jeder Händler führt jede Marke. Ein guter Händler in der Nähe ist deshalb ein echter Standortvorteil. Farben, Händlerstruktur und Gerätegrößen stehen im Tab Marken & Maschinen.

| ID | Anforderung |
| --- | --- |
| HM-01 | Maschinen gibt es von realen Marken (z. B. Fendt, John Deere, Claas, Case IH, New Holland, Massey Ferguson, Deutz-Fahr, Valtra; Geräte z. B. Amazone, Lemken, Horsch, Krone, Grimme, Kverneland, Kotte). |
| HM-02 | Jede Marke hat ihr charakteristisches Farbschema aus Hauptfarbe, Felgen und Akzent, z. B. John Deere grün mit gelben Felgen, Fendt grün mit roten Felgen. Fahrzeuge erscheinen auf der Karte in diesen Farben. |
| HM-03 | Marken erscheinen nur als Name und Farbschema; Logos werden nicht nachgebildet. |
| HM-04 | Jeder Händler hat einen Standort auf der Karte und führt eine feste Auswahl an Marken, meist eine Schlepperfamilie plus mehrere Gerätemarken. |
| HM-05 | Die Entfernung zum Händler zählt: Werkstattaufenthalte, Ersatzteile und Pannenhilfe dauern länger, je weiter der Händler der eigenen Marke entfernt ist. |
| HM-06 | Händler haben ein begrenztes Lager: Neumaschinen mit Lieferzeit, Vorführmaschinen und Gebrauchte mit Alter, Stunden und Zustand. |
| HM-07 | Wer bei einem Händler viel kauft, bekommt bessere Rabatte, Inzahlungnahme und schnellere Werkstatttermine. |
| HM-08 | Händler bieten Finanzierung, Leasing und Serviceverträge an. In der Ernte ist die Werkstattkapazität knapp. |
| HM-09 | Alle Maschinendaten (Marke, Modell, PS, Arbeitsbreite, Volumen, PS-Bedarf, Preis) stehen in einer erweiterbaren Datentabelle, ähnlich einem Mod-System. |

## Alter, Betriebsstunden, Gebrauchtmarkt und Verfügbarkeit

Für ein Lohnunternehmen zählt vor allem, dass die Maschinen laufen. Jede Maschine hat deshalb Alter, Betriebsstunden und Zustand; daraus ergeben sich Wert, Reparaturkosten und Ausfallrisiko.

**Zustand und Wert**

| ID | Anforderung |
| --- | --- |
| MZ-01 | Jede Maschine hat Baujahr, Betriebsstunden (Erntemaschinen zusätzlich Trommel- bzw. Rotorstunden), Zustand von 0 bis 100 % und eine Wartungshistorie. |
| MZ-02 | Der Marktwert sinkt mit Alter und Stunden nach der Startformel unten. Ausstattung und Zustand verschieben ihn nach oben oder unten. |
| MZ-03 | Der Zustand sinkt mit jeder Betriebsstunde, schneller bei schwerer Arbeit, überfälliger Wartung und unerfahrenen Fahrern. Die Reparaturkosten je Stunde steigen mit den Stunden. |

Startformel für den Marktwert W bei Neupreis N, Alter A in Jahren und h Betriebsstunden, mit einer Untergrenze von 15 % des Neupreises:

```latex
W = N \cdot 0{,}9 \cdot 0{,}94^{A} \cdot \left(1 - 0{,}025 \cdot \frac{h}{1000}\right)
```

Mit N = 225.000 € trifft die Formel vier der fünf Fendt-720-Angebote aus den Startbedingungen auf ±5 %. Fast neue Maschinen schätzt sie noch rund ein Viertel zu niedrig; die Kurve wird mit weiteren Angeboten nachgeschärft.

**Ausfälle und Verfügbarkeit**

| ID | Anforderung |
| --- | --- |
| MZ-04 | Die Pannenwahrscheinlichkeit hängt von Zustand, Wartungsrückstand und Belastung ab. Unter Volllast in der Saison fallen Maschinen eher aus. |
| MZ-05 | Wartungsintervalle (z. B. nach Betriebsstunden) und ein Wintercheck senken das Ausfallrisiko deutlich. |
| MZ-06 | Die Reparaturdauer hängt von eigener Werkstatt, Entfernung zum Markenhändler und Ersatzteillage ab. |
| MZ-07 | Fällt eine Maschine während eines Auftrags aus, stockt der Auftrag; der Kunde wartet und wird unzufriedener, bis umgeplant ist. |
| MZ-08 | Als Absicherung gibt es Reservemaschinen, Leihgeräte vom Händler und kurzfristige Mietmaschinen gegen Gebühr. |
| MZ-09 | Je Maschine wird eine Verfügbarkeitsquote angezeigt, dazu ein Warnhinweis bei fälliger Wartung. |

**Gebrauchtmarkt**

| ID | Anforderung |
| --- | --- |
| MZ-10 | Gebrauchtmaschinen gibt es bei Händlern (mit Gewährleistung) und auf einer Gebrauchtbörse von Privat und anderen Betrieben (günstiger, ohne Gewährleistung). |
| MZ-11 | Angebote haben zufällige Kombinationen aus Alter, Stunden, Zustand und Ausstattung; versteckte Mängel sind möglich. Ein Werkstattcheck vor dem Kauf kostet Geld und deckt sie auf. |
| MZ-12 | Eigene Maschinen lassen sich beim Händler in Zahlung geben (schnell, weniger Geld) oder privat verkaufen (mehr Geld, dauert länger). |

**Zuschläge**

| ID | Anforderung |
| --- | --- |
| ZU-01 | Auf den Stundenlohn kommen Zuschläge. Startwerte sind die steuerfreien Höchstsätze nach § 3b EStG: Nacht (20–6 Uhr) 25 %, bei Beginn vor Mitternacht von 0–4 Uhr 40 %; Sonntag 50 %; gesetzliche Feiertage 125 %; 24.12. ab 14 Uhr, 25./26.12. und 1. Mai 150 % ([Quelle](https://www.gesetze-im-internet.de/estg/__3b.html)). |
| ZU-02 | Nacht- und Sonntagszuschlag werden addiert, Sonntags- und Feiertagszuschlag nicht. |
| ZU-03 | Überstunden bekommen einen Zuschlag nach Arbeitsvertrag; Startwert 25 %. |
| ZU-04 | Für Lohnunternehmen in Niedersachsen gibt es einen Entgelttarifvertrag zwischen BLU und IG BAU (Laufzeit 1.4.2025 bis 30.9.2026, [Quelle](https://www.dgb.de/service/weiterer-service/tarifmeldungen/tarifmeldung/neuer-entgelttarifvertrag-fuer-lohnunternehmen-mehr-geld-und-bessere-leistungen/)). Der Spieler kann nach Tarif zahlen: höhere Kosten, zufriedenere Mitarbeiter. Die Lohntabelle wird vor der Umsetzung recherchiert. |
| ZU-05 | Kunden kann der Spieler für Nacht- und Sonntagseinsätze einen Aufschlag berechnen; zu hohe Aufschläge kosten Zufriedenheit. |

## Personal und Arbeitszeiten

Mitarbeiter sind die knappste Ressource: Jeder hat eigene Skills, ein eigenes Gehalt und eine eigene Zufriedenheit.

**Grundlagen**

| ID | Anforderung |
| --- | --- |
| PA-01 | Mitarbeiter werden über Bewerbungen eingestellt und können entlassen werden; feste Mitarbeiter und Saisonkräfte für Erntespitzen. |
| PA-04 | Höchstarbeitszeiten und Ruhezeiten werden eingehalten; Verstöße haben Folgen. |
| PA-05 | Urlaub und Krankheit fallen an und müssen in der Planung berücksichtigt werden. |
| PA-06 | Arbeitstage beginnen und enden am Hof; Anfahrt zählt als Arbeitszeit. |

**Skillsystem**

| ID | Anforderung |
| --- | --- |
| PA-02 | Jeder Mitarbeiter hat Skills je Tätigkeit: Schlepper/Bodenbearbeitung, Saat, Gülle, Häcksler, Mähdrescher, Rübenroder, Kartoffeltechnik, Transport, Werkstatt. |
| PA-07 | Skills haben Stufen (z. B. 1 bis 5). Die Stufe wirkt auf Arbeitstempo, Qualität, Dieselverbrauch und Schadensrisiko an der Maschine. |
| PA-08 | Erfahrung wächst durch Arbeit in der jeweiligen Tätigkeit; Skills steigen dadurch langsam. |
| PA-09 | Schulungen und Lehrgänge kosten Geld und Arbeitszeit und heben Skills schneller. |
| PA-10 | Bestimmte Maschinen verlangen eine Mindeststufe oder einen Führerschein (z. B. LKW für Transport). |
| PA-11 | Mitarbeiter haben Eigenschaften wie Zuverlässigkeit und Belastbarkeit, die Krankheitstage und Überstunden-Toleranz beeinflussen. |
| PA-12 | Auszubildende sind günstig, aber langsam und dürfen nicht alles fahren; sie wachsen zu Fachkräften heran. |

**Gehaltssystem**

| ID | Anforderung |
| --- | --- |
| PA-03 | Untergrenze ist der gesetzliche Mindestlohn: 13,90 € pro Stunde ab 2026, 14,60 € ab 2027 ([Quelle](https://www.handwerksblatt.de/betriebsfuehrung/mindestlohn-steigt-2026-auf-1390-euro)). Die Werte ändern sich im Spiel mit der Zeit. |
| PA-13 | Das Gehalt richtet sich nach Skills und Erfahrung. Gute Fahrer verlangen mehr, Bewerber nennen ihre Gehaltsvorstellung. |
| PA-14 | Lohnarten: Monatsgehalt für Feste, Stundenlohn für Saisonkräfte, Zuschläge für Überstunden, Nacht, Sonntag und Feiertag (Sätze siehe ZU-01 bis ZU-03). |
| PA-15 | Arbeitgeberanteile zur Sozialversicherung werden auf den Lohn aufgeschlagen. |
| PA-16 | Mitarbeiter haben eine Zufriedenheit: Gehalt im Vergleich zum Markt, Überstunden, Maschinenqualität und Arbeitsklima wirken darauf. |
| PA-17 | Unzufriedene Mitarbeiter fordern Gehaltserhöhungen und kündigen sonst, auch zur Konkurrenz. Konkurrenten können gute Leute abwerben. |

## Wirtschaft und Finanzen

| ID | Anforderung |
| --- | --- |
| WF-01 | Kredite mit Zins, Laufzeit und Tilgung; die Kreditwürdigkeit hängt von der Lage des Betriebs ab. |
| WF-02 | Leasing als Alternative zum Kauf, mit monatlicher Rate und Restwert. |
| WF-03 | Abschreibung (AfA) auf Maschinen über die Nutzungsdauer. |
| WF-04 | Steuern auf den Gewinn, vereinfacht berechnet. |
| WF-05 | Versicherungen für Maschinen und Betrieb als laufende Kosten. |
| WF-06 | Verschleiß- und Werkstattkosten (siehe MF-06). |
| WF-07 | Der Dieselpreis schwankt über die Zeit und wirkt direkt auf die Kosten je Auftrag. |
| WF-08 | Übersicht über Kontostand, Einnahmen, Ausgaben und Gewinn je Monat und Jahr. |
| WF-09 | Auswertung je Auftrag und je Maschine: Hat sich das gelohnt? |

## Pacht, eigener Ackerbau und Biogas

Der Spieler kann Flächen von Betrieben pachten, sie komplett selbst bewirtschaften und eine eigene Biogasanlage bauen. Das ist ein zweites Standbein neben den Lohnaufträgen und nutzt die eigenen Maschinen in Auftragslücken.

| ID | Anforderung |
| --- | --- |
| PB-01 | Betriebe bieten Flächen zur Pacht an, z. B. bei Betriebsaufgabe oder Generationswechsel. Der Spieler kann auch selbst anfragen. |
| PB-02 | Ein Pachtvertrag hat Fläche, Bodenqualität, Beregnungsmöglichkeit, Pachtpreis je ha und Laufzeit. |
| PB-03 | Pachtpreise orientieren sich an realen Werten und steigen mit Bodenqualität und Beregnung. Konkurrenten bieten mit. |
| PB-04 | Auf eigenen Flächen plant der Spieler die Fruchtfolge (Mais, Getreide, Rüben, Kartoffeln, Raps) und alle Arbeitsgänge selbst. |
| PB-05 | Saatgut, Dünger, Pflanzenschutz und Beregnung kosten Geld; der Ertrag hängt von Boden, Wetter und rechtzeitiger Arbeit ab. |
| PB-06 | Ernte wird verkauft (Markt, Nordzucker, Kartoffelabnehmer) oder in der eigenen Biogasanlage verwertet. |
| PB-07 | Der Spieler kann eine Biogasanlage bauen: Baukosten, Bauzeit, Genehmigung und Größe wählbar. |
| PB-08 | Die Anlage braucht laufend Substrat (vor allem Maissilage); fehlt Substrat, sinkt die Leistung. Silage wird im Silo gelagert. |
| PB-09 | Die Anlage erzeugt Stromerlöse und Gärrest. Gärrest muss ausgebracht werden, auf eigenen oder fremden Flächen, unter Beachtung der Sperrfristen. |
| PB-10 | Die Biogasanlage erzeugt Arbeit für den eigenen Fuhrpark: Häckseln, Silo festfahren, Gärrest fahren. |

Als Grundlage für Pachtpreise: In Niedersachsen kostete Ackerland 2023 im Bestand durchschnittlich 643 € je ha und bei Neupachten 755 € je ha ([top agrar](https://www.topagrar.com/betriebsleitung/news/weiterer-deutlicher-anstieg-der-bodenpreise-20021599.html)). Werte speziell für den Kreis Uelzen habe ich noch nicht gefunden. Die Wirtschaftlichkeit der Biogasanlage (Vergütung, Baukosten, Substratbedarf je kW) recherchiere ich vor dem Bau dieser Phase.

## Pflanzenbau-Mechaniken

Der eigene Ackerbau bekommt Tiefe durch Fruchtfolge, Krankheiten, Pflanzenschutz und Düngung. Vorbild sind die Mods „Realistische Fruchtfolge“, „Fruchtfolge“, „Precision Farming“ und „Feldrechner“ aus Nils' LS25-Mod-Ordner; die Mechaniken werden eigenständig umgesetzt.

| ID | Anforderung |
| --- | --- |
| PF-01 | Jedes Feld merkt sich die letzten vier Kulturen oder Brachejahre. Gute Vorfrüchte heben den Ertrag, Selbstfolge und zu kurze Abstände senken ihn. |
| PF-02 | Kulturen haben typische Krankheiten, z. B. Kraut- und Knollenfäule (Kartoffel), Rübenzystennematoden (Rübe), Sklerotinia und Kohlhernie (Raps), Fusarium und Septoria (Getreide). Feuchtes Wetter und enge Fruchtfolgen erhöhen das Risiko. |
| PF-03 | Manche Erreger bleiben nach einem Befall im Boden und bauen sich nur über Jahre ab; dagegen hilft nur Fruchtfolge. |
| PF-04 | Pflanzenschutz (Herbizid, Fungizid, Insektizid) wirkt vorbeugend oder bremst einen Befall, stellt verlorenen Ertrag aber nicht wieder her. Rechtzeitiges Spritzen zählt. |
| PF-05 | Düngung mit Stickstoff, Phosphor, Kalium und Kalk (pH-Wert); organisch (Gülle, Gärrest, Mist) oder mineralisch. Bodenproben zeigen den Bedarf je Feld. |
| PF-06 | Leguminosen und Zwischenfrüchte liefern beim Einarbeiten Stickstoff an die Folgekultur und verbessern den Boden. |
| PF-07 | Ein Feldrechner zeigt je Feld den Bedarf an Saatgut, Dünger, Kalk und Pflanzenschutz. |
| PF-08 | Pflanzenschutz darf nur ein Mitarbeiter mit Sachkunde-Skill ausbringen; Düngung folgt den Sperrfristen und Obergrenzen der Düngeverordnung. |
| PF-09 | Spritzen und Düngerstreuen werden dadurch auch als Lohnaufträge für Kunden interessant. |

## Standorte und Gebäude

Der Betrieb wächst auch räumlich: vom Matschplatz bis zu mehreren Standorten mit Halle, Werkstatt, Silos und Biogasanlage. Jeder Standort ist eine Basis, von der aus Fahrten starten. Ein zweiter Standort verkürzt also Anfahrten und erschließt neue Kunden, etwa jenseits der Elbe.

**Standorte erschließen**

| ID | Anforderung |
| --- | --- |
| ST-01 | Neue Standorte entstehen durch Kauf oder Pacht eines Grundstücks (Gewerbegebiet, Resthof, Außenbereich) oder durch Übernahme einer bestehenden Hofstelle. |
| ST-02 | Komplette Lohnunternehmen lassen sich übernehmen, z. B. wenn ein Konkurrent ohne Nachfolger aufgibt: mit Gebäuden, Maschinen, Personal und Kundenstamm. Der Kaufpreis richtet sich nach diesen Werten; übernommene Kunden sind anfangs noch dem alten Inhaber treu. |
| ST-03 | Bauen braucht eine Genehmigung mit Kosten und Wartezeit. Vereinfachte Regeln: Ein Lohnunternehmen gilt meist als Gewerbe und baut leichter im Gewerbegebiet als im Außenbereich; Biogasanlagen brauchen Abstand zur Wohnbebauung. |
| ST-04 | Standorte können wieder verkauft oder aufgegeben werden. |

**Ausbaustufen**

| Stufe | Wirkung im Spiel |
| --- | --- |
| Matschplatz (unbefestigt) | Billigste Abstellfläche; bei Nässe schlecht befahrbar, Maschinen stehen draußen |
| Befestigter Platz (Schotter, Pflaster, Beton) | Ganzjährig nutzbar, mehr Stellplätze |
| Maschinenhalle | Weniger Verschleiß und höherer Wiederverkaufswert für untergestellte Maschinen |
| Werkstatt | Eigene Wartung und Reparatur mit Werkstatt-Mitarbeitern; Kapazität nach Arbeitsplätzen, Grube oder Hebebühne |
| Dieseltank und Waschplatz | Günstiger tanken, weniger Leerfahrten, Pflege senkt Verschleiß |
| Büro und Sozialräume | Arbeitsplätze für Disponenten, Pausenräume für Fahrer, höhere Zufriedenheit |
| Lager (Dünger, Saatgut, Pflanzenschutz) | Einkauf auf Vorrat zu besseren Preisen; Pflanzenschutzlager mit Auflagen |
| Silos (Fahrsilo, Getreidelager mit Trocknung) | Eigene Ernte und Substrat lagern, Verkauf zum besseren Zeitpunkt |
| Gülle- und Gärrestlager | Puffer über die Sperrfristen |
| Biogasanlage | Siehe PB-07 bis PB-10 |

**Betrieb eines Standorts**

| ID | Anforderung |
| --- | --- |
| ST-05 | Jeder Ausbau hat Baukosten, Bauzeit und laufende Kosten (Strom, Grundsteuer, Versicherung, Instandhaltung). |
| ST-06 | Standorte haben Kapazitäten: Stellplätze, Werkstattplätze, Lager in t oder m³. |
| ST-07 | Maschinen und Mitarbeiter werden einem Standort zugeordnet; der Pendelweg der Mitarbeiter zählt. |
| ST-08 | Ein Disponent oder Standortleiter kann das Büro besetzen und Anfragen prüfen, während der Chef unterwegs ist. |
| ST-09 | Standorte und ihr Ausbau sind auf der Karte sichtbar. |

## Markt und Konkurrenz

| ID | Anforderung |
| --- | --- |
| MK-01 | Es gibt konkurrierende Lohnunternehmen im Spielgebiet, mit eigenem Fuhrpark und eigenen Preisen. |
| MK-02 | Aufträge gehen an den, der Preis, Termin und Ruf am besten erfüllt. |
| MK-03 | Stammkunden bleiben bei guter Leistung, wechseln aber bei schlechter Leistung oder deutlich günstigeren Angeboten. |
| MK-04 | Konkurrenten senken zeitweise ihre Preise (Preiskampf); der Spieler muss reagieren oder Kunden verlieren. |
| MK-05 | Der Ruf des Betriebs wächst mit zufriedenen Kunden und sinkt bei Verspätungen und Ausfällen. |

## Betriebe und Konkurrenz im Spielgebiet

Die drei Kernkreise Uelzen, Lüchow-Dannenberg und Lüneburg haben zusammen rund 1.780 landwirtschaftliche Betriebe mit im Schnitt gut 100 ha. Dazu kommen Teile der Altmark und des Kreises Gifhorn, die ebenfalls im Radius liegen.

| Landkreis | Betriebe | davon mit Vieh | LF (ha) | Ø ha je Betrieb | Beregnet 2019 (ha) |
| --- | --- | --- | --- | --- | --- |
| Uelzen | 643 | 317 | 72.173 | 112 | 52.352 (73 %) |
| Lüneburg | 589 | 355 | 61.179 | 104 | 19.212 (31 %) |
| Lüchow-Dannenberg | 551 | 344 | 58.736 | 107 | 26.785 (46 %) |

Quelle: Landwirtschaftszählung 2020, zusammengestellt von der [Landwirtschaftskammer Niedersachsen, Bezirksstelle Uelzen](https://www.lwk-niedersachsen.de/services/download.cfm?file=45611).

**Was das für das Spiel heißt**

- **Ackerbau dominiert, Vieh ist dünn:** Der Viehbesatz liegt bei 0,28 bis 0,42 GV/ha, im Landesschnitt sind es 1,14. Gülle- und Gärrestaufträge sind deshalb seltener als im Westen Niedersachsens; Gärrest aus Biogasanlagen wird eine wichtige Quelle (Annahme).
- **Beregnung prägt die Region:** Im Kreis Uelzen wurden 2019 knapp drei Viertel der Fläche beregnet. Trockenjahre aus den historischen Wetterdaten wirken sich direkt auf Erträge und Erntemengen aus.
- **Zuckerrüben:** Die Zuckerfabrik Uelzen ist das größte Nordzucker-Werk; 2011 lieferten dort rund 2.700 Anbauer von etwa 36.000 ha ([Quelle](https://www.vdl.de/wp-content/uploads/2019/02/HP-Zuckerexkursion-2011.pdf)). Die Kampagne lief zuletzt rund 130 Tage bis in den Januar ([Quelle](https://www.yumda.com/de/news/1144446/nordzucker-ag-beendet-groesste-kampagne-in-ihrer-geschichte.html)). Im Spiel bedeutet das: Rübenroden und Mietenladen über Monate, alles Richtung Uelzen.
- **Kartoffeln:** Typisch sind Ackerbaubetriebe wie einer zwischen Lüneburg und Uelzen mit 400 ha, davon 100 ha Kartoffeln, dazu Rüben, Raps und Getreide ([Quelle](https://uni-goettingen.de/de/14.06.2024volont%c3%a4rverwalter+/+entwicklungsstelle+pflanzenbauleiter+%28m/w/d%29+400+hektar+vorzeige-ackerbau+zwischen+l%c3%bcneburg+und+uelzen/688214.html)).
- **Altmark (Salzwedel):** Dort stehen auf dem Acker etwa 35 % Getreide, 19 % Mais, 21 % Ackerfutter und je rund 4 % Kartoffeln und Rüben ([Quelle](https://www.lbeg.niedersachsen.de/download/144359/Steckbrief_Altmarkkreis_Salzwedel.pdf)). Mehr Mais und Futter heißt mehr Häcksel- und Gülleaufträge im Südosten der Karte.

**Konkurrenz**

Eine öffentliche Zählung der Lohnunternehmen je Landkreis habe ich nicht gefunden. Bundesweit hat der Bundesverband Lohnunternehmen 2.555 Mitgliedsbetriebe (Stand 2023, [Lobbyregister](https://www.lobbyregister.bundestag.de/media/f6/d7/259227/Lobbyregister-Detailansicht-R003221-2024-03-05_13-35-33.pdf)). Als Größenanker: Ein norddeutsches Lohnunternehmen im Verkaufsangebot hat 18 Mitarbeiter und rund 1,5 Mio. € Umsatz ([Quelle](https://www.dub.de/fileadmin/enterprisermarket/angebot/16480/Landwirtschaftliches-Lohnunternehmen-samt-Handel-Lagerung-und-Umschlag_1711640836.pdf)).

**Festlegung fürs Spiel (Annahme, beim Testen nachjustierbar)**

| Gruppe | Anzahl im Radius | Profil |
| --- | --- | --- |
| Kundenbetriebe | rund 2.000 | Größen und Viehhaltung nach der Statistik oben; nur ein Teil vergibt Lohnarbeit, je nach Größe und eigener Technik |
| Große Lohnunternehmen | 2–3 | 15–20 Mitarbeiter, Häcksler, Mähdrescher, Roder |
| Mittlere Lohnunternehmen | 4–5 | 5–10 Mitarbeiter, Schwerpunkt Gülle, Bodenbearbeitung, Drusch |
| Kleine Anbieter | rund 4 | 1–3 Schlepper, oft Nebenerwerb, günstige Preise |

## Startbedingungen

Das Spiel beginnt mit einem gebrauchten 200-PS-Schlepper (Baujahr um 2014, rund 9.000 Betriebsstunden, Wert rund 70.000 €), 100.000 € auf dem Konto, einem Kreditrahmen von 150.000 € und einem gebrauchten Firmenwagen für Kundenbesuche. Zu Beginn ist der Spieler sein einziger Fahrer. Startstandort in Groß Thondorf ist ein unbefestigter Abstellplatz mit Büro im Wohnhaus (Annahme); alles Weitere wird ausgebaut.

Reale Angebotspreise für einen 200-PS-Schlepper (Fendt 720 Vario) als Grundlage, netto:

| Baujahr | Betriebsstunden | Preis netto |
| --- | --- | --- |
| 2023 | 610 h | ca. 225.000 € ([Angebot](https://www.landwirt.com/tags/fendt-720?page=2)) |
| 2021 | 2.473 h | 144.900 € ([Angebot](https://www.truckscout24.de/tsp/ts-211-56-712)) |
| 2019 | 7.346 h | ca. 102.000 € ([Angebot](https://www.landwirt.com/traktoren/standard-traktoren/fendt?page=14)) |
| 2014 | 11.677 h | 69.900 € ([Angebot](https://www.truckscout24.de/tsp/ts-214-39-712)) |
| 2012 | 7.252 h | 71.000 € ([Angebot](https://www.truckscout24.de/tsp/ts-220-29-623)) |

Warum diese Werte: Das Geld reicht für ein bis zwei gebrauchte Anbaugeräte, etwa Grubber, Drillkombination oder Güllefass. Damit sind Bodenbearbeitung, Saat und Gülle sofort möglich. Häcksler, Mähdrescher, Rüben- und Kartoffelroder sind anfangs nur über Kredit oder Leasing erreichbar. Die Startwerte werden beim Testen nachjustiert.

## Abgrenzung

Nicht in der ersten Ausbaustufe, aber später geplant:

- Transportaufträge (z. B. Getreide, Rüben, Kartoffeln zum Abnehmer)
- Winterdienst
- Kommunalarbeiten

Bewusst nicht geplant: 3D-Grafik, Fahrsimulation und Mehrspieler. Selbst mitarbeiten geht über die Planung auf der 2D-Karte.

## Offene Punkte

- [x] GitHub-Account: vorhanden.
- [x] Wetter: historische Wetterjahre (Deutscher Wetterdienst).
- [x] Startkapital und Startschlepper: festgelegt (siehe Startbedingungen).
- [x] Kundenbetriebe und Konkurrenten: festgelegt (siehe Betriebe und Konkurrenz im Spielgebiet).
- [ ] Verfügbarkeit und Lizenz der Feldgeometrien für Niedersachsen, Sachsen-Anhalt und Mecklenburg-Vorpommern prüfen (Claude).

## Vorgehen und Meilensteine

Als Nächstes gibt Nils diese Anforderungen frei, danach baut Claude einen spielbaren Prototyp der Kern-Schleife.

**Ausbauphasen** (im Doc als Diagramm): Erst die Kern-Schleife spielbar machen, dann Schicht für Schicht ausbauen.

| Phase | Name | Inhalt | Gate danach |
| --- | --- | --- | --- |
| 1 | Anforderungen | dieses Doc prüfen und freigeben | Freigabe |
| 2 | Prototyp | Karte, Hof, Auftrag, Fahrt, Rechnung | Nils spielt |
| 3 | Fuhrpark | Kauf, Verkauf, Personal, Arbeitszeiten | – |
| 4 | Wirtschaft | Finanzen, Diesel, Wetter, Jahreslauf | – |
| 5 | Markt | Konkurrenz, Preiskampf, Stammkunden | – |

Danach: Standorte, Pacht, Ackerbau, Biogas · Später: Transport, Winterdienst, Kommunal

Jede Phase endet mit einer spielbaren Version als Link. Nach dem Prototyp prüft Nils durch Spielen, ob die Richtung stimmt, bevor die weiteren Schichten folgen.
