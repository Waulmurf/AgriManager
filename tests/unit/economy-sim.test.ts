/**
 * Wirtschaftlichkeits-Test: ein Bot führt den Betrieb auf den echten Kartendaten.
 * Standard 2 Spieljahre (dauert wenige Sekunden); ECONOMY_YEARS und ECONOMY_SEED ändern das,
 * ECONOMY_REPORT=<datei> schreibt den Bericht als Markdown.
 * Wird übersprungen, wenn die Kartendaten fehlen (npm run map-data).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseRoadGraph } from '../../src/sim/roadgraph';
import { parseFields } from '../../src/sim/fields';
import { Simulation } from '../../src/sim/engine';
import { reportMarkdown, runEconomyBot } from '../sim/economyBot';

const DIR = 'src-tauri/resources/map';
const has = existsSync(`${DIR}/roadgraph.bin`) && existsSync(`${DIR}/fields.bin`);
const buf = (f: string) => { const b = readFileSync(`${DIR}/${f}`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const YEARS = Number(process.env.ECONOMY_YEARS ?? 2);
const SEED = Number(process.env.ECONOMY_SEED ?? 2027);

describe.skipIf(!has)('Wirtschaftlichkeit (Bot spielt den Betrieb)', () => {
  it(`wächst über ${YEARS} Spieljahr(e) und bleibt plausibel`, () => {
    const s = new Simulation(parseRoadGraph(buf('roadgraph.bin')), { seed: SEED, vehicleCount: 0, fields: parseFields(buf('fields.bin')) });
    const t0 = Date.now();
    const r = runEconomyBot(s, Math.round(365 * YEARS));
    const md = reportMarkdown(r, `Wirtschaftlichkeits-Simulation (${YEARS} Jahr${YEARS === 1 ? '' : 'e'}, Seed ${SEED})`);
    if (process.env.ECONOMY_REPORT) writeFileSync(process.env.ECONOMY_REPORT, md);
    console.log(md);
    console.log(`Rechenzeit ${Math.round((Date.now() - t0) / 1000)} s`);
    const last = r.months.at(-1)!;
    // Der Betrieb arbeitet: genug Aufträge und Kunden, wenige Verspätungen und Absagen
    expect(r.orders.done).toBeGreaterThan(100 * YEARS);
    expect(r.orders.late / r.orders.done).toBeLessThan(0.2);
    expect(r.orders.cancelled / r.orders.done).toBeLessThan(0.1);
    expect(last.known).toBeGreaterThan(30);
    // Wachstum: mindestens ein weiteres Gespann
    expect(last.tractors).toBeGreaterThanOrEqual(2);
    // Umsatz je Schlepper und Jahr im Rahmen eines Lohnunternehmens (etwa 30–300 T€)
    const yearRevenue = r.months.slice(-12).reduce((a, m) => a + m.revenue, 0);
    expect(yearRevenue / last.tractors).toBeGreaterThan(30_000);
    expect(yearRevenue / last.tractors).toBeLessThan(300_000);
    // nicht pleite, Schulden im Rahmen; Feldarbeit deckt ihre direkten Kosten
    expect(last.equity).toBeGreaterThan(0);
    expect(last.debt).toBeLessThan(500_000);
    const db = Object.values(r.orders.byService).reduce((a, v) => a + v.margin, 0);
    expect(db).toBeGreaterThan(0);
    // kein Goldesel: Gewinn je Jahr unter dem halben Umsatz
    for (const y of r.years) expect(y.profit).toBeLessThan(y.revenue * 0.5);
  }, 900_000);
});
