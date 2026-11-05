import { describe, expect, it } from 'vitest';
import { parseRoadGraph } from '../../src/sim/roadgraph';
import { Simulation, VehicleState, pointAt, SNAPSHOT_STRIDE } from '../../src/sim/engine';
import { gridGraph } from './helpers/grid';

const graph = () => parseRoadGraph(gridGraph(12, 1000));

describe('Simulation', () => {
  it('ist deterministisch für denselben Seed', () => {
    const a = new Simulation(graph(), { seed: 7, vehicleCount: 30 });
    const b = new Simulation(graph(), { seed: 7, vehicleCount: 30 });
    a.run(3000);
    b.run(3000);
    expect(a.hash()).toBe(b.hash());
    expect(a.time).toBe(3000);
  });

  it('liefert bei 1x und 100x dasselbe Ergebnis', () => {
    // 1x: jeder Schritt einzeln mit Schnappschuss und Routenabruf dazwischen
    const slow = new Simulation(graph(), { seed: 99, vehicleCount: 30 });
    for (let i = 0; i < 2000; i++) {
      slow.step();
      slow.snapshot();
      slow.drainRoutes();
    }
    // 100x: Schritte in Blöcken, seltene Abrufe
    const fast = new Simulation(graph(), { seed: 99, vehicleCount: 30 });
    for (let i = 0; i < 20; i++) {
      fast.run(100);
      fast.snapshot();
    }
    expect(fast.hash()).toBe(slow.hash());
    expect(Array.from(fast.snapshot())).toEqual(Array.from(slow.snapshot()));
  });

  it('weicht bei anderem Seed ab', () => {
    const a = new Simulation(graph(), { seed: 1, vehicleCount: 30 });
    const b = new Simulation(graph(), { seed: 2, vehicleCount: 30 });
    a.run(500);
    b.run(500);
    expect(a.hash()).not.toBe(b.hash());
  });

  it('hat einen plattformunabhängigen Referenzzustand', () => {
    const s = new Simulation(graph(), { seed: 42, vehicleCount: 30 });
    s.run(5000);
    expect({ hash: s.hash(), stats: s.stats() }).toMatchSnapshot();
  });

  it('bewegt Fahrzeuge entlang der Straßen und lässt sie arbeiten', () => {
    const s = new Simulation(graph(), { seed: 3, vehicleCount: 30 });
    const routes = new Map<number, ReturnType<Simulation['drainRoutes']>[number]>();
    let sawDriving = false, sawWorking = false;
    for (let i = 0; i < 1500; i++) {
      s.step();
      for (const r of s.drainRoutes()) routes.set(r.id, r);
      const snap = s.snapshot();
      for (let v = 0; v < 30; v++) {
        const rid = snap[v * SNAPSHOT_STRIDE];
        const dist = snap[v * SNAPSHOT_STRIDE + 1];
        const st = snap[v * SNAPSHOT_STRIDE + 2];
        if (st === VehicleState.Driving) sawDriving = true;
        if (st === VehicleState.Working) sawWorking = true;
        if (rid) {
          const r = routes.get(rid)!;
          expect(r).toBeDefined();
          expect(dist).toBeGreaterThanOrEqual(0);
          expect(dist).toBeLessThanOrEqual(r.total + 1e-6);
          const [x, y] = pointAt(r, dist);
          const [px, py] = s.position(v);
          expect(Math.hypot(x - px, y - py)).toBeLessThan(1e-6);
        }
      }
    }
    expect(sawDriving).toBe(true);
    expect(sawWorking).toBe(true);
    expect(s.stats().trips).toBeGreaterThan(10);
  });

  it('hält die Höchstgeschwindigkeit ein', () => {
    const s = new Simulation(graph(), { seed: 5, vehicleCount: 30 });
    const prev = Array.from({ length: 30 }, (_, i) => s.position(i));
    for (let i = 0; i < 600; i++) {
      s.step();
      for (let v = 0; v < 30; v++) {
        const p = s.position(v);
        // Luftlinie pro Minute ≤ 100 km/h (Pkw) + Toleranz
        expect(Math.hypot(p[0] - prev[v][0], p[1] - prev[v][1])).toBeLessThanOrEqual(1667 + 1e-6);
        prev[v] = p;
      }
    }
  });

  it('schafft 100x mit 30 Fahrzeugen deutlich schneller als Echtzeit', () => {
    const s = new Simulation(graph(), { seed: 11, vehicleCount: 30 });
    const t0 = performance.now();
    s.run(6000);
    const ms = performance.now() - t0;
    // 100x = 100 Schritte/s → 6000 Schritte dürfen höchstens 60 s dauern; Ziel weit darunter
    expect(ms).toBeLessThan(6000);
  });
});
