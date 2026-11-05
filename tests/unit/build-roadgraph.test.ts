import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRoadGraph } from '../../src/sim/roadgraph';

describe('Graph-Bau aus OSM (scripts/data/build-roadgraph.mjs)', () => {
  it('filtert Wege, beachtet Einbahnstraßen und schreibt RGR1', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'rg-')), 'g.bin');
    execFileSync('node', ['scripts/data/build-roadgraph.mjs', '--opl', 'tests/fixtures/mini.opl', '--lat', '53.08', '--lon', '10.7', '--out', out]);
    const b = readFileSync(out);
    const g = parseRoadGraph(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    // primary (2 Kanten, geteilt an n2), residential (Einbahn), track; ohne Autobahn, Fußweg, private Zufahrt
    expect(g.edgeCount).toBe(4);
    expect(Array.from(g.edgeClass).sort()).toEqual([2, 2, 6, 8]);
    const resi = g.edgeClass.indexOf(6);
    expect(g.edgeFlags[resi] & 1).toBe(1);
    // Einbahn oneway=-1 wurde umgedreht: Richtung n4 → n2
    expect(g.y[g.edgeU[resi]]).toBeGreaterThan(g.y[g.edgeV[resi]]);
    // Tempolimit und innerorts (Version 2)
    const prim = g.edgeClass.indexOf(2);
    expect(g.edgeMaxSpeed[prim]).toBe(50);
    expect(g.edgeFlags[prim] & 8).toBe(8);
    const track = g.edgeClass.indexOf(8);
    expect(g.edgeMaxSpeed[track]).toBe(0);
    expect(g.edgeLen[track]).toBeGreaterThan(1500);
  });
});
