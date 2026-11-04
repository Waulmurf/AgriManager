import { describe, expect, it } from 'vitest';
import { parseRoadGraph, project, unproject, nearestNode, appendEdgePoints } from '../../src/sim/roadgraph';
import { buildRoadGraphBuffer } from './helpers/grid';

describe('Straßengraph RGR1', () => {
  const buf = buildRoadGraphBuffer(
    [[0, 0], [100, 0], [100, 100]],
    [{ u: 0, v: 1, geom: [[50, 10]] }, { u: 1, v: 2, oneway: true }],
  );
  const g = parseRoadGraph(buf);

  it('liest Kopf und Felder', () => {
    expect(g.nodeCount).toBe(3);
    expect(g.edgeCount).toBe(2);
    expect(g.lat0).toBeCloseTo(53.08);
    expect(g.edgeGeomCount[0]).toBe(1);
  });

  it('baut die Nachbarschaft und beachtet Einbahnstraßen', () => {
    const nb = (n: number) => Array.from(g.adjTo.slice(g.adjStart[n], g.adjStart[n + 1]));
    expect(nb(0)).toEqual([1]);
    expect(nb(1).sort()).toEqual([0, 2]);
    expect(nb(2)).toEqual([]); // 2→1 ist gegen die Einbahn
  });

  it('liefert Kantenpunkte in beiden Richtungen', () => {
    const xs: number[] = [], ys: number[] = [];
    appendEdgePoints(g, 0 * 2 + 1, xs, ys); // 1 → 0
    expect(xs).toEqual([50, 0]);
    expect(ys).toEqual([10, 0]);
  });

  it('projiziert hin und zurück', () => {
    const [x, y] = project(g, 10.8, 53.1);
    const [lon, lat] = unproject(g, x, y);
    expect(lon).toBeCloseTo(10.8, 10);
    expect(lat).toBeCloseTo(53.1, 10);
    expect(Math.hypot(x, y)).toBeGreaterThan(6000);
  });

  it('findet den nächsten Knoten', () => {
    expect(nearestNode(g, 90, 80)).toBe(2);
  });

  it('weist falsche Dateien ab', () => {
    expect(() => parseRoadGraph(new ArrayBuffer(64))).toThrow();
  });
});
