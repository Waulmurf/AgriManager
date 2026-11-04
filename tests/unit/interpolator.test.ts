import { describe, expect, it } from 'vitest';
import { VehicleInterpolator, type VehicleSample } from '../../src/map/interpolator';
import type { WireRoute } from '../../src/sim/protocol';

// Route: 0,0 → 0.01,0 (Ost) → 0.01,0.01 (Nord); Distanzen 1000 m je Abschnitt
const route = (id: number): WireRoute => ({
  id,
  kind: 'road',
  coords: Float64Array.from([0, 0, 0.01, 0, 0.01, 0.01]),
  cum: Float64Array.from([0, 1000, 2000]),
});
const pos = (rid: number, d: number, st = 1) => Float64Array.from([rid, d, st]);

describe('VehicleInterpolator', () => {
  it('interpoliert entlang der Route statt über die Luftlinie', () => {
    const ip = new VehicleInterpolator();
    // 1x: ein Schritt pro Sekunde; Darstellung läuft 1,25 Schritte hinterher
    ip.addTick(10, 1, pos(1, 500), [route(1)], 0);
    ip.addTick(11, 1, pos(1, 1500), [], 1000);
    const out: VehicleSample[] = [];
    // bei now=1250: renderT = 11 - 1.25 + 0.25 = 10 → Distanz 500
    ip.sample(1250, out);
    expect(out[0].lon).toBeCloseTo(0.005, 9);
    expect(out[0].lat).toBeCloseTo(0, 9);
    expect(out[0].bearing).toBeCloseTo(90, 0);
    // bei now=1750: renderT = 10.5 → Distanz 1000 = Ecke (nicht Luftlinie)
    ip.sample(1750, out);
    expect(out[0].lon).toBeCloseTo(0.01, 9);
    expect(out[0].lat).toBeCloseTo(0, 9);
    // bei now=2000: renderT = 10.75 → Distanz 1250, auf dem Nordast
    ip.sample(2000, out);
    expect(out[0].lon).toBeCloseTo(0.01, 9);
    expect(out[0].lat).toBeCloseTo(0.0025, 9);
    expect(out[0].bearing).toBeCloseTo(0, 0);
  });

  it('springt in der Pause auf den letzten Stand', () => {
    const ip = new VehicleInterpolator();
    ip.addTick(5, 0, pos(1, 200), [route(1)], 0);
    ip.addTick(5, 0, pos(1, 300), [], 100);
    const out: VehicleSample[] = [];
    ip.sample(5000, out);
    expect(ip.renderTime).toBe(5);
    expect(out[0].lon).toBeCloseTo(0.003, 9);
  });

  it('führt beim Routenwechsel erst die alte Route zu Ende', () => {
    const ip = new VehicleInterpolator();
    ip.addTick(10, 10, pos(1, 1800), [route(1)], 0);
    ip.addTick(11, 10, pos(2, 200), [route(2)], 100);
    const out: VehicleSample[] = [];
    // 10x: Intervall 0,1 s, Rückstand 1,25 Schritte; now=125 → renderT = 10
    ip.sample(125, out);
    expect(out[0].lat).toBeCloseTo(0.008, 9);
    // now=150 → renderT = 10.25 → 0.25 * (200 Rest + 200) = 100 m → noch alte Route (1900)
    ip.sample(150, out);
    expect(out[0].lat).toBeCloseTo(0.009, 9);
    // now=200 → renderT = 10.75 → 300 m → 100 m auf neuer Route
    ip.sample(200, out);
    expect(out[0].lon).toBeCloseTo(0.001, 9);
    expect(out[0].lat).toBeCloseTo(0, 9);
  });

  it('glättet verspätete, gebündelte Meldungen ohne Sprung', () => {
    const ip = new VehicleInterpolator();
    const long: WireRoute = { id: 1, kind: 'road', coords: Float64Array.from([0, 0, 1, 0]), cum: Float64Array.from([0, 100000]) };
    // 10x, Fahrzeug fährt 600 m pro Spielminute
    let now = 0;
    let t = 0;
    ip.addTick(t, 10, pos(1, 0), [long], now);
    const out: VehicleSample[] = [];
    let lastLon = 0;
    let maxStep = 0;
    for (let frame = 0; frame < 300; frame++) {
      now += 16.7;
      // Meldungen stocken: alle 500 ms kommen 5 auf einmal
      if (frame % 30 === 0) {
        for (let k = 0; k < 5; k++) {
          t += 1;
          ip.addTick(t, 10, pos(1, t * 600), [], now);
        }
      }
      ip.sample(now, out);
      if (frame > 30) maxStep = Math.max(maxStep, Math.abs(out[0].lon - lastLon) * 100000);
      lastLon = out[0].lon;
    }
    // Sollwert je Bild: 10 Min/s × 600 m × 0,0167 s ≈ 100 m; ohne Glättung > 1 km
    expect(maxStep).toBeLessThan(250);
  });
});
