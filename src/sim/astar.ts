import type { RoadGraph } from './roadgraph';

/** Fahrprofil: Durchschnittsgeschwindigkeiten je Straßenklasse, innerorts und in Kurven. */
export interface VehicleProfile {
  name: string;
  /** m/s je Straßenklasse 0..9 (außerorts, ohne Tempolimit) */
  speedByClass: Float64Array;
  /** bauartbedingte Höchstgeschwindigkeit (m/s) */
  maxSpeed: number;
  /** Durchschnitt innerorts (m/s) */
  urbanSpeed: number;
  /** Anteil des Tempolimits, der im Schnitt gefahren wird */
  limitFactor: number;
  /** Kurventempo (m/s) für Richtungswechsel > 90°, 60–90°, 30–60°, 15–30° */
  curve: [number, number, number, number];
  /** Länge der Bremszone vor/nach einer Kurve (m) */
  curveZone: number;
}

const kmh = (v: number) => v / 3.6;

function profile(
  name: string,
  max: number,
  table: Record<number, number>,
  urban: number,
  limitFactor: number,
  curve: [number, number, number, number],
  curveZone: number,
): VehicleProfile {
  const s = new Float64Array(10);
  for (let c = 0; c < 10; c++) s[c] = kmh(Math.min(max, table[c] ?? 30));
  return {
    name,
    speedByClass: s,
    maxSpeed: kmh(max),
    urbanSpeed: kmh(urban),
    limitFactor,
    curve: curve.map(kmh) as [number, number, number, number],
    curveZone,
  };
}

/**
 * Fahrprofile (Annahmen, siehe docs/plan.md „Fahrprofile“):
 * - Schlepper 40 km/h bauartbedingt; Landstraße im Schnitt 38, innerorts 30, Feldwege 15 km/h
 * - Firmenwagen (Pkw) bis 100 km/h; Landstraße 85–95, innerorts 45, Feldwege 25 km/h
 * Tempolimits aus OSM (maxspeed) begrenzen zusätzlich; vor Kurven wird abgebremst.
 * Fähre: Überfahrt inkl. Warten grob 8 km/h.
 */
export const PROFILES = {
  tractor: profile('Schlepper', 40, { 1: 38, 2: 38, 3: 38, 4: 36, 5: 32, 6: 25, 7: 15, 8: 15, 9: 8 }, 30, 1, [10, 15, 25, 32], 25),
  car: profile('Firmenwagen', 100, { 1: 95, 2: 90, 3: 85, 4: 75, 5: 60, 6: 30, 7: 20, 8: 25, 9: 8 }, 45, 0.95, [15, 25, 45, 70], 40),
} as const;

const speedCache = new WeakMap<RoadGraph, Map<string, Float64Array>>();

/**
 * Fahrgeschwindigkeit je Kante (m/s) für ein Profil: Klasse, Tempolimit, innerorts.
 * Einmal je Graph und Profil berechnet.
 */
export function edgeSpeeds(g: RoadGraph, p: VehicleProfile): Float64Array {
  let byProfile = speedCache.get(g);
  if (!byProfile) speedCache.set(g, (byProfile = new Map()));
  let a = byProfile.get(p.name);
  if (a) return a;
  a = new Float64Array(g.edgeCount);
  for (let e = 0; e < g.edgeCount; e++) {
    const cls = g.edgeClass[e];
    let v = p.speedByClass[cls];
    if (cls !== 9) {
      const limit = g.edgeMaxSpeed ? g.edgeMaxSpeed[e] : 0;
      if (limit > 0) v = Math.min(v, kmh(limit) * p.limitFactor);
      if (g.edgeFlags[e] & 8) v = Math.min(v, p.urbanSpeed);
    }
    a[e] = Math.max(v, kmh(5));
  }
  byProfile.set(p.name, a);
  return a;
}

/** Kurventempo (m/s) für einen Richtungswechsel mit Kosinus cos; Infinity = keine Bremsung */
export function curveSpeed(p: VehicleProfile, cos: number): number {
  if (cos < 0) return p.curve[0];
  if (cos < 0.5) return p.curve[1];
  if (cos < 0.866) return p.curve[2];
  if (cos < 0.966) return p.curve[3];
  return Infinity;
}

export type ProfileKey = keyof typeof PROFILES;

/** Binärer Min-Heap mit deterministischer Gleichstandsregel (kleinere Knoten-ID zuerst). */
class Heap {
  private keys: number[] = [];
  private nodes: number[] = [];

  get size() {
    return this.nodes.length;
  }

  private less(i: number, j: number) {
    const a = this.keys[i], b = this.keys[j];
    return a < b || (a === b && this.nodes[i] < this.nodes[j]);
  }

  private swap(i: number, j: number) {
    const k = this.keys[i]; this.keys[i] = this.keys[j]; this.keys[j] = k;
    const n = this.nodes[i]; this.nodes[i] = this.nodes[j]; this.nodes[j] = n;
  }

  push(key: number, node: number) {
    this.keys.push(key);
    this.nodes.push(node);
    let i = this.nodes.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.nodes[0];
    const lastK = this.keys.pop()!;
    const lastN = this.nodes.pop()!;
    if (this.nodes.length) {
      this.keys[0] = lastK;
      this.nodes[0] = lastN;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.nodes.length && this.less(l, m)) m = l;
        if (r < this.nodes.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
}

/**
 * A*-Suche nach kürzester Fahrzeit. Liefert die Folge gerichteter Kanten
 * (edgeId*2 + Richtung) oder null, wenn kein Weg existiert.
 * Wiederverwendbare Arbeitsfelder machen wiederholte Suchen günstig.
 */
export class Router {
  private g: RoadGraph;
  private gScore: Float64Array;
  private cameFrom: Int32Array;
  private visitStamp: Uint32Array;
  private closedStamp: Uint32Array;
  private stamp = 0;
  private cache = new Map<string, Uint32Array | null>();
  private cacheLimit: number;
  searches = 0;
  cacheHits = 0;

  constructor(g: RoadGraph, cacheLimit = 4000) {
    this.g = g;
    this.gScore = new Float64Array(g.nodeCount);
    this.cameFrom = new Int32Array(g.nodeCount);
    this.visitStamp = new Uint32Array(g.nodeCount);
    this.closedStamp = new Uint32Array(g.nodeCount);
    this.cacheLimit = cacheLimit;
  }

  route(from: number, to: number, p: VehicleProfile): Uint32Array | null {
    const key = `${p.name}:${from}:${to}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) {
      this.cacheHits++;
      // LRU: an das Ende verschieben
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const r = this.search(from, to, p);
    this.cache.set(key, r);
    if (this.cache.size > this.cacheLimit) {
      this.cache.delete(this.cache.keys().next().value!);
    }
    return r;
  }

  private search(from: number, to: number, p: VehicleProfile): Uint32Array | null {
    this.searches++;
    const g = this.g;
    if (from === to) return new Uint32Array(0);
    this.stamp++;
    if (this.stamp === 0xffffffff) {
      this.visitStamp.fill(0);
      this.closedStamp.fill(0);
      this.stamp = 1;
    }
    const st = this.stamp;
    const tx = g.x[to], ty = g.y[to];
    const inv = 1 / p.maxSpeed;
    const h = (n: number) => {
      const dx = g.x[n] - tx, dy = g.y[n] - ty;
      return Math.sqrt(dx * dx + dy * dy) * inv;
    };
    const speeds = edgeSpeeds(g, p);
    const open = new Heap();
    this.gScore[from] = 0;
    this.cameFrom[from] = -1;
    this.visitStamp[from] = st;
    open.push(h(from), from);
    while (open.size) {
      const n = open.pop();
      if (this.closedStamp[n] === st) continue;
      this.closedStamp[n] = st;
      if (n === to) break;
      const gn = this.gScore[n];
      for (let i = g.adjStart[n], end = g.adjStart[n + 1]; i < end; i++) {
        const m = g.adjTo[i];
        if (this.closedStamp[m] === st) continue;
        const de = g.adjDirEdge[i];
        const e = de >>> 1;
        const cost = gn + g.edgeLen[e] / speeds[e];
        if (this.visitStamp[m] !== st || cost < this.gScore[m]) {
          this.visitStamp[m] = st;
          this.gScore[m] = cost;
          this.cameFrom[m] = de;
          open.push(cost + h(m), m);
        }
      }
    }
    if (this.closedStamp[to] !== st) return null;
    const path: number[] = [];
    let n = to;
    while (n !== from) {
      const de = this.cameFrom[n];
      path.push(de);
      const e = de >>> 1;
      n = de & 1 ? g.edgeV[e] : g.edgeU[e];
    }
    path.reverse();
    return Uint32Array.from(path);
  }
}
