/**
 * Spielbarkeit und Wirtschaftlichkeit verschiedener Strategien auf den echten Kartendaten:
 * Spezialisten (Gülle, Drusch, Rüben, Transport, Kommunal), Feldarbeit-Allrounder und Allrounder,
 * jeweils vorsichtig, normal oder mutig beim Investieren (Bot: tests/sim/economyBotFull.ts).
 *
 * Standard (CI): jede Strategie 1 Jahr „normal“, der Allrounder 2 Jahre vorsichtig und mutig.
 * Immer geprüft (Spielbarkeit): keine ungültigen Zahlen, keine hängende Erntekette (72 Arbeitsstunden ohne Fortschritt),
 * Spielstand speicher- und ladbar, Lauf bis zum Ende (außer bei endgültiger Insolvenz). Wirtschaftliche Erwartungen nur bis 2 Jahre.
 * Langläufe (bash):
 *   STRATEGY_PROFILES=drusch:mutig,allround:normal STRATEGY_YEARS=50 STRATEGY_OUT=<ordner> npx vitest run tests/unit/strategies.test.ts
 * schreibt je Lauf <strategie>-<invest>-<jahre>.json (Kennzahlen) und .md (Jahresbericht).
 * Vergleich aus einem Ordner: STRATEGY_REPORT_FROM=<ordner> STRATEGY_REPORT=<datei.md> npx vitest run tests/unit/strategies.test.ts
 */
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseRoadGraph } from '../../src/sim/roadgraph';
import { parseFields } from '../../src/sim/fields';
import { Simulation } from '../../src/sim/engine';
import { STRATEGY_KEYS, botProfile, fullReport, runFullBot, strategySummary, strategyTable, type InvestLevel, type StrategySummary } from '../sim/economyBotFull';

const DIR = 'src-tauri/resources/map';
const has = existsSync(`${DIR}/roadgraph.bin`) && existsSync(`${DIR}/fields.bin`);
const buf = (f: string) => { const b = readFileSync(`${DIR}/${f}`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const SEED = Number(process.env.ECONOMY_SEED ?? 2027);
const OUT = process.env.STRATEGY_OUT;
const newSim = () => new Simulation(parseRoadGraph(buf('roadgraph.bin')), { seed: SEED, vehicleCount: 0, fields: parseFields(buf('fields.bin')) });

/** Hauptsparte je Strategie: muss im ersten Jahr Umsatz bringen */
const MAIN: Record<string, 'feld' | 'ernte' | 'transport' | 'kommunal'> = { guelle: 'feld', drusch: 'ernte', rueben: 'ernte', transport: 'transport', kommunal: 'kommunal', feld: 'feld', organisch: 'feld', allround: 'feld' };

const runs: { key: string; invest: InvestLevel; years: number }[] = process.env.STRATEGY_PROFILES
  ? process.env.STRATEGY_PROFILES.split(',').map((x) => { const [key, invest] = x.split(':'); return { key, invest: (invest ?? 'normal') as InvestLevel, years: Number(process.env.STRATEGY_YEARS ?? 2) }; })
  : [
    ...STRATEGY_KEYS.map((key) => ({ key, invest: 'normal' as InvestLevel, years: 1 })),
    { key: 'allround', invest: 'vorsichtig' as InvestLevel, years: 2 },
    { key: 'allround', invest: 'mutig' as InvestLevel, years: 2 },
  ];

describe.skipIf(!has || !!process.env.STRATEGY_REPORT_FROM)('Strategien: Spielbarkeit und Wirtschaftlichkeit', () => {
  for (const run of runs) {
    it(`${run.key} (${run.invest}), ${run.years} ${run.years === 1 ? 'Jahr' : 'Jahre'}`, () => {
      const s = newSim();
      const r = runFullBot(s, run.years, botProfile(run.key, run.invest));
      const sum = strategySummary(r, run.years);
      if (OUT) {
        mkdirSync(OUT, { recursive: true });
        const base = `${OUT}/${run.key}-${run.invest}-${run.years}`;
        writeFileSync(`${base}.json`, JSON.stringify(sum, null, 1));
        writeFileSync(`${base}.md`, fullReport(r, `${r.profile.name}, ${run.invest}, ${run.years} Jahre (Seed ${SEED})`));
      }
      // Spielbarkeit: keine kaputten Zahlen, keine hängenden Erntemaschinen (14 Tage ohne Fortschritt), Spielstand speicher- und ladbar
      expect(sum.badNumbers).toBe(0);
      expect(sum.stuckHarvest).toBe(0);
      // läuft bis zum Ende – außer bei endgültiger Insolvenz (dann ist das Spiel vorbei)
      if (r.bankruptYear === null) expect(r.years.length).toBeGreaterThanOrEqual(Math.floor(run.years));
      const saved = JSON.parse(JSON.stringify(s.serialize()));
      const s2 = newSim();
      s2.restore(saved);
      s2.run(1440);
      expect(Number.isFinite(s2.company.cash)).toBe(true);
      // Wirtschaft nur in den kurzen Läufen (CI) als Erwartung; Langläufe dokumentieren das Ergebnis im Bericht
      if (run.years > 2) return;
      if (sum.orders >= 30) expect(sum.cancelShare).toBeLessThan(15);
      // Wirtschaftlichkeit: die Hauptsparte trägt Umsatz; wer vorsichtig investiert, gerät nicht in die Sanierung
      // (wer nur gebraucht und ohne Kredit kauft, kommt als Spezialist evtl. nie an seine Kernmaschine – das ist ein Befund, kein Fehler)
      if (run.invest !== 'vorsichtig') expect(r.years.reduce((a, y) => a + y.byBranch[MAIN[run.key]], 0)).toBeGreaterThan(0);
      if (run.invest === 'vorsichtig') expect(sum.sanierungDays).toBe(0);
      // kein Geldsegen: Gewinn höchstens halber Umsatz
      // (kleine Betriebe: Verkaufserlöse alter Maschinen können ein Jahr prägen, daher Sockel 100.000 €)
      for (const y of r.years) expect(y.profit).toBeLessThan(Math.max(100_000, y.revenue * 0.5));
    }, 7_200_000);
  }
});

describe.skipIf(!process.env.STRATEGY_REPORT_FROM)('Strategien: Vergleichsbericht', () => {
  it('Tabelle aus den Kennzahlen', () => {
    const dir = process.env.STRATEGY_REPORT_FROM!;
    // geplanter Zeitraum steht auch im Dateinamen <strategie>-<invest>-<jahre>.json
    const rows: StrategySummary[] = readdirSync(dir).filter((f) => f.endsWith('.json'))
      .map((f) => ({ horizon: Number(f.replace('.json', '').split('-').pop()), ...JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) }));
    const order = ['vorsichtig', 'normal', 'mutig'];
    rows.sort((a, b) => (a.horizon ?? a.years) - (b.horizon ?? b.years) || STRATEGY_KEYS.indexOf(a.key) - STRATEGY_KEYS.indexOf(b.key) || order.indexOf(a.invest) - order.indexOf(b.invest));
    const md = strategyTable(rows);
    if (process.env.STRATEGY_REPORT) writeFileSync(process.env.STRATEGY_REPORT, md);
    expect(rows.length).toBeGreaterThan(0);
  });
});
