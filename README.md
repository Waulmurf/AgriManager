# Lohnbetrieb-Simulation

Managementspiel um ein Agrar-Lohnunternehmen in Groß Thondorf (50 km um 29584).
Die Anforderungen stehen in [docs/anforderungen.md](docs/anforderungen.md) und
[docs/maschinen.md](docs/maschinen.md). Technische Entscheidungen und Messwerte
stehen in [docs/technik.md](docs/technik.md).

**Stand:** technischer Prototyp (Karte, Simulation, 30 Testfahrzeuge, CI). Spielinhalte folgen erst danach.

## Schnellstart

Voraussetzungen: Node 22, Rust (stable) und die [Tauri-Voraussetzungen](https://v2.tauri.app/start/prerequisites/):
unter Windows „Microsoft C++ Build Tools“ (Desktopentwicklung mit C++) und WebView2 (bei Windows 10/11 vorhanden),
unter macOS die Xcode Command Line Tools (`xcode-select --install`).

```bash
npm ci
npm run map-data      # Kartendaten (Release map-data-vN) nach src-tauri/resources/map laden
npm run dev           # im Browser: http://localhost:5173
npm run tauri dev     # als Desktop-App
```

Kartendaten selbst bauen (ohne GitHub Actions, braucht [Docker Desktop](https://www.docker.com/products/docker-desktop/)):

```bash
npm run map-data:build
```

Tastatur: Leertaste = Pause/Weiter, 1 = 1x, 2 = 10x, 3 = 100x.

## Tests

```bash
npm test                          # Vitest: Rechenmodell, Routing, Determinismus
(cd src-tauri && cargo test -p range_proto)   # Range-Protokoll
npm run build && npx playwright test          # Oberfläche, Leistung (PW_PROJECTS=chromium,webkit)
```

Selbsttest im Browser: `http://localhost:5173/?selftest=1&seconds=20`.
In der fertigen App: Umgebungsvariable `LOHNBETRIEB_SELFTEST=1` setzen; die App misst
20 s lang 100x mit 30 Fahrzeugen, gibt `SELFTEST_RESULT {…}` aus und beendet sich.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/sim/` | Simulation (Web Worker): Straßengraph, A*-Routing, deterministischer Rechenkern |
| `src/map/` | Kartenstil, Fahrzeugsymbole, Interpolation der Fahrzeugpositionen |
| `src/game/` | Steuerung (Karte ↔ Worker), Spieluhr, Selbsttest |
| `src-tauri/` | Tauri-Hülle mit Protokoll `mapdata://` (HTTP-Range), Crate `range_proto` |
| `scripts/data/` | Bau der Kartendaten (läuft in GitHub Actions, Workflow `map-data`) |
| `public/map-assets/fonts/` | Kartenschriften (Noto Sans, SIL OFL) |

## Kartendaten

Grundkarte (PMTiles) und Straßengraph werden im Workflow `map-data` aus
OpenStreetMap erzeugt und als GitHub-Release abgelegt. Den Tag legt `data/map-data.json` fest;
für einen Neubau den Tag erhöhen.

Quellen der Kartendaten:
- Straßen, Orte und Grundkarte: © OpenStreetMap-Mitwirkende (ODbL), Basiskarte Protomaps
- Feldblöcke Niedersachsen/Bremen/Hamburg: © ML/SLA Niedersachsen, dl-de/by-2-0, Daten bearbeitet
- Feldblöcke Schleswig-Holstein: © Land Schleswig-Holstein, dl-de/zero-2-0
- Feldblockkataster Brandenburg: © Land Brandenburg, dl-de/by-2-0, Daten bearbeitet
- Sachsen-Anhalt und Mecklenburg-Vorpommern: Ackerflächen aus OpenStreetMap (amtliche Daten dort nicht offen bzw. Lizenz unklar)
