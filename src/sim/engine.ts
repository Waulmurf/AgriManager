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
import { fieldPattern, type FieldSet } from './fields';
import { generateFarms, type FarmSet } from './farms';
import { startCompany, type Company } from './economy';
import { Business, VISIT_MINUTES, type Command } from './business';
import { appendEdgePoints, nearestNode, RoadClass, type RoadGraph } from './roadgraph';

export const STEP_SECONDS = 60;
/** Werte je Fahrzeug im Positions-Schnappschuss */
export const SNAPSHOT_STRIDE = 4;

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
  owner: 'test' | 'player';
  machineId?: number;
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
  /** Testfahrzeug (zufällige Fahrten) oder Fahrzeug des Spielers (Aufgaben) */
  owner: 'test' | 'player';
  machineId?: number;
  task?: PlayerTask;
}

type PlayerTask =
  | { kind: 'visit'; farmId: number; phase: 'to' | 'at' | 'back' }
  | { kind: 'job'; orderId: number; queue: number[]; current: number; phase: 'to' | 'work' | 'back'; width: number; haPerHour: number };

export interface SimOptions {
  seed: number;
  vehicleCount: number;
  /** Echte Felder (fields.bin); ohne Felder wird neben Feldwegen ein gedachtes Feld bearbeitet */
  fields?: FieldSet;
  /** Hof (Startpunkt), lokale Meter; Standard: Kartenmitte */
  homeX?: number;
  homeY?: number;
}


const WORK_SPEED = 8 / 3.6; // Feldarbeit 8 km/h (gedachte Felder)
const LANE_WIDTH = 12; // Arbeitsbreite einer Bahn (m, gedachte Felder)
/**
 * Testfahrzeuge auf echten Feldern: Grubber 4 m, Flächenleistung 1,7 ha/h
 * (LWK-Erfahrungssätze 1,49–1,89 ha/h, siehe docs/maschinen.md).
 */
const TEST_WORK_WIDTH = 4;
const TEST_HA_PER_HOUR = 1.7;

export class Simulation {
  readonly graph: RoadGraph;
  readonly router: Router;
  private rng: Rng;
  private vehicles: Vehicle[] = [];
  private nextRouteId = 1;
  private pending: RouteGeom[] = [];
  private fieldNodes: Uint32Array;
  readonly fields: FieldSet | null;
  /** Kundenbetriebe auf den echten Feldern (ohne Felddaten: keine) */
  readonly farms: FarmSet | null;
  /** Betrieb des Spielers */
  readonly company: Company;
  /** Anfragen, Aufträge, Markt, Ereignisse */
  readonly business: Business;
  readonly homeNode: number;
  /** Spielzeit in Minuten seit Start */
  time = 0;

  constructor(graph: RoadGraph, opts: SimOptions) {
    this.graph = graph;
    this.rng = new Rng(opts.seed);
    this.router = new Router(graph);
    this.homeNode = nearestNode(graph, opts.homeX ?? 0, opts.homeY ?? 0);
    this.fields = opts.fields ?? null;
    this.farms = this.fields ? generateFarms(graph, this.fields, opts.seed) : null;
    this.fieldNodes = collectFieldNodes(graph);
    this.company = startCompany(this.homeNode);
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
        owner: 'test',
      });
    }
    // Fahrzeuge des Spielers (Schlepper, Firmenwagen) nach den Testfahrzeugen
    for (const m of this.company.machines) {
      if (m.type !== 'schlepper' && m.type !== 'firmenwagen') continue;
      const profile: ProfileKey = m.type === 'firmenwagen' ? 'car' : 'tractor';
      this.vehicles.push({
        id: this.vehicles.length,
        name: [m.brand, m.model].filter(Boolean).join(' '),
        brand: profile === 'car' ? COMPANY_CAR.name : m.brand,
        profile,
        prof: PROFILES[profile],
        state: VehicleState.Waiting,
        node: this.homeNode,
        route: null,
        seg: 0,
        segOff: 0,
        dist: 0,
        waitMin: 0,
        next: 'home',
        fieldNode: -1,
        trips: 0,
        owner: 'player',
        machineId: m.id,
      });
    }
    this.business = new Business(opts.seed, this.company, this.farms, this.fields);
    // Abgestellt am Hof: Route aus einem Punkt, damit jedes Fahrzeug eine Position hat
    for (const v of this.vehicles) {
      v.route = this.makeRoute([graph.x[this.homeNode]], [graph.y[this.homeNode]], [], 'road');
      this.pending.push(v.route);
    }
  }

  get vehicleInfo(): VehicleInfo[] {
    return this.vehicles.map(({ id, name, brand, profile, owner, machineId }) => ({ id, name, brand, profile, owner, machineId }));
  }

  /** Ein Schritt = 1 Spielminute. */
  step(): void {
    this.time++;
    if (this.time % 1440 === 0) this.business.daily(this.time); // täglich 06:00
    for (const v of this.vehicles) {
      if (v.owner === 'player') this.stepPlayer(v);
      else this.stepVehicle(v);
    }
  }

  /** Der Chef ist der einzige Fahrer: beschäftigt, solange ein Spielerfahrzeug eine Aufgabe hat. */
  get chefBusy(): string | null {
    for (const v of this.vehicles) {
      if (v.owner !== 'player' || !v.task) continue;
      return v.task.kind === 'visit' ? `Chef ist auf Besuch bei ${this.business.farmName(v.task.farmId)}` : 'Chef fährt einen Auftrag';
    }
    return null;
  }

  /** Was die Spielerfahrzeuge gerade tun (für die Oberfläche). */
  playerUnits(): { machineId: number; vehicle: number; status: string }[] {
    return this.vehicles
      .filter((v) => v.owner === 'player')
      .map((v) => {
        let status = 'am Hof';
        const t = v.task;
        if (t?.kind === 'visit') status = t.phase === 'to' ? `fährt zu ${this.business.farmName(t.farmId)}` : t.phase === 'at' ? `Besuch bei ${this.business.farmName(t.farmId)}` : 'fährt zurück zum Hof';
        if (t?.kind === 'job') {
          const o = this.business.orders.find((x) => x.id === t.orderId);
          const who = o ? this.business.farmName(o.farmId) : '';
          status = t.phase === 'to' ? `fährt zum Feld (${who})` : t.phase === 'work' ? `grubbert für ${who} (Feld ${t.current + 1}/${t.queue.length})` : 'fährt zurück zum Hof';
        }
        return { machineId: v.machineId!, vehicle: v.id, status };
      });
  }

  /** Spielerbefehl ausführen (zwischen zwei Schritten); liefert eine Rückmeldung. */
  command(cmd: Command): string {
    const b = this.business;
    const t = this.time;
    switch (cmd.kind) {
      case 'respond':
        return b.respond(cmd.requestId, cmd.action, t, cmd.priceHa);
      case 'buy':
        return b.buy(cmd.offerId, t);
      case 'visit': {
        const farm = this.farms?.farms[cmd.farmId];
        if (!farm) return 'Betrieb unbekannt';
        const busy = this.chefBusy;
        if (busy) return busy;
        const car = this.vehicles.find((v) => v.owner === 'player' && v.profile === 'car');
        if (!car) return 'Kein Firmenwagen';
        car.task = { kind: 'visit', farmId: farm.id, phase: 'to' };
        if (!this.driveTo(car, farm.homeNode)) return 'Hof nicht erreichbar';
        b.version++;
        return `Fahrt zu ${farm.name}`;
      }
      case 'startJob': {
        const o = b.orders.find((x) => x.id === cmd.orderId);
        if (!o || o.status !== 'offen') return 'Auftrag nicht startbar';
        const tractor = this.company.machines.find((m) => m.id === cmd.tractorId && m.type === 'schlepper');
        const impl = this.company.machines.find((m) => m.id === cmd.implementId);
        if (!tractor || !impl) return 'Maschine fehlt';
        if (impl.type !== 'grubber') return 'Für Grubbern wird ein Grubber gebraucht';
        if ((impl.powerNeed ?? 0) > (tractor.power ?? 0)) return 'Schlepper zu schwach für das Gerät';
        const busy = this.chefBusy;
        if (busy) return busy;
        const unit = this.vehicles.find((v) => v.owner === 'player' && v.machineId === tractor.id);
        if (!unit || unit.task) return 'Schlepper nicht verfügbar';
        if (!this.fields) return 'Keine Felddaten';
        unit.task = { kind: 'job', orderId: o.id, queue: o.fields.slice(), current: 0, phase: 'to', width: impl.width ?? 3, haPerHour: impl.haPerHour ?? 1.5 };
        if (!this.driveTo(unit, this.fields.access[o.fields[0]])) return 'Feld nicht erreichbar';
        b.orderStarted(o, tractor.id, impl.id, t);
        return 'Auftrag gestartet';
      }
    }
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

  /** Positionen aller Fahrzeuge: [routeId, Distanz, Zustand, bearbeitetes Feld oder -1] je Fahrzeug. */
  snapshot(out?: Float64Array): Float64Array {
    const a = out ?? new Float64Array(this.vehicles.length * SNAPSHOT_STRIDE);
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      const k = i * SNAPSHOT_STRIDE;
      a[k] = v.route ? v.route.id : 0;
      a[k + 1] = v.dist;
      a[k + 2] = v.state;
      a[k + 3] = v.state === VehicleState.Working && this.fields ? v.fieldNode : -1;
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
    mix(this.company.cash);
    mix(this.business.requests.length);
    mix(this.business.orders.length);
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
    } else if (this.fields) {
      // echtes Feld: fieldNode enthält den Feld-Index, Ziel ist die Feldzufahrt
      let fi = this.rng.int(this.fields.count);
      // Testfahrten: keine Riesen-Feldblöcke (bis 3 Versuche, deterministisch)
      for (let k = 0; k < 3 && this.fields.areaHa[fi] > 60; k++) fi = this.rng.int(this.fields.count);
      v.fieldNode = fi;
      target = this.fields.access[fi];
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
    if (v.profile === 'car') {
      // Firmenwagen arbeiten nicht auf dem Feld: kurzer Halt (z. B. Kundenbesuch), dann weiter
      v.trips++;
      v.next = this.rng.next() < 0.7 ? 'field' : 'home';
      v.state = VehicleState.Waiting;
      v.waitMin = this.rng.range(15, 30);
      return;
    }
    // am Feld angekommen: Feldarbeit als Bahnenmuster
    this.startRoute(v, this.fields ? this.buildRealFieldRoute(v.node, v.fieldNode) : this.buildFieldRoute(v.node));
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

  // ---------- Spielerfahrzeuge ----------

  private stepPlayer(v: Vehicle) {
    let budget = STEP_SECONDS;
    for (let guard = 0; budget > 0 && guard < 8; guard++) {
      if (v.state === VehicleState.Waiting) {
        if (!v.task || v.waitMin <= 0) return;
        v.waitMin--;
        if (v.waitMin > 0) return;
        this.playerWaitDone(v);
        continue;
      }
      budget = this.advance(v, budget);
      if (budget > 0 || v.dist >= v.route!.total) this.playerArrive(v);
    }
  }

  /** Fahrt zum Knoten starten; false, wenn nicht erreichbar */
  private driveTo(v: Vehicle, target: number): boolean {
    const path = this.router.route(v.node, target, v.prof);
    if (!path) {
      this.business.warn(this.time, `${v.name}: Ziel nicht erreichbar.`);
      v.task = undefined;
      v.state = VehicleState.Waiting;
      return false;
    }
    const r = path.length
      ? this.buildRoadRoute(v.node, path, v.prof)
      : this.makeRoute([this.graph.x[v.node]], [this.graph.y[v.node]], [], 'road');
    this.startRoute(v, r);
    v.node = target;
    return true;
  }

  private playerArrive(v: Vehicle) {
    const t = v.task;
    const b = this.business;
    if (!t) { v.state = VehicleState.Waiting; return; }
    if (t.kind === 'visit') {
      if (t.phase === 'to') {
        t.phase = 'at';
        v.state = VehicleState.Waiting;
        v.waitMin = VISIT_MINUTES;
        b.version++;
      } else {
        v.task = undefined;
        v.state = VehicleState.Waiting;
        b.version++;
      }
      return;
    }
    // Auftrag
    const o = b.orders.find((x) => x.id === t.orderId);
    if (t.phase === 'to') {
      const fi = t.queue[t.current];
      v.fieldNode = fi;
      this.startRoute(v, this.buildRealFieldRoute(v.node, fi, t.width, t.haPerHour));
      t.phase = 'work';
      b.version++;
    } else if (t.phase === 'work') {
      if (o) b.fieldDone(o, t.queue[t.current], this.time);
      this.addMachineHours(v, t);
      t.current++;
      if (t.current < t.queue.length) {
        t.phase = 'to';
        this.driveTo(v, this.fields!.access[t.queue[t.current]]);
      } else {
        t.phase = 'back';
        this.driveTo(v, this.homeNode);
      }
    } else {
      v.task = undefined;
      v.state = VehicleState.Waiting;
      b.version++;
    }
  }

  private playerWaitDone(v: Vehicle) {
    const t = v.task;
    if (t?.kind === 'visit' && t.phase === 'at') {
      this.business.onVisit(t.farmId, this.time);
      t.phase = 'back';
      this.driveTo(v, this.homeNode);
    }
  }

  /** Betriebsstunden für Schlepper und Gerät nach erledigtem Feld */
  private addMachineHours(v: Vehicle, t: Extract<PlayerTask, { kind: 'job' }>) {
    const fi = t.queue[t.current];
    const hours = this.fields!.areaHa[fi] / t.haPerHour;
    const o = this.business.orders.find((x) => x.id === t.orderId);
    for (const id of [v.machineId, o?.implementId]) {
      const m = this.company.machines.find((x) => x.id === id);
      if (m) m.hours = Math.round((m.hours + hours) * 10) / 10;
    }
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

  /**
   * Bahnen über ein echtes Feld: von der Zufahrt ins Feld, Bahnen im Feldumriss, zurück.
   * Die Dauer folgt der Flächenleistung (ha/h), nicht der Bahnlänge.
   */
  private buildRealFieldRoute(node: number, fi: number, width = TEST_WORK_WIDTH, haPerHour = TEST_HA_PER_HOUR): RouteGeom {
    const g = this.graph;
    const f = this.fields!;
    const s0 = f.ptStart[fi], n = f.ptCount[fi];
    const pat = fieldPattern(f.px.subarray(s0, s0 + n), f.py.subarray(s0, s0 + n), width, 150);
    const xs = [g.x[node], ...pat.xs, g.x[node]];
    const ys = [g.y[node], ...pat.ys, g.y[node]];
    let len = 0;
    for (let i = 1; i < xs.length; i++) {
      const dx = xs[i] - xs[i - 1], dy = ys[i] - ys[i - 1];
      len += Math.sqrt(dx * dx + dy * dy);
    }
    const seconds = (f.areaHa[fi] / haPerHour) * 3600;
    const speed = len > 0 && seconds > 0 ? len / seconds : WORK_SPEED;
    return this.makeRoute(xs, ys, new Array(xs.length - 1).fill(speed), 'field');
  }

  /** Bahnen über ein gedachtes Feld neben dem Feldzugang (ohne Felddaten, z. B. in Tests). */
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
