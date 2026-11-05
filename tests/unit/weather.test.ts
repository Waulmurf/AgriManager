import { describe, expect, it } from 'vitest';
import { Weather, SOIL_WET } from '../../src/sim/weather';
import { gameDate } from '../../src/sim/economy';
import { parseRoadGraph, RoadClass } from '../../src/sim/roadgraph';
import { parseFields } from '../../src/sim/fields';
import { Simulation } from '../../src/sim/engine';
import { buildRoadGraphBuffer } from './helpers/grid';
import { buildFieldsBuffer } from './helpers/fields';

function world(seed = 3) {
  const n = 9;
  const nodes: [number, number][] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) nodes.push([i * 1000 - 4000, j * 1000 - 4000]);
  const edges: { u: number; v: number; cls: number }[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * n + i;
    if (i + 1 < n) edges.push({ u: a, v: a + 1, cls: j % 2 === 0 ? RoadClass.Residential : RoadClass.Track });
    if (j + 1 < n) edges.push({ u: a, v: a + n, cls: RoadClass.Tertiary });
  }
  const polys: [number, number][][] = [];
  const access: number[] = [];
  for (let k = 0; k < 200; k++) {
    const x = -3900 + (k % 20) * 390, y = -3900 + Math.floor(k / 20) * 780;
    polys.push([[x, y], [x + 350, y], [x + 350, y + 300], [x, y + 300]]);
    access.push(Math.round((y + 4000) / 1000) * n + Math.round((x + 4000) / 1000));
  }
  return new Simulation(parseRoadGraph(buildRoadGraphBuffer(nodes, edges)), { seed, vehicleCount: 0, fields: parseFields(buildFieldsBuffer(polys, access)) });
}
const runUntil = (s: Simulation, cond: () => boolean, max = 5000) => {
  for (let i = 0; i < max && !cond(); i++) s.step();
};

describe('Wetter', () => {
  it('Jahressumme und Regentage passen grob zur Station Uelzen (~700 mm, ~180 Tage)', () => {
    const w = new Weather(5);
    let mm = 0, days = 0;
    for (let d = 0; d < 365 * 5; d++) { const x = w.day(d); mm += x.rain; if (x.rain > 0) days++; }
    expect(mm / 5).toBeGreaterThan(550);
    expect(mm / 5).toBeLessThan(850);
    expect(days / 5).toBeGreaterThan(140);
    expect(days / 5).toBeLessThan(220);
  });

  it('Feldarbeit: im Winter oft gesperrt, im Frühjahr und Sommer meist möglich', () => {
    const w = new Weather(9);
    const blocked: Record<number, number> = {}, n: Record<number, number> = {};
    for (let d = 0; d < 365 * 4; d++) {
      const m = gameDate(d * 1440).month;
      n[m] = (n[m] ?? 0) + 1;
      if (w.dayBlocked(d)) blocked[m] = (blocked[m] ?? 0) + 1;
    }
    const share = (m: number) => (blocked[m] ?? 0) / n[m];
    expect(share(1) + share(2)).toBeGreaterThan(0.5);
    expect(share(4)).toBeLessThan(0.2);
    expect(share(8)).toBeLessThan(0.2);
  });

  it('deterministisch und speicherbar', () => {
    const a = new Weather(3), b = new Weather(3);
    for (let d = 0; d < 50; d++) expect(b.day(d)).toEqual(a.day(d));
    const c = new Weather(3);
    c.restore(JSON.parse(JSON.stringify(a.serialize())));
    expect(c.day(80)).toEqual(a.day(80));
    expect(a.forecast(10, 5).length).toBe(5);
  });

  it('nasser Boden: Gespann wartet auf dem Feld, Arbeitszeit zählt nicht, Auftrag in der Warteschlange wartet', () => {
    const s = world(5);
    for (const farm of s.farms!.farms) {
      s.command({ kind: 'visit', farmId: farm.id });
      runUntil(s, () => !s.chefBusy);
      if (s.business.requests.some((r) => r.status === 'offen' && r.service === 'grubbern')) break;
    }
    const req = s.business.requests.find((r) => r.status === 'offen' && r.service === 'grubbern')!;
    s.command({ kind: 'respond', requestId: req.id, action: 'accept' });
    s.command({ kind: 'buy', offerId: 1 });
    const g = s.company.machines.find((m) => m.type === 'grubber')!;
    const order = s.business.orders[0];
    runUntil(s, () => s.time % 1440 > 10 && s.time % 1440 < 60 && !s.weather.fieldBlocked(s.time), 20 * 1440);
    s.command({ kind: 'startJob', orderId: order.id, tractorId: 1, implementId: g.id });
    runUntil(s, () => s.playerUnits()[0].status.includes('grubbert'), 600);
    // Boden nass machen
    const day = s.weather.day(Math.floor(s.time / 1440));
    const soil = day.soil;
    day.soil = SOIL_WET + 5;
    const minutes = s.chefMinutes;
    const pos = s.position(s.playerUnits()[0].vehicle);
    s.run(30);
    expect(s.playerUnits()[0].status).toMatch(/wartet auf Wetter/);
    expect(s.chefMinutes).toBe(minutes);
    expect(s.position(s.playerUnits()[0].vehicle)).toEqual(pos);
    day.soil = soil;
    s.run(30);
    expect(s.chefMinutes).toBeGreaterThan(minutes);
  });
});
