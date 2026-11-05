import { describe, expect, it } from 'vitest';
import { parseRoadGraph, RoadClass } from '../../src/sim/roadgraph';
import { parseFields } from '../../src/sim/fields';
import { Simulation } from '../../src/sim/engine';
import { annuity, bookValue, leaseRate, profitTax, rating } from '../../src/sim/finance';
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

describe('Finanzrechnung', () => {
  it('Annuität und Leasingrate', () => {
    // 100.000 € über 5 Jahre zu 4,1 %: etwa 1.846 € im Monat
    expect(annuity(100_000, 0.041, 60)).toBeCloseTo(1846, -1);
    const l = leaseRate(100_000, 0.059, 36);
    expect(l.residual).toBe(45_000);
    expect(l.monthly).toBeGreaterThan(1700);
    expect(l.monthly).toBeLessThan(2100);
  });

  it('Steuer: steigt progressiv, null ohne Gewinn', () => {
    expect(profitTax(-5000).total).toBe(0);
    expect(profitTax(10_000).total).toBe(0);
    const a = profitTax(50_000), b = profitTax(150_000);
    expect(a.total / 50_000).toBeLessThan(b.total / 150_000);
    expect(b.total / 150_000).toBeLessThan(0.45);
    expect(a.trade).toBeGreaterThan(0);
  });

  it('Bonität', () => {
    expect(rating(0.7, 1000)).toBe('A');
    expect(rating(0.7, -1000)).toBe('B');
    expect(rating(0.25, 0)).toBe('C');
    expect(rating(0.1, 0)).toBe('D');
  });
});

describe('Finanzen im Spiel', () => {
  it('Darlehen: Auszahlung, Monatsrate mit Zins und Tilgung, Kreditrahmen', () => {
    const s = world(5);
    const cash = s.company.cash;
    expect(s.command({ kind: 'takeLoan', amount: 200_000, years: 5 })).toMatch(/Kreditrahmen/);
    expect(s.command({ kind: 'takeLoan', amount: 60_000, years: 5 })).toMatch(/ausgezahlt/);
    expect(s.company.cash).toBe(cash + 60_000);
    expect(s.company.loan).toBe(60_000);
    const l = s.company.loans![0];
    s.run(31 * 1440); // 1. April
    expect(s.company.loan).toBeLessThan(60_000);
    expect(s.business.ledger.some((x) => x.category === 'Zinsen')).toBe(true);
    expect(s.business.ledger.some((x) => x.category === 'Tilgung')).toBe(true);
    expect(s.business.ledger.some((x) => x.category === 'Versicherung')).toBe(true);
    // Sondertilgung
    expect(s.command({ kind: 'repayLoan', loanId: l.id, amount: 10_000 })).toMatch(/getilgt/);
    expect(s.company.loan).toBeLessThan(50_000);
  });

  it('Kontokorrent: Kauf ins Minus bis zum Rahmen, Dispozinsen', () => {
    const s = world(5);
    s.company.cash = 50_000;
    expect(s.command({ kind: 'buy', offerId: 4 })).toBe('gekauft'); // 69.500 €
    expect(s.company.cash).toBe(-19_500);
    expect(s.command({ kind: 'buy', offerId: 5 })).toMatch(/Nicht genug Geld/);
    s.run(31 * 1440);
    expect(s.business.ledger.some((x) => x.text === 'Zinsen Kontokorrent')).toBe(true);
  });

  it('Leasing: Rate monatlich, keine Abschreibung, am Ende Rückgabe oder Übernahme', () => {
    const s = world(5);
    expect(s.command({ kind: 'order', dealerId: 1, modelKey: 'fendt-314', leaseMonths: 36 })).toMatch(/geleast/);
    const cash = s.company.cash;
    s.run(s.business.deliveries[0].at - s.time + 1440);
    const m = s.company.machines.find((x) => x.model === '314 Vario')!;
    expect(m.lease).toBeDefined();
    expect(s.company.cash).toBeGreaterThan(cash - 10_000); // kein Kaufpreis
    expect(bookValue(m, s.time)).toBe(0);
    expect(s.command({ kind: 'sell', machineId: m.id, mode: 'tradein' })).toMatch(/Leasinggesellschaft/);
    s.run(40 * 1440);
    expect(s.business.ledger.some((x) => x.category === 'Leasing')).toBe(true);
    // Ende: übernehmen
    expect(s.command({ kind: 'leaseBuyout', machineId: m.id, buyout: true })).toMatch(/übernommen/);
    m.lease!.endsAt = s.time + 1440;
    s.run(2 * 1440);
    expect(m.lease).toBeUndefined();
    expect(m.purchasePrice).toBeGreaterThan(60_000);
  });

  it('Jahresabschluss am 1. Januar mit Steuer, fällig am 31. Mai', () => {
    const s = world(5);
    // Umsatz simulieren: Buchung „Rechnung“
    s.business.ledger.push({ time: 100, text: 'Test-Umsatz', amount: 250_000, category: 'Rechnung' });
    s.company.cash += 250_000;
    s.run(310 * 1440); // über den Jahreswechsel
    const y = s.business.years[0];
    expect(y.year).toBe(2027);
    expect(y.revenue).toBe(250_000);
    expect(y.afa).toBeGreaterThan(20_000); // Startschlepper über 3 Jahre
    expect(y.profit).toBeLessThan(250_000);
    expect(y.tax).toBeGreaterThan(0);
    expect(s.business.taxDue!.amount).toBe(y.tax);
    s.run(155 * 1440);
    expect(s.business.taxDue).toBeNull();
    expect(s.business.ledger.some((x) => x.category === 'Steuern')).toBe(true);
  });

  it('Dieselpreis schwankt in plausiblen Grenzen', () => {
    const s = world(5);
    const prices: number[] = [];
    for (let d = 0; d < 365; d++) { s.run(1440); prices.push(s.business.dieselPrice); }
    expect(Math.min(...prices)).toBeGreaterThan(1.2);
    expect(Math.max(...prices)).toBeLessThan(2.0);
    expect(new Set(prices).size).toBeGreaterThan(50);
  });

  it('Spielstand mit Darlehen und Leasing läuft bitgleich weiter', () => {
    const a = world(6);
    a.command({ kind: 'takeLoan', amount: 50_000, years: 3 });
    a.command({ kind: 'order', dealerId: 4, modelKey: 'horsch-terrano5', leaseMonths: 48 });
    a.run(40 * 1440);
    const b = world(6);
    b.restore(JSON.parse(JSON.stringify(a.serialize())));
    a.run(60 * 1440);
    b.run(60 * 1440);
    expect(b.hash()).toBe(a.hash());
    expect(b.company.loan).toBe(a.company.loan);
    expect(b.business.dieselPrice).toBe(a.business.dieselPrice);
  });
});
