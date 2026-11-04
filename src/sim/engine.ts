/**
 * Deterministische Simulation: fester Zeitschritt von 1 Spielminute.
 * Reiner Rechenkern ohne DOM, Zeitgeber oder Math.random – dieselbe Eingabe
 * (Graph, Seed, Anzahl Schritte) ergibt immer denselben Zustand, egal wie
 * schnell die Schritte ausgeführt werden (1x, 10x, 100x).
 * Nur +, -, *, / und sqrt (IEEE-genau) im Zustand, damit Plattformen übereinstimmen.
 */
import { Rng } from './rng';
import { PROFILES, Router, type ProfileKey, type VehicleProfile } from './astar';
import { BRANDS, COMPANY_CAR } from '../data/brands';
import { appendEdgePoints, nearestNode, RoadClass, type RoadGraph } from './roadgraph';

export const STEP_SECONDS = 60;
/** Werte je Fahrzeug im Positions-Schnappschuss */
export const SNAPSHOT_STRIDE = 3;

export const VehicleState = { Waiting: 0, Driving: 1, Working: 2 } as const;
export type VehicleState = (typeof VehicleState)[keyof typeof VehicleState];

export interface RouteGeom {
  id: number;
  /** Punkte in Metern (lokale Projektion) */
  xs: Float64Array;
  ys: Float64Array;
  /** kumulierte Distanz je Punkt (m) */
  cum: Float64Array;
  /** Geschwindigkeit je Segment (m/s), Länge = Punkte - 1 */
  speed: Float64Array;
  total: number;
  kind: 'road' | 'field';
}

export interface VehicleInfo {
  id: number;
  name: string;
  brand: string;
  profile: ProfileKey;
}

interface Vehicle extends VehicleInfo {
  prof: VehicleProfile;
  state: VehicleState;
  node: number;
  route: RouteGeom | null;
  seg: number;
  segOff: number;
  dist: number;
  waitMin: number;
  /** nächster Schritt nach Ankunft */
  next: 'field' | 'home' | 'leave-field';
  fieldNode: number;
  trips: number;
}

export interface SimOptions {
  seed: number;
  vehicleCount: number;
  /** Hof (Startpunkt), lokale Meter; Standard: Kartenmitte */
  homeX?: number;
  homeY?: number;
}


const WORK_SPEED = 8 / 3.6; // Feldarbeit 8 km/h
const LANE_WIDTH = 12; // Arbeitsbreite einer Bahn (m)

export class Simulation {
  readonly graph: RoadGraph;
  readonly router: Router;
  private rng: Rng;
  private vehicles: Vehicle[] = [];
  private nextRouteId = 1;
  private pending: RouteGeom[] = [];
  private fieldNodes: Uint32Array;
  readonly homeNode: number;
  /** Spielzeit in Minuten seit Start */
  time = 0;

  constructor(graph: RoadGraph, opts: SimOptions) {
    this.graph = graph;
    this.rng = new Rng(opts.seed);
    this.router = new Router(graph);
    this.homeNode = nearestNode(graph, opts.homeX ?? 0, opts.homeY ?? 0);
    this.fieldNodes = collectFieldNodes(graph);
    for (let i = 0; i < opts.vehicleCount; i++) {
      const profile: ProfileKey = i % 5 === 4 ? 'car' : 'tractor';
      const brand = profile === 'car' ? COMPANY_CAR.name : BRANDS[i % BRANDS.length].name;
      this.vehicles.push({
        id: i,
        name: `${profile === 'car' ? 'Firmenwagen' : 'Schlepper'} ${i + 1}`,
        brand,
        profile,
        prof: PROFILES[profile],
        state: VehicleState.Waiting,
        node: this.homeNode,
        route: null,
        seg: 0,
        segOff: 0,
        dist: 0,
        // gestaffelte Abfahrt vom Hof
        waitMin: 1 + i * 2,
        next: 'field',
        fieldNode: -1,
        trips: 0,
      });
    }
    // Abgestellt am Hof: Route aus einem Punkt, damit jedes Fahrzeug eine Position hat
    for (const v of this.vehicles) {
      v.route = this.makeRoute([graph.x[this.homeNode]], [graph.y[this.homeNode]], [], 'road');
      this.pending.push(v.route);
    }
  }

  get vehicleInfo(): VehicleInfo[] {
    return this.vehicles.map(({ id, name, brand, profile }) => ({ id, name, brand, profile }));
  }

  /** Ein Schritt = 1 Spielminute. */
  step(): void {
    this.time++;
    for (const v of this.vehicles) this.stepVehicle(v);
  }

  run(steps: number): void {
    for (let i = 0; i < steps; i++) this.step();
  }

  /** Neue Routen seit dem letzten Aufruf (für die Oberfläche). */
  drainRoutes(): RouteGeom[] {
    const r = this.pending;
    this.pending = [];
    return r;
  }

  /** Positionen aller Fahrzeuge: [routeId, Distanz entlang der Route, Zustand] je Fahrzeug. */
  snapshot(out?: Float64Array): Float64Array {
    const a = out ?? new Float64Array(this.vehicles.length * SNAPSHOT_STRIDE);
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      a[i * 3] = v.route ? v.route.id : 0;
      a[i * 3 + 1] = v.dist;
      a[i * 3 + 2] = v.state;
    }
    return a;
  }

  /** Position eines Fahrzeugs in lokalen Metern (für Tests und Auswertung). */
  position(i: number): [number, number] {
    const v = this.vehicles[i];
    if (!v.route) return [this.graph.x[v.node], this.graph.y[v.node]];
    return pointAt(v.route, v.dist);
  }

  /** Prüfsumme über den gesamten Zustand (FNV-1a über die Bits). */
  hash(): string {
    const buf = new ArrayBuffer(8);
    const dv = new DataView(buf);
    let h = 0x811c9dc5;
    const mix = (n: number) => {
      dv.setFloat64(0, n, true);
      for (let i = 0; i < 8; i++) {
        h ^= dv.getUint8(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
    };
    mix(this.time);
    mix(this.nextRouteId);
    for (const s of this.rng.getState()) mix(s);
    for (const v of this.vehicles) {
      mix(v.state); mix(v.node); mix(v.route ? v.route.id : 0); mix(v.seg); mix(v.segOff);
      mix(v.dist); mix(v.waitMin); mix(v.trips); mix(v.fieldNode);
    }
    return h.toString(16).padStart(8, '0');
  }

  stats() {
    let driving = 0, working = 0, waiting = 0, trips = 0;
    for (const v of this.vehicles) {
      if (v.state === VehicleState.Driving) driving++;
      else if (v.state === VehicleState.Working) working++;
      else waiting++;
      trips += v.trips;
    }
    return { time: this.time, driving, working, waiting, trips, searches: this.router.searches, cacheHits: this.router.cacheHits };
  }

  // ---------------------------------------------------------------------------

  private stepVehicle(v: Vehicle) {
    let budget = STEP_SECONDS;
    // Mehrere Zustandswechsel innerhalb einer Minute sind möglich.
    for (let guard = 0; budget > 0 && guard < 8; guard++) {
      if (v.state === VehicleState.Waiting) {
        if (v.waitMin > 1) {
          v.waitMin--;
          return;
        }
        v.waitMin = 0;
        this.depart(v);
        if (v.state === VehicleState.Waiting) return;
        continue;
      }
      budget = this.advance(v, budget);
      if (budget > 0 || v.dist >= v.route!.total) this.arrive(v);
    }
  }

  /** Bewegt das Fahrzeug höchstens `budget` Sekunden entlang der Route; liefert Restzeit. */
  private advance(v: Vehicle, budget: number): number {
    const r = v.route!;
    while (budget > 0 && v.seg < r.speed.length) {
      const segLen = r.cum[v.seg + 1] - r.cum[v.seg];
      const left = segLen - v.segOff;
      const sp = r.speed[v.seg];
      const t = left / sp;
      if (t <= budget) {
        budget -= t;
        v.seg++;
        v.segOff = 0;
        v.dist = r.cum[v.seg];
      } else {
        v.segOff += sp * budget;
        v.dist = r.cum[v.seg] + v.segOff;
        budget = 0;
      }
    }
    return v.seg >= r.speed.length ? Math.max(budget, 1e-9) : 0;
  }

  private depart(v: Vehicle) {
    let target: number;
    if (v.next === 'home') {
      target = this.homeNode;
    } else {
      target = this.fieldNodes[this.rng.int(this.fieldNodes.length)];
      v.fieldNode = target;
    }
    const path = this.router.route(v.node, target, v.prof);
    if (!path || path.length === 0) {
      // Ziel nicht erreichbar oder identisch: später erneut versuchen
      v.next = 'field';
      v.waitMin = 5;
      return;
    }
    this.startRoute(v, this.buildRoadRoute(v.node, path, v.prof));
    v.node = target;
  }

  private arrive(v: Vehicle) {
    const r = v.route!;
    if (r.kind === 'field') {
      v.trips++;
      // nach der Feldarbeit: weiteres Feld oder zurück zum Hof
      v.next = this.rng.next() < 0.7 ? 'field' : 'home';
      v.state = VehicleState.Waiting;
      v.waitMin = this.rng.range(2, 10);
      return;
    }
    if (v.next === 'home') {
      v.state = VehicleState.Waiting;
      v.next = 'field';
      v.waitMin = this.rng.range(30, 90);
      return;
    }
    // am Feld angekommen: Feldarbeit als Bahnenmuster
    this.startRoute(v, this.buildFieldRoute(v.node));
    v.state = VehicleState.Working;
  }

  private startRoute(v: Vehicle, r: RouteGeom) {
    v.route = r;
    v.seg = 0;
    v.segOff = 0;
    v.dist = 0;
    v.state = r.kind === 'field' ? VehicleState.Working : VehicleState.Driving;
    this.pending.push(r);
  }

  private buildRoadRoute(from: number, path: Uint32Array, p: VehicleProfile): RouteGeom {
    const g = this.graph;
    const xs: number[] = [g.x[from]];
    const ys: number[] = [g.y[from]];
    const speeds: number[] = [];
    for (const de of path) {
      const before = xs.length;
      appendEdgePoints(g, de, xs, ys);
      const sp = p.speedByClass[g.edgeClass[de >>> 1]];
      for (let i = before; i < xs.length; i++) speeds.push(sp);
    }
    return this.makeRoute(xs, ys, speeds, 'road');
  }

  /** Bahnen über ein gedachtes Feld neben dem Feldzugang (bis echte Feldblöcke da sind). */
  private buildFieldRoute(node: number): RouteGeom {
    const g = this.graph;
    const x0 = g.x[node], y0 = g.y[node];
    const lanes = this.rng.range(6, 14);
    const len = this.rng.range(120, 260);
    // Ausrichtung: eine von acht Richtungen (exakte Werte statt sin/cos)
    const dirs: [number, number][] = [[1, 0], [0.70710678, 0.70710678], [0, 1], [-0.70710678, 0.70710678], [-1, 0], [-0.70710678, -0.70710678], [0, -1], [0.70710678, -0.70710678]];
    const [ux, uy] = dirs[this.rng.int(8)];
    const nx = -uy, ny = ux; // quer zur Bahn
    const ox = x0 + nx * 20, oy = y0 + ny * 20; // Feldecke 20 m neben der Zufahrt
    const xs = [x0, ox];
    const ys = [y0, oy];
    for (let l = 0; l < lanes; l++) {
      const off = l * LANE_WIDTH;
      const a = l % 2 === 0 ? 0 : len;
      const b = l % 2 === 0 ? len : 0;
      xs.push(ox + nx * off + ux * a, ox + nx * off + ux * b);
      ys.push(oy + ny * off + uy * a, oy + ny * off + uy * b);
    }
    xs.push(x0);
    ys.push(y0);
    const speeds = new Array(xs.length - 1).fill(WORK_SPEED);
    return this.makeRoute(xs, ys, speeds, 'field');
  }

  private makeRoute(xs: number[], ys: number[], speeds: number[], kind: RouteGeom['kind']): RouteGeom {
    const n = xs.length;
    const cum = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      const dx = xs[i] - xs[i - 1], dy = ys[i] - ys[i - 1];
      cum[i] = cum[i - 1] + Math.sqrt(dx * dx + dy * dy);
    }
    // Segmente der Länge 0 bekommen eine endliche Geschwindigkeit, Zeit = 0
    return {
      id: this.nextRouteId++,
      xs: Float64Array.from(xs),
      ys: Float64Array.from(ys),
      cum,
      speed: Float64Array.from(speeds),
      total: cum[n - 1],
      kind,
    };
  }
}

/** Feldzugänge: Endknoten von Feldwegen (track) innerhalb des Spielradius. */
function collectFieldNodes(g: RoadGraph): Uint32Array {
  const seen = new Uint8Array(g.nodeCount);
  const out: number[] = [];
  const r2 = g.radiusM * g.radiusM;
  for (let e = 0; e < g.edgeCount; e++) {
    if (g.edgeClass[e] !== RoadClass.Track) continue;
    for (const n of [g.edgeU[e], g.edgeV[e]]) {
      if (seen[n]) continue;
      seen[n] = 1;
      if (g.x[n] * g.x[n] + g.y[n] * g.y[n] <= r2) out.push(n);
    }
  }
  if (out.length === 0) for (let n = 0; n < g.nodeCount; n++) out.push(n);
  return Uint32Array.from(out);
}

/** Punkt bei Distanz d entlang einer Route (binäre Suche). */
export function pointAt(r: Pick<RouteGeom, 'xs' | 'ys' | 'cum'>, d: number): [number, number] {
  const n = r.cum.length;
  if (d <= 0) return [r.xs[0], r.ys[0]];
  if (d >= r.cum[n - 1]) return [r.xs[n - 1], r.ys[n - 1]];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (r.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const L = r.cum[hi] - r.cum[lo];
  const t = L > 0 ? (d - r.cum[lo]) / L : 0;
  return [r.xs[lo] + (r.xs[hi] - r.xs[lo]) * t, r.ys[lo] + (r.ys[hi] - r.ys[lo]) * t];
}
