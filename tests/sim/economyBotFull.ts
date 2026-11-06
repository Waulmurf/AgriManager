/**
 * Langzeit-Simulation „alle Dienste“: ein regelbasierter Spieler baut den Lohnbetrieb über viele
 * Jahre aus – Feldarbeit, Gülle, Ernteketten (Drusch, Häckseln, Rüben- und Kartoffelroden), Lkw-
 * Transport, Kommunal (Ausschreibungen, Winterdienst) und eigener Ackerbau auf Pachtflächen.
 * Er investiert nach einem Plan, wenn Eigenkapital und Kreditrahmen es erlauben, stellt Fahrer
 * mit passender Qualifikation ein oder schickt sie auf Lehrgänge. Ergebnis: Jahresbericht.
 */
import { writeFileSync } from 'node:fs';
import type { Simulation } from '../../src/sim/engine';
import { CATALOG, dealersFor } from '../../src/data/catalog';
import { HARVEST_TOWED, HAULER_TYPES, SERVICE_IMPLEMENT, SERVICE_SKILL, isHarvest, type Order, type Service } from '../../src/sim/business';
import { MACHINE_SKILL, gameDate, type MachineType, type Skill } from '../../src/sim/economy';
import { TOUR, isTour } from '../../src/sim/municipal';
import type { OwnCrop } from '../../src/sim/farming';

const ROUTINE: Service[] = ['grubbern', 'stoppel', 'saat', 'einzelkorn', 'pflanzenschutz', 'pressen', 'guelle', 'striegeln', 'hacken'];
type BranchKey = 'feld' | 'ernte' | 'transport' | 'kommunal' | 'ackerbau';
const BRANCH_OF = (s: Service): BranchKey => (isHarvest(s) ? 'ernte' : s === 'transport' ? 'transport' : isTour(s) ? 'kommunal' : 'feld');

/** Investitionsplan: ab Spieljahr, Gerät (Anzahl je Eintrag eins) */
const PLAN: { year: number; type: MachineType; ifBusy?: Service }[] = [
  { year: 2, type: 'lkw' }, { year: 2, type: 'maehdrescher' }, { year: 2, type: 'kipper' }, { year: 2, type: 'streuer' },
  { year: 2, type: 'auslegemaeher' }, { year: 3, type: 'feldhaecksler' }, { year: 3, type: 'haeckselwagen' }, { year: 3, type: 'haeckselwagen' },
  { year: 3, type: 'ruebenroder' }, { year: 3, type: 'radlader' }, { year: 4, type: 'kartoffelroder' }, { year: 4, type: 'ueberladewagen' },
  { year: 4, type: 'astschere' }, { year: 4, type: 'wegehobel' },
  // zweite Maschinen nur, wenn die erste im Vorjahr gut ausgelastet war (mindestens 40 Aufträge)
  { year: 5, type: 'lkw', ifBusy: 'transport' }, { year: 5, type: 'maehdrescher', ifBusy: 'drusch' },
  { year: 6, type: 'ruebenroder', ifBusy: 'roden' }, { year: 7, type: 'feldhaecksler', ifBusy: 'haeckseln' },
];
const ROTATION: OwnCrop[] = ['weizen', 'raps', 'weizen', 'mais', 'rueben', 'weizen', 'kartoffeln'];

/** Investitionsfreude: Rücklagen, Leasing, Wachstumsschwellen (normal = bisheriges Verhalten des Bots) */
export type InvestLevel = 'vorsichtig' | 'normal' | 'mutig';
export const INVEST: Record<InvestLevel, {
  /** Rücklage nach einem Ausbaukauf: Anteil am Preis, mindestens … € */
  reserveShare: number; minReserve: number;
  /** neu kaufen erst nach … Tagen ohne passendes Gebrauchtangebot; Leasing ab Eigenkapital (€) */
  newAfterDays: number; leaseEquity: number;
  /** Ausbau nur, wenn der Vorjahresverlust kleiner ist als … und das Eigenkapital über … liegt */
  lossOk: number; equityMin: number;
  /** Feldarbeit: zweites Gerät/Schlepper nach … abgelehnten Anfragen, Auslastungsschwelle, höchstens … Schlepper */
  missed: number; util: number; maxTractors: number;
  /** zweite Erntemaschine/Lkw ab … Aufträgen im Vorjahr; Halle ab Kasse (€); Ausbauplan früher/später (Jahre) */
  busyOrders: number; buildCash: number; planShift: number;
}> = {
  vorsichtig: { reserveShare: 0.5, minReserve: 60_000, newAfterDays: 9999, leaseEquity: Infinity, lossOk: 0, equityMin: 150_000, missed: 6, util: 0.8, maxTractors: 5, busyOrders: 60, buildCash: 400_000, planShift: 1 },
  normal: { reserveShare: 0.3, minReserve: 30_000, newAfterDays: 180, leaseEquity: 500_000, lossOk: -50_000, equityMin: 100_000, missed: 3, util: 0.65, maxTractors: 10, busyOrders: 40, buildCash: 250_000, planShift: 0 },
  mutig: { reserveShare: 0.15, minReserve: 20_000, newAfterDays: 0, leaseEquity: 100_000, lossOk: -250_000, equityMin: 50_000, missed: 2, util: 0.5, maxTractors: 16, busyOrders: 25, buildCash: 150_000, planShift: -1 },
};

/** Strategie: welche Felddienste, welcher Ausbauplan, ob Pacht/Ackerbau */
export interface BotProfile {
  key: string;
  name: string;
  /** angebotene Felddienste mit Schlepper und Gerät ('all' = alle) */
  routine: Service[] | 'all';
  /** Ausbauplan ('standard' = Allrounder) */
  /** core = Kernmaschine des Spezialisten: auch neu (Leasing), auch im Sommer, nach höchstens 60 Tagen Warten */
  plan: { year: number; type: MachineType; ifBusy?: Service; core?: boolean }[] | 'standard';
  farming: boolean;
  invest: InvestLevel;
}

const SPECIALISTS: Omit<BotProfile, 'invest'>[] = [
  { key: 'guelle', name: 'Gülle-Spezialist (Ausbringung, Zubringer, Gärrest-Transport)', routine: ['guelle'], farming: false,
    plan: [{ year: 1, type: 'zubringer', core: true }, { year: 2, type: 'guellefass', ifBusy: 'guelle' }, { year: 3, type: 'zubringer', ifBusy: 'guelle' }] },
  { key: 'drusch', name: 'Drusch-Spezialist (Mähdrusch mit Abfuhr, Stroh pressen)', routine: ['pressen'], farming: false,
    plan: [{ year: 1, type: 'maehdrescher', core: true }, { year: 1, type: 'kipper', core: true }, { year: 2, type: 'ueberladewagen' }, { year: 3, type: 'maehdrescher', ifBusy: 'drusch' }, { year: 3, type: 'kipper', ifBusy: 'drusch' }] },
  { key: 'rueben', name: 'Rüben-Spezialist (Einzelkornsaat, Roden, Lkw-Abfuhr)', routine: ['einzelkorn'], farming: false,
    plan: [{ year: 1, type: 'ruebenroder', core: true }, { year: 1, type: 'lkw', core: true }, { year: 3, type: 'lkw', ifBusy: 'transport' }, { year: 4, type: 'ruebenroder', ifBusy: 'roden' }] },
  { key: 'transport', name: 'Transport-Spezialist (Lkw)', routine: [], farming: false,
    plan: [{ year: 1, type: 'lkw', core: true }, { year: 2, type: 'lkw', ifBusy: 'transport' }, { year: 3, type: 'lkw', ifBusy: 'transport' }, { year: 5, type: 'lkw', ifBusy: 'transport' }] },
  { key: 'kommunal', name: 'Kommunal-Dienstleister (Winterdienst, Böschungen, Hecken, Wege)', routine: [], farming: false,
    plan: [{ year: 1, type: 'streuer', core: true }, { year: 1, type: 'auslegemaeher', core: true }, { year: 2, type: 'astschere' }, { year: 2, type: 'wegehobel' }, { year: 3, type: 'streuer' }] },
  { key: 'feld', name: 'Feldarbeit-Allrounder (alle Felddienste, keine Ernte)', routine: 'all', farming: false, plan: [] },
];
const ALLROUND: Omit<BotProfile, 'invest'> = { key: 'allround', name: 'Allrounder (alle Dienste, Ackerbau)', routine: 'all', farming: true, plan: 'standard' };

/** alle Strategien × Investitionsfreude */
export function botProfile(key: string, invest: InvestLevel = 'normal'): BotProfile {
  const base = key === 'allround' ? ALLROUND : SPECIALISTS.find((p) => p.key === key);
  if (!base) throw new Error(`Strategie ${key} unbekannt`);
  return { ...base, invest };
}
export const STRATEGY_KEYS = [...SPECIALISTS.map((p) => p.key), 'allround'];

export interface YearRow {
  year: number;
  revenue: number; expenses: number; afa: number; profit: number; insolvent: boolean;
  byBranch: Record<BranchKey, number>;
  cash: number; equity: number; debt: number;
  tractors: number; machines: number; staffFest: number; staffSaison: number; wage: number; leih: number;
  services: string[]; costs: Record<string, number>; bySvc: Record<string, number>; taskH: Record<string, number>; orders: number; late: number; cancelled: number; reputation: number; leaseHa: number; known: number;
}

export interface FullResult {
  years: YearRow[]; purchases: string[]; log: string[]; seconds: number;
  profile: BotProfile;
  /** Spielbarkeit: hängende Erntemaschinen (über 30 Tage am selben Auftrag), ungültige Zahlen, Tage in der Sanierung */
  stuckHarvest: number; longTasks: number; badNumbers: number; sanierungDays: number;
  /** endgültige Insolvenz (Sanierung gescheitert) in diesem Jahr, sonst null */
  bankruptYear: number | null;
}

export function runFullBot(s: Simulation, years: number, profile: BotProfile = botProfile('allround')): FullResult {
  const P = INVEST[profile.invest];
  const PLAN_P: { year: number; type: MachineType; ifBusy?: Service; core?: boolean }[] = (profile.plan === 'standard' ? PLAN : profile.plan).map((x) => ({ ...x, year: Math.max(1, x.year + P.planShift) }));
  const routineOk = (sv: Service) => profile.routine === 'all' || profile.routine.includes(sv);
  let stuckHarvest = 0, longTasks = 0, badNumbers = 0, sanierungDays = 0;
  const t0 = Date.now();
  const b = s.business, c = s.company, fs = s.farms!;
  const log: string[] = [];
  const purchases: string[] = [];
  const say = (t: string) => log.push(`${gameDate(s.time).month}/${gameDate(s.time).year}: ${t}`);
  const startYear = gameDate(s.time).year;
  const g = (s as unknown as { graph: { x: ArrayLike<number>; y: ArrayLike<number> } }).graph;
  const hx = g.x[s.homeNode], hy = g.y[s.homeNode];
  const byDist = fs.farms.map((f) => ({ id: f.id, d: Math.hypot(g.x[f.homeNode] - hx, g.y[f.homeNode] - hy) })).sort((a, z) => a.d - z.d).map((x) => x.id);
  const busy = (id: number) => (s as unknown as { machineBusy(id: number): boolean }).machineBusy(id);
  const free = (id: number) => !busy(id) && (c.machines.find((m) => m.id === id)?.downUntil ?? 0) <= s.time && !c.machines.find((m) => m.id === id)?.repair;
  const ofType = (t: MachineType) => c.machines.filter((m) => m.type === t);
  const driverFree = (id: number) => !s.driverBusy(id) && !s.queue.some((q) => q.driverId === id) && !b.absence(id, s.time);
  const missedBy: Record<string, number> = {};
  let util = 0; // gleitende Auslastung der Schlepper (Arbeitszeit)
  let planIdx = 0;
  let planDueSince = -1;
  const ordersLastYear: Record<string, number> = {};
  // Jahreswerte
  const yearAcc = () => ({ byBranch: { feld: 0, ernte: 0, transport: 0, kommunal: 0, ackerbau: 0 } as Record<BranchKey, number>, services: new Set<string>(), orders: 0, late: 0, cancelled: 0, costs: {} as Record<string, number>, bySvc: {} as Record<string, number>, svcOrders: {} as Record<string, number>, taskMin: {} as Record<string, number> });
  let acc = yearAcc();
  const seenInv = new Set<number>();
  const seenOrder = new Set<number>();
  let ledgerTime = s.time;
  const rows: YearRow[] = [];

  const borrow = (need: number): boolean => {
    const amount = Math.ceil((need + 25_000) / 10_000) * 10_000;
    if (c.creditLimit - c.loan < amount) return false;
    return /ausgezahlt/.test(s.command({ kind: 'takeLoan', amount, years: 8 }));
  };
  /** Maschine beschaffen: gebraucht (Kasse, notfalls Darlehen), sonst neu geleast über 60 Monate */
  const buy = (type: MachineType, why: string, minPower = 0, allowLease = true): boolean => {
    // Anbaugerät/Anhänger muss zum stärksten eigenen Schlepper passen
    const maxPow = Math.max(0, ...ofType('schlepper').map((t) => t.power ?? 0));
    const fits = (need?: number) => type === 'schlepper' || (need ?? 0) <= maxPow;
    const used = b.offers.filter((o) => o.machine.type === type && (o.machine.power ?? 999) >= minPower && o.machine.condition >= 50 && fits(o.machine.powerNeed)).sort((x, y) => x.price - y.price)[0];
    if (used) {
      if (c.cash - used.price < 25_000 && c.creditLimit - c.loan > used.price) borrow(used.price + 25_000 - c.cash);
      if (c.cash - used.price >= 25_000 && !/Geld|nicht/.test(s.command({ kind: 'buy', offerId: used.id }))) {
        purchases.push(`${gameDate(s.time).month}/${gameDate(s.time).year}: ${type} gebraucht ${used.machine.brand} ${used.machine.model} ${Math.round(used.price).toLocaleString('de-DE')} € (${why})`);
        return true;
      }
    }
    if (b.deliveries.some((d) => d.machine.type === type)) return false;
    const model = CATALOG.filter((m) => m.type === type && (m.power ?? 999) >= minPower && fits(m.powerNeed)).sort((x, y) => x.newPrice - y.newPrice)[0];
    const dealer = model && dealersFor(model.brand)[0];
    if (!model || !dealer) return false;
    // Schlepper ohne Gebrauchtangebot: neu mit Darlehen (nicht bei vorsichtiger Strategie)
    if (type === 'schlepper' && profile.invest !== 'vorsichtig' && c.cash - model.newPrice < 50_000) borrow(model.newPrice + 50_000 - c.cash);
    const lease = c.cash - model.newPrice < 50_000;
    if (lease && !allowLease) return false;
    const r = s.command({ kind: 'order', dealerId: dealer.id, modelKey: model.key, leaseMonths: lease ? 60 : undefined });
    if (/bestellt|geleast/.test(r)) { purchases.push(`${gameDate(s.time).month}/${gameDate(s.time).year}: ${type} neu ${lease ? 'geleast' : 'gekauft'} ${model.brand} ${model.model} ${model.newPrice.toLocaleString('de-DE')} € (${why})`); return true; }
    return false;
  };

  /** Ausbau: gebraucht (Zustand ≥ 50), sonst neu mit Darlehen bzw. Leasing */
  const buyPlan = (type: MachineType, usedOnly: boolean, allowLease: boolean): boolean => {
    // gezogene Geräte müssen zum stärksten Schlepper passen (Selbstfahrer brauchen keinen)
    const maxPow = Math.max(0, ...ofType('schlepper').map((t) => t.power ?? 0));
    const fits = (need?: number) => (need ?? 0) <= maxPow;
    const used = b.offers.filter((o) => o.machine.type === type && o.machine.condition >= 50 && fits(o.machine.powerNeed)).sort((x, y) => x.price - y.price)[0];
    if (used) {
      // Rücklage nach dem Kauf: mindestens 30.000 €, bei großen Maschinen 30 % des Preises (Saisonkosten bis zur Ernte)
      const reserve = Math.max(P.minReserve, used.price * P.reserveShare);
      if (c.cash - used.price < reserve) borrow(used.price + reserve - c.cash);
      if (c.cash - used.price >= reserve && !/Geld|nicht|Insolvent/.test(s.command({ kind: 'buy', offerId: used.id }))) {
        purchases.push(`${gameDate(s.time).month}/${gameDate(s.time).year}: ${type} gebraucht ${used.machine.brand} ${used.machine.model} ${Math.round(used.price).toLocaleString('de-DE')} € (Ausbauplan)`);
        return true;
      }
      return false;
    }
    if (usedOnly) return false;
    const model = CATALOG.filter((x) => x.type === type && fits(x.powerNeed)).sort((x, y) => x.newPrice - y.newPrice)[0];
    const dealer = model && dealersFor(model.brand)[0];
    if (!model || !dealer) return false;
    const reserveNew = Math.max(P.minReserve, model.newPrice * P.reserveShare);
    if (c.cash - model.newPrice < reserveNew) borrow(model.newPrice + reserveNew - c.cash);
    const lease = c.cash - model.newPrice < reserveNew;
    if (lease && !allowLease) return false;
    const r = s.command({ kind: 'order', dealerId: dealer.id, modelKey: model.key, leaseMonths: lease ? 60 : undefined });
    if (/bestellt|geleast/.test(r)) { purchases.push(`${gameDate(s.time).month}/${gameDate(s.time).year}: ${type} neu ${lease ? 'geleast' : 'gekauft'} ${model.brand} ${model.model} ${model.newPrice.toLocaleString('de-DE')} € (Ausbauplan)`); return true; }
    return false;
  };

  /** qualifizierten Fahrer sicherstellen: passende Bewerbung fest einstellen, sonst eine feste Kraft schulen */
  const ensureSkill = (skill: Skill, min: number, count = 1) => {
    const have = c.drivers.filter((d) => (d.skills[skill] ?? 0) >= min).length;
    if (have >= count) return;
    if (c.drivers.some((d) => d.course && (d.course.skill === skill || (skill === 'transport' && d.course.key === 'ce')))) return; // läuft schon
    const cand = b.applicants.filter((a) => (a.person.skills[skill] ?? 0) >= min);
    if (cand.length) {
      s.command({ kind: 'hire', applicantId: cand[0].id, asKind: 'fest' });
      say(`fest eingestellt für ${skill}: ${cand[0].person.name}`);
      return;
    }
    // Zeitarbeit: qualifizierten Leiharbeiter für die Saison buchen (überbrückt Suche und Lehrgang)
    const ag = b.agencyPool.find((a) => (a.person.skills[skill] ?? 0) >= min);
    if (ag && /gebucht/.test(s.command({ kind: 'rent', poolId: ag.id, days: 120 }))) { say(`Leiharbeiter für ${skill} gebucht: ${ag.person.name}`); return; }
    // Schulungskandidat: feste Kraft (nicht der Chef), die die Fähigkeit noch nicht hat
    const trainee = c.drivers.filter((d) => d.kind === 'fest' && !d.isPlayer && !d.course && (d.skills[skill] ?? 0) < min)
      .sort((x, y) => (y.skills[skill] ?? 0) - (x.skills[skill] ?? 0))[0];
    if (!trainee) {
      const a = [...b.applicants].sort((x, y) => (y.person.skills.boden ?? 0) - (x.person.skills.boden ?? 0))[0];
      if (a) { s.command({ kind: 'hire', applicantId: a.id, asKind: 'fest' }); say(`fest eingestellt (wird für ${skill} geschult): ${a.person.name}`); }
      return;
    }
    const r = s.command(skill === 'transport' ? { kind: 'course', employeeId: trainee.id, course: 'ce' } : { kind: 'course', employeeId: trainee.id, course: 'lehrgang', skill });
    if (/Lehrgang/.test(r)) say(`${trainee.name} auf Lehrgang (${skill})`);
  };

  const yearNo = () => gameDate(s.time).year - startYear + 1;

  /** Investitionen und Qualifikation (täglich geprüft, gekauft im Winterhalbjahr oder bei viel Geld) */
  const invest = () => {
    const bal = b.balance(s.time);
    const m = gameDate(s.time).month;
    // Ausbau nur mit Gewinn im Vorjahr (ab Jahr 3), Rücklage und ohne Insolvenz
    const lastProfit = rows.at(-1)?.profit ?? 0;
    const healthy = !c.sanierung && c.cash > 30_000 && (yearNo() <= 2 || lastProfit > P.lossOk);
    void lastProfit;
    while (planIdx < PLAN_P.length && PLAN_P[planIdx].ifBusy && PLAN_P[planIdx].year <= yearNo() && (ordersLastYear[PLAN_P[planIdx].ifBusy!] ?? 0) < P.busyOrders && m === 1) planIdx++;
    const core = !!PLAN_P[planIdx]?.core && profile.invest !== 'vorsichtig';
    if (planIdx < PLAN_P.length && PLAN_P[planIdx].year <= yearNo() && (core || m <= 3 || m >= 11) && (core || bal.equity > P.equityMin) && healthy) {
      const p = PLAN_P[planIdx];
      if (planDueSince < 0) planDueSince = s.time;
      // gebraucht bevorzugt; neu erst nach Wartezeit – Darlehen, Leasing nur bei viel Eigenkapital (Kernmaschine immer)
      const waited = s.time - planDueSince > (core ? Math.min(14, P.newAfterDays) : P.newAfterDays) * 1440;
      const usedOnly = !waited;
      const allowLease = waited && (core || bal.equity > P.leaseEquity);
      if (buyPlan(p.type, usedOnly, allowLease)) {
        planDueSince = -1;
        planIdx++;
        // Zugschlepper für Wagen/Anbaugeräte mitwachsen lassen
        const pulled = ['kipper', 'haeckselwagen', 'ueberladewagen', 'kartoffelroder', 'streuer', 'auslegemaeher', 'astschere', 'wegehobel'];
        if (pulled.includes(p.type) && ofType('schlepper').length < 3 + Math.floor(planIdx / 3)) buy('schlepper', 'Zugschlepper', 150);
      }
    }
    // Qualifikation: je Hauptmaschine ein eigener Fahrer (eine Person zählt nur für eine Maschine)
    const taken = new Set<number>();
    for (const t of ['maehdrescher', 'ruebenroder', 'feldhaecksler', 'kartoffelroder', 'lkw', 'radlader'] as MachineType[]) {
      // auch bestellte Maschinen zählen: Fahrer schon vor der Lieferung suchen bzw. schulen
      const n = ofType(t).length + b.deliveries.filter((x) => x.machine.type === t).length;
      if (!n) continue;
      const sk = MACHINE_SKILL[t]!;
      const own = c.drivers.filter((d) => !taken.has(d.id) && (d.skills[sk.skill] ?? 0) >= sk.min).slice(0, n);
      for (const d of own) taken.add(d.id);
      if (own.length < n) ensureSkill(sk.skill, sk.min, c.drivers.filter((d) => (d.skills[sk.skill] ?? 0) >= sk.min).length + 1);
    }
    if (ofType('spritze').length) ensureSkill('pflanzenschutz', 1);
  };

  /** Anfragen beantworten */
  const respond = () => {
    const openOf = (pred: (o: Order) => boolean) => b.orders.filter((o) => o.status !== 'fertig' && pred(o)).length;
    for (const r of b.requests.filter((x) => x.status === 'offen')) {
      let ok = false;
      if (r.service === 'transport') {
        ok = r.liquid ? ofType('zubringer').length + ofType('guellefass').length > 0 : ofType('lkw').length * 3 > openOf((o) => o.service === 'transport' && !o.liquid);
      } else if (isHarvest(r.service)) {
        const harv = ofType(SERVICE_IMPLEMENT[r.service]).length;
        const wagons = (HAULER_TYPES[r.service] ?? []).reduce((a, t) => a + ofType(t).length, 0);
        const needW = r.service === 'haeckseln' ? 2 : 1;
        ok = harv > 0 && harv * 4 > openOf((o) => o.service === r.service) && (r.chain !== 'komplett' || wagons >= needW);
      } else if (ROUTINE.includes(r.service) && routineOk(r.service)) {
        const type = SERVICE_IMPLEMENT[r.service];
        const skillOk = r.service !== 'pflanzenschutz' || c.drivers.some((d) => (d.skills.pflanzenschutz ?? 0) >= 1);
        // je Gerät höchstens zwei offene Aufträge dieser Art, insgesamt höchstens zwei je Schlepper
        const cap = ofType(type).length * 2 - openOf((o) => SERVICE_IMPLEMENT[o.service] === type);
        const tractorCap = ofType('schlepper').length * 2 - openOf((o) => ROUTINE.includes(o.service));
        const maxPow = Math.max(0, ...ofType('schlepper').map((t) => t.power ?? 0));
        // kein (passendes) Gerät: eins kaufen, das der Schlepper ziehen kann
        if (skillOk && !ofType(type).some((m) => (m.powerNeed ?? 0) <= maxPow) && !b.deliveries.some((x) => x.machine.type === type)) buy(type, `Anfrage ${r.service}`, 0, false);
        ok = skillOk && cap > 0 && tractorCap > 0 && ofType(type).some((m) => (m.powerNeed ?? 0) <= maxPow);
        if (!ok && skillOk && ofType(type).length) missedBy[cap <= 0 ? type : 'schlepper'] = (missedBy[cap <= 0 ? type : 'schlepper'] ?? 0) + 1;
      }
      if (ok) s.command({ kind: 'respond', requestId: r.id, action: 'accept' });
      else s.command({ kind: 'respond', requestId: r.id, action: 'reject' });
    }
    // Kommunal: Ausschreibungen und Winterdienst
    for (const t of b.tenders) if (t.playerEurKm === undefined && ofType(TOUR[t.service].implement).length) s.command({ kind: 'tenderBid', tenderId: t.id, eurKm: Math.round(TOUR[t.service].eurKm * 0.97) });
    for (const w of [...b.winterOffers]) if (ofType('streuer').length && b.winterContracts.length < ofType('streuer').length * 2) s.command({ kind: 'winterAccept', offerId: w.id });
    // Rahmenverträge annehmen
    for (const f of [...b.frameOffers]) s.command({ kind: 'frameAnswer', offerId: f.id, accept: true });
    // Pacht: bis zu 40 ha + 15 ha je Jahr (höchstens 300 ha)
    const leaseHa = b.leases.reduce((a, l) => a + l.areaHa, 0);
    // Pacht nur, solange der eigene Ackerbau im Vorjahr Geld verdient hat (Ernte > Pacht + Betriebsmittel)
    const lastRow = rows.at(-1);
    const farmingPays = !lastRow || lastRow.byBranch.ackerbau >= (lastRow.costs.Pacht ?? 0) + (lastRow.costs.Ackerbau ?? 0);
    for (const o of b.leaseOffers) {
      if (!profile.farming || o.salePrice !== undefined || o.playerBid !== undefined || yearNo() < 2 || !farmingPays) continue;
      if (leaseHa + o.areaHa > Math.min(300, 40 + 15 * yearNo())) continue;
      s.command({ kind: 'bidLease', offerId: o.id, rentHa: Math.round(o.refRent * 1.12) });
    }
    for (const l of b.leases) {
      if (l.crop || l.nextCrop) continue;
      let crop = ROTATION[l.history.length % ROTATION.length];
      if (crop === l.lastCrop) crop = ROTATION[(l.history.length + 1) % ROTATION.length];
      s.command({ kind: 'setCrop', leaseId: l.id, crop });
    }
    if (b.leases.length && !b.hailInsured) s.command({ kind: 'hailInsurance', on: true });
  };

  /** Verwaltung: Zahlungen, Wünsche, Pannen, Wartung, Kunden, Geld, Wachstum der Feldarbeit */
  const admin = () => {
    for (const inv of b.invoices) if (inv.status === 'überfällig' && inv.remindedAt === undefined) s.command({ kind: 'remind', invoiceId: inv.id });
    for (const w of b.staffRequests) s.command({ kind: 'staffAnswer', requestId: w.id, accept: true });
    for (const e of c.drivers) if (e.poach) s.command({ kind: 'poachAnswer', employeeId: e.id, match: true });
    for (const m of c.machines) if (m.repair?.state === 'wartet') s.command({ kind: 'repair', machineId: m.id, mode: 'dealer' });
    for (const m of c.machines) if (m.serviceAtH !== undefined && m.hours >= m.serviceAtH && free(m.id) && m.type !== 'firmenwagen') s.command({ kind: 'service', machineId: m.id });
    if (c.cash < 5_000) borrow(40_000);
    // verschlissene eigene Maschinen (Zustand unter 20 %) in Zahlung geben; Ersatz kommt über Anfragen bzw. Plan
    for (const m of [...c.machines]) if (!m.lease && m.condition < 20 && free(m.id) && m.type !== 'firmenwagen' && m.type !== 'schlepper') {
      const r = s.command({ kind: 'sell', machineId: m.id, mode: 'tradein' });
      say(`${m.type} verschlissen in Zahlung gegeben (${r})`);
    }
    // Feldarbeit wächst nach Auslastung: zweites Gerät, wenn ein Dienst voll ist; Schlepper + Saisonkraft,
    // wenn die Schlepper über 65 % ausgelastet sind und deshalb abgelehnt wird (nur gebraucht, höchstens 10)
    for (const k of Object.keys(missedBy)) missedBy[k] *= 0.9;
    for (const [type, n] of Object.entries(missedBy)) {
      if (n < P.missed) continue;
      missedBy[type] = 0;
      if (type !== 'schlepper' && util < P.util && ofType(type as MachineType).length < 2) { buy(type as MachineType, 'Dienst ausgelastet', 0, false); continue; }
      if (type !== 'schlepper') continue;
      if (ofType('schlepper').length >= P.maxTractors) continue;
      const drivers = c.drivers.filter((d) => (d.skills.boden ?? 0) >= 1).length;
      if (drivers <= ofType('schlepper').length && b.applicants.length) {
        const a = [...b.applicants].sort((x, y) => (y.person.skills.boden ?? 0) - (x.person.skills.boden ?? 0))[0];
        s.command({ kind: 'hire', applicantId: a.id, asKind: 'saison' });
      }
      if (util > P.util) buy('schlepper', 'Schlepper ausgelastet', 140, false);
    }
    // genug Fahrer: mindestens so viele Traktorfahrer wie Schlepper (Saisonkräfte)
    if (c.drivers.filter((d) => (d.skills.boden ?? 0) >= 1).length < ofType('schlepper').length && b.applicants.length) {
      const a = [...b.applicants].sort((x, y) => (y.person.skills.boden ?? 0) - (x.person.skills.boden ?? 0))[0];
      if ((a.person.skills.boden ?? 0) >= 1) s.command({ kind: 'hire', applicantId: a.id, asKind: 'saison' });
    }
    // Kunden gewinnen: je Hauptmaschine (Schlepper, Erntemaschine, Lkw) etwa 15 Betriebe
    const main = ofType('schlepper').length + ofType('maehdrescher').length + ofType('ruebenroder').length + ofType('feldhaecksler').length + ofType('kartoffelroder').length + ofType('lkw').length;
    const known = fs.farms.filter((f) => f.known && !f.closed).length;
    if (known < 15 + 15 * main && !s.chefBusy && !s.queue.some((q) => q.cmd.kind === 'visit')) {
      const next = byDist.find((id) => !fs.farms[id].known && !fs.farms[id].closed);
      if (next !== undefined) s.command({ kind: 'visit', farmId: next });
    }
    // Disponent ab Jahr 6 mit Büro
    if (yearNo() >= 6 && !c.dispatcher) {
      if (!b.hasBuilding('buero') && !c.sites![0].buildings.buero && c.cash > 150_000) s.command({ kind: 'build', siteId: 1, building: 'buero' });
      if (b.hasBuilding('buero')) s.command({ kind: 'dispatcher', action: 'hire' });
    }
    if (yearNo() >= 3 && !c.sites![0].buildings.halle && c.cash > P.buildCash) {
      if (!c.sites![0].buildings.platz) s.command({ kind: 'build', siteId: 1, building: 'platz' });
      else s.command({ kind: 'build', siteId: 1, building: 'halle' });
    }
  };

  /** Aufträge starten */
  const startJobs = () => {
    const tr = ofType('schlepper');
    if (tr.length) util = util * 0.97 + 0.03 * (tr.filter((m) => busy(m.id)).length / tr.length);
    const drivers = () => c.drivers.filter((d) => driverFree(d.id));
    for (const o of b.orders.filter((x) => x.status === 'offen')) {
      if (s.queue.some((q) => q.cmd.kind === 'startJob' && q.cmd.orderId === o.id)) continue;
      const tractorFor = (need = 0) => ofType('schlepper').find((m) => free(m.id) && (m.power ?? 0) >= need);
      if (isTour(o.service)) {
        const im = ofType(TOUR[o.service].implement).find((m) => free(m.id));
        const tr = im && tractorFor(im.powerNeed ?? 0);
        const d = drivers().find((x) => (x.skills.boden ?? 0) >= 1);
        if (im && tr && d) s.command({ kind: 'startJob', orderId: o.id, tractorId: tr.id, implementId: im.id, driverId: d.id });
        continue;
      }
      if (o.service === 'transport') {
        if (o.liquid || o.slurrySupply) {
          const fass = [...ofType('zubringer'), ...ofType('guellefass')].find((m) => free(m.id));
          const tr = fass && tractorFor(fass.powerNeed ?? 0);
          const d = drivers().find((x) => (x.skills.boden ?? 0) >= 1);
          if (fass && tr && d) s.command({ kind: 'startJob', orderId: o.id, tractorId: tr.id, implementId: fass.id, driverId: d.id });
        } else {
          const lkw = ofType('lkw').find((m) => free(m.id));
          const d = drivers().find((x) => (x.skills.transport ?? 0) >= 1);
          if (lkw && d) s.command({ kind: 'startJob', orderId: o.id, tractorId: lkw.id, implementId: lkw.id, driverId: d.id });
        }
        continue;
      }
      if (isHarvest(o.service)) {
        const type = SERVICE_IMPLEMENT[o.service];
        const sk = MACHINE_SKILL[type]!;
        const harv = ofType(type).find((m) => free(m.id));
        const d = harv && drivers().find((x) => (x.skills[sk.skill] ?? 0) >= sk.min);
        if (!harv || !d) continue;
        const towed = HARVEST_TOWED.includes(o.service);
        const tr = towed ? tractorFor(harv.powerNeed ?? 0) : harv;
        if (!tr) continue;
        // Abfahrer: Komplettkette 1 (Drusch/Kartoffeln) bzw. 2 (Häckseln)
        const haulers: { driverId: number; tractorId: number; implementId: number }[] = [];
        if (o.chain === 'komplett') {
          const need = o.service === 'haeckseln' ? 2 : 1;
          const usedD = new Set([d.id]), usedM = new Set([harv.id, tr.id]);
          for (const w of (HAULER_TYPES[o.service] ?? []).flatMap((t) => ofType(t))) {
            if (haulers.length >= need || !free(w.id) || usedM.has(w.id)) continue;
            const wt = ofType('schlepper').find((m) => free(m.id) && !usedM.has(m.id) && (m.power ?? 0) >= (w.powerNeed ?? 0));
            const wd = c.drivers.find((x) => driverFree(x.id) && !usedD.has(x.id) && (x.skills.boden ?? 0) >= 1);
            if (!wt || !wd) break;
            haulers.push({ driverId: wd.id, tractorId: wt.id, implementId: w.id });
            usedD.add(wd.id); usedM.add(wt.id); usedM.add(w.id);
          }
          if (!haulers.length) continue;
        }
        const rl = o.service === 'haeckseln' && o.chain === 'komplett' ? ofType('radlader').find((m) => free(m.id)) : undefined;
        const rd = rl && c.drivers.find((x) => driverFree(x.id) && x.id !== d.id && !haulers.some((h) => h.driverId === x.id) && (x.skills.radlader ?? 0) >= 1);
        s.command({ kind: 'startJob', orderId: o.id, tractorId: tr.id, implementId: harv.id, driverId: d.id, haulers, roller: rl && rd ? { driverId: rd.id, machineId: rl.id } : undefined });
        continue;
      }
      // Feldarbeit (auch Eigenaufträge auf Pachtflächen)
      const implType = SERVICE_IMPLEMENT[o.service];
      const impl = ofType(implType).find((m) => free(m.id));
      if (!impl) continue;
      const tr = tractorFor(impl.powerNeed ?? 0);
      const d = drivers().find((x) => (x.skills[SERVICE_SKILL[o.service]] ?? 0) >= 1 && (x.skills.boden ?? 0) >= 1);
      if (tr && d) s.command({ kind: 'startJob', orderId: o.id, tractorId: tr.id, implementId: impl.id, driverId: d.id });
    }
  };

  const collect = () => {
    for (const inv of b.invoices) {
      if (seenInv.has(inv.id)) continue;
      seenInv.add(inv.id);
      const o = b.orders.find((x) => x.id === inv.orderId);
      if (o) { acc.byBranch[BRANCH_OF(o.service)] += inv.amount; acc.services.add(o.service); acc.bySvc[o.service] = (acc.bySvc[o.service] ?? 0) + inv.amount; }
    }
    for (let i = b.ledger.length - 1; i >= 0 && b.ledger[i].time > ledgerTime; i--) {
      const l = b.ledger[i];
      if (l.category === 'Ernte') acc.byBranch.ackerbau += l.amount;
      if (l.category === 'Rechnung' && l.text.startsWith('Winterdienst Bereitschaft')) acc.byBranch.kommunal += l.amount;
      if (l.amount < 0) acc.costs[l.category] = (acc.costs[l.category] ?? 0) - l.amount;
    }
    ledgerTime = s.time;
    for (const o of b.orders) {
      if (o.status !== 'fertig' || seenOrder.has(o.id)) continue;
      seenOrder.add(o.id);
      if (o.cancelled) { acc.cancelled++; continue; }
      if (o.farmId < 0 && o.farmId > -90) continue;
      acc.orders++;
      acc.svcOrders[o.service] = (acc.svcOrders[o.service] ?? 0) + 1;
      if ((o.service === 'winterdienst' ? o.startedAt ?? 0 : o.finishedAt ?? 0) > o.latest) acc.late++;
    }
  };

  const yearRow = (partial = false) => {
    // abgeschlossenes Jahr (1. Januar) bzw. angefangenes Jahr bis heute (bei Insolvenz)
    const f = partial ? b.yearFigures(b.yearStart(s.time), s.time + 1) : undefined;
    const y = partial && f ? { year: gameDate(s.time).year, revenue: f.revenue, expenses: f.expenses, afa: f.afa, profit: f.revenue - f.expenses - f.afa } : b.years.at(-1);
    const bal = b.balance(s.time);
    rows.push({
      year: y?.year ?? gameDate(s.time).year - 1,
      insolvent: !!c.sanierung,
      revenue: Math.round(y?.revenue ?? 0), expenses: Math.round(y?.expenses ?? 0), afa: Math.round(y?.afa ?? 0), profit: Math.round(y?.profit ?? 0),
      byBranch: Object.fromEntries(Object.entries(acc.byBranch).map(([k, v]) => [k, Math.round(v)])) as Record<BranchKey, number>,
      cash: Math.round(c.cash), equity: Math.round(bal.equity), debt: Math.round(bal.debt),
      tractors: ofType('schlepper').length, machines: c.machines.length,
      staffFest: c.drivers.filter((d) => d.kind === 'fest' || d.kind === 'chef').length, staffSaison: c.drivers.filter((d) => d.kind === 'saison').length,
      wage: (() => { const st = c.drivers.filter((d) => d.kind !== 'chef' && d.kind !== 'leih'); return st.length ? Math.round((st.reduce((a, d) => a + d.wage, 0) / st.length) * 10) / 10 : 0; })(),
      leih: c.drivers.filter((d) => d.kind === 'leih').length,
      services: [...acc.services].sort(), costs: Object.fromEntries(Object.entries(acc.costs).map(([k, v]) => [k, Math.round(v)])), bySvc: Object.fromEntries(Object.entries(acc.bySvc).map(([k, v]) => [k, Math.round(v)])), taskH: Object.fromEntries(Object.entries(acc.taskMin).map(([k, v]) => [k, Math.round(v / 60)])), orders: acc.orders, late: acc.late, cancelled: acc.cancelled, reputation: Math.round(b.reputation),
      leaseHa: Math.round(b.leases.reduce((a, l) => a + l.areaHa, 0)), known: fs.farms.filter((f) => f.known && !f.closed).length,
    });
    for (const k of Object.keys(ordersLastYear)) delete ordersLastYear[k];
    Object.assign(ordersLastYear, acc.svcOrders);
    acc = yearAcc();
  };

  const days = Math.round(years * 365.25);
  let orderById = new Map<number, Order>();
  const stuck = new Map<number, { orderId: number; since: number; reported?: boolean }>();
  const dumped = new Set<number>();
  // Fortschritt je laufendem Ernteauftrag: hängt, wenn die ganze Kette 72 Stunden arbeiten dürfte
  // (kein Wetterstopp, kein Feierabend, keine Panne), sich aber nichts tut (Menge, Felder, Teilflächen)
  const progress = new Map<number, { value: number; idleMin: number; reported?: boolean }>();
  const progressOf = (o: Order) => (o.doneT ?? 0) + o.doneFields.length + Object.values(o.shareDone ?? {}).reduce((a, x) => a + x, 0) + (o.doneM3 ?? 0);
  const sim = s as unknown as { weatherHold(v: unknown): boolean };
  let bankruptYear: number | null = null;
  for (let day = 0; day < days; day++) {
    // endgültige Insolvenz: Spiel vorbei, angefangenes Jahr noch festhalten
    if (c.bankruptAt !== undefined) { bankruptYear = gameDate(c.bankruptAt).year; yearRow(true); break; }
    orderById = new Map(b.orders.map((o) => [o.id, o]));
    // Meldungen und neue Routen abholen (macht im Spiel die Oberfläche), sonst wächst der Speicher
    b.drainEvents();
    s.drainRoutes();
    for (let minute = 0; minute < 1440; minute++) {
      const mod = s.time % 1440;
      if (mod === 30) { respond(); admin(); invest(); }
      if (mod % 120 === 45 && mod < 11 * 60) startJobs();
      // Fahrerstunden je Aufgabe (alle 10 Minuten eine Stichprobe)
      if (mod % 10 === 0) {
        const vs = (s as unknown as { vehicles: { owner: string; task?: { kind: string; orderId?: number } }[] }).vehicles;
        // Aufträge, bei denen ein Mitglied der Kette gerade nicht arbeiten kann (krank, Feierabend, Wetter, Panne)
        const resting = new Set<number>();
        for (const w of vs) {
          if (w.owner !== 'player' || w.task?.orderId === undefined) continue;
          const ww = w as unknown as { restUntil: number; machineId?: number; task: { driverId: number } };
          const mm = c.machines.find((x) => x.id === ww.machineId);
          if (ww.restUntil > s.time || b.absence(ww.task.driverId, s.time) || sim.weatherHold(w) || (mm?.downUntil ?? 0) > s.time) resting.add(w.task.orderId);
        }
        for (let vi = 0; vi < vs.length; vi++) {
          const v = vs[vi];
          if (v.owner !== 'player' || !v.task) continue;
          // Erntemaschine ohne Fortschritt, obwohl sie arbeiten dürfte
          if (v.task.kind === 'job' && v.task.orderId !== undefined) {
            const o = orderById.get(v.task.orderId);
            const vv = v as unknown as { restUntil: number; machineId?: number };
            const m = c.machines.find((x) => x.id === vv.machineId);
            if (o && isHarvest(o.service)) {
              const val = progressOf(o);
              const p = progress.get(o.id) ?? { value: val, idleMin: 0 };
              void vv; void m;
              const canWork = !resting.has(o.id);
              if (Math.abs(p.value - val) > 1e-6) { p.value = val; p.idleMin = 0; }
              else if (canWork) p.idleMin += 10;
              if (p.idleMin >= 72 * 60 && !p.reported) {
                p.reported = true; stuckHarvest++; say(`hängt: Auftrag ${o.id} (${o.service} ${o.chain ?? ''}) 72 Arbeitsstunden ohne Fortschritt`);
                if (process.env.ECONOMY_STUCK_DUMP) writeFileSync(`${process.env.ECONOMY_STUCK_DUMP}-${o.id}.json`, JSON.stringify({ vi, state: s.serialize() }));
              }
              progress.set(o.id, p);
            }
          }
          // hängende Aufgabe erkennen: dasselbe Fahrzeug über 30 Tage am selben Auftrag
          if (v.task.orderId !== undefined) {
            const st = stuck.get(vi);
            if (!st || st.orderId !== v.task.orderId) stuck.set(vi, { orderId: v.task.orderId, since: s.time });
            else if (s.time - st.since > 30 * 1440 && !st.reported) {
              st.reported = true;
              const o = orderById.get(v.task.orderId);
              longTasks++;
              say(`lange Aufgabe (über 30 Tage): Fahrzeug ${vi} ${v.task.kind} Auftrag ${v.task.orderId} (${o?.service} ${o?.chain ?? ''}) seit ${gameDate(st.since).day}.${gameDate(st.since).month}.${gameDate(st.since).year}`);
              if (process.env.ECONOMY_STUCK_DUMP && o && isHarvest(o.service) && !dumped.has(o.id)) { dumped.add(o.id); writeFileSync(`${process.env.ECONOMY_STUCK_DUMP}-${o.id}.json`, JSON.stringify({ vi, state: s.serialize() })); }
            }
          } else stuck.delete(vi);
          const o = v.task.orderId !== undefined ? orderById.get(v.task.orderId) : undefined;
          const key = o ? `${v.task.kind}:${o.service}` : v.task.kind;
          acc.taskMin[key] = (acc.taskMin[key] ?? 0) + 10;
        }
      }
      s.step();
    }
    collect();
    if (c.sanierung) sanierungDays++;
    if (!Number.isFinite(c.cash) || !Number.isFinite(c.loan) || c.machines.some((m) => !Number.isFinite(m.condition) || !Number.isFinite(m.hours))) badNumbers++;
    // Jahresabschluss läuft am 1. Januar; danach die Zeile schreiben
    const d = gameDate(s.time);
    if (d.month === 1 && d.day === 1) yearRow();
  }
  return { years: rows, purchases, log, seconds: Math.round((Date.now() - t0) / 1000), profile, stuckHarvest, longTasks, badNumbers, sanierungDays, bankruptYear };
}

export function fullReport(r: FullResult, title: string): string {
  const k = (v: number) => `${Math.round(v / 1000).toLocaleString('de-DE')}`;
  const L = [`# ${title}`, '', `Rechenzeit: ${r.seconds} s`, '', '## Jahre (Beträge in T€)', '',
    '| Jahr | Umsatz | Feld | Ernte | Transport | Kommunal | Ackerbau | Kosten | AfA | Gewinn | Kasse | Eigenkapital | Schulden | Schlepper | Maschinen | fest | Saison | Leih | Ø Lohn €/h | Pacht ha | Kunden | Aufträge | verspätet | storniert | Ruf | Dienste |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |'];
  for (const y of r.years) {
    L.push(`| ${y.year}${y.insolvent ? ' (Sanierung)' : ''} | ${k(y.revenue)} | ${k(y.byBranch.feld)} | ${k(y.byBranch.ernte)} | ${k(y.byBranch.transport)} | ${k(y.byBranch.kommunal)} | ${k(y.byBranch.ackerbau)} | ${k(y.expenses)} | ${k(y.afa)} | ${k(y.profit)} | ${k(y.cash)} | ${k(y.equity)} | ${k(y.debt)} | ${y.tractors} | ${y.machines} | ${y.staffFest} | ${y.staffSaison} | ${y.leih} | ${y.wage.toLocaleString('de-DE')} | ${y.leaseHa} | ${y.known} | ${y.orders} | ${y.late} | ${y.cancelled} | ${y.reputation} | ${y.services.length} |`);
  }
  const cats = [...new Set(r.years.flatMap((y) => Object.keys(y.costs)))].sort();
  L.push('', '## Ausgaben je Kategorie (T€, Zahlungen inkl. Investitionen)', '', `| Jahr | ${cats.join(' | ')} |`, `| --- |${cats.map(() => ' ---: |').join('')}`);
  for (const y of r.years) L.push(`| ${y.year} | ${cats.map((c) => k(y.costs[c] ?? 0)).join(' | ')} |`);
  const svcs = [...new Set(r.years.flatMap((y) => Object.keys(y.bySvc)))].sort();
  L.push('', '## Umsatz je Dienst (T€)', '', `| Jahr | ${svcs.join(' | ')} |`, `| --- |${svcs.map(() => ' ---: |').join('')}`);
  for (const y of r.years) L.push(`| ${y.year} | ${svcs.map((c) => k(y.bySvc[c] ?? 0)).join(' | ')} |`);
  const tasks = [...new Set(r.years.flatMap((y) => Object.keys(y.taskH)))].sort();
  L.push('', '## Fahrzeugstunden je Aufgabe (Stichprobe alle 10 min, inkl. Feierabend-Wartezeit)', '', `| Jahr | ${tasks.join(' | ')} |`, `| --- |${tasks.map(() => ' ---: |').join('')}`);
  for (const y of r.years) L.push(`| ${y.year} | ${tasks.map((c) => (y.taskH[c] ?? 0).toLocaleString('de-DE')).join(' | ')} |`);
  L.push('', '## Dienste je Jahr', '', ...r.years.map((y) => `- ${y.year}: ${y.services.join(', ') || '–'}`));
  L.push('', '## Investitionen', '', ...r.purchases.map((p) => `- ${p}`), '', '## Protokoll (Auszug)', '', ...r.log.slice(0, 120).map((l) => `- ${l}`));
  return L.join('\n') + '\n';
}

/** Kennzahlen eines Strategie-Laufs für den Vergleich */
export interface StrategySummary {
  key: string; invest: InvestLevel; name: string; years: number; seconds: number;
  revenueTotal: number; profitTotal: number; profitYears: number;
  /** Mittel der letzten (bis zu) fünf Jahre */
  revenueLate: number; profitLate: number;
  equityEnd: number; equityMin: number; debtMax: number; cashMin: number;
  machinesEnd: number; tractorsEnd: number; staffEnd: number; services: number; firstSanierung: number | null;
  sanierungDays: number; orders: number; lateShare: number; cancelShare: number; reputationEnd: number; reputationMin: number;
  stuckHarvest: number; longTasks: number; badNumbers: number; investTotal: number; bankruptYear: number | null;
}

export function strategySummary(r: FullResult): StrategySummary {
  const ys = r.years;
  const late = ys.slice(-5);
  const avg = (f: (y: YearRow) => number) => (late.length ? late.reduce((a, y) => a + f(y), 0) / late.length : 0);
  const orders = ys.reduce((a, y) => a + y.orders, 0);
  const last = ys.at(-1);
  return {
    key: r.profile.key, invest: r.profile.invest, name: r.profile.name, years: ys.length, seconds: r.seconds,
    revenueTotal: ys.reduce((a, y) => a + y.revenue, 0), profitTotal: ys.reduce((a, y) => a + y.profit, 0), profitYears: ys.filter((y) => y.profit > 0).length,
    revenueLate: Math.round(avg((y) => y.revenue)), profitLate: Math.round(avg((y) => y.profit)),
    equityEnd: last?.equity ?? 0, equityMin: Math.min(...ys.map((y) => y.equity)), debtMax: Math.max(...ys.map((y) => y.debt)), cashMin: Math.min(...ys.map((y) => y.cash)),
    machinesEnd: last?.machines ?? 0, tractorsEnd: last?.tractors ?? 0, staffEnd: (last?.staffFest ?? 0) + (last?.staffSaison ?? 0),
    services: new Set(ys.flatMap((y) => y.services)).size, firstSanierung: ys.find((y) => y.insolvent)?.year ?? null,
    sanierungDays: r.sanierungDays, orders,
    lateShare: orders ? Math.round((ys.reduce((a, y) => a + y.late, 0) / orders) * 1000) / 10 : 0,
    cancelShare: orders ? Math.round((ys.reduce((a, y) => a + y.cancelled, 0) / (orders + ys.reduce((a, y) => a + y.cancelled, 0))) * 1000) / 10 : 0,
    reputationEnd: last?.reputation ?? 0, reputationMin: Math.min(...ys.map((y) => y.reputation)),
    stuckHarvest: r.stuckHarvest, longTasks: r.longTasks, badNumbers: r.badNumbers,
    investTotal: ys.reduce((a, y) => a + (y.costs.Maschinenkauf ?? 0) + (y.costs.Bau ?? 0), 0),
    bankruptYear: r.bankruptYear,
  };
}

/** Vergleichstabelle (Markdown) */
export function strategyTable(rows: StrategySummary[]): string {
  const k = (v: number) => Math.round(v / 1000).toLocaleString('de-DE');
  const L = [
    '| Strategie | Invest | Jahre | Umsatz Ø letzte 5 J. (T€) | Gewinn Ø letzte 5 J. (T€) | Gewinnjahre | Gewinn gesamt (T€) | Eigenkapital Ende (T€) | EK min (T€) | Schulden max (T€) | Sanierung ab | Insolvenz | Dienste | Schlepper / Maschinen / Personal | verspätet % | storniert % | Ruf Ende (min) | hängende Ernte | Rechenzeit |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | --- | ---: | ---: | --- | ---: | ---: |',
  ];
  for (const r of rows) {
    L.push(`| ${r.key} | ${r.invest} | ${r.years} | ${k(r.revenueLate)} | ${k(r.profitLate)} | ${r.profitYears}/${r.years} | ${k(r.profitTotal)} | ${k(r.equityEnd)} | ${k(r.equityMin)} | ${k(r.debtMax)} | ${r.firstSanierung ?? '–'} | ${r.bankruptYear ?? '–'} | ${r.services} | ${r.tractorsEnd} / ${r.machinesEnd} / ${r.staffEnd} | ${r.lateShare} | ${r.cancelShare} | ${r.reputationEnd} (${r.reputationMin}) | ${r.stuckHarvest} | ${r.seconds} s |`);
  }
  return L.join('\n') + '\n';
}
