/**
 * Deterministische Simulation: fester Zeitschritt von 1 Spielminute.
 * Reiner Rechenkern ohne DOM, Zeitgeber oder Math.random – dieselbe Eingabe
 * (Graph, Seed, Anzahl Schritte) ergibt immer denselben Zustand, egal wie
 * schnell die Schritte ausgeführt werden (1x, 10x, 100x).
 * Nur +, -, *, / und sqrt (IEEE-genau) im Zustand, damit Plattformen übereinstimmen.
 */
import { Rng } from './rng';
import { PROFILES, Router, curveSpeed, edgeSpeeds, type ProfileKey, type VehicleProfile } from './astar';
import { BRANDS, CAR_COLORS, COMPANY_CAR } from '../data/brands';
import { fieldPattern, type FieldSet } from './fields';
import { Crop, generateFarms, type FarmSet } from './farms';
import { MACHINE_SKILL, MECHANIC_MIN, SELF_PROPELLED, START_OFFERS, normalizeDrivers, skillDiesel, skillSpeed, startCompany, type CarKind, type Company, type Machine } from './economy';
import { DEALERS } from '../data/catalog';
import { SITE_OFFERS } from '../data/sites';
import { DESTINATIONS } from '../data/destinations';
import { Business, HARVEST_TOWED, HAULER_TYPES, POTATO_YIELD_T_HA, DIESEL_TRUCK_L_KM, DRIVE_BREAK_AFTER_MIN, DRIVE_BREAK_MIN, TOLL_EUR_KM, TRUCK_LOAD_MIN, BEET_YIELD_T_HA, GRAIN_YIELD_T_HA, HAULER_TYPE, RAPE_YIELD_T_HA, isHarvest, HIRED_ROLLER_EUR_H, REMIND_CALL_MINUTES, SERVICE_IMPLEMENT, SILAGE_YIELD_T_HA, SERVICE_NAMES, SERVICE_SKILL, SERVICE_VERB, type Order, VISIT_MINUTES, WEAR_GRUBBER_EUR_HA, type Service, fmtDay, fmtHa, fmtTime, type Command, type QueueCommand, type QueueItem } from './business';
import { appendEdgePoints, nearestNode, project, RoadClass, unproject, type RoadGraph } from './roadgraph';
import { surchargeFactor } from './calendar';
import { Weather } from './weather';

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
  /** Fahrerwechsel: Gespann steht bis Spielminute */
  handoverUntil?: number;
  /** zuletzt für Diesel abgerechnete Route */
  chargedRoute: number;
}

export const SAVE_VERSION = 1;

export interface SaveState {
  version: number;
  time: number;
  chefMinutes: number;
  /** heutige Arbeitsminuten je Mitarbeiter */
  driverMinutes?: Record<number, number>;
  driverSurcharge?: Record<number, number>;
  lastWork?: Record<number, number>;
  nextRouteId: number;
  rng: [number, number, number, number];
  company: Company;
  business: ReturnType<Business['serialize']>;
  weather?: ReturnType<Weather['serialize']>;
  /** je Betrieb [bekannt 0/1, Zufriedenheit, bei der Konkurrenz bis, erledigte Aufträge] */
  farms: [number, number, number?, number?][];
  vehicles: {
    state: VehicleState; node: number; seg: number; segOff: number; dist: number; waitMin: number;
    next: 'field' | 'home' | 'leave-field'; fieldNode: number; trips: number; restUntil: number; chargedRoute: number;
    handoverUntil?: number;
    task: PlayerTask | null;
    route: { id: number; kind: RouteGeom['kind']; xs: number[]; ys: number[]; speed: number[] } | null;
  }[];
  /** Warteschlange des Chefs (ab Phase 3 je Mitarbeiter) */
  queue?: QueueItem[];
  nextQueueId?: number;
}

/** Balken im Planungsboard (abgeleitet, nicht Teil des Spielzustands) */
export interface PlanBar {
  key: string;
  driverId: number;
  kind: 'running' | 'visit' | 'queued' | 'absence';
  queueId?: number;
  /** laufende Aufgabe: Fahrzeug (für Fahrerwechsel) */
  vehicle?: number;
  orderId?: number;
  farmId?: number;
  label: string;
  start: number;
  end: number;
  tractorId?: number;
  implementId?: number;
  latest?: number;
  notBefore?: number;
  warnings: string[];
}

/** Grobe Zeitschätzung für die Planung (nicht Teil des Spielzustands) */
export interface JobEstimate {
  /** Arbeitszeit des Chefs inkl. Fahrten und Rüsten (min) */
  minutes: number;
  /** davon Feldarbeit (min) */
  workMinutes: number;
  /** voraussichtlich fertig (Spielminute), wenn er hinter allen geplanten Aufgaben drankommt */
  finishAt: number;
}

/** Schätzwerte: mittleres Straßentempo des Schleppers inkl. Orte und Kurven, Umweg gegenüber Luftlinie */
const EST_TRACTOR_M_MIN = 28000 / 60;
const EST_CAR_M_MIN = 60000 / 60;
const EST_DETOUR = 1.35;

export interface PlayerUnitInfo {
  machineId: number;
  vehicle: number;
  status: string;
  /** aktuelle Geschwindigkeit km/h */
  kmh: number;
  hours: number;
  busy: boolean;
  orderId?: number;
  /** Gespann am Hof (Fahrerwechsel ohne Firmenwagen möglich) */
  atHome: boolean;
}

/** Zustand des Häckslers in der Kette */
interface ChopState {
  yieldT: number;
  silo: number;
  /** angehängter Abfahrer: Fahrzeug (-1 = Wagen des Kunden), Ladung, Nutzlast */
  attached: { veh: number; load: number; cap: number } | null;
  /** Wagen des Kunden (nur Häcksler): frei ab Spielminute */
  virtual: number[];
  virtualCap: number;
  virtualCycle: number;
  /** am Silo noch nicht verteilte Menge (t) und Annahmeleistung (t/h) */
  siloBacklog: number;
  siloTph: number;
  /** Komplettkette ohne eigenen Radlader: Fremdwalze (Stunden) */
  hiredRoller: boolean;
  rollerMinutes: number;
  /** geerntete Menge im aktuellen Feld (ha) */
  fieldHa: number;
  /** Korntank bzw. Bunker der Hauptmaschine (t); Häcksler hat keinen */
  bunker?: { cap: number; load: number };
  /** Rübenroder: Bunker wird in die Feldrandmiete entleert (zählt als geerntet) */
  miete?: boolean;
  /** Abbunkern am Vorgewende bis Spielminute */
  pauseUntil?: number;
}

type PlayerTask =
  | { kind: 'visit'; driverId: number; farmId: number; phase: 'to' | 'at' | 'back' }
  | {
      /** Eigene Reparatur: Mechaniker fährt den Werkstattwagen (ggf. erst zum Händler, Teil holen) */
      kind: 'repair'; driverId: number; machineId: number; phase: 'fetch' | 'pickup' | 'to' | 'at' | 'back'; tries: number;
    }
  | {
      /** Fahrerwechsel: driverId fährt den Firmenwagen und bringt passengerId zum Gespann */
      kind: 'shuttle'; driverId: number; passengerId: number; vehicle: number; phase: 'to' | 'at' | 'back'; tries: number;
    }
  | {
      kind: 'job';
      driverId: number;
      implementId: number;
      /** Skillstufe des Fahrers bei Start (Bodenbearbeitung) */
      skill: number;
      orderId: number;
      queue: number[];
      current: number;
      phase: 'prep' | 'to' | 'setup' | 'work' | 'back' | 'unhitch' | 'toFill' | 'fill' | 'waitFeed' | 'feed';
      /** mehrere Maschinen auf einem Feld: Anteil der Arbeitsstrecke [von, bis] des aktuellen Feldes */
      share?: [number, number];
      /** Erntemaschine hört an dieser Routenposition auf (zweite Maschine übernimmt den Rest) */
      stopAt?: number;
      stopped?: boolean;
      width: number;
      haPerHour: number;
      workKmh: number;
      dieselLHa: number;
      /** Gülle: Fass (m³), Ladung, Gabe, Güllelager (Knoten), Anteil des aktuellen Feldes, Zubringer (Fahrzeug) */
      slurry?: { cap: number; load: number; gabe: number; source: number; progress: number; frac: number; feeder?: number };
      /** Häckseln: Ertrag, Silo, angehängter Abfahrer, Wagen des Kunden, Silo-Annahme */
      chop?: ChopState;
    }
  | {
      /** Abfahrer (Häckselkette): fährt neben dem Häcksler, bringt das Häckselgut zum Silo */
      kind: 'haul'; driverId: number; implementId: number; orderId: number; harvester: number; cap: number; load: number; silo: number;
      phase: 'prep' | 'toField' | 'wait' | 'load' | 'toSilo' | 'waitSilo' | 'unload' | 'back' | 'unhitch';
    }
  | {
      /** Lkw-Transport: pendelt zwischen Ladestelle und Ziel, bis die Menge abgefahren ist */
      kind: 'truck'; driverId: number; orderId: number; from: number; to: number; cap: number; load: number; implementId?: number;
      loadMin: number; unloadMin: number; driveMin: number;
      phase: 'toLoad' | 'load' | 'toUnload' | 'unload' | 'break' | 'back' | 'night';
    }
  | {
      /** Radlader fährt das Silo der Biogasanlage fest */
      kind: 'compact'; driverId: number; phase: 'to' | 'work' | 'back'; node: number; minutes: number;
    }
  | {
      /** Überführung zu einem anderen Standort (ggf. mit angehängtem Gerät) */
      kind: 'transfer'; driverId: number; siteId: number; implementId?: number;
    }
  | {
      /** Radlader am Silo: verteilt und walzt, bestimmt die Annahmeleistung */
      kind: 'silo'; driverId: number; orderId: number; harvester: number; phase: 'to' | 'work' | 'back';
    }
  | {
      /** Zubringer (Gülle-Kette): pendelt zwischen Güllelager und Feldrand, füllt das Fass um */
      kind: 'feeder'; driverId: number; implementId: number; orderId: number; spreader: number;
      cap: number; load: number; source: number;
      phase: 'prep' | 'toFill' | 'fill' | 'toField' | 'wait' | 'transfer' | 'back' | 'unhitch';
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
/** Gülle (Annahmen): Befüllen mit Saugrüssel bzw. Zapfstelle 3 m³/min, Umfüllen vom Zubringer 4 m³/min */
export const SLURRY_FILL_M3_MIN = 3;
export const SLURRY_TRANSFER_M3_MIN = 4;
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
  /** Wetter und Bodenfeuchte (Phase 4, Schritt 2) */
  readonly weather: Weather;
  readonly homeNode: number;
  /** heutige Arbeitsminuten des Chefs */
  get chefMinutes(): number {
    return this.driverMinutes[1] ?? 0;
  }
  /** Spielzeit in Minuten seit Start */
  time = 0;
  /** heutige Arbeitsminuten je Mitarbeiter (Reset um 06:00); Nr. 1 = Chef */
  driverMinutes: Record<number, number> = {};
  /** heutige Zuschlagsminuten je Mitarbeiter (Minute × Zuschlagsfaktor, ZU-01) */
  private driverSurcharge: Record<number, number> = {};
  /** letzte Arbeitsminute je Mitarbeiter (Ruhezeit 11 h, PA-04) */
  private lastWork: Record<number, number> = {};
  /** Zahl der Testfahrzeuge (davor), Spielerfahrzeuge folgen */
  private testCount = 0;
  /** steigt, wenn Fahrzeuge dazukommen (Oberfläche muss die Liste neu laden) */
  vehiclesVersion = 0;
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
      const brand = profile === 'car' ? COMPANY_CAR.name : BRANDS[i % 8].name;
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
    this.testCount = this.vehicles.length;
    for (const m of this.company.machines) this.addPlayerVehicle(m, false);
    this.business = new Business(opts.seed, this.company, this.farms, this.fields);
    this.weather = new Weather(opts.seed);
    this.business.nodeLonLat = (node) => unproject(this.graph, this.graph.x[node], this.graph.y[node]);
    this.business.rainOfDay = (day) => this.weather.day(day).rain;
    this.business.lonLatNode = (ll) => { const [x, y] = project(graph, ll[0], ll[1]); return nearestNode(graph, x, y); };
    this.ensureSites();
    // Abgestellt am Hof: Route aus einem Punkt, damit jedes Fahrzeug eine Position hat
    for (const v of this.vehicles) {
      v.route = this.makeRoute([graph.x[this.homeNode]], [graph.y[this.homeNode]], [], 'road');
      this.pending.push(v.route);
    }
  }

  get vehicleInfo(): VehicleInfo[] {
    return this.vehicles.map(({ id, name, brand, profile, owner, machineId }) => ({ id, name, brand, profile, owner, machineId }));
  }

  /** Gespann wartet auf dem Feld auf besseres Wetter (zählt nicht als Arbeitszeit) */
  private weatherHold(v: Vehicle): boolean {
    const t = v.task;
    return t?.kind === 'job' && (t.phase === 'setup' || t.phase === 'work') && this.weatherFor(t.orderId) !== null;
  }

  /** Aktive Feldmaschinen eines Auftrags */
  private orderUnits(orderId: number): Vehicle[] {
    return this.vehicles.filter((v) => v.owner === 'player' && v.task?.kind === 'job' && v.task.orderId === orderId && v.task.phase !== 'back' && v.task.phase !== 'unhitch');
  }

  /**
   * Weitere Maschine in einem laufenden Auftrag: übernimmt die Hälfte der noch nicht begonnenen
   * Felder der anderen, sonst die Hälfte des Feldes, an dem gerade gearbeitet wird (Erntemaschinen
   * auch mitten im Feld, andere nur vor Arbeitsbeginn). check = nur prüfen, nichts ändern.
   */
  private joinPlan(o: Order, check: boolean): { queue: number[]; share?: [number, number] } | null {
    const units = this.orderUnits(o.id);
    if (!units.length) return { queue: o.fields.filter((f) => !o.doneFields.includes(f)) };
    // 1. noch nicht begonnene Felder (hinter dem aktuellen Feld) aufteilen
    const pending: { v: Vehicle; idx: number }[] = [];
    for (const v of units) {
      const t = v.task as Extract<PlayerTask, { kind: 'job' }>;
      for (let i = t.current + 1; i < t.queue.length; i++) if (!o.doneFields.includes(t.queue[i])) pending.push({ v, idx: i });
    }
    if (pending.length) {
      const take = pending.slice(Math.floor(pending.length / 2));
      if (check) return { queue: take.map((p) => (p.v.task as Extract<PlayerTask, { kind: 'job' }>).queue[p.idx]) };
      const fields = take.map((p) => (p.v.task as Extract<PlayerTask, { kind: 'job' }>).queue[p.idx]);
      for (const v of units) {
        const t = v.task as Extract<PlayerTask, { kind: 'job' }>;
        t.queue = t.queue.filter((f, i) => i <= t.current || !fields.includes(f));
      }
      return { queue: fields.reverse() };
    }
    // 2. aktuelles Feld einer anderen Maschine teilen
    for (const v of units) {
      const t = v.task as Extract<PlayerTask, { kind: 'job' }>;
      if (t.current >= t.queue.length || t.stopAt !== undefined) continue;
      const fi = t.queue[t.current];
      const [a, b0] = t.share ?? [0, 1];
      if (t.phase === 'prep' || t.phase === 'to' || t.phase === 'setup') {
        if (b0 - a < 0.2) continue;
        const mid = a + (b0 - a) / 2;
        if (!check) t.share = [a, mid];
        return { queue: [fi], share: [mid, b0] };
      }
      if (t.phase === 'work' && t.chop && v.route?.kind === 'field') {
        const r = v.route;
        const n = r.xs.length;
        const w0 = r.cum[1], w1 = r.cum[n - 2];
        if (w1 - v.dist < 150) continue; // fast fertig
        const stop = v.dist + (w1 - Math.max(v.dist, w0)) / 2;
        const frac = a + (b0 - a) * ((stop - w0) / Math.max(1, w1 - w0));
        if (!check) { t.stopAt = stop; t.share = [a, frac]; }
        return { queue: [fi], share: [frac, b0] };
      }
    }
    return null;
  }

  /** nächstes Feld der Warteschlange, das noch nicht erledigt ist */
  private skipDone(t: Extract<PlayerTask, { kind: 'job' }>, o: Order | undefined) {
    while (o && t.current < t.queue.length && o.doneFields.includes(t.queue[t.current])) t.current++;
  }

  /** Wettersperre für einen Auftrag: Mähdrusch braucht trockenes Korn, sonst zählt der Boden */
  private weatherFor(orderId: number): string | null {
    const o = this.business.orders.find((x) => x.id === orderId);
    if (o?.service === 'transport') return null;
    return o?.service === 'drusch' ? this.weather.threshBlocked(this.time) : this.weather.fieldBlocked(this.time);
  }

  /** Fahrbare Maschine des Spielers als Fahrzeug auf die Karte bringen (Schlepper, Firmenwagen) */
  private addPlayerVehicle(m: Machine, park = true): void {
    if (!SELF_PROPELLED.includes(m.type) && m.type !== 'firmenwagen') return;
    if (this.vehicles.some((v) => v.owner === 'player' && v.machineId === m.id)) return;
    const profile: ProfileKey = m.type === 'firmenwagen' ? 'car' : m.type === 'lkw' ? 'truck' : 'tractor';
    const startNode = (this.company.sites ?? []).find((x) => x.id === (m.siteId ?? 1))?.node ?? this.homeNode;
    this.vehicles.push({
      id: this.vehicles.length,
      name: [m.brand, m.model].filter(Boolean).join(' '),
      brand: profile === 'car' ? (CAR_COLORS[m.carKind ?? 'kombi'] ?? COMPANY_CAR).name : m.brand,
      profile,
      prof: PROFILES[profile],
      state: VehicleState.Waiting,
      node: startNode,
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
    this.vehiclesVersion++;
    if (!park) return; // im Konstruktor bekommen alle Fahrzeuge gemeinsam ihre Parkposition
    // Parkposition am Hof (Ein-Punkt-Route), damit das Fahrzeug sofort sichtbar ist
    const v = this.vehicles[this.vehicles.length - 1];
    v.route = this.makeRoute([this.graph.x[startNode]], [this.graph.y[startNode]], [], 'road');
    this.pending.push(v.route);
  }

  /** Maschine gerade bei einer Aufgabe (Schlepper/Wagen mit Aufgabe oder Gerät im Auftrag) */
  private machineBusy(machineId: number): boolean {
    return this.vehicles.some((v) => v.owner === 'player' && !!v.task && (v.machineId === machineId || ((v.task.kind === 'job' || v.task.kind === 'feeder' || v.task.kind === 'haul' || v.task.kind === 'truck') && v.task.implementId === machineId)));
  }

  busyMachineIds(): number[] {
    return this.company.machines.filter((m) => this.machineBusy(m.id)).map((m) => m.id);
  }

  /** Spielerfahrzeuge an den Fuhrpark anpassen: neue dazu, verkaufte weg (IDs = Index neu) */
  private syncPlayerVehicles() {
    const ids = new Set(this.company.machines.map((m) => m.id));
    const before = this.vehicles.length;
    this.vehicles = this.vehicles.filter((v) => v.owner !== 'player' || ids.has(v.machineId!));
    if (this.vehicles.length !== before) {
      this.vehicles.forEach((v, i) => (v.id = i));
      this.vehiclesVersion++;
    }
    for (const m of this.company.machines) this.addPlayerVehicle(m);
  }

  /** Stammhof als Standort Nr. 1 anlegen (auch für ältere Spielstände) */
  private ensureSites() {
    if (this.company.sites?.length) return;
    this.company.sites = [{ id: 1, name: 'Stammhof Groß Thondorf', kind: 'hof', node: this.homeNode, lonLat: this.homeLonLat, buildings: {} }];
  }

  /** Standort-Knoten des Fahrzeugs (Stammhof oder zugeordneter Standort, ST-07) */
  homeOf(v: Vehicle): number {
    const m = this.company.machines.find((x) => x.id === v.machineId);
    const st = (this.company.sites ?? []).find((x) => x.id === (m?.siteId ?? 1));
    return st?.node ?? this.homeNode;
  }

  /** Hof als [lon, lat] (Entfernung zu Händlern) */
  get homeLonLat(): [number, number] {
    return unproject(this.graph, this.graph.x[this.homeNode], this.graph.y[this.homeNode]);
  }

  /** Disponent (Vorschlag 10): offene Routineaufträge mit freien Fahrern und Gespannen starten */
  private dispatchTick() {
    const b = this.business;
    if (!b.company.dispatcher?.autoStart) return;
    for (const o of b.orders) {
      if (o.status !== 'offen' || !b.isRoutine(o.service)) continue;
      if (this.queue.some((q) => q.cmd.kind === 'startJob' && q.cmd.orderId === o.id)) continue;
      if (this.weatherFor(o.id)) return;
      const implType = SERVICE_IMPLEMENT[o.service];
      for (const d of this.company.drivers) {
        if ((d.skills[SERVICE_SKILL[o.service]] ?? 0) < 1 || (d.skills.boden ?? 0) < 1) continue;
        if (this.driverBusy(d.id) || this.driverBlocked(d.id) || this.queue.some((q) => q.driverId === d.id)) continue;
        let started = false;
        for (const impl of this.company.machines) {
          if (impl.type !== implType || this.machineBusy(impl.id) || (impl.downUntil ?? 0) > this.time) continue;
          const tractor = this.company.machines.find((m) => m.type === 'schlepper' && !this.machineBusy(m.id) && (m.downUntil ?? 0) <= this.time && (m.power ?? 0) >= (impl.powerNeed ?? 0));
          if (!tractor) continue;
          const cmd = { kind: 'startJob' as const, orderId: o.id, tractorId: tractor.id, implementId: impl.id, driverId: d.id };
          if (this.checkQueueCommand(cmd)) continue;
          const r = this.startNow(cmd);
          if (r.startsWith('Auftrag gestartet')) { b.info(this.time, `Disponent: ${SERVICE_NAMES[o.service]} ${b.farmName(o.farmId)} gestartet (${this.driverName(d.id)}).`); started = true; }
          break;
        }
        if (started) break;
      }
    }
  }

  /** Ein Schritt = 1 Spielminute. */
  step(): void {
    this.time++;
    if (this.time % 60 === 0 && this.time % 1440 < 8 * 60) this.dispatchTick();
    if (this.time % 1440 === 0) {
      const busyDrivers = new Set<number>();
      for (const v of this.vehicles) if (v.owner === 'player' && v.task) busyDrivers.add(v.task.driverId);
      this.business.daily(this.time, this.driverMinutes, this.driverSurcharge, busyDrivers); // täglich 06:00
      this.driverMinutes = {};
      this.driverSurcharge = {};
      // Ausgeschiedene Mitarbeiter: ihre Planung entfällt
      const ids = new Set(this.company.drivers.map((d) => d.id));
      const before = this.queue.length;
      this.queue = this.queue.filter((q) => ids.has(q.driverId));
      if (this.queue.length !== before) this.business.warn(this.time, 'Geplante Aufgaben ausgeschiedener Mitarbeiter wurden gestrichen.');
      const inUse = new Set(this.company.machines.filter((m) => this.machineBusy(m.id)).map((m) => m.id));
      this.business.completeSales(this.time, inUse);
      this.business.endLeases(this.time, inUse);
      this.syncPlayerVehicles(); // Lieferungen und Verkäufe
    }
    // Arbeitszeit je Fahrer: zählt, solange er unterwegs ist (nicht im Feierabend)
    for (const v of this.vehicles) {
      if (v.owner === 'player' && v.task && v.restUntil <= this.time && !this.business.absence(v.task.driverId, this.time) && !this.weatherHold(v)) {
        const d = v.task.driverId;
        this.driverMinutes[d] = (this.driverMinutes[d] ?? 0) + 1;
        const f = surchargeFactor(this.time);
        if (f) this.driverSurcharge[d] = (this.driverSurcharge[d] ?? 0) + f;
        this.lastWork[d] = this.time;
        const tk = v.task;
        if (tk.kind === 'shuttle' && tk.phase !== 'back') {
          const p = tk.passengerId;
          this.driverMinutes[p] = (this.driverMinutes[p] ?? 0) + 1;
          this.lastWork[p] = this.time;
        }
      }
    }
    for (const v of this.vehicles) {
      if (v.owner === 'player') this.stepPlayer(v);
      else this.stepVehicle(v);
    }
    if (this.queue.length) this.runQueue();
    this.checkRepairs();
  }

  private minutesOf(driverId: number): number {
    return this.driverMinutes[driverId] ?? 0;
  }

  private driverName(driverId: number): string {
    const d = this.company.drivers.find((x) => x.id === driverId);
    return d ? (d.isPlayer ? 'Chef' : d.name) : `Fahrer ${driverId}`;
  }

  /**
   * Darf der Fahrer jetzt eine neue Aufgabe beginnen? Nicht bei Urlaub/Krankheit, nicht über
   * 10 h, nicht vor Ablauf der Ruhezeit von 11 h nach dem letzten Arbeitstag (PA-04).
   */
  private driverBlocked(d: number): string | null {
    const e = this.company.drivers.find((x) => x.id === d);
    if (e?.kind === 'leih' && this.time < (e.availableFrom ?? 0)) return `kommt ab ${fmtDay(e.availableFrom!)}`;
    if (e?.kind === 'leih' && this.time >= (e.contractUntil ?? Infinity)) return 'Einsatz beendet';
    const abs = this.business.absence(d, this.time);
    if (abs) return abs === 'urlaub' ? 'hat Urlaub' : abs === 'schulung' ? 'ist auf Lehrgang' : 'ist krank';
    if (this.minutesOf(d) >= CHEF_MAX_MINUTES) return 'Arbeitszeit für heute erreicht';
    const last = this.lastWork[d];
    if (last !== undefined && Math.floor(last / 1440) < Math.floor(this.time / 1440) && this.time - last < 11 * 60) return 'Ruhezeit (11 h)';
    return null;
  }

  /** Aufgabe, die ein Fahrer gerade hat (null = frei, im Büro bzw. am Hof) */
  driverBusy(driverId: number): string | null {
    for (const v of this.vehicles) {
      if (v.owner === 'player' && v.task?.driverId === driverId && this.business.absence(driverId, this.time)) {
        return `${this.driverName(driverId)} ist krank – Gespann wartet`;
      }
      if (v.owner !== 'player' || !v.task || v.task.driverId !== driverId) continue;
      const who = this.driverName(driverId);
      if (v.task.kind === 'shuttle') return `${who} fährt ${this.driverName(v.task.passengerId)} zum Fahrerwechsel`;
      if (v.task.kind === 'repair') return `${who} repariert mit dem Werkstattwagen`;
      if (v.task.kind === 'feeder') return `${who} fährt Zubringer`;
      if (v.task.kind === 'haul') return `${who} fährt Abfahrer`;
      if (v.task.kind === 'transfer') return `${who} überführt eine Maschine`;
      if (v.task.kind === 'truck') return `${who} fährt Lkw`;
      if (v.task.kind === 'compact') return `${who} fährt das Silo fest`;
      if (v.task.kind === 'silo') return `${who} walzt am Silo`;
      return v.task.kind === 'visit' ? `${who} ist auf Besuch bei ${this.business.farmName(v.task.farmId)}` : `${who} fährt einen Auftrag`;
    }
    for (const v of this.vehicles) {
      if (v.task?.kind === 'shuttle' && v.task.passengerId === driverId && v.task.phase !== 'back') return `${this.driverName(driverId)} wird zum Fahrerwechsel gebracht`;
    }
    return null;
  }

  /** irgendein eigenes Fahrzeug unterwegs */
  get anyPlayerBusy(): boolean {
    return this.vehicles.some((v) => v.owner === 'player' && !!v.task);
  }

  /** Der Chef ist unterwegs (Besuch oder selbst gefahrener Auftrag) */
  get chefBusy(): string | null {
    return this.driverBusy(1);
  }

  /** Schlepper oder Gerät gerade bei einem anderen Fahrer im Einsatz? */
  private machineInUse(cmd: QueueCommand): string | null {
    if (cmd.kind === 'visit') return this.freeCar(1) ? null : 'Firmenwagen sind unterwegs';
    const ids = [
      cmd.tractorId, cmd.implementId, ...(cmd.feeder ? [cmd.feeder.tractorId, cmd.feeder.implementId] : []),
      ...(cmd.haulers ?? []).flatMap((h) => [h.tractorId, h.implementId]), ...(cmd.roller ? [cmd.roller.machineId] : []),
    ];
    for (const id of ids) {
      const m = this.company.machines.find((x) => x.id === id);
      if (m && (m.downUntil ?? 0) > this.time) return `${m.brand} ${m.model}: ${m.downReason ?? 'in der Werkstatt'}`;
    }
    for (const h of cmd.haulers ?? []) {
      if (this.machineBusy(h.tractorId) || this.machineBusy(h.implementId)) return 'Abfahrer: Schlepper oder Wagen im Einsatz';
      if (this.driverBusy(h.driverId) || this.driverBlocked(h.driverId)) return `${this.driverName(h.driverId)} (Abfahrer) ist nicht frei`;
    }
    if (cmd.roller) {
      if (this.machineBusy(cmd.roller.machineId)) return 'Radlader ist im Einsatz';
      if (this.driverBusy(cmd.roller.driverId) || this.driverBlocked(cmd.roller.driverId)) return `${this.driverName(cmd.roller.driverId)} (Radlader) ist nicht frei`;
    }
    if (cmd.feeder) {
      for (const v of this.vehicles) {
        if (v.owner !== 'player' || !v.task) continue;
        if (v.machineId === cmd.feeder.tractorId) return 'Schlepper des Zubringers ist im Einsatz';
        if ((v.task.kind === 'job' || v.task.kind === 'feeder') && v.task.implementId === cmd.feeder.implementId) return 'Zubringerfass ist im Einsatz';
      }
      if (this.driverBusy(cmd.feeder.driverId) || this.driverBlocked(cmd.feeder.driverId)) return `${this.driverName(cmd.feeder.driverId)} (Zubringer) ist nicht frei`;
    }
    for (const v of this.vehicles) {
      if (v.owner !== 'player' || !v.task) continue;
      if (v.machineId === cmd.tractorId) return 'Schlepper ist im Einsatz';
      if ((v.task.kind === 'job' || v.task.kind === 'feeder') && v.task.implementId === cmd.implementId) return 'Gerät ist im Einsatz';
    }
    return null;
  }

  private cmdDriver(cmd: QueueCommand): number {
    return cmd.kind === 'visit' ? 1 : cmd.driverId ?? 1;
  }

  /**
   * Nächste geplante Aufgabe je Fahrer starten, sobald er frei ist (tagsüber, mit Arbeitszeit
   * übrig). Ist die Maschine noch bei jemand anderem, wartet der Eintrag.
   */
  private runQueue() {
    if (this.time % 1440 >= QUEUE_LAST_START) return;
    const tried = new Set<number>();
    for (let k = 0; k < this.queue.length; k++) {
      const item = this.queue[k];
      const d = item.driverId;
      if (tried.has(d)) continue;
      tried.add(d);
      if (this.driverBusy(d) || this.driverBlocked(d)) continue;
      if ((item.notBefore ?? 0) > this.time) continue; // geplanter Starttermin noch nicht erreicht
      if (item.cmd.kind === 'startJob' && this.weatherFor(item.cmd.orderId)) continue; // Wetter
      const err = this.checkQueueCommand(item.cmd, item.id);
      if (!err && this.machineInUse(item.cmd)) continue; // wartet auf die Maschine
      this.queue.splice(k, 1);
      k--;
      tried.delete(d); // nach einem Fehlschlag gleich den nächsten Eintrag des Fahrers versuchen
      this.business.version++;
      const msg = err ?? this.startNow(item.cmd);
      if (this.driverBusy(d)) { this.business.info(this.time, `Plan ${this.driverName(d)}: ${item.label} – ${msg}`); tried.add(d); }
      else this.business.warn(this.time, `Geplant, aber nicht möglich: ${item.label} – ${msg}`);
    }
  }

  // ---------- Zeitschätzung für die Planung ----------

  private nodeDist(a: number, b: number): number {
    const dx = this.graph.x[a] - this.graph.x[b], dy = this.graph.y[a] - this.graph.y[b];
    return Math.sqrt(dx * dx + dy * dy) * EST_DETOUR;
  }

  /** Flächenleistung: bestes eigenes Gerät für die Dienstleistung, sonst das erste im Markt */
  private estimateHaPerHour(service: Service = 'grubbern'): number {
    const type = SERVICE_IMPLEMENT[service];
    let best = 0;
    for (const m of this.company.machines) if (m.type === type) best = Math.max(best, m.haPerHour ?? 0);
    if (best) return best;
    return START_OFFERS.find((o) => o.machine.type === type)?.machine.haPerHour ?? 1.5;
  }

  /** Dauer eines Grubberauftrags: Rüsten, Fahrten (nächstes Feld zuerst), Feldarbeit */
  estimateJobMinutes(fields: number[], haPerHour = this.estimateHaPerHour()): { minutes: number; workMinutes: number } {
    if (!this.fields || !fields.length) return { minutes: 0, workMinutes: 0 };
    let at = this.homeNode;
    let drive = 0, work = 0;
    const rest = fields.slice();
    while (rest.length) {
      let bi = 0, bd = Infinity;
      rest.forEach((f, i) => { const d = this.nodeDist(at, this.fields!.access[f]); if (d < bd) { bd = d; bi = i; } });
      const f = rest.splice(bi, 1)[0];
      drive += bd;
      at = this.fields.access[f];
      work += (this.fields.areaHa[f] / haPerHour) * 60;
    }
    drive += this.nodeDist(at, this.homeNode);
    const minutes = RUEST_HOF_MIN + RUEST_ABBAU_MIN + fields.length * RUEST_FELD_MIN + drive / EST_TRACTOR_M_MIN + work;
    return { minutes: Math.round(minutes), workMinutes: Math.round(work) };
  }

  /**
   * Gülle: Umläufe (Füllen, Fahrt Lager–Feld hin und zurück, Ausbringen) bzw. mit Zubringer der
   * Engpass aus Ausbringen + Umfüllen und Zubringerumlauf.
   */
  estimateSlurryMinutes(fields: number[], gabe: number, source: number, haPerHour: number, cap = 15, feederCap?: number): number {
    if (!this.fields || !fields.length) return 0;
    let area = 0, dist = 0;
    for (const f of fields) { area += this.fields.areaHa[f]; dist += this.nodeDist(source, this.fields.access[f]); }
    dist /= fields.length;
    const m3 = area * gabe;
    const road = (2 * dist) / EST_TRACTOR_M_MIN;
    const spread = (cap / gabe / haPerHour) * 60;
    const loads = Math.ceil(m3 / cap);
    let cycle: number;
    if (feederCap) {
      const feederCycle = (feederCap / SLURRY_FILL_M3_MIN + road + feederCap / SLURRY_TRANSFER_M3_MIN + 4) * (cap / feederCap);
      cycle = Math.max(spread + cap / SLURRY_TRANSFER_M3_MIN + 2, feederCycle);
    } else cycle = cap / SLURRY_FILL_M3_MIN + road + spread + 2;
    const toFirst = this.nodeDist(this.homeNode, source) / EST_TRACTOR_M_MIN + this.nodeDist(this.homeNode, this.fields.access[fields[0]]) / EST_TRACTOR_M_MIN;
    return Math.round(RUEST_HOF_MIN + RUEST_ABBAU_MIN + fields.length * RUEST_FELD_MIN + toFirst + loads * cycle);
  }

  /** Dauer eines Auftrags (bzw. einer Anfrage) mit dem besten verfügbaren Gerät */
  private estimateFor(fields: number[], _service: Service, haPerHour: number, gabe?: number, farmId?: number): { minutes: number; workMinutes: number } {
    const base = this.estimateJobMinutes(fields, haPerHour);
    if (!gabe) return base;
    const source = this.farms?.farms[farmId ?? -1]?.homeNode ?? this.homeNode;
    let cap = 0;
    for (const m of this.company.machines) if (m.type === 'guellefass') cap = Math.max(cap, m.tankM3 ?? 0);
    return { minutes: this.estimateSlurryMinutes(fields, gabe, source, haPerHour, cap || 14), workMinutes: base.workMinutes };
  }

  private estimateQueueItem(cmd: QueueCommand): number {
    if (cmd.kind === 'visit') {
      const farm = this.farms?.farms[cmd.farmId];
      return farm ? Math.round((2 * this.nodeDist(this.homeNode, farm.homeNode)) / EST_CAR_M_MIN + VISIT_MINUTES) : VISIT_MINUTES;
    }
    const o = this.business.orders.find((x) => x.id === cmd.orderId);
    return o ? this.estimateFor(o.fields.filter((f) => !o.doneFields.includes(f)), o.service, this.estimateHaPerHour(o.service), o.gabe, o.farmId).minutes : 0;
  }

  /** Ende, wenn ab jetzt `need` Minuten Chef-Arbeitszeit anfallen (10 h je Tag, Start 06:00) */
  private finishAfter(need: number, driverId = 1, from = this.time, field = true): number {
    let t = Math.max(from, this.time);
    const today0 = Math.floor(this.time / 1440);
    // Tage mit gesperrter Feldarbeit überspringen, soweit die Vorhersage reicht (5 Tage)
    const skip = (day: number) => field && day - today0 <= 5 && this.weather.dayBlocked(day);
    for (let k = 0; k < 10 && skip(Math.floor(t / 1440)); k++) t = (Math.floor(t / 1440) + 1) * 1440;
    const today = Math.floor(this.time / 1440) === Math.floor(t / 1440);
    let left = Math.max(0, CHEF_MAX_MINUTES - (today ? this.minutesOf(driverId) : 0));
    // nach 20:00 beginnt nichts Neues mehr
    if (t % 1440 >= QUEUE_LAST_START) left = 0;
    while (need > left) {
      need -= left;
      t = (Math.floor(t / 1440) + 1) * 1440;
      for (let k = 0; k < 10 && skip(Math.floor(t / 1440)); k++) t += 1440;
      left = CHEF_MAX_MINUTES;
    }
    return t + need;
  }

  /**
   * Schätzungen für offene Anfragen und Aufträge (Schlüssel = Anfrage- bzw. Auftrags-ID).
   * Fertigtermin: hinter laufender Arbeit und der Warteschlange des Fahrers; für Anfragen und
   * ungeplante Aufträge beim Fahrer, der am frühesten frei ist.
   */
  planEstimates(): Record<number, JobEstimate> {
    const out: Record<number, JobEstimate> = {};
    if (!this.fields) return out;
    const backlog: Record<number, number> = {};
    for (const d of this.company.drivers) backlog[d.id] = 0;
    const running: Record<number, number> = {};
    for (const v of this.vehicles) {
      const t = v.task;
      if (v.owner !== 'player' || !t) continue;
      let m = 30;
      if (t.kind === 'job') {
        const left = t.queue.slice(t.current + (t.phase === 'work' ? 1 : 0));
        m = this.estimateJobMinutes(left, t.haPerHour).minutes + (t.phase === 'work' ? 30 : 0);
        running[t.orderId] = t.driverId;
      }
      backlog[t.driverId] = (backlog[t.driverId] ?? 0) + m;
    }
    const runBacklog = { ...backlog };
    for (const q of this.queue) {
      backlog[q.driverId] = (backlog[q.driverId] ?? 0) + this.estimateQueueItem(q.cmd);
      if (q.cmd.kind === 'startJob') {
        const o = this.business.orders.find((x) => x.id === (q.cmd as { orderId: number }).orderId);
        if (o) {
          const e = this.estimateFor(o.fields.filter((f) => !o.doneFields.includes(f)), o.service, this.driverHaPerHour(q.driverId, o.service), o.gabe, o.farmId);
          out[o.id] = { ...e, finishAt: this.finishAfter(backlog[q.driverId], q.driverId) };
        }
      }
    }
    // frühester freier Fahrer (der Chef zählt mit)
    let best = 1;
    for (const d of this.company.drivers) if ((backlog[d.id] ?? 0) < (backlog[best] ?? 0)) best = d.id;
    for (const o of this.business.orders) {
      if (o.status === 'fertig' || out[o.id]) continue;
      const left = o.fields.filter((f) => !o.doneFields.includes(f));
      const e = this.estimateFor(left, o.service, this.driverHaPerHour(best, o.service), o.gabe, o.farmId);
      const d = running[o.id];
      out[o.id] = { ...e, finishAt: d !== undefined ? this.finishAfter(runBacklog[d], d) : this.finishAfter((backlog[best] ?? 0) + e.minutes, best) };
    }
    for (const r of this.business.requests) {
      if (r.status !== 'offen') continue;
      const e = this.estimateFor(r.fields, r.service, this.driverHaPerHour(best, r.service), r.gabe, r.farmId);
      out[r.id] = { ...e, finishAt: this.finishAfter((backlog[best] ?? 0) + e.minutes, best) };
    }
    return out;
  }

  private driverHaPerHour(driverId: number, service: Service = 'grubbern'): number {
    const d = this.company.drivers.find((x) => x.id === driverId);
    return this.estimateHaPerHour(service) * skillSpeed(d?.skills.boden ?? 3);
  }

  /** Frühester tatsächlicher Start ab `t`: nach 20:00 erst am nächsten Morgen */
  private workStart(t: number): number {
    return t % 1440 >= QUEUE_LAST_START ? (Math.floor(t / 1440) + 1) * 1440 : t;
  }

  /**
   * Planungsboard: Balken je Fahrer (laufende Aufgabe, dann die Warteschlange) mit geschätztem
   * Start und Ende sowie Warnungen (Termin, Maschine doppelt belegt oder in der Werkstatt, Leistung).
   */
  planBoard(): PlanBar[] {
    const bars: PlanBar[] = [];
    const cursor: Record<number, number> = {};
    for (const d of this.company.drivers) cursor[d.id] = this.time;
    const b = this.business;
    for (const v of this.vehicles) {
      const t = v.task;
      if (v.owner !== 'player' || !t) continue;
      if (t.kind === 'job') {
        const o = b.orders.find((x) => x.id === t.orderId);
        const left = t.queue.slice(t.current + (t.phase === 'work' ? 1 : 0));
        const m = this.estimateJobMinutes(left, t.haPerHour).minutes + (t.phase === 'work' ? 30 : 0);
        const end = this.finishAfter(m, t.driverId);
        const warnings: string[] = [];
        const down = [v.machineId, t.implementId].map((id) => this.company.machines.find((x) => x.id === id)).find((x) => (x?.downUntil ?? 0) > this.time);
        if (down) warnings.push(`${down.brand} ${down.model}: ${down.downReason}`);
        if (o && end > o.latest) warnings.push(`Termin ${fmtDay(o.latest)} wird überschritten`);
        const ab = this.business.absence(t.driverId, this.time);
        if (ab) warnings.push(`${this.driverName(t.driverId)} ist ${ab === 'krank' ? 'krank' : ab === 'schulung' ? 'auf Lehrgang' : 'im Urlaub'} – Fahrer wechseln`);
        bars.push({ key: `r${v.id}`, driverId: t.driverId, kind: 'running', vehicle: v.id, orderId: t.orderId, farmId: o?.farmId, label: o ? `${SERVICE_NAMES[o.service]} ${b.farmName(o.farmId)}` : 'Auftrag', start: o?.startedAt ?? this.time, end, tractorId: v.machineId, implementId: t.implementId, latest: o?.latest, warnings });
        cursor[t.driverId] = Math.max(cursor[t.driverId] ?? this.time, end);
      } else {
        const end = this.time + 30;
        if (t.kind === 'transfer') {
          bars.push({ key: `r${v.id}`, driverId: t.driverId, kind: 'visit', label: 'Überführung', start: this.time, end: this.time + 60, warnings: [] });
          continue;
        }
        if (t.kind === 'compact') {
          bars.push({ key: `r${v.id}`, driverId: t.driverId, kind: 'visit', label: 'Silo festfahren', start: this.time, end: this.time + t.minutes, warnings: [] });
          continue;
        }
        if (t.kind === 'truck') {
          const o = b.orders.find((x) => x.id === t.orderId);
          bars.push({ key: `r${v.id}`, driverId: t.driverId, kind: 'running', vehicle: v.id, orderId: t.orderId, farmId: o?.farmId, label: `Lkw ${o ? b.farmName(o.farmId) : ''}`, start: o?.startedAt ?? this.time, end: Math.max(this.time + 60, o?.latest ?? this.time), tractorId: v.machineId, latest: o?.latest, warnings: [] });
          continue;
        }
        if (t.kind === 'haul' || t.kind === 'silo') {
          const o = b.orders.find((x) => x.id === t.orderId);
          bars.push({ key: `r${v.id}`, driverId: t.driverId, kind: 'running', vehicle: v.id, orderId: t.orderId, farmId: o?.farmId, label: `${t.kind === 'haul' ? 'Abfahrer' : 'Radlader'} ${o ? b.farmName(o.farmId) : ''}`, start: o?.startedAt ?? this.time, end: this.time + 240, tractorId: v.machineId, warnings: [] });
          continue;
        }
        if (t.kind === 'feeder') {
          const sb = bars.find((x) => x.vehicle === t.spreader);
          const o = b.orders.find((x) => x.id === t.orderId);
          bars.push({ key: `r${v.id}`, driverId: t.driverId, kind: 'running', vehicle: v.id, orderId: t.orderId, farmId: o?.farmId, label: `Zubringer ${o ? b.farmName(o.farmId) : ''}`, start: o?.startedAt ?? this.time, end: sb?.end ?? this.time + 120, tractorId: v.machineId, implementId: t.implementId, warnings: [] });
          cursor[t.driverId] = Math.max(cursor[t.driverId] ?? this.time, sb?.end ?? this.time);
          continue;
        } else if (t.kind === 'repair') {
          bars.push({ key: `r${v.id}`, driverId: t.driverId, kind: 'visit', label: 'Reparatur mit Werkstattwagen', start: this.time, end: this.time + 120, warnings: [] });
        } else if (t.kind === 'shuttle') {
          const lbl = `Fahrerwechsel: bringt ${this.driverName(t.passengerId)}`;
          bars.push({ key: `r${v.id}`, driverId: t.driverId, kind: 'visit', label: lbl, start: this.time, end, warnings: [] });
          bars.push({ key: `p${v.id}`, driverId: t.passengerId, kind: 'visit', label: 'Fahrt zum Fahrerwechsel', start: this.time, end, warnings: [] });
          cursor[t.passengerId] = Math.max(cursor[t.passengerId] ?? this.time, end);
        } else {
          bars.push({ key: `r${v.id}`, driverId: t.driverId, kind: 'visit', farmId: t.farmId, label: `Besuch ${b.farmName(t.farmId)}`, start: this.time, end, warnings: [] });
        }
        cursor[t.driverId] = Math.max(cursor[t.driverId] ?? this.time, end);
      }
    }
    // Urlaub und Krankheit als gesperrte Zeiten
    for (const e of this.company.drivers) {
      for (const a of e.absences ?? []) {
        if (a.to <= this.time) continue;
        bars.push({ key: `a${e.id}-${a.from}`, driverId: e.id, kind: 'absence', label: a.kind === 'urlaub' ? 'Urlaub' : 'krank', start: Math.max(a.from, this.time), end: a.to, warnings: [] });
      }
    }
    const available = (d: number, t: number) => {
      const e = this.company.drivers.find((x) => x.id === d);
      if (e?.kind === 'leih') t = Math.max(t, e.availableFrom ?? 0);
      for (let k = 0; k < 4; k++) {
        const a = (e?.absences ?? []).find((x) => t >= x.from && t < x.to);
        if (!a) break;
        t = a.to;
      }
      return t;
    };
    for (const q of this.queue) {
      const d = q.driverId;
      const start = this.workStart(available(d, this.workStart(Math.max(cursor[d] ?? this.time, q.notBefore ?? 0))));
      const need = this.estimateQueueItem(q.cmd);
      const end = this.finishAfter(need, d, start, q.cmd.kind === 'startJob');
      cursor[d] = end;
      const warnings: string[] = [];
      const err = this.checkQueueCommand(q.cmd, q.id);
      if (err) warnings.push(err);
      const dr = this.company.drivers.find((x) => x.id === d);
      if ((dr?.absences ?? []).some((a) => a.from < end && start < a.to)) warnings.push(`${this.driverName(d)} ist in der Zeit abwesend`);
      if (dr?.leavesAt !== undefined && end > dr.leavesAt) warnings.push(`${this.driverName(d)} hat dann den Betrieb verlassen`);
      if (dr?.kind === 'leih' && end > (dr.contractUntil ?? 0)) warnings.push(`Leiharbeit von ${this.driverName(d)} endet vorher (${fmtDay((dr.contractUntil ?? 0) - 1)})`);
      if (q.cmd.kind === 'startJob') {
        const c = q.cmd;
        const o = b.orders.find((x) => x.id === c.orderId);
        for (const id of [c.tractorId, c.implementId]) {
          const m = this.company.machines.find((x) => x.id === id);
          if (m && (m.downUntil ?? 0) > start) warnings.push(`${m.brand} ${m.model} bis ${fmtDay(m.downUntil!)} in der Werkstatt`);
        }
        if (o && end > o.latest) warnings.push(`Termin des Kunden (${fmtDay(o.latest)}) wird überschritten`);
        bars.push({ key: `q${q.id}`, driverId: d, kind: 'queued', queueId: q.id, orderId: c.orderId, farmId: o?.farmId, label: q.label, start, end, tractorId: c.tractorId, implementId: c.implementId, latest: o?.latest, notBefore: q.notBefore, warnings });
      } else {
        bars.push({ key: `q${q.id}`, driverId: d, kind: 'queued', queueId: q.id, farmId: q.cmd.farmId, label: q.label, start, end, notBefore: q.notBefore, warnings });
      }
    }
    // Maschine bei zwei Fahrern zur selben Zeit eingeplant (der spätere wartet)
    for (const x of bars) {
      for (const y of bars) {
        if (x === y || x.driverId === y.driverId || x.start >= y.end || y.start >= x.end) continue;
        if (x.tractorId !== undefined && x.tractorId === y.tractorId) x.warnings.push('Schlepper zur selben Zeit bei einem anderen Fahrer – wartet');
        else if (x.implementId !== undefined && x.implementId === y.implementId) x.warnings.push('Gerät zur selben Zeit bei einem anderen Fahrer – wartet');
      }
    }
    return bars;
  }

  /**
   * Freier Firmenwagen mit genug Plätzen (inkl. Fahrer). Bevorzugt den kleinsten passenden,
   * den Werkstattwagen nur, wenn nichts anderes frei ist oder er ausdrücklich gebraucht wird.
   */
  private freeCar(seats: number, kind?: CarKind): Vehicle | undefined {
    let best: Vehicle | undefined, bestScore = Infinity;
    for (const v of this.vehicles) {
      if (v.owner !== 'player' || v.profile !== 'car' || v.task) continue;
      const m = this.company.machines.find((x) => x.id === v.machineId);
      if (!m || (m.downUntil ?? 0) > this.time || (m.seats ?? 5) < seats) continue;
      if (kind && m.carKind !== kind) continue;
      const score = (m.seats ?? 5) + (m.carKind === 'werkstatt' && !kind ? 100 : 0);
      if (score < bestScore) { best = v; bestScore = score; }
    }
    return best;
  }

  /** Fahrzeug, an dem die Maschine gerade hängt (Schlepper selbst oder Gerät im Auftrag) */
  private vehicleOfMachine(machineId: number): Vehicle | undefined {
    return this.vehicles.find((v) => v.owner === 'player' && (v.machineId === machineId || (v.task?.kind === 'job' && v.task.implementId === machineId)));
  }

  private dealerNode(dealerId: number): number {
    const d = DEALERS.find((x) => x.id === dealerId);
    if (!d) return this.homeNode;
    const [x, y] = project(this.graph, d.lonLat[0], d.lonLat[1]);
    return nearestNode(this.graph, x, y);
  }

  /** Reparatur-Befehl: Händler rufen oder eigene Werkstatt einplanen */
  private repairCommand(cmd: Extract<Command, { kind: 'repair' }>): string {
    const m = this.company.machines.find((x) => x.id === cmd.machineId);
    const r = m?.repair;
    if (!m || !r) return 'Keine offene Panne';
    if (r.state !== 'wartet') return r.state === 'haendler' ? 'Händler repariert schon' : 'Eigene Werkstatt ist schon dran';
    if (cmd.mode === 'dealer') return this.business.callDealer(m, this.time);
    const e = this.company.drivers.find((d) => d.id === cmd.mechanicId);
    if (!e) return 'Mechaniker wählen';
    if ((e.skills.werkstatt ?? 0) < MECHANIC_MIN) return `${this.driverName(e.id)} ist kein Mechaniker (Werkstatt ab Stufe ${MECHANIC_MIN})`;
    if (!this.company.machines.some((x) => x.carKind === 'werkstatt')) return 'Kein Werkstattwagen im Fuhrpark';
    r.mechanicId = e.id;
    this.business.version++;
    this.tryOwnRepair(m);
    if ((r.state as string) === 'eigen') {
      const how = r.parts === 'wagen' ? ' (Teil an Bord)' : r.parts === 'hof' ? ' (lädt das Teil am Hof)' : ` (holt erst das Teil bei ${r.dealer})`;
      return `${this.driverName(e.id)} fährt mit dem Werkstattwagen los${how}`;
    }
    const wait = r.partsReadyAt > this.time ? `Teil kommt ${fmtDay(r.partsReadyAt)} ${fmtTime(r.partsReadyAt)}` : (this.driverBusy(e.id) ?? this.driverBlocked(e.id) ?? 'Werkstattwagen ist unterwegs');
    return `Eigene Reparatur eingeplant – startet, sobald möglich (${wait})`;
  }

  /** Eigene Reparatur starten, wenn Teil, Mechaniker und Werkstattwagen bereit sind */
  private tryOwnRepair(m: Machine): void {
    const r = m.repair;
    if (!r || r.state !== 'wartet' || r.mechanicId === undefined) return;
    if (r.partsReadyAt > this.time) return;
    const d = r.mechanicId;
    if (!this.company.drivers.some((x) => x.id === d) || this.driverBusy(d) || this.driverBlocked(d)) return;
    const van = this.freeCar(1, 'werkstatt');
    if (!van) return;
    this.business.startOwnRepair(m, this.time);
    if (r.parts === 'hof') {
      // Teil aus dem Lager laden (der Werkstattwagen steht am Hof)
      van.task = { kind: 'repair', driverId: d, machineId: m.id, phase: 'pickup', tries: 0 };
      van.state = VehicleState.Waiting;
      van.waitMin = 10;
      return;
    }
    van.task = { kind: 'repair', driverId: d, machineId: m.id, phase: r.parts === 'wagen' ? 'to' : 'fetch', tries: 0 };
    this.driveRepairVan(van);
  }

  private driveRepairVan(van: Vehicle) {
    const t = van.task;
    if (t?.kind !== 'repair') return;
    const m = this.company.machines.find((x) => x.id === t.machineId);
    if (t.phase === 'fetch') { this.driveTo(van, this.dealerNode(m?.repair?.dealerId ?? 0)); return; }
    const target = this.vehicleOfMachine(t.machineId);
    if (target && target !== van) {
      const [px, py] = this.position(target.id);
      this.driveTo(van, nearestNode(this.graph, px, py));
    } else this.driveTo(van, this.homeOf(van));
  }

  /** Jede Minute: offene Pannen (Händler nach 1 h automatisch, eigene Reparatur starten, Händler fertig) */
  private checkRepairs() {
    for (const m of this.company.machines) {
      const r = m.repair;
      if (!r) continue;
      if (r.state === 'haendler' && this.time >= (m.downUntil ?? 0)) {
        m.repair = undefined;
        m.downReason = undefined;
        this.business.info(this.time, `${m.brand} ${m.model} ist repariert.`);
        continue;
      }
      if (r.state !== 'wartet') continue;
      if (r.mechanicId !== undefined) this.tryOwnRepair(m);
      else if (this.time >= r.since + 60) this.business.callDealer(m, this.time);
    }
  }

  /** Maschine (mit Fahrer, ggf. Gerät) zu einem anderen Standort überführen (ST-07) */
  private transferMachine(machineId: number, siteId: number, driverId: number, implementId?: number): string {
    const st = (this.company.sites ?? []).find((x) => x.id === siteId);
    const m = this.company.machines.find((x) => x.id === machineId);
    if (!st || !m) return 'Unbekannt';
    if ((m.siteId ?? 1) === siteId) return 'Steht schon dort';
    const v = this.vehicles.find((x) => x.owner === 'player' && x.machineId === machineId);
    if (!v) {
      // Gerät ohne eigenen Antrieb: nur zusammen mit einem Schlepper
      return 'Geräte werden mit einem Schlepper überführt (Schlepper wählen und Gerät mitnehmen)';
    }
    if (v.task || this.machineBusy(machineId)) return 'Maschine ist im Einsatz';
    if (implementId !== undefined && this.machineBusy(implementId)) return 'Gerät ist im Einsatz';
    const blocked = this.driverBusy(driverId) ?? this.driverBlocked(driverId);
    if (blocked) return `${this.driverName(driverId)}: ${blocked}`;
    v.task = { kind: 'transfer', driverId, siteId, implementId };
    if (!this.driveTo(v, st.node)) return 'Standort nicht erreichbar';
    this.business.version++;
    return `${this.driverName(driverId)} überführt ${[m.brand, m.model].filter(Boolean).join(' ')} nach ${st.name}`;
  }

  /** Gespann steht am Hof (Rüsten oder Abstellen) */
  private atHome(v: Vehicle): boolean {
    const t = v.task;
    if (t?.kind === 'job' && (t.phase === 'prep' || t.phase === 'unhitch')) return true;
    const [px, py] = this.position(v.id);
    const hn = this.homeOf(v);
    const dx = px - this.graph.x[hn], dy = py - this.graph.y[hn];
    return dx * dx + dy * dy < 150 * 150;
  }

  /** Fahrer übernimmt das Gespann (Tempo und Diesel nach seinem Skill) */
  private takeOverJob(v: Vehicle, driverId: number) {
    const t = v.task;
    if (t?.kind !== 'job') return;
    const old = t.driverId;
    const skill = this.company.drivers.find((d) => d.id === driverId)?.skills.boden ?? 1;
    const f = skillSpeed(skill) / skillSpeed(t.skill);
    t.haPerHour *= f;
    t.workKmh *= f;
    t.dieselLHa *= skillDiesel(skill) / skillDiesel(t.skill);
    t.skill = skill;
    t.driverId = driverId;
    v.restUntil = 0; // ausgeruhter Fahrer macht weiter
    this.business.version++;
    this.business.info(this.time, `${v.name}: ${this.driverName(driverId)} übernimmt von ${this.driverName(old)}.`);
  }

  /**
   * Fahrerwechsel bei einem laufenden Auftrag (Ersatz bei Krankheit oder Feierabend). Am Hof
   * sofort; draußen nur, wenn ein dritter Fahrer den Ersatz mit dem Firmenwagen hinbringt und
   * den abgelösten Fahrer mit zurücknimmt (KK-03).
   */
  private swapDriver(vehicle: number, driverId: number, chauffeurId?: number): string {
    const v = this.vehicles[vehicle];
    if (!v || v.owner !== 'player' || v.task?.kind !== 'job') return 'Nur bei laufenden Aufträgen';
    const t = v.task;
    if (t.driverId === driverId) return 'Fährt schon';
    if (!this.company.drivers.some((d) => d.id === driverId)) return 'Fahrer unbekannt';
    const busy = this.driverBusy(driverId);
    if (busy) return busy;
    const blocked = this.driverBlocked(driverId);
    if (blocked) return `${this.driverName(driverId)} ${blocked}`;
    if ((this.company.drivers.find((d) => d.id === driverId)?.skills.boden ?? 0) < MACHINE_SKILL.schlepper!.min) return `${this.driverName(driverId)} ist nicht als Traktorfahrer qualifiziert`;
    if (this.vehicles.some((x) => x.task?.kind === 'shuttle' && x.task.vehicle === vehicle)) return 'Wechsel ist schon unterwegs';
    if (this.atHome(v)) {
      this.takeOverJob(v, driverId);
      return `${this.driverName(driverId)} übernimmt am Hof`;
    }
    if (chauffeurId === undefined) return 'Das Gespann ist draußen – jemand muss den Ersatz mit dem Firmenwagen hinbringen';
    if (chauffeurId === driverId || chauffeurId === t.driverId) return 'Der Ersatz braucht einen anderen Fahrer für den Firmenwagen';
    if (!this.company.drivers.some((d) => d.id === chauffeurId)) return 'Fahrer für den Firmenwagen unbekannt';
    const cb = this.driverBusy(chauffeurId) ?? this.driverBlocked(chauffeurId);
    if (cb) return `${this.driverName(chauffeurId)}: ${cb}`;
    const car = this.freeCar(2); // Fahrer + Ersatz hin, Fahrer + Abgelöster zurück
    if (!car) return 'Kein freier Firmenwagen mit zwei Plätzen';
    const [px, py] = this.position(v.id);
    car.task = { kind: 'shuttle', driverId: chauffeurId, passengerId: driverId, vehicle, phase: 'to', tries: 0 };
    if (!this.driveTo(car, nearestNode(this.graph, px, py))) return 'Gespann nicht erreichbar';
    this.business.version++;
    this.business.info(this.time, `${this.driverName(chauffeurId)} bringt ${this.driverName(driverId)} mit dem Firmenwagen zu ${v.name}.`);
    return `${this.driverName(chauffeurId)} fährt ${this.driverName(driverId)} hin`;
  }

  /** Firmenwagen beim Fahrerwechsel angekommen: Gespann noch in der Nähe? Dann Übergabe */
  private shuttleArrive(car: Vehicle) {
    const t = car.task;
    if (t?.kind !== 'shuttle') return;
    const target = this.vehicles[t.vehicle];
    const [cx, cy] = this.position(car.id);
    const [px, py] = this.position(t.vehicle);
    const far = (cx - px) * (cx - px) + (cy - py) * (cy - py) > 1500 * 1500;
    if (target?.task?.kind === 'job' && far && t.tries < 3) {
      // Gespann ist inzwischen weitergefahren: hinterher
      t.tries++;
      this.driveTo(car, nearestNode(this.graph, px, py));
      return;
    }
    t.phase = 'at';
    car.state = VehicleState.Waiting;
    car.waitMin = 5;
    if (target) target.handoverUntil = this.time + 5;
    this.business.version++;
  }

  /** Auftrag aus dem Board einplanen bzw. umplanen (ersetzt einen bestehenden Eintrag) */
  private planJob(cmd: Extract<Command, { kind: 'plan' }>): string {
    const existing = this.queue.find((q) => q.cmd.kind === 'startJob' && q.cmd.orderId === cmd.orderId);
    const job: QueueCommand = { kind: 'startJob', orderId: cmd.orderId, tractorId: cmd.tractorId, implementId: cmd.implementId, driverId: cmd.driverId };
    const err = this.checkQueueCommand(job, existing?.id);
    if (err) return err;
    if (!this.company.drivers.some((d) => d.id === cmd.driverId)) return 'Fahrer unbekannt';
    if (existing) this.queue.splice(this.queue.indexOf(existing), 1);
    const item: QueueItem = { id: existing?.id ?? this.nextQueueId++, driverId: cmd.driverId, cmd: job, label: this.queueLabel(job) };
    if (cmd.notBefore !== undefined && cmd.notBefore > this.time) item.notBefore = cmd.notBefore;
    this.insertQueue(item);
    this.business.version++;
    return `Eingeplant für ${this.driverName(cmd.driverId)}${item.notBefore ? ` ab ${fmtDay(item.notBefore)}` : ''}`;
  }

  /** In die Warteschlange des Fahrers einsortieren: nach Starttermin, sonst hinten an */
  private insertQueue(item: QueueItem) {
    const nb = item.notBefore ?? 0;
    let at = this.queue.length;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (q.driverId !== item.driverId) continue;
      if ((q.notBefore ?? 0) > nb) at = i;
      else break;
    }
    this.queue.splice(at, 0, item);
  }

  /** Prüfungen, die unabhängig davon gelten, ob der Fahrer gerade frei ist; null = in Ordnung */
  private checkQueueCommand(cmd: QueueCommand, ignoreQueueId = 0): string | null {
    const b = this.business;
    if (cmd.kind === 'visit') {
      if (!this.farms?.farms[cmd.farmId]) return 'Betrieb unbekannt';
      if (!this.vehicles.some((v) => v.owner === 'player' && v.profile === 'car')) return 'Kein Firmenwagen';
      return null;
    }
    const driver = this.company.drivers.find((d) => d.id === (cmd.driverId ?? 1));
    if (!driver) return 'Fahrer gibt es nicht mehr';
    const tOrder = b.orders.find((x) => x.id === cmd.orderId);
    if (tOrder?.service === 'transport') {
      if (tOrder.status !== 'offen') return 'Auftrag nicht startbar';
      if (tOrder.slurrySupply || tOrder.liquid) {
        // Gülle holen: Schlepper mit Zubringer- oder Güllefass
        const tr = this.company.machines.find((m) => m.id === cmd.tractorId && m.type === 'schlepper');
        const fass = this.company.machines.find((m) => m.id === cmd.implementId && (m.type === 'zubringer' || m.type === 'guellefass'));
        if (!tr || !fass) return 'Schlepper und Zubringer- bzw. Güllefass wählen';
        if ((fass.powerNeed ?? 0) > (tr.power ?? 0)) return 'Schlepper zu schwach für das Fass';
        if ((driver.skills.boden ?? 0) < 1) return `${this.driverName(driver.id)} ist nicht als Traktorfahrer qualifiziert`;
        if (!this.vehicles.some((v) => v.owner === 'player' && v.machineId === tr.id)) return 'Schlepper nicht verfügbar';
        return null;
      }
      const lkw = this.company.machines.find((m) => m.id === cmd.tractorId && m.type === 'lkw');
      if (!lkw) return 'Lkw wählen';
      if ((driver.skills.transport ?? 0) < 1) return `${this.driverName(driver.id)} hat keinen Lkw-Führerschein (CE)`;
      if (!this.vehicles.some((v) => v.owner === 'player' && v.machineId === lkw.id)) return 'Lkw nicht verfügbar';
      if (this.queue.some((q) => q.id !== ignoreQueueId && q.cmd.kind === 'startJob' && q.cmd.orderId === tOrder.id)) return 'Auftrag ist schon eingeplant';
      return null;
    }
    const need = MACHINE_SKILL.schlepper!;
    if ((driver.skills[need.skill] ?? 0) < need.min) return `${this.driverName(driver.id)} ist nicht als Traktorfahrer qualifiziert`;
    const o = b.orders.find((x) => x.id === cmd.orderId);
    if (!o || (o.status !== 'offen' && o.status !== 'läuft')) return 'Auftrag nicht startbar';
    if (o.status === 'läuft') {
      // weitere Maschine im laufenden Auftrag (z. B. zweiter Drescher oder Roder)
      if (o.gabe) return 'Gülle: zweites Fass bitte als Zubringer einsetzen';
      if (!this.joinPlan(o, true)) return 'Im Auftrag ist nichts mehr frei für eine weitere Maschine';
    }
    const sk = SERVICE_SKILL[o.service];
    if ((driver.skills[sk] ?? 0) < 1) return `${this.driverName(driver.id)} ist für ${SERVICE_NAMES[o.service]} nicht qualifiziert`;
    const chopping = isHarvest(o.service);
    const harvType = SERVICE_IMPLEMENT[o.service];
    const towed = HARVEST_TOWED.includes(o.service);
    const tractor = this.company.machines.find((m) => m.id === cmd.tractorId && m.type === (chopping && !towed ? harvType : 'schlepper'));
    const impl = this.company.machines.find((m) => m.id === cmd.implementId);
    const harvName = ({ feldhaecksler: 'Feldhäcksler', maehdrescher: 'Mähdrescher', ruebenroder: 'Rübenroder', kartoffelroder: 'Kartoffelroder' } as Record<string, string>)[harvType] ?? harvType;
    if (!tractor || !impl) return chopping ? `${harvName} wählen` : 'Maschine fehlt';
    if (chopping) {
      const sk = MACHINE_SKILL[harvType]!;
      if ((driver.skills[sk.skill] ?? 0) < sk.min) return `${this.driverName(driver.id)} braucht ${harvName} ab Stufe ${sk.min}`;
      const wagonType = HAULER_TYPE[o.service];
      const wagonTypes = HAULER_TYPES[o.service] ?? [];
      if (towed && (impl.powerNeed ?? 0) > (tractor.power ?? 0)) return 'Schlepper zu schwach für den Roder';
      if (!wagonType && (cmd.haulers ?? []).length) return 'Der Rübenroder legt eine Feldrandmiete an – Abfahrer sind nicht nötig';
      if (cmd.roller && o.service !== 'haeckseln') return 'Radlader am Silo gibt es nur beim Häckseln';
      if (o.chain === 'komplett' && !(cmd.haulers ?? []).length) return `${o.service === 'drusch' ? 'Drusch mit Abfuhr' : 'Komplettkette'}: mindestens ein Abfahrer (Fahrer, Schlepper, ${o.service === 'drusch' ? 'Kipper' : 'Häckselwagen'})`;
      const used = new Set<number>([driver.id]);
      const machines = new Set<number>([tractor.id]);
      for (const h of cmd.haulers ?? []) {
        const d = this.company.drivers.find((x) => x.id === h.driverId);
        const t = this.company.machines.find((x) => x.id === h.tractorId && x.type === 'schlepper');
        const w = this.company.machines.find((x) => x.id === h.implementId && wagonTypes.includes(x.type));
        if (!d || !t || !w) return `Abfahrer: Fahrer, Schlepper und ${wagonType === 'kipper' ? 'Kipper' : 'Häckselwagen'} wählen`;
        if (used.has(d.id) || machines.has(t.id) || machines.has(w.id)) return 'Jeder Abfahrer braucht eigenen Fahrer, Schlepper und Wagen';
        if ((d.skills.boden ?? 0) < 1) return `${this.driverName(d.id)} ist nicht als Traktorfahrer qualifiziert`;
        if ((w.powerNeed ?? 0) > (t.power ?? 0)) return 'Abfahrer: Schlepper zu schwach für den Wagen';
        used.add(d.id); machines.add(t.id); machines.add(w.id);
      }
      if (cmd.roller) {
        const d = this.company.drivers.find((x) => x.id === cmd.roller!.driverId);
        const r = this.company.machines.find((x) => x.id === cmd.roller!.machineId && x.type === 'radlader');
        if (!d || !r) return 'Radlader: Fahrer und Radlader wählen';
        if (used.has(d.id)) return 'Der Radladerfahrer fährt schon in der Kette';
        if ((d.skills.radlader ?? 0) < 1) return `${this.driverName(d.id)} ist nicht für den Radlader qualifiziert`;
      }
    }
    const needType = SERVICE_IMPLEMENT[o.service];
    if (impl.type !== needType) return `Für ${SERVICE_NAMES[o.service]} wird ${({ grubber: 'ein Grubber', kurzscheibenegge: 'eine Kurzscheibenegge', guellefass: 'ein Güllefass' } as Record<string, string>)[needType] ?? needType} gebraucht`;
    if (cmd.feeder) {
      if (o.service !== 'guelle') return 'Zubringer gibt es nur bei Gülle';
      const fd = this.company.drivers.find((d) => d.id === cmd.feeder!.driverId);
      const ft = this.company.machines.find((m) => m.id === cmd.feeder!.tractorId && m.type === 'schlepper');
      const fz = this.company.machines.find((m) => m.id === cmd.feeder!.implementId && m.type === 'zubringer');
      if (!fd || !ft || !fz) return 'Zubringer: Fahrer, Schlepper und Zubringerfass wählen';
      if (fd.id === driver.id || ft.id === tractor.id) return 'Zubringer braucht einen eigenen Fahrer und Schlepper';
      if ((fd.skills.boden ?? 0) < 1) return `${this.driverName(fd.id)} ist nicht als Traktorfahrer qualifiziert`;
      if ((fz.powerNeed ?? 0) > (ft.power ?? 0)) return 'Zubringer: Schlepper zu schwach';
    }
    if (!chopping && (impl.powerNeed ?? 0) > (tractor.power ?? 0)) return 'Schlepper zu schwach für das Gerät';
    if (!this.vehicles.some((v) => v.owner === 'player' && v.machineId === tractor.id)) return 'Schlepper nicht verfügbar';
    if (!this.fields) return 'Keine Felddaten';
    if (!o.fields.some((f) => !o.doneFields.includes(f))) return 'Alle Felder erledigt';
    if (this.queue.some((q) => q.id !== ignoreQueueId && q.cmd.kind === 'startJob' && q.cmd.orderId === o.id)) return 'Auftrag ist schon eingeplant';
    return null;
  }

  private queueLabel(cmd: QueueCommand): string {
    const b = this.business;
    if (cmd.kind === 'visit') return `Besuch ${b.farmName(cmd.farmId)}`;
    const o = b.orders.find((x) => x.id === cmd.orderId);
    return o ? `${SERVICE_NAMES[o.service]} ${b.farmName(o.farmId)} (${fmtHa(o.areaHa)})` : 'Auftrag';
  }

  /**
   * Besuch oder Auftrag sofort starten oder hinten in die Warteschlange des Fahrers stellen,
   * wenn er unterwegs ist, keine Arbeitszeit mehr hat, schon etwas geplant ist oder die
   * Maschine gerade ein anderer fährt.
   */
  private startOrQueue(cmd: QueueCommand): string {
    const err = this.checkQueueCommand(cmd);
    if (err) return err;
    const d = this.cmdDriver(cmd);
    const busy = this.driverBusy(d);
    const blocked = this.driverBlocked(d);
    const tired = !!blocked;
    const weather = cmd.kind === 'startJob' ? this.weatherFor(cmd.orderId) : null;
    const inUse = this.machineInUse(cmd) ?? weather;
    const mine = this.queue.filter((q) => q.driverId === d);
    if (busy || tired || inUse || mine.length) {
      if (cmd.kind === 'visit' && mine.some((q) => q.cmd.kind === 'visit' && q.cmd.farmId === cmd.farmId)) return 'Besuch ist schon eingeplant';
      const label = this.queueLabel(cmd);
      this.queue.push({ id: this.nextQueueId++, driverId: d, cmd: { ...cmd }, label });
      this.business.version++;
      const why = blocked && !busy ? ` (${this.driverName(d)} ${blocked})` : inUse && !busy ? ` (${inUse})` : '';
      return `Eingeplant für ${this.driverName(d)} als Nr. ${mine.length + 1}: ${label}${why}`;
    }
    return this.startNow(cmd);
  }

  /** Startet die Aufgabe; Fahrer und Maschine müssen frei sein (Prüfung vorher) */
  private startNow(cmd: QueueCommand): string {
    const b = this.business;
    const t = this.time;
    if (cmd.kind === 'visit') {
      const farm = this.farms!.farms[cmd.farmId];
      const car = this.freeCar(1);
      if (!car) return 'Kein freier Firmenwagen';
      car.task = { kind: 'visit', driverId: 1, farmId: farm.id, phase: 'to' };
      if (!this.driveTo(car, farm.homeNode)) return 'Hof nicht erreichbar';
      b.version++;
      return `Fahrt zu ${farm.name}`;
    }
    const o = b.orders.find((x) => x.id === cmd.orderId)!;
    const tractor = this.company.machines.find((m) => m.id === cmd.tractorId)!;
    const impl = this.company.machines.find((m) => m.id === cmd.implementId)!;
    const unit = this.vehicles.find((v) => v.owner === 'player' && v.machineId === tractor.id);
    if (!unit || unit.task) return 'Schlepper nicht verfügbar';
    const driverId = cmd.driverId ?? 1;
    if (o.service === 'transport') {
      const rueben = (o.tPerHa ?? 0) >= 50 && !o.slurrySupply;
      const dest = DESTINATIONS.find((d) => d.name === o.destName);
      // Gülle holen: Fass ansaugen/abpumpen je etwa 6 min (Annahme)
      const slurry = !!o.slurrySupply || !!o.liquid;
      unit.task = {
        kind: 'truck', driverId, orderId: o.id, from: o.pickupNode ?? this.homeNode, to: o.destNode ?? this.homeNode,
        cap: slurry ? impl.tankM3 ?? 15 : tractor.payloadT ?? 25, load: 0,
        loadMin: slurry ? 6 : rueben ? TRUCK_LOAD_MIN.rueben : TRUCK_LOAD_MIN.korn, unloadMin: slurry ? 6 : dest?.unloadMin ?? 15,
        driveMin: 0, phase: 'toLoad', implementId: slurry ? impl.id : undefined,
      };
      this.driveTo(unit, unit.task.from);
      b.orderStarted(o, tractor.id, impl.id, t, this.driverName(driverId));
      return `Transport gestartet (${this.driverName(driverId)})`;
    }
    const skill = this.company.drivers.find((d) => d.id === driverId)?.skills[SERVICE_SKILL[o.service]] ?? 1;
    const plan = o.status === 'läuft' ? this.joinPlan(o, false) : null;
    if (o.status === 'läuft' && !plan) return 'Im Auftrag ist nichts mehr frei für eine weitere Maschine';
    const queue = plan ? plan.queue : o.fields.filter((f) => !o.doneFields.includes(f));
    unit.task = {
      kind: 'job', driverId, implementId: impl.id, skill, orderId: o.id, queue, current: 0, phase: 'prep',
      width: impl.width ?? 3,
      haPerHour: (impl.haPerHour ?? 1.5) * skillSpeed(skill),
      workKmh: (impl.workKmh ?? 10) * skillSpeed(skill),
      dieselLHa: (impl.dieselLHa ?? 9) * skillDiesel(skill),
      share: plan?.share,
    };
    if (isHarvest(o.service)) {
      const farm = this.farms?.farms[o.farmId];
      const silo = o.sourceNode ?? farm?.homeNode ?? this.homeNode;
      const svc = o.service;
      const raps = this.farms ? this.farms.fieldCrop[queue[0]] === Crop.Raps : false;
      const yieldT = svc === 'drusch' ? (raps ? RAPE_YIELD_T_HA : GRAIN_YIELD_T_HA) : svc === 'roden' ? BEET_YIELD_T_HA : svc === 'kartoffelroden' ? POTATO_YIELD_T_HA : SILAGE_YIELD_T_HA;
      const access = this.fields!.access[queue[0]];
      // Wagen des Kunden (nur Häcksler): 3 Gespanne à 12 t, Umlauf = Hin- und Rückfahrt + Abkippen
      const cycle = Math.round((2 * this.nodeDist(silo, access)) / EST_TRACTOR_M_MIN + 8);
      const roller = cmd.roller ? this.company.machines.find((m) => m.id === cmd.roller!.machineId) : undefined;
      unit.task.chop = {
        yieldT, silo, attached: null,
        // Wagen des Kunden (nur Häcksler / nur Drusch: Anhänger am Feldrand); Rübenroder: Feldrandmiete
        virtual: o.chain === 'haecksler' ? (svc === 'drusch' || svc === 'kartoffelroden' ? [0, 0] : [0, 0, 0]) : [], virtualCap: svc === 'drusch' ? 14 : 12, virtualCycle: cycle,
        siloBacklog: 0,
        // Annahme am Silo: Kunde walzt (nur Häcksler) 120 t/h, eigener Radlader Betriebsgewicht × 4, Fremdwalze 100 t/h;
        // Korn am Hof des Kunden: Gosse 150 t/h
        siloTph: svc === 'drusch' || svc === 'kartoffelroden' ? 150 : o.chain === 'haecksler' ? 120 : roller ? (roller.weightT ?? 12) * 4 : 100,
        hiredRoller: svc === 'haeckseln' && o.chain === 'komplett' && !roller, rollerMinutes: 0, fieldHa: 0,
        // Korntank bzw. Rübenbunker (t)
        bunker: svc === 'haeckseln' ? undefined : { cap: impl.payloadT ?? (svc === 'roden' ? 30 : 9), load: 0 },
        miete: svc === 'roden',
      };
      unit.task.dieselLHa = impl.dieselLHa ?? 30;
      for (const h of cmd.haulers ?? []) {
        const hu = this.vehicles.find((v) => v.owner === 'player' && v.machineId === h.tractorId)!;
        const w = this.company.machines.find((m) => m.id === h.implementId)!;
        // Überladewagen: lädt am Feldrand über (auf Lkw/Anhänger des Kunden), also kurzer Umlauf
        const dropAt = w.type === 'ueberladewagen' ? access : silo;
        hu.task = { kind: 'haul', driverId: h.driverId, implementId: w.id, orderId: o.id, harvester: unit.id, cap: w.payloadT ?? 12, load: 0, silo: dropAt, phase: 'prep' };
        hu.state = VehicleState.Waiting;
        hu.waitMin = RUEST_HOF_MIN;
      }
      if (cmd.roller && roller) {
        const ru = this.vehicles.find((v) => v.owner === 'player' && v.machineId === roller.id)!;
        ru.task = { kind: 'silo', driverId: cmd.roller.driverId, orderId: o.id, harvester: unit.id, phase: 'to' };
        this.driveTo(ru, silo);
      }
    }
    if (o.gabe) {
      const farm = this.farms?.farms[o.farmId];
      unit.task.slurry = { cap: impl.tankM3 ?? 15, load: 0, gabe: o.gabe, source: o.sourceNode ?? farm?.homeNode ?? this.homeNode, progress: 0, frac: 0 };
    }
    unit.state = VehicleState.Waiting;
    unit.waitMin = RUEST_HOF_MIN;
    // Matschplatz (ohne befestigten Platz): bei nassem Boden 10 min Rangieren
    if (!b.hasBuilding('platz', tractor.siteId ?? 1) && this.weather.day(Math.floor(t / 1440)).soil > 25) unit.waitMin += 10;
    if (cmd.feeder && unit.task.slurry) {
      const fu = this.vehicles.find((v) => v.owner === 'player' && v.machineId === cmd.feeder!.tractorId)!;
      const fz = this.company.machines.find((m) => m.id === cmd.feeder!.implementId)!;
      fu.task = {
        kind: 'feeder', driverId: cmd.feeder.driverId, implementId: fz.id, orderId: o.id, spreader: unit.id,
        cap: fz.tankM3 ?? 20, load: 0, source: unit.task.slurry.source, phase: 'prep',
      };
      fu.state = VehicleState.Waiting;
      fu.waitMin = RUEST_HOF_MIN;
      unit.task.slurry.feeder = fu.id;
    }
    b.orderStarted(o, tractor.id, impl.id, t, this.driverName(driverId));
    return `Auftrag gestartet (${this.driverName(driverId)})`;
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
        if (t?.kind === 'haul') {
          status = ({
            prep: 'hängt den Häckselwagen an', toField: 'fährt zum Häcksler', wait: 'wartet am Feldrand auf den Häcksler',
            load: `fährt neben dem Häcksler (${Math.round(t.load)} von ${t.cap} t)`, toSilo: `bringt ${Math.round(t.load)} t zum Silo`,
            waitSilo: 'wartet am Silo (Walze kommt nicht nach)', unload: 'kippt am Silo ab', back: 'fährt zurück zum Hof', unhitch: 'stellt den Wagen ab',
          } as Record<string, string>)[t.phase];
        }
        if (t?.kind === 'truck') {
          const o = b.orders.find((x) => x.id === t.orderId);
          status = ({
            toLoad: 'fährt zur Ladestelle', load: 'wird beladen', toUnload: `bringt ${Math.round(t.load)} ${o?.slurrySupply || o?.liquid ? 'm³' : 't'} nach ${o?.destName ?? 'Ziel'}`,
            unload: 'lädt ab (Waage, Probe)', break: 'Lenkzeitpause', back: 'fährt zurück zum Hof', night: 'Feierabend, morgen weiter',
          } as Record<string, string>)[t.phase] + (o ? ` · ${Math.round(o.doneT ?? 0)} von ${Math.round(o.areaHa * (o.tPerHa ?? 0))} t` : '');
        }
        if (t?.kind === 'compact') status = t.phase === 'work' ? 'fährt das Silo fest' : t.phase === 'to' ? 'fährt zur Biogasanlage' : 'fährt zurück';
        if (t?.kind === 'transfer') status = `wird überführt nach ${(this.company.sites ?? []).find((x) => x.id === t.siteId)?.name ?? ''}`;
        if (t?.kind === 'silo') status = t.phase === 'work' ? 'verteilt und walzt am Silo' : t.phase === 'to' ? 'fährt zum Silo' : 'fährt zurück zum Hof';
        if (t?.kind === 'feeder') {
          const o = b.orders.find((x) => x.id === t.orderId);
          status = ({
            prep: 'hängt das Zubringerfass an', toFill: `fährt zum Güllelager (${o ? b.farmName(o.farmId) : ''})`, fill: 'füllt am Güllelager',
            toField: `bringt ${Math.round(t.load)} m³ zum Feld`, wait: `wartet am Feldrand (${Math.round(t.load)} m³)`, transfer: 'füllt das Ausbringfass um',
            back: 'fährt zurück zum Hof', unhitch: 'stellt das Zubringerfass ab',
          } as Record<string, string>)[t.phase];
        }
        if (t?.kind === 'repair') {
          const m = this.company.machines.find((x) => x.id === t.machineId);
          const what = m ? `${m.brand} ${m.model}` : 'Maschine';
          status = { fetch: `holt Ersatzteil für ${what} beim Händler`, pickup: 'lädt Ersatzteil', to: `fährt zur Panne (${what})`, at: `repariert ${what}`, back: 'fährt zurück zum Hof' }[t.phase];
        }
        if (t?.kind === 'shuttle') status = t.phase === 'to' ? `bringt ${this.driverName(t.passengerId)} zum Fahrerwechsel` : t.phase === 'at' ? 'Fahrerwechsel' : 'fährt mit dem abgelösten Fahrer zurück';
        if (t?.kind === 'job') {
          const o = b.orders.find((x) => x.id === t.orderId);
          const who = o ? b.farmName(o.farmId) : '';
          const n = `Feld ${t.current + 1}/${t.queue.length}`;
          const sl = t.slurry;
          status = ({
            prep: 'baut am Hof das Gerät an (Rüstzeit)',
            to: `fährt zum Feld (${who}, ${n})`,
            setup: `richtet das Gerät am Feld ein (${n})`,
            work: `${o ? SERVICE_VERB[o.service] : 'arbeitet'} für ${who} (${n}${sl ? `, ${Math.round(sl.progress * 100)} %` : ''})`,
            back: 'fährt zurück zum Hof',
            unhitch: 'baut am Hof das Gerät ab',
            toFill: `fährt zum Güllelager (${who})`,
            fill: 'füllt am Güllelager',
            waitFeed: 'wartet am Feldrand auf den Zubringer',
            feed: 'wird vom Zubringer befüllt',
          } as Record<string, string>)[t.phase];
        }
        if (v.restUntil > this.time) status = `Feierabend (Arbeitszeit erreicht), weiter um 06:00 – ${status}`;
        if ((v.handoverUntil ?? 0) > this.time) status = `Fahrerwechsel – ${status}`;
        if (this.weatherHold(v) && t?.kind === 'job') status = `wartet auf Wetter (${this.weatherFor(t.orderId)}) – ${status}`;
        if (t && this.business.absence(t.driverId, this.time)) status = `Fahrer krank, Gespann wartet – ${status}`;
        if (t) status = `${this.driverName(t.driverId)}: ${status}`;
        const moving = v.route && v.seg < v.route.speed.length && (v.state === VehicleState.Driving || v.state === VehicleState.Working) && v.restUntil <= this.time;
        const kmh = moving ? Math.round(v.route!.speed[v.seg] * 3.6) : 0;
        const m = this.company.machines.find((x) => x.id === v.machineId);
        return { machineId: v.machineId!, vehicle: v.id, status, kmh: kmh > 200 ? 0 : kmh, hours: m?.hours ?? 0, busy: !!t, orderId: t?.kind === 'job' ? t.orderId : undefined, atHome: this.atHome(v) };
      });
  }

  /** Spielerbefehl ausführen (zwischen zwei Schritten); liefert eine Rückmeldung. */
  command(cmd: Command): string {
    const b = this.business;
    const t = this.time;
    switch (cmd.kind) {
      case 'respond':
        return b.respond(cmd.requestId, cmd.action, t, cmd.priceHa);
      case 'buy': {
        const r = b.buy(cmd.offerId, t);
        this.syncPlayerVehicles();
        return r;
      }
      case 'remind': {
        // Anruf geht auch unterwegs, kostet aber Arbeitszeit des Chefs
        if (this.chefMinutes >= CHEF_MAX_MINUTES) return 'Arbeitszeit des Chefs für heute erreicht (ab 06:00 wieder)';
        const r = b.remind(cmd.invoiceId, t);
        if (r === 'Kunde angerufen') this.driverMinutes[1] = this.chefMinutes + REMIND_CALL_MINUTES;
        return r;
      }
      case 'order':
        return b.order(cmd.dealerId, cmd.modelKey, t, cmd.leaseMonths);
      case 'takeLoan':
        return b.takeLoan(cmd.amount, cmd.years, t);
      case 'repayLoan':
        return b.repayLoan(cmd.loanId, cmd.amount, t);
      case 'leaseBuyout':
        return b.setLeaseBuyout(cmd.machineId, cmd.buyout);
      case 'check':
        return b.check(cmd.offerId, t);
      case 'sell': {
        if (this.machineBusy(cmd.machineId)) return 'Maschine ist im Einsatz';
        const r = b.sell(cmd.machineId, cmd.mode, t);
        this.syncPlayerVehicles();
        return r;
      }
      case 'service': {
        const m = this.company.machines.find((x) => x.id === cmd.machineId);
        if (!m) return 'Maschine unbekannt';
        if (this.machineBusy(m.id)) return 'Maschine ist im Einsatz';
        if ((m.downUntil ?? 0) > t) return `Schon in der Werkstatt (${m.downReason})`;
        // eigene Werkstatt am Standort der Maschine und ein freier Mechaniker
        const own = b.hasBuilding('werkstatt', m.siteId ?? 1) && this.company.drivers.some((d) => (d.skills.werkstatt ?? 0) >= MECHANIC_MIN && !this.driverBusy(d.id) && !this.driverBlocked(d.id));
        return b.service(m, t, this.homeLonLat, own);
      }
      case 'hire':
        return b.hire(cmd.applicantId, cmd.asKind, t);
      case 'rent':
        return b.rent(cmd.poolId, cmd.days, t);
      case 'extendRent':
        return b.extendRent(cmd.employeeId, cmd.days, t);
      case 'takeOver':
        return b.takeOver(cmd.employeeId, cmd.asKind, t);
      case 'repair':
        return this.repairCommand(cmd);
      case 'buyParts':
        return b.buyParts(cmd.amount, t);
      case 'build':
        return b.build(cmd.siteId, cmd.building, t);
      case 'bidLease':
        return b.bidLease(cmd.offerId, cmd.rentHa);
      case 'askLand':
        return b.askLand(cmd.farmId, t);
      case 'setCrop':
        return b.setCrop(cmd.leaseId, cmd.crop, t);
      case 'buyLand': return b.buyLand(cmd.offerId, t);
      case 'dispatcher': return b.dispatcherCmd(cmd, t);
      case 'course': return b.startCourse(cmd.employeeId, cmd.course, cmd.skill, t);
      case 'hireApprentice': { const r = b.hireApprentice(t); this.syncPlayerVehicles(); return r; }
      case 'poachAnswer': return b.poachAnswer(cmd.employeeId, cmd.match, t);
      case 'buyCompetitor': { const r = b.buyCompetitor(cmd.competitorId, t); this.syncPlayerVehicles(); return r; }
      case 'frameAnswer': return b.frameAnswer(cmd.offerId, cmd.accept, t);
      case 'sellCrop': return b.sellCrop(cmd.crop, cmd.t, t);
      case 'forward': return b.forward(cmd.crop, cmd.t, cmd.months, t);
      case 'storeHarvest': b.storeHarvest = cmd.on; b.version++; return cmd.on ? 'Korn wird eingelagert' : 'Korn wird zur Ernte verkauft';
      case 'buildBiogas': return b.buildBiogas(cmd.siteId, cmd.kw, cmd.bidCt, t);
      case 'biogasBid': return b.biogasBid(cmd.ct);
      case 'buySubstrate': return b.buySubstrate(cmd.substrate, cmd.t, t);
      case 'buyMaisField': return b.buyMaisField(cmd.farmId, t);
      case 'guelleContract': return b.guelleContract(cmd.farmId, t, cmd.selfHaul);
      case 'fetchSlurry': return b.fetchSlurry(cmd.farmId, t);
      case 'spreadGaerrest': return b.spreadGaerrest(cmd.leaseId, t);
      case 'sellGaerrest': return b.sellGaerrest(cmd.m3, t);
      case 'biogasUpgrade': return b.biogasUpgrade(cmd.upgrade, t);
      case 'compactSilo': {
        const p = b.biogas;
        if (!p || !(p.siloBacklogT ?? 0)) return 'Nichts festzufahren';
        const m = this.company.machines.find((x) => x.id === cmd.machineId && x.type === 'radlader');
        const unit = m ? this.vehicles.find((v) => v.owner === 'player' && v.machineId === m.id) : undefined;
        const d = this.company.drivers.find((x) => x.id === cmd.driverId);
        if (!m || !unit || unit.task) return 'Radlader nicht frei';
        if (!d || (d.skills.radlader ?? 0) < 1) return 'Fahrer braucht Radlader-Erfahrung';
        if (this.driverBusy(d.id) || this.driverBlocked(d.id)) return `${this.driverName(d.id)} ist nicht frei`;
        const node = (this.company.sites ?? []).find((x) => x.id === p.siteId)?.node ?? this.homeNode;
        // Walzleistung ≈ Betriebsgewicht × 4 t/h
        const minutes = Math.ceil(((p.siloBacklogT ?? 0) / ((m.weightT ?? 12) * 4)) * 60);
        unit.task = { kind: 'compact', driverId: d.id, phase: 'to', node, minutes };
        this.driveTo(unit, node);
        b.version++;
        return `Radlader fährt das Silo fest (etwa ${Math.round(minutes / 60)} h)`;
      }
      case 'buySite': {
        const o = SITE_OFFERS.find((x) => x.key === cmd.offerKey);
        if (!o) return 'Angebot unbekannt';
        const [x, y] = project(this.graph, o.lonLat[0], o.lonLat[1]);
        return b.buySite(cmd.offerKey, t, nearestNode(this.graph, x, y));
      }
      case 'sellSite': {
        if (this.company.machines.some((m) => m.siteId === cmd.siteId && this.machineBusy(m.id))) return 'Maschinen des Standorts sind im Einsatz';
        const r = b.sellSite(cmd.siteId, t);
        // Fahrzeuge des aufgegebenen Standorts fahren nicht automatisch heim: sie gelten ab jetzt als am Stammhof
        return r;
      }
      case 'transfer':
        return this.transferMachine(cmd.machineId, cmd.siteId, cmd.driverId, cmd.implementId);
      case 'swapDriver':
        return this.swapDriver(cmd.vehicle, cmd.driverId, cmd.chauffeurId);
      case 'vacation':
        return b.grantVacation(cmd.employeeId, cmd.fromDay, cmd.days, t);
      case 'staffAnswer':
        return b.answerRequest(cmd.requestId, cmd.accept, t);
      case 'setWage':
        return b.setWage(cmd.employeeId, cmd.wage, t);
      case 'fire': {
        const e = this.company.drivers.find((d) => d.id === cmd.employeeId);
        if (e?.kind === 'saison' && this.driverBusy(cmd.employeeId)) return 'Mitarbeiter ist gerade unterwegs – erst zurückrufen';
        const r = b.fire(cmd.employeeId, t);
        if (r === 'entlassen') {
          const before = this.queue.length;
          this.queue = this.queue.filter((q) => q.driverId !== cmd.employeeId);
          if (this.queue.length !== before) b.warn(t, 'Geplante Aufgaben des Mitarbeiters wurden gestrichen.');
        }
        return r;
      }
      case 'visit':
      case 'startJob':
        return this.startOrQueue(cmd);
      case 'plan':
        return this.planJob(cmd);
      case 'queueEdit': {
        const q = this.queue.find((x) => x.id === cmd.queueId);
        if (!q) return 'Nicht mehr geplant';
        if (q.cmd.kind === 'visit') {
          if (cmd.driverId !== undefined && cmd.driverId !== 1) return 'Besuche macht der Chef';
          this.queue.splice(this.queue.indexOf(q), 1);
          if (cmd.notBefore === null) delete q.notBefore;
          else if (cmd.notBefore !== undefined) q.notBefore = cmd.notBefore > t ? cmd.notBefore : undefined;
          this.insertQueue(q);
          b.version++;
          return 'Besuch umgeplant';
        }
        const c = q.cmd;
        let nb: number | undefined = q.notBefore;
        if (cmd.notBefore === null) nb = undefined;
        else if (cmd.notBefore !== undefined) nb = cmd.notBefore;
        return this.planJob({
          kind: 'plan', orderId: c.orderId, driverId: cmd.driverId ?? q.driverId,
          tractorId: cmd.tractorId ?? c.tractorId, implementId: cmd.implementId ?? c.implementId, notBefore: nb,
        });
      }
      case 'dequeue': {
        const i = this.queue.findIndex((q) => q.id === cmd.queueId);
        if (i < 0) return 'Nicht mehr geplant';
        const [q] = this.queue.splice(i, 1);
        b.version++;
        return `Aus dem Plan genommen: ${q.label}`;
      }
      case 'queueMove': {
        // innerhalb der Warteschlange desselben Fahrers tauschen
        const i = this.queue.findIndex((q) => q.id === cmd.queueId);
        if (i < 0) return 'Nicht verschiebbar';
        const d = this.queue[i].driverId;
        let j = i + cmd.dir;
        while (j >= 0 && j < this.queue.length && this.queue[j].driverId !== d) j += cmd.dir;
        if (j < 0 || j >= this.queue.length) return 'Nicht verschiebbar';
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
          if (o && o.status === 'läuft' && this.orderUnits(o.id).filter((x) => x !== v).length === 0) b.orderInterrupted(o, t);
          if (task.phase === 'prep') { v.task = undefined; v.state = VehicleState.Waiting; b.version++; return 'Abgebrochen, Schlepper bleibt am Hof'; }
          if (task.phase === 'back' || task.phase === 'unhitch') return 'Fahrzeug ist schon auf dem Rückweg';
          task.phase = 'back';
        } else if (task.kind === 'transfer') {
          // Überführung abbrechen: zurück zum bisherigen Standort
          const m = this.company.machines.find((x) => x.id === v.machineId);
          task.siteId = m?.siteId ?? 1;
          task.implementId = undefined;
          this.driveFromHere(v, this.homeOf(v));
          b.version++;
          return 'Überführung abgebrochen, fährt zurück';
        } else {
          if (task.phase === 'back') return 'Fahrzeug ist schon auf dem Rückweg';
          if (task.kind === 'haul' || task.kind === 'silo') {
            // Kette läuft mit den übrigen Wagen weiter; angehängter Wagen wird abgekoppelt
            const h = this.vehicles[task.harvester]?.task;
            if (h?.kind === 'job' && h.chop?.attached?.veh === v.id) h.chop.attached = null;
          }
          if (task.kind === 'feeder') {
            // Ausbringfass macht ohne Zubringer weiter (fährt selbst zum Lager)
            const sv = this.vehicles[task.spreader];
            if (sv?.task?.kind === 'job' && sv.task.slurry) {
              sv.task.slurry.feeder = undefined;
              if (sv.task.phase === 'waitFeed') { sv.task.phase = 'toFill'; this.driveTo(sv, sv.task.slurry.source); }
            }
          }
          if (task.kind === 'repair') {
            const m = this.company.machines.find((x) => x.id === task.machineId);
            if (m?.repair && task.phase !== 'at') { m.repair.state = 'wartet'; m.repair.mechanicId = undefined; m.repair.since = t; m.downReason = 'Panne – Reparatur offen'; }
          }
          task.phase = 'back';
        }
        this.driveFromHere(v, this.homeOf(v));
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
      driverMinutes: { ...this.driverMinutes },
      driverSurcharge: { ...this.driverSurcharge },
      lastWork: { ...this.lastWork },
      nextRouteId: this.nextRouteId,
      rng: this.rng.getState(),
      company: structuredClone(this.company),
      business: structuredClone(this.business.serialize()),
      weather: structuredClone(this.weather.serialize()),
      farms: this.farms ? this.farms.farms.map((f) => [f.known ? 1 : 0, f.satisfaction, f.rivalUntil, f.orderCount ?? 0] as [number, number, number, number]) : [],
      vehicles: this.vehicles.map((v) => ({
        state: v.state, node: v.node, route: route(v.route), seg: v.seg, segOff: v.segOff, dist: v.dist,
        waitMin: v.waitMin, next: v.next, fieldNode: v.fieldNode, trips: v.trips,
        task: v.task ? structuredClone(v.task) : null, restUntil: v.restUntil, chargedRoute: v.chargedRoute,
        handoverUntil: v.handoverUntil,
      })),
      queue: structuredClone(this.queue),
      nextQueueId: this.nextQueueId,
    };
  }

  /** Spielstand laden (Simulation muss mit denselben Kartendaten, Seed und Fahrzeugzahl erzeugt sein) */
  restore(s: SaveState): void {
    if (s.version !== SAVE_VERSION) throw new Error(`Spielstand-Version ${s.version} wird nicht unterstützt`);
    // Spielerfahrzeuge aus dem gespeicherten Fuhrpark neu aufbauen
    this.vehicles.length = this.testCount;
    for (const m of s.company.machines) this.addPlayerVehicle(m, false);
    if (s.vehicles.length !== this.vehicles.length) throw new Error('Spielstand passt nicht zu den Fahrzeugen');
    this.time = s.time;
    this.driverMinutes = s.driverMinutes ? { ...s.driverMinutes } : { 1: s.chefMinutes };
    this.driverSurcharge = { ...(s.driverSurcharge ?? {}) };
    this.lastWork = { ...(s.lastWork ?? {}) };
    this.nextRouteId = s.nextRouteId;
    this.rng.setState(s.rng);
    Object.assign(this.company, structuredClone(s.company));
    normalizeDrivers(this.company);
    this.ensureSites();
    this.business.restore(s.business);
    if (s.weather) this.weather.restore(s.weather);
    if (this.farms) s.farms.forEach(([known, sat, rival, count], i) => {
      const f = this.farms!.farms[i];
      if (f) { f.known = known === 1; f.satisfaction = sat; f.rivalUntil = rival ?? 0; f.orderCount = count ?? 0; }
    });
    this.pending = [];
    this.queue = structuredClone(s.queue ?? []).map((q) => ({ ...q, driverId: q.driverId ?? 1 }));
    this.nextQueueId = s.nextQueueId ?? 1;
    s.vehicles.forEach((d, i) => {
      const v = this.vehicles[i];
      Object.assign(v, {
        state: d.state, node: d.node, seg: d.seg, segOff: d.segOff, dist: d.dist, waitMin: d.waitMin,
        next: d.next, fieldNode: d.fieldNode, trips: d.trips, task: d.task ? structuredClone(d.task) : undefined,
        restUntil: d.restUntil, chargedRoute: d.chargedRoute, handoverUntil: d.handoverUntil,
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
    for (const d of this.company.drivers) mix(this.minutesOf(d.id));
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
    if (t && this.business.absence(t.driverId, this.time)) return; // Fahrer krank: Gespann wartet
    if ((v.handoverUntil ?? 0) > this.time) return; // Fahrerwechsel
    if (t?.kind === 'job' && (t.phase === 'setup' || t.phase === 'work') && this.weatherFor(t.orderId)) return; // Wetter: Feldarbeit ruht
    if (t?.kind === 'job' && (t.phase === 'to' || t.phase === 'setup' || t.phase === 'work') && this.minutesOf(t.driverId) >= CHEF_MAX_MINUTES) {
      v.restUntil = Math.max(this.time + (1440 - (this.time % 1440)), this.time + 11 * 60);
      this.business.warn(this.time, `${v.name}: Feierabend – Höchstarbeitszeit (${this.driverName(t.driverId)}) erreicht, weiter morgen um 06:00.`);
      return;
    }
    if (t?.kind === 'job' && (t.phase === 'to' || t.phase === 'work' || t.phase === 'back')) {
      // Panne: Gespann steht, bis der Händler-Service repariert hat (MZ-07)
      const machines = [this.company.machines.find((m) => m.id === v.machineId), this.company.machines.find((m) => m.id === t.implementId)];
      let down = false;
      for (const m of machines) {
        if (!m) continue;
        if ((m.downUntil ?? 0) > this.time) { down = true; m.downMinutes = (m.downMinutes ?? 0) + 1; continue; }
        if (this.business.rollBreakdown(m)) {
          const o = this.business.orders.find((x) => x.id === t.orderId);
          const where = t.phase === 'work' && o ? `auf dem Feld (${this.business.farmName(o.farmId)})` : 'unterwegs';
          this.business.breakdown(m, this.time, this.homeLonLat, where);
          down = true;
        }
      }
      if (down) return;
    }
    if (t?.kind === 'truck' && (t.phase === 'toLoad' || t.phase === 'toUnload') && this.minutesOf(t.driverId) >= CHEF_MAX_MINUTES) {
      v.restUntil = Math.max(this.time + (1440 - (this.time % 1440)), this.time + 11 * 60);
      this.business.warn(this.time, `${v.name}: Höchstarbeitszeit erreicht – Lkw steht über Nacht, weiter morgen um 06:00.`);
      return;
    }
    if (t?.kind === 'feeder' && t.phase === 'wait') { this.feederWait(v); return; }
    if (t?.kind === 'haul' && (t.phase === 'wait' || t.phase === 'load')) return; // Häcksler steuert
    if (t?.kind === 'haul' && t.phase === 'waitSilo') { this.haulAtSilo(v); return; }
    if (t?.kind === 'silo' && t.phase === 'work') { this.siloWork(v); return; }
    if (t?.kind === 'job' && t.chop && t.phase === 'work') { this.chopTick(v); return; }
    if (t?.kind === 'job' && t.phase === 'waitFeed') return; // Zubringer kommt
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
    if (t.kind === 'repair') {
      if (t.phase === 'fetch') { t.phase = 'pickup'; v.state = VehicleState.Waiting; v.waitMin = 15; }
      else if (t.phase === 'to') {
        const target = this.vehicleOfMachine(t.machineId);
        const [cx, cy] = this.position(v.id);
        const [px, py] = target ? this.position(target.id) : [cx, cy];
        if ((cx - px) * (cx - px) + (cy - py) * (cy - py) > 1500 * 1500 && t.tries < 3) { t.tries++; this.driveRepairVan(v); return; }
        const m = this.company.machines.find((x) => x.id === t.machineId);
        const skill = this.company.drivers.find((d) => d.id === t.driverId)?.skills.werkstatt ?? 2;
        t.phase = 'at';
        v.state = VehicleState.Waiting;
        v.waitMin = m ? this.business.ownRepairMinutes(m, skill) : 60;
        if (m) m.downReason = `Panne – ${this.driverName(t.driverId)} repariert`;
      } else { v.task = undefined; v.state = VehicleState.Waiting; }
      b.version++;
      return;
    }
    if (t.kind === 'shuttle') {
      if (t.phase === 'to') this.shuttleArrive(v);
      else { v.task = undefined; v.state = VehicleState.Waiting; b.version++; }
      return;
    }
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
    if (t.kind === 'compact') {
      if (t.phase === 'to') { t.phase = 'work'; v.state = VehicleState.Waiting; v.waitMin = t.minutes; }
      else { v.task = undefined; v.state = VehicleState.Waiting; }
      b.version++;
      return;
    }
    if (t.kind === 'truck') {
      // Lenkzeit: Fahrminuten seit der letzten Pause
      const r = v.route;
      if (r && r.kind === 'road') t.driveMin += r.duration / 60;
      v.state = VehicleState.Waiting;
      const pause = t.driveMin >= DRIVE_BREAK_AFTER_MIN ? DRIVE_BREAK_MIN : 0;
      if (pause) { t.driveMin = 0; b.info(this.time, `${v.name}: 45 Minuten Lenkzeitpause (${this.driverName(t.driverId)}).`); }
      if (t.phase === 'toLoad') { t.phase = 'load'; v.waitMin = t.loadMin + pause; }
      else if (t.phase === 'toUnload') { t.phase = 'unload'; v.waitMin = t.unloadMin + pause; }
      else if (t.phase === 'back') {
        const o = b.orders.find((x) => x.id === t.orderId);
        if (o && o.status !== 'fertig') {
          // Feierabend am Hof, morgen weiter
          t.phase = 'night';
          v.restUntil = Math.max(this.time + (1440 - (this.time % 1440)), this.time + 11 * 60);
          v.waitMin = 1;
        } else { v.task = undefined; }
      }
      b.version++;
      return;
    }
    if (t.kind === 'transfer') {
      const m = this.company.machines.find((x) => x.id === v.machineId);
      if (m) m.siteId = t.siteId === 1 ? undefined : t.siteId;
      const imp = t.implementId !== undefined ? this.company.machines.find((x) => x.id === t.implementId) : undefined;
      if (imp) imp.siteId = t.siteId === 1 ? undefined : t.siteId;
      v.task = undefined;
      v.state = VehicleState.Waiting;
      const st = (this.company.sites ?? []).find((x) => x.id === t.siteId);
      b.info(this.time, `${v.name} steht jetzt in ${st?.name ?? 'Standort'}.`);
      return;
    }
    if (t.kind === 'haul') {
      if (t.phase === 'toField') { t.phase = 'wait'; v.state = VehicleState.Waiting; }
      else if (t.phase === 'toSilo') { t.phase = 'waitSilo'; v.state = VehicleState.Waiting; }
      else if (t.phase === 'back') { t.phase = 'unhitch'; v.state = VehicleState.Waiting; v.waitMin = RUEST_ABBAU_MIN; }
      b.version++;
      return;
    }
    if (t.kind === 'silo') {
      if (t.phase === 'to') { t.phase = 'work'; v.state = VehicleState.Waiting; }
      else { v.task = undefined; v.state = VehicleState.Waiting; }
      b.version++;
      return;
    }
    if (t.kind === 'feeder') {
      if (t.phase === 'toFill') { t.phase = 'fill'; v.state = VehicleState.Waiting; v.waitMin = Math.ceil(t.cap / SLURRY_FILL_M3_MIN); }
      else if (t.phase === 'toField') { t.phase = 'wait'; v.state = VehicleState.Waiting; }
      else if (t.phase === 'back') { t.phase = 'unhitch'; v.state = VehicleState.Waiting; v.waitMin = RUEST_ABBAU_MIN; }
      b.version++;
      return;
    }
    // Auftrag
    const o = b.orders.find((x) => x.id === t.orderId);
    if (t.phase === 'toFill') {
      t.phase = 'fill';
      v.state = VehicleState.Waiting;
      v.waitMin = Math.ceil((t.slurry?.cap ?? 15) / SLURRY_FILL_M3_MIN);
      b.version++;
    } else if (t.phase === 'to' && t.slurry && t.slurry.feeder !== undefined && t.slurry.load < 0.5) {
      // Kette: am Feldrand auf den Zubringer warten
      t.phase = 'waitFeed';
      v.state = VehicleState.Waiting;
      b.version++;
    } else if (t.phase === 'to' && t.slurry && t.slurry.progress > 0) {
      // zurück am angefangenen Feld: ohne Rüstzeit weiter
      this.startSlurrySlice(v, t);
    } else if (t.phase === 'to') {
      // am Feld: Gerät ausklappen und einstellen
      t.phase = 'setup';
      v.state = VehicleState.Waiting;
      v.waitMin = RUEST_FELD_MIN;
      b.version++;
    } else if (t.phase === 'work' && t.slurry) {
      this.slurrySliceDone(v, t, o);
    } else if (t.phase === 'work' && t.chop) {
      this.chopFieldDone(v, t, o);
    } else if (t.phase === 'work') {
      const fi = t.queue[t.current];
      const part = t.share ? t.share[1] - t.share[0] : 1;
      if (o) {
        b.fieldPartDone(o, fi, part, this.time);
        b.chargeDiesel(this.fields!.areaHa[fi] * part * t.dieselLHa, o, this.time);
      }
      this.addMachineHours(v, t, part);
      b.useWearParts(this.fields!.areaHa[fi] * part * WEAR_GRUBBER_EUR_HA);
      b.addExperience(t.driverId, o ? SERVICE_SKILL[o.service] : 'boden', Math.round((this.fields!.areaHa[fi] * part / t.haPerHour) * 60), this.time);
      t.share = undefined;
      t.current++;
      this.skipDone(t, o);
      if (t.current < t.queue.length) {
        t.phase = 'to';
        this.driveTo(v, this.fields!.access[t.queue[t.current]]);
      } else {
        t.phase = 'back';
        this.driveTo(v, this.homeOf(v));
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
    if (t.kind === 'repair') {
      if (t.phase === 'pickup') { t.phase = 'to'; this.driveRepairVan(v); }
      else if (t.phase === 'at') {
        const m = this.company.machines.find((x) => x.id === t.machineId);
        if (m) this.business.finishOwnRepair(m, this.time, this.driverName(t.driverId));
        t.phase = 'back';
        this.driveTo(v, this.homeOf(v));
      }
      this.business.version++;
      return;
    }
    if (t.kind === 'shuttle' && t.phase === 'at') {
      const target = this.vehicles[t.vehicle];
      t.phase = 'back'; // abgelöster Fahrer fährt mit zurück
      if (target?.task?.kind === 'job' && !this.driverBusy(t.passengerId)) this.takeOverJob(target, t.passengerId);
      this.driveTo(v, this.homeOf(v));
      this.business.version++;
      return;
    }
    if (t.kind === 'truck') { this.truckWaitDone(v, t); return; }
    if (t.kind === 'compact' && t.phase === 'work') {
      this.business.compactDone(this.time, this.driverName(t.driverId));
      t.phase = 'back';
      this.driveTo(v, this.homeOf(v));
      return;
    }
    if (t.kind === 'visit' && t.phase === 'at') {
      this.business.onVisit(t.farmId, this.time);
      t.phase = 'back';
      this.driveTo(v, this.homeOf(v));
    } else if (t.kind === 'haul') {
      if (t.phase === 'prep') { t.phase = 'toField'; this.driveTo(v, this.harvesterNode(t)); }
      else if (t.phase === 'unload') {
        const o = this.business.orders.find((x) => x.id === t.orderId);
        if (o) o.doneT = Math.round(((o.doneT ?? 0) + t.load) * 10) / 10;
        t.load = 0;
        const h = this.vehicles[t.harvester]?.task;
        if (h?.kind === 'job' && h.orderId === t.orderId && h.phase !== 'back' && h.phase !== 'unhitch') { t.phase = 'toField'; this.driveTo(v, this.harvesterNode(t)); }
        else { t.phase = 'back'; this.driveTo(v, this.homeOf(v)); }
      } else if (t.phase === 'unhitch') v.task = undefined;
      this.business.version++;
    } else if (t.kind === 'feeder') {
      if (t.phase === 'prep') { t.phase = 'toFill'; this.driveTo(v, t.source); }
      else if (t.phase === 'fill') {
        t.load = Math.min(t.cap, this.slurryStillNeeded(t.orderId, v.id));
        t.phase = 'toField';
        this.driveTo(v, this.spreaderNode(t));
      } else if (t.phase === 'transfer') { t.phase = 'wait'; v.state = VehicleState.Waiting; }
      else if (t.phase === 'unhitch') v.task = undefined;
      this.business.version++;
    } else if (t.kind === 'job') {
      if (t.phase === 'prep' && t.slurry) {
        // ohne Zubringer zuerst ans Güllelager, mit Zubringer gleich zum Feld
        if (t.slurry.feeder !== undefined) { t.phase = 'to'; this.driveTo(v, this.fields!.access[t.queue[0]]); }
        else { t.phase = 'toFill'; this.driveTo(v, t.slurry.source); }
      } else if (t.phase === 'fill' && t.slurry) {
        const o = this.business.orders.find((x) => x.id === t.orderId);
        const left = o ? o.areaHa * (o.gabe ?? 0) - (o.doneM3 ?? 0) : t.slurry.cap;
        t.slurry.load = Math.max(0, Math.min(t.slurry.cap, left));
        t.phase = 'to';
        this.driveTo(v, this.fields!.access[t.queue[t.current]]);
      } else if (t.phase === 'feed' && t.slurry) {
        this.startSlurrySlice(v, t);
      } else if (t.phase === 'setup' && t.slurry) {
        this.startSlurrySlice(v, t);
      } else if (t.phase === 'prep') {
        t.phase = 'to';
        this.driveTo(v, this.fields!.access[t.queue[0]]);
      } else if (t.phase === 'setup') {
        const fi = t.queue[t.current];
        v.fieldNode = fi;
        // feuchter Boden: etwas langsamer (AK-07)
        const wf = this.weather.speedFactor(this.time);
        const full = this.buildRealFieldRoute(v.node, fi, t.width, t.haPerHour * wf, t.workKmh * wf);
        this.startRoute(v, t.share ? this.sliceFieldRoute(full, t.share[0], t.share[1]) : full);
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
    const lPerKm = v.profile === 'car' ? DIESEL_CAR_L_KM : v.profile === 'truck' ? DIESEL_TRUCK_L_KM : DIESEL_TRACTOR_ROAD_L_KM;
    const t = v.task;
    const o = t?.kind === 'job' || t?.kind === 'truck' ? this.business.orders.find((x) => x.id === t.orderId) : undefined;
    this.business.chargeDiesel(km * lPerKm, o, this.time);
    if (v.profile === 'truck') {
      // Maut auf Bundesstraßen und Autobahn: Abschnitte ab 65 km/h
      let tollM = 0;
      const end = partial ? v.dist : r.total;
      for (let i = 0; i < r.speed.length && r.cum[i] < end; i++) if (r.speed[i] >= 65 / 3.6) tollM += Math.min(r.cum[i + 1], end) - r.cum[i];
      const toll = Math.round((tollM / 1000) * TOLL_EUR_KM * 100) / 100;
      if (toll > 0) this.business.chargeToll(toll, o, this.time);
    }
    // Betriebsstunden auch für Straßenfahrten (Schlepper)
    if (v.profile === 'tractor') {
      const m = this.company.machines.find((x) => x.id === v.machineId);
      const hours = (partial ? v.dist / Math.max(1, r.total) : 1) * r.duration / 3600;
      if (m) m.hours = Math.round((m.hours + hours) * 10) / 10;
      if (o) o.tractorHours = Math.round((o.tractorHours + hours) * 100) / 100;
    }
  }

  /** Betriebsstunden für Schlepper und Gerät nach erledigtem Feld */
  private addMachineHours(v: Vehicle, t: Extract<PlayerTask, { kind: 'job' }>, part = 1) {
    const fi = t.queue[t.current];
    const hours = (this.fields!.areaHa[fi] * part) / t.haPerHour;
    const o = this.business.orders.find((x) => x.id === t.orderId);
    if (o) o.tractorHours = Math.round((o.tractorHours + hours) * 100) / 100;
    for (const id of [v.machineId, t.implementId]) {
      const m = this.company.machines.find((x) => x.id === id);
      if (!m) continue;
      m.hours = Math.round((m.hours + hours) * 10) / 10;
      this.business.wear(m, hours);
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
  // ---------- Häckselkette ----------

  private harvesterNode(t: { harvester: number; silo: number }): number {
    const h = this.vehicles[t.harvester]?.task;
    if (h?.kind !== 'job') return t.silo;
    return this.fields!.access[h.queue[Math.min(h.current, h.queue.length - 1)]];
  }

  /**
   * Häcksler auf dem Feld (jede Minute): arbeitet nur mit einem Abfahrer nebenher. Füllt den Wagen
   * mit Flächenleistung × Ertrag; ein voller Wagen fährt zum Silo, der nächste übernimmt.
   */
  private chopTick(v: Vehicle) {
    const t = v.task;
    if (t?.kind !== 'job' || !t.chop) return;
    const c = t.chop;
    // Silo: Radlader bzw. Walze verteilt laufend
    c.siloBacklog = Math.max(0, c.siloBacklog - c.siloTph / 60);
    if (c.hiredRoller) c.rollerMinutes++;
    if (c.pauseUntil !== undefined && this.time < c.pauseUntil) return; // bunkert am Vorgewende ab
    if (!c.attached && !c.miete) {
      const node = this.fields!.access[t.queue[t.current]];
      const wagon = this.vehicles.find((x) => x.task?.kind === 'haul' && x.task.harvester === v.id && x.task.phase === 'wait' && x.node === node);
      if (wagon && wagon.task?.kind === 'haul') {
        wagon.task.phase = 'load';
        c.attached = { veh: wagon.id, load: wagon.task.load, cap: wagon.task.cap };
      } else {
        const i = c.virtual.findIndex((at) => at <= this.time);
        if (i >= 0) { c.virtual[i] = Number.MAX_SAFE_INTEGER; c.attached = { veh: -1 - i, load: 0, cap: c.virtualCap }; }
      }
      if (c.attached) {
        // Korntank zuerst überladen
        if (c.bunker && c.bunker.load > 0) { c.attached.load += c.bunker.load; c.bunker.load = 0; }
        this.business.version++;
      } else if (!c.bunker || c.bunker.load >= c.bunker.cap) return; // ohne Abfahrer steht der Häcksler, Drescher bei vollem Tank
    }
    if (c.miete && c.bunker && c.bunker.load >= c.bunker.cap) {
      // Rübenroder: Bunker in die Feldrandmiete (Fahrt zum Vorgewende und Abbunkern ≈ 4 min)
      this.dumpBunker(v, c);
      c.pauseUntil = this.time + 4;
      return;
    }
    // fahren (Feldroute läuft nur mit Abfahrer weiter)
    const before = v.dist;
    const budget = this.advance(v, STEP_SECONDS);
    const fi = t.queue[t.current];
    const area = this.fields!.areaHa[fi] * (t.share ? t.share[1] - t.share[0] : 1);
    const r = v.route!;
    if (t.stopAt !== undefined && v.dist >= t.stopAt) { t.stopped = true; this.playerArrive(v); return; }
    const moved = Math.max(0, v.dist - before);
    const ha = r.total > 0 ? (moved / r.total) * area : 0;
    c.fieldHa += ha;
    if (!c.attached) { c.bunker!.load += ha * c.yieldT; if (budget > 0 || v.dist >= r.total) this.playerArrive(v); return; }
    c.attached.load += ha * c.yieldT;
    // Abfahrer fährt sichtbar nebenher (gleiche Position)
    if (c.attached.veh >= 0) {
      const w = this.vehicles[c.attached.veh];
      w.route = v.route; w.dist = v.dist; w.seg = v.seg; w.segOff = v.segOff; w.state = VehicleState.Working;
      if (w.task?.kind === 'haul') w.task.load = c.attached.load;
    }
    if (c.attached.load >= c.attached.cap) this.detachWagon(v, c);
    if (budget > 0 || v.dist >= r.total) this.playerArrive(v);
  }

  /** Noch nicht geladene Menge eines Transportauftrags (t) */
  private truckLeft(o: Order, exceptVehicle = -1): number {
    let onBoard = 0;
    for (const v of this.vehicles) if (v.id !== exceptVehicle && v.task?.kind === 'truck' && v.task.orderId === o.id) onBoard += v.task.load;
    return Math.max(0, o.areaHa * (o.tPerHa ?? 0) - (o.doneT ?? 0) - onBoard);
  }

  /** Lkw: Laden, Abladen, nächste Runde oder Feierabend */
  private truckWaitDone(v: Vehicle, t: Extract<PlayerTask, { kind: 'truck' }>) {
    const b = this.business;
    const o = b.orders.find((x) => x.id === t.orderId);
    if (!o) { v.task = undefined; return; }
    if (t.phase === 'load') {
      t.load = Math.round(Math.min(t.cap, this.truckLeft(o, v.id)) * 10) / 10;
      t.phase = 'toUnload';
      this.driveTo(v, t.to);
    } else if (t.phase === 'unload') {
      o.doneT = Math.round(((o.doneT ?? 0) + t.load) * 10) / 10;
      t.load = 0;
      const left = this.truckLeft(o, v.id);
      if (left < 0.5) {
        // fertig: alle Felder als erledigt melden (Rechnung)
        for (const f of o.fields) if (!o.doneFields.includes(f)) b.fieldDone(o, f, this.time);
        t.phase = 'back';
        this.driveTo(v, this.homeOf(v));
      } else {
        // reicht die Arbeitszeit noch für eine Runde? (Hin- und Rückweg ≈ doppelte letzte Fahrt + Laden/Abladen)
        const cycle = 2 * ((v.route?.duration ?? 1800) / 60) + t.loadMin + t.unloadMin;
        if (this.minutesOf(t.driverId) + cycle > CHEF_MAX_MINUTES) { t.phase = 'back'; this.driveTo(v, this.homeOf(v)); }
        else { t.phase = 'toLoad'; this.driveTo(v, t.from); }
      }
    } else if (t.phase === 'night') {
      t.driveMin = 0;
      t.phase = 'toLoad';
      this.driveTo(v, t.from);
    }
    b.version++;
  }

  /** Bunker leeren (Miete am Feldrand bzw. Anhänger am Feldrand): zählt als abgefahren */
  private dumpBunker(v: Vehicle, c: ChopState) {
    if (!c.bunker || c.bunker.load <= 0) return;
    const o = v.task?.kind === 'job' ? this.business.orders.find((x) => x.id === (v.task as { orderId: number }).orderId) : undefined;
    if (o) o.doneT = Math.round(((o.doneT ?? 0) + c.bunker.load) * 10) / 10;
    c.bunker.load = 0;
    this.business.version++;
  }

  /** Voller Wagen: zum Silo bzw. Kundenwagen auf den Umlauf schicken */
  private detachWagon(v: Vehicle, c: ChopState) {
    const a = c.attached;
    if (!a) return;
    c.attached = null;
    if (a.veh < 0) {
      // Kundenwagen: am Silo abgeladen, dann zurück
      const o = v.task?.kind === 'job' ? this.business.orders.find((x) => x.id === (v.task as { orderId: number }).orderId) : undefined;
      if (o) o.doneT = Math.round(((o.doneT ?? 0) + a.load) * 10) / 10;
      c.virtual[-1 - a.veh] = this.time + c.virtualCycle;
      c.siloBacklog += 0; // Kunde walzt selbst
      return;
    }
    const w = this.vehicles[a.veh];
    if (w.task?.kind !== 'haul') return;
    w.task.load = a.load;
    if (a.load < 0.5) { w.task.phase = 'wait'; return; }
    w.task.phase = 'toSilo';
    this.driveFromHere(w, w.task.silo);
    this.business.version++;
  }

  /** Feld fertig gehäckselt: nächstes Feld oder Kette beenden */
  private chopFieldDone(v: Vehicle, t: Extract<PlayerTask, { kind: 'job' }>, o: Order | undefined) {
    const b = this.business;
    const c = t.chop!;
    const fi = t.queue[t.current];
    const part = t.share ? t.share[1] - t.share[0] : 1;
    const area = this.fields!.areaHa[fi] * part;
    // Rest (Rundung der Strecke) dem Wagen bzw. dem Bunker zuschlagen
    const rest = Math.max(0, area - c.fieldHa) * c.yieldT;
    if (c.attached) c.attached.load += rest;
    else if (c.bunker) c.bunker.load += rest;
    c.fieldHa = 0;
    // letztes Feld: Bunker am Feldrand leeren (Miete bzw. Anhänger)
    if (t.current + 1 >= t.queue.length || c.miete) this.dumpBunker(v, c);
    if (o) {
      b.fieldPartDone(o, fi, part, this.time);
      b.chargeDiesel(area * t.dieselLHa, o, this.time);
    }
    const stopped = !!t.stopped;
    t.share = undefined; t.stopAt = undefined; t.stopped = undefined;
    // Betriebsstunden (Häcksler ist Fahrzeug und Gerät zugleich: nur einmal zählen)
    const hours = area / t.haPerHour;
    const hm = this.company.machines.find((x) => x.id === v.machineId);
    if (hm) { hm.hours = Math.round((hm.hours + hours) * 10) / 10; b.wear(hm, hours); }
    // gezogene Erntemaschine (Kartoffelroder): Gerät zählt extra
    const im = t.implementId !== v.machineId ? this.company.machines.find((x) => x.id === t.implementId) : undefined;
    if (im) { im.hours = Math.round((im.hours + hours) * 10) / 10; b.wear(im, hours); }
    if (o) o.tractorHours = Math.round((o.tractorHours + hours) * 100) / 100;
    b.addExperience(t.driverId, o ? SERVICE_SKILL[o.service] : 'haecksler', Math.round((area / t.haPerHour) * 60), this.time);
    // angehängten Wagen abgeben (zum Silo, wenn etwas drin ist)
    this.detachWagon(v, c);
    t.current++;
    this.skipDone(t, o);
    if (t.current < t.queue.length) {
      t.phase = 'to';
      if (stopped) this.driveFromHere(v, this.fields!.access[t.queue[t.current]]);
      else this.driveTo(v, this.fields!.access[t.queue[t.current]]);
      // wartende Wagen folgen zum nächsten Feld
      for (const w of this.vehicles) if (w.task?.kind === 'haul' && w.task.harvester === v.id && w.task.phase === 'wait') { w.task.phase = 'toField'; this.driveTo(w, this.fields!.access[t.queue[t.current]]); }
    } else {
      t.phase = 'back';
      if (stopped) this.driveFromHere(v, this.homeOf(v)); else this.driveTo(v, this.homeOf(v));
      if (c.hiredRoller && o) {
        const cost = Math.round((c.rollerMinutes / 60) * HIRED_ROLLER_EUR_H);
        b.bookExternal(this.time, `Fremdwalze am Silo (${Math.round(c.rollerMinutes / 60)} h)`, cost, o);
      }
      for (const w of this.vehicles) {
        if (w.task?.kind === 'haul' && w.task.harvester === v.id && w.task.phase === 'wait') {
          if (w.task.load > 0.5) { w.task.phase = 'toSilo'; this.driveTo(w, w.task.silo); }
          else { w.task.phase = 'back'; this.driveTo(w, this.homeOf(w)); }
        }
      }
    }
  }

  /** Abfahrer am Silo: abkippen, wenn die Walze nachkommt (Rückstau unter 20 t) */
  private haulAtSilo(v: Vehicle) {
    const t = v.task;
    if (t?.kind !== 'haul') return;
    const h = this.vehicles[t.harvester]?.task;
    const c = h?.kind === 'job' ? h.chop : undefined;
    if (c && c.siloBacklog > 20) return; // wartet am Silo
    if (c) c.siloBacklog += t.load;
    t.phase = 'unload';
    v.state = VehicleState.Waiting;
    v.waitMin = 5;
    this.business.version++;
  }

  /** Radlader am Silo: bleibt, bis Häcksler fertig und alle Wagen abgekippt haben */
  private siloWork(v: Vehicle) {
    const t = v.task;
    if (t?.kind !== 'silo') return;
    const h = this.vehicles[t.harvester]?.task;
    const running = h?.kind === 'job' && h.orderId === t.orderId && h.phase !== 'back' && h.phase !== 'unhitch';
    const wagons = this.vehicles.some((w) => w.task?.kind === 'haul' && w.task.orderId === t.orderId && w.task.phase !== 'back' && w.task.phase !== 'unhitch');
    const backlog = h?.kind === 'job' && h.chop ? h.chop.siloBacklog : 0;
    if (running || wagons || backlog > 0.5) return;
    t.phase = 'back';
    this.driveTo(v, this.homeOf(v));
    this.business.version++;
  }

  // ---------- Gülle: Umlauf und Kette ----------

  /** Noch zu holende Gülle eines Auftrags (abzüglich ausgebrachter Menge und der Ladungen unterwegs) */
  private slurryStillNeeded(orderId: number, exceptVehicle = -1): number {
    const o = this.business.orders.find((x) => x.id === orderId);
    if (!o || !o.gabe) return 0;
    let onBoard = 0;
    for (const v of this.vehicles) {
      if (v.id === exceptVehicle || !v.task) continue;
      if (v.task.kind === 'job' && v.task.orderId === orderId && v.task.slurry) onBoard += v.task.slurry.load;
      if (v.task.kind === 'feeder' && v.task.orderId === orderId) onBoard += v.task.load;
    }
    return Math.max(0, o.areaHa * o.gabe - (o.doneM3 ?? 0) - onBoard);
  }

  /** Feldzugang, an dem das Ausbringfass gerade arbeitet bzw. hinfährt */
  private spreaderNode(t: Extract<PlayerTask, { kind: 'feeder' }>): number {
    const sp = this.vehicles[t.spreader]?.task;
    if (sp?.kind !== 'job') return t.source;
    return this.fields!.access[sp.queue[Math.min(sp.current, sp.queue.length - 1)]];
  }

  /** Zubringer wartet am Feldrand: umfüllen, wenn das Fass leer wartet; sonst nachfahren oder heim */
  private feederWait(v: Vehicle) {
    const t = v.task;
    if (t?.kind !== 'feeder') return;
    const sv = this.vehicles[t.spreader];
    const st = sv?.task;
    if (st?.kind !== 'job' || st.orderId !== t.orderId || !st.slurry) {
      // Auftrag fertig oder abgebrochen: Rest zurück
      t.phase = 'back';
      this.driveTo(v, this.homeOf(v));
      this.business.version++;
      return;
    }
    const node = this.spreaderNode(t);
    if (node !== v.node) { t.phase = 'toField'; this.driveTo(v, node); return; }
    if (t.load < 0.5) {
      if (this.slurryStillNeeded(t.orderId) > 0.5) { t.phase = 'toFill'; this.driveTo(v, t.source); }
      else { t.phase = 'back'; this.driveTo(v, this.homeOf(v)); }
      this.business.version++;
      return;
    }
    if (st.phase !== 'waitFeed' || sv.node !== v.node) return;
    const amount = Math.min(t.load, st.slurry.cap - st.slurry.load);
    const minutes = Math.ceil(amount / SLURRY_TRANSFER_M3_MIN) + 2;
    t.load -= amount;
    st.slurry.load += amount;
    t.phase = 'transfer';
    v.state = VehicleState.Waiting;
    v.waitMin = minutes;
    st.phase = 'feed';
    sv.state = VehicleState.Waiting;
    sv.waitMin = minutes;
    this.business.version++;
  }

  /** Teil des Feldes abfahren, bis das Fass leer ist (bzw. das Feld fertig) */
  private startSlurrySlice(v: Vehicle, t: Extract<PlayerTask, { kind: 'job' }>) {
    const sl = t.slurry!;
    const fi = t.queue[t.current];
    const area = this.fields!.areaHa[fi];
    const frac = Math.min(1 - sl.progress, sl.load / Math.max(0.01, sl.gabe * area));
    sl.frac = frac;
    v.fieldNode = fi;
    const wf = this.weather.speedFactor(this.time);
    const full = this.buildRealFieldRoute(v.node, fi, t.width, t.haPerHour * wf, t.workKmh * wf);
    this.startRoute(v, this.sliceFieldRoute(full, sl.progress, sl.progress + frac));
    t.phase = 'work';
    this.business.version++;
  }

  /** Abschnitt einer Feldroute [f0, f1] der Arbeitsstrecke, mit An- und Rückfahrt zum Feldzugang */
  private sliceFieldRoute(r: RouteGeom, f0: number, f1: number): RouteGeom {
    const n = r.xs.length;
    if (n < 4) return r;
    const w0 = r.cum[1], w1 = r.cum[n - 2];
    const d0 = w0 + (w1 - w0) * Math.max(0, f0), d1 = w0 + (w1 - w0) * Math.min(1, f1);
    const at = (d: number): [number, number, number] => {
      let i = 1;
      while (i < n - 1 && r.cum[i] < d) i++;
      const a = i - 1;
      const L = r.cum[i] - r.cum[a] || 1;
      const k = (d - r.cum[a]) / L;
      return [r.xs[a] + (r.xs[i] - r.xs[a]) * k, r.ys[a] + (r.ys[i] - r.ys[a]) * k, a];
    };
    const drive = FIELD_DRIVE_KMH / 3.6;
    const [x0, y0, a0] = at(d0);
    const [x1, y1, a1] = at(d1);
    const xs = [r.xs[0], x0], ys = [r.ys[0], y0], sp = [drive];
    for (let i = a0 + 1; i <= a1; i++) { xs.push(r.xs[i]); ys.push(r.ys[i]); sp.push(r.speed[i - 1]); }
    xs.push(x1); ys.push(y1); sp.push(r.speed[a1]);
    xs.push(r.xs[n - 1]); ys.push(r.ys[n - 1]); sp.push(drive);
    return this.makeRoute(xs, ys, sp, 'field');
  }

  /** Fass leer bzw. Feld fertig: buchen, dann nachfüllen, nächstes Feld oder heim */
  private slurrySliceDone(v: Vehicle, t: Extract<PlayerTask, { kind: 'job' }>, o: Order | undefined) {
    const b = this.business;
    const sl = t.slurry!;
    const fi = t.queue[t.current];
    const area = this.fields!.areaHa[fi];
    const ha = area * sl.frac;
    const m3 = Math.min(sl.load, ha * sl.gabe);
    sl.load = Math.max(0, sl.load - m3);
    sl.progress = Math.min(1, sl.progress + sl.frac);
    if (o) {
      o.doneM3 = Math.round(((o.doneM3 ?? 0) + m3) * 10) / 10;
      b.chargeDiesel(ha * t.dieselLHa, o, this.time);
    }
    const hours = ha / t.haPerHour;
    if (o) o.tractorHours = Math.round((o.tractorHours + hours) * 100) / 100;
    for (const id of [v.machineId, t.implementId]) {
      const m = this.company.machines.find((x) => x.id === id);
      if (!m) continue;
      m.hours = Math.round((m.hours + hours) * 10) / 10;
      b.wear(m, hours);
    }
    b.addExperience(t.driverId, 'guelle', Math.round(hours * 60), this.time);
    if (sl.progress >= 0.999) {
      if (o) b.fieldDone(o, fi, this.time);
      t.current++;
      sl.progress = 0;
      if (t.current >= t.queue.length) { t.phase = 'back'; this.driveTo(v, this.homeOf(v)); return; }
    }
    const feeder = sl.feeder !== undefined;
    if (sl.load >= 0.5) {
      t.phase = 'to';
      if (sl.progress > 0) this.startSlurrySlice(v, t);
      else this.driveTo(v, this.fields!.access[t.queue[t.current]]);
    } else if (feeder) {
      // am Feldrand auf den Zubringer warten (ggf. erst zum nächsten Feld)
      const node = this.fields!.access[t.queue[t.current]];
      if (node === v.node) { t.phase = 'waitFeed'; v.state = VehicleState.Waiting; }
      else { t.phase = 'to'; this.driveTo(v, node); }
    } else {
      t.phase = 'toFill';
      this.driveTo(v, sl.source);
    }
    b.version++;
  }

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
