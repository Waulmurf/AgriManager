# Technik: Entscheidungen, Annahmen, Messwerte

Ergänzt den Abschnitt „Technik und Entwicklungsumgebung“ in [anforderungen.md](anforderungen.md).

## Architektur des Prototyps

```
 Tauri-Hülle (Rust)                     WebView (WKWebView / WebView2)
 ┌──────────────────────┐   mapdata://   ┌──────────────────────────────────────┐
 │ range_proto: Datei-  │ ─────────────▶ │ MapLibre GL JS + pmtiles-Protokoll   │
 │ auslieferung mit     │  HTTP-Range    │ (Grundkarte, Spielgebiet, Fahrzeuge) │
 │ Range, CORS, 206/416 │                │        ▲ Interpolation (60 fps)      │
 └──────────────────────┘                │        │ Positionen ≤ 10×/s          │
   resources/map/                        │ Web Worker: Simulation, A*, Cache    │
   region.pmtiles, roadgraph.bin         └──────────────────────────────────────┘
```

- **Simulation** (`src/sim/engine.ts`): fester Schritt = 1 Spielminute, Seed-basiert (sfc32),
  keine Zeitgeber, kein `Math.random`. Im Zustand nur +, −, ×, ÷ und √ (IEEE-genau), damit
  alle Plattformen bitgleiche Ergebnisse liefern. Ein Vitest-Snapshot des Zustands-Hashs nach
  5.000 Schritten läuft in CI auf Linux, Windows und macOS.
- **Geschwindigkeit**: 1x = 1 Spielminute pro Sekunde, 10x = 10, 100x = 100 Schritte pro Sekunde
  (Annahme, Konstante `STEPS_PER_SECOND_AT_1X`). Höhere Stufen rechnen mehr Schritte, nie gröbere.
- **Übertragung**: Der Worker sendet höchstens 10 Meldungen pro Sekunde. Jede enthält ein
  `Float64Array` (je Fahrzeug Route-ID, Distanz entlang der Route, Zustand) als Transferable;
  neue Routen werden einmal mit Geometrie geschickt.
- **Interpolation** (`src/map/interpolator.ts`): Die Oberfläche interpoliert die *Distanz entlang
  der Route*, nicht die Luftlinie. Fahrzeuge bleiben so auch bei 100x auf der Straße. Die Anzeige
  läuft dafür 1,25 Meldeintervalle hinter der Simulation (bei 1x rund 1,25 s, sonst rund 0,13 s).
- **Routing**: Der Straßengraph wird beim Bauen aus OSM berechnet (`scripts/data/build-roadgraph.mjs`).
  Im Spiel sucht A* die kürzeste Fahrzeit; Ergebnisse landen in einem LRU-Cache. Es gibt keine
  Autobahnen und keine Kraftfahrstraßen (Schlepper < 60 km/h). Fuß-, Rad- und private Wege
  sind ausgeschlossen. Einbahnstraßen werden beachtet. Fähren und Feldwege sind enthalten.
- **Kartendaten**: Der Workflow `map-data` baut sie auf GitHub-Runnern, weil die
  Entwicklungsumgebung keinen Zugang zu OSM-Quellen hat. Er schneidet die Protomaps-Basemap
  als PMTiles zu, lädt OSM-Auszüge von Geofabrik und baut daraus mit osmium den Graphen.
  Das Ergebnis liegt als GitHub-Release `map-data-vN`, also außerhalb der Git-Historie.
  Schriften (Noto Sans, OFL) liegen im Repo.

## Annahmen (nachjustierbar)

| Thema | Annahme |
| --- | --- |
| Mittelpunkt | Groß Thondorf laut Nominatim: 53,1281° N, 10,6987° E; Radius 50 km, Daten bis 55 km |
| Spielbeginn | Montag, 1. März 2027, 06:00 |
| Fahrgeschwindigkeit Schlepper | 40 km/h auf Bundes-, Landes- und Kreisstraßen, 25 km/h im Ort, 15 km/h auf Feld- und Wirtschaftswegen |
| Fahrgeschwindigkeit Firmenwagen | 60 km/h außerorts, 30 km/h im Ort, 20 km/h auf Feldwegen |
| Fähre | pauschal 8 km/h (Überfahrt und Wartezeit) |
| Testfahrzeuge | 24 Schlepper (6 Marken mit gesicherten Farben, siehe maschinen.md) und 6 Firmenwagen; fahren zu zufälligen Feldwegen, ziehen dort Bahnen (8 km/h, 12 m Arbeitsbreite) und kehren gelegentlich zum Hof zurück |
| Felder | gedachtes Rechteck neben dem Feldweg, bis echte Feldblöcke eingebunden sind |
| Grundkarte | Protomaps-Basemap bis Zoom 14 (darüber Overzoom), ohne POI-Symbole (kein Sprite) |

## Offen

- **Mac-Signatur und Notarisierung**: Dafür braucht es ein Apple-Developer-Konto mit
  „Developer ID Application“-Zertifikat. Die Daten kommen als Secrets nach GitHub
  (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`).
  Bis dahin ist die `.dmg` unsigniert: Beim ersten Start Rechtsklick → Öffnen.
- **Windows-Signatur**: optional, verhindert die SmartScreen-Warnung.
- Feldblöcke (Lizenz und Verfügbarkeit für NI, ST, MV) prüfen.
- Gewichts- und Breitenbeschränkungen stehen im Graphen, fließen aber noch nicht ins Routing ein.

## Messwerte (Stand 4. Nov. 2026)

**Kartendaten `map-data-v2`:** PMTiles 63 MB (Zoom 0–14). Der Straßengraph umfasst 8 MB mit
174.230 Knoten und 207.010 Kanten. Fahrzeiten mit dem Schlepper ab Hof (A*, Plausibilitätstest):

| Ziel | Luftlinie | Strecke | Fahrzeit Schlepper |
| --- | --- | --- | --- |
| Uelzen | 20,4 km | 23,0 km | 37 min |
| Lüneburg | 23,4 km | 28,5 km | 47 min |
| Bleckede | 18,0 km | 21,5 km | 36 min |
| Neuhaus (rechts der Elbe, über Fähre) | 23,4 km | 29,1 km | 48 min |
| Dannenberg | 26,9 km | 32,6 km | 51 min |
| Salzwedel | 43,2 km | 53,8 km | 84 min |
| Wittingen | 44,6 km | 51,1 km | 79 min |

**Selbsttest 100x mit 30 Fahrzeugen.** CI-Runner haben keine GPU, WebGL läuft dort in
Software. Die Bildraten unten zeigen deshalb nur, dass alles funktioniert, nicht die Leistung
auf echter Hardware.

| Umgebung | Engine | Karte gezeichnet | Fahrzeuge | Schritte/s (Soll 100) | fps | Rechenzeit/Schritt |
| --- | --- | --- | --- | --- | --- | --- |
| Tauri-App, Windows-Runner | WebView2 (Edge 156) | ja, 1.336 Objekte | 30/30 | 62 | 14 | 24 ms¹ |
| Browser, Windows-Runner | Chromium 153 | ja, 1.365 Objekte | 30/30 | – | – | – |
| Tauri-App, Linux (xvfb, llvmpipe) | WebKitGTK | ja, 1.401 Objekte | 30/30 | 99,9 | 11 | 5,5 ms |
| Browser, Linux (SwiftShader) | Chromium 153 | ja | 30/30 | 100 | 6 | 1,7 ms |
| Node (Vitest, echter Graph) | – | – | 30 | – | – | 1,6 ms |
| Tauri-App, macOS | WKWebView | ausstehend | | | | |

¹ Der Worker teilt sich die 4 CPU-Kerne des Runners mit dem Software-Rendering.
Auf einem Rechner mit GPU fällt diese Last weg.

**Auf echter Hardware prüfen (Nils):** Die App mit gesetzter Umgebungsvariable starten.
Sie läuft dann 20 s mit 100x, schreibt das Ergebnis in die angegebene Datei und beendet
sich. Zielwerte: ≥ 90 Schritte/s und ≥ 30 fps.

macOS (Terminal):

```bash
LOHNBETRIEB_SELFTEST=1 LOHNBETRIEB_SELFTEST_OUT=~/selbsttest.json "/Applications/Lohnbetrieb-Simulation.app/Contents/MacOS/lohnbetrieb"
```

Windows (PowerShell, Installationspfad ggf. anpassen):

```powershell
$env:LOHNBETRIEB_SELFTEST=1; $env:LOHNBETRIEB_SELFTEST_OUT="$HOME\selbsttest.json"; & "$env:LOCALAPPDATA\Lohnbetrieb-Simulation\lohnbetrieb.exe"
```
