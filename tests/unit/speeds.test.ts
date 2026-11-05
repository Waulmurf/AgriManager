import { describe, expect, it } from 'vitest';
import { PROFILES, edgeSpeeds } from '../../src/sim/astar';
import { applyCurves } from '../../src/sim/engine';
import { parseRoadGraph } from '../../src/sim/roadgraph';
import { buildRoadGraphBuffer } from './helpers/grid';

const kmh = (v: number) => v * 3.6;

describe('Fahrprofile', () => {
  it('Pkw ist auf der Landstraße deutlich schneller als der Schlepper', () => {
    const g = parseRoadGraph(buildRoadGraphBuffer([[0, 0], [1000, 0]], [{ u: 0, v: 1, cls: 2 }]));
    expect(kmh(edgeSpeeds(g, PROFILES.car)[0])).toBeCloseTo(90, 5);
    expect(kmh(edgeSpeeds(g, PROFILES.tractor)[0])).toBeCloseTo(38, 5);
  });

  it('beachtet Tempolimit und innerorts', () => {
    const g = parseRoadGraph(buildRoadGraphBuffer([[0, 0], [1000, 0], [2000, 0]], [{ u: 0, v: 1, cls: 2 }, { u: 1, v: 2, cls: 2 }]));
    // Tempolimit 50 innerorts nachträglich setzen (Testgraph Version 1)
    g.edgeMaxSpeed = new Uint8Array([70, 50]);
    g.edgeFlags[1] |= 8;
    const car = edgeSpeeds({ ...g }, PROFILES.car);
    expect(kmh(car[0])).toBeCloseTo(70 * 0.95, 5);
    expect(kmh(car[1])).toBeCloseTo(45, 5); // innerorts im Schnitt 45
    const tr = edgeSpeeds({ ...g }, PROFILES.tractor);
    expect(kmh(tr[1])).toBeCloseTo(30, 5);
  });
});

describe('Kurven', () => {
  it('bremst vor einer rechtwinkligen Abbiegung ab und beschleunigt danach', () => {
    const v = 90 / 3.6;
    const r = applyCurves([0, 500, 500], [0, 0, 500], [v, v], PROFILES.car);
    // Punkte: Start, Startzone, Bremszone vor Knick, Knick, Zone nach Knick, Bremszone vor Ziel, Ziel
    const atCorner = r.xs.findIndex((x, i) => x === 500 && r.ys[i] === 0);
    expect(atCorner).toBeGreaterThan(0);
    expect(kmh(r.speeds[atCorner - 1])).toBeCloseTo(25, 5); // 90° → 25 km/h (Pkw)
    expect(kmh(r.speeds[atCorner])).toBeCloseTo(25, 5);
    expect(Math.max(...r.speeds.map(kmh))).toBeCloseTo(90, 5);
  });

  it('lässt gerade Strecken unverändert schnell', () => {
    const v = 38 / 3.6;
    const r = applyCurves([0, 300, 600], [0, 1, 0], [v, v], PROFILES.tractor);
    // nur Start und Ziel langsam, Mitte frei
    const fast = r.speeds.filter((s) => Math.abs(s - v) < 1e-9).length;
    expect(fast).toBeGreaterThanOrEqual(2);
  });
});
