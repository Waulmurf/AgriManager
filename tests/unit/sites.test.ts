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

describe('Standorte und Gebäude', () => {
  it('Stammhof als Standort 1, Matschplatz ohne Gebäude', () => {
    const s = world(5);
    expect(s.company.sites!.length).toBe(1);
    expect(s.company.sites![0].node).toBe(s.homeNode);
    expect(s.business.hasBuilding('platz')).toBe(false);
  });

  it('Bau mit Genehmigung: Halle braucht erst den Platz, dann Genehmigung und Bauzeit', () => {
    const s = world(5);
    s.company.cash = 500_000;
    expect(s.command({ kind: 'build', siteId: 1, building: 'halle' })).toMatch(/Zuerst/);
    expect(s.command({ kind: 'build', siteId: 1, building: 'platz' })).toMatch(/beauftragt/);
    s.run(22 * 1440);
    expect(s.business.hasBuilding('platz', 1)).toBe(true);
    const cash = s.company.cash;
    expect(s.command({ kind: 'build', siteId: 1, building: 'halle' })).toMatch(/beauftragt/);
    expect(cash - s.company.cash).toBe(150_000 + 3_000);
    const b = s.company.sites![0].buildings.halle!;
    expect(b.permitUntil! - s.time).toBe(16 * 7 * 1440); // Außenbereich
    s.run(b.readyAt! - s.time + 1440);
    expect(s.business.hasBuilding('halle', 1)).toBe(true);
    // laufende Kosten am Monatsersten
    s.run(31 * 1440);
    expect(s.business.ledger.some((l) => l.category === 'Gebäude' && l.text.startsWith('Gebäude:'))).toBe(true);
  });

  it('Halle und Waschplatz senken den Verschleiß, Tank den Dieselpreis', () => {
    const s = world(5);
    const m = s.company.machines[0];
    const c0 = m.condition;
    s.business.wear(m, 100);
    const plain = c0 - m.condition;
    s.company.sites![0].buildings.halle = { done: true };
    s.company.sites![0].buildings.tank = { done: true };
    const c1 = m.condition;
    s.business.wear(m, 100);
    expect(c1 - m.condition).toBeCloseTo(plain * 0.75 * 0.9, 1);
  });

  it('eigene Werkstatt: Wartung am Hof zum halben Preis, wenn ein Mechaniker frei ist', () => {
    const s = world(5);
    s.company.sites![0].buildings.werkstatt = { done: true };
    const mech = { ...structuredClone(s.company.drivers[0]), id: 9, name: 'Mechaniker', isPlayer: false, kind: 'fest' as const, wage: 19 };
    mech.skills.werkstatt = 3;
    s.company.drivers.push(mech);
    const m = s.company.machines[0];
    const cash = s.company.cash;
    expect(s.command({ kind: 'service', machineId: m.id })).toMatch(/eigenen Werkstatt/);
    expect(cash - s.company.cash).toBeCloseTo(Math.round(((400 + 0.004 * m.newPrice) * 0.5) / 10) * 10, 0);
    expect(m.downUntil! - s.time).toBe(240);
  });

  it('zweiter Standort: kaufen, Schlepper überführen, Aufträge starten und enden dort', () => {
    const s = world(5);
    s.company.cash = 400_000;
    expect(s.command({ kind: 'buySite', offerKey: 'gw-dannenberg' })).toBe('gekauft');
    const site = s.company.sites![1];
    expect(s.command({ kind: 'transfer', machineId: 1, siteId: site.id, driverId: 1 })).toMatch(/überführt/);
    runUntil(s, () => !s.chefBusy, 3000);
    expect(s.company.machines[0].siteId).toBe(site.id);
    const u = s.playerUnits().find((x) => x.machineId === 1)!;
    expect(u.atHome).toBe(true);
    // Aufgeben: Maschinen zählen wieder zum Stammhof
    expect(s.command({ kind: 'sellSite', siteId: site.id })).toBe('aufgegeben');
    expect(s.company.machines[0].siteId).toBeUndefined();
  });

  it('Spielstand mit Standorten und Gebäuden läuft bitgleich weiter', () => {
    const a = world(6);
    a.company.cash = 400_000;
    a.command({ kind: 'build', siteId: 1, building: 'platz' });
    a.command({ kind: 'buySite', offerKey: 'rh-neuhaus' });
    a.run(10 * 1440);
    const b = world(6);
    b.restore(JSON.parse(JSON.stringify(a.serialize())));
    a.run(40 * 1440);
    b.run(40 * 1440);
    expect(b.hash()).toBe(a.hash());
    expect(b.company.sites!.length).toBe(2);
    expect(b.business.hasBuilding('platz', 1)).toBe(true);
  });
});
