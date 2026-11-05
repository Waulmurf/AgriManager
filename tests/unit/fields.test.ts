import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fieldId, fieldPattern, parseFields, pointInPolygon } from '../../src/sim/fields';
import { parseRoadGraph } from '../../src/sim/roadgraph';
import { Simulation, VehicleState, SNAPSHOT_STRIDE, pointAt } from '../../src/sim/engine';
import { buildRoadGraphBuffer } from './helpers/grid';

const toAB = (b: Buffer): ArrayBuffer => new Uint8Array(b).buffer;

/** FLD1-Datei für Tests: Rechteck-Felder an einem Gitter-Graphen */
function buildFieldsBuffer(polys: [number, number][][], access: number[]): ArrayBuffer {
  const F = polys.length, P = polys.reduce((s, p) => s + p.length, 0);
  const pad = (4 - ((F * 18) % 4)) % 4;
  const buf = new ArrayBuffer(32 + F * 24 + F * 18 + pad + P * 8);
  const dv = new DataView(buf);
  'FLD1'.split('').forEach((c, i) => dv.setUint8(i, c.charCodeAt(0)));
  dv.setUint32(4, 1, true); dv.setUint32(8, F, true); dv.setUint32(12, P, true);
  let off = 32;
  const f32 = (n: number) => { const a = new Float32Array(buf, off, n); off += n * 4; return a; };
  const u32 = (n: number) => { const a = new Uint32Array(buf, off, n); off += n * 4; return a; };
  const u8 = (n: number) => { const a = new Uint8Array(buf, off, n); off += n; return a; };
  const cx = f32(F), cy = f32(F), area = f32(F), acc = u32(F), ps = u32(F), pc = u32(F);
  const kind = u8(F); u8(F); const ids = u8(F * 16).fill(32);
  off += pad;
  const px = f32(P), py = f32(P);
  let p = 0;
  polys.forEach((poly, i) => {
    let a = 0;
    for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) a += (poly[j][0] + poly[k][0]) * (poly[j][1] - poly[k][1]);
    area[i] = Math.abs(a) / 2 / 10000;
    cx[i] = poly.reduce((s, q) => s + q[0], 0) / poly.length;
    cy[i] = poly.reduce((s, q) => s + q[1], 0) / poly.length;
    acc[i] = access[i]; ps[i] = p; pc[i] = poly.length; kind[i] = 1;
    `F${i}`.split('').forEach((c, k) => (ids[i * 16 + k] = c.charCodeAt(0)));
    for (const [x, y] of poly) { px[p] = x; py[p] = y; p++; }
  });
  return buf;
}

describe('Bahnenmuster im Feld', () => {
  const rect: [number[], number[]] = [[0, 300, 300, 0], [0, 0, 100, 100]]; // 3 ha

  it('liegt im Feld und deckt die Fläche ab', () => {
    const p = fieldPattern(rect[0], rect[1], 4);
    expect(p.xs.length).toBe(50); // 25 Bahnen à 2 Punkte
    for (let i = 0; i < p.xs.length; i++) {
      expect(p.xs[i]).toBeGreaterThanOrEqual(-1e-6);
      expect(p.xs[i]).toBeLessThanOrEqual(300 + 1e-6);
    }
    // Arbeitslänge × Breite ≈ Fläche
    expect(p.workLength * 4).toBeCloseTo(30000, -2);
  });

  it('läuft parallel zur längsten Kante und wechselt die Richtung', () => {
    const p = fieldPattern(rect[0], rect[1], 4);
    expect(p.ys[0]).toBeCloseTo(p.ys[1], 6); // erste Bahn waagerecht
    expect(p.xs[1] - p.xs[0]).toBeGreaterThan(0);
    expect(p.xs[3] - p.xs[2]).toBeLessThan(0);
  });

  it('bleibt bei konkaven Feldern auf den inneren Abschnitten', () => {
    // U-förmiges Feld
    const xs = [0, 300, 300, 200, 200, 100, 100, 0];
    const ys = [0, 0, 300, 300, 100, 100, 300, 300];
    const p = fieldPattern(xs, ys, 10);
    for (let i = 0; i + 1 < p.xs.length; i += 2) {
      const mx = (p.xs[i] + p.xs[i + 1]) / 2, my = (p.ys[i] + p.ys[i + 1]) / 2;
      expect(pointInPolygon(mx, my, xs, ys)).toBe(true);
    }
  });

  it('begrenzt die Bahnenzahl bei sehr großen Feldern', () => {
    const p = fieldPattern([0, 3000, 3000, 0], [0, 0, 2000, 2000], 4, 150);
    expect(p.xs.length).toBeLessThanOrEqual(2 * 151);
  });
});

describe('Felddatei FLD1 (scripts/data/build-fields.mjs)', () => {
  it('liest Felder aus amtlichen und OSM-Daten mit Zufahrt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fld-'));
    execFileSync('node', ['scripts/data/build-roadgraph.mjs', '--opl', 'tests/fixtures/mini.opl', '--lat', '53.08', '--lon', '10.7', '--out', join(dir, 'g.bin')]);
    execFileSync('node', ['scripts/data/build-fields.mjs', '--official', 'NI:tests/fixtures/mini-fields-ni.geojsonl', '--osm', 'tests/fixtures/mini-fields-osm.geojsonl', '--roadgraph', join(dir, 'g.bin'), '--out-bin', join(dir, 'f.bin')]);
    const f = parseFields(toAB(readFileSync(join(dir, 'f.bin'))));
    // Acker-Feldblock mit Feldweg in der Nähe; „SO“ (sonstige) ausgeschlossen; Grünland und OSM-Fläche ohne Zufahrt
    expect(f.count).toBe(1);
    expect(fieldId(f, 0)).toBe('DENILI0000000001');
    expect(f.kind[0]).toBe(1);
    expect(f.areaHa[0]).toBeGreaterThan(10);
    expect(f.areaHa[0]).toBeLessThan(12);
    expect(f.ptCount[0]).toBe(4);
  });
});

describe('Simulation mit echten Feldern', () => {
  // Gitter 3×3 km, zwei Felder neben Knoten
  const nodes: [number, number][] = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) nodes.push([i * 1000 - 1500, j * 1000 - 1500]);
  const edges: { u: number; v: number; cls: number }[] = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const a = j * 4 + i;
    if (i < 3) edges.push({ u: a, v: a + 1, cls: 8 });
    if (j < 3) edges.push({ u: a, v: a + 4, cls: 4 });
  }
  const graph = () => parseRoadGraph(buildRoadGraphBuffer(nodes, edges));
  const fields = () => parseFields(buildFieldsBuffer([
    [[-1450, -1450], [-1050, -1450], [-1050, -1150], [-1450, -1150]], // 12 ha bei Knoten 0
    [[1050, 1050], [1450, 1050], [1450, 1250], [1050, 1250]], // 8 ha bei Knoten 15
  ], [0, 15]));

  it('arbeitet im Feldumriss und braucht die Zeit laut Flächenleistung', () => {
    const f = fields();
    const s = new Simulation(graph(), { seed: 4, vehicleCount: 5, fields: f });
    const routes = new Map<number, { xs: Float64Array; ys: Float64Array; cum: Float64Array }>();
    const workMinutes = new Map<string, number>();
    let inside = 0, checked = 0;
    for (let t = 0; t < 3000; t++) {
      s.step();
      for (const r of s.drainRoutes()) routes.set(r.id, r);
      const snap = s.snapshot();
      for (let v = 0; v < 5; v++) {
        const k = v * SNAPSHOT_STRIDE;
        if (snap[k + 2] !== VehicleState.Working) continue;
        const fi = snap[k + 3];
        expect(fi === 0 || fi === 1).toBe(true);
        const key = `${v}:${snap[k]}`;
        workMinutes.set(key, (workMinutes.get(key) ?? 0) + 1);
        const [x, y] = pointAt(routes.get(snap[k])!, snap[k + 1]);
        const s0 = f.ptStart[fi];
        checked++;
        if (pointInPolygon(x, y, f.px.subarray(s0, s0 + 4), f.py.subarray(s0, s0 + 4))) inside++;
      }
    }
    expect(checked).toBeGreaterThan(500);
    expect(inside / checked).toBeGreaterThan(0.95); // nur An-/Abfahrt liegt außerhalb
    // vollständige Arbeitsgänge: 12 ha → ~424 min, 8 ha → ~282 min bei 1,7 ha/h
    // letzter Arbeitsgang je Fahrzeug ist bei Testende evtl. noch nicht fertig
    const lastPerVehicle = new Map<string, string>();
    for (const key of workMinutes.keys()) lastPerVehicle.set(key.split(':')[0], key);
    const unfinished = new Set(lastPerVehicle.values());
    const durations = [...workMinutes.entries()].filter(([k]) => !unfinished.has(k)).map(([, m]) => m);
    expect(durations.length).toBeGreaterThan(2);
    for (const m of durations) expect(Math.min(Math.abs(m - 424), Math.abs(m - 282))).toBeLessThan(3);
  });

  it('bleibt deterministisch', () => {
    const a = new Simulation(graph(), { seed: 9, vehicleCount: 5, fields: fields() });
    const b = new Simulation(graph(), { seed: 9, vehicleCount: 5, fields: fields() });
    a.run(2000);
    b.run(2000);
    expect(a.hash()).toBe(b.hash());
  });
});
