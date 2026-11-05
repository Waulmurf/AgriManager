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
  EMPLOYER_SV, MIN_WAGE, MONTH_HOURS, SKILLS, XP_MINUTES_PER_LEVEL, baseSkills, gameDate, START_OFFERS,
  type Company, type Employee, type MarketOffer, type Skill,
} from './economy';

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

export type LedgerCategory = 'Rechnung' | 'Diesel' | 'Maschinenkauf' | 'Personal' | 'Sonstiges';

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
  | { kind: 'hire'; applicantId: number; asKind: 'fest' | 'saison' }
  | { kind: 'fire'; employeeId: number }
  | { kind: 'dequeue'; queueId: number }
  | { kind: 'queueMove'; queueId: number; dir: -1 | 1 };

/** Befehle, die in die Warteschlange eines Fahrers passen */
export type QueueCommand = Extract<Command, { kind: 'visit' } | { kind: 'startJob' }>;
export interface QueueItem {
  id: number;
  /** Fahrer, der die Aufgabe übernimmt (Besuche immer der Chef) */
  driverId: number;
  cmd: QueueCommand;
  label: string;
}

export class Business {
  readonly requests: Request[] = [];
  readonly orders: Order[] = [];
  readonly invoices: Invoice[] = [];
  readonly ledger: LedgerEntry[] = [];
  readonly applicants: Applicant[] = [];
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
  daily(time: number, workedMinutes: Record<number, number> = {}) {
    this.bookDiesel(time);
    this.payroll(time, workedMinutes);
    this.updateApplicants(time);
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
    const id = this.company.machines.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    this.company.machines.push({ id, ...o.machine });
    this.offers.splice(idx, 1);
    this.ledger.push({ time, text: `Kauf ${o.machine.brand} ${o.machine.model}`, amount: -o.price, category: 'Maschinenkauf' });
    this.emit(time, 'info', `Gekauft: ${o.machine.brand} ${o.machine.model} für ${fmtEur(o.price)}.`);
    return 'gekauft';
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
    const machines = Math.round((o.tractorHours * REPAIR_TRACTOR_EUR_H + o.areaHa * WEAR_GRUBBER_EUR_HA) * 100) / 100;
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
  private payroll(time: number, worked: Record<number, number>) {
    let day = 0;
    for (const e of this.company.drivers) {
      if (e.kind === 'fest') day += (e.wage * MONTH_HOURS * (1 + EMPLOYER_SV)) / 30;
      else if (e.kind === 'saison') day += ((worked[e.id] ?? 0) / 60) * e.wage * (1 + EMPLOYER_SV);
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
    const wage = Math.max(MIN_WAGE, wantFest);
    const first = FIRST_NAMES[r.int(FIRST_NAMES.length)];
    const last = SURNAMES[r.int(SURNAMES.length)];
    const notes = ['sucht feste Stelle', 'auch als Saisonkraft', 'Landwirtssohn, kennt Schlepper', 'kommt aus der Region', 'bisher bei einem anderen Lohnunternehmen'];
    return {
      id: this.nextId++,
      person: { name: `${first} ${last}`, isPlayer: false, kind: 'fest', wage, skills, xp: {}, licenseC, age },
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
    this.company.drivers.push({ ...structuredClone(a.person), id, kind: asKind, wage, hiredAt: time });
    this.applicants.splice(i, 1);
    this.emit(time, 'info', `${a.person.name} eingestellt (${asKind === 'fest' ? 'fest' : 'Saisonkraft'}, ${fmtEur(wage)}/h).`);
    return 'eingestellt';
  }

  /** Entlassen; die Engine prüft vorher, dass der Mitarbeiter nicht unterwegs ist */
  fire(employeeId: number, time: number): string {
    const i = this.company.drivers.findIndex((d) => d.id === employeeId);
    if (i < 0) return 'Mitarbeiter unbekannt';
    const e = this.company.drivers[i];
    if (e.isPlayer) return 'Den Chef kann man nicht entlassen';
    this.company.drivers.splice(i, 1);
    this.emit(time, 'info', `${e.name} hat den Betrieb verlassen.`);
    return 'entlassen';
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
export function fmtDay(minutes: number): string {
  const d = gameDate(minutes);
  return `${String(d.day).padStart(2, '0')}.${String(d.month).padStart(2, '0')}.`;
}
