/**
 * Wirtschaftlichkeits-Simulation: ein einfacher, regelbasierter „Spieler“ führt den Lohnbetrieb
 * über ein oder mehrere Spieljahre auf den echten Kartendaten. Er besucht Betriebe, nimmt
 * machbare Anfragen an, kauft fehlende Geräte, startet Aufträge mit freien Gespannen, stellt bei
 * Auftragsstau Leute ein, kauft Schlepper dazu, nimmt bei Geldmangel Kredit auf und erinnert an
 * offene Rechnungen. Das Ergebnis ist ein Monatsbericht für die Prüfung der Spielbalance.
 */
import type { Simulation } from '../../src/sim/engine';
import { CATALOG, dealersFor } from '../../src/data/catalog';
import { SERVICE_IMPLEMENT, SERVICE_SKILL, type Order, type Service } from '../../src/sim/business';
import { gameDate } from '../../src/sim/economy';

/** Dienste, die der Bot fährt (Schlepper + Gerät, ohne Ernteketten und Transporte) */
const BOT_SERVICES: Service[] = ['grubbern', 'stoppel', 'saat', 'einzelkorn', 'pflanzenschutz', 'pressen', 'guelle', 'striegeln', 'hacken'];

export interface MonthRow {
  label: string;
  cash: number;
  equity: number;
  debt: number;
  revenue: number;
  expenses: number;
  ordersDone: number;
  ordersOpen: number;
  known: number;
  tractors: number;
  implementsCount: number;
  staff: number;
  reputation: number;
}

export interface BotResult {
  months: MonthRow[];
  years: { year: number; revenue: number; expenses: number; afa: number; profit: number }[];
  orders: { done: number; late: number; cancelled: number; byService: Record<string, { n: number; ha: number; revenue: number; margin: number }> };
  purchases: string[];
  hires: string[];
  loans: number;
  log: string[];
}

export function runEconomyBot(s: Simulation, days: number): BotResult {
  const b = s.business;
  const c = s.company;
  const log: string[] = [];
  const purchases: string[] = [];
  const hires: string[] = [];
  let loans = 0;
  let missed = 0;
  const months: MonthRow[] = [];
  const fs = s.farms!;
  // Betriebe nach Entfernung zur Hofstelle (Luftlinie im Graphen)
  const g = (s as unknown as { graph: { x: Float64Array | Float32Array; y: Float64Array | Float32Array } }).graph;
  const hx = g.x[s.homeNode], hy = g.y[s.homeNode];
  const byDist = fs.farms.map((f) => ({ id: f.id, d: Math.hypot(g.x[f.homeNode] - hx, g.y[f.homeNode] - hy) })).sort((a, z) => a.d - z.d).map((x) => x.id);
  const day0 = Math.floor(s.time / 1440);
  let lastMonth = gameDate(s.time).month;
  let monthRevenue = 0, monthExpenses = 0, ledgerSeen = b.ledger.length;
  const say = (t: string) => { log.push(`${gameDate(s.time).day}.${gameDate(s.time).month}.${gameDate(s.time).year}: ${t}`); };

  const free = (id: number) => !(s as unknown as { machineBusy(id: number): boolean }).machineBusy(id) && (c.machines.find((m) => m.id === id)?.downUntil ?? 0) <= s.time;
  const tractors = () => c.machines.filter((m) => m.type === 'schlepper');

  /** Darlehen für Investitionen (5 Jahre), solange der Kreditrahmen reicht */
  const borrow = (need: number): boolean => {
    const amount = Math.ceil((need + 20_000) / 10_000) * 10_000;
    if (c.creditLimit - c.loan < amount) return false;
    const r = s.command({ kind: 'takeLoan', amount, years: 5 });
    if (/ausgezahlt/.test(r)) { loans += amount; say(`Darlehen ${amount} € (${r})`); return true; }
    return false;
  };

  /** fehlendes Gerät beschaffen: gebraucht vom Markt, sonst neu bestellen (bei Bedarf mit Darlehen) */
  const buyImplement = (type: string): boolean => {
    if (c.machines.some((m) => m.type === type)) return true;
    if (b.deliveries.some((d) => d.machine.type === type)) return false; // kommt schon
    const cheapest = Math.min(...b.offers.filter((o) => o.machine.type === type).map((o) => o.price), ...CATALOG.filter((m) => m.type === type).map((m) => m.newPrice));
    if (Number.isFinite(cheapest) && c.cash - cheapest < 20_000) borrow(cheapest - c.cash);
    const used = b.offers.filter((o) => o.machine.type === type).sort((x, y) => x.price - y.price)[0];
    if (used && c.cash - used.price > 20_000) {
      const r = s.command({ kind: 'buy', offerId: used.id });
      if (!/Geld|nicht/.test(r)) { purchases.push(`${gameDate(s.time).month}/${gameDate(s.time).year} gebraucht ${type} ${used.machine.brand} ${used.machine.model} für ${Math.round(used.price)} €`); return true; }
    }
    if (b.deliveries.some((d) => d.machine.type === type)) return false;
    const model = CATALOG.filter((m) => m.type === type).sort((x, y) => x.newPrice - y.newPrice)[0];
    if (!model) return false;
    const dealer = dealersFor(model.brand)[0];
    if (!dealer || c.cash - model.newPrice < 15_000) return false;
    const r = s.command({ kind: 'order', dealerId: dealer.id, modelKey: model.key });
    if (/bestellt|Lieferung/i.test(r)) purchases.push(`${gameDate(s.time).month}/${gameDate(s.time).year} neu ${type} ${model.brand} ${model.model} (${r})`);
    return false;
  };

  /** offene Aufträge mit freien Fahrern und Gespannen starten */
  const startJobs = () => {
    const open = b.orders.filter((o) => o.status === 'offen' && BOT_SERVICES.includes(o.service) && o.ownLeaseId === undefined);
    for (const o of open) {
      if (s.queue.some((q) => q.cmd.kind === 'startJob' && q.cmd.orderId === o.id)) continue;
      const implType = SERVICE_IMPLEMENT[o.service];
      for (const d of c.drivers) {
        if ((d.skills[SERVICE_SKILL[o.service]] ?? 0) < 1 || (d.skills.boden ?? 0) < 1) continue;
        if (s.driverBusy(d.id) || s.queue.some((q) => q.driverId === d.id)) continue;
        let impl = c.machines.find((m) => m.type === implType && free(m.id));
        if (!impl && tractors().some((m) => free(m.id))) {
          // alle Geräte dieser Art im Einsatz, aber Schlepper und Fahrer frei: zweites Gerät gebraucht kaufen
          const used = b.offers.filter((x) => x.machine.type === implType).sort((x, y) => x.price - y.price)[0];
          if (used && c.cash - used.price < 15_000) borrow(used.price + 15_000 - c.cash);
          if (used && c.cash - used.price >= 15_000 && !/Geld/.test(s.command({ kind: 'buy', offerId: used.id }))) {
            purchases.push(`${gameDate(s.time).month}/${gameDate(s.time).year} weiteres ${implType} gebraucht für ${Math.round(used.price)} €`);
            impl = c.machines.find((m) => m.type === implType && free(m.id));
          }
        }
        if (!impl) break;
        const tr = tractors().find((m) => free(m.id) && (m.power ?? 0) >= (impl.powerNeed ?? 0));
        if (!tr) break;
        const r = s.command({ kind: 'startJob', orderId: o.id, tractorId: tr.id, implementId: impl.id, driverId: d.id });
        if (/gestartet|Eingeplant/.test(r)) break;
      }
    }
  };

  /** Tagesentscheidungen um 06:30 */
  const daily = () => {
    // Anfragen beantworten: machbare Dienste annehmen (Kapazität: 3 offene Aufträge je Schlepper)
    const openOrders = b.orders.filter((o) => o.status !== 'fertig').length;
    let capacity = tractors().length * 2 - openOrders;
    for (const r of b.requests.filter((x) => x.status === 'offen')) {
      const doable = BOT_SERVICES.includes(r.service) && (r.service !== 'pflanzenschutz' || c.drivers.some((d) => (d.skills.pflanzenschutz ?? 0) >= 1));
      const type = SERVICE_IMPLEMENT[r.service];
      // Gerät da oder sofort beschaffbar; bestellte Neumaschinen kommen erst in Wochen
      const ready = doable && capacity > 0 && buyImplement(type) && c.machines.some((m) => m.type === type);
      if (ready) {
        const m = s.command({ kind: 'respond', requestId: r.id, action: 'accept' });
        if (m === 'Auftrag angelegt') capacity--;
      } else {
        // aus Kapazitätsgründen abgelehnt: Signal fürs Wachstum
        if (doable && capacity <= 0 && c.machines.some((m) => m.type === type)) missed++;
        s.command({ kind: 'respond', requestId: r.id, action: 'reject' });
      }
    }
    // Zahlungen erinnern, Wünsche der Mitarbeiter erfüllen
    for (const inv of b.invoices) if (inv.status === 'überfällig' && inv.remindedAt === undefined) s.command({ kind: 'remind', invoiceId: inv.id });
    for (const w of b.staffRequests) s.command({ kind: 'staffAnswer', requestId: w.id, accept: true });
    for (const e of c.drivers) if (e.poach) s.command({ kind: 'poachAnswer', employeeId: e.id, match: true });
    // Pannen: Händler-Werkstatt
    for (const m of c.machines) if (m.repair?.state === 'wartet') s.command({ kind: 'repair', machineId: m.id, mode: 'dealer' });
    // Wartung fälliger Maschinen, wenn frei
    for (const m of c.machines) if (m.serviceAtH !== undefined && m.hours >= m.serviceAtH && free(m.id) && m.type !== 'firmenwagen') s.command({ kind: 'service', machineId: m.id });
    // Pflanzenschutz-Sachkunde für den Chef im ersten Winter
    const chef = c.drivers[0];
    if ((chef.skills.pflanzenschutz ?? 0) < 1 && !chef.course && gameDate(s.time).month === 1 && c.cash > 5_000) s.command({ kind: 'course', employeeId: chef.id, course: 'sachkunde' });
    // Geld: Kontokorrent nicht überziehen, sonst Darlehen
    if (c.cash < 5_000 && c.creditLimit - c.loan > 50_000) {
      const r = s.command({ kind: 'takeLoan', amount: 50_000, years: 5 });
      if (/ausgezahlt/.test(r)) { loans += 50_000; say(`Darlehen 50.000 € (${r})`); }
    }
    // Wachstum: wenn wegen voller Auslastung Anfragen abgelehnt werden, Fahrer einstellen und Schlepper kaufen
    missed *= 0.92;
    if (missed >= 3 && tractors().length < 6) {
      const drivers = c.drivers.filter((d) => (d.skills.boden ?? 0) >= 1).length;
      if (drivers <= tractors().length && b.applicants.length && c.cash > 20_000) {
        const a = [...b.applicants].sort((x, y) => (y.person.skills.boden ?? 0) - (x.person.skills.boden ?? 0))[0];
        // Saisonkräfte: Stundenlohn nur für geleistete Arbeit (im Winter keine Kosten)
        const r = s.command({ kind: 'hire', applicantId: a.id, asKind: 'saison' });
        hires.push(`${gameDate(s.time).month}/${gameDate(s.time).year} ${a.person.name} (${r})`);
      } else if (drivers > tractors().length) {
        const used = b.offers.filter((o) => o.machine.type === 'schlepper' && (o.machine.power ?? 0) >= 140).sort((x, y) => x.price - y.price)[0];
        if (used && c.cash - used.price < 25_000) borrow(used.price + 25_000 - c.cash);
        if (used && c.cash - used.price > 25_000) {
          const r = s.command({ kind: 'buy', offerId: used.id });
          purchases.push(`${gameDate(s.time).month}/${gameDate(s.time).year} gebraucht Schlepper ${used.machine.brand} ${used.machine.model} ${used.machine.power} PS für ${Math.round(used.price)} € (${r})`);
        }
      }
      missed = 0;
    }
    // Kunden gewinnen: nächste unbekannte Betriebe besuchen (Chef, wenn er nichts fährt)
    const target = 12 + 18 * tractors().length;
    const known = fs.farms.filter((f) => f.known).length;
    if (known < target && !s.chefBusy && !s.queue.some((q) => q.cmd.kind === 'visit')) {
      const next = byDist.find((id) => !fs.farms[id].known && !fs.farms[id].closed);
      if (next !== undefined) s.command({ kind: 'visit', farmId: next });
    }
    // alte Bekannte ab und zu besuchen (Beziehungspflege, neue Anfragen)
    if (gameDate(s.time).day % 7 === 0 && !s.chefBusy) {
      const fav = fs.farms.filter((f) => f.known && f.satisfaction < 60 && !f.closed)[0];
      if (fav) s.command({ kind: 'visit', farmId: fav.id });
    }
  };

  const monthRow = () => {
    const bal = b.balance(s.time);
    const d = gameDate(s.time - 1440);
    months.push({
      label: `${String(d.month).padStart(2, '0')}/${d.year}`,
      cash: Math.round(c.cash), equity: Math.round(bal.equity), debt: Math.round(bal.debt),
      revenue: Math.round(monthRevenue), expenses: Math.round(monthExpenses),
      ordersDone: b.orders.filter((o) => o.status === 'fertig').length,
      ordersOpen: b.orders.filter((o) => o.status !== 'fertig').length,
      known: fs.farms.filter((f) => f.known).length,
      tractors: tractors().length,
      implementsCount: c.machines.filter((m) => m.type !== 'schlepper' && m.type !== 'firmenwagen').length,
      staff: c.drivers.length,
      reputation: Math.round(b.reputation),
    });
    monthRevenue = 0; monthExpenses = 0;
  };

  for (let day = 0; day < days; day++) {
    b.drainEvents(); s.drainRoutes(); // macht im Spiel die Oberfläche
    // Tag in Schritten: Entscheidungen um 06:30, Aufträge starten alle 2 Stunden bis 16 Uhr
    for (let minute = 0; minute < 1440; minute++) {
      const mod = s.time % 1440;
      if (mod === 30) daily();
      if (mod % 120 === 45 && mod < 10 * 60) startJobs();
      s.step();
    }
    // Buchungen für den Monatsbericht
    for (; ledgerSeen < b.ledger.length; ledgerSeen++) {
      const l = b.ledger[ledgerSeen];
      if (l.category === 'Rechnung' || l.category === 'Ernte' || l.category === 'Strom') monthRevenue += l.amount;
      else if (l.amount < 0 && !['Maschinenkauf', 'Kredit', 'Tilgung', 'Bau', 'Steuern'].includes(l.category)) monthExpenses -= l.amount;
    }
    const m = gameDate(s.time).month;
    if (m !== lastMonth) { monthRow(); lastMonth = m; }
  }
  void day0;
  // Auswertung je Dienst
  const byService: BotResult['orders']['byService'] = {};
  let done = 0, late = 0, cancelled = 0;
  for (const o of b.orders as Order[]) {
    if (o.cancelled) { cancelled++; continue; }
    if (o.status !== 'fertig' || o.farmId < 0) continue;
    done++;
    if ((o.finishedAt ?? 0) > o.latest) late++;
    const r = b.orderResult(o);
    const e = (byService[o.service] ??= { n: 0, ha: 0, revenue: 0, margin: 0 });
    e.n++; e.ha += o.areaHa; e.revenue += r.revenue; e.margin += r.margin;
  }
  for (const e of Object.values(byService)) { e.ha = Math.round(e.ha); e.revenue = Math.round(e.revenue); e.margin = Math.round(e.margin); }
  const years = b.years.map((y) => ({ year: y.year, revenue: Math.round(y.revenue), expenses: Math.round(y.expenses), afa: Math.round(y.afa), profit: Math.round(y.profit) }));
  return { months, years, orders: { done, late, cancelled, byService }, purchases, hires, loans, log };
}

/** Bericht als Markdown */
export function reportMarkdown(r: BotResult, title: string): string {
  const eur = (v: number) => `${Math.round(v).toLocaleString('de-DE')} €`;
  const lines = [`# ${title}`, '', '## Monate', '', '| Monat | Kasse | Eigenkapital | Schulden | Umsatz | Kosten | Aufträge fertig | offen | Kunden bekannt | Schlepper | Geräte | Personal | Ruf |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
  for (const m of r.months) lines.push(`| ${m.label} | ${eur(m.cash)} | ${eur(m.equity)} | ${eur(m.debt)} | ${eur(m.revenue)} | ${eur(m.expenses)} | ${m.ordersDone} | ${m.ordersOpen} | ${m.known} | ${m.tractors} | ${m.implementsCount} | ${m.staff} | ${m.reputation} |`);
  lines.push('', '## Jahresabschlüsse', '', '| Jahr | Umsatz | Kosten | AfA | Gewinn |', '| --- | ---: | ---: | ---: | ---: |');
  for (const y of r.years) lines.push(`| ${y.year} | ${eur(y.revenue)} | ${eur(y.expenses)} | ${eur(y.afa)} | ${eur(y.profit)} |`);
  lines.push('', '## Aufträge je Dienst', '', `Fertig: ${r.orders.done}, davon verspätet: ${r.orders.late}; vom Kunden storniert: ${r.orders.cancelled}`, '', '| Dienst | Aufträge | ha | Umsatz | Deckungsbeitrag | DB/ha |', '| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const [k, v] of Object.entries(r.orders.byService)) lines.push(`| ${k} | ${v.n} | ${v.ha} | ${eur(v.revenue)} | ${eur(v.margin)} | ${v.ha ? eur(v.margin / v.ha) : '–'} |`);
  lines.push('', '## Käufe', '', ...r.purchases.map((p) => `- ${p}`), '', '## Einstellungen', '', ...r.hires.map((h) => `- ${h}`), '', `Darlehen aufgenommen: ${eur(r.loans)}`, '', '## Protokoll', '', ...r.log.map((l) => `- ${l}`));
  return lines.join('\n') + '\n';
}
