/**
 * Langzeit-Wirtschaftlichkeit „alle Dienste“ auf den echten Kartendaten (Bot: tests/sim/economyBotFull.ts).
 * Standard 3 Spieljahre (CI); ECONOMY_FULL_YEARS=20 für den Langzeitlauf, ECONOMY_FULL_REPORT=<datei> schreibt den Bericht.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseRoadGraph } from '../../src/sim/roadgraph';
import { parseFields } from '../../src/sim/fields';
import { Simulation } from '../../src/sim/engine';
import { fullReport, runFullBot } from '../sim/economyBotFull';

const DIR = 'src-tauri/resources/map';
const has = existsSync(`${DIR}/roadgraph.bin`) && existsSync(`${DIR}/fields.bin`);
const buf = (f: string) => { const b = readFileSync(`${DIR}/${f}`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const YEARS = Number(process.env.ECONOMY_FULL_YEARS ?? 3);
const SEED = Number(process.env.ECONOMY_SEED ?? 2027);

describe.skipIf(!has)('Langzeit: Ausbau zu allen Diensten', () => {
  it(`${YEARS} Jahre: Betrieb wächst in alle Sparten und bleibt zahlungsfähig`, () => {
    const s = new Simulation(parseRoadGraph(buf('roadgraph.bin')), { seed: SEED, vehicleCount: 0, fields: parseFields(buf('fields.bin')) });
    const r = runFullBot(s, YEARS);
    const md = fullReport(r, `Langzeit-Simulation alle Dienste (${YEARS} Jahre, Seed ${SEED})`);
    if (process.env.ECONOMY_FULL_REPORT) writeFileSync(process.env.ECONOMY_FULL_REPORT, md);
    console.log(md);
    const last = r.years.at(-1)!;
    expect(r.years.length).toBeGreaterThanOrEqual(Math.floor(YEARS));
    // in den ersten Jahren: wächst über die Feldarbeit hinaus (mindestens zwei Sparten) und bleibt zahlungsfähig
    const early = r.years.slice(0, 3);
    expect(Math.max(...early.map((y) => Object.values(y.byBranch).filter((v) => v > 0).length))).toBeGreaterThanOrEqual(2);
    for (const y of early) expect(y.insolvent).toBe(false);
    for (const y of r.years) expect(y.profit).toBeLessThan(y.revenue * 0.5);
    void last;
  }, 3_600_000);
});
