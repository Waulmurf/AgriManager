import { describe, expect, it } from 'vitest';
import { generateFarms, Crop } from '../../src/sim/farms';
import { parseRoadGraph, RoadClass } from '../../src/sim/roadgraph';
import { parseFields } from '../../src/sim/fields';
import { buildRoadGraphBuffer } from './helpers/grid';
import { buildFieldsBuffer } from './helpers/fields';

/** Gitter 10×10 km, Ortsstraßen in jeder 3. Reihe, 600 Felder à 9 ha und 4 ha */
function setup() {
  const nodes: [number, number][] = [];
  const n = 11;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) nodes.push([i * 1000 - 5000, j * 1000 - 5000]);
  const edges: { u: number; v: number; cls: number }[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * n + i;
    if (i + 1 < n) edges.push({ u: a, v: a + 1, cls: j % 3 === 0 ? RoadClass.Residential : RoadClass.Track });
    if (j + 1 < n) edges.push({ u: a, v: a + n, cls: RoadClass.Tertiary });
  }
  const polys: [number, number][][] = [];
  const access: number[] = [];
  const kinds: number[] = [];
  for (let k = 0; k < 600; k++) {
    const x = -4800 + (k % 30) * 320, y = -4800 + Math.floor(k / 30) * 480;
    const w = k % 2 ? 300 : 200;
    polys.push([[x, y], [x + w, y], [x + w, y + 300], [x, y + 300]]);
    access.push(Math.round((y + 5000) / 1000) * n + Math.round((x + 5000) / 1000));
    kinds.push(k % 7 === 0 ? 2 : 1);
  }
  return {
    g: parseRoadGraph(buildRoadGraphBuffer(nodes, edges)),
    f: parseFields(buildFieldsBuffer(polys, access, kinds)),
  };
}

describe('Kundenbetriebe', () => {
  it('verteilt alle Felder auf Betriebe mit plausibler Größe', () => {
    const { g, f } = setup();
    const fs = generateFarms(g, f, 1);
    let total = 0;
    for (let i = 0; i < f.count; i++) total += f.areaHa[i];
    expect(fs.farms.length).toBe(Math.round(total / 105));
    expect(Array.from(fs.fieldFarm).every((v) => v >= 0)).toBe(true);
    const sizes = fs.farms.map((x) => x.areaHa);
    expect(sizes.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 0);
    // unterschiedliche Größen
    expect(Math.max(...sizes) / Math.min(...sizes.filter((s) => s > 0))).toBeGreaterThan(2);
  });

  it('setzt Hofstellen an Ortsstraßen, Kulturen und Eigenschaften', () => {
    const { g, f } = setup();
    const fs = generateFarms(g, f, 1);
    for (const farm of fs.farms) {
      expect(farm.homeNode).toBeLessThan(g.nodeCount);
      expect(farm.known).toBe(false);
      expect(farm.mechanization).toBeGreaterThanOrEqual(0);
      expect(farm.mechanization).toBeLessThanOrEqual(1);
      expect(farm.name.length).toBeGreaterThan(3);
    }
    // Ortsstraßen liegen in Reihen j % 3 == 0 → y ∈ {-5000, -2000, 1000, 4000}
    const onRes = fs.farms.filter((x) => [-5000, -2000, 1000, 4000].includes(g.y[x.homeNode])).length;
    expect(onRes).toBe(fs.farms.length);
    for (let i = 0; i < f.count; i++) {
      if (f.kind[i] === 2) expect(fs.fieldCrop[i]).toBe(Crop.Gruenland);
      else expect(fs.fieldCrop[i]).toBeGreaterThan(0);
    }
    expect(new Set(fs.farms.map((x) => x.name)).size).toBe(fs.farms.length);
  });

  it('ist deterministisch', () => {
    const { g, f } = setup();
    const a = generateFarms(g, f, 7), b = generateFarms(g, f, 7);
    expect(JSON.stringify(a.farms)).toBe(JSON.stringify(b.farms));
    expect(Array.from(a.fieldCrop)).toEqual(Array.from(b.fieldCrop));
  });
});
