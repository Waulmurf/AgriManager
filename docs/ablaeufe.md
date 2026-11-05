# Arbeitsabläufe der Maschinen (Arbeitsketten)

Stand 5. Nov. 2026. Grundlage für die Phasen mit Erntetechnik. Viele Maschinen arbeiten nicht
allein, sondern in einer **Arbeitskette**: Eine Hauptmaschine braucht Logistik (Abfahrer,
Überladewagen, Zubringer, abgestellte Anhänger, Lader). Im Spiel wird jeder Auftrag deshalb
als Kette mit Rollen geplant; jede Rolle braucht Maschine **und** Fahrer.

## Übersicht

| Arbeit | Hauptmaschine | kann bunkern? | Logistik (Pflicht) | Entladung |
| --- | --- | --- | --- | --- |
| Bodenbearbeitung, Pflege | Schlepper + Gerät | – | keine | – |
| Saat, Legen | Schlepper + Drille / Einzelkorn / Legemaschine | Saatgut-/Pflanzgutbehälter | Nachschub am Feldrand (Saatgut, Pflanzkartoffeln) | – |
| Düngerstreuen | Schlepper + Streuer | Behälter 1,4–4,2 m³ | Nachschub am Feldrand (Zubringer, Big Bags) | – |
| Pflanzenschutz | Schlepper + Spritze / Selbstfahrer | Tank 1,6–8 m³ | Wasser/Mittel am Feldrand (Wasserfass, Hydrant) | – |
| Gülle | Selbstbefüller **oder** Ausbringfass im Feld | Fass 12–32 m³ | ab mittlerer Entfernung: Zubringer + Umschlag am Feldrand | Ausbringung |
| Maishäckseln, Grashäckseln | Feldhäcksler | **nein** | **mindestens ein Abfahrgespann nebenher**, am Silo Walzschlepper | während der Fahrt auf Abfahrer |
| Mähdrusch | Mähdrescher | Korntank 7–12 m³ | Anhänger am Feldrand **oder** Überladewagen/Abfahrer nebenher | Feldrand oder während der Fahrt |
| Kartoffelroden (Bunkerroder) | gezogener/selbstfahrender Roder | Bunker ca. 6–7 t | Anhänger am Feldrand oder nebenher | Feldrand oder während der Fahrt |
| Kartoffelroden (Seitenroder ohne Bunker) | gezogener Roder | **nein** | Abfahrer immer nebenher | während der Fahrt |
| Rübenroden | Rübenroder-Selbstfahrer | Bunker 30–45 m³ (ca. 30 t) | **keine**: legt eine Feldrandmiete an | in die Miete am Feldrand |
| Rübenverladung | Reinigungslader („Rübenmaus“) | – | Lkw/Abfahrer zur Zuckerfabrik | aus der Miete auf Lkw |
| Pressen | Schlepper + Presse | Ballenkammer | Ballen bergen (Frontlader, Sammelwagen), Silage: Wickler | Ballen werden im Feld abgelegt |

## Abläufe im Einzelnen

### Häckselkette (Mais, Gras, Ganzpflanze)
- Der Feldhäcksler hat keinen Bunker. Er bläst das Häckselgut über den Auswurfkrümmer auf ein
  **Abfahrgespann, das nebenher fährt**. Beim Anschnitt fährt es dahinter. Ohne Abfahrer
  steht der Häcksler.
- Die Leistung der ganzen Kette hängt von der Zahl der Transporter ab. Zwei Abfahrer, die immer
  beim Häcksler bleiben, hoben die Häckslerleistung in einer TU-München-Untersuchung von
  90 auf 120 t/h. Mehr Abfahrer bringen nicht immer mehr, weil sie sich auf engen Straßen
  gegenseitig ausbremsen ([topagrar](https://www.topagrar.com/technik/aus-dem-heft/die-sendung-mit-der-maus-9666023.html)).
- Bedarf an Abfahrern ≈ Häckslerleistung (t/h) × Umlaufzeit (h: Fahrt zum Silo, Abkippen,
  Rückfahrt) ÷ Ladung je Gespann (t) plus Puffer. So rechnet auch eine Hohenheimer
  Veröffentlichung mit Umlaufzeit und Ladung je Anhänger ([Hohenheim](https://440ejournals.uni-hohenheim.de/index.php/de_agrartechnik/article/view/4380/4093)).
  Über etwa 7 km Entfernung werden größere Transporteinheiten nötig ([BOKU 2008](https://boku.ac.at/fileadmin/data/H03000/H73000/H73300/pub/Biogas/2008_Stuermer_biomasskonferenz.pdf)).
- Am Silo verdichtet ein **Walzschlepper**. Richtwert: 2–3 min Verdichtung je Tonne. Er begrenzt
  die Leistung der ganzen Kette ([Bayerisches Wochenblatt via swissmilk](https://api.swissmilk.ch/wp-content/uploads/2019/05/futterkonservierung-bestes-futter-auf-dem-tisch-artikel-bayerisches-wochenblatt-6-9-2019-de.pdf)).
- Kosten als Anker: Häcksler 241 €/h, Transportfahrzeug 87 €/h, Walzschlepper 110 €/h (ebd.).
- Häckselgeschwindigkeit im Feld meist unter 10 km/h ([Handbuch Biogaslogistik](https://renewable-carbon.eu/news/wp-content/uploads/news-images/20080411-03/HandbuchLog.pdf)).

### Mähdrusch
- Der Korntank fasst 7.000–12.000 l und wird mit 75–120 l/s in 1,5–2 min entleert (Datenblätter
  [Rostselmash Torum 770](https://de.rostselmash.com/products/models-zuk/torum-770/),
  [Deutz-Fahr C 7206 TS](https://www.landwirt.com/detail/deutz-fahr-c-7206-ts-6381289)).
- Drei übliche Verfahren:
  1. **Anhänger am Feldrand abgestellt:** Der Drescher fährt bei vollem Tank zum Rand und tankt
     in den alleinstehenden Anhänger ab. Ein Schlepper bringt volle Anhänger weg.
  2. **Überladewagen:** fährt nebenher, nimmt während der Fahrt auf und entleert am Feldrand in
     Anhänger oder Lkw. Bei drei Dreschern ist er ständig im Einsatz ([topagrar](https://www.topagrar.com/technik/aus-dem-heft/vom-acker-aber-schnell-9672451.html)).
  3. **Abfahrgespann nebenher:** direkt vom Feld zum Lager.
- Paralleles Abtanken während der Fahrt bringt etwa 5 % Mehrleistung (ebd.). Ein voller Tank
  ist nach rund 8 min Dreschen erreicht (ebd.).

### Kartoffelroden
- **Bunkerroder:** Der gezogene 2-reihige Roder (z. B. Grimme SE 260) bunkert 6 t. Damit sind
  lange Schläge ohne Überladen möglich. Ist der Bunker voll, wird am Feldrand auf einen
  (abgestellten) Anhänger entladen ([topagrar](https://www.topagrar.com/technik/news/grimme-5-5-tonnen-ueberladebunker-fuer-den-se260-9375610.html)).
- **Überladebunker:** Ein Abfahrer fährt nebenher und nimmt während des Rodens auf. Entladen
  dauert rund 45 s (Herstellerangabe, ebd.).
- **Seitenroder ohne Bunker:** braucht wie der Häcksler immer einen Abfahrer nebenher.
- Eine ältere DDR-Untersuchung beschreibt auch Anhänger, die am Feldrand abgekoppelt und dort
  befüllt werden ([Hohenheim](https://440ejournals.uni-hohenheim.de/index.php/agrartechnik/article/view/3382/3100)).

### Zuckerrüben: Roden, Miete, Verladung
- Der 6-reihige Rübenroder-Selbstfahrer (z. B. Grimme Rexor 6300, Ropa Tiger) bunkert
  30–45 m³ (ca. 30 t). Er entleert per Kratzboden in eine **Feldrandmiete am Vorgewende**.
  Logistik beim Roden ist nicht nötig ([Grimme-Fahrbericht](https://static.grimme.com/files/2020/10/06/b0fac8a266c1c8ec8a179722892bad3f887b9cf3f5a5d0762555ae6cc35b44c3ded270b41128deb8/ec00c189a4563e4cf8763fc10def0389689f4551/2020_10_fahrbericht_grimme_rexor_6300_platinum_agrarheute_de.pdf)).
- Eine Feldrandmiete fasst bis zu 2.000 t ([Hohenheim](https://440ejournals.uni-hohenheim.de/index.php/de_agrartechnik/article/view/6746/6444)).
- Ein **Reinigungslader („Rübenmaus“)** nimmt die Miete auf, reinigt die Rüben und lädt sie auf
  Lkw oder Abfahrer. Das ältere Modell euro-Maus 3 schafft bis 550 t/h ([agriexpo](https://www.agriexpo.online/prod/ropa-fahrzeug-maschinenbau-gmbh/product-170165-152254.html));
  für die aktuelle Maus 6 nennen die Quellen keinen Wert.
- Die Abfuhr richtet sich nach dem Abfuhrplan der Zuckerfabrik (Uelzen, Kampagne rund 130 Tage,
  siehe anforderungen.md). Bei Frost wird die Miete abgedeckt (Annahme, prüfen).

### Gülle
- Kurze Entfernung: Ein **Selbstbefüller** mit Schleppschlauch oder Injektor pendelt zwischen
  Lager und Feld.
- Größere Entfernung: Das Ausbringfass bleibt im Feld. **Zubringer** (Schlepper oder Lkw,
  18,5–29 m³) bringen die Gülle an den Feldrand, wo sie umgepumpt wird
  ([topagrar](https://www.topagrar.com/technik/news/effiziente-guellelogistik-mit-dem-briri-road-master-20001740.html),
  [Die grüne](https://api.swissmilk.ch/wp-content/uploads/2019/05/maschienen-geraete-schlauch-statt-fass.artikel-die-gruene-april-2023-de.pdf)).
- Seit der Schleppschlauchpflicht übernehmen Lohnunternehmer mehr Gülle
  ([Die grüne 3/2025](https://api.swissmilk.ch/wp-content/uploads/2019/05/maschinen-geraete-maschinen-teilen-kosten-teilen-artikel-die-gruene-3-2025-de.pdf)).
  Sperrfristen nach Düngeverordnung beachten.

### Saat, Düngung, Pflanzenschutz, Pressen
- Drillmaschine, Einzelkorn- und Legemaschine sowie Düngerstreuer und Spritze arbeiten allein,
  müssen aber am Feldrand nachgefüllt werden: Saatgut, Pflanzkartoffeln, Dünger, Wasser.
  Im Spiel heißt das: Behältervolumen begrenzt die Fläche je Füllung. Dazu kommen Rüstzeit
  zum Befüllen und Material, das am Feldrand bereitstehen muss (Zubringer oder vom Kunden).
- Pressen legen die Ballen im Feld ab. Danach folgen Bergen (Frontlader, Ballensammelwagen) und
  bei Silage Wickeln. Das ist ein zweiter Arbeitsgang mit eigener Maschine.

## Umsetzung im Spiel (Plan)

1. **Arbeitskette als Auftrag:** Ein Auftrag hat Rollen, etwa Häcksler, 2–4 Abfahrer und
   Walzschlepper oder Rübenroder plus Rübenmaus. Jede Rolle braucht Maschine und Fahrer;
   Fahrer und Maschinen kommen aus dem eigenen Betrieb, von Mietmaschinen oder vom Kunden.
2. **Materialfluss:** Erntemenge je Feld = Fläche × Ertrag (Kultur, Wetter, Boden). Bunker,
   Anhänger, Mieten und Silos haben Kapazitäten. Eine Hauptmaschine ohne Bunker steht, solange
   kein Abfahrer neben ihr fährt. Eine Maschine mit vollem Bunker fährt zum Feldrand.
3. **Alleinstehende Anhänger:** Anhänger lassen sich am Feldrand abstellen (ohne Schlepper) und
   später abholen. Sie sind eigene Objekte auf der Karte.
4. **Feldrandmiete:** wird vom Rübenroder an einer Stelle am Vorgewende angelegt, wächst mit
   jeder Bunkerladung und wird von der Rübenmaus auf Abfuhrfahrzeuge geladen.
5. **Silo am Ziel:** Abfahrer kippen am Fahrsilo des Kunden oder der Biogasanlage ab; ein
   Walzschlepper begrenzt die Annahmeleistung.
6. **Kennzahlen offen (vor der Umsetzung recherchieren):** Erträge in der Region (Silomais,
   Weizen, Kartoffeln, Rüben), Ladevolumen und Schüttdichten, aktuelle Leistung von Häcksler und
   Reinigungslader, Abfuhrlogistik der Zuckerfabrik Uelzen.

Zeitpunkt: mit dem Maschinenkatalog in Phase 3 (Fuhrpark) die Grundlagen (Rollen, Anhänger,
Bunker), die Ernteketten mit Phase 4 (Wirtschaft, Jahreslauf).
