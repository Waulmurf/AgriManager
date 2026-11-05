import { describe, expect, it } from 'vitest';
import { parseRoadGraph, RoadClass } from '../../src/sim/roadgraph';
import { parseFields } from '../../src/sim/fields';
import { Simulation } from '../../src/sim/engine';
import { bestCombo } from '../../src/ui/Board';
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
function withOrders(seed = 5, count = 2) {
  const s = world(seed);
  for (const farm of s.farms!.farms) {
    if (s.business.orders.length >= count) break;
    s.command({ kind: 'visit', farmId: farm.id });
    runUntil(s, () => !s.chefBusy);
    const req = s.business.requests.find((r) => r.status === 'offen');
    if (req) s.command({ kind: 'respond', requestId: req.id, action: 'accept' });
  }
  s.command({ kind: 'buy', offerId: 1 });
  return s;
}

describe('Planungsboard', () => {
  it('Auftrag mit Starttermin einplanen: startet erst an dem Tag', () => {
    const s = withOrders();
    const o = s.business.orders[0];
    const g = s.company.machines.find((m) => m.type === 'grubber')!;
    const day2 = (Math.floor(s.time / 1440) + 2) * 1440;
    expect(s.command({ kind: 'plan', orderId: o.id, driverId: 1, tractorId: 1, implementId: g.id, notBefore: day2 })).toMatch(/Eingeplant für Chef ab/);
    const bar = s.planBoard().find((x) => x.orderId === o.id)!;
    expect(bar.kind).toBe('queued');
    expect(bar.start).toBe(day2);
    expect(bar.end).toBeGreaterThan(bar.start);
    s.run(day2 - s.time - 10);
    expect(o.status).toBe('offen');
    s.run(20);
    expect(o.status).toBe('läuft');
    expect(s.planBoard().find((x) => x.orderId === o.id)!.kind).toBe('running');
  });

  it('umplanen: anderer Tag und anderer Fahrer, Reihenfolge nach Starttermin', () => {
    const s = withOrders(5, 2);
    const [o1, o2] = s.business.orders;
    const g = s.company.machines.find((m) => m.type === 'grubber')!;
    const d0 = Math.floor(s.time / 1440) * 1440;
    s.command({ kind: 'plan', orderId: o1.id, driverId: 1, tractorId: 1, implementId: g.id, notBefore: d0 + 3 * 1440 });
    s.command({ kind: 'plan', orderId: o2.id, driverId: 1, tractorId: 1, implementId: g.id, notBefore: d0 + 1440 });
    // früherer Starttermin steht vorn
    expect(s.queue.map((q) => (q.cmd as { orderId: number }).orderId)).toEqual([o2.id, o1.id]);
    // verschieben
    const q1 = s.queue.find((q) => (q.cmd as { orderId: number }).orderId === o1.id)!;
    expect(s.command({ kind: 'queueEdit', queueId: q1.id, notBefore: null })).toMatch(/Eingeplant/);
    expect(s.queue.find((q) => q.id === q1.id)!.notBefore).toBeUndefined();
    // gleicher Auftrag nicht doppelt
    expect(s.queue.filter((q) => (q.cmd as { orderId: number }).orderId === o1.id).length).toBe(1);
  });

  it('warnt bei Terminüberschreitung und doppelt belegtem Schlepper', () => {
    const s = withOrders(5, 2);
    const [o1, o2] = s.business.orders;
    const g = s.company.machines.find((m) => m.type === 'grubber')!;
    runUntil(s, () => s.business.applicants.length > 0, 20 * 1440);
    s.command({ kind: 'hire', applicantId: s.business.applicants[0].id, asKind: 'fest' });
    const d2 = s.company.drivers[1].id;
    const far = o1.latest + 2 * 1440;
    s.command({ kind: 'plan', orderId: o1.id, driverId: 1, tractorId: 1, implementId: g.id, notBefore: far });
    s.command({ kind: 'plan', orderId: o2.id, driverId: d2, tractorId: 1, implementId: g.id, notBefore: far });
    const bars = s.planBoard();
    const b1 = bars.find((x) => x.orderId === o1.id)!;
    const b2 = bars.find((x) => x.orderId === o2.id)!;
    expect(b1.warnings.some((w) => w.includes('Termin'))).toBe(true);
    expect(b2.warnings.some((w) => w.includes('Schlepper zur selben Zeit'))).toBe(true);
  });

  it('wählt das leistungsstärkste passende Gespann', () => {
    const machines = [
      { id: 1, type: 'schlepper', power: 200 },
      { id: 2, type: 'schlepper', power: 130 },
      { id: 3, type: 'grubber', powerNeed: 160, haPerHour: 1.7 },
      { id: 4, type: 'grubber', powerNeed: 120, haPerHour: 1.5 },
    ] as never;
    expect(bestCombo(machines)).toEqual({ tractorId: 1, implementId: 3 });
    expect(bestCombo([{ id: 2, type: 'schlepper', power: 130 }, { id: 3, type: 'grubber', powerNeed: 160, haPerHour: 1.7 }] as never)).toBeNull();
  });
});
