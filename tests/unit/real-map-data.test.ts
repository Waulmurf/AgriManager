/**
 * Plausibilitätsprüfung der echten Kartendaten (src-tauri/resources/map).
 * Wird übersprungen, wenn die Daten nicht geladen sind (npm run map-data).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseRoadGraph, project, nearestNode, RoadClass } from '../../src/sim/roadgraph';
import { PROFILES, Router } from '../../src/sim/astar';
import { Simulation, SNAPSHOT_STRIDE, VehicleState } from '../../src/sim/engine';
import { parseFields, fieldId } from '../../src/sim/fields';

const FILE = 'src-tauri/resources/map/roadgraph.bin';
const has = existsSync(FILE);
const load = () => {
  const b = readFileSync(FILE);
  return parseRoadGraph(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

// Orte im Spielgebiet (gerundete Ortsmitten)
const PLACES: Record<string, [number, number]> = {
  Uelzen: [10.5585, 52.9655],
  Lüneburg: [10.4144, 53.2509],
  Salzwedel: [11.1508, 52.8503],
  Dannenberg: [11.0985, 53.0977],
  Bleckede: [10.7349, 53.2887],
  'Neuhaus (rechts der Elbe)': [10.9302, 53.2856],
  Wittingen: [10.7391, 52.7280],
};

describe.skipIf(!has)('echte Kartendaten', () => {
  it('Straßengraph hat plausible Größe und Klassen', () => {
    const g = load();
    expect(g.nodeCount).toBeGreaterThan(50_000);
    const km: Record<number, number> = {};
    for (let e = 0; e < g.edgeCount; e++) km[g.edgeClass[e]] = (km[g.edgeClass[e]] ?? 0) + g.edgeLen[e] / 1000;
    console.log('Knoten', g.nodeCount, 'Kanten', g.edgeCount, 'km je Klasse', Object.fromEntries(Object.entries(km).map(([k, v]) => [k, Math.round(v)])));
    expect(km[RoadClass.Track]).toBeGreaterThan(1000);
    expect(km[RoadClass.Ferry] ?? 0).toBeGreaterThan(0);
  });

  it('erreicht die Orte der Region vom Hof aus', () => {
    const g = load();
    const r = new Router(g);
    const home = nearestNode(g, 0, 0);
    expect(Math.hypot(g.x[home], g.y[home])).toBeLessThan(500);
    for (const [name, [lon, lat]] of Object.entries(PLACES)) {
      const [x, y] = project(g, lon, lat);
      const n = nearestNode(g, x, y);
      const path = r.route(home, n, PROFILES.tractor);
      expect(path, name).not.toBeNull();
      let len = 0, time = 0, ferry = false;
      for (const de of path!) {
        const e = de >>> 1;
        len += g.edgeLen[e];
        time += g.edgeLen[e] / PROFILES.tractor.speedByClass[g.edgeClass[e]];
        if (g.edgeClass[e] === RoadClass.Ferry) ferry = true;
      }
      const air = Math.hypot(x, y);
      console.log(`${name}: Luftlinie ${(air / 1000).toFixed(1)} km, Strecke ${(len / 1000).toFixed(1)} km, ${Math.round(time / 60)} min Schlepper${ferry ? ', mit Fähre' : ''}`);
      expect(len).toBeGreaterThan(air * 0.99);
      expect(len).toBeLessThan(air * 2.2 + 3000);
    }
  });

  it('100x mit 30 Fahrzeugen auf dem echten Graphen', () => {
    const g = load();
    const s = new Simulation(g, { seed: 1, vehicleCount: 30 });
    const t0 = performance.now();
    s.run(1440); // ein Spieltag
    const ms = performance.now() - t0;
    console.log(`RECHENKERN ${process.platform}/${process.arch}: 1 Spieltag ${ms.toFixed(0)} ms (${(ms / 1440).toFixed(3)} ms/Schritt)`, JSON.stringify(s.stats()));
    // 100x erlaubt 10 ms pro Schritt
    expect(ms / 1440).toBeLessThan(5);
  });
});

const FIELDS = 'src-tauri/resources/map/fields.bin';
const hasFields = existsSync(FIELDS) && has;
const loadFields = () => {
  const b = readFileSync(FIELDS);
  return parseFields(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

describe.skipIf(!hasFields)('echte Felder', () => {
  it('haben plausible Anzahl, Größe, IDs und Zufahrten', () => {
    const g = load();
    const f = loadFields();
    expect(f.count).toBeGreaterThan(20_000);
    let ha = 0, maxHa = 0;
    const ids = new Set<string>();
    for (let i = 0; i < f.count; i++) {
      expect(f.access[i]).toBeLessThan(g.nodeCount);
      expect(f.ptCount[i]).toBeGreaterThanOrEqual(3);
      expect(Math.hypot(f.cx[i], f.cy[i])).toBeLessThanOrEqual(g.radiusM + 1);
      // Zufahrt liegt nahe am Feld
      const s0 = f.ptStart[i];
      let near = Infinity;
      for (let k = 0; k < f.ptCount[i]; k++) near = Math.min(near, Math.hypot(f.px[s0 + k] - g.x[f.access[i]], f.py[s0 + k] - g.y[f.access[i]]));
      expect(near).toBeLessThan(450);
      ha += f.areaHa[i];
      maxHa = Math.max(maxHa, f.areaHa[i]);
      ids.add(fieldId(f, i));
    }
    console.log(`Felder: ${f.count}, ${Math.round(ha)} ha, größtes ${maxHa.toFixed(1)} ha, Beispiel-ID ${fieldId(f, 0)}`);
    expect(ids.size).toBe(f.count); // feste, eindeutige IDs
    expect(ha).toBeGreaterThan(150_000);
  });

  it('Fahrzeuge arbeiten auf echten Feldern', () => {
    const s = new Simulation(load(), { seed: 2, vehicleCount: 30, fields: loadFields() });
    let working = 0;
    for (let t = 0; t < 600; t++) {
      s.step();
      const snap = s.snapshot();
      for (let v = 0; v < 30; v++) if (snap[v * SNAPSHOT_STRIDE + 2] === VehicleState.Working) working++;
    }
    expect(working).toBeGreaterThan(0);
  });
});
