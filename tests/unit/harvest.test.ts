import { describe, expect, it } from 'vitest';
import { parseRoadGraph, RoadClass } from '../../src/sim/roadgraph';
import { parseFields } from '../../src/sim/fields';
import { Simulation } from '../../src/sim/engine';
import { Crop, hasBga } from '../../src/sim/farms';
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
function harvestOrder(service: 'drusch' | 'roden' | 'kartoffelroden' | 'pflanzenschutz' | 'saat', crop: number, month: number, day: number, chain?: 'haecksler' | 'komplett', seed = 5) {
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
  chef.skills.kartoffel = 2;
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

describe('Abfahrer bei Feldwechsel', () => {
  it('Kipper wartet am falschen Feldrand (Drescher hat inzwischen das Feld gewechselt): fährt nach, Auftrag wird fertig', () => {
    const { s, o, chef } = harvestOrder('drusch', Crop.Getreide, 8, 1, 'komplett');
    const m = addMachine(s, { type: 'maehdrescher', model: 'Lexion 6800', power: 435, width: 9.3, haPerHour: 3, workKmh: 6, dieselLHa: 18, payloadT: 9 });
    const tr = addMachine(s, { type: 'schlepper', model: 'Axion 870', power: 200 });
    const k = addMachine(s, { type: 'kipper', model: 'Kipper 22 t', payloadT: 22 });
    const helper = { ...structuredClone(chef), id: 7, name: 'Abfahrer', isPlayer: false, kind: 'fest' as const, absences: [] };
    s.company.drivers.push(helper);
    runUntil(s, () => !s.weather.threshBlocked(s.time) && s.time % 1440 > 200 && s.time % 1440 < 300, 10 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m.id, implementId: m.id, haulers: [{ tractorId: tr.id, implementId: k.id, driverId: 7 }] })).toMatch(/gestartet/);
    const vs = (s as unknown as { vehicles: { machineId?: number; node: number; task?: { kind: string; phase: string } }[] }).vehicles;
    const wagon = vs.find((v) => v.machineId === tr.id)!;
    runUntil(s, () => wagon.task?.phase === 'wait', 600);
    expect(wagon.task?.phase).toBe('wait');
    // Fehlerfall nachstellen: Wagen steht an einem anderen Knoten als die Erntemaschine
    wagon.node = s.homeNode;
    runUntil(s, () => o.status === 'fertig', 4 * 1440);
    expect(o.status).toBe('fertig');
  });
});

describe('Drehschemel-Zug und Anhänger am Feldrand', () => {
  const lexion = { type: 'maehdrescher' as const, model: 'Lexion 6800', power: 435, width: 9.3, haPerHour: 3, workKmh: 6, dieselLHa: 18, payloadT: 9 };
  const ds = { type: 'kipper' as const, model: 'ZDK 180 Drehschemel', payloadT: 13, powerNeed: 110, drehschemel: true };
  const setup = () => {
    const x = harvestOrder('drusch', Crop.Getreide, 8, 1, 'komplett');
    const helper = { ...structuredClone(x.chef), id: 7, name: 'Abfahrer', isPlayer: false, kind: 'fest' as const, absences: [] };
    x.s.company.drivers.push(helper);
    runUntil(x.s, () => !x.s.weather.threshBlocked(x.s.time) && x.s.time % 1440 > 200 && x.s.time % 1440 < 300, 10 * 1440);
    return x;
  };

  it('Mulde oder Tandemkipper lassen sich nicht koppeln', () => {
    const { s, o } = setup();
    const m = addMachine(s, lexion);
    const tr = addMachine(s, { type: 'schlepper', model: 'Axion 870', power: 280 });
    const mulde = addMachine(s, { type: 'kipper', model: 'Halfpipe HP 20', payloadT: 18, powerNeed: 160 });
    const d = addMachine(s, ds);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m.id, implementId: m.id, haulers: [{ tractorId: tr.id, implementId: mulde.id, implementId2: d.id, driverId: 7 }] })).toMatch(/Drehschemel/);
  });

  it('Zug aus zwei Drehschemel-Anhängern: am Feldrand abgestellt, Drescher überlädt, volle werden abgeholt, Menge stimmt', () => {
    const { s, o } = setup();
    const m = addMachine(s, lexion);
    const tr = addMachine(s, { type: 'schlepper', model: 'Axion 870', power: 280 });
    const a1 = addMachine(s, ds);
    const a2 = addMachine(s, { ...ds, model: 'ZDK 180 (2)' });
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m.id, implementId: m.id, haulers: [{ tractorId: tr.id, implementId: a1.id, implementId2: a2.id, driverId: 7 }] })).toMatch(/gestartet/);
    // Zug fährt höchstens 25 km/h
    let maxKmh = 0, sawParked = false, sawFill = false;
    for (let i = 0; i < 6 * 1440 && o.status !== 'fertig'; i++) {
      s.step();
      const u = s.playerUnits().find((x) => x.machineId === tr.id)!;
      if (/Zug/.test(u.status)) maxKmh = Math.max(maxKmh, u.kmh);
      const p = s.parkedTrailers();
      if (p.length === 2) sawParked = true;
      if (p.some((x) => x.load > 1)) sawFill = true;
    }
    expect(o.status).toBe('fertig');
    expect(sawParked).toBe(true);
    expect(sawFill).toBe(true);
    expect(maxKmh).toBeGreaterThan(0);
    expect(maxKmh).toBeLessThanOrEqual(25);
    // am Ende: alles eingesammelt und abgeliefert
    runUntil(s, () => s.parkedTrailers().length === 0 && !s.busyMachineIds().includes(a1.id) && !s.busyMachineIds().includes(a2.id), 3 * 1440);
    expect(s.parkedTrailers().length).toBe(0);
    expect(o.doneT!).toBeGreaterThan(o.areaHa * 7.5 * 0.8);
    expect(o.doneT!).toBeLessThan(o.areaHa * 7.5 * 1.2);
  });

  it('Überladewagen füllt die am Feldrand abgestellten Anhänger', () => {
    const { s, o, chef } = setup();
    const m = addMachine(s, lexion);
    const tr = addMachine(s, { type: 'schlepper', model: 'Axion 870', power: 280 });
    const tr2 = addMachine(s, { type: 'schlepper', model: 'Arion 550', power: 180 });
    const ulw = addMachine(s, { type: 'ueberladewagen', model: 'ULW 2000', payloadT: 16, powerNeed: 160 });
    const a1 = addMachine(s, ds);
    const a2 = addMachine(s, { ...ds, model: 'ZDK 180 (2)' });
    const h2 = { ...structuredClone(chef), id: 8, name: 'Überlader', isPlayer: false, kind: 'fest' as const, absences: [] };
    s.company.drivers.push(h2);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m.id, implementId: m.id, haulers: [
      { tractorId: tr2.id, implementId: ulw.id, driverId: 8 },
      { tractorId: tr.id, implementId: a1.id, implementId2: a2.id, driverId: 7 },
    ] })).toMatch(/gestartet/);
    let sawFill = false;
    for (let i = 0; i < 6 * 1440 && o.status !== 'fertig'; i++) {
      s.step();
      if (s.parkedTrailers().some((x) => x.load > 1)) sawFill = true;
    }
    expect(o.status).toBe('fertig');
    expect(sawFill).toBe(true);
  });
});

describe('Schichtbetrieb und Arbeitszeit', () => {
  const lexion = { type: 'maehdrescher' as const, model: 'Lexion 6800', power: 435, width: 9.3, haPerHour: 3, workKmh: 6, dieselLHa: 18, payloadT: 9 };
  const rexor = { type: 'ruebenroder' as const, brand: 'Grimme', model: 'Rexor 6300', power: 627, width: 2.7, haPerHour: 1.6, workKmh: 6, dieselLHa: 32, payloadT: 30 };
  const helper = (chef: ReturnType<typeof harvestOrder>['chef'], id: number, name: string) => ({ ...structuredClone(chef), id, name, isPlayer: false, kind: 'fest' as const, absences: [] });
  /** Auftrag auf mehrere Felder des Kunden mit der Kultur ausdehnen (mehr als eine Schicht Arbeit) */
  const widen = (x: ReturnType<typeof harvestOrder>, crop: number, n: number) => {
    const idx = Array.from(x.s.farms!.fieldCrop, (_, i) => i);
    const fs = idx.filter((i) => x.s.farms!.fieldFarm[i] === x.o.farmId && x.s.farms!.fieldCrop[i] === crop);
    const all = fs.length >= n ? fs.slice(0, n) : idx.filter((i) => x.s.farms!.fieldCrop[i] === crop).slice(0, n);
    x.o.fields = all;
    x.o.areaHa = all.reduce((a, i) => a + x.s.fields!.areaHa[i], 0);
  };

  it('Drescher in zwei Schichten: Fahrerwechsel um 16 Uhr, mehr Fläche am Tag als mit einer Schicht', () => {
    const run = (shifts: 1 | 2) => {
      const x = harvestOrder('drusch', Crop.Getreide, 8, 1, 'haecksler');
      widen(x, Crop.Getreide, 6);
      const m = addMachine(x.s, lexion);
      x.s.company.drivers.push(helper(x.chef, 7, 'Spätschicht'));
      runUntil(x.s, () => !x.s.weather.threshBlocked(x.s.time) && x.s.time % 1440 > 200 && x.s.time % 1440 < 300, 10 * 1440);
      expect(x.s.command({ kind: 'startJob', orderId: x.o.id, tractorId: m.id, implementId: m.id, shifts })).toMatch(/gestartet/);
      const vs = (x.s as unknown as { vehicles: { machineId?: number; task?: { driverId: number } }[] }).vehicles;
      const v = vs.find((w) => w.machineId === m.id)!;
      const drivers = new Set<number>();
      const t0 = x.s.time;
      runUntil(x.s, () => { if (v.task) drivers.add(v.task.driverId); return x.o.status === 'fertig'; }, 8 * 1440);
      expect(x.o.status).toBe('fertig');
      return { minutes: x.s.time - t0, drivers };
    };
    const one = run(1);
    const two = run(2);
    expect(two.drivers.size).toBe(2);
    expect(one.drivers.size).toBe(1);
    expect(two.minutes).toBeLessThanOrEqual(one.minutes);
  });

  it('Rübenroder rund um die Uhr (3 Schichten): rodet auch nachts, drei Fahrer wechseln sich ab', () => {
    const x = harvestOrder('roden', Crop.Zuckerrueben, 10, 5);
    widen(x, Crop.Zuckerrueben, 4);
    const { s, o, chef } = x;
    const m = addMachine(s, rexor);
    s.company.drivers.push(helper(chef, 7, 'Spät'), helper(chef, 8, 'Nacht'));
    runUntil(s, () => !s.weather.fieldBlocked(s.time) && s.time % 1440 > 10 && s.time % 1440 < 200, 15 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m.id, implementId: m.id, shifts: 3 })).toMatch(/gestartet/);
    const vs = (s as unknown as { vehicles: { machineId?: number; state: number; task?: { driverId: number; phase: string } }[] }).vehicles;
    const v = vs.find((w) => w.machineId === m.id)!;
    const drivers = new Set<number>();
    let nightWork = false;
    runUntil(s, () => {
      if (v.task) drivers.add(v.task.driverId);
      const mod = s.time % 1440; // 0 = 06:00, 16–24 h nach 06:00 = 22–06 Uhr
      if (mod >= 17 * 60 && v.task?.phase === 'work' && !s.weather.fieldBlocked(s.time)) nightWork = true;
      return o.status === 'fertig';
    }, 6 * 1440);
    expect(o.status).toBe('fertig');
    expect(drivers.size).toBeGreaterThanOrEqual(2);
    expect(nightWork).toBe(true);
  });

  it('Abfahrer wartet, während der Drescher Feierabend hat: die Wartezeit zählt nicht als Arbeitszeit', () => {
    const { s, o, chef } = harvestOrder('drusch', Crop.Getreide, 8, 1, 'komplett');
    const m = addMachine(s, lexion);
    const tr = addMachine(s, { type: 'schlepper', model: 'Axion 870', power: 280 });
    const k = addMachine(s, { type: 'kipper', model: 'Kipper 22 t', payloadT: 22 });
    s.company.drivers.push({ ...helper(chef, 7, 'Abfahrer'), kind: 'saison' as const });
    runUntil(s, () => !s.weather.threshBlocked(s.time) && s.time % 1440 > 200 && s.time % 1440 < 300, 10 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m.id, implementId: m.id, haulers: [{ tractorId: tr.id, implementId: k.id, driverId: 7 }] })).toMatch(/gestartet/);
    // bis zum nächsten Morgen: der Abfahrer darf nicht 24 h gezählt werden
    const minutes = (s as unknown as { driverMinutes: Record<number, number> }).driverMinutes;
    runUntil(s, () => s.time % 1440 === 1439, 2 * 1440);
    expect(minutes[7] ?? 0).toBeLessThanOrEqual((minutes[1] ?? 0) + 120);
  });
});

describe('Abfahrer von Landwirten', () => {
  const lexion = { type: 'maehdrescher' as const, model: 'Lexion 6800', power: 435, width: 9.3, haPerHour: 3, workKmh: 6, dieselLHa: 18, payloadT: 9 };

  it('Landwirte fahren mit eigenem Gespann ab: fremdes Feld nach Stunden, eigenes Feld kostenlos, danach wieder weg', () => {
    const { s, o } = harvestOrder('drusch', Crop.Getreide, 8, 1, 'komplett');
    const m = addMachine(s, lexion);
    runUntil(s, () => !s.weather.threshBlocked(s.time) && s.time % 1440 > 200 && s.time % 1440 < 300, 10 * 1440);
    for (const f of s.farms!.farms) { f.livestock = true; f.satisfaction = 100; }
    let cands = s.business.hireCandidates(o.id, s.time);
    for (let d = 0; d < 10 && cands.filter((c) => c.eurH > 0).length < 1; d++) { s.run(1440); cands = s.business.hireCandidates(o.id, s.time); }
    const own = cands.find((c) => c.farmId === o.farmId);
    const foreign = cands.find((c) => c.farmId !== o.farmId)!;
    expect(foreign).toBeDefined();
    expect(foreign.eurH).toBe(90);
    if (own) expect(own.eurH).toBe(0);
    const hired = [foreign.farmId, ...(own ? [own.farmId] : [])];
    const machinesBefore = s.company.machines.length;
    runUntil(s, () => !s.weather.threshBlocked(s.time) && s.time % 1440 > 200 && s.time % 1440 < 300, 10 * 1440);
    cands = s.business.hireCandidates(o.id, s.time);
    const ok = hired.filter((f) => cands.some((c) => c.farmId === f));
    expect(ok.length).toBeGreaterThan(0);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m.id, implementId: m.id, hired: ok })).toMatch(/gestartet/);
    expect(s.company.machines.length).toBe(machinesBefore + 2 * ok.length);
    expect(s.playerUnits().some((u) => /Landwirt|:/.test(s.vehicleInfo[u.vehicle]?.name ?? ''))).toBe(true);
    runUntil(s, () => o.status === 'fertig', 6 * 1440);
    expect(o.status).toBe('fertig');
    // alle wieder auf ihrem Hof und aus dem Fuhrpark verschwunden
    runUntil(s, () => !s.company.machines.some((x) => x.hired), 2 * 1440);
    expect(s.company.machines.some((x) => x.hired)).toBe(false);
    expect(s.company.drivers.some((d) => d.hiredFarmId !== undefined)).toBe(false);
    const paid = s.business.ledger.filter((l) => l.text.startsWith('Abfahrer ')).reduce((a, l) => a - l.amount, 0);
    if (ok.includes(foreign.farmId)) expect(paid).toBeGreaterThan(0);
    else expect(paid).toBe(0);
    expect(o.doneT!).toBeGreaterThan(o.areaHa * 7.5 * 0.8);
  });

  it('nur bei Ketten mit Abfuhr', () => {
    const { s, o } = harvestOrder('drusch', Crop.Getreide, 8, 1, 'haecksler');
    const m = addMachine(s, lexion);
    expect(s.business.hireCandidates(o.id, s.time)).toEqual([]);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m.id, implementId: m.id, hired: [0] })).toMatch(/nur bei Ketten mit Abfuhr/);
  });
});

describe('Mehrere Maschinen auf einem Feld', () => {
  it('zweiter Drescher steigt mitten im Feld ein: Feld wird geteilt, schneller fertig, Menge stimmt', () => {
    const one = harvestOrder('drusch', Crop.Getreide, 8, 1, 'haecksler');
    const two = harvestOrder('drusch', Crop.Getreide, 8, 1, 'haecksler');
    const spec = { type: 'maehdrescher' as const, model: 'Lexion 6800', power: 435, width: 9.3, haPerHour: 3, workKmh: 6, dieselLHa: 18, payloadT: 9 };
    const run = (x: ReturnType<typeof harvestOrder>, second: boolean) => {
      const { s, o, chef } = x;
      const m1 = addMachine(s, spec);
      const m2 = addMachine(s, { ...spec, model: 'Lexion 2' });
      const helper = { ...structuredClone(chef), id: 7, name: 'Zweiter Fahrer', isPlayer: false, kind: 'fest' as const, absences: [] };
      s.company.drivers.push(helper);
      runUntil(s, () => !s.weather.threshBlocked(s.time) && s.time % 1440 > 200 && s.time % 1440 < 300, 10 * 1440);
      expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m1.id, implementId: m1.id })).toMatch(/gestartet/);
      if (second) {
        runUntil(s, () => s.playerUnits().some((u) => u.status.includes('drischt')), 600);
        s.run(5);
        expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m2.id, implementId: m2.id, driverId: 7 })).toMatch(/gestartet/);
      }
      const t0 = s.time;
      runUntil(s, () => o.status === 'fertig', 6 * 1440);
      expect(o.status).toBe('fertig');
      expect(o.doneT!).toBeGreaterThan(o.areaHa * 7.5 * 0.8);
      expect(o.doneT!).toBeLessThan(o.areaHa * 7.5 * 1.2);
      return s.time - t0;
    };
    const solo = run(one, false);
    const duo = run(two, true);
    expect(duo).toBeLessThan(solo);
  });

  it('zwei Rübenroder vor Arbeitsbeginn: jeder rodet die Hälfte', () => {
    const { s, o, chef } = harvestOrder('roden', Crop.Zuckerrueben, 10, 5);
    const spec = { type: 'ruebenroder' as const, brand: 'Grimme', model: 'Rexor', power: 627, width: 2.7, haPerHour: 1.6, workKmh: 6, dieselLHa: 32, payloadT: 30 };
    const r1 = addMachine(s, spec);
    const r2 = addMachine(s, { ...spec, model: 'Rexor 2' });
    s.company.drivers.push({ ...structuredClone(chef), id: 8, name: 'Roder Zwei', isPlayer: false, kind: 'fest' as const, absences: [] });
    runUntil(s, () => !s.weather.fieldBlocked(s.time) && s.time % 1440 > 10 && s.time % 1440 < 200, 15 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: r1.id, implementId: r1.id })).toMatch(/gestartet/);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: r2.id, implementId: r2.id, driverId: 8 })).toMatch(/gestartet/);
    runUntil(s, () => o.status === 'fertig', 10 * 1440);
    expect(o.status).toBe('fertig');
    expect(o.doneT!).toBeGreaterThan(o.areaHa * 80 * 0.85);
    expect(o.doneT!).toBeLessThan(o.areaHa * 80 * 1.15);
    // dritter Roder findet nichts mehr
    const r3 = addMachine(s, { ...spec, model: 'Rexor 3' });
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: r3.id, implementId: r3.id })).toMatch(/nicht startbar|nichts mehr frei/);
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

  it('mit Überladewagen bunkert der Roder während der Fahrt über und ist schneller fertig', () => {
    const run = (withUlw: boolean) => {
      const { s, o, chef } = harvestOrder('roden', Crop.Zuckerrueben, 10, 5);
      const m = addMachine(s, { type: 'ruebenroder', brand: 'Grimme', model: 'Rexor 6300', power: 627, width: 2.7, haPerHour: 1.6, workKmh: 6, dieselLHa: 32, payloadT: 30 });
      const tr = addMachine(s, { type: 'schlepper', model: 'Axion 870', power: 280 });
      const ulw = addMachine(s, { type: 'ueberladewagen', model: 'ULW 3000', payloadT: 22, powerNeed: 200 });
      s.company.drivers.push({ ...structuredClone(chef), id: 7, name: 'Überlader', isPlayer: false, kind: 'fest' as const, absences: [] });
      runUntil(s, () => !s.weather.fieldBlocked(s.time) && s.time % 1440 > 10 && s.time % 1440 < 200, 15 * 1440);
      expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m.id, implementId: m.id, haulers: withUlw ? [{ driverId: 7, tractorId: tr.id, implementId: ulw.id }] : [] })).toMatch(/gestartet/);
      const t0 = s.time;
      runUntil(s, () => o.status === 'fertig', 10 * 1440);
      expect(o.status).toBe('fertig');
      runUntil(s, () => !s.busyMachineIds().includes(ulw.id), 1440);
      expect(o.doneT!).toBeGreaterThan(o.areaHa * 80 * 0.85);
      expect(o.doneT!).toBeLessThan(o.areaHa * 80 * 1.15);
      return s.time - t0;
    };
    const solo = run(false);
    const ulw = run(true);
    expect(ulw).toBeLessThan(solo);
  });
});

describe('Lkw-Transport', () => {
  it('Rübenabfuhr: Anfrage in €/t, Lkw pendelt Miete → Zuckerfabrik, Rechnung nach der letzten Fuhre', () => {
    const s = world(5);
    for (let i = 0; i < s.farms!.fieldCrop.length; i += 2) s.farms!.fieldCrop[i] = Crop.Zuckerrueben;
    s.run(at(10, 5) - s.time);
    for (const f of s.farms!.farms) { f.known = true; f.satisfaction = 60; f.rivalUntil = 0; }
    let req;
    for (let d = 0; d < 30 && !req; d++) { s.run(1440); req = s.business.requests.find((r) => r.status === 'offen' && r.service === 'transport'); }
    expect(req).toBeDefined();
    expect(req!.tPerHa).toBe(80);
    expect(req!.destName).toBe('Zuckerfabrik Uelzen');
    const perT = req!.priceHa / req!.tPerHa!;
    expect(perT).toBeGreaterThan(1.5);
    expect(perT).toBeLessThan(15);
    req!.fields = req!.fields.slice(0, 1);
    req!.areaHa = Math.min(1.5, s.fields!.areaHa[req!.fields[0]]);
    s.command({ kind: 'respond', requestId: req!.id, action: 'accept' });
    const o = s.business.orders.find((x) => x.requestId === req!.id)!;
    const lkw = addMachine(s, { type: 'lkw', brand: 'MAN', model: 'TGX', power: 510, payloadT: 25 });
    const chef = s.company.drivers[0];
    chef.skills.transport = 0;
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: lkw.id, implementId: lkw.id })).toMatch(/CE/);
    chef.skills.transport = 2;
    runUntil(s, () => s.time % 1440 > 10 && s.time % 1440 < 60, 2 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: lkw.id, implementId: lkw.id })).toMatch(/gestartet/);
    const total = o.areaHa * 80;
    runUntil(s, () => o.status === 'fertig', 8 * 1440);
    expect(o.status).toBe('fertig');
    expect(o.doneT!).toBeCloseTo(total, 0);
    expect(s.business.invoices.some((i) => i.orderId === o.id && i.text.includes('Zuckerfabrik'))).toBe(true);
    // Auswertung: Umsatz in der Sparte Transport, Lkw mit Einsatz, Kunde mit Deckungsbeitrag
    s.run(1440);
    const a = s.business.analytics(s.time);
    expect(a.months.reduce((x, m) => x + m.revenue.transport, 0)).toBeGreaterThan(0);
    expect(a.customers.some((c) => c.farmId === o.farmId && c.orders === 1)).toBe(true);
    expect(a.drivers.find((d) => d.id === 1)!.minutes).toBeGreaterThan(0);
  });
});

describe('Gülle und Gärrest fremder Höfe und Biogasanlagen', () => {
  it('viehloser Betrieb bestellt Gülle von einem fremden Hof: das Fass holt sie dort', () => {
    const s = world(5);
    for (let i = 0; i < s.farms!.fieldCrop.length; i++) s.farms!.fieldCrop[i] = i % 2 ? Crop.Getreide : Crop.Mais;
    s.run(at(3, 20) - s.time);
    for (const f of s.farms!.farms) { f.known = true; f.satisfaction = 70; f.rivalUntil = 0; }
    let req;
    for (let d = 0; d < 40 && !req; d++) { s.run(1440); req = s.business.requests.find((r) => r.status === 'offen' && r.sourceFarmId !== undefined); }
    expect(req).toBeDefined();
    const src = s.farms!.farms[req!.sourceFarmId!];
    expect(src.livestock || hasBga(src)).toBe(true);
    expect(s.farms!.farms[req!.farmId].livestock).toBe(false);
    s.command({ kind: 'respond', requestId: req!.id, action: 'accept' });
    const o = s.business.orders.find((x) => x.requestId === req!.id)!;
    expect(o.sourceNode).toBe(src.homeNode);
  });

  it('nur Transport: Gärrest einer fremden BGA zum Feldrand, Schlepper mit Fass, Rechnung je m³', () => {
    const s = world(5);
    s.run(at(4, 1) - s.time);
    for (const f of s.farms!.farms) if (f.id % 9 === 4) f.areaHa = 200; // Testwelt: kleine Betriebe
    const bgaFarms = s.farms!.farms.filter((f) => hasBga(f));
    expect(bgaFarms.length).toBeGreaterThan(0);
    for (const f of s.farms!.farms) { f.known = bgaFarms.includes(f); f.satisfaction = 70; f.rivalUntil = 0; }
    let req;
    // Anfrage-Erzeugung direkt anstoßen (Chance 1), bis ein Gärrest-Transport dabei ist
    const biz = s.business as unknown as { maybeRequest(f: number, t: number, c: number, ch: string): { status: string; liquid?: boolean } | null };
    for (let k = 0; k < 200 && !req; k++) {
      const f = bgaFarms[k % bgaFarms.length];
      for (const r of s.business.requests) if (r.status === 'offen' && !r.liquid) r.status = 'abgelehnt';
      biz.maybeRequest(f.id, s.time, 1, 'anruf');
      req = s.business.requests.find((r) => r.status === 'offen' && r.liquid);
    }
    expect(req).toBeDefined();
    req!.fields = req!.fields.slice(0, 1);
    req!.areaHa = Math.min(1, s.fields!.areaHa[req!.fields[0]]);
    s.command({ kind: 'respond', requestId: req!.id, action: 'accept' });
    const o = s.business.orders.find((x) => x.requestId === req!.id)!;
    const fass = addMachine(s, { type: 'zubringer', brand: 'Kotte', model: 'VTR 24', tankM3: 24, powerNeed: 100 });
    const tractor = s.company.machines.find((m) => m.type === 'schlepper')!;
    runUntil(s, () => s.time % 1440 > 10 && s.time % 1440 < 60, 2 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: tractor.id, implementId: fass.id })).toMatch(/gestartet/);
    runUntil(s, () => o.status === 'fertig', 6 * 1440);
    expect(o.status).toBe('fertig');
    expect(o.doneT).toBeCloseTo(o.areaHa * 20, 0);
    expect(s.business.invoices.some((i) => i.orderId === o.id && i.text.includes('m³ Gärrest'))).toBe(true);
  });
});

describe('Weitere Ackerdienste (4b)', () => {
  it('Kartoffelroden mit gezogenem Bunkerroder: Schlepper zieht, Kunde stellt Anhänger', () => {
    const { s, o } = harvestOrder('kartoffelroden', Crop.Kartoffeln, 9, 5, 'haecksler');
    const roder = addMachine(s, { type: 'kartoffelroder', brand: 'Grimme', model: 'SE 260', width: 1.5, powerNeed: 150, haPerHour: 0.45, workKmh: 5, dieselLHa: 35, payloadT: 6 });
    const tr = addMachine(s, { type: 'schlepper', brand: 'Fendt', model: '724', power: 240 });
    runUntil(s, () => !s.weather.fieldBlocked(s.time) && s.time % 1440 > 10 && s.time % 1440 < 200, 15 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: roder.id, implementId: roder.id })).toMatch(/Schlepper|wählen/);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: tr.id, implementId: roder.id })).toMatch(/gestartet/);
    runUntil(s, () => o.status === 'fertig', 12 * 1440);
    expect(o.status).toBe('fertig');
    expect(o.doneT!).toBeGreaterThan(o.areaHa * 45 * 0.8);
    expect(roder.hours).toBeGreaterThan(0);
  });

  it('Drusch mit Abfuhr per Überladewagen: lädt am Feldrand über', () => {
    const { s, o } = harvestOrder('drusch', Crop.Getreide, 8, 1, 'komplett');
    const m = addMachine(s, { type: 'maehdrescher', model: 'Lexion 6800', power: 435, width: 9.3, haPerHour: 3, workKmh: 6, dieselLHa: 18, payloadT: 9 });
    const ulw = addMachine(s, { type: 'ueberladewagen', brand: 'Fliegl', model: 'ULW 3000', payloadT: 22, powerNeed: 150 });
    const tr = addMachine(s, { type: 'schlepper', brand: 'Fendt', model: '724', power: 240 });
    s.company.drivers.push({ ...structuredClone(s.company.drivers[0]), id: 9, name: 'Abfahrer', isPlayer: false, kind: 'fest' as const, absences: [] });
    runUntil(s, () => !s.weather.threshBlocked(s.time) && s.time % 1440 > 200 && s.time % 1440 < 300, 10 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: m.id, implementId: m.id, haulers: [{ driverId: 9, tractorId: tr.id, implementId: ulw.id }] })).toMatch(/gestartet/);
    runUntil(s, () => o.status === 'fertig' && !s.playerUnits().some((u) => u.status.includes('Abfahrer') || u.status.includes('Silo')), 6 * 1440);
    expect(o.status).toBe('fertig');
    expect(o.doneT!).toBeGreaterThan(o.areaHa * 7.5 * 0.5);
  });

  it('Pflanzenschutz braucht Sachkunde und eine Spritze', () => {
    const { s, o, chef } = harvestOrder('pflanzenschutz', Crop.Getreide, 4, 5);
    const sp = addMachine(s, { type: 'spritze', brand: 'Amazone', model: 'UX 5201', width: 24, powerNeed: 120, haPerHour: 9, workKmh: 10, dieselLHa: 1.5 });
    chef.skills.pflanzenschutz = 0;
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: 1, implementId: sp.id })).toMatch(/qualifiziert/);
    chef.skills.pflanzenschutz = 1;
    runUntil(s, () => !s.weather.fieldBlocked(s.time) && s.time % 1440 > 10 && s.time % 1440 < 200, 15 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: 1, implementId: sp.id })).toMatch(/gestartet/);
    runUntil(s, () => o.status === 'fertig', 6 * 1440);
    expect(o.status).toBe('fertig');
  });
});

