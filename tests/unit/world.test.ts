import { describe, expect, it } from 'vitest';
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

import { farmCharacter, isOrganic } from '../../src/sim/farms';
import { NZ_ID } from '../../src/sim/business';

const MONTH_START: Record<number, number> = { 3: 0, 4: 31, 5: 61, 6: 92, 7: 122, 8: 153, 9: 184, 10: 214, 11: 245, 12: 275 };
const at = (month: number, day: number) => (MONTH_START[month] + day - 1) * 1440 + 60;
type Biz = {
  maybeRequest(f: number, t: number, c: number, ch: string): unknown; maybeRecommend(f: number, t: number): void;
  structuralChange(t: number): void; campaignDaily(t: number): void; satisfy(f: number, d: number, t: number): void;
};

describe('Kunden und Strukturwandel (Vorschläge 26–30)', () => {
  it('Kundencharaktere: feste Verteilung, Pedantische reagieren stärker, Treue verzeihen', () => {
    const s = world(5);
    const counts: Record<string, number> = {};
    for (let id = 0; id < 2000; id++) { const c = farmCharacter({ id }); counts[c] = (counts[c] ?? 0) + 1; }
    expect(counts.normal / 2000).toBeGreaterThan(0.3);
    expect(counts.preisdruecker / 2000).toBeGreaterThan(0.12);
    const b = s.business as unknown as Biz;
    const ped = s.farms!.farms.find((f) => farmCharacter(f) === 'pedantisch');
    const treu = s.farms!.farms.find((f) => farmCharacter(f) === 'treu');
    expect(ped ?? treu).toBeDefined();
    if (ped) { ped.satisfaction = 60; b.satisfy(ped.id, -10, s.time); expect(ped.satisfaction).toBe(42); }
    if (treu) { treu.satisfaction = 60; b.satisfy(treu.id, -10, s.time); expect(treu.satisfaction).toBe(55); }
  });

  it('Empfehlung: zufriedener Stammkunde bringt einen Nachbarn ins Adressbuch', () => {
    const s = world(5);
    const farm = s.farms!.farms[0];
    farm.known = true; farm.satisfaction = 95; farm.orderCount = 5;
    const b = s.business as unknown as Biz;
    for (let k = 0; k < 500 && !s.business.referrals.length; k++) b.maybeRecommend(farm.id, s.time);
    expect(s.business.referrals.length).toBe(1);
    expect(s.farms!.farms[s.business.referrals[0].to].known).toBe(true);
  });

  it('Strukturwandel: Aufgaben geben Flächen an Nachbarn, aufgegebene Betriebe fragen nicht mehr an; Spielstand behält das', () => {
    const a = world(5);
    const b = a.business as unknown as Biz;
    for (let k = 0; k < 40; k++) b.structuralChange(a.time);
    const closed = a.farms!.farms.filter((f) => f.closed);
    expect(closed.length).toBeGreaterThan(0);
    const c = closed[0];
    expect(c.fields.length).toBe(0);
    expect(b.maybeRequest(c.id, a.time, 1, 'anruf')).toBeNull();
    const fi = a.farms!.fieldFarm.findIndex((x, i) => x >= 0 && a.farms!.farms[x].fields.includes(i) && !a.farms!.farms[x].closed);
    expect(fi).toBeGreaterThanOrEqual(0);
    const r = world(5);
    r.restore(JSON.parse(JSON.stringify(a.serialize())));
    expect(r.farms!.farms[c.id].closed).toBe(true);
    expect(r.farms!.farms.filter((f) => f.closed).length).toBe(closed.length);
    a.run(3 * 1440); r.run(3 * 1440);
    expect(r.hash()).toBe(a.hash());
  });

  it('Ökobetriebe fragen Striegeln/Hacken statt Pflanzenschutz an', () => {
    const s = world(5);
    s.run(at(4, 10) - s.time);
    const eco = s.farms!.farms.find((f) => isOrganic(f) && f.fields.length >= 2) ?? s.farms!.farms[0];
    eco.organic = true; eco.known = true; eco.satisfaction = 70;
    const b = s.business as unknown as Biz;
    const seen = new Set<string>();
    for (let k = 0; k < 400; k++) {
      for (const r of s.business.requests) if (r.status === 'offen') { seen.add(r.service); r.status = 'abgelehnt'; }
      b.maybeRequest(eco.id, s.time, 1, 'anruf');
    }
    for (const r of s.business.requests) seen.add(r.service);
    expect(seen.has('pflanzenschutz')).toBe(false);
    expect(seen.has('striegeln')).toBe(true);
  });

  it('Nordzucker plant Abfuhrfenster nach Zuverlässigkeit; pünktlich steigert sie', () => {
    const s = world(5);
    for (let i = 0; i < s.farms!.fieldCrop.length; i += 3) s.farms!.fieldCrop[i] = 2; // Zuckerrüben
    s.company.machines.push({ id: 990, type: 'lkw', brand: 'MAN', model: 'TGX', year: 2022, hours: 0, condition: 95, newPrice: 185000, purchasePrice: 185000, afaYears: 6, boughtAt: 0, power: 510, payloadT: 25 } as never);
    const b = s.business as unknown as Biz;
    b.campaignDaily(at(9, 10));
    expect(s.business.nzQuotaT).toBeGreaterThan(100);
    // nächster Montag in der Kampagne
    let t = at(9, 15);
    while (Math.floor((t + 360) / 1440) % 7 !== 0) t += 1440;
    b.campaignDaily(t);
    const o = s.business.orders.find((x) => x.farmId === NZ_ID)!;
    expect(o).toBeDefined();
    expect(o.areaHa * o.tPerHa!).toBe(s.business.nzQuotaT);
    const before = s.business.nzScore;
    s.business.fieldDone(o, o.fields[0], t + 1440);
    expect(s.business.nzScore).toBe(before + 3);
  });
});
