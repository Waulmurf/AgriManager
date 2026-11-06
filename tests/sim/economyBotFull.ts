/**
 * Langzeit-Simulation „alle Dienste“: ein regelbasierter Spieler baut den Lohnbetrieb über viele
 * Jahre aus – Feldarbeit, Gülle, Ernteketten (Drusch, Häckseln, Rüben- und Kartoffelroden), Lkw-
 * Transport, Kommunal (Ausschreibungen, Winterdienst) und eigener Ackerbau auf Pachtflächen.
 * Er investiert nach einem Plan, wenn Eigenkapital und Kreditrahmen es erlauben, stellt Fahrer
 * mit passender Qualifikation ein oder schickt sie auf Lehrgänge. Ergebnis: Jahresbericht.
 */
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

export interface YearRow {
  year: number;
  revenue: number; expenses: number; afa: number; profit: number; insolvent: boolean;
  byBranch: Record<BranchKey, number>;
  cash: number; equity: number; debt: number;
  tractors: number; machines: number; staffFest: number; staffSaison: number;
  services: string[]; costs: Record<string, number>; bySvc: Record<string, number>; orders: number; late: number; cancelled: number; reputation: number; leaseHa: number; known: number;
}

export interface FullResult { years: YearRow[]; purchases: string[]; log: string[]; seconds: number }

export function runFullBot(s: Simulation, years: number): FullResult {
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
  const yearAcc = () => ({ byBranch: { feld: 0, ernte: 0, transport: 0, kommunal: 0, ackerbau: 0 } as Record<BranchKey, number>, services: new Set<string>(), orders: 0, late: 0, cancelled: 0, costs: {} as Record<string, number>, bySvc: {} as Record<string, number>, svcOrders: {} as Record<string, number> });
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
    const used = b.offers.filter((o) => o.machine.type === type && (o.machine.power ?? 999) >= minPower && o.machine.condition >= 50).sort((x, y) => x.price - y.price)[0];
    if (used) {
      if (c.cash - used.price < 25_000 && c.creditLimit - c.loan > used.price) borrow(used.price + 25_000 - c.cash);
      if (c.cash - used.price >= 25_000 && !/Geld|nicht/.test(s.command({ kind: 'buy', offerId: used.id }))) {
        purchases.push(`${gameDate(s.time).month}/${gameDate(s.time).year}: ${type} gebraucht ${used.machine.brand} ${used.machine.model} ${Math.round(used.price).toLocaleString('de-DE')} € (${why})`);
        return true;
      }
    }
    if (b.deliveries.some((d) => d.machine.type === type)) return false;
    const model = CATALOG.filter((m) => m.type === type && (m.power ?? 999) >= minPower).sort((x, y) => x.newPrice - y.newPrice)[0];
    const dealer = model && dealersFor(model.brand)[0];
    if (!model || !dealer) return false;
    const lease = c.cash - model.newPrice < 50_000;
    if (lease && !allowLease) return false;
    const r = s.command({ kind: 'order', dealerId: dealer.id, modelKey: model.key, leaseMonths: lease ? 60 : undefined });
    if (/bestellt|geleast/.test(r)) { purchases.push(`${gameDate(s.time).month}/${gameDate(s.time).year}: ${type} neu ${lease ? 'geleast' : 'gekauft'} ${model.brand} ${model.model} ${model.newPrice.toLocaleString('de-DE')} € (${why})`); return true; }
    return false;
  };

  /** Ausbau: gebraucht (Zustand ≥ 50), sonst neu mit Darlehen bzw. Leasing */
  const buyPlan = (type: MachineType, usedOnly: boolean, allowLease: boolean): boolean => {
    const used = b.offers.filter((o) => o.machine.type === type && o.machine.condition >= 50).sort((x, y) => x.price - y.price)[0];
    if (used) {
      if (c.cash - used.price < 30_000) borrow(used.price + 30_000 - c.cash);
      if (c.cash - used.price >= 30_000 && !/Geld|nicht|Insolvent/.test(s.command({ kind: 'buy', offerId: used.id }))) {
        purchases.push(`${gameDate(s.time).month}/${gameDate(s.time).year}: ${type} gebraucht ${used.machine.brand} ${used.machine.model} ${Math.round(used.price).toLocaleString('de-DE')} € (Ausbauplan)`);
        return true;
      }
      return false;
    }
    if (usedOnly) return false;
    const model = CATALOG.filter((x) => x.type === type).sort((x, y) => x.newPrice - y.newPrice)[0];
    const dealer = model && dealersFor(model.brand)[0];
    if (!model || !dealer) return false;
    if (c.cash - model.newPrice < 30_000) borrow(model.newPrice + 30_000 - c.cash);
    const lease = c.cash - model.newPrice < 30_000;
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
    const healthy = c.insolventAt === undefined && c.cash > 30_000 && (yearNo() <= 2 || lastProfit > -50_000);
    void lastProfit;
    while (planIdx < PLAN.length && PLAN[planIdx].ifBusy && PLAN[planIdx].year <= yearNo() && (ordersLastYear[PLAN[planIdx].ifBusy!] ?? 0) < 40 && m === 1) planIdx++;
    if (planIdx < PLAN.length && PLAN[planIdx].year <= yearNo() && (m <= 3 || m >= 11) && bal.equity > 100_000 && healthy) {
      const p = PLAN[planIdx];
      if (planDueSince < 0) planDueSince = s.time;
      // gebraucht bevorzugt; neu erst nach 6 Monaten Warten – Darlehen, Leasing nur bei viel Eigenkapital
      const waited = s.time - planDueSince > 180 * 1440;
      const usedOnly = !waited;
      const allowLease = waited && bal.equity > 500_000;
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
      const n = ofType(t).length;
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
      } else if (ROUTINE.includes(r.service)) {
        const type = SERVICE_IMPLEMENT[r.service];
        const skillOk = r.service !== 'pflanzenschutz' || c.drivers.some((d) => (d.skills.pflanzenschutz ?? 0) >= 1);
        // je Gerät höchstens zwei offene Aufträge dieser Art, insgesamt höchstens zwei je Schlepper
        const cap = ofType(type).length * 2 - openOf((o) => SERVICE_IMPLEMENT[o.service] === type);
        const tractorCap = ofType('schlepper').length * 2 - openOf((o) => ROUTINE.includes(o.service));
        if (skillOk && !ofType(type).length && !b.deliveries.some((x) => x.machine.type === type)) buy(type, `Anfrage ${r.service}`, 0, false);
        ok = skillOk && cap > 0 && tractorCap > 0 && ofType(type).length > 0;
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
      if (o.salePrice !== undefined || o.playerBid !== undefined || yearNo() < 2 || !farmingPays) continue;
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
      if (n < 3) continue;
      missedBy[type] = 0;
      if (type !== 'schlepper' && util < 0.65 && ofType(type as MachineType).length < 2) { buy(type as MachineType, 'Dienst ausgelastet', 0, false); continue; }
      if (type !== 'schlepper') continue;
      if (ofType('schlepper').length >= 10) continue;
      const drivers = c.drivers.filter((d) => (d.skills.boden ?? 0) >= 1).length;
      if (drivers <= ofType('schlepper').length && b.applicants.length) {
        const a = [...b.applicants].sort((x, y) => (y.person.skills.boden ?? 0) - (x.person.skills.boden ?? 0))[0];
        s.command({ kind: 'hire', applicantId: a.id, asKind: 'saison' });
      }
      if (util > 0.65) buy('schlepper', 'Schlepper ausgelastet', 140, false);
    }
    // Kunden gewinnen
    const known = fs.farms.filter((f) => f.known && !f.closed).length;
    if (known < 15 + 15 * ofType('schlepper').length && !s.chefBusy && !s.queue.some((q) => q.cmd.kind === 'visit')) {
      const next = byDist.find((id) => !fs.farms[id].known && !fs.farms[id].closed);
      if (next !== undefined) s.command({ kind: 'visit', farmId: next });
    }
    // Disponent ab Jahr 6 mit Büro
    if (yearNo() >= 6 && !c.dispatcher) {
      if (!b.hasBuilding('buero') && !c.sites![0].buildings.buero && c.cash > 150_000) s.command({ kind: 'build', siteId: 1, building: 'buero' });
      if (b.hasBuilding('buero')) s.command({ kind: 'dispatcher', action: 'hire' });
    }
    if (yearNo() >= 3 && !c.sites![0].buildings.halle && c.cash > 250_000) {
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

  const yearRow = () => {
    const y = b.years.at(-1);
    const bal = b.balance(s.time);
    rows.push({
      year: y?.year ?? gameDate(s.time).year - 1,
      insolvent: c.insolventAt !== undefined,
      revenue: Math.round(y?.revenue ?? 0), expenses: Math.round(y?.expenses ?? 0), afa: Math.round(y?.afa ?? 0), profit: Math.round(y?.profit ?? 0),
      byBranch: Object.fromEntries(Object.entries(acc.byBranch).map(([k, v]) => [k, Math.round(v)])) as Record<BranchKey, number>,
      cash: Math.round(c.cash), equity: Math.round(bal.equity), debt: Math.round(bal.debt),
      tractors: ofType('schlepper').length, machines: c.machines.length,
      staffFest: c.drivers.filter((d) => d.kind === 'fest' || d.kind === 'chef').length, staffSaison: c.drivers.filter((d) => d.kind === 'saison').length,
      services: [...acc.services].sort(), costs: Object.fromEntries(Object.entries(acc.costs).map(([k, v]) => [k, Math.round(v)])), bySvc: Object.fromEntries(Object.entries(acc.bySvc).map(([k, v]) => [k, Math.round(v)])), orders: acc.orders, late: acc.late, cancelled: acc.cancelled, reputation: Math.round(b.reputation),
      leaseHa: Math.round(b.leases.reduce((a, l) => a + l.areaHa, 0)), known: fs.farms.filter((f) => f.known && !f.closed).length,
    });
    for (const k of Object.keys(ordersLastYear)) delete ordersLastYear[k];
    Object.assign(ordersLastYear, acc.svcOrders);
    acc = yearAcc();
  };

  const days = Math.round(years * 365.25);
  for (let day = 0; day < days; day++) {
    for (let minute = 0; minute < 1440; minute++) {
      const mod = s.time % 1440;
      if (mod === 30) { respond(); admin(); invest(); }
      if (mod % 120 === 45 && mod < 11 * 60) startJobs();
      s.step();
    }
    collect();
    // Jahresabschluss läuft am 1. Januar; danach die Zeile schreiben
    const d = gameDate(s.time);
    if (d.month === 1 && d.day === 1) yearRow();
  }
  return { years: rows, purchases, log, seconds: Math.round((Date.now() - t0) / 1000) };
}

export function fullReport(r: FullResult, title: string): string {
  const k = (v: number) => `${Math.round(v / 1000).toLocaleString('de-DE')}`;
  const L = [`# ${title}`, '', `Rechenzeit: ${r.seconds} s`, '', '## Jahre (Beträge in T€)', '',
    '| Jahr | Umsatz | Feld | Ernte | Transport | Kommunal | Ackerbau | Kosten | AfA | Gewinn | Kasse | Eigenkapital | Schulden | Schlepper | Maschinen | fest | Saison | Pacht ha | Kunden | Aufträge | verspätet | storniert | Ruf | Dienste |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |'];
  for (const y of r.years) {
    L.push(`| ${y.year}${y.insolvent ? ' (insolvent)' : ''} | ${k(y.revenue)} | ${k(y.byBranch.feld)} | ${k(y.byBranch.ernte)} | ${k(y.byBranch.transport)} | ${k(y.byBranch.kommunal)} | ${k(y.byBranch.ackerbau)} | ${k(y.expenses)} | ${k(y.afa)} | ${k(y.profit)} | ${k(y.cash)} | ${k(y.equity)} | ${k(y.debt)} | ${y.tractors} | ${y.machines} | ${y.staffFest} | ${y.staffSaison} | ${y.leaseHa} | ${y.known} | ${y.orders} | ${y.late} | ${y.cancelled} | ${y.reputation} | ${y.services.length} |`);
  }
  const cats = [...new Set(r.years.flatMap((y) => Object.keys(y.costs)))].sort();
  L.push('', '## Ausgaben je Kategorie (T€, Zahlungen inkl. Investitionen)', '', `| Jahr | ${cats.join(' | ')} |`, `| --- |${cats.map(() => ' ---: |').join('')}`);
  for (const y of r.years) L.push(`| ${y.year} | ${cats.map((c) => k(y.costs[c] ?? 0)).join(' | ')} |`);
  const svcs = [...new Set(r.years.flatMap((y) => Object.keys(y.bySvc)))].sort();
  L.push('', '## Umsatz je Dienst (T€)', '', `| Jahr | ${svcs.join(' | ')} |`, `| --- |${svcs.map(() => ' ---: |').join('')}`);
  for (const y of r.years) L.push(`| ${y.year} | ${svcs.map((c) => k(y.bySvc[c] ?? 0)).join(' | ')} |`);
  L.push('', '## Dienste je Jahr', '', ...r.years.map((y) => `- ${y.year}: ${y.services.join(', ') || '–'}`));
  L.push('', '## Investitionen', '', ...r.purchases.map((p) => `- ${p}`), '', '## Protokoll (Auszug)', '', ...r.log.slice(0, 120).map((l) => `- ${l}`));
  return L.join('\n') + '\n';
}
