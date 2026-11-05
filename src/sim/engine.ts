/**
 * Deterministische Simulation: fester Zeitschritt von 1 Spielminute.
 * Reiner Rechenkern ohne DOM, Zeitgeber oder Math.random – dieselbe Eingabe
 * (Graph, Seed, Anzahl Schritte) ergibt immer denselben Zustand, egal wie
 * schnell die Schritte ausgeführt werden (1x, 10x, 100x).
 * Nur +, -, *, / und sqrt (IEEE-genau) im Zustand, damit Plattformen übereinstimmen.
 */
import { Rng } from './rng';
import { PROFILES, Router, curveSpeed, edgeSpeeds, type ProfileKey, type VehicleProfile } from './astar';
import { BRANDS, COMPANY_CAR } from '../data/brands';
import { fieldPattern, type FieldSet } from './fields';
import { generateFarms, type FarmSet } from './farms';
import { startCompany, type Company } from './economy';
import { Business, REMIND_CALL_MINUTES, VISIT_MINUTES, fmtHa, type Command, type QueueCommand, type QueueItem } from './business';
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
  /** Fahrzeit (s) */
  duration: number;
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
  /** Feierabend bis Spielminute (Arbeitszeit des Chefs) */
  restUntil: number;
  /** zuletzt für Diesel abgerechnete Route */
  chargedRoute: number;
}

export const SAVE_VERSION = 1;

export interface SaveState {
  version: number;
  time: number;
  chefMinutes: number;
  nextRouteId: number;
  rng: [number, number, number, number];
  company: Company;
  business: ReturnType<Business['serialize']>;
  /** je Betrieb [bekannt 0/1, Zufriedenheit] */
  farms: [number, number][];
  vehicles: {
    state: VehicleState; node: number; seg: number; segOff: number; dist: number; waitMin: number;
    next: 'field' | 'home' | 'leave-field'; fieldNode: number; trips: number; restUntil: number; chargedRoute: number;
    task: PlayerTask | null;
    route: { id: number; kind: RouteGeom['kind']; xs: number[]; ys: number[]; speed: number[] } | null;
  }[];
  /** Warteschlange des Chefs (ab Phase 3 je Mitarbeiter) */
  queue?: QueueItem[];
  nextQueueId?: number;
}

export interface PlayerUnitInfo {
  machineId: number;
  vehicle: number;
  status: string;
  /** aktuelle Geschwindigkeit km/h */
  kmh: number;
  hours: number;
  busy: boolean;
  orderId?: number;
}

type PlayerTask =
  | { kind: 'visit'; farmId: number; phase: 'to' | 'at' | 'back' }
  | {
      kind: 'job';
      orderId: number;
      queue: number[];
      current: number;
      phase: 'prep' | 'to' | 'setup' | 'work' | 'back' | 'unhitch';
      width: number;
      haPerHour: number;
      workKmh: number;
      dieselLHa: number;
    };

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
/** Arbeitstempo Grubber (km/h); Wenden und Fahren im Feld */
const TEST_WORK_KMH = 10;
const FIELD_TURN_KMH = 6;
const FIELD_DRIVE_KMH = 8;

/** Rüstzeiten (Annahmen nach KTBL-Größenordnung): Anbauen am Hof, Einrichten je Feld, Abbauen */
export const RUEST_HOF_MIN = 15;
export const RUEST_FELD_MIN = 5;
export const RUEST_ABBAU_MIN = 10;
/** Höchstarbeitszeit des Chefs je Tag (ArbZG § 3: 10 h), Tageswechsel 06:00 */
export const CHEF_MAX_MINUTES = 600;
/** Geplante Aufgaben starten nur tagsüber: bis 20:00 (Minute des Tages ab 06:00) */
export const QUEUE_LAST_START = 14 * 60;
/** Dieselverbrauch (Annahmen): Schlepper 200 PS auf der Straße, Pkw */
export const DIESEL_TRACTOR_ROAD_L_KM = 0.35;
export const DIESEL_CAR_L_KM = 0.07;

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
  /** heutige Arbeitsminuten des Chefs (Reset um 06:00) */
  chefMinutes = 0;
  /** geplante Aufgaben des Chefs, werden nacheinander abgearbeitet */
  queue: QueueItem[] = [];
  private nextQueueId = 1;

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
        restUntil: 0,
        chargedRoute: 0,
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
        restUntil: 0,
        chargedRoute: 0,
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
    if (this.time % 1440 === 0) {
      this.business.daily(this.time); // täglich 06:00
      this.chefMinutes = 0;
    }
    // Arbeitszeit des Chefs: zählt, solange er unterwegs ist (nicht im Feierabend)
    if (this.vehicles.some((v) => v.owner === 'player' && v.task && v.restUntil <= this.time)) this.chefMinutes++;
    for (const v of this.vehicles) {
      if (v.owner === 'player') this.stepPlayer(v);
      else this.stepVehicle(v);
    }
    if (this.queue.length) this.runQueue();
  }

  /** Nächste geplante Aufgabe starten, sobald der Chef frei ist (tagsüber, mit Arbeitszeit übrig) */
  private runQueue() {
    if (this.time % 1440 >= QUEUE_LAST_START || this.chefMinutes >= CHEF_MAX_MINUTES) return;
    while (this.queue.length && !this.chefBusy) {
      const item = this.queue.shift()!;
      this.business.version++;
      const err = this.checkQueueCommand(item.cmd, item.id);
      const msg = err ?? this.startNow(item.cmd);
      if (this.chefBusy) this.business.info(this.time, `Plan: ${item.label} – ${msg}`);
      else this.business.warn(this.time, `Geplant, aber nicht möglich: ${item.label} – ${msg}`);
    }
  }

  /** Prüfungen, die unabhängig davon gelten, ob der Chef gerade frei ist; null = in Ordnung */
  private checkQueueCommand(cmd: QueueCommand, ignoreQueueId = 0): string | null {
    const b = this.business;
    if (cmd.kind === 'visit') {
      if (!this.farms?.farms[cmd.farmId]) return 'Betrieb unbekannt';
      if (!this.vehicles.some((v) => v.owner === 'player' && v.profile === 'car')) return 'Kein Firmenwagen';
      return null;
    }
    const o = b.orders.find((x) => x.id === cmd.orderId);
    if (!o || o.status !== 'offen') return 'Auftrag nicht startbar';
    const tractor = this.company.machines.find((m) => m.id === cmd.tractorId && m.type === 'schlepper');
    const impl = this.company.machines.find((m) => m.id === cmd.implementId);
    if (!tractor || !impl) return 'Maschine fehlt';
    if (impl.type !== 'grubber') return 'Für Grubbern wird ein Grubber gebraucht';
    if ((impl.powerNeed ?? 0) > (tractor.power ?? 0)) return 'Schlepper zu schwach für das Gerät';
    if (!this.fields) return 'Keine Felddaten';
    if (!o.fields.some((f) => !o.doneFields.includes(f))) return 'Alle Felder erledigt';
    if (this.queue.some((q) => q.id !== ignoreQueueId && q.cmd.kind === 'startJob' && q.cmd.orderId === o.id)) return 'Auftrag ist schon eingeplant';
    return null;
  }

  private queueLabel(cmd: QueueCommand): string {
    const b = this.business;
    if (cmd.kind === 'visit') return `Besuch ${b.farmName(cmd.farmId)}`;
    const o = b.orders.find((x) => x.id === cmd.orderId);
    return o ? `Grubbern ${b.farmName(o.farmId)} (${fmtHa(o.areaHa)})` : 'Auftrag';
  }

  /** Besuch oder Auftrag sofort starten oder, wenn der Chef beschäftigt ist, hinten einplanen */
  private startOrQueue(cmd: QueueCommand): string {
    const err = this.checkQueueCommand(cmd);
    if (err) return err;
    const busy = this.chefBusy;
    const tired = this.chefMinutes >= CHEF_MAX_MINUTES;
    if (busy || tired || this.queue.length) {
      if (cmd.kind === 'visit' && this.queue.some((q) => q.cmd.kind === 'visit' && q.cmd.farmId === cmd.farmId)) return 'Besuch ist schon eingeplant';
      const label = this.queueLabel(cmd);
      this.queue.push({ id: this.nextQueueId++, cmd: { ...cmd }, label });
      this.business.version++;
      return `Eingeplant als Nr. ${this.queue.length}: ${label}${tired && !busy ? ' (ab 06:00)' : ''}`;
    }
    return this.startNow(cmd);
  }

  /** Startet die Aufgabe; der Chef muss frei sein (Prüfung vorher über checkQueueCommand) */
  private startNow(cmd: QueueCommand): string {
    const b = this.business;
    const t = this.time;
    if (cmd.kind === 'visit') {
      const farm = this.farms!.farms[cmd.farmId];
      const car = this.vehicles.find((v) => v.owner === 'player' && v.profile === 'car')!;
      car.task = { kind: 'visit', farmId: farm.id, phase: 'to' };
      if (!this.driveTo(car, farm.homeNode)) return 'Hof nicht erreichbar';
      b.version++;
      return `Fahrt zu ${farm.name}`;
    }
    const o = b.orders.find((x) => x.id === cmd.orderId)!;
    const tractor = this.company.machines.find((m) => m.id === cmd.tractorId)!;
    const impl = this.company.machines.find((m) => m.id === cmd.implementId)!;
    const unit = this.vehicles.find((v) => v.owner === 'player' && v.machineId === tractor.id);
    if (!unit || unit.task) return 'Schlepper nicht verfügbar';
    const queue = o.fields.filter((f) => !o.doneFields.includes(f));
    unit.task = {
      kind: 'job', orderId: o.id, queue, current: 0, phase: 'prep',
      width: impl.width ?? 3, haPerHour: impl.haPerHour ?? 1.5, workKmh: impl.workKmh ?? 10,
      dieselLHa: impl.dieselLHa ?? 9,
    };
    unit.state = VehicleState.Waiting;
    unit.waitMin = RUEST_HOF_MIN;
    b.orderStarted(o, tractor.id, impl.id, t);
    return 'Auftrag gestartet';
  }

  /** Der Chef ist der einzige Fahrer: beschäftigt, solange ein Spielerfahrzeug eine Aufgabe hat. */
  get chefBusy(): string | null {
    for (const v of this.vehicles) {
      if (v.owner !== 'player' || !v.task) continue;
      return v.task.kind === 'visit' ? `Chef ist auf Besuch bei ${this.business.farmName(v.task.farmId)}` : 'Chef fährt einen Auftrag';
    }
    return null;
  }

  /** Was die Spielerfahrzeuge gerade tun (für Oberfläche und Rechtsklick-Menü). */
  playerUnits(): PlayerUnitInfo[] {
    return this.vehicles
      .filter((v) => v.owner === 'player')
      .map((v) => {
        let status = 'am Hof';
        const t = v.task;
        const b = this.business;
        if (t?.kind === 'visit') status = t.phase === 'to' ? `fährt zu ${b.farmName(t.farmId)}` : t.phase === 'at' ? `Besuch bei ${b.farmName(t.farmId)}` : 'fährt zurück zum Hof';
        if (t?.kind === 'job') {
          const o = b.orders.find((x) => x.id === t.orderId);
          const who = o ? b.farmName(o.farmId) : '';
          const n = `Feld ${t.current + 1}/${t.queue.length}`;
          status = {
            prep: 'baut am Hof das Gerät an (Rüstzeit)',
            to: `fährt zum Feld (${who}, ${n})`,
            setup: `richtet das Gerät am Feld ein (${n})`,
            work: `grubbert für ${who} (${n})`,
            back: 'fährt zurück zum Hof',
            unhitch: 'baut am Hof das Gerät ab',
          }[t.phase];
        }
        if (v.restUntil > this.time) status = `Feierabend (Arbeitszeit erreicht), weiter um 06:00 – ${status}`;
        const moving = v.route && v.seg < v.route.speed.length && (v.state === VehicleState.Driving || v.state === VehicleState.Working) && v.restUntil <= this.time;
        const kmh = moving ? Math.round(v.route!.speed[v.seg] * 3.6) : 0;
        const m = this.company.machines.find((x) => x.id === v.machineId);
        return { machineId: v.machineId!, vehicle: v.id, status, kmh: kmh > 200 ? 0 : kmh, hours: m?.hours ?? 0, busy: !!t, orderId: t?.kind === 'job' ? t.orderId : undefined };
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
      case 'remind': {
        // Anruf geht auch unterwegs, kostet aber Arbeitszeit des Chefs
        if (this.chefMinutes >= CHEF_MAX_MINUTES) return 'Arbeitszeit des Chefs für heute erreicht (ab 06:00 wieder)';
        const r = b.remind(cmd.invoiceId, t);
        if (r === 'Kunde angerufen') this.chefMinutes += REMIND_CALL_MINUTES;
        return r;
      }
      case 'visit':
      case 'startJob':
        return this.startOrQueue(cmd);
      case 'dequeue': {
        const i = this.queue.findIndex((q) => q.id === cmd.queueId);
        if (i < 0) return 'Nicht mehr geplant';
        const [q] = this.queue.splice(i, 1);
        b.version++;
        return `Aus dem Plan genommen: ${q.label}`;
      }
      case 'queueMove': {
        const i = this.queue.findIndex((q) => q.id === cmd.queueId);
        const j = i + cmd.dir;
        if (i < 0 || j < 0 || j >= this.queue.length) return 'Nicht verschiebbar';
        [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        b.version++;
        return 'Reihenfolge geändert';
      }
      case 'recall': {
        const v = this.vehicles[cmd.vehicle];
        if (!v || v.owner !== 'player') return 'Nur eigene Fahrzeuge können zurückgerufen werden';
        const task = v.task;
        if (!task) return 'Fahrzeug ist schon am Hof';
        v.restUntil = 0;
        if (task.kind === 'job') {
          const o = b.orders.find((x) => x.id === task.orderId);
          if (o && o.status === 'läuft') b.orderInterrupted(o, t);
          if (task.phase === 'prep') { v.task = undefined; v.state = VehicleState.Waiting; b.version++; return 'Abgebrochen, Schlepper bleibt am Hof'; }
          if (task.phase === 'back' || task.phase === 'unhitch') return 'Fahrzeug ist schon auf dem Rückweg';
          task.phase = 'back';
        } else {
          if (task.phase === 'back') return 'Fahrzeug ist schon auf dem Rückweg';
          task.phase = 'back';
        }
        this.driveFromHere(v, this.homeNode);
        b.version++;
        return `${v.name} fährt zurück zum Hof`;
      }
    }
  }

  /**
   * Spielstand: gesamter veränderlicher Zustand als JSON-fähiges Objekt.
   * Betriebe, Felder und Graph entstehen beim Laden wieder aus Seed und Kartendaten.
   */
  serialize(): SaveState {
    const route = (r: RouteGeom | null) =>
      r ? { id: r.id, kind: r.kind, xs: Array.from(r.xs), ys: Array.from(r.ys), speed: Array.from(r.speed) } : null;
    return {
      version: SAVE_VERSION,
      time: this.time,
      chefMinutes: this.chefMinutes,
      nextRouteId: this.nextRouteId,
      rng: this.rng.getState(),
      company: structuredClone(this.company),
      business: structuredClone(this.business.serialize()),
      farms: this.farms ? this.farms.farms.map((f) => [f.known ? 1 : 0, f.satisfaction] as [number, number]) : [],
      vehicles: this.vehicles.map((v) => ({
        state: v.state, node: v.node, route: route(v.route), seg: v.seg, segOff: v.segOff, dist: v.dist,
        waitMin: v.waitMin, next: v.next, fieldNode: v.fieldNode, trips: v.trips,
        task: v.task ? structuredClone(v.task) : null, restUntil: v.restUntil, chargedRoute: v.chargedRoute,
      })),
      queue: structuredClone(this.queue),
      nextQueueId: this.nextQueueId,
    };
  }

  /** Spielstand laden (Simulation muss mit denselben Kartendaten, Seed und Fahrzeugzahl erzeugt sein) */
  restore(s: SaveState): void {
    if (s.version !== SAVE_VERSION) throw new Error(`Spielstand-Version ${s.version} wird nicht unterstützt`);
    if (s.vehicles.length !== this.vehicles.length) throw new Error('Spielstand passt nicht zu den Fahrzeugen');
    this.time = s.time;
    this.chefMinutes = s.chefMinutes;
    this.nextRouteId = s.nextRouteId;
    this.rng.setState(s.rng);
    Object.assign(this.company, structuredClone(s.company));
    this.business.restore(s.business);
    if (this.farms) s.farms.forEach(([known, sat], i) => {
      const f = this.farms!.farms[i];
      if (f) { f.known = known === 1; f.satisfaction = sat; }
    });
    this.pending = [];
    this.queue = structuredClone(s.queue ?? []);
    this.nextQueueId = s.nextQueueId ?? 1;
    s.vehicles.forEach((d, i) => {
      const v = this.vehicles[i];
      Object.assign(v, {
        state: d.state, node: d.node, seg: d.seg, segOff: d.segOff, dist: d.dist, waitMin: d.waitMin,
        next: d.next, fieldNode: d.fieldNode, trips: d.trips, task: d.task ? structuredClone(d.task) : undefined,
        restUntil: d.restUntil, chargedRoute: d.chargedRoute,
      });
      if (d.route) {
        const r = d.route;
        const n = r.xs.length;
        const cum = new Float64Array(n);
        for (let k = 1; k < n; k++) {
          const dx = r.xs[k] - r.xs[k - 1], dy = r.ys[k] - r.ys[k - 1];
          cum[k] = cum[k - 1] + Math.sqrt(dx * dx + dy * dy);
        }
        let duration = 0;
        for (let k = 1; k < n; k++) duration += (cum[k] - cum[k - 1]) / (r.speed[k - 1] || 1);
        v.route = { id: r.id, kind: r.kind, xs: Float64Array.from(r.xs), ys: Float64Array.from(r.ys), speed: Float64Array.from(r.speed), cum, total: cum[n - 1], duration };
        this.pending.push(v.route);
      } else {
        v.route = null;
      }
    });
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
    mix(this.chefMinutes);
    mix(this.business.requests.length);
    mix(this.business.orders.length);
    for (const q of this.queue) mix(q.id);
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
    // Feierabend: Fahrzeug steht, bis der Chef wieder arbeiten darf
    if (v.restUntil > this.time) return;
    const t = v.task;
    if (t?.kind === 'job' && (t.phase === 'to' || t.phase === 'setup' || t.phase === 'work') && this.chefMinutes >= CHEF_MAX_MINUTES) {
      v.restUntil = this.time + (1440 - (this.time % 1440));
      this.business.warn(this.time, `${v.name}: Feierabend – Höchstarbeitszeit des Chefs erreicht, weiter morgen um 06:00.`);
      return;
    }
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

  /** Von der aktuellen Position (auch mitten auf einer Route oder im Feld) zu einem Knoten fahren */
  private driveFromHere(v: Vehicle, target: number) {
    this.chargeDiesel(v, true);
    const [px, py] = this.position(v.id);
    const start = nearestNode(this.graph, px, py);
    const path = this.router.route(start, target, v.prof) ?? new Uint32Array(0);
    const r = path.length ? this.buildRoadRoute(start, path, v.prof) : null;
    const xs = [px, ...(r ? Array.from(r.xs) : [this.graph.x[start]])];
    const ys = [py, ...(r ? Array.from(r.ys) : [this.graph.y[start]])];
    const sp = [FIELD_DRIVE_KMH / 3.6, ...(r ? Array.from(r.speed) : [])];
    this.startRoute(v, this.makeRoute(xs, ys, sp, 'road'));
    v.node = target;
  }

  private playerArrive(v: Vehicle) {
    const t = v.task;
    const b = this.business;
    this.chargeDiesel(v, false);
    if (!t) { v.state = VehicleState.Waiting; return; }
    if (t.kind === 'visit') {
      if (t.phase === 'to') {
        t.phase = 'at';
        v.state = VehicleState.Waiting;
        v.waitMin = VISIT_MINUTES;
      } else {
        v.task = undefined;
        v.state = VehicleState.Waiting;
      }
      b.version++;
      return;
    }
    // Auftrag
    const o = b.orders.find((x) => x.id === t.orderId);
    if (t.phase === 'to') {
      // am Feld: Gerät ausklappen und einstellen
      t.phase = 'setup';
      v.state = VehicleState.Waiting;
      v.waitMin = RUEST_FELD_MIN;
      b.version++;
    } else if (t.phase === 'work') {
      const fi = t.queue[t.current];
      if (o) {
        b.fieldDone(o, fi, this.time);
        b.chargeDiesel(this.fields!.areaHa[fi] * t.dieselLHa, o, this.time);
      }
      this.addMachineHours(v, t);
      t.current++;
      if (t.current < t.queue.length) {
        t.phase = 'to';
        this.driveTo(v, this.fields!.access[t.queue[t.current]]);
      } else {
        t.phase = 'back';
        this.driveTo(v, this.homeNode);
      }
    } else if (t.phase === 'back') {
      t.phase = 'unhitch';
      v.state = VehicleState.Waiting;
      v.waitMin = RUEST_ABBAU_MIN;
      b.version++;
    }
  }

  private playerWaitDone(v: Vehicle) {
    const t = v.task;
    if (!t) return;
    if (t.kind === 'visit' && t.phase === 'at') {
      this.business.onVisit(t.farmId, this.time);
      t.phase = 'back';
      this.driveTo(v, this.homeNode);
    } else if (t.kind === 'job') {
      if (t.phase === 'prep') {
        t.phase = 'to';
        this.driveTo(v, this.fields!.access[t.queue[0]]);
      } else if (t.phase === 'setup') {
        const fi = t.queue[t.current];
        v.fieldNode = fi;
        this.startRoute(v, this.buildRealFieldRoute(v.node, fi, t.width, t.haPerHour, t.workKmh));
        t.phase = 'work';
      } else if (t.phase === 'unhitch') {
        v.task = undefined;
      }
      this.business.version++;
    }
  }

  /**
   * Diesel für die gerade beendete Straßenfahrt abrechnen (Feldarbeit wird je Feld nach l/ha
   * berechnet). partial: Fahrt wird abgebrochen, nur der gefahrene Teil zählt.
   */
  private chargeDiesel(v: Vehicle, partial: boolean) {
    const r = v.route;
    if (!r || r.kind !== 'road' || r.total <= 0 || v.chargedRoute === r.id) return;
    v.chargedRoute = r.id;
    const km = (partial ? v.dist : r.total) / 1000;
    const lPerKm = v.profile === 'car' ? DIESEL_CAR_L_KM : DIESEL_TRACTOR_ROAD_L_KM;
    const t = v.task;
    const o = t?.kind === 'job' ? this.business.orders.find((x) => x.id === t.orderId) : undefined;
    this.business.chargeDiesel(km * lPerKm, o, this.time);
    // Betriebsstunden auch für Straßenfahrten (Schlepper)
    if (v.profile === 'tractor') {
      const m = this.company.machines.find((x) => x.id === v.machineId);
      const hours = (partial ? v.dist / Math.max(1, r.total) : 1) * r.duration / 3600;
      if (m) m.hours = Math.round((m.hours + hours) * 10) / 10;
      if (o) o.tractorHours = Math.round((o.tractorHours + hours) * 100) / 100;
    }
  }

  /** Betriebsstunden für Schlepper und Gerät nach erledigtem Feld */
  private addMachineHours(v: Vehicle, t: Extract<PlayerTask, { kind: 'job' }>) {
    const fi = t.queue[t.current];
    const hours = this.fields!.areaHa[fi] / t.haPerHour;
    const o = this.business.orders.find((x) => x.id === t.orderId);
    if (o) o.tractorHours = Math.round((o.tractorHours + hours) * 100) / 100;
    for (const id of [v.machineId, o?.implementId]) {
      const m = this.company.machines.find((x) => x.id === id);
      if (m) m.hours = Math.round((m.hours + hours) * 10) / 10;
    }
  }

  private buildRoadRoute(from: number, path: Uint32Array, p: VehicleProfile): RouteGeom {
    const g = this.graph;
    const es = edgeSpeeds(g, p);
    const xs: number[] = [g.x[from]];
    const ys: number[] = [g.y[from]];
    const speeds: number[] = [];
    for (const de of path) {
      const before = xs.length;
      appendEdgePoints(g, de, xs, ys);
      const sp = es[de >>> 1];
      for (let i = before; i < xs.length; i++) speeds.push(sp);
    }
    const c = applyCurves(xs, ys, speeds, p);
    return this.makeRoute(c.xs, c.ys, c.speeds, 'road');
  }

  /**
   * Feldarbeit: Bahnen im echten Arbeitstempo des Geräts, Wenden langsam; die restliche Zeit
   * bis zur Flächenleistung (ha/h, enthält Wenden, Überlappung, Einstellen) wird als Halt am
   * Vorgewende eingefügt. Ist das Muster länger als die Zeit erlaubt, wird gleichmäßig schneller gefahren.
   */
  private buildRealFieldRoute(
    node: number,
    fi: number,
    width = TEST_WORK_WIDTH,
    haPerHour = TEST_HA_PER_HOUR,
    workKmh = TEST_WORK_KMH,
  ): RouteGeom {
    const g = this.graph;
    const f = this.fields!;
    const s0 = f.ptStart[fi], n = f.ptCount[fi];
    const pat = fieldPattern(f.px.subarray(s0, s0 + n), f.py.subarray(s0, s0 + n), width, 150);
    const work = workKmh / 3.6;
    const turn = FIELD_TURN_KMH / 3.6;
    const drive = FIELD_DRIVE_KMH / 3.6;
    const xs: number[] = [g.x[node]];
    const ys: number[] = [g.y[node]];
    const sp: number[] = [];
    const kinds: number[] = []; // 0 Anfahrt, 1 Bahn, 2 Wende
    for (let i = 0; i < pat.xs.length; i++) {
      xs.push(pat.xs[i]);
      ys.push(pat.ys[i]);
      if (i === 0) { sp.push(drive); kinds.push(0); }
      else if (i % 2 === 1) { sp.push(work); kinds.push(1); }
      else { sp.push(turn); kinds.push(2); }
    }
    xs.push(g.x[node]); ys.push(g.y[node]); sp.push(drive); kinds.push(0);
    const seg = (i: number) => {
      const dx = xs[i + 1] - xs[i], dy = ys[i + 1] - ys[i];
      return Math.sqrt(dx * dx + dy * dy);
    };
    let t0 = 0;
    for (let i = 0; i < sp.length; i++) t0 += seg(i) / sp[i];
    const target = (f.areaHa[fi] / haPerHour) * 3600;
    if (t0 >= target || pat.xs.length < 2) {
      // kleines Feld bzw. viele Wenden: gleichmäßig schneller (höchstens 3-fach)
      const k = Math.min(3, t0 / Math.max(1, target));
      return this.makeRoute(xs, ys, sp.map((v) => v * k), 'field');
    }
    // Halte an den Wenden (Vorgewende) einfügen, gleich lang
    const turns = kinds.filter((k) => k === 2).length;
    const stops = Math.max(1, turns);
    const pause = (target - t0) / stops;
    const ox: number[] = [xs[0]], oy: number[] = [ys[0]], os: number[] = [];
    for (let i = 0; i < sp.length; i++) {
      const stopHere = kinds[i] === 1 && (kinds[i + 1] === 2 || (turns === 0 && kinds[i + 1] !== 1));
      if (stopHere) {
        // Halt 1,5 m vor dem Bahnende (im Feld), als 1 cm langer, langsamer Abschnitt
        const L = seg(i);
        const back = Math.min(1.5, L / 2);
        const ux = (xs[i + 1] - xs[i]) / (L || 1), uy = (ys[i + 1] - ys[i]) / (L || 1);
        const px = xs[i + 1] - ux * back, py = ys[i + 1] - uy * back;
        ox.push(px); oy.push(py); os.push(sp[i]);
        ox.push(px + ux * 0.01); oy.push(py + uy * 0.01); os.push(0.01 / pause);
      }
      ox.push(xs[i + 1]); oy.push(ys[i + 1]); os.push(sp[i]);
    }
    return this.makeRoute(ox, oy, os, 'field');
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
    let duration = 0;
    for (let i = 1; i < n; i++) duration += (cum[i] - cum[i - 1]) / (speeds[i - 1] || 1);
    // Segmente der Länge 0 bekommen eine endliche Geschwindigkeit, Zeit = 0
    return {
      duration,
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

/**
 * Bremst vor und nach Richtungswechseln ab: Abschnitte werden in einer Zone vor/nach dem
 * Knick geteilt, dort gilt das Kurventempo des Profils. Nur Grundrechenarten und √.
 */
export function applyCurves(xs: number[], ys: number[], speeds: number[], p: VehicleProfile) {
  const n = xs.length;
  if (n < 3) return { xs, ys, speeds };
  // Kurventempo je Punkt (Start/Ziel: langsam anfahren bzw. ankommen)
  const cap = new Float64Array(n).fill(Infinity);
  cap[0] = cap[n - 1] = p.curve[1];
  for (let i = 1; i < n - 1; i++) {
    const ax = xs[i] - xs[i - 1], ay = ys[i] - ys[i - 1];
    const bx = xs[i + 1] - xs[i], by = ys[i + 1] - ys[i];
    const la = Math.sqrt(ax * ax + ay * ay), lb = Math.sqrt(bx * bx + by * by);
    if (la < 0.5 || lb < 0.5) continue;
    cap[i] = curveSpeed(p, (ax * bx + ay * by) / (la * lb));
  }
  const Z = p.curveZone;
  const ox: number[] = [xs[0]], oy: number[] = [ys[0]], os: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i], dy = ys[i + 1] - ys[i];
    const L = Math.sqrt(dx * dx + dy * dy);
    const v = speeds[i];
    const cs = cap[i], ce = cap[i + 1];
    if ((cs === Infinity && ce === Infinity) || L < 1e-6) {
      ox.push(xs[i + 1]); oy.push(ys[i + 1]); os.push(v);
      continue;
    }
    if (L <= 2 * Z + 1) {
      ox.push(xs[i + 1]); oy.push(ys[i + 1]); os.push(Math.min(v, cs, ce));
      continue;
    }
    const ux = dx / L, uy = dy / L;
    if (cs !== Infinity) {
      ox.push(xs[i] + ux * Z); oy.push(ys[i] + uy * Z); os.push(Math.min(v, cs));
    }
    if (ce !== Infinity) {
      ox.push(xs[i + 1] - ux * Z); oy.push(ys[i + 1] - uy * Z); os.push(v);
      ox.push(xs[i + 1]); oy.push(ys[i + 1]); os.push(Math.min(v, ce));
    } else {
      ox.push(xs[i + 1]); oy.push(ys[i + 1]); os.push(v);
    }
  }
  return { xs: ox, ys: oy, speeds: os };
}
