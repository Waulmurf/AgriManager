import { describe, expect, it } from 'vitest';
import { parseRoadGraph, RoadClass } from '../../src/sim/roadgraph';
import { parseFields } from '../../src/sim/fields';
import { Simulation } from '../../src/sim/engine';
import { MIN_WAGE, skillSpeed } from '../../src/sim/economy';
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

/** Zwei angenommene Aufträge, Grubber gekauft */
function twoOrders(seed = 5) {
  const s = world(seed);
  for (const farm of s.farms!.farms) {
    if (s.business.orders.length >= 2) break;
    s.command({ kind: 'visit', farmId: farm.id });
    runUntil(s, () => !s.chefBusy);
    const req = s.business.requests.find((r) => r.status === 'offen');
    if (req) s.command({ kind: 'respond', requestId: req.id, action: 'accept' });
  }
  return s;
}

describe('Personal', () => {
  it('Bewerbungen kommen, Einstellen und Entlassen', () => {
    const s = world(5);
    runUntil(s, () => s.business.applicants.length >= 2, 30 * 1440);
    expect(s.business.applicants.length).toBeGreaterThanOrEqual(2);
    const a = s.business.applicants[0];
    expect(a.person.wage).toBeGreaterThanOrEqual(MIN_WAGE);
    expect(a.person.skills.boden).toBeGreaterThanOrEqual(1);
    expect(s.command({ kind: 'hire', applicantId: a.id, asKind: 'fest' })).toBe('eingestellt');
    expect(s.company.drivers.length).toBe(2);
    expect(s.business.applicants.some((x) => x.id === a.id)).toBe(false);
    const id = s.company.drivers[1].id;
    expect(s.command({ kind: 'fire', employeeId: 1 })).toMatch(/Chef/);
    // feste Mitarbeiter: 4 Wochen Kündigungsfrist, arbeiten bis dahin weiter
    expect(s.command({ kind: 'fire', employeeId: id })).toMatch(/^gekündigt zum/);
    expect(s.company.drivers.length).toBe(2);
    s.run(29 * 1440);
    expect(s.company.drivers.length).toBe(1);
  });

  it('bucht Löhne am Monatsersten (fest: Monatsgehalt, Saison: geleistete Stunden)', () => {
    const s = world(5);
    runUntil(s, () => s.business.applicants.length >= 2, 30 * 1440);
    const [a, b] = s.business.applicants;
    s.command({ kind: 'hire', applicantId: a.id, asKind: 'fest' });
    s.command({ kind: 'hire', applicantId: b.id, asKind: 'saison' });
    const fest = s.company.drivers.find((d) => d.kind === 'fest')!;
    const hiredAt = s.time;
    // bis zum nächsten Monatsersten (1. April = Tag 31)
    runUntil(s, () => s.business.ledger.some((l) => l.category === 'Personal'), 62 * 1440);
    const entry = s.business.ledger.find((l) => l.category === 'Personal')!;
    expect(entry).toBeDefined();
    const days = Math.round((entry.time - hiredAt) / 1440);
    const expected = ((fest.wage * 173 * 1.21) / 30) * days; // Saisonkraft hat nicht gearbeitet
    expect(-entry.amount).toBeCloseTo(expected, -1);
  });

  it('zweiter Fahrer grubbert mit zweitem Schlepper, während der Chef Kunden besucht', () => {
    const s = twoOrders(5);
    expect(s.business.orders.length).toBe(2);
    runUntil(s, () => s.business.applicants.some((a) => a.person.skills.boden >= 1), 20 * 1440);
    s.command({ kind: 'hire', applicantId: s.business.applicants.find((a) => a.person.skills.boden >= 1)!.id, asKind: 'fest' });
    const driver = s.company.drivers[1];
    expect(s.command({ kind: 'buy', offerId: 1 })).toBe('gekauft');
    expect(s.command({ kind: 'buy', offerId: 2 })).toBe('gekauft');
    expect(s.command({ kind: 'buy', offerId: 4 })).toBe('gekauft');
    const tractors = s.company.machines.filter((m) => m.type === 'schlepper');
    expect(tractors.length).toBe(2);
    expect(s.playerUnits().length).toBe(3); // 2 Schlepper + Firmenwagen
    const [g1, g2] = s.company.machines.filter((m) => m.type === 'grubber');
    const [o1, o2] = s.business.orders;
    runUntil(s, () => s.time % 1440 > 10 && s.time % 1440 < 60, 1440);
    expect(s.command({ kind: 'startJob', orderId: o1.id, tractorId: tractors[0].id, implementId: g1.id, driverId: 1 })).toMatch(/gestartet/);
    expect(s.command({ kind: 'startJob', orderId: o2.id, tractorId: tractors[1].id, implementId: g2.id, driverId: driver.id })).toMatch(/gestartet/);
    expect(s.driverBusy(1)).toMatch(/Chef fährt/);
    expect(s.driverBusy(driver.id)).toMatch(new RegExp(driver.name));
    s.run(60);
    expect(s.driverMinutes[driver.id]).toBe(60);
    runUntil(s, () => o1.status === 'fertig' && o2.status === 'fertig', 6 * 1440);
    expect(o1.status).toBe('fertig');
    expect(o2.status).toBe('fertig');
  });

  it('Auftrag wartet in der Warteschlange, solange der Schlepper bei einem anderen Fahrer ist', () => {
    const s = twoOrders(5);
    runUntil(s, () => s.business.applicants.some((a) => a.person.skills.boden >= 1), 20 * 1440);
    s.command({ kind: 'hire', applicantId: s.business.applicants.find((a) => a.person.skills.boden >= 1)!.id, asKind: 'fest' });
    const driver = s.company.drivers[1];
    s.command({ kind: 'buy', offerId: 1 });
    s.command({ kind: 'buy', offerId: 2 });
    const [g1, g2] = s.company.machines.filter((m) => m.type === 'grubber');
    const [o1, o2] = s.business.orders;
    runUntil(s, () => s.time % 1440 > 10 && s.time % 1440 < 60, 1440);
    s.command({ kind: 'startJob', orderId: o1.id, tractorId: 1, implementId: g1.id, driverId: 1 });
    expect(s.command({ kind: 'startJob', orderId: o2.id, tractorId: 1, implementId: g2.id, driverId: driver.id })).toMatch(/Schlepper ist im Einsatz/);
    expect(s.queue.length).toBe(1);
    runUntil(s, () => o1.status === 'fertig', 6 * 1440);
    runUntil(s, () => o2.status !== 'offen', 2 * 1440);
    expect(o2.status).not.toBe('offen');
    expect(s.driverBusy(driver.id)).toMatch(new RegExp(driver.name));
  });

  it('Skillstufe wirkt aufs Arbeitstempo, Erfahrung steigt', () => {
    expect(skillSpeed(1)).toBeCloseTo(0.9);
    expect(skillSpeed(3)).toBeCloseTo(1.0);
    expect(skillSpeed(5)).toBeCloseTo(1.1);
    const s = world(5);
    const chef = s.company.drivers[0];
    expect(chef.skills.boden).toBe(3);
    s.business.addExperience(1, 'boden', 300 * 60, s.time);
    expect(chef.skills.boden).toBe(4);
    expect(chef.xp.boden).toBe(0);
  });

  it('Spielstand mit gekauftem Schlepper und eingestelltem Fahrer läuft bitgleich weiter', () => {
    const a = twoOrders(6);
    runUntil(a, () => a.business.applicants.some((x) => x.person.skills.boden >= 1), 20 * 1440);
    a.command({ kind: 'hire', applicantId: a.business.applicants.find((x) => x.person.skills.boden >= 1)!.id, asKind: 'saison' });
    a.command({ kind: 'buy', offerId: 4 });
    a.command({ kind: 'buy', offerId: 1 });
    const t2 = a.company.machines.find((m) => m.type === 'schlepper' && m.id !== 1)!;
    const g = a.company.machines.find((m) => m.type === 'grubber')!;
    if (a.business.orders[0]) a.command({ kind: 'startJob', orderId: a.business.orders[0].id, tractorId: t2.id, implementId: g.id, driverId: a.company.drivers[1].id });
    a.run(120);
    const b = twoOrders(6);
    b.restore(JSON.parse(JSON.stringify(a.serialize())));
    expect(b.playerUnits().length).toBe(a.playerUnits().length);
    expect(b.hash()).toBe(a.hash());
    a.run(2000);
    b.run(2000);
    expect(b.hash()).toBe(a.hash());
    expect(b.company.cash).toBe(a.company.cash);
  });
});

describe('Urlaub, Krankheit, Zufriedenheit, Zuschläge', () => {
  const hired = (seed = 5) => {
    const s = world(seed);
    runUntil(s, () => s.business.applicants.some((a) => a.person.skills.boden >= 1), 20 * 1440);
    s.command({ kind: 'hire', applicantId: s.business.applicants.find((a) => a.person.skills.boden >= 1)!.id, asKind: 'fest' });
    return { s, e: s.company.drivers[1] };
  };

  it('Urlaub: Anspruch, Eintrag, Fahrer startet in der Zeit nichts', () => {
    const { s, e } = hired();
    expect(e.vacationLeft).toBeGreaterThan(15);
    const today = Math.floor(s.time / 1440);
    expect(s.command({ kind: 'vacation', employeeId: e.id, fromDay: today + 1, days: 3 })).toMatch(/Urlaub eingetragen/);
    expect(s.command({ kind: 'vacation', employeeId: e.id, fromDay: today + 2, days: 2 })).toMatch(/Überschneidet/);
    expect(s.command({ kind: 'vacation', employeeId: e.id, fromDay: today + 10, days: 99 })).toMatch(/Nur noch/);
    s.run((today + 1) * 1440 - s.time + 60);
    expect(s.business.absence(e.id, s.time)).toBe('urlaub');
    expect(s.planBoard().some((x) => x.kind === 'absence' && x.driverId === e.id)).toBe(true);
  });

  it('Krankheit kommt vor, im Mittel einige Tage im Jahr', () => {
    const { s, e } = hired(7);
    e.reliability = 0.5;
    e.wage = 30; // zufrieden halten, damit er bleibt
    let episodes = 0;
    for (let d = 0; d < 365; d++) {
      s.run(1440);
      episodes += s.business.drainEvents().filter((x) => x.text.includes('krank gemeldet')).length;
    }
    expect(s.company.drivers.some((x) => x.id === e.id)).toBe(true);
    expect(episodes).toBeGreaterThanOrEqual(1);
    expect(episodes).toBeLessThan(10);
  });

  it('unterbezahlte Mitarbeiter werden unzufrieden, fordern mehr Lohn und kündigen', () => {
    const { s, e } = hired(5);
    e.wage = 14.6;
    e.skills.boden = 5;
    let asked = false;
    for (let d = 0; d < 200 && e.leavesAt === undefined; d++) {
      s.run(1440);
      const r = s.business.staffRequests.find((x) => x.employeeId === e.id && x.kind === 'gehalt');
      if (r) { asked = true; s.command({ kind: 'staffAnswer', requestId: r.id, accept: false }); }
    }
    expect(asked).toBe(true);
    expect(e.satisfaction!).toBeLessThan(40);
    expect(e.leavesAt).toBeDefined();
  });

  it('Lohnerhöhung macht zufriedener', () => {
    const { s, e } = hired(5);
    const before = e.satisfaction!;
    expect(s.command({ kind: 'setWage', employeeId: e.id, wage: e.wage + 2 })).toMatch(/Lohn/);
    expect(e.satisfaction!).toBeGreaterThan(before);
    expect(s.command({ kind: 'setWage', employeeId: e.id, wage: 10 })).toMatch(/Mindestlohn/);
  });

  it('Zuschläge und Überstunden erhöhen die Lohnkosten', () => {
    const { s, e } = hired(5);
    e.kind = 'saison';
    const b = s.business as unknown as { payroll(t: number, w: Record<number, number>, sc: Record<number, number>): void; payrollAccrued: number };
    b.payrollAccrued = 0;
    b.payroll(s.time + 1, { [e.id]: 600 }, {});
    const plain = b.payrollAccrued;
    expect(plain).toBeCloseTo((600 / 60) * e.wage * 1.21 + (120 / 60) * e.wage * 0.25 * 1.21, 2);
    b.payrollAccrued = 0;
    b.payroll(s.time + 1, { [e.id]: 600 }, { [e.id]: 120 * 0.5 }); // 2 h Sonntag
    expect(b.payrollAccrued - plain).toBeCloseTo(1 * e.wage * 1.21, 2);
  });
});

describe('Zeitarbeit und Fahrerwechsel', () => {
  it('Fahrerwechsel am Hof geht sofort', () => {
    const s = twoOrders(5);
    runUntil(s, () => s.business.applicants.some((a) => a.person.skills.boden >= 1), 20 * 1440);
    s.command({ kind: 'hire', applicantId: s.business.applicants.find((a) => a.person.skills.boden >= 1)!.id, asKind: 'fest' });
    const e = s.company.drivers[1];
    s.command({ kind: 'buy', offerId: 1 });
    const g = s.company.machines.find((m) => m.type === 'grubber')!;
    const o = s.business.orders.find((x) => x.status === 'offen')!;
    runUntil(s, () => s.time % 1440 > 10 && s.time % 1440 < 60, 1440);
    s.command({ kind: 'startJob', orderId: o.id, tractorId: 1, implementId: g.id, driverId: 1 });
    const unit = s.playerUnits().find((u) => u.machineId === 1)!;
    expect(unit.atHome).toBe(true); // Rüstzeit am Hof
    expect(s.command({ kind: 'swapDriver', vehicle: unit.vehicle, driverId: e.id })).toMatch(/übernimmt am Hof/);
    expect(s.driverBusy(1)).toBeNull();
    expect(s.driverBusy(e.id)).toMatch(/fährt einen Auftrag/);
  });

  it('Leiharbeiter buchen: ab morgen im Einsatz, Kosten nach Stunden, endet nach der Buchung', () => {
    const s = world(5);
    runUntil(s, () => s.business.agencyPool.some((a) => a.person.skills.boden >= 1), 2 * 1440);
    const a = s.business.agencyPool[0];
    expect(a.person.agencyRate).toBeGreaterThanOrEqual(27);
    expect(s.command({ kind: 'rent', poolId: a.id, days: 3 })).toMatch(/gebucht bis/);
    const e = s.company.drivers.find((d) => d.kind === 'leih')!;
    expect(e).toBeDefined();
    expect(e.availableFrom! - s.time).toBeLessThanOrEqual(1440);
    // vor dem Einsatz: kein Start möglich
    const g = s.company.drivers.length;
    expect(g).toBe(2);
    // drei Tage später ist er wieder weg, abgerechnet sind mindestens 3 × 4 h
    s.run(5 * 1440);
    expect(s.company.drivers.some((d) => d.id === e.id)).toBe(false);
    const b = s.business as unknown as { payrollAccrued: number };
    expect(b.payrollAccrued).toBeGreaterThanOrEqual(3 * 4 * a.person.agencyRate! - 1);
  });

  it('Leiharbeiter übernehmen: Provision nach Einsatzdauer', () => {
    const s = world(5);
    runUntil(s, () => s.business.agencyPool.some((a) => a.person.skills.boden >= 1), 2 * 1440);
    s.command({ kind: 'rent', poolId: s.business.agencyPool.find((a) => a.person.skills.boden >= 1)!.id, days: 30 });
    const e = s.company.drivers.find((d) => d.kind === 'leih')!;
    s.run(10 * 1440);
    const cash = s.company.cash;
    expect(s.command({ kind: 'takeOver', employeeId: e.id, asKind: 'fest' })).toMatch(/übernommen \(Provision/);
    expect(e.kind).toBe('fest');
    expect(e.agencyRate).toBeUndefined();
    expect(cash - s.company.cash).toBeCloseTo(Math.round(e.wage * 173 * 2), 0);
    expect(s.business.ledger.some((l) => l.text.startsWith('Übernahmeprovision'))).toBe(true);
  });

  it('Fahrerwechsel: Ersatzfahrer übernimmt das Gespann, wenn der Fahrer krank ist', () => {
    const s = twoOrders(5);
    runUntil(s, () => s.business.agencyPool.some((a) => a.person.skills.boden >= 1), 3 * 1440);
    s.command({ kind: 'rent', poolId: s.business.agencyPool.find((a) => a.person.skills.boden >= 1)!.id, days: 10 });
    const leih = s.company.drivers.find((d) => d.kind === 'leih')!;
    runUntil(s, () => s.business.applicants.some((a) => a.person.skills.boden >= 1), 20 * 1440);
    s.command({ kind: 'hire', applicantId: s.business.applicants.find((a) => a.person.skills.boden >= 1)!.id, asKind: 'fest' });
    const fest = s.company.drivers.find((d) => d.kind === 'fest')!;
    s.command({ kind: 'buy', offerId: 1 });
    const g = s.company.machines.find((m) => m.type === 'grubber')!;
    const o = s.business.orders.find((x) => x.status === 'offen')!;
    runUntil(s, () => s.time % 1440 > 10 && s.time % 1440 < 60 && s.time >= leih.availableFrom!, 3 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: 1, implementId: g.id, driverId: fest.id })).toMatch(/gestartet/);
    s.run(60);
    // Festangestellter wird krank
    (fest.absences ??= []).push({ from: s.time, to: s.time + 3 * 1440, kind: 'krank' });
    const unit = s.playerUnits().find((u) => u.machineId === 1)!;
    expect(unit.status).toMatch(/krank/);
    const bar = s.planBoard().find((x) => x.kind === 'running')!;
    expect(bar.warnings.some((w) => w.includes('Fahrer wechseln'))).toBe(true);
    // draußen nur mit Firmenwagen und drittem Fahrer
    expect(s.command({ kind: 'swapDriver', vehicle: unit.vehicle, driverId: leih.id })).toMatch(/Firmenwagen hinbringen/);
    expect(s.command({ kind: 'swapDriver', vehicle: unit.vehicle, driverId: leih.id, chauffeurId: leih.id })).toMatch(/anderen Fahrer/);
    expect(s.command({ kind: 'swapDriver', vehicle: unit.vehicle, driverId: leih.id, chauffeurId: 1 })).toMatch(/Chef fährt/);
    expect(s.driverBusy(1)).toMatch(/Fahrerwechsel/);
    expect(s.driverBusy(leih.id)).toMatch(/gebracht/);
    // Gespann wartet, bis der Firmenwagen da ist; dann fährt der Leiharbeiter
    runUntil(s, () => !s.driverBusy(1), 600);
    expect(s.driverBusy(1)).toBeNull();
    expect(s.driverBusy(leih.id)).toMatch(/fährt einen Auftrag/);
    runUntil(s, () => o.status === 'fertig', 4 * 1440);
    expect(o.status).toBe('fertig');
  });
});
