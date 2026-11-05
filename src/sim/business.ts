/**
 * Geschäftslogik des Lohnbetriebs (Phase 2, Schritt 3): Besuche, Anfragen, Aufträge.
 * Teil des deterministischen Rechenkerns – eigener Zufallsgenerator, damit Spieler-
 * entscheidungen das Verhalten der Testfahrzeuge nicht verändern.
 *
 * Preise und Wahrscheinlichkeiten sind Annahmen (siehe docs/plan.md), beim Testen nachjustierbar.
 */
import { Rng } from './rng';
import { Crop, type FarmSet } from './farms';
import type { FieldSet } from './fields';
import { gameDate, START_OFFERS, type Company, type MarketOffer } from './economy';

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
  | { kind: 'startJob'; orderId: number; tractorId: number; implementId: number }
  | { kind: 'buy'; offerId: number }
  | { kind: 'recall'; vehicle: number };

export class Business {
  readonly requests: Request[] = [];
  readonly orders: Order[] = [];
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

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private emit(time: number, kind: GameEvent['kind'], text: string, farmId?: number) {
    this.events.push({ time, kind, text, farmId });
    this.version++;
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
    if (this.requests.some((r) => r.farmId === farmId && r.status === 'offen')) return null;
    if (this.rng.next() >= chance) return null;
    const spring = gameDate(time).month <= 5;
    const busy = this.busyFields();
    const cand = farm.fields.filter((i) => {
      if (busy.has(i) || f.areaHa[i] > MAX_REQUEST_FIELD_HA) return false;
      const c = fs.fieldCrop[i];
      return spring ? c === Crop.Mais || c === Crop.Zuckerrueben || c === Crop.Kartoffeln : c !== Crop.Gruenland;
    });
    if (!cand.length) return null;
    // bis zu 3 Felder, zusammen höchstens 60 ha
    const picked: number[] = [];
    let ha = 0;
    const start = this.rng.int(cand.length);
    for (let k = 0; k < cand.length && picked.length < 3; k++) {
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
    if (!first) farm.satisfaction = Math.min(100, farm.satisfaction + 2); // Beziehung pflegen
    const req = this.maybeRequest(farmId, time, 0.2 + 0.7 * (1 - farm.mechanization), 'besuch');
    if (req) {
      this.emit(time, 'anfrage', `${farm.name}: Grubbern auf ${req.fields.length} ${req.fields.length === 1 ? 'Feld' : 'Feldern'}, ${fmtHa(req.areaHa)} für ${fmtEur(req.priceHa)}/ha`, farmId);
    } else {
      this.emit(time, 'besuch', `${farm.name}: ${first ? 'Kennengelernt, jetzt im Adressbuch.' : 'Besuch beendet.'} Zurzeit steht nichts an.`, farmId);
    }
  }

  /** Täglich um 06:00: Anfragen per Anruf/Nachricht von bekannten Betrieben, Fristen prüfen */
  daily(time: number) {
    for (const r of this.requests) {
      if (r.status === 'offen' && time >= r.replyBy) {
        r.status = 'abgelaufen';
        const farm = this.farms?.farms[r.farmId];
        if (farm) farm.satisfaction = Math.max(0, farm.satisfaction - 5);
        this.emit(time, 'warnung', `${this.farmName(r.farmId)} hat sich anderweitig umgesehen (keine Antwort).`, r.farmId);
      }
    }
    const fs = this.farms;
    if (!fs) return;
    for (const farm of fs.farms) {
      if (!farm.known) continue;
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
    const farm = this.farms?.farms[r.farmId];
    if (action === 'reject') {
      r.status = 'abgelehnt';
      if (farm) farm.satisfaction = Math.max(0, farm.satisfaction - 2);
      this.emit(time, 'info', `Anfrage von ${this.farmName(r.farmId)} abgelehnt.`, r.farmId);
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
        if (farm) farm.satisfaction = Math.max(0, farm.satisfaction - 3);
        this.emit(time, 'warnung', `${this.farmName(r.farmId)} lehnt ${fmtEur(p)}/ha ab und vergibt den Auftrag anderweitig.`, r.farmId);
        return 'Kunde lehnt ab';
      }
      if (farm && ratio > 1) farm.satisfaction = Math.max(0, farm.satisfaction - 1);
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
    this.emit(time, 'info', `Gekauft: ${o.machine.brand} ${o.machine.model} für ${fmtEur(o.price)}.`);
    return 'gekauft';
  }

  orderStarted(o: Order, tractorId: number, implementId: number, time: number) {
    o.status = 'läuft';
    o.tractorId = tractorId;
    o.implementId = implementId;
    o.startedAt = time;
    this.emit(time, 'auftrag', `Auftrag ${this.farmName(o.farmId)} gestartet.`, o.farmId);
  }

  fieldDone(o: Order, field: number, time: number) {
    o.doneFields.push(field);
    this.version++;
    if (o.doneFields.length === o.fields.length) {
      o.status = 'fertig';
      o.finishedAt = time;
      const farm = this.farms?.farms[o.farmId];
      const onTime = time <= o.latest;
      if (farm) farm.satisfaction = Math.max(0, Math.min(100, farm.satisfaction + (onTime ? 5 : -10)));
      this.emit(time, 'auftrag', `Auftrag ${this.farmName(o.farmId)} fertig${onTime ? ', pünktlich' : ', verspätet'} (${fmtHa(o.areaHa)}).`, o.farmId);
    }
  }

  /** Diesel tanken/abrechnen: Kosten sofort vom Konto, beim Auftrag mitgeschrieben */
  chargeDiesel(liters: number, order: Order | undefined, _time: number) {
    if (liters <= 0) return;
    const cost = liters * DIESEL_PRICE;
    this.company.cash = Math.round((this.company.cash - cost) * 100) / 100;
    this.dieselTotalL += liters;
    if (order) {
      order.dieselL = Math.round((order.dieselL + liters) * 10) / 10;
      order.dieselCost = Math.round((order.dieselCost + cost) * 100) / 100;
    }
    this.version++;
  }

  /** Auftrag unterbrochen (Fahrzeug zurückgerufen): bleibt offen, erledigte Felder zählen */
  orderInterrupted(o: Order, time: number) {
    o.status = 'offen';
    this.emit(time, 'warnung', `Auftrag ${this.farmName(o.farmId)} unterbrochen (${o.doneFields.length}/${o.fields.length} Felder fertig).`, o.farmId);
  }

  warn(time: number, text: string) {
    this.emit(time, 'warnung', text);
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
