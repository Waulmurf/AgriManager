import { describe, expect, it } from 'vitest';
import { parseRoadGraph } from '../../src/sim/roadgraph';
import { PROFILES, Router } from '../../src/sim/astar';
import { buildRoadGraphBuffer, gridGraph } from './helpers/grid';

describe('A*-Routing', () => {
  it('findet den kürzesten Weg im Gitter', () => {
    const g = parseRoadGraph(gridGraph(5, 1000));
    const r = new Router(g);
    const path = r.route(0, 24, PROFILES.car)!;
    expect(path.length).toBe(8); // 4 rechts + 4 hoch
    // Pfad ist zusammenhängend
    let n = 0;
    for (const de of path) {
      const e = de >>> 1;
      const [a, b] = de & 1 ? [g.edgeV[e], g.edgeU[e]] : [g.edgeU[e], g.edgeV[e]];
      expect(a).toBe(n);
      n = b;
    }
    expect(n).toBe(24);
  });

  it('bevorzugt schnellere Straßen', () => {
    // 0-1 direkt über Feldweg (1 km, 15 km/h) oder Umweg über Landstraße (2 km, 40 km/h)
    const g = parseRoadGraph(buildRoadGraphBuffer(
      [[0, 0], [1000, 0], [500, 860]],
      [{ u: 0, v: 1, cls: 8 }, { u: 0, v: 2, cls: 2 }, { u: 2, v: 1, cls: 2 }],
    ));
    const path = new Router(g).route(0, 1, PROFILES.tractor)!;
    expect(path.length).toBe(2);
  });

  it('beachtet Einbahnstraßen und meldet unerreichbare Ziele', () => {
    const g = parseRoadGraph(buildRoadGraphBuffer(
      [[0, 0], [100, 0], [500, 500]],
      [{ u: 0, v: 1, oneway: true }],
    ));
    const r = new Router(g);
    expect(r.route(0, 1, PROFILES.car)!.length).toBe(1);
    expect(r.route(1, 0, PROFILES.car)).toBeNull();
    expect(r.route(0, 2, PROFILES.car)).toBeNull();
  });

  it('nutzt den Routen-Cache', () => {
    const g = parseRoadGraph(gridGraph(6));
    const r = new Router(g);
    const a = r.route(0, 35, PROFILES.tractor);
    const b = r.route(0, 35, PROFILES.tractor);
    expect(b).toBe(a);
    expect(r.searches).toBe(1);
    expect(r.cacheHits).toBe(1);
  });
});
