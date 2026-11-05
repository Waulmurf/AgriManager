/**
 * Geschäftslogik des Lohnbetriebs (Phase 2, Schritt 3): Besuche, Anfragen, Aufträge.
 * Teil des deterministischen Rechenkerns – eigener Zufallsgenerator, damit Spieler-
 * entscheidungen das Verhalten der Testfahrzeuge nicht verändern.
 *
 * Preise und Wahrscheinlichkeiten sind Annahmen (siehe docs/plan.md), beim Testen nachjustierbar.
 */
import { Rng } from './rng';
import { Crop, SURNAMES, type FarmSet } from './farms';
import type { FieldSet } from './fields';
import {
  EMPLOYER_SV, MIN_WAGE, MONTH_HOURS, SKILLS, VACATION_DAYS, marketWage, agencyRate, takeOverFee, AGENCY_MIN_HOURS, XP_MINUTES_PER_LEVEL, baseSkills, gameDate, marketValue,
  serviceInterval, START_OFFERS, type Company, type Employee, type Machine, type MarketOffer, type Skill,
} from './economy';
import { CATALOG, DEALERS, dealersFor, type CatalogModel } from '../data/catalog';

const FIRST_NAMES = [
  'Jan', 'Lars', 'Timo', 'Sven', 'Hauke', 'Malte', 'Jonas', 'Niklas', 'Lukas', 'Finn', 'Ole', 'Tobias',
  'Kevin', 'Dennis', 'Marco', 'Henrik', 'Jannik', 'Tim', 'Bernd', 'Uwe', 'Dirk', 'Heiko', 'Anna', 'Lena',
  'Kim', 'Svenja', 'Jana', 'Maren', 'Wiebke', 'Hanna', 'Piotr', 'Tomasz', 'Andrzej', 'Mihai',
];

/** Bewerbung (PA-01, PA-13): Gehaltsvorstellung nach Skills und Erfahrung */
export interface Applicant {
  id: number;
  person: Omit<Employee, 'id' | 'hiredAt'>;
  /** Bewerbung zieht sich nach diesem Zeitpunkt zurück */
  until: number;
  note: string;
}

/** Ecklohn Lohnunternehmen (Annahme: Tarif BLU/IG BAU 2022 15,40 €, hochgerechnet auf 2027) */
export const ECK_WAGE = 17;
/** Neue Bewerbungen: Wahrscheinlichkeit je Tag, höchstens so viele gleichzeitig */
export const APPLICANT_CHANCE = 0.25;
export const MAX_APPLICANTS = 5;

/** Startpreis Grubbern inkl. Schlepper, Fahrer, Diesel (Annahme, €/ha netto) */
export const BASE_PRICE_GRUBBERN = 55;
/** Besuchsdauer auf dem Hof (Minuten) */
export const VISIT_MINUTES = 30;
/** Antwortfrist für Anfragen (Minuten) – danach fragt der Kunde woanders (KK-09) */
export const REPLY_MINUTES = 2 * 1440;
/** Sehr große Feldblöcke (z. B. Sonderflächen) kommen nicht als Einzelauftrag */
export const MAX_REQUEST_FIELD_HA = 60;
/** Dieselpreis netto (Annahme, Agrardiesel nach Rückvergütung, €/l) */
export const DIESEL_PRICE = 1.35;
/** Zahlungsziel für Rechnungen (Tage): Der Kunde zahlt an einem beliebigen Tag darin */
export const PAYMENT_TERM_DAYS = 30;
/** Frist für den Kontakt nach Überfälligkeit (Tage); ohne Kontakt verfällt die Rechnung */
export const REMIND_DAYS = 14;
/** Telefonat zur Zahlungserinnerung (Arbeitszeit des Chefs, Minuten) */
export const REMIND_CALL_MINUTES = 10;
/** Unter dieser Zufriedenheit wechselt ein Kunde zur Konkurrenz */
export const RIVAL_SWITCH_SATISFACTION = 20;
/** so lange bleibt er dort (Tage, Spanne) */
export const RIVAL_MIN_DAYS = 60;
export const RIVAL_EXTRA_DAYS = 60;
/** Neustart der Zufriedenheit nach der Rückkehr; bis RIVAL_TRUST_SATISFACTION nur kleine Aufträge */
export const RIVAL_RETURN_SATISFACTION = 25;
export const RIVAL_TRUST_SATISFACTION = 40;
/** Probeauftrag: ein Feld bis zu dieser Größe */
export const TRIAL_MAX_HA = 10;
/** kalkulatorische Maschinenkosten für die Auswertung (Annahmen, LWK-Größenordnung) */
export const REPAIR_TRACTOR_EUR_H = 8;
export const WEAR_GRUBBER_EUR_HA = 3;

export type Service = 'grubbern';
export const SERVICE_NAMES: Record<Service, string> = { grubbern: 'Grubbern' };

export type RequestStatus = 'offen' | 'angenommen' | 'abgelehnt' | 'abgelaufen';
export type OrderStatus = 'offen' | 'läuft' | 'fertig';

export interface Request {
  id: number;
  farmId: number;
  service: Service;
  fields: number[];
  areaHa: number;
  /** Zeitfenster für die Arbeit (Spielminuten) */
  earliest: number;
  latest: number;
  /** vom Kunden genannter Preis (€/ha) */
  priceHa: number;
  createdAt: number;
  /** Antwortfrist */
  replyBy: number;
  status: RequestStatus;
  /** über welchen Weg (KK-06/07) */
  channel: 'besuch' | 'anruf' | 'nachricht';
}

export interface Order {
  id: number;
  requestId: number;
  farmId: number;
  service: Service;
  fields: number[];
  doneFields: number[];
  areaHa: number;
  priceHa: number;
  earliest: number;
  latest: number;
  status: OrderStatus;
  tractorId?: number;
  implementId?: number;
  startedAt?: number;
  finishedAt?: number;
  /** verbrauchter Diesel (l) und Kosten (€) für diesen Auftrag */
  dieselL: number;
  dieselCost: number;
  /** Arbeitsstunden des Schleppers für diesen Auftrag (Straße + Feld) */
  tractorHours: number;
  invoiceId?: number;
}

export type InvoiceStatus = 'offen' | 'überfällig' | 'bezahlt' | 'verfallen';

/** Rechnung (AK-09), netto */
export interface Invoice {
  id: number;
  number: string;
  orderId: number;
  farmId: number;
  text: string;
  amount: number;
  issuedAt: number;
  /** Zahlungsziel */
  dueAt: number;
  /** wann der Kunde tatsächlich zahlt (intern); -1 = zahlt erst nach Erinnerung */
  payAt: number;
  paidAt?: number;
  /** überfällig seit; bis contactBy muss der Spieler den Kunden kontaktieren */
  overdueAt?: number;
  contactBy?: number;
  /** Zeitpunkt der Erinnerung (Anruf oder Besuch) */
  remindedAt?: number;
  status: InvoiceStatus;
}

export type LedgerCategory = 'Rechnung' | 'Diesel' | 'Maschinenkauf' | 'Personal' | 'Werkstatt' | 'Sonstiges';

/** Bestellte Neumaschine (HM-06: Lieferzeit) */
export interface Delivery {
  id: number;
  machine: Omit<Machine, 'id'>;
  dealerId: number;
  at: number;
  price: number;
}

/** Werkstattcheck vor dem Kauf auf der Gebrauchtbörse (MZ-11) */
export const CHECK_COST = 180;
/** Inzahlungnahme: Anteil am Marktwert (MZ-12), privat 95–105 % nach 5–25 Tagen */
export const TRADE_IN_SHARE = 0.8;

/** Buchung auf dem Konto (WF-08) */
export interface LedgerEntry {
  time: number;
  text: string;
  amount: number;
  category: LedgerCategory;
}

export interface GameEvent {
  time: number;
  kind: 'besuch' | 'anfrage' | 'auftrag' | 'info' | 'warnung';
  text: string;
  farmId?: number;
}

export type Command =
  | { kind: 'visit'; farmId: number }
  | { kind: 'respond'; requestId: number; action: 'accept' | 'reject' | 'counter'; priceHa?: number }
  | { kind: 'startJob'; orderId: number; tractorId: number; implementId: number; driverId?: number }
  | { kind: 'buy'; offerId: number }
  | { kind: 'recall'; vehicle: number }
  | { kind: 'remind'; invoiceId: number }
  | { kind: 'order'; dealerId: number; modelKey: string }
  | { kind: 'check'; offerId: number }
  | { kind: 'sell'; machineId: number; mode: 'tradein' | 'privat' }
  | { kind: 'service'; machineId: number }
  | { kind: 'hire'; applicantId: number; asKind: 'fest' | 'saison' }
  | { kind: 'fire'; employeeId: number }
  | { kind: 'vacation'; employeeId: number; fromDay: number; days: number }
  | { kind: 'rent'; poolId: number; days: number }
  | { kind: 'extendRent'; employeeId: number; days: number }
  | { kind: 'takeOver'; employeeId: number; asKind: 'fest' | 'saison' }
  | { kind: 'swapDriver'; vehicle: number; driverId: number }
  | { kind: 'staffAnswer'; requestId: number; accept: boolean }
  | { kind: 'setWage'; employeeId: number; wage: number }
  | { kind: 'plan'; orderId: number; driverId: number; tractorId: number; implementId: number; notBefore?: number }
  | { kind: 'queueEdit'; queueId: number; driverId?: number; tractorId?: number; implementId?: number; notBefore?: number | null }
  | { kind: 'dequeue'; queueId: number }
  | { kind: 'queueMove'; queueId: number; dir: -1 | 1 };

/** Befehle, die in die Warteschlange eines Fahrers passen */
export type QueueCommand = Extract<Command, { kind: 'visit' } | { kind: 'startJob' }>;
/** Wunsch eines Mitarbeiters (KK-11, PA-17) */
export interface StaffRequest {
  id: number;
  employeeId: number;
  kind: 'urlaub' | 'gehalt';
  from?: number;
  days?: number;
  wage?: number;
  until: number;
}

export interface QueueItem {
  id: number;
  /** Fahrer, der die Aufgabe übernimmt (Besuche immer der Chef) */
  driverId: number;
  cmd: QueueCommand;
  label: string;
  /** frühester Start (Planungsboard); ohne = so bald wie möglich */
  notBefore?: number;
}

export class Business {
  readonly requests: Request[] = [];
  readonly orders: Order[] = [];
  readonly invoices: Invoice[] = [];
  readonly ledger: LedgerEntry[] = [];
  readonly applicants: Applicant[] = [];
  readonly deliveries: Delivery[] = [];
  readonly staffRequests: StaffRequest[] = [];
  /** Zeitarbeitsfirma: verfügbare Leiharbeiter (Anfrage morgens, ab nächstem Tag im Einsatz) */
  readonly agencyPool: Applicant[] = [];
  /** Umsatz je Händler (Rabatt und Werkstattvorrang, HM-07) */
  readonly dealerSpend: Record<number, number> = {};
  /** aufgelaufene Lohnkosten des laufenden Monats (wird am Monatsersten gebucht) */
  private payrollAccrued = 0;
  /** heute verbrauchter Diesel, wird täglich als eine Buchung zusammengefasst */
  private dieselTodayL = 0;
  private dieselTodayEur = 0;
  readonly offers: MarketOffer[] = START_OFFERS.map((o) => ({ ...o, machine: { ...o.machine } }));
  private events: GameEvent[] = [];
  private rng: Rng;
  private nextId = 1;
  /** gesamter Dieselverbrauch (l) */
  dieselTotalL = 0;
  /** Änderungszähler für die Oberfläche */
  version = 0;

  constructor(
    seed: number,
    readonly company: Company,
    readonly farms: FarmSet | null,
    readonly fields: FieldSet | null,
  ) {
    this.rng = new Rng(seed ^ 0xb051e55);
  }

  /** Zustand für den Spielstand (ohne Betriebe/Felder, die aus dem Seed entstehen) */
  serialize() {
    return {
      rng: this.rng.getState(),
      nextId: this.nextId,
      requests: this.requests,
      orders: this.orders,
      invoices: this.invoices,
      ledger: this.ledger,
      offers: this.offers,
      dieselTotalL: this.dieselTotalL,
      dieselTodayL: this.dieselTodayL,
      dieselTodayEur: this.dieselTodayEur,
      applicants: this.applicants,
      payrollAccrued: this.payrollAccrued,
      deliveries: this.deliveries,
      staffRequests: this.staffRequests,
      agencyPool: this.agencyPool,
      dealerSpend: this.dealerSpend,
    };
  }

  restore(s: ReturnType<Business['serialize']>) {
    this.rng.setState(s.rng);
    this.nextId = s.nextId;
    const put = <T,>(dst: T[], src: T[]) => { dst.length = 0; dst.push(...structuredClone(src)); };
    put(this.requests, s.requests);
    put(this.orders, s.orders);
    put(this.invoices, s.invoices);
    put(this.ledger, s.ledger);
    put(this.offers, s.offers);
    this.dieselTotalL = s.dieselTotalL;
    this.dieselTodayL = s.dieselTodayL;
    this.dieselTodayEur = s.dieselTodayEur;
    put(this.applicants, s.applicants ?? []);
    put(this.deliveries, s.deliveries ?? []);
    put(this.staffRequests, s.staffRequests ?? []);
    put(this.agencyPool, s.agencyPool ?? []);
    for (const k of Object.keys(this.dealerSpend)) delete this.dealerSpend[Number(k)];
    Object.assign(this.dealerSpend, s.dealerSpend ?? {});
    this.payrollAccrued = s.payrollAccrued ?? 0;
    this.events = [];
    this.version++;
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private emit(time: number, kind: GameEvent['kind'], text: string, farmId?: number) {
    this.events.push({ time, kind, text, farmId });
    this.version++;
  }

  /**
   * Zufriedenheit ändern. Fällt sie unter die Schwelle, wechselt der Kunde für eine Weile zur
   * Konkurrenz; offene Anfragen verfallen, angenommene Aufträge bleiben.
   */
  private satisfy(farmId: number, delta: number, time: number) {
    const farm = this.farms?.farms[farmId];
    if (!farm) return;
    farm.satisfaction = Math.max(0, Math.min(100, farm.satisfaction + delta));
    if (delta < 0 && farm.satisfaction < RIVAL_SWITCH_SATISFACTION && farm.rivalUntil <= time) {
      farm.rivalUntil = time + (RIVAL_MIN_DAYS + this.rng.int(RIVAL_EXTRA_DAYS + 1)) * 1440;
      for (const r of this.requests) if (r.farmId === farmId && r.status === 'offen') r.status = 'abgelaufen';
      this.emit(time, 'warnung', `${farm.name} ist unzufrieden und arbeitet ab jetzt mit einem anderen Lohnunternehmen. In einigen Wochen kann man es mit kleinen Aufträgen wieder versuchen.`, farmId);
    }
  }

  /** Kunde ist gerade bei der Konkurrenz */
  isRival(farmId: number, time: number): boolean {
    return (this.farms?.farms[farmId]?.rivalUntil ?? 0) > time;
  }

  /** Kunde wieder zurückgewinnbar, vertraut aber noch nicht: nur Probeaufträge */
  isTrial(farmId: number, time: number): boolean {
    const farm = this.farms?.farms[farmId];
    return !!farm && farm.rivalUntil > 0 && farm.rivalUntil <= time && farm.satisfaction < RIVAL_TRUST_SATISFACTION;
  }

  farmName(id: number): string {
    return this.farms?.farms[id]?.name ?? `Betrieb ${id}`;
  }

  /** Felder, die schon in einer offenen Anfrage oder einem laufenden Auftrag stecken */
  private busyFields(): Set<number> {
    const s = new Set<number>();
    for (const r of this.requests) if (r.status === 'offen') r.fields.forEach((f) => s.add(f));
    for (const o of this.orders) if (o.status !== 'fertig') o.fields.forEach((f) => s.add(f));
    return s;
  }

  /** Saison für Grubbern: Frühjahr vor Mais/Rüben/Kartoffeln (März–Mai), Stoppel (Aug–Okt) */
  private grubberSeason(time: number): boolean {
    const m = gameDate(time).month;
    return (m >= 3 && m <= 5) || (m >= 8 && m <= 10);
  }

  /** Erzeugt ggf. eine Grubber-Anfrage eines Betriebs */
  private maybeRequest(farmId: number, time: number, chance: number, channel: Request['channel']): Request | null {
    const fs = this.farms;
    const f = this.fields;
    if (!fs || !f || !this.grubberSeason(time)) return null;
    const farm = fs.farms[farmId];
    if (this.isRival(farmId, time)) return null;
    if (this.requests.some((r) => r.farmId === farmId && r.status === 'offen')) return null;
    const trial = this.isTrial(farmId, time);
    if (this.rng.next() >= (trial ? chance * 0.5 : chance)) return null;
    const spring = gameDate(time).month <= 5;
    const busy = this.busyFields();
    const cand = farm.fields.filter((i) => {
      if (busy.has(i) || f.areaHa[i] > (trial ? TRIAL_MAX_HA : MAX_REQUEST_FIELD_HA)) return false;
      const c = fs.fieldCrop[i];
      return spring ? c === Crop.Mais || c === Crop.Zuckerrueben || c === Crop.Kartoffeln : c !== Crop.Gruenland;
    });
    if (!cand.length) return null;
    // bis zu 3 Felder, zusammen höchstens 60 ha
    const picked: number[] = [];
    let ha = 0;
    const start = this.rng.int(cand.length);
    for (let k = 0; k < cand.length && picked.length < (trial ? 1 : 3); k++) {
      const i = cand[(start + k) % cand.length];
      if (picked.length && ha + f.areaHa[i] > 60) continue;
      picked.push(i);
      ha += f.areaHa[i];
    }
    const priceHa = Math.round(BASE_PRICE_GRUBBERN * (0.92 + this.rng.next() * 0.16) * 2) / 2;
    const req: Request = {
      id: this.nextId++,
      farmId,
      service: 'grubbern',
      fields: picked,
      areaHa: Math.round(ha * 100) / 100,
      earliest: time,
      latest: time + (5 + this.rng.int(8)) * 1440,
      priceHa,
      createdAt: time,
      replyBy: time + REPLY_MINUTES,
      status: 'offen',
      channel,
    };
    this.requests.push(req);
    return req;
  }

  /** Besuch abgeschlossen: Betrieb kommt ins Adressbuch; „Steht etwas an?“ (KK-04) */
  onVisit(farmId: number, time: number) {
    const farm = this.farms?.farms[farmId];
    if (!farm) return;
    const first = !farm.known;
    farm.known = true;
    if (!first) this.satisfy(farmId, 2, time); // Beziehung pflegen
    // Ein Besuch zählt als Kontakt für überfällige Rechnungen
    for (const inv of this.invoices) if (inv.farmId === farmId && inv.status === 'überfällig' && inv.remindedAt === undefined) this.remindInvoice(inv, time, 'besuch');
    const req = this.maybeRequest(farmId, time, 0.2 + 0.7 * (1 - farm.mechanization), 'besuch');
    if (req) {
      this.emit(time, 'anfrage', `${farm.name}: Grubbern auf ${req.fields.length} ${req.fields.length === 1 ? 'Feld' : 'Feldern'}, ${fmtHa(req.areaHa)} für ${fmtEur(req.priceHa)}/ha`, farmId);
    } else {
      const rival = this.isRival(farmId, time);
      this.emit(time, 'besuch', `${farm.name}: ${first ? 'Kennengelernt, jetzt im Adressbuch.' : 'Besuch beendet.'} ${rival ? 'Arbeitet zurzeit mit einem anderen Lohnunternehmen.' : 'Zurzeit steht nichts an.'}`, farmId);
    }
  }

  /** Täglich um 06:00: Anfragen per Anruf/Nachricht von bekannten Betrieben, Fristen prüfen */
  daily(time: number, workedMinutes: Record<number, number> = {}, surcharge: Record<number, number> = {}, busyDrivers: Set<number> = new Set()) {
    this.bookDiesel(time);
    this.payroll(time, workedMinutes, surcharge);
    this.staffDaily(time, workedMinutes, busyDrivers);
    this.updateApplicants(time);
    this.updateMarket(time);
    this.arriveDeliveries(time);
    // Auftrag steht wegen Panne: Kunde wartet und wird unzufriedener (MZ-07)
    for (const o of this.orders) {
      if (o.status !== 'läuft') continue;
      const down = this.company.machines.some((m) => (m.id === o.tractorId || m.id === o.implementId) && (m.downUntil ?? 0) > time);
      if (down) this.satisfy(o.farmId, -1, time);
    }
    this.checkInvoices(time);
    for (const r of this.requests) {
      if (r.status === 'offen' && time >= r.replyBy) {
        r.status = 'abgelaufen';
        this.emit(time, 'warnung', `${this.farmName(r.farmId)} hat sich anderweitig umgesehen (keine Antwort).`, r.farmId);
        this.satisfy(r.farmId, -5, time);
      }
    }
    const fs = this.farms;
    if (!fs) return;
    for (const farm of fs.farms) {
      if (!farm.known) continue;
      if (farm.rivalUntil > time - 1440 && farm.rivalUntil <= time) {
        farm.satisfaction = Math.max(farm.satisfaction, RIVAL_RETURN_SATISFACTION);
        this.emit(time, 'info', `${farm.name} ist mit der Konkurrenz nicht ganz zufrieden. Mit kleinen Aufträgen lässt sich der Kunde zurückgewinnen.`, farm.id);
      }
      const req = this.maybeRequest(farm.id, time, 0.06 + 0.1 * (1 - farm.mechanization), farm.contact);
      if (req) {
        this.emit(time, 'anfrage', `${farm.contact === 'anruf' ? 'Anruf' : 'Nachricht'} von ${farm.name}: Grubbern ${fmtHa(req.areaHa)}, bis ${fmtDay(req.latest)}, ${fmtEur(req.priceHa)}/ha`, farm.id);
      }
    }
  }

  /** Antwort auf eine Anfrage (AK-06): annehmen, ablehnen, Gegenangebot */
  respond(requestId: number, action: 'accept' | 'reject' | 'counter', time: number, priceHa?: number): string {
    const r = this.requests.find((x) => x.id === requestId);
    if (!r || r.status !== 'offen') return 'Anfrage nicht mehr offen';
    if (action === 'reject') {
      r.status = 'abgelehnt';
      this.emit(time, 'info', `Anfrage von ${this.farmName(r.farmId)} abgelehnt.`, r.farmId);
      this.satisfy(r.farmId, -2, time);
      return 'abgelehnt';
    }
    let price = r.priceHa;
    if (action === 'counter') {
      const p = Math.max(1, priceHa ?? r.priceHa);
      const ratio = p / r.priceHa;
      // +10 % → 60 % Zusage, +25 % → keine Zusage; günstiger nimmt jeder
      const chance = ratio <= 1 ? 1 : Math.max(0, 1 - (ratio - 1) * 4);
      if (this.rng.next() >= chance) {
        r.status = 'abgelehnt';
        this.satisfy(r.farmId, -3, time);
        this.emit(time, 'warnung', `${this.farmName(r.farmId)} lehnt ${fmtEur(p)}/ha ab und vergibt den Auftrag anderweitig.`, r.farmId);
        return 'Kunde lehnt ab';
      }
      if (ratio > 1) this.satisfy(r.farmId, -1, time);
      price = p;
    }
    r.status = 'angenommen';
    const o: Order = {
      id: this.nextId++,
      requestId: r.id,
      farmId: r.farmId,
      service: r.service,
      fields: r.fields.slice(),
      doneFields: [],
      areaHa: r.areaHa,
      priceHa: price,
      earliest: r.earliest,
      latest: r.latest,
      status: 'offen',
      dieselL: 0,
      dieselCost: 0,
      tractorHours: 0,
    };
    this.orders.push(o);
    this.emit(time, 'auftrag', `Auftrag ${this.farmName(r.farmId)}: Grubbern ${fmtHa(o.areaHa)} zu ${fmtEur(price)}/ha, fertig bis ${fmtDay(o.latest)}`, r.farmId);
    return 'Auftrag angelegt';
  }

  /** Gerät kaufen (Startangebote); bezahlt aus dem Konto */
  buy(offerId: number, time: number): string {
    const idx = this.offers.findIndex((o) => o.id === offerId);
    if (idx < 0) return 'Angebot nicht mehr verfügbar';
    const o = this.offers[idx];
    if (this.company.cash < o.price) return 'Nicht genug Geld auf dem Konto';
    this.company.cash -= o.price;
    const id = this.nextMachineId();
    const m: Machine = {
      id, ...structuredClone(o.machine), boughtAt: time, dealerId: o.dealerId || undefined,
      serviceAtH: o.machine.serviceAtH ?? o.machine.hours + serviceInterval(o.machine),
    };
    if (o.warrantyMonths) m.warrantyUntil = time + o.warrantyMonths * 30 * 1440;
    // versteckter Mangel: Zustand ist tatsächlich schlechter als angegeben
    if (m.defect) m.condition = Math.max(10, m.condition - 20);
    this.company.machines.push(m);
    this.offers.splice(idx, 1);
    if (o.dealerId) this.dealerSpend[o.dealerId] = (this.dealerSpend[o.dealerId] ?? 0) + o.price;
    this.ledger.push({ time, text: `Kauf ${o.machine.brand} ${o.machine.model}`, amount: -o.price, category: 'Maschinenkauf' });
    this.emit(time, 'info', `Gekauft: ${o.machine.brand} ${o.machine.model} für ${fmtEur(o.price)}.${m.defect ? ' Beim ersten Einsatz zeigt sich ein Mangel – Zustand schlechter als angegeben.' : ''}`);
    return 'gekauft';
  }

  private nextMachineId(): number {
    let id = this.company.machines.reduce((m, x) => Math.max(m, x.id), 0);
    for (const d of this.deliveries) id = Math.max(id, d.id);
    return id + 1;
  }

  // ---------- Fuhrpark: Händler, Börse, Verkauf, Werkstatt ----------

  /** Rabatt beim Händler (HM-07): 5 % plus 1 % je 50.000 € Umsatz, höchstens 12 % */
  dealerDiscount(dealerId: number): number {
    return Math.min(0.12, 0.05 + Math.floor((this.dealerSpend[dealerId] ?? 0) / 50_000) * 0.01);
  }

  /** Neupreis beim Händler nach Rabatt */
  newPrice(dealerId: number, model: CatalogModel): number {
    return Math.round((model.newPrice * (1 - this.dealerDiscount(dealerId))) / 100) * 100;
  }

  /** Neumaschine bestellen (HM-06): Anzahlung entfällt, bezahlt wird bei Lieferung */
  order(dealerId: number, modelKey: string, time: number): string {
    const d = DEALERS.find((x) => x.id === dealerId);
    const m = CATALOG.find((x) => x.key === modelKey);
    if (!d || !m) return 'Modell nicht lieferbar';
    if (![...d.tractorBrands, ...d.implementBrands].includes(m.brand)) return `${d.name} führt ${m.brand} nicht`;
    const price = this.newPrice(dealerId, m);
    const committed = this.deliveries.reduce((a, x) => a + x.price, 0);
    if (this.company.cash - committed < price) return 'Nicht genug Geld für Bestellung und Lieferung';
    const weeks = m.deliveryWeeks + (this.rng.int(3) - 1);
    const del: Delivery = {
      id: this.nextMachineId(),
      machine: {
        type: m.type, brand: m.brand, model: m.model, year: gameDate(time).year, hours: 0, condition: 100,
        newPrice: m.newPrice, power: m.power, width: m.width, powerNeed: m.powerNeed, haPerHour: m.haPerHour,
        workKmh: m.workKmh, dieselLHa: m.dieselLHa, serviceAtH: serviceInterval(m),
      },
      dealerId,
      at: time + weeks * 7 * 1440,
      price,
    };
    this.deliveries.push(del);
    this.emit(time, 'info', `Bestellt bei ${d.name}: ${m.brand} ${m.model} für ${fmtEur(price)}, Lieferung etwa ${fmtDay(del.at)}.`);
    return `bestellt, Lieferung etwa ${fmtDay(del.at)}`;
  }

  private arriveDeliveries(time: number) {
    for (let i = this.deliveries.length - 1; i >= 0; i--) {
      const d = this.deliveries[i];
      if (d.at > time) continue;
      this.deliveries.splice(i, 1);
      this.company.cash = Math.round((this.company.cash - d.price) * 100) / 100;
      this.company.machines.push({ id: d.id, ...d.machine, boughtAt: time, dealerId: d.dealerId, warrantyUntil: time + 24 * 30 * 1440 });
      this.dealerSpend[d.dealerId] = (this.dealerSpend[d.dealerId] ?? 0) + d.price;
      this.ledger.push({ time, text: `Lieferung ${d.machine.brand} ${d.machine.model}`, amount: -d.price, category: 'Maschinenkauf' });
      this.emit(time, 'info', `Geliefert: ${d.machine.brand} ${d.machine.model} steht am Hof (${fmtEur(d.price)} bezahlt, 24 Monate Gewährleistung).`);
    }
  }

  /** Gebrauchtangebote bei Händlern (mit Gewährleistung) und auf der Börse (privat) erneuern */
  private updateMarket(time: number) {
    for (let i = this.offers.length - 1; i >= 0; i--) {
      const u = this.offers[i].until;
      if (u !== undefined && u <= time) this.offers.splice(i, 1);
    }
    for (const d of DEALERS) {
      const brands = [...d.tractorBrands, ...d.implementBrands];
      const models = CATALOG.filter((m) => brands.includes(m.brand));
      if (!models.length) continue;
      const have = this.offers.filter((o) => o.dealerId === d.id).length;
      if (have < 3 && this.rng.next() < 0.3) this.offers.push(this.usedOffer(models[this.rng.int(models.length)], time, d.id));
    }
    const priv = this.offers.filter((o) => o.dealerId === 0).length;
    if (priv < 6 && this.rng.next() < 0.4) this.offers.push(this.usedOffer(CATALOG[this.rng.int(CATALOG.length)], time, 0));
  }

  private usedOffer(m: CatalogModel, time: number, dealerId: number): MarketOffer {
    const r = this.rng;
    const year = gameDate(time).year;
    const age = 2 + r.int(13);
    const tractor = m.type === 'schlepper';
    const hours = Math.round(age * (tractor ? 350 + r.int(450) : 80 + r.int(120)) / 10) * 10;
    let condition = Math.round(100 - age * 2 - hours / (tractor ? 250 : 60) + r.int(11) - 5);
    condition = Math.max(25, Math.min(95, condition));
    const value = marketValue(m.newPrice, age, hours) * (0.9 + condition / 500);
    const dealer = DEALERS.find((x) => x.id === dealerId);
    const factor = dealer ? 1.05 + r.next() * 0.1 : 0.85 + r.next() * 0.15;
    const price = Math.round((value * factor) / 100) * 100;
    const towns = ['Bad Bevensen', 'Bienenbüttel', 'Ebstorf', 'Bodenteich', 'Rosche', 'Clenze', 'Hankensbüttel', 'Dannenberg', 'Gifhorn', 'Lüchow'];
    return {
      id: 1000 + this.nextId++,
      machine: {
        type: m.type, brand: m.brand, model: m.model, year: year - age, hours, condition, newPrice: m.newPrice,
        power: m.power, width: m.width, powerNeed: m.powerNeed, haPerHour: m.haPerHour, workKmh: m.workKmh, dieselLHa: m.dieselLHa,
        serviceAtH: hours + (r.next() < 0.3 ? -50 : serviceInterval(m) - r.int(200)),
        // privat: jeder vierte mit verstecktem Mangel
        defect: !dealer && r.next() < 0.25 ? true : undefined,
      },
      price,
      seller: dealer ? `${dealer.name} (Händler)` : `Privat, ${towns[r.int(towns.length)]}`,
      note: dealer ? 'Gebraucht vom Händler, Gewährleistung 6 Monate' : 'Gebrauchtbörse, ohne Gewährleistung',
      dealerId,
      warrantyMonths: dealer ? 6 : 0,
      until: time + (14 + r.int(30)) * 1440,
    };
  }

  /** Werkstattcheck vor dem Kauf: kostet Geld, deckt versteckte Mängel auf (MZ-11) */
  check(offerId: number, time: number): string {
    const o = this.offers.find((x) => x.id === offerId);
    if (!o) return 'Angebot nicht mehr verfügbar';
    if (o.checked) return 'Schon geprüft';
    if (o.dealerId) return 'Händlermaschinen sind geprüft';
    this.payWorkshop(time, CHECK_COST, `Werkstattcheck ${o.machine.brand} ${o.machine.model}`);
    o.checked = true;
    this.version++;
    return o.machine.defect ? `Mangel gefunden: Zustand eher ${Math.max(10, o.machine.condition - 20)} % statt ${o.machine.condition} %` : 'Keine Mängel gefunden';
  }

  private payWorkshop(time: number, amount: number, text: string, m?: Machine) {
    const a = Math.round(amount * 100) / 100;
    this.company.cash = Math.round((this.company.cash - a) * 100) / 100;
    this.ledger.push({ time, text, amount: -a, category: 'Werkstatt' });
    if (m) m.costTotal = Math.round(((m.costTotal ?? 0) + a) * 100) / 100;
  }

  /** Marktwert einer eigenen Maschine (Startformel, Zustand verschiebt ±) */
  machineValueNow(m: Machine, time: number): number {
    const age = Math.max(0, gameDate(time).year - m.year);
    return Math.round(marketValue(m.newPrice, age, m.hours) * (0.9 + m.condition / 500));
  }

  /** Verkaufen: Inzahlungnahme sofort, privat nach einigen Tagen zu besserem Preis (MZ-12) */
  sell(machineId: number, mode: 'tradein' | 'privat', time: number): string {
    const m = this.company.machines.find((x) => x.id === machineId);
    if (!m) return 'Maschine unbekannt';
    if (m.type === 'firmenwagen' && this.company.machines.filter((x) => x.type === 'firmenwagen').length < 2) return 'Ohne Firmenwagen sind keine Besuche möglich';
    const value = this.machineValueNow(m, time);
    if (mode === 'tradein') {
      const price = Math.round((value * TRADE_IN_SHARE) / 100) * 100;
      this.removeMachine(m, price, time, 'in Zahlung gegeben');
      return `in Zahlung gegeben für ${fmtEur(price)}`;
    }
    if (m.saleAt !== undefined) return 'Ist schon inseriert';
    m.saleAt = time + (5 + this.rng.int(21)) * 1440;
    m.salePrice = Math.round((value * (0.95 + this.rng.next() * 0.1)) / 100) * 100;
    this.version++;
    this.emit(time, 'info', `${m.brand} ${m.model} auf der Gebrauchtbörse inseriert (Wert etwa ${fmtEur(value)}).`);
    return 'inseriert – Käufer meldet sich in einigen Tagen';
  }

  /** Privatverkäufe abschließen, sobald ein Käufer da und die Maschine frei ist */
  completeSales(time: number, inUse: Set<number>): number[] {
    const sold: number[] = [];
    for (const m of [...this.company.machines]) {
      if (m.saleAt === undefined || m.saleAt > time || inUse.has(m.id)) continue;
      sold.push(m.id);
      this.removeMachine(m, m.salePrice ?? 0, time, 'privat verkauft');
    }
    return sold;
  }

  private removeMachine(m: Machine, price: number, time: number, how: string) {
    const i = this.company.machines.indexOf(m);
    if (i >= 0) this.company.machines.splice(i, 1);
    this.company.cash = Math.round((this.company.cash + price) * 100) / 100;
    this.ledger.push({ time, text: `Verkauf ${m.brand} ${m.model}`, amount: price, category: 'Maschinenkauf' });
    this.emit(time, 'info', `${m.brand} ${m.model} ${how}: ${fmtEur(price)}.`);
  }

  /** Entfernung (km, Luftlinie × 1,3) zum nächsten Händler der Marke; ohne Händler 60 km */
  dealerKm(brand: string, home: [number, number]): { km: number; name: string; id: number } {
    let best = { km: 60, name: 'Fremdwerkstatt', id: 0 };
    for (const d of dealersFor(brand)) {
      const dx = (d.lonLat[0] - home[0]) * 67, dy = (d.lonLat[1] - home[1]) * 111;
      const km = Math.sqrt(dx * dx + dy * dy) * 1.3;
      if (km < best.km) best = { km, name: d.name, id: d.id };
    }
    return best;
  }

  /** Ernte und Herbst: Werkstätten ausgelastet (HM-08) */
  private workshopBusy(time: number): boolean {
    const mo = gameDate(time).month;
    return mo >= 7 && mo <= 10;
  }

  /** Wartung beim Händler (MZ-05): Maschine einen Arbeitstag weg, Zustand +3, Intervall neu */
  service(m: Machine, time: number, home: [number, number]): string {
    const d = this.dealerKm(m.brand, home);
    const tractor = m.type === 'schlepper' || m.type === 'firmenwagen';
    const cost = Math.round((tractor ? 400 + 0.004 * m.newPrice : 150 + 0.003 * m.newPrice) / 10) * 10;
    // Termin: nach Werkstattlast; Stammkunden kommen schneller dran (HM-07)
    let wait = this.workshopBusy(time) ? 2 : 0;
    if ((this.dealerSpend[d.id] ?? 0) >= 50_000) wait = Math.max(0, wait - 1);
    const hours = 6 + (2 * d.km) / 40;
    m.downUntil = time + wait * 1440 + Math.round(hours * 60);
    m.downReason = `Wartung bei ${d.name}`;
    m.serviceAtH = m.hours + serviceInterval(m);
    m.condition = Math.min(100, m.condition + 3);
    this.payWorkshop(time, cost, `Wartung ${m.brand} ${m.model}`, m);
    this.emit(time, 'info', `${m.brand} ${m.model} zur Wartung bei ${d.name} (${fmtEur(cost)}), zurück etwa ${fmtDay(m.downUntil)} ${fmtTime(m.downUntil)}.`);
    return `Wartung beauftragt, zurück etwa ${fmtDay(m.downUntil)} ${fmtTime(m.downUntil)}`;
  }

  /**
   * Pannenrisiko je Betriebsminute (MZ-04): Grundrate 0,2 % je Stunde, steigt mit sinkendem
   * Zustand, dreifach bei überfälliger Wartung und bei verstecktem Mangel.
   */
  rollBreakdown(m: Machine): boolean {
    let perHour = 0.002 * (1 + (100 - m.condition) / 25);
    if (m.serviceAtH !== undefined && m.hours > m.serviceAtH) perHour *= 3;
    if (m.defect) perHour *= 3;
    return this.rng.next() < perHour / 60;
  }

  /** Panne: Händler-Service kommt, Dauer nach Entfernung und Ersatzteillage (MZ-06, HM-05) */
  breakdown(m: Machine, time: number, home: [number, number], where: string): void {
    const d = this.dealerKm(m.brand, home);
    const r = this.rng.next();
    const parts = r < 0.6 ? 0 : r < 0.85 ? 4 : 24 + this.rng.int(25); // Stunden Ersatzteilwartezeit
    let hours = 1.5 + (2 * d.km) / 50 + parts;
    if (this.workshopBusy(time)) hours *= 1.5;
    m.downUntil = time + Math.round(hours * 60);
    m.downReason = `Panne – ${d.name} repariert`;
    m.breakdowns = (m.breakdowns ?? 0) + 1;
    const warranty = (m.warrantyUntil ?? 0) > time;
    const cost = warranty ? 0 : Math.round((200 + 0.004 * m.newPrice * (0.5 + this.rng.next() * 1.5)) * (1 + (100 - m.condition) / 100) / 10) * 10;
    if (cost) this.payWorkshop(time, cost, `Reparatur ${m.brand} ${m.model}`, m);
    m.defect = undefined; // Mangel ist damit behoben
    this.emit(time, 'warnung', `Panne: ${m.brand} ${m.model} ${where}. ${d.name} kommt, Reparatur etwa ${hours.toLocaleString('de-DE', { maximumFractionDigits: 0 })} h${parts >= 24 ? ' (Ersatzteil muss bestellt werden)' : ''}, ${warranty ? 'Gewährleistung' : fmtEur(cost)}.`);
  }

  /** Verschleiß je Betriebsstunde (MZ-03): Schlepper 0,6 %/100 h, Geräte 2 %/100 h, doppelt bei überfälliger Wartung */
  wear(m: Machine, hours: number): void {
    let rate = m.type === 'schlepper' || m.type === 'firmenwagen' ? 0.006 : 0.02;
    if (m.serviceAtH !== undefined && m.hours > m.serviceAtH) rate *= 2;
    m.condition = Math.max(0, Math.round((m.condition - rate * hours) * 100) / 100);
  }

  /** Reparaturkosten je Schlepperstunde für die Auswertung (steigen mit den Stunden, MZ-03) */
  repairPerHour(m?: Machine): number {
    return Math.round((4 + ((m?.hours ?? 9000) / 1000) * 0.5) * 100) / 100;
  }

  orderStarted(o: Order, tractorId: number, implementId: number, time: number, driver = 'Chef') {
    o.status = 'läuft';
    o.tractorId = tractorId;
    o.implementId = implementId;
    o.startedAt = time;
    this.emit(time, 'auftrag', `Auftrag ${this.farmName(o.farmId)} gestartet (Fahrer: ${driver}).`, o.farmId);
  }

  fieldDone(o: Order, field: number, time: number) {
    o.doneFields.push(field);
    this.version++;
    if (o.doneFields.length === o.fields.length) {
      o.status = 'fertig';
      o.finishedAt = time;
      const onTime = time <= o.latest;
      this.emit(time, 'auftrag', `Auftrag ${this.farmName(o.farmId)} fertig${onTime ? ', pünktlich' : ', verspätet'} (${fmtHa(o.areaHa)}).`, o.farmId);
      this.satisfy(o.farmId, onTime ? 5 : -10, time);
      this.issueInvoice(o, time);
    }
  }

  /** Diesel tanken/abrechnen: Kosten sofort vom Konto, beim Auftrag mitgeschrieben */
  chargeDiesel(liters: number, order: Order | undefined, _time: number) {
    if (liters <= 0) return;
    const cost = liters * DIESEL_PRICE;
    this.company.cash = Math.round((this.company.cash - cost) * 100) / 100;
    this.dieselTotalL += liters;
    this.dieselTodayL += liters;
    this.dieselTodayEur += cost;
    if (order) {
      order.dieselL = Math.round((order.dieselL + liters) * 10) / 10;
      order.dieselCost = Math.round((order.dieselCost + cost) * 100) / 100;
    }
    this.version++;
  }

  /** Dieselkosten des Tages als eine Buchung */
  private bookDiesel(time: number) {
    if (this.dieselTodayEur <= 0) return;
    this.ledger.push({
      time,
      text: `Diesel ${this.dieselTodayL.toLocaleString('de-DE', { maximumFractionDigits: 0 })} l`,
      amount: -Math.round(this.dieselTodayEur * 100) / 100,
      category: 'Diesel',
    });
    this.dieselTodayL = 0;
    this.dieselTodayEur = 0;
  }

  /**
   * Rechnung nach Abschluss (AK-09). Der Kunde zahlt an einem beliebigen Tag innerhalb
   * des Zahlungsziels – oder gar nicht, bis man ihn erinnert (Wahrscheinlichkeit steigt
   * mit sinkender Zufriedenheit).
   */
  private issueInvoice(o: Order, time: number) {
    const farm = this.farms?.farms[o.farmId];
    const sat = farm?.satisfaction ?? 50;
    const late = this.rng.next() < 0.05 + (0.35 * (100 - sat)) / 100;
    const payAt = late ? -1 : time + 1 + this.rng.int(PAYMENT_TERM_DAYS * 1440 - 1);
    const d = gameDate(time);
    const inv: Invoice = {
      id: this.nextId++,
      number: `RE-${d.year}-${String(this.invoices.length + 1).padStart(4, '0')}`,
      orderId: o.id,
      farmId: o.farmId,
      text: `${SERVICE_NAMES[o.service]} ${fmtHa(o.areaHa)} à ${fmtEur(o.priceHa)}/ha`,
      amount: Math.round(o.priceHa * o.areaHa * 100) / 100,
      issuedAt: time,
      dueAt: time + PAYMENT_TERM_DAYS * 1440,
      payAt,
      status: 'offen',
    };
    this.invoices.push(inv);
    o.invoiceId = inv.id;
    this.emit(time, 'info', `Rechnung ${inv.number} an ${this.farmName(o.farmId)}: ${fmtEur(inv.amount)}, zahlbar bis ${fmtDay(inv.dueAt)}.`, o.farmId);
  }

  /** Täglich: Zahlungseingänge, Überfälligkeit (Warnung), Verfall ohne Kontakt */
  private checkInvoices(time: number) {
    for (const inv of this.invoices) {
      const open = inv.status === 'offen' || inv.status === 'überfällig';
      if (!open) continue;
      if (inv.payAt >= 0 && time >= inv.payAt) {
        inv.status = 'bezahlt';
        inv.paidAt = time;
        this.company.cash = Math.round((this.company.cash + inv.amount) * 100) / 100;
        this.ledger.push({ time, text: `Zahlung ${inv.number} ${this.farmName(inv.farmId)}`, amount: inv.amount, category: 'Rechnung' });
        this.emit(time, 'info', `${this.farmName(inv.farmId)} hat Rechnung ${inv.number} bezahlt: ${fmtEur(inv.amount)}${inv.overdueAt !== undefined ? ' (nach Erinnerung)' : ''}.`, inv.farmId);
      } else if (inv.status === 'offen' && time >= inv.dueAt) {
        inv.status = 'überfällig';
        inv.overdueAt = time;
        inv.contactBy = time + REMIND_DAYS * 1440;
        this.emit(time, 'warnung', `Zahlung überfällig: ${this.farmName(inv.farmId)}, Rechnung ${inv.number} (${fmtEur(inv.amount)}). Kunden bis ${fmtDay(inv.contactBy)} kontaktieren, sonst verfällt die Forderung.`, inv.farmId);
      } else if (inv.status === 'überfällig' && inv.remindedAt === undefined && time >= inv.contactBy!) {
        inv.status = 'verfallen';
        this.emit(time, 'warnung', `Forderung verfallen: Rechnung ${inv.number} an ${this.farmName(inv.farmId)} (${fmtEur(inv.amount)}) – Kunde nicht rechtzeitig kontaktiert.`, inv.farmId);
      }
    }
  }

  /** Kunde wegen überfälliger Rechnung kontaktiert: zahlt in 1–10 Tagen, etwas verstimmt */
  private remindInvoice(inv: Invoice, time: number, how: 'anruf' | 'besuch') {
    inv.remindedAt = time;
    inv.payAt = time + (1 + this.rng.int(10)) * 1440;
    this.satisfy(inv.farmId, -3, time);
    this.emit(time, 'info', `${how === 'anruf' ? 'Angerufen' : 'Beim Besuch angesprochen'}: ${this.farmName(inv.farmId)} sagt die Zahlung von ${inv.number} in den nächsten Tagen zu.`, inv.farmId);
  }

  /** Zahlungserinnerung per Telefon (Befehl „remind“) */
  remind(invoiceId: number, time: number): string {
    const inv = this.invoices.find((i) => i.id === invoiceId);
    if (!inv) return 'Rechnung unbekannt';
    if (inv.status !== 'überfällig') return 'Rechnung ist nicht überfällig';
    if (inv.remindedAt !== undefined) return 'Kunde wurde schon erinnert';
    this.remindInvoice(inv, time, 'anruf');
    return 'Kunde angerufen';
  }

  /** Auswertung eines Auftrags (WF-09): Erlös minus Diesel minus kalkulatorische Maschinenkosten */
  orderResult(o: Order): { revenue: number; diesel: number; machines: number; margin: number } {
    const revenue = Math.round(o.priceHa * o.areaHa * 100) / 100;
    const tractor = this.company.machines.find((m) => m.id === o.tractorId);
    const perH = tractor ? this.repairPerHour(tractor) : REPAIR_TRACTOR_EUR_H;
    const machines = Math.round((o.tractorHours * perH + o.areaHa * WEAR_GRUBBER_EUR_HA) * 100) / 100;
    return { revenue, diesel: o.dieselCost, machines, margin: Math.round((revenue - o.dieselCost - machines) * 100) / 100 };
  }

  /** Auftrag unterbrochen (Fahrzeug zurückgerufen): bleibt offen, erledigte Felder zählen */
  orderInterrupted(o: Order, time: number) {
    o.status = 'offen';
    this.emit(time, 'warnung', `Auftrag ${this.farmName(o.farmId)} unterbrochen (${o.doneFields.length}/${o.fields.length} Felder fertig).`, o.farmId);
  }

  // ---------- Personal ----------

  /**
   * Lohnkosten des Vortags aufsummieren (feste: Monatsgehalt ÷ 30 je Kalendertag, Saisonkräfte:
   * geleistete Stunden), am Monatsersten als eine Buchung „Löhne“ abziehen. Je Mitarbeiter
   * Erfahrung aus der Arbeit gutschreiben, macht der Rechenkern über addExperience.
   */
  private payroll(time: number, worked: Record<number, number>, surcharge: Record<number, number> = {}) {
    let day = 0;
    for (const e of this.company.drivers) {
      if (e.kind === 'chef') continue;
      const w = worked[e.id] ?? 0;
      const over = Math.max(0, w - 480); // über 8 h: Überstundenzuschlag 25 % (ZU-03)
      // Zuschläge (ZU-01): gewichtete Minuten aus dem Rechenkern
      let pay = ((surcharge[e.id] ?? 0) / 60) * e.wage + (over / 60) * e.wage * 0.25;
      if (e.kind === 'leih') {
        // Zeitarbeit: Rechnung der Firma nach Stunden, mindestens 4 h je gebuchtem Einsatztag;
        // Zuschläge berechnet die Firma mit (ohne Arbeitgeberanteil, den trägt sie)
        const yesterday = time - 1440;
        const booked = yesterday >= (e.availableFrom ?? 0) && yesterday < (e.contractUntil ?? 0) && !this.absence(e.id, yesterday);
        const hours = Math.max(w / 60, booked ? AGENCY_MIN_HOURS : 0);
        day += hours * (e.agencyRate ?? 30) + ((surcharge[e.id] ?? 0) / 60) * (e.agencyRate ?? 30) * 0.5;
        continue;
      }
      if (e.kind === 'fest') pay += (e.wage * MONTH_HOURS) / 30 + (over / 60) * e.wage;
      else pay += (w / 60) * e.wage;
      day += pay * (1 + EMPLOYER_SV);
    }
    this.payrollAccrued += day;
    if (gameDate(time).day === 1 && this.payrollAccrued > 0) {
      const amount = Math.round(this.payrollAccrued * 100) / 100;
      this.company.cash = Math.round((this.company.cash - amount) * 100) / 100;
      this.ledger.push({ time, text: 'Löhne inkl. Arbeitgeberanteil', amount: -amount, category: 'Personal' });
      this.emit(time, 'info', `Löhne für den Vormonat gezahlt: ${fmtEur(amount)}.`);
      this.payrollAccrued = 0;
    }
  }

  /** Erfahrung sammeln (PA-08); liefert die neue Stufe, falls aufgestiegen */
  addExperience(driverId: number, skill: Skill, minutes: number, time: number): void {
    const e = this.company.drivers.find((d) => d.id === driverId);
    if (!e || minutes <= 0) return;
    const lvl = e.skills[skill] ?? 1;
    if (lvl >= 5) return;
    const xp = (e.xp[skill] ?? 0) + minutes;
    const need = lvl * XP_MINUTES_PER_LEVEL;
    if (xp >= need) {
      e.skills[skill] = lvl + 1;
      e.xp[skill] = xp - need;
      const name = SKILLS.find((k) => k.key === skill)?.name ?? skill;
      this.emit(time, 'info', `${e.name} hat Erfahrung gesammelt: ${name} jetzt Stufe ${lvl + 1}.`);
    } else e.xp[skill] = xp;
    this.version++;
  }

  /** Bewerbungen kommen und gehen (PA-01) */
  private updateApplicants(time: number) {
    for (let i = this.applicants.length - 1; i >= 0; i--) if (this.applicants[i].until <= time) this.applicants.splice(i, 1);
    // erste Bewerbungen schon am ersten Tag, damit man früh jemanden findet
    const n = this.applicants.length;
    if (n < MAX_APPLICANTS && (this.rng.next() < APPLICANT_CHANCE || (n === 0 && time <= 1440))) this.applicants.push(this.makeApplicant(time));
  }

  private makeApplicant(time: number): Applicant {
    const r = this.rng;
    const age = 18 + r.int(45);
    const skills = baseSkills(1);
    // Erfahrung wächst mit dem Alter, Schwerpunkte zufällig
    const exp = Math.min(4, Math.floor((age - 18) / 8) + r.int(2));
    skills.boden = Math.min(5, 1 + r.int(exp + 1));
    for (const k of SKILLS) if (k.key !== 'boden' && r.next() < 0.35) skills[k.key] = Math.min(5, 1 + r.int(exp + 1));
    const licenseC = r.next() < 0.3;
    let top = 0, sum = 0;
    for (const k of SKILLS) { top = Math.max(top, skills[k.key]); sum += skills[k.key] - 1; }
    // Gehaltsvorstellung: Mindestlohn + Stufe der besten Tätigkeit + Breite, LKW-Schein extra
    const wantFest = Math.round((ECK_WAGE - 2 + (top - 1) * 1.1 + sum * 0.15 + (licenseC ? 0.8 : 0) + (r.next() - 0.5)) * 10) / 10;
    const reliability = Math.round((0.5 + r.next() * 0.5) * 100) / 100;
    const resilience = Math.round((0.5 + r.next() * 0.5) * 100) / 100;
    const wage = Math.max(MIN_WAGE, wantFest);
    const first = FIRST_NAMES[r.int(FIRST_NAMES.length)];
    const last = SURNAMES[r.int(SURNAMES.length)];
    const notes = ['sucht feste Stelle', 'auch als Saisonkraft', 'Landwirtssohn, kennt Schlepper', 'kommt aus der Region', 'bisher bei einem anderen Lohnunternehmen'];
    return {
      id: this.nextId++,
      person: { name: `${first} ${last}`, isPlayer: false, kind: 'fest', wage, skills, xp: {}, licenseC, age, reliability, resilience, satisfaction: 70, absences: [] },
      until: time + (7 + r.int(14)) * 1440,
      note: notes[r.int(notes.length)],
    };
  }

  hire(applicantId: number, asKind: 'fest' | 'saison', time: number): string {
    const i = this.applicants.findIndex((a) => a.id === applicantId);
    if (i < 0) return 'Bewerbung nicht mehr aktuell';
    const a = this.applicants[i];
    const id = this.company.drivers.reduce((m, d) => Math.max(m, d.id), 0) + 1;
    // Saisonkräfte verlangen etwas mehr je Stunde, weil sie nur für geleistete Stunden bezahlt werden
    const wage = asKind === 'saison' ? Math.round(a.person.wage * 1.08 * 10) / 10 : a.person.wage;
    // Urlaubsanspruch anteilig für den Rest des Jahres (Spieljahr ab März: 10 Monate)
    const monthsLeft = 12 - gameDate(time).month + 1;
    const vacationLeft = asKind === 'fest' ? Math.round((VACATION_DAYS * monthsLeft) / 12) : 0;
    this.company.drivers.push({ ...structuredClone(a.person), id, kind: asKind, wage, hiredAt: time, vacationLeft, satisfaction: 70, absences: [] });
    this.applicants.splice(i, 1);
    this.emit(time, 'info', `${a.person.name} eingestellt (${asKind === 'fest' ? 'fest' : 'Saisonkraft'}, ${fmtEur(wage)}/h).`);
    return 'eingestellt';
  }

  /**
   * Kündigen: Saisonkräfte sofort (befristet), Feste mit 4 Wochen Frist – sie arbeiten bis dahin
   * weiter und werden bezahlt. Die Engine prüft bei sofortigem Gehen, dass niemand unterwegs ist.
   */
  fire(employeeId: number, time: number, immediate = false): string {
    const i = this.company.drivers.findIndex((d) => d.id === employeeId);
    if (i < 0) return 'Mitarbeiter unbekannt';
    const e = this.company.drivers[i];
    if (e.isPlayer) return 'Den Chef kann man nicht entlassen';
    if (e.kind === 'leih' && !immediate) {
      // Leiharbeit endet zum nächsten Morgen (Abbestellung bei der Firma)
      e.contractUntil = Math.min(e.contractUntil ?? time, (Math.floor(time / 1440) + 1) * 1440);
      this.version++;
      return `abbestellt zum ${fmtDay(e.contractUntil)}`;
    }
    if (e.kind === 'fest' && !immediate) {
      if (e.leavesAt !== undefined) return `Ist schon gekündigt (geht am ${fmtDay(e.leavesAt)})`;
      e.leavesAt = (Math.floor(time / 1440) + 28) * 1440;
      this.emit(time, 'info', `${e.name} gekündigt – arbeitet bis ${fmtDay(e.leavesAt)} weiter.`);
      return `gekündigt zum ${fmtDay(e.leavesAt)}`;
    }
    this.company.drivers.splice(i, 1);
    this.staffRequests.splice(0, this.staffRequests.length, ...this.staffRequests.filter((r) => r.employeeId !== employeeId));
    this.emit(time, 'info', `${e.name} hat den Betrieb verlassen.`);
    return 'entlassen';
  }

  // ---------- Abwesenheit, Zufriedenheit, Wünsche (Schritt 4) ----------

  /** Angebot der Zeitarbeitsfirma: meist 2–4 Leute, Stufe 1–3, wechselt laufend */
  private updateAgency(time: number) {
    for (let i = this.agencyPool.length - 1; i >= 0; i--) if (this.agencyPool[i].until <= time) this.agencyPool.splice(i, 1);
    while (this.agencyPool.length < 2 || (this.agencyPool.length < 4 && this.rng.next() < 0.2)) {
      const a = this.makeApplicant(time);
      a.person.skills.boden = Math.min(a.person.skills.boden, 1 + this.rng.int(3));
      a.person.kind = 'leih';
      a.person.agencyRate = agencyRate(a.person);
      a.person.wage = marketWage(a.person); // Lohn bei Übernahme
      a.note = 'Zeitarbeit, einsatzbereit ab morgen 06:00';
      a.until = time + (3 + this.rng.int(8)) * 1440;
      this.agencyPool.push(a);
    }
  }

  /** Leiharbeiter für einige Tage buchen (befristet, ab nächstem Tag im Einsatz) */
  rent(poolId: number, days: number, time: number): string {
    const i = this.agencyPool.findIndex((a) => a.id === poolId);
    if (i < 0) return 'Nicht mehr verfügbar';
    if (!(days >= 1 && days <= 180)) return 'Buchung 1 bis 180 Tage';
    const a = this.agencyPool[i];
    const id = this.company.drivers.reduce((m, d) => Math.max(m, d.id), 0) + 1;
    const from = (Math.floor(time / 1440) + 1) * 1440;
    this.company.drivers.push({ ...structuredClone(a.person), id, kind: 'leih', hiredAt: from, availableFrom: from, contractUntil: from + days * 1440, satisfaction: 70, absences: [] });
    this.agencyPool.splice(i, 1);
    this.emit(time, 'info', `Leiharbeiter ${a.person.name} gebucht: ${days} Tage ab ${fmtDay(from)}, ${fmtEur(a.person.agencyRate ?? 0)}/h.`);
    return `gebucht bis ${fmtDay(from + days * 1440 - 1)}`;
  }

  extendRent(employeeId: number, days: number, time: number): string {
    const e = this.company.drivers.find((d) => d.id === employeeId);
    if (!e || e.kind !== 'leih') return 'Kein Leiharbeiter';
    if (!(days >= 1 && days <= 180)) return 'Verlängerung 1 bis 180 Tage';
    e.contractUntil = Math.max(e.contractUntil ?? time, (Math.floor(time / 1440) + 1) * 1440) + days * 1440;
    this.version++;
    return `verlängert bis ${fmtDay(e.contractUntil - 1)}`;
  }

  /** Leiharbeiter übernehmen (fest oder Saison) gegen Provision je nach Einsatzdauer */
  takeOver(employeeId: number, asKind: 'fest' | 'saison', time: number): string {
    const e = this.company.drivers.find((d) => d.id === employeeId);
    if (!e || e.kind !== 'leih') return 'Kein Leiharbeiter';
    const deployed = Math.max(0, Math.floor((time - (e.availableFrom ?? time)) / 1440));
    const wage = Math.max(MIN_WAGE, asKind === 'saison' ? Math.round(marketWage(e) * 1.08 * 10) / 10 : marketWage(e));
    const fee = takeOverFee(wage, deployed);
    if (this.company.cash < fee) return `Provision ${fmtEur(fee)} – nicht genug Geld`;
    if (fee) {
      this.company.cash = Math.round((this.company.cash - fee) * 100) / 100;
      this.ledger.push({ time, text: `Übernahmeprovision ${e.name}`, amount: -fee, category: 'Personal' });
    }
    e.kind = asKind;
    e.wage = wage;
    e.hiredAt = time;
    delete e.agencyRate; delete e.contractUntil; delete e.availableFrom;
    const monthsLeft = 12 - gameDate(time).month + 1;
    e.vacationLeft = asKind === 'fest' ? Math.round((VACATION_DAYS * monthsLeft) / 12) : 0;
    this.version++;
    this.emit(time, 'info', `${e.name} übernommen (${asKind === 'fest' ? 'fest' : 'Saison'}, ${fmtEur(wage)}/h${fee ? `, Provision ${fmtEur(fee)}` : ', ohne Provision'}).`);
    return `übernommen${fee ? ` (Provision ${fmtEur(fee)})` : ''}`;
  }

  /** Mitarbeiter heute bzw. zu dieser Minute abwesend (Urlaub, krank)? */
  absence(employeeId: number, time: number): 'urlaub' | 'krank' | null {
    const e = this.company.drivers.find((d) => d.id === employeeId);
    for (const a of e?.absences ?? []) if (time >= a.from && time < a.to) return a.kind;
    return null;
  }

  /** Urlaub eintragen (ganze Tage ab 06:00) */
  grantVacation(employeeId: number, fromDay: number, days: number, time: number): string {
    const e = this.company.drivers.find((d) => d.id === employeeId);
    if (!e || e.isPlayer) return 'Nur für Mitarbeiter';
    if (e.kind !== 'fest') return 'Saisonkräfte haben keinen Urlaubsanspruch';
    if (days < 1) return 'Mindestens ein Tag';
    if ((e.vacationLeft ?? 0) < days) return `Nur noch ${e.vacationLeft ?? 0} Tage Urlaub übrig`;
    const from = Math.max(fromDay, Math.floor(time / 1440) + 1) * 1440;
    const to = from + days * 1440;
    if ((e.absences ?? []).some((a) => from < a.to && a.from < to)) return 'Überschneidet sich mit einer anderen Abwesenheit';
    (e.absences ??= []).push({ from, to, kind: 'urlaub' });
    e.vacationLeft = (e.vacationLeft ?? 0) - days;
    this.version++;
    this.emit(time, 'info', `${e.name}: Urlaub ${fmtDay(from)} bis ${fmtDay(to - 1)} (${days} Tage).`);
    return `Urlaub eingetragen (${days} Tage, Rest ${e.vacationLeft})`;
  }

  /** Antwort auf einen Wunsch (Urlaubsantrag, Gehaltsforderung) */
  answerRequest(requestId: number, accept: boolean, time: number): string {
    const i = this.staffRequests.findIndex((r) => r.id === requestId);
    if (i < 0) return 'Nicht mehr aktuell';
    const r = this.staffRequests[i];
    const e = this.company.drivers.find((d) => d.id === r.employeeId);
    this.staffRequests.splice(i, 1);
    this.version++;
    if (!e) return 'Mitarbeiter nicht mehr da';
    if (r.kind === 'urlaub') {
      if (!accept) {
        e.grudge = (e.grudge ?? 0) + 8;
        return 'Urlaub abgelehnt';
      }
      return this.grantVacation(e.id, Math.floor(r.from! / 1440), r.days!, time);
    }
    if (!accept) {
      e.grudge = (e.grudge ?? 0) + 15;
      return 'Gehaltserhöhung abgelehnt';
    }
    e.wage = r.wage!;
    e.grudge = 0;
    e.satisfaction = Math.min(100, (e.satisfaction ?? 60) + 15);
    this.emit(time, 'info', `${e.name}: Lohn jetzt ${fmtEur(e.wage)}/h.`);
    return `Lohn auf ${fmtEur(e.wage)}/h erhöht`;
  }

  /** Lohn von sich aus anpassen */
  setWage(employeeId: number, wage: number, time: number): string {
    const e = this.company.drivers.find((d) => d.id === employeeId);
    if (!e || e.isPlayer) return 'Nur für Mitarbeiter';
    if (!(wage >= MIN_WAGE)) return `Mindestens Mindestlohn ${fmtEur(MIN_WAGE)}/h`;
    const up = wage > e.wage;
    if (!up) e.grudge = (e.grudge ?? 0) + Math.round((e.wage - wage) * 10);
    else e.satisfaction = Math.min(100, (e.satisfaction ?? 60) + Math.round((wage - e.wage) * 6));
    e.wage = Math.round(wage * 100) / 100;
    for (const r of this.staffRequests) if (r.employeeId === e.id && r.kind === 'gehalt' && wage >= (r.wage ?? 0)) r.until = time;
    this.version++;
    this.emit(time, 'info', `${e.name}: Lohn jetzt ${fmtEur(e.wage)}/h.`);
    return `Lohn ${fmtEur(e.wage)}/h`;
  }

  /**
   * Täglich 06:00: Krankmeldungen (KK-11, PA-05), Zufriedenheit (PA-16), Wünsche, Kündigungen
   * (PA-17), Abgänge nach Kündigungsfrist. `worked`: gestrige Minuten je Mitarbeiter.
   */
  private staffDaily(time: number, worked: Record<number, number>, busy: Set<number>) {
    const fleet = this.company.machines.filter((m) => m.type === 'schlepper');
    const fleetCond = fleet.length ? fleet.reduce((a, m) => a + m.condition, 0) / fleet.length : 70;
    for (const e of [...this.company.drivers]) {
      if (e.isPlayer) continue;
      // Abgang nach Kündigungsfrist
      if (e.leavesAt !== undefined && time >= e.leavesAt && !busy.has(e.id)) {
        this.fire(e.id, time, true);
        continue;
      }
      e.absences = (e.absences ?? []).filter((a) => a.to > time - 30 * 1440);
      if (e.kind === 'leih') {
        // Einsatz endet: zurück zur Zeitarbeitsfirma (sobald nicht mehr unterwegs)
        if (time >= (e.contractUntil ?? 0) && !busy.has(e.id)) {
          this.company.drivers.splice(this.company.drivers.indexOf(e), 1);
          this.emit(time, 'info', `Leiharbeit von ${e.name} beendet.`);
          continue;
        }
        // auch Leiharbeiter werden krank; die Firma schickt dann niemanden
        if (!this.absence(e.id, time) && this.rng.next() < 0.008 * (1.6 - (e.reliability ?? 0.75))) {
          const days = 1 + this.rng.int(3);
          (e.absences ??= []).push({ from: time, to: time + days * 1440, kind: 'krank' });
          this.emit(time, 'warnung', `Leiharbeiter ${e.name} ist krank (etwa ${days} ${days === 1 ? 'Tag' : 'Tage'}).`);
        }
        continue;
      }
      // Überstunden gleitend über 30 Tage (über 8 h am Tag)
      const over = Math.max(0, (worked[e.id] ?? 0) - 480);
      e.overtime30 = Math.round(((e.overtime30 ?? 0) * 29) / 30 + over);
      // Krankheit: im Mittel etwa 12 Tage im Jahr, weniger bei hoher Zuverlässigkeit, mehr bei vielen Überstunden
      const rel = e.reliability ?? 0.75;
      const res = e.resilience ?? 0.75;
      const stress = (e.overtime30 ?? 0) / 60 / 20; // 20 Überstunden im Monat = +1
      if (!this.absence(e.id, time) && this.rng.next() < 0.008 * (1.6 - rel) * (1 + stress * (1.2 - res))) {
        const r = this.rng.next();
        const days = r < 0.5 ? 1 + this.rng.int(2) : r < 0.85 ? 3 + this.rng.int(3) : 7 + this.rng.int(8);
        (e.absences ??= []).push({ from: time, to: time + days * 1440, kind: 'krank' });
        this.emit(time, 'warnung', `${e.name} hat sich krank gemeldet (etwa ${days} ${days === 1 ? 'Tag' : 'Tage'}).`);
      }
      // Zufriedenheit nähert sich einem Zielwert (2 % je Tag)
      const mw = marketWage(e);
      let target = 70 + 150 * (e.wage / mw - 1) - ((e.overtime30 ?? 0) / 60) * (1.3 - res) - (fleetCond < 50 ? 10 : 0) - (e.grudge ?? 0);
      if (e.kind === 'fest' && (e.vacationLeft ?? 0) > 20 && gameDate(time).month >= 10) target -= 5; // Urlaub verfällt bald
      target = Math.max(0, Math.min(100, target));
      const sat = e.satisfaction ?? 70;
      e.satisfaction = Math.round((sat + (target - sat) * 0.02) * 10) / 10;
      e.grudge = Math.max(0, Math.round(((e.grudge ?? 0) * 0.97) * 10) / 10);
      const open = this.staffRequests.some((r) => r.employeeId === e.id);
      // Gehaltsforderung bei Unzufriedenheit oder deutlich unter Markt
      if (!open && e.leavesAt === undefined && (e.satisfaction < 45 || e.wage < mw - 1) && this.rng.next() < 0.05) {
        const wage = Math.max(mw, Math.round((e.wage + 0.8) * 10) / 10);
        this.staffRequests.push({ id: this.nextId++, employeeId: e.id, kind: 'gehalt', wage, until: time + 14 * 1440 });
        this.emit(time, 'warnung', `${e.name} möchte mehr Lohn: ${fmtEur(wage)}/h statt ${fmtEur(e.wage)}/h.`);
      }
      // Urlaubsantrag (Feste, etwa alle zwei Monate)
      if (!open && e.kind === 'fest' && (e.vacationLeft ?? 0) >= 3 && this.rng.next() < 0.015) {
        const days = Math.min(e.vacationLeft ?? 0, 3 + this.rng.int(8));
        const from = (Math.floor(time / 1440) + 7 + this.rng.int(21)) * 1440;
        this.staffRequests.push({ id: this.nextId++, employeeId: e.id, kind: 'urlaub', from, days, until: time + 5 * 1440 });
        this.emit(time, 'info', `${e.name} fragt nach Urlaub: ${days} Tage ab ${fmtDay(from)}.`);
      }
      // Kündigung durch den Mitarbeiter (PA-17), gute Leute werden auch abgeworben
      if (e.leavesAt === undefined && e.satisfaction < 25 && this.rng.next() < 0.03) {
        e.leavesAt = (Math.floor(time / 1440) + 28) * 1440;
        const rival = e.skills.boden >= 4 ? ' Ein anderes Lohnunternehmen hat ihn abgeworben.' : '';
        this.emit(time, 'warnung', `${e.name} kündigt zum ${fmtDay(e.leavesAt)}.${rival}`);
      }
    }
    // abgelaufene Wünsche: nicht beantwortet zählt wie abgelehnt
    for (let i = this.staffRequests.length - 1; i >= 0; i--) {
      const r = this.staffRequests[i];
      if (r.until > time) continue;
      const e = this.company.drivers.find((d) => d.id === r.employeeId);
      if (e && !(r.kind === 'gehalt' && e.wage >= (r.wage ?? 0))) e.grudge = (e.grudge ?? 0) + (r.kind === 'gehalt' ? 15 : 8);
      this.staffRequests.splice(i, 1);
    }
    this.updateAgency(time);
    // Jahreswechsel: neuer Urlaubsanspruch
    const d = gameDate(time);
    if (d.month === 1 && d.day === 1) for (const e of this.company.drivers) if (e.kind === 'fest') e.vacationLeft = Math.min(VACATION_DAYS + 10, (e.vacationLeft ?? 0) + VACATION_DAYS);
  }

  warn(time: number, text: string) {
    this.emit(time, 'warnung', text);
  }

  info(time: number, text: string) {
    this.emit(time, 'info', text);
  }
}

export function fmtEur(v: number): string {
  return v.toLocaleString('de-DE', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
}
export function fmtHa(v: number): string {
  return v.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' ha';
}
export function fmtTime(minutes: number): string {
  const d = gameDate(minutes);
  return `${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}`;
}
export function fmtDay(minutes: number): string {
  const d = gameDate(minutes);
  return `${String(d.day).padStart(2, '0')}.${String(d.month).padStart(2, '0')}.`;
}
