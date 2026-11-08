import { describe, expect, it } from 'vitest';
import { parseRoadGraph, RoadClass } from '../../src/sim/roadgraph';
import { parseFields } from '../../src/sim/fields';
import { Simulation } from '../../src/sim/engine';
import { ARBZG_DAY_MIN, ARBZG_EXEMPT_DAY_MIN, ARBZG_PERIOD_MIN, CONTRACT_DAY_MIN, OVERTIME_BONUS } from '../../src/sim/business';
import { EMPLOYER_SV, MONTH_HOURS, baseSkills, gameDate, type Employee } from '../../src/sim/economy';
import { weekday } from '../../src/sim/calendar';
import { buildRoadGraphBuffer } from './helpers/grid';
import { buildFieldsBuffer } from './helpers/fields';

function world(seed = 3) {
  const n = 9;
  const nodes: [number, number][] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) nodes.push([i * 1000 - 4000, j * 1000 - 4000]);
  const edges: { u: number; v: number; cls: number }[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * n + i;
    if (i + 1 < n) edges.push({ u: a, v: a + 1, cls: RoadClass.Residential });
    if (j + 1 < n) edges.push({ u: a, v: a + n, cls: RoadClass.Tertiary });
  }
  const polys: [number, number][][] = [];
  const access: number[] = [];
  for (let k = 0; k < 40; k++) {
    const x = -3900 + (k % 20) * 390, y = -3900 + Math.floor(k / 20) * 780;
    polys.push([[x, y], [x + 350, y], [x + 350, y + 300], [x, y + 300]]);
    access.push(Math.round((y + 4000) / 1000) * n + Math.round((x + 4000) / 1000));
  }
  return new Simulation(parseRoadGraph(buildRoadGraphBuffer(nodes, edges)), { seed, vehicleCount: 0, fields: parseFields(buildFieldsBuffer(polys, access)) });
}

const fest = (id: number): Employee => ({ id, name: 'Fahrer', isPlayer: false, kind: 'fest', wage: 20, skills: { ...baseSkills(0), boden: 2 }, xp: {}, licenseC: false, hiredAt: 0, age: 30, absences: [], vacationLeft: 26 });
type Payroll = { payroll(time: number, worked: Record<number, number>, surcharge?: Record<number, number>): void; payrollAccrued: number };

describe('Arbeitszeit (ArbZG) und Arbeitszeitkonto', () => {
  it('Konto: Mehrarbeit an Werktagen und Wochenende geht aufs Konto statt Überstundenzuschlag, Werktag ohne Arbeit baut ab', () => {
    const s = world();
    const b = s.business as unknown as Payroll;
    const e = fest(7);
    s.company.drivers.push(e);
    // Morgen nach einem Werktag suchen
    let t = 1440;
    while (weekday(t - 1440) > 4) t += 1440;
    const before = b.payrollAccrued;
    b.payroll(t, { 7: 600 });
    expect(e.timeAccount).toBe(600 - CONTRACT_DAY_MIN);
    // Lohn des Tages: nur Monatsgehalt/30 (kein Überstundenzuschlag), mit Arbeitgeberanteil
    expect(b.payrollAccrued - before).toBeCloseTo(((e.wage * MONTH_HOURS) / 30) * (1 + EMPLOYER_SV), 1);
    // nächster Werktag ohne Arbeit: Konto sinkt um das Soll
    let t2 = t + 1440;
    while (weekday(t2 - 1440) > 4) t2 += 1440;
    b.payroll(t2, {});
    expect(e.timeAccount).toBe(600 - 2 * CONTRACT_DAY_MIN);
  });

  it('Konto: Abrechnung am 1. März – Plus mit Zuschlag ausgezahlt, danach leer', () => {
    const s = world();
    const b = s.business as unknown as Payroll;
    const e = fest(7);
    e.timeAccount = 60 * 60; // 60 h
    s.company.drivers.push(e);
    let t = 1440;
    while (!(gameDate(t).month === 3 && gameDate(t).day === 1)) t += 1440;
    b.payrollAccrued = 0;
    b.payroll(t, {});
    expect(e.timeAccount).toBe(0);
    // am Monatsersten wird gebucht: Tageslohn + Auszahlung des Kontos (Vortag: Soll abgezogen, falls Werktag)
    const base = ((e.wage * MONTH_HOURS) / 30) * (1 + EMPLOYER_SV);
    const left = 60 * 60 - (weekday(t - 1440) <= 4 ? CONTRACT_DAY_MIN : 0);
    const booked = -s.business.ledger.filter((l) => l.text.startsWith('Löhne')).at(-1)!.amount;
    expect(booked - base).toBeCloseTo((left / 60) * e.wage * (1 + OVERTIME_BONUS) * (1 + EMPLOYER_SV), 0);
  });

  it('48 h im Mittel über 24 Wochen: wer das Kontingent ausgeschöpft hat, bekommt keine neue Aufgabe', () => {
    const s = world();
    const e = fest(7);
    e.periodStart = 0;
    e.periodMin = ARBZG_PERIOD_MIN;
    s.company.drivers.push(e);
    expect(s.business.periodLeft(7)).toBe(0);
    const blocked = (s as unknown as { driverBlocked(d: number): string | null }).driverBlocked(7);
    expect(blocked).toMatch(/48-h-Mittel/);
  });

  it('Saisonausnahme der Gewerbeaufsicht: nach 14 Tagen 12 h am Tag bis Ende November, Gebühr', () => {
    const s = world();
    expect(s.business.dayMaxMinutes(s.time)).toBe(ARBZG_DAY_MIN);
    expect(s.command({ kind: 'arbzgExemption' })).toMatch(/beantragt/);
    expect(s.business.ledger.some((l) => l.text.includes('Saisonausnahme'))).toBe(true);
    expect(s.business.dayMaxMinutes(s.time + 13 * 1440)).toBe(ARBZG_DAY_MIN);
    expect(s.business.dayMaxMinutes(s.time + 15 * 1440)).toBe(ARBZG_EXEMPT_DAY_MIN);
    const x = s.company.arbzgExemption!;
    expect(gameDate(x.until).month).toBe(12);
    expect(s.business.dayMaxMinutes(x.until + 1440)).toBe(ARBZG_DAY_MIN);
  });

  it('Ruhezeit: in Bestellung und Ernte 10 h, im Winter 11 h', () => {
    const s = world();
    let t = 0;
    while (gameDate(t).month !== 8) t += 1440;
    expect(s.business.restMinutes(t)).toBe(600);
    while (gameDate(t).month !== 1) t += 1440;
    expect(s.business.restMinutes(t)).toBe(660);
  });
});
