import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/sim/rng';

describe('Rng', () => {
  it('liefert für denselben Seed dieselbe Folge', () => {
    const a = new Rng(42), b = new Rng(42);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });
  it('unterscheidet Seeds und bleibt im Bereich', () => {
    const a = new Rng(1), b = new Rng(2);
    expect(a.nextU32()).not.toBe(b.nextU32());
    for (let i = 0; i < 10000; i++) {
      const v = a.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const r = a.range(3, 7);
      expect(r).toBeGreaterThanOrEqual(3);
      expect(r).toBeLessThanOrEqual(7);
    }
  });
  it('ist plattformunabhängig (feste Referenzwerte)', () => {
    const r = new Rng(12345);
    expect([r.nextU32(), r.nextU32(), r.nextU32()]).toMatchSnapshot();
  });
  it('lässt sich speichern und fortsetzen', () => {
    const a = new Rng(9);
    a.nextU32();
    const s = a.getState();
    const x = a.nextU32();
    const b = new Rng(0);
    b.setState(s);
    expect(b.nextU32()).toBe(x);
  });
});
