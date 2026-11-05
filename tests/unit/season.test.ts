import { describe, expect, it } from 'vitest';
import { seasonServices } from '../../src/sim/business';
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
// Spielminute für Tag/Monat 2027 (ab 1. März)
const MONTH_START: Record<number, number> = { 3: 0, 4: 31, 5: 61, 6: 92, 7: 122, 8: 153, 9: 184, 10: 214, 11: 245, 12: 275 };
const at = (month: number, day: number) => (MONTH_START[month] + day - 1) * 1440 + 60;

describe('Jahreslauf', () => {
  it('Saisonkalender: Frühjahr Grubbern, Sommer Stoppel, Herbst Grubbern, Winter nichts', () => {
    expect(seasonServices(at(4, 10)).map((x) => x.service)).toEqual(['grubbern', 'guelle', 'guelle']);
    expect(seasonServices(at(6, 15))).toEqual([]);
    expect(seasonServices(at(7, 20)).map((x) => x.service)).toEqual(['stoppel']);
    expect(seasonServices(at(8, 20)).map((x) => x.service)).toEqual(['stoppel', 'guelle']);
    expect(seasonServices(at(9, 10)).map((x) => x.service).sort()).toEqual(['grubbern', 'guelle', 'stoppel']);
    expect(seasonServices(at(9, 25)).map((x) => x.service).sort()).toEqual(['grubbern']);
    expect(seasonServices(at(12, 1))).toEqual([]);
  });

  it('im Sommer kommen Anfragen zur Stoppelbearbeitung, im Winter keine', () => {
    const s = world(5);
    for (const f of s.farms!.farms) f.known = true;
    s.run(at(7, 15) - s.time);
    const before = s.business.requests.length;
    s.run(40 * 1440);
    const summer = s.business.requests.slice(before);
    expect(summer.some((r) => r.service === 'stoppel')).toBe(true);
    for (const r of summer.filter((x) => x.service === 'stoppel')) expect(r.priceHa).toBeLessThan(45);
    s.run(at(12, 1) - s.time);
    const w0 = s.business.requests.length;
    s.run(60 * 1440);
    expect(s.business.requests.length).toBe(w0);
  });

  it('Stoppelauftrag braucht eine Kurzscheibenegge', () => {
    const s = world(5);
    for (const f of s.farms!.farms) f.known = true;
    s.run(at(8, 5) - s.time);
    let req;
    for (let d = 0; d < 30 && !req; d++) { s.run(1440); req = s.business.requests.find((r) => r.status === 'offen' && r.service === 'stoppel'); }
    expect(req).toBeDefined();
    s.command({ kind: 'respond', requestId: req!.id, action: 'accept' });
    const o = s.business.orders.find((x) => x.requestId === req!.id)!;
    s.command({ kind: 'buy', offerId: 1 }); // Grubber
    const g = s.company.machines.find((m) => m.type === 'grubber')!;
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: 1, implementId: g.id })).toMatch(/Kurzscheibenegge/);
    s.command({ kind: 'buy', offerId: 3 }); // Horsch Joker
    const k = s.company.machines.find((m) => m.type === 'kurzscheibenegge')!;
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: 1, implementId: k.id })).toMatch(/gestartet|Eingeplant/);
  });

  it('Wintercheck: günstiger und weniger Pannen', () => {
    const s = world(5);
    s.run(at(11, 10) - s.time);
    const m = s.company.machines[0];
    const cash = s.company.cash;
    expect(s.command({ kind: 'service', machineId: m.id })).toMatch(/Wartung beauftragt/);
    const winterCost = cash - s.company.cash;
    expect(winterCost).toBeCloseTo(Math.round(((400 + 0.004 * m.newPrice) * 0.8) / 10) * 10, 0);
    expect(m.winterCheckAt).toBeDefined();
    const plain = { ...m, winterCheckAt: undefined };
    let a = 0, b = 0;
    for (let i = 0; i < 60 * 40000; i++) { if (s.business.rollBreakdown(m)) a++; if (s.business.rollBreakdown(plain)) b++; }
    expect(a).toBeLessThan(b);
  });
});
