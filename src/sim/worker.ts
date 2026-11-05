/// <reference lib="webworker" />
/**
 * Simulations-Worker: führt die Simulation mit festem Zeitschritt aus.
 * 1x = 1 Spielminute pro Sekunde, 10x = 10, 100x = 100 Schritte pro Sekunde.
 * Positionen gehen höchstens 10-mal pro Sekunde als übertragbares Zahlenfeld
 * an die Oberfläche, neue Routen einmalig mit Geometrie.
 */
import { DEALERS } from '../data/catalog';
import { LEASE_BASE_RATE, RATING_SURCHARGE, loanBaseRate } from './finance';
import { CHEF_MAX_MINUTES, Simulation, type RouteGeom } from './engine';
import { parseRoadGraph, unproject, type RoadGraph } from './roadgraph';
import { parseFields } from './fields';
import {
  MAX_SNAPSHOTS_PER_SECOND,
  STEPS_PER_SECOND_AT_1X,
  type BusinessState,
  type FarmSummary,
  type FromWorker,
  type Speed,
  type ToWorker,
  type WireRoute,
} from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let sim: Simulation | null = null;
let graph: RoadGraph | null = null;
let speed: Speed = 0;
let anchorTime = 0; // performance.now() beim letzten Geschwindigkeitswechsel
let anchorSteps = 0; // Schrittzahl bei anchorTime
let lastSend = 0;
let lastSentTime = -1;
let pendingRoutes: WireRoute[] = [];
let sentBusinessVersion = -1;
let sentVehiclesVersion = -1;
let timer: ReturnType<typeof setTimeout> | null = null;

// gleitende Messwerte
let spsWindowStart = 0;
let spsWindowSteps = 0;
let stepsPerSecond = 0;
let msPerStep = 0;

/** Begrenzung pro Takt, damit ein langsamer Rechner nicht in Rückstand-Spiralen gerät */
const MAX_STEPS_PER_TICK = 50;

function post(msg: FromWorker, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

function farmSummaries(): FarmSummary[] {
  if (!sim?.farms || !sim.fields) return [];
  const g = graph!;
  const f = sim.fields;
  const fs = sim.farms;
  return fs.farms.map((farm) => {
    const cropHa = [0, 0, 0, 0, 0, 0, 0];
    for (const i of farm.fields) cropHa[fs.fieldCrop[i]] += f.areaHa[i];
    return {
      id: farm.id,
      name: farm.name,
      home: unproject(g, g.x[farm.homeNode], g.y[farm.homeNode]),
      areaHa: farm.areaHa,
      fieldCount: farm.fields.length,
      livestock: farm.livestock,
      mechanization: farm.mechanization,
      contact: farm.contact,
      known: farm.known,
      satisfaction: farm.satisfaction,
      cropHa: cropHa.map((v) => Math.round(v * 10) / 10),
    };
  });
}

function toWire(r: RouteGeom): WireRoute {
  const g = graph!;
  const coords = new Float64Array(r.xs.length * 2);
  for (let i = 0; i < r.xs.length; i++) {
    const [lon, lat] = unproject(g, r.xs[i], r.ys[i]);
    coords[i * 2] = lon;
    coords[i * 2 + 1] = lat;
  }
  return { id: r.id, kind: r.kind, coords, cum: r.cum.slice() };
}

function sendBusiness(force = false) {
  if (!sim) return;
  const b = sim.business;
  if (!force && b.version === sentBusinessVersion) return;
  sentBusinessVersion = b.version;
  const known: number[] = [];
  const satisfaction: Record<number, number> = {};
  const rivalFarms: number[] = [];
  const trialFarms: number[] = [];
  for (const f of sim.farms?.farms ?? []) {
    if (!f.known) continue;
    known.push(f.id);
    satisfaction[f.id] = f.satisfaction;
    if (b.isRival(f.id, sim.time)) rivalFarms.push(f.id);
    else if (b.isTrial(f.id, sim.time)) trialFarms.push(f.id);
  }
  const state: BusinessState = {
    time: sim.time,
    company: structuredClone(sim.company),
    requests: b.requests.filter((r) => r.status === 'offen' || sim!.time - r.createdAt < 3 * 1440).map((r) => ({ ...r })),
    orders: b.orders.map((o) => ({ ...o, fields: [...o.fields], doneFields: [...o.doneFields] })),
    offers: structuredClone(b.offers),
    units: sim.playerUnits(),
    chefMinutes: sim.chefMinutes,
    chefMaxMinutes: CHEF_MAX_MINUTES,
    dieselTotalL: Math.round(b.dieselTotalL),
    chefBusy: sim.chefBusy,
    queue: sim.queue.map((q) => ({ ...q, cmd: { ...q.cmd } })),
    estimates: sim.planEstimates(),
    driverMinutes: { ...sim.driverMinutes },
    driverStatus: Object.fromEntries(sim.company.drivers.map((d) => {
      const abs = b.absence(d.id, sim!.time);
      return [d.id, sim!.driverBusy(d.id) ?? (abs === 'urlaub' ? 'im Urlaub' : abs === 'krank' ? 'krank' : null)];
    })),
    staffRequests: structuredClone(b.staffRequests),
    agencyPool: structuredClone(b.agencyPool),
    applicants: structuredClone(b.applicants),
    deliveries: structuredClone(b.deliveries),
    discounts: Object.fromEntries(DEALERS.map((d) => [d.id, b.dealerDiscount(d.id)])),
    machineValues: Object.fromEntries(sim.company.machines.map((m) => [m.id, b.machineValueNow(m, sim!.time)])),
    busyMachines: sim.busyMachineIds(),
    plan: sim.planBoard(),
    dieselPrice: b.dieselPrice,
    weather: (() => {
      const day = Math.floor(sim!.time / 1440);
      const w = sim!.weather.day(day);
      return { ...w, blocked: sim!.weather.fieldBlocked(sim!.time), forecast: sim!.weather.forecast(day, 7) };
    })(),
    yearNow: (() => {
      const f = b.yearFigures(b.yearStart(sim!.time), sim!.time + 1);
      return { ...f, profit: f.revenue - f.expenses - f.afa };
    })(),
    years: b.years.map((y) => ({ ...y })),
    taxDue: b.taxDue ? { ...b.taxDue } : null,
    balance: b.balance(sim.time),
    loanRates: Object.fromEntries([3, 5, 8, 10].map((y) => [y, loanBaseRate(y) + RATING_SURCHARGE[sim!.company.rating ?? 'A']])),
    leaseRates: Object.fromEntries([36, 48, 60].map((m) => [m, LEASE_BASE_RATE + RATING_SURCHARGE[sim!.company.rating ?? 'A']])),
    rivalFarms,
    trialFarms,
    knownFarms: known,
    satisfaction,
    events: b.drainEvents(),
    invoices: b.invoices.map((i) => ({ ...i })),
    ledger: b.ledger.slice(-300).map((l) => ({ ...l })),
    results: Object.fromEntries(b.orders.filter((o) => o.status === 'fertig').map((o) => [o.id, b.orderResult(o)])),
  };
  post({ type: 'business', state });
}

let lastBizSend = 0;
function send(now: number) {
  if (!sim) return;
  // während eigene Fahrzeuge unterwegs sind: Status/Tempo regelmäßig aktualisieren
  const live = now - lastBizSend > (sim.anyPlayerBusy ? 250 : 1000);
  if (sim.vehiclesVersion !== sentVehiclesVersion) {
    // neue Fahrzeuge (Kauf, Laden): Liste und Parkrouten zuerst schicken
    sentVehiclesVersion = sim.vehiclesVersion;
    for (const r of sim.drainRoutes()) pendingRoutes.push(toWire(r));
    post({ type: 'vehicles', vehicles: sim.vehicleInfo });
  }
  if (live || sim.business.version !== sentBusinessVersion) lastBizSend = now;
  sendBusiness(live);
  const positions = sim.snapshot();
  const routes = pendingRoutes;
  pendingRoutes = [];
  const transfer: Transferable[] = [positions.buffer];
  for (const r of routes) transfer.push(r.coords.buffer, r.cum.buffer);
  const s = sim.stats();
  post(
    {
      type: 'tick',
      time: sim.time,
      speed,
      positions,
      routes,
      stats: { stepsPerSecond, msPerStep, driving: s.driving, working: s.working, waiting: s.waiting, trips: s.trips, searches: s.searches, cacheHits: s.cacheHits },
    },
    transfer,
  );
  lastSend = now;
  lastSentTime = sim.time;
}

function doSteps(n: number) {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    sim!.step();
    for (const r of sim!.drainRoutes()) pendingRoutes.push(toWire(r));
  }
  if (n > 0) {
    const per = (performance.now() - t0) / n;
    msPerStep = msPerStep === 0 ? per : msPerStep * 0.9 + per * 0.1;
  }
  spsWindowSteps += n;
}

function loop() {
  timer = null;
  if (!sim || speed === 0) return;
  const now = performance.now();
  const rate = speed * STEPS_PER_SECOND_AT_1X;
  const due = anchorSteps + Math.floor(((now - anchorTime) / 1000) * rate);
  let todo = due - sim.time;
  if (todo > MAX_STEPS_PER_TICK) {
    // Rückstand verwerfen statt aufholen: Uhr neu verankern
    todo = MAX_STEPS_PER_TICK;
    anchorTime = now;
    anchorSteps = sim.time + todo;
  }
  if (todo > 0) doSteps(todo);

  if (now - spsWindowStart >= 1000) {
    stepsPerSecond = (spsWindowSteps * 1000) / (now - spsWindowStart);
    spsWindowStart = now;
    spsWindowSteps = 0;
  }

  const minGap = 1000 / MAX_SNAPSHOTS_PER_SECOND;
  if (sim.time !== lastSentTime && now - lastSend >= minGap - 2) send(now);

  // nächster Takt: zum nächsten fälligen Schritt bzw. spätestens zur nächsten Meldung
  const nextStepAt = anchorTime + ((sim.time + 1 - anchorSteps) / rate) * 1000;
  const wait = Math.max(0, Math.min(nextStepAt - performance.now(), minGap));
  timer = setTimeout(loop, wait);
}

function setSpeed(s: Speed) {
  speed = s;
  const now = performance.now();
  anchorTime = now;
  anchorSteps = sim ? sim.time : 0;
  spsWindowStart = now;
  spsWindowSteps = 0;
  if (s === 0) stepsPerSecond = 0;
  if (timer) clearTimeout(timer);
  timer = null;
  if (sim) {
    send(now);
    sendBusiness(true); // aktueller Stand auch beim Pausieren
    if (s > 0) loop();
  }
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      graph = parseRoadGraph(msg.graph);
      const fields = msg.fields ? parseFields(msg.fields) : undefined;
      sim = new Simulation(graph, { seed: msg.seed, vehicleCount: msg.vehicleCount, fields });
      post({
        type: 'ready',
        vehicles: sim.vehicleInfo,
        home: unproject(graph, graph.x[sim.homeNode], graph.y[sim.homeNode]),
        center: [graph.lon0, graph.lat0],
        radiusM: graph.radiusM,
        nodeCount: graph.nodeCount,
        edgeCount: graph.edgeCount,
        fieldCount: fields?.count ?? 0,
        company: structuredClone(sim.company),
        farms: farmSummaries(),
        fieldFarm: sim.farms ? sim.farms.fieldFarm.slice() : new Int32Array(0),
        fieldCrop: sim.farms ? sim.farms.fieldCrop.slice() : new Uint8Array(0),
      });
      sendBusiness(true);
      setSpeed(speed);
    } else if (msg.type === 'speed') {
      setSpeed(msg.speed);
    } else if (msg.type === 'command') {
      const message = sim ? sim.command(msg.cmd) : 'Simulation nicht bereit';
      post({ type: 'commandResult', id: msg.id, message });
      sendBusiness(true);
    } else if (msg.type === 'save') {
      if (sim) post({ type: 'saveData', id: msg.id, state: sim.serialize() });
    } else if (msg.type === 'load') {
      if (!sim) {
        post({ type: 'loaded', id: msg.id, ok: false, message: 'Simulation nicht bereit' });
      } else {
        try {
          sim.restore(msg.state);
        } catch (e) {
          post({ type: 'loaded', id: msg.id, ok: false, message: e instanceof Error ? e.message : String(e) });
          return;
        }
        pendingRoutes = sim.drainRoutes().map(toWire);
        lastSentTime = -1;
        setSpeed(0);
        sendBusiness(true);
        post({ type: 'loaded', id: msg.id, ok: true, message: 'geladen' });
      }
    } else if (msg.type === 'stepOnce') {
      if (sim) {
        doSteps(1);
        send(performance.now());
      }
    }
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
