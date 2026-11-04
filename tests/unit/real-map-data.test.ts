/**
 * Plausibilitätsprüfung der echten Kartendaten (src-tauri/resources/map).
 * Wird übersprungen, wenn die Daten nicht geladen sind (npm run map-data).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseRoadGraph, project, nearestNode, RoadClass } from '../../src/sim/roadgraph';
import { PROFILES, Router } from '../../src/sim/astar';
import { Simulation } from '../../src/sim/engine';

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
    console.log(`1 Spieltag: ${ms.toFixed(0)} ms (${(ms / 1440).toFixed(3)} ms/Schritt)`, s.stats());
    // 100x erlaubt 10 ms pro Schritt
    expect(ms / 1440).toBeLessThan(5);
  });
});
