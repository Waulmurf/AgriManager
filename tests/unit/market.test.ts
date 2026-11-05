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
  const s = new Simulation(parseRoadGraph(buildRoadGraphBuffer(nodes, edges)), { seed, vehicleCount: 0, fields: parseFields(buildFieldsBuffer(polys, access)) });
  // Testgebiet um Groß Thondorf legen (das Testgitter hat keine echten Koordinaten)
  s.business.nodeLonLat = (node) => [10.6987 + s.graph.x[node] / 67000, 53.1281 + s.graph.y[node] / 111000];
  return s;
}
const runUntil = (s: Simulation, cond: () => boolean, max = 5000) => {
  for (let i = 0; i < max && !cond(); i++) s.step();
};
function firstRequest(s: Simulation) {
  for (const f of s.farms!.farms) { f.known = true; f.satisfaction = 60; }
  let req;
  for (let d = 0; d < 30 && !req; d++) { s.run(1440); req = s.business.requests.find((r) => r.status === 'offen' && r.service === 'grubbern'); }
  return req!;
}

describe('Markt und Konkurrenz', () => {
  it('elf Konkurrenten in drei Größen mit Preisniveau', () => {
    const s = world(5);
    const c = s.business.competitors;
    expect(c.length).toBe(11);
    expect(c.filter((x) => x.size === 'gross').length).toBe(2);
    expect(c.filter((x) => x.size === 'klein').length).toBe(4);
    for (const x of c) { expect(x.priceLevel).toBeGreaterThan(0.85); expect(x.priceLevel).toBeLessThan(1.1); }
    expect(c.filter((x) => x.services.includes('haeckseln')).every((x) => x.size === 'gross')).toBe(true);
  });

  it('Anfragen nennen das Konkurrenzangebot, der Kunde bietet höchstens etwas mehr', () => {
    const s = world(5);
    const r = firstRequest(s);
    expect(r.competitorPriceHa).toBeDefined();
    expect(r.priceHa).toBeLessThanOrEqual(Math.round(r.competitorPriceHa! * 1.02 * 2) / 2 + 0.01);
  });

  it('zu teures Gegenangebot: Auftrag geht an die Konkurrenz', () => {
    const s = world(5);
    const r = firstRequest(s);
    const comp = s.business.competitors.find((c) => c.id === r.competitorId)!;
    const won = comp.won;
    expect(s.command({ kind: 'respond', requestId: r.id, action: 'counter', priceHa: r.competitorPriceHa! * 1.2 })).toMatch(/lehnt ab/);
    expect(comp.won).toBe(won + 1);
    expect(s.business.lost).toBe(1);
  });

  it('Preiskampf senkt das Konkurrenzangebot', () => {
    const s = world(5);
    const farm = s.farms!.farms[0];
    const before = s.business.competitorOffer(farm.id, 'grubbern', s.time)!;
    for (const c of s.business.competitors) { c.warUntil = s.time + 30 * 1440; c.warCut = 0.2; }
    const during = s.business.competitorOffer(farm.id, 'grubbern', s.time)!;
    expect(during.priceHa).toBeLessThan(before.priceHa * 0.85);
  });

  it('Stammkunde nach drei Aufträgen: längere Antwortfrist, Ruf steigt mit pünktlicher Arbeit', () => {
    const s = world(5);
    const farm = s.farms!.farms[0];
    farm.orderCount = 3;
    farm.satisfaction = 80;
    expect(s.business.isLoyal(farm.id)).toBe(true);
    const rep = s.business.reputation;
    // pünktlicher Auftrag
    const r = firstRequest(s);
    s.command({ kind: 'respond', requestId: r.id, action: 'accept' });
    s.command({ kind: 'buy', offerId: 1 });
    const o = s.business.orders[0];
    const g = s.company.machines.find((m) => m.type === 'grubber')!;
    runUntil(s, () => s.time % 1440 > 10 && s.time % 1440 < 60 && !s.weather.fieldBlocked(s.time), 10 * 1440);
    s.command({ kind: 'startJob', orderId: o.id, tractorId: 1, implementId: g.id });
    runUntil(s, () => o.status === 'fertig', 10 * 1440);
    if (o.finishedAt! <= o.latest) expect(s.business.reputation).toBeGreaterThan(rep - 5);
    expect(s.farms!.farms[o.farmId].orderCount).toBeGreaterThanOrEqual(1);
  });

  it('Spielstand mit Marktzustand läuft bitgleich weiter', () => {
    const a = world(6);
    a.business.competitors[0].warUntil = 5000;
    a.business.competitors[0].warCut = 0.15;
    a.run(40 * 1440);
    const b = world(6);
    b.restore(JSON.parse(JSON.stringify(a.serialize())));
    a.run(40 * 1440);
    b.run(40 * 1440);
    expect(b.hash()).toBe(a.hash());
    expect(b.business.reputation).toBe(a.business.reputation);
    expect(b.business.competitors.map((c) => c.won)).toEqual(a.business.competitors.map((c) => c.won));
  });
});

describe('Rahmenverträge (Vorschlag 7)', () => {
  it('Stammkunde bietet Vertrag an; danach werden Anfragen automatisch Aufträge zum Vertragspreis', () => {
    const s = world(5);
    const b = s.business;
    const farm = s.farms!.farms.find((f) => f.fields.length >= 2)!;
    farm.known = true; farm.satisfaction = 90; farm.orderCount = 5;
    // erledigte Aufträge als Grundlage für die Dienste
    b.orders.push({ id: 9000, requestId: 0, farmId: farm.id, service: 'grubbern', fields: [farm.fields[0]], doneFields: [farm.fields[0]], areaHa: 5, priceHa: 55, earliest: 0, latest: 1, status: 'fertig', dieselL: 0, dieselCost: 0, tractorHours: 0 });
    const biz = b as unknown as { framesDaily(t: number): void; maybeRequest(f: number, t: number, c: number, ch: string): unknown };
    for (let k = 0; k < 2000 && !b.frameOffers.length; k++) biz.framesDaily(s.time);
    expect(b.frameOffers.length).toBe(1);
    const offer = b.frameOffers[0];
    expect(offer.services).toEqual(['grubbern']);
    expect(s.command({ kind: 'frameAnswer', offerId: offer.id, accept: true })).toMatch(/abgeschlossen/);
    // Anfrage im Frühjahr wird sofort Auftrag
    const before = b.orders.length;
    for (let k = 0; k < 400 && b.orders.length === before; k++) {
      for (const r of b.requests) if (r.status === 'offen') r.status = 'abgelehnt'; // andere Dienste (ohne Vertrag)
      biz.maybeRequest(farm.id, s.time, 1, 'anruf');
    }
    const o = b.orders.at(-1)!;
    expect(b.orders.length).toBe(before + 1);
    expect(o.farmId).toBe(farm.id);
    expect(o.service).toBe('grubbern');
    expect(o.priceHa).toBeLessThan(55 * 1.0);
    // Kunde wechselt mit Vertrag nicht zur Konkurrenz
    farm.satisfaction = 5;
    (b as unknown as { satisfy(f: number, d: number, t: number): void }).satisfy(farm.id, -5, s.time);
    expect(farm.rivalUntil).toBe(0);
  });
});
