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
const runUntil = (s: Simulation, cond: () => boolean, max = 5000) => {
  for (let i = 0; i < max && !cond(); i++) s.step();
};

import { MUNI_BASE } from '../../src/sim/municipal';

const MONTH_START: Record<number, number> = { 3: 0, 4: 31, 5: 61, 6: 92, 7: 122, 8: 153, 9: 184, 10: 214, 11: 245, 12: 275 };
const at = (month: number, day: number) => (MONTH_START[month] + day - 1) * 1440 + 60;
type Biz = { municipalDaily(t: number): void; eventsDaily(t: number): void };
let nid = 800;
function machine(s: Simulation, m: Record<string, unknown>) {
  const full = { id: nid++, brand: 'Dücker', year: 2022, hours: 0, condition: 95, newPrice: 40000, purchasePrice: 40000, afaYears: 10, boughtAt: 0, ...m };
  s.company.machines.push(full as never);
  (s as unknown as { syncPlayerVehicles(): void }).syncPlayerVehicles();
  return full as { id: number };
}

describe('Kommunal und Winterdienst', () => {
  it('Ausschreibung: Angebot unter der Konkurrenz gewinnt, Tour mit Auslegemäher, Rechnung an die Gemeinde', () => {
    const s = world(5);
    const b = s.business;
    s.run(at(5, 10) - s.time);
    const biz = b as unknown as Biz;
    for (let k = 0; k < 500 && !b.tenders.some((t) => t.service === 'maehen'); k++) biz.municipalDaily(s.time);
    const t = b.tenders.find((x) => x.service === 'maehen')!;
    expect(t).toBeDefined();
    t.km = 3; // kurze Strecke für den Test
    expect(s.command({ kind: 'tenderBid', tenderId: t.id, eurKm: t.competitorEurKm - 1 })).toMatch(/Angebot/);
    t.until = s.time;
    biz.municipalDaily(s.time + 1);
    const o = b.orders.find((x) => x.service === 'maehen')!;
    expect(o.farmId).toBeLessThanOrEqual(MUNI_BASE);
    expect(o.tourNode).toBeDefined();
    const m = machine(s, { type: 'auslegemaeher', model: 'MKM 700', width: 1.2, powerNeed: 110 });
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: 1, implementId: m.id })).toMatch(/gestartet/);
    runUntil(s, () => o.status === 'fertig', 3 * 1440);
    expect(o.status).toBe('fertig');
    expect(b.invoices.some((i) => i.orderId === o.id && i.amount > 0)).toBe(true);
    expect(b.farmName(o.farmId)).not.toMatch(/Betrieb/);
  });

  it('Winterdienst: Vertrag braucht Streuer, Glätte löst Einsatz aus, Versäumnis kostet Strafe', () => {
    const s = world(5);
    const b = s.business;
    s.run(at(10, 5) - s.time);
    const biz = b as unknown as Biz;
    for (let k = 0; k < 300 && !b.winterOffers.length; k++) biz.municipalDaily(s.time);
    const offer = b.winterOffers[0];
    expect(offer).toBeDefined();
    expect(s.command({ kind: 'winterAccept', offerId: offer.id })).toMatch(/Streuer/);
    const st = machine(s, { type: 'streuer', brand: 'Rauch', model: 'AXEO', width: 3, powerNeed: 100 });
    expect(s.command({ kind: 'winterAccept', offerId: offer.id })).toMatch(/abgeschlossen/);
    // Glätte erzwingen
    b.tempOfDay = () => -2;
    b.rainOfDay = () => 2;
    biz.municipalDaily(s.time);
    const o = b.orders.find((x) => x.service === 'winterdienst')!;
    expect(o).toBeDefined();
    // dieser Einsatz wird verpasst
    biz.municipalDaily(s.time + 1440);
    expect(o.status).toBe('fertig');
    expect(b.ledger.some((l) => l.text.startsWith('Winterdienst nicht ausgerückt') && l.amount < 0)).toBe(true);
    expect(b.winterContracts[0].strikes).toBe(1);
    // nächster Einsatz wird gefahren: Abrechnung nach Stunden
    biz.municipalDaily(s.time + 2 * 1440);
    const o2 = b.orders.filter((x) => x.service === 'winterdienst' && x.status === 'offen')[0];
    o2.areaHa = 4;
    expect(s.command({ kind: 'startJob', orderId: o2.id, tractorId: 1, implementId: st.id })).toMatch(/gestartet/);
    runUntil(s, () => o2.status === 'fertig', 2 * 1440);
    expect(o2.status).toBe('fertig');
    const inv = b.invoices.find((i) => i.orderId === o2.id)!;
    expect(inv.amount).toBeGreaterThan(0);
  });
});

describe('Ereignisse', () => {
  it('Messerabatt zur Agritechnica, Sturm stoppt Feldarbeit, Hagel trifft ungeschützte Kulturen', () => {
    const s = world(5);
    const b = s.business;
    expect(b.fairDiscount(at(11, 10))).toBe(0.08);
    expect(b.fairDiscount(at(9, 10))).toBe(0);
    s.run(at(6, 2) - s.time);
    const biz = b as unknown as Biz;
    for (let k = 0; k < 3000 && b.stormDay !== Math.floor(s.time / 1440); k++) biz.eventsDaily(s.time);
    expect(b.stormDay).toBe(Math.floor(s.time / 1440));
    // Hagel auf eigener Fläche mit stehender Kultur
    b.leases.push({ id: 1, farmId: 0, fields: [], areaHa: 10, soil: 35, irrigated: false, rentHa: 600, startAt: 0, endsAt: 1e9, crop: 'weizen', steps: [{ key: 'drusch', from: 0, to: 1, status: 'geplant' }], yieldFactor: 1, history: [] });
    for (let k = 0; k < 5000 && b.leases[0].yieldFactor === 1; k++) biz.eventsDaily(s.time);
    expect(b.leases[0].yieldFactor).toBeCloseTo(0.8);
  });
});
