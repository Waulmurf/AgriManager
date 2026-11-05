import { describe, expect, it } from 'vitest';
import { parseRoadGraph, RoadClass } from '../../src/sim/roadgraph';
import { parseFields } from '../../src/sim/fields';
import { Simulation } from '../../src/sim/engine';
import { Crop } from '../../src/sim/farms';
import { buildRoadGraphBuffer } from './helpers/grid';
import { buildFieldsBuffer } from './helpers/fields';
import type { Machine } from '../../src/sim/economy';

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
const MONTH_START: Record<number, number> = { 3: 0, 4: 31, 5: 61, 6: 92, 7: 122, 8: 153, 9: 184, 10: 214, 11: 245 };
const at = (month: number, day: number) => (MONTH_START[month] + day - 1) * 1440 + 60;

let nextId = 100;
function addMachine(s: Simulation, m: Partial<Machine> & Pick<Machine, 'type' | 'model'>): Machine {
  const full: Machine = { id: nextId++, brand: 'Claas', year: 2022, hours: 0, condition: 95, newPrice: 100000, purchasePrice: 100000, afaYears: 10, boughtAt: s.time, ...m };
  s.company.machines.push(full);
  // Fahrzeuge für selbstfahrende Maschinen/Schlepper anlegen
  (s as unknown as { syncPlayerVehicles(): void }).syncPlayerVehicles();
  return full;
}

/** Ernteauftrag (Drusch oder Roden) mit einem Feld */
function harvestOrder(service: 'drusch' | 'roden', crop: number, month: number, day: number, chain?: 'haecksler' | 'komplett', seed = 5) {
  const s = world(seed);
  for (let i = 0; i < s.farms!.fieldCrop.length; i += 2) s.farms!.fieldCrop[i] = crop;
  s.run(at(month, day) - s.time);
  for (const f of s.farms!.farms) { f.known = true; f.satisfaction = 60; f.rivalUntil = 0; }
  let req;
  for (let d = 0; d < 30 && !req; d++) {
    s.run(1440);
    req = s.business.requests.find((r) => r.status === 'offen' && r.service === service && (!chain || r.chain === chain));
  }
  expect(req).toBeDefined();
  req!.fields = req!.fields.slice(0, 1);
  req!.areaHa = s.fields!.areaHa[req!.fields[0]];
  s.command({ kind: 'respond', requestId: req!.id, action: 'accept' });
  const o = s.business.orders.find((x) => x.requestId === req!.id)!;
  const chef = s.company.drivers[0];
  chef.skills.drescher = 3;
  chef.skills.roder = 3;
  return { s, o, chef };
}

describe('Mähdrusch', () => {
  it('Anfrage im Sommer: nur Drusch oder mit Abfuhr, Preis je ha', () => {
    const { o } = harvestOrder('drusch', Crop.Getreide, 8, 1);
    expect(o.service).toBe('drusch');
    expect(o.chain === 'haecksler' || o.chain === 'komplett').toBe(true);
    expect(o.priceHa).toBeGreaterThan(120);
    expect(o.priceHa).toBeLessThan(240);
  });

  it('nur Drusch: Korntank, Anhänger am Feldrand, Menge ≈ Fläche × 7,5 t, nur bei trockenem Korn', () => {
    const { s, o } = harvestOrder('drusch', Crop.Getreide, 8, 1, 'haecksler');
    const m = addMachine(s, { type: 'maehdrescher', model: 'Lexion 6800', power: 435, width: 9.3, haPerHour: 3, workKmh: 6, dieselLHa: 18, payloadT: 9 });
    // vor 9 Uhr (Tau) ist der Drusch gesperrt
    runUntil(s, () => s.time % 1440 === 30, 2 * 1440);
    expect(s.weather.threshBlocked(s.time)).toMatch(/Tau/);
    runUntil(s, () => !s.weather.threshBlocked(s.time) && s.time % 1440 > 200 && s.time % 1440 < 300, 10 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m.id, implementId: m.id })).toMatch(/gestartet/);
    runUntil(s, () => o.status === 'fertig', 6 * 1440);
    expect(o.status).toBe('fertig');
    expect(o.doneT!).toBeGreaterThan(o.areaHa * 7.5 * 0.8);
    expect(o.doneT!).toBeLessThan(o.areaHa * 7.5 * 1.2);
  });

  it('mit Abfuhr braucht einen Kipper; Fahrer braucht Drescher-Stufe 2', () => {
    const { s, o, chef } = harvestOrder('drusch', Crop.Getreide, 8, 1, 'komplett');
    const m = addMachine(s, { type: 'maehdrescher', model: 'Lexion 6800', power: 435, width: 9.3, haPerHour: 3, workKmh: 6, dieselLHa: 18, payloadT: 9 });
    chef.skills.drescher = 1;
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m.id, implementId: m.id })).toMatch(/Stufe 2/);
    chef.skills.drescher = 3;
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m.id, implementId: m.id })).toMatch(/Abfahrer/);
  });
});

describe('Rübenroden', () => {
  it('Roder bunkert und legt eine Feldrandmiete an, ohne Abfahrer', () => {
    const { s, o } = harvestOrder('roden', Crop.Zuckerrueben, 10, 5);
    const m = addMachine(s, { type: 'ruebenroder', brand: 'Grimme', model: 'Rexor 6300', power: 627, width: 2.7, haPerHour: 1.6, workKmh: 6, dieselLHa: 32, payloadT: 30 });
    const w = addMachine(s, { type: 'kipper', model: 'HP 20', payloadT: 18, powerNeed: 160 });
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m.id, implementId: m.id, haulers: [{ driverId: 1, tractorId: 1, implementId: w.id }] })).toMatch(/Miete|Abfahrer/);
    runUntil(s, () => !s.weather.fieldBlocked(s.time) && s.time % 1440 > 10 && s.time % 1440 < 200, 15 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m.id, implementId: m.id })).toMatch(/gestartet/);
    runUntil(s, () => o.status === 'fertig', 10 * 1440);
    expect(o.status).toBe('fertig');
    expect(o.doneT!).toBeGreaterThan(o.areaHa * 80 * 0.85);
    expect(o.doneT!).toBeLessThan(o.areaHa * 80 * 1.15);
  });
});
