import { describe, expect, it } from 'vitest';
import { machineValue, marketValue, startCompany } from '../../src/sim/economy';

describe('Marktwert (Startformel MZ-02)', () => {
  it('trifft die realen Fendt-720-Angebote aus dem Anforderungs-Doc (Stand 2026)', () => {
    const offers = [
      { year: 2021, hours: 2473, price: 144_900 },
      { year: 2019, hours: 7346, price: 102_000 },
      { year: 2014, hours: 11_677, price: 69_900 },
      { year: 2012, hours: 7252, price: 71_000 },
    ];
    for (const o of offers) {
      const w = marketValue(225_000, 2026 - o.year, o.hours);
      expect(Math.abs(w / o.price - 1)).toBeLessThan(0.06);
    }
    // fast neue Maschinen schätzt die Startformel zu niedrig (im Doc vermerkt)
    expect(marketValue(225_000, 3, 610)).toBeLessThan(225_000 * 0.8);
  });

  it('hat eine Untergrenze von 15 % des Neupreises', () => {
    expect(marketValue(100_000, 60, 30_000)).toBe(15_000);
  });
});

describe('Startbetrieb', () => {
  it('entspricht den Startbedingungen', () => {
    const c = startCompany(42);
    expect(c.cash).toBe(100_000);
    expect(c.creditLimit).toBe(150_000);
    expect(c.homeNode).toBe(42);
    expect(c.drivers).toHaveLength(1);
    const tractor = c.machines.find((m) => m.type === 'schlepper')!;
    expect(tractor.power).toBe(200);
    // Wert rund 70.000 € (±5 %)
    expect(Math.abs(machineValue(tractor) / 70_000 - 1)).toBeLessThan(0.05);
    expect(c.machines.some((m) => m.type === 'firmenwagen')).toBe(true);
  });
});
