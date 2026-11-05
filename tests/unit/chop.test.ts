import { describe, expect, it } from 'vitest';
import { parseRoadGraph, RoadClass } from '../../src/sim/roadgraph';
import { parseFields } from '../../src/sim/fields';
import { Simulation } from '../../src/sim/engine';
import { Crop } from '../../src/sim/farms';
import { buildRoadGraphBuffer } from './helpers/grid';
import { buildFieldsBuffer } from './helpers/fields';
import type { Employee, Machine } from '../../src/sim/economy';

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
const MONTH_START: Record<number, number> = { 3: 0, 4: 31, 5: 61, 6: 92, 7: 122, 8: 153, 9: 184, 10: 214 };
const at = (month: number, day: number) => (MONTH_START[month] + day - 1) * 1440 + 60;

let nextId = 100;
function addMachine(s: Simulation, m: Partial<Machine> & Pick<Machine, 'type' | 'model'>): Machine {
  const full: Machine = { id: nextId++, brand: 'Claas', year: 2022, hours: 0, condition: 95, newPrice: 100000, purchasePrice: 100000, afaYears: 10, boughtAt: s.time, ...m };
  s.company.machines.push(full);
  // Fahrzeuge für selbstfahrende Maschinen/Schlepper anlegen
  (s as unknown as { syncPlayerVehicles(): void }).syncPlayerVehicles();
  return full;
}
function addDriver(s: Simulation, name: string, skills: Partial<Employee['skills']>): Employee {
  const id = s.company.drivers.reduce((a, d) => Math.max(a, d.id), 0) + 1;
  const e: Employee = { ...structuredClone(s.company.drivers[0]), id, name, isPlayer: false, kind: 'fest', wage: 18, skills: { ...s.company.drivers[0].skills, ...skills }, absences: [], satisfaction: 80 };
  s.company.drivers.push(e);
  return e;
}

/** Häckselauftrag der gewünschten Art */
function chopOrder(chain: 'haecksler' | 'komplett', seed = 5) {
  const s = world(seed);
  // genug Maisfelder
  for (let i = 0; i < s.farms!.fieldCrop.length; i += 2) s.farms!.fieldCrop[i] = Crop.Mais;
  s.run(at(9, 20) - s.time);
  // Kunden erst jetzt kennenlernen (sonst sind sie nach unbeantworteten Anfragen zur Konkurrenz gewechselt)
  for (const f of s.farms!.farms) { f.known = true; f.satisfaction = 60; f.rivalUntil = 0; }
  let req;
  for (let d = 0; d < 30 && !req; d++) { s.run(1440); req = s.business.requests.find((r) => r.status === 'offen' && r.service === 'haeckseln' && r.chain === chain); }
  expect(req).toBeDefined();
  // nur ein Feld, damit der Test kurz bleibt
  req!.fields = req!.fields.slice(0, 1);
  req!.areaHa = s.fields!.areaHa[req!.fields[0]];
  s.command({ kind: 'respond', requestId: req!.id, action: 'accept' });
  const o = s.business.orders.find((x) => x.requestId === req!.id)!;
  const h = addMachine(s, { type: 'feldhaecksler', model: 'Jaguar 940', power: 530, width: 6, haPerHour: 2.4, workKmh: 7, dieselLHa: 30 });
  const chef = s.company.drivers[0];
  chef.skills.haecksler = 3;
  return { s, o, h, chef };
}

describe('Häckselkette', () => {
  it('Anfrage: Silomais im Herbst, nur Häcksler oder Komplettkette, Preis je ha', () => {
    const { o } = chopOrder('haecksler');
    expect(o.service).toBe('haeckseln');
    expect(o.priceHa).toBeGreaterThan(180);
    expect(o.priceHa).toBeLessThan(280);
  });

  it('nur Häcksler: Kundenwagen fahren ab, Häcksler wartet zwischendurch, Menge ≈ Fläche × 42 t', () => {
    const { s, o, h } = chopOrder('haecksler');
    runUntil(s, () => !s.weather.fieldBlocked(s.time) && s.time % 1440 > 10 && s.time % 1440 < 120, 10 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: h.id, implementId: h.id })).toMatch(/gestartet/);
    runUntil(s, () => o.status === 'fertig', 5 * 1440);
    expect(o.status).toBe('fertig');
    expect(o.doneT!).toBeGreaterThan(o.areaHa * 42 * 0.8);
    expect(o.doneT!).toBeLessThan(o.areaHa * 42 * 1.2);
  });

  it('Häcksler-Fahrer braucht Stufe 2, Komplettkette braucht Abfahrer', () => {
    const { s, o, h, chef } = chopOrder('komplett');
    chef.skills.haecksler = 1;
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: h.id, implementId: h.id })).toMatch(/Stufe 2/);
    chef.skills.haecksler = 3;
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: h.id, implementId: h.id })).toMatch(/Abfahrer/);
  });

  it('Komplettkette: eigene Abfahrer und Radlader, Wagen fahren zum Silo und kippen ab', () => {
    const { s, o, h } = chopOrder('komplett');
    const a1 = addDriver(s, 'Abfahrer Eins', { boden: 3 });
    const a2 = addDriver(s, 'Abfahrer Zwei', { boden: 3 });
    const rl = addDriver(s, 'Radlader Fahrer', { radlader: 3 });
    const t2 = addMachine(s, { type: 'schlepper', brand: 'Fendt', model: '516', power: 165 });
    const w1 = addMachine(s, { type: 'haeckselwagen', model: 'Big Body', payloadT: 11, powerNeed: 150 });
    const w2 = addMachine(s, { type: 'haeckselwagen', model: 'Big Body 2', payloadT: 11, powerNeed: 150 });
    const rad = addMachine(s, { type: 'radlader', brand: 'Volvo', model: 'L90H', weightT: 15, power: 240 });
    runUntil(s, () => !s.weather.fieldBlocked(s.time) && s.time % 1440 > 10 && s.time % 1440 < 120, 10 * 1440);
    const r = s.command({
      kind: 'startJob', orderId: o.id, tractorId: h.id, implementId: h.id, driverId: 1,
      haulers: [{ driverId: a1.id, tractorId: 1, implementId: w1.id }, { driverId: a2.id, tractorId: t2.id, implementId: w2.id }],
      roller: { driverId: rl.id, machineId: rad.id },
    });
    expect(r).toMatch(/gestartet/);
    expect(s.driverBusy(a1.id)).toMatch(/Abfahrer/);
    expect(s.driverBusy(rl.id)).toMatch(/Silo/);
    const seen = new Set<string>();
    runUntil(s, () => {
      for (const u of s.playerUnits()) {
        if (u.status.includes('neben dem Häcksler')) seen.add('neben');
        if (u.status.includes('kippt am Silo ab')) seen.add('kippt');
      }
      return o.status === 'fertig';
    }, 5 * 1440);
    expect(o.status).toBe('fertig');
    expect(seen.has('neben') && seen.has('kippt')).toBe(true);
    runUntil(s, () => !s.driverBusy(a1.id) && !s.driverBusy(a2.id) && !s.driverBusy(rl.id), 1440);
    expect(o.doneT!).toBeGreaterThan(o.areaHa * 42 * 0.8);
    expect(s.driverBusy(rl.id)).toBeNull();
  });

  it('Komplettkette ohne eigenen Radlader: Fremdwalze wird bezahlt', () => {
    const { s, o, h } = chopOrder('komplett');
    const a1 = addDriver(s, 'Abfahrer Eins', { boden: 3 });
    const w1 = addMachine(s, { type: 'haeckselwagen', model: 'Big Body', payloadT: 11, powerNeed: 150 });
    runUntil(s, () => !s.weather.fieldBlocked(s.time) && s.time % 1440 > 10 && s.time % 1440 < 120, 10 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: h.id, implementId: h.id, haulers: [{ driverId: a1.id, tractorId: 1, implementId: w1.id }] })).toMatch(/gestartet/);
    runUntil(s, () => o.status === 'fertig', 6 * 1440);
    expect(o.status).toBe('fertig');
    expect(o.externalCost!).toBeGreaterThan(0);
    expect(s.business.ledger.some((l) => l.text.startsWith('Fremdwalze'))).toBe(true);
  });
});
