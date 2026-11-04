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

## Messwerte

Siehe Abschnitt unten; wird mit jedem CI-Lauf aktualisiert.
