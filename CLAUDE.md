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
- Schritt 4 fertig: Kalender/Zuschläge `src/sim/calendar.ts`, Abwesenheit/Zufriedenheit/Wünsche in
  `business.ts` (`staffDaily`), Ruhezeit und Abwesenheit in `engine.ts` (`driverBlocked`).
- Zeitarbeit (Leiharbeiter buchen/übernehmen) und Fahrerwechsel (`swapDriver`) ergänzt.
- Firmenwagen-Arten (Plätze), Berufe/Skills mit Stufe 0 (`ROLES`, `MACHINE_SKILL`), Pannen mit
  Entscheidung Händler/eigene Werkstatt und Ersatzteillage (`Machine.repair`, `checkRepairs`),
  Verschleißteillager am Hof (`Company.partsStock`, Werkstattwagen an Bord oder am Hof laden).
- Phase 3 damit komplett.
- Phase 4 läuft (Schritte in docs/plan.md). Schritt 1 Finanzen fertig: `src/sim/finance.ts` (Annuität,
  Leasing, AfA, Steuer, Bonität), Darlehen/Kontokorrent/Leasing/Versicherung/Jahresabschluss/Diesel in
  `business.ts` (`financeDaily`, `closeYear`), Reiter Finanzen.
- Schritt 2 Wetter fertig: `src/sim/weather.ts` (Regen, Temperatur, Bodenfeuchte, Vorhersage), Feldarbeit
  ruht bei Nässe/Frost (`Simulation.weatherHold`, Warteschlange), Anzeige oben und im Board.
- Schritt 3 Jahreslauf fertig: Dienstleistungen `Service` (grubbern, stoppel) mit `SERVICE_IMPLEMENT`,
  Saisonkalender `seasonServices`, Wintercheck (`Machine.winterCheckAt`).
- Schritt 4a Gülle-Kette fertig: Dienstleistung `guelle` (je m³, Gabe), Güllefass/Zubringer im Katalog,
  Umlauf Lager↔Feld (`slurry` im Job, `startSlurrySlice`, `sliceFieldRoute`), Zubringer-Task `feeder`.
- Schritt 4b Häckselkette fertig: Dienstleistung `haeckseln` (nur Häcksler/Komplettkette), Häcksler,
  Häckselwagen, Radlader im Katalog; `chop` im Job (`chopTick`), Tasks `haul` und `silo`, Oberfläche `ChopStart`.
- Phase 4 damit komplett.
- Phase 5 Markt fertig: `src/sim/market.ts` (Konkurrenten), Konkurrenzangebot je Anfrage, Stammkunden
  (`Farm.orderCount`, `isLoyal`), Preiskampf, Ruf (`Business.reputation`, `marketDaily`), Reiter Wettbewerb.
- Standorte fertig: `src/data/sites.ts` (Gebäude, Angebote), `Company.sites`, `Machine.siteId`, Bau/Kauf/Verkauf in
  `business.ts` (`sitesDaily`), Überführung (`transfer`), `homeOf(v)` in `engine.ts`, Reiter Standorte.
- Pacht und eigener Ackerbau fertig: `src/sim/farming.ts` (Kulturen, Boden, Fruchtfolge), Pachtangebote/Gebote/
  `askLand`/`setCrop`/`farmingDaily`/Ernte in `business.ts`, Eigenaufträge (`Order.ownLeaseId`, farmId −1), Reiter Ackerbau.
- Biogasanlage fertig: `src/sim/biogas.ts` (Größen, Ration mit Maisdeckel, Gärrest), Bau/Ausschreibung/Substrat/
  Gülleverträge/Gärrest/`biogasDaily` in `business.ts`, `Order.sourceNode` (Silo/Lager der Anlage), Reiter Biogas.
- Weitere Schichten (Standorte, Pacht, Ackerbau, Biogas) damit komplett.
- Vorschlag 4 fertig: Mähdrusch (`drusch`, Korntank, nur Drusch/mit Abfuhr per Kipper, `Weather.threshBlocked`) und
  Rübenroden (`roden`, Bunker, Feldrandmiete) als Erntedienste (`isHarvest`, `HAULER_TYPE`, `ChopState.bunker/miete`).
  Nils hat „Mache weiter mit dem Plan“ gesagt: Reihenfolge laut Empfehlung 4 → 1 → 13 → 5. Vorschläge für die nächsten Schichten
  (Nr. 1–19) stehen am Ende von docs/plan.md und warten auf Nils' Auswahl.

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
