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

/** Gülle-Auftrag annehmen; Güllefass (Kotte 13,9 m³) in den Fuhrpark */
function slurryOrder(seed = 5) {
  const s = world(seed);
  for (const f of s.farms!.farms) { f.known = true; f.livestock = true; }
  let req;
  for (let d = 0; d < 60 && !req; d++) { s.run(1440); req = s.business.requests.find((r) => r.status === 'offen' && r.service === 'guelle'); }
  expect(req).toBeDefined();
  s.command({ kind: 'respond', requestId: req!.id, action: 'accept' });
  const o = s.business.orders.find((x) => x.requestId === req!.id)!;
  s.company.machines.push({ id: 50, type: 'guellefass', brand: 'Kotte', model: 'Garant VT 13900', year: 2020, hours: 0, condition: 90, newPrice: 92000, tankM3: 13.9, width: 12, powerNeed: 180, haPerHour: 6.7, workKmh: 8, dieselLHa: 4, purchasePrice: 80000, afaYears: 10, boughtAt: s.time });
  return { s, o };
}

describe('Gülle', () => {
  it('Anfrage nennt Gabe und Preis je m³ (etwa 4 €/m³)', () => {
    const { o } = slurryOrder();
    expect(o.gabe === 20 || o.gabe === 25).toBe(true);
    const perM3 = o.priceHa / o.gabe!;
    expect(perM3).toBeGreaterThan(3.4);
    expect(perM3).toBeLessThan(5.2);
  });

  it('ohne Zubringer: Fass pendelt zwischen Güllelager und Feld, Menge wird ausgebracht, Rechnung je m³', () => {
    const { s, o } = slurryOrder();
    runUntil(s, () => s.time % 1440 > 10 && s.time % 1440 < 60 && !s.weather.fieldBlocked(s.time), 20 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: 1, implementId: 50 })).toMatch(/gestartet/);
    const phases = new Set<string>();
    runUntil(s, () => {
      const st = s.playerUnits().find((u) => u.machineId === 1)!.status;
      if (st.includes('Güllelager')) phases.add('lager');
      if (st.includes('bringt Gülle aus')) phases.add('aus');
      return o.status === 'fertig';
    }, 15 * 1440);
    expect(o.status).toBe('fertig');
    expect(phases.has('lager') && phases.has('aus')).toBe(true);
    expect(o.doneM3!).toBeCloseTo(o.areaHa * o.gabe!, -1);
    runUntil(s, () => !!o.invoiceId, 100);
    const inv = s.business.invoices.find((i) => i.orderId === o.id)!;
    expect(inv.text).toMatch(/m³/);
    expect(inv.amount).toBeCloseTo(o.priceHa * o.areaHa, 0);
  });

  it('mit Zubringer: zweites Gespann füllt am Feldrand um, beide Fahrer arbeiten', () => {
    const { s, o } = slurryOrder();
    runUntil(s, () => s.business.applicants.some((a) => a.person.skills.boden >= 1), 30 * 1440);
    s.command({ kind: 'hire', applicantId: s.business.applicants.find((a) => a.person.skills.boden >= 1)!.id, asKind: 'fest' });
    const d2 = s.company.drivers[1];
    s.company.cash += 200_000;
    s.command({ kind: 'buy', offerId: 4 }); // Fendt 516, 165 PS
    const t2 = s.company.machines.find((m) => m.model === '516 Vario')!;
    s.company.machines.push({ id: 51, type: 'zubringer', brand: 'Joskin', model: 'Quadra 20000 TS', year: 2018, hours: 0, condition: 80, newPrice: 66000, tankM3: 20, powerNeed: 160, purchasePrice: 40000, afaYears: 10, boughtAt: s.time });
    runUntil(s, () => s.time % 1440 > 10 && s.time % 1440 < 60 && !s.weather.fieldBlocked(s.time) && o.status === 'offen', 20 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: 1, implementId: 50, feeder: { driverId: d2.id, tractorId: t2.id, implementId: 51 } })).toMatch(/gestartet/);
    expect(s.driverBusy(d2.id)).toMatch(/Zubringer/);
    let transfers = 0, last = '';
    runUntil(s, () => {
      const st = s.playerUnits().find((u) => u.machineId === t2.id)!.status;
      if (st.includes('füllt das Ausbringfass um') && last !== st) transfers++;
      last = st;
      return o.status === 'fertig';
    }, 15 * 1440);
    expect(o.status).toBe('fertig');
    expect(transfers).toBeGreaterThan(0);
    expect(o.doneM3!).toBeCloseTo(o.areaHa * o.gabe!, -1);
    runUntil(s, () => !s.driverBusy(d2.id), 600);
    expect(s.driverBusy(d2.id)).toBeNull();
  });

  it('Zeitschätzung: mit Zubringer schneller als ohne', () => {
    const { s, o } = slurryOrder();
    const src = s.farms!.farms[o.farmId].homeNode;
    const solo = s.estimateSlurryMinutes(o.fields, o.gabe!, src, 6.7, 13.9);
    const chain = s.estimateSlurryMinutes(o.fields, o.gabe!, src, 6.7, 13.9, 20);
    expect(chain).toBeLessThan(solo);
  });
});
