# CLAUDE.md – Lohnbetrieb-Simulation

Managementspiel um ein Agrar-Lohnunternehmen in Groß Thondorf (50 km um 29584).
Kommunikation mit Nils auf Deutsch, kurze Zwischenstände. Nur bei unumkehrbaren
Entscheidungen fragen, sonst autonom arbeiten.

## Pflichtlektüre

- `docs/anforderungen.md` – Anforderungen (Quelle: Claude Doc https://claude.ai/artifact/8ixJJZJSEDKsVTwLeKeVeY, das Doc gilt)
- `docs/maschinen.md` – Marken, Händler, Maschinen, Preise, LWK-Sätze
- `docs/plan.md` – Arbeitsplan Phase 2, vorgemerkte Punkte (Fahrprofile, Lkw), Felddaten-Lizenzen
- `docs/technik.md` – Architektur, Annahmen, Messwerte
- `docs/ablaeufe.md` – Arbeitsketten aller Maschinen (Häcksler + Abfahrer, Drusch, Roden, Rübenmiete, Gülle …)

## Zielplattformen

Windows und macOS (kein Linux). Tests vorerst nur unter Windows; macOS wird nur gebaut.

## Befehle

```bash
npm ci
npm run map-data          # Kartendaten (Release laut data/map-data.json) nach src-tauri/resources/map
npm run map-data:build    # Kartendaten lokal bauen (Docker Desktop nötig, 15–30 min)
npm run dev               # Browser: http://localhost:5173
npm run tauri dev         # Desktop-App
npm test                  # Vitest (Rechenmodell, Routing, Felder, Determinismus)
npm run build && npx playwright test   # Oberfläche (Chromium ≙ WebView2)
cd src-tauri && cargo test -p range_proto
```

Selbsttest (Leistung): Browser `?selftest=1&seconds=20`, App mit `LOHNBETRIEB_SELFTEST=1`
(+ `LOHNBETRIEB_SELFTEST_OUT=<datei>`).

## Architektur in Kürze

- `src/sim/` Web Worker: `engine.ts` deterministische Simulation (1 Spielminute je Schritt,
  Seed, nur + − × ÷ √ im Zustand), `astar.ts` Routing + Fahrprofile, `roadgraph.ts` (RGR1),
  `fields.ts` (FLD1, Bahnenmuster im Feld), `worker.ts`, `protocol.ts`
- `src/map/` Kartenstil (Protomaps, lokale Schriften), Fahrzeugsymbole, Interpolation entlang der Route
- `src/game/` `controller.ts` (Karte ↔ Worker, Feld-Layer), Uhr, Selbsttest
- `src-tauri/` Protokoll `mapdata://` mit HTTP-Range (Crate `range/`), Selbsttest-Befehle
- `scripts/data/` Kartendaten: `build-region.sh` (Protomaps-Ausschnitt, OSM → Straßengraph,
  Feldblöcke → Felder), `build-roadgraph.mjs`, `build-fields.mjs`
- Determinismus: Referenz-Hash in `tests/unit/__snapshots__/engine.test.ts.snap`. Bei bewusster
  Änderung der Simulationslogik mit `npx vitest run tests/unit/engine.test.ts -u` aktualisieren.

## Stand (5. Nov. 2026)

- Phase 1 (technischer Prototyp) fertig: Windows getestet (läuft gut laut Nils), macOS arm64 gemessen.
- Phase 2, Schritt 1 (echte Felder) fertig: Kartendaten `map-data-v3`, jetzt `map-data-v4` (40.204 Felder, 312.455 ha).
- Phase 2, Schritt 2 (Kundenbetriebe, Startbetrieb) umgesetzt: `src/sim/farms.ts`, `src/sim/economy.ts`.
- Repo ist öffentlich (Actions kostenlos).
- Phase 2, Schritt 3 (Besuch, Anfrage, Verhandeln, Auftrag, Gerätekauf, Planungstafel) fertig:
  `src/sim/business.ts`, Spielerfahrzeuge in `engine.ts`, Oberfläche `src/ui/Panels.tsx`.
- Phase 2, Schritt 4 fertig: Kartendaten v4 (Tempolimits), Fahrprofile, Kurven, Arbeitstempo,
  Rüstzeiten, Diesel, Chef-Arbeitszeit, Rechtsklick-Menü (Rückruf).
- Phase 2, Schritt 5 fertig: Rechnungen, Zahlungen, Buchungen, Finanzen-Reiter, Spielstand
  (SQLite in der App über tauri-plugin-sql, localStorage im Browser), Autosave je Spieltag.
- Phase 2 (Prototyp der Kern-Schleife) damit komplett → Gate „Nils spielt“.
- Zahlungsregeln nach Rückmeldung: Zahlungsziel 30 Tage, Warnung bei Überfälligkeit, Anruf/Besuch
  binnen 14 Tagen, sonst verfällt die Rechnung.
- Warteschlange für den Chef (`Simulation.queue`, Befehle dequeue/queueMove), im Spielstand gespeichert.
- Kundenbindung: unter 20 % Zufriedenheit Wechsel zur Konkurrenz (`Farm.rivalUntil`), danach Probephase;
  Zeitschätzung `Simulation.planEstimates()`. Planungsboard ist für Phase 3 geplant (docs/plan.md).
- Phase 3 läuft (Schritte in docs/plan.md). Schritt 1 Personal fertig: `Employee` in `economy.ts`,
  Bewerbungen/Löhne/Erfahrung in `business.ts`, je Fahrer `driverMinutes` und Warteschlange in
  `engine.ts`, Reiter Personal. Spielerfahrzeuge entstehen dynamisch (`addPlayerVehicle`, Meldung `vehicles`).
- Schritt 2 Fuhrpark fertig: Katalog und Händler `src/data/catalog.ts`, Markt/Bestellung/Verkauf/Wartung/Pannen
  in `business.ts`, Pannen-Stillstand in `engine.ts` (`stepPlayer`), Reiter Fuhrpark und Markt.
- Schritt 3 Planungsboard fertig: `src/ui/Board.tsx`, `Simulation.planBoard()`, Befehle `plan`/`queueEdit`.

## CI (GitHub Actions)

- `ci.yml`: Unit- und Oberflächentests sowie Build mit Selbsttest unter Windows. Der macOS-Build läuft nur bei
  `[mac]` in der Commit-Nachricht, auf `main` oder bei manuellem Start (Minuten zählen dort zehnfach).
- `map-data.yml`: baut Kartendaten bei Änderung von `data/map-data.json` oder `scripts/data/**`
  und legt sie als Release ab. Für einen Neubau den Tag in `data/map-data.json` erhöhen.
- Minutenkontingent beachten: Ein Push kostet ca. 80–100 abgerechnete Minuten.

## Konventionen

- Code-Kommentare, Oberfläche, Commits auf Deutsch
- Entwicklung auf Branch `claude/lohnbetrieb-simulation-prototype-nki7j2`
- Keine Marken-Logos, nur Namen und Farben (HM-03); Markenfarben in `src/data/brands.ts`
- Quellen und Lizenzen der Daten im README pflegen
