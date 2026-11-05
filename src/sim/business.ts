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
  EMPLOYER_SV, MIN_WAGE, MONTH_HOURS, ROLES, SKILLS, VACATION_DAYS, marketWage, agencyRate, takeOverFee, AGENCY_MIN_HOURS, XP_MINUTES_PER_LEVEL, baseSkills, gameDate, marketValue,
  serviceInterval, SELF_PROPELLED, START_OFFERS, START_YEAR, type Company, type Loan, type MachineType, type Site, type Employee, type Machine, type MarketOffer, type Repair, type Skill,
} from './economy';
import { CATALOG, DEALERS, dealersFor, type CatalogModel } from '../data/catalog';
import { BUILDINGS, PERMIT, SITE_OFFERS, type BuildingKey } from '../data/sites';
import { CROPS, IRRIGATION_EUR_HA, fieldIrrigated, fieldSoil, referenceRent, rotationFactor, soilFactor, type OwnCrop } from './farming';
import {
  BIOGAS, BIOGAS_AFA_YEARS, EEG_MAX_CT, FIXED_SHARE, GAER_GABE, GAER_SELL_EUR, GAER_VALUE_EUR, GUELLE_HAUL_EUR, OPEX_CT,
  SUBSTRATE_NAME, SUBSTRATE_PRICE, dailyTarget, farmSlurryPerDay, gaerBlocked, gaerOf, ration, type BiogasSize, type Feed, type Substrate,
} from './biogas';
import { DESTINATIONS } from '../data/destinations';
import { COMPETITOR_RANGE_KM, PRICE_WAR_KM, generateCompetitors, kmBetween, type Competitor } from './market';
import {
  DIESEL_MEAN, DIESEL_START, LEASE_BASE_RATE, LIABILITY_PER_YEAR, OVERDRAFT_RATE, RATING_SURCHARGE,
  afaYears, annuity, bookValue, insurancePerYear, leaseRate, loanBaseRate, profitTax, rating,
} from './finance';

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

export type Service = 'grubbern' | 'stoppel' | 'guelle' | 'haeckseln' | 'drusch' | 'roden' | 'transport';
export const SERVICE_NAMES: Record<Service, string> = { grubbern: 'Grubbern', stoppel: 'Stoppelbearbeitung', guelle: 'Gülle ausbringen', haeckseln: 'Maishäckseln', drusch: 'Mähdrusch', roden: 'Rübenroden', transport: 'Lkw-Transport' };
/** Gerät je Dienstleistung und Tätigkeitswort für die Anzeige */
export const SERVICE_IMPLEMENT: Record<Service, MachineType> = { grubbern: 'grubber', stoppel: 'kurzscheibenegge', guelle: 'guellefass', haeckseln: 'feldhaecksler', drusch: 'maehdrescher', roden: 'ruebenroder', transport: 'lkw' };
export const SERVICE_VERB: Record<Service, string> = { grubbern: 'grubbert', stoppel: 'bearbeitet Stoppeln', guelle: 'bringt Gülle aus', haeckseln: 'häckselt', drusch: 'drischt', roden: 'rodet Rüben', transport: 'fährt Lkw' };
/** Tätigkeit des Fahrers je Dienstleistung (Skill) */
export const SERVICE_SKILL: Record<Service, Skill> = { grubbern: 'boden', stoppel: 'boden', guelle: 'guelle', haeckseln: 'haecksler', drusch: 'drescher', roden: 'roder', transport: 'transport' };
/** Erntedienste: selbstfahrende Hauptmaschine (Fahrzeug und Gerät zugleich), Abfahrer-Wagen (falls nötig) */
export const HARVEST_SERVICES: Service[] = ['haeckseln', 'drusch', 'roden'];
export const HAULER_TYPE: Partial<Record<Service, MachineType>> = { haeckseln: 'haeckselwagen', drusch: 'kipper' };
export function isHarvest(s: Service): boolean {
  return s === 'haeckseln' || s === 'drusch' || s === 'roden';
}
/** Erträge für die Erntelogistik (t/ha, Annahme Niedersachsen): Weizen/Getreide, Raps, Zuckerrüben */
export const GRAIN_YIELD_T_HA = 7.5;
export const RAPE_YIELD_T_HA = 3.8;
export const BEET_YIELD_T_HA = 80;
/** Name der Kettenart je Dienst („haecksler“ = nur Hauptmaschine) */
export function chainName(s: Service, chain?: 'haecksler' | 'komplett'): string {
  if (!chain) return '';
  if (chain === 'komplett') return s === 'drusch' ? 'mit Abfuhr' : 'Komplettkette';
  return s === 'drusch' ? 'nur Drusch' : 'nur Häcksler';
}
/** Silomais: Ertrag Frischmasse (t/ha, Annahme Niedersachsen 40–45) */
export const SILAGE_YIELD_T_HA = 42;
/**
 * Häckseln: „nur Häcksler“ (Kunde stellt Abfahrer und Walze) oder Komplettkette (Abfahrer und Walzen
 * vom Lohnunternehmen). Preise je ha (Annahme; Kostenanker Häcksler 241 €/h, Transport 87 €/h,
 * Walzschlepper 110 €/h laut Bayerischem Wochenblatt, siehe docs/ablaeufe.md).
 */
export const CHOP_PRICE_HA: Record<'haecksler' | 'komplett', number> = { haecksler: 230, komplett: 430 };
/** Mähdrusch je ha (Annahme LWK-Größenordnung): nur Drusch bzw. mit Abfuhr zum Hof des Kunden */
export const THRESH_PRICE_HA: Record<'haecksler' | 'komplett', number> = { haecksler: 150, komplett: 195 };
/** Fremdwalze, wenn bei der Komplettkette kein eigener Radlader am Silo ist (€/h) */
export const HIRED_ROLLER_EUR_H = 110;
/**
 * Startpreis je ha inkl. Schlepper, Fahrer, Diesel (Annahme): Stoppelbearbeitung flach, günstiger als
 * Grubbern. Gülle wird je m³ abgerechnet: 4 €/m³ (Spanne für Lohnausbringung 2,50–8 €/m³ je nach
 * Entfernung und System laut LK Niederösterreich); priceHa = €/m³ × Gabe.
 */
export const SERVICE_BASE_PRICE: Record<Service, number> = { grubbern: 55, stoppel: 38, guelle: 4, haeckseln: 230, drusch: 150, roden: 280, transport: 0 };
/**
 * Lkw-Transport (Annahme): Fracht 1,80 €/t Grundpreis + 0,12 €/t je Straßen-km (Straße ≈ Luftlinie × 1,3);
 * Diesel 32 l/100 km; Maut 0,35 €/km auf Bundesstraßen und Autobahn (Strecken ab 65 km/h); Laden an der
 * Miete mit Rübenmaus 8 min, am Hoflager 15 min.
 */
export const FREIGHT_BASE_EUR_T = 1.8;
export const FREIGHT_EUR_TKM = 0.12;
export const DIESEL_TRUCK_L_KM = 0.32;
export const TOLL_EUR_KM = 0.35;
export const TRUCK_LOAD_MIN = { rueben: 8, korn: 15 } as const;
/** Lenkzeit: nach 4,5 h Fahrt 45 min Pause (EU-Lenkzeitregeln, vereinfacht) */
export const DRIVE_BREAK_AFTER_MIN = 270;
export const DRIVE_BREAK_MIN = 45;

/**
 * Jahreslauf (AK-04): welche Dienstleistung wann gefragt ist, für welche Kulturen, und wie stark.
 * Grubbern im Frühjahr vor Mais, Rüben, Kartoffeln (1.3.–15.5.) und im Herbst als
 * Grundbodenbearbeitung nach Getreide und Raps (1.9.–31.10.); Stoppelbearbeitung direkt nach der
 * Ernte von Raps (ab Mitte Juli) und Getreide (bis Mitte September). Winter: keine Bodenbearbeitung.
 */
export function seasonServices(time: number): { service: Service; crops: Crop[]; weight: number }[] {
  const d = gameDate(time);
  const md = d.month * 100 + d.day;
  const out: { service: Service; crops: Crop[]; weight: number }[] = [];
  if (md >= 301 && md <= 515) out.push({ service: 'grubbern', crops: [Crop.Mais, Crop.Zuckerrueben, Crop.Kartoffeln], weight: md >= 401 && md <= 430 ? 1.2 : 1 });
  // (Gülle siehe unten)
  if (md >= 715 && md <= 915) out.push({ service: 'stoppel', crops: md < 801 ? [Crop.Raps] : [Crop.Getreide, Crop.Raps], weight: md >= 801 && md <= 831 ? 1.3 : 0.8 });
  if (md >= 901 && md <= 1031) out.push({ service: 'grubbern', crops: [Crop.Getreide, Crop.Raps, Crop.Ackerfutter], weight: md <= 1015 ? 0.9 : 0.6 });
  // Gülle (nur Betriebe mit Vieh): Ende der Sperrfrist 1.2. bis Mitte Mai – Getreide und Raps als
  // Kopfdüngung (Februar–April), Mais und Rüben vor der Saat (März–Mai); nach der Ernte im August/September
  // wenig zu Raps und Zwischenfrüchten (ab 1.10. Sperrfrist)
  if (md >= 201 && md <= 430) out.push({ service: 'guelle', crops: [Crop.Getreide, Crop.Raps], weight: 1 });
  if (md >= 301 && md <= 515) out.push({ service: 'guelle', crops: [Crop.Mais, Crop.Zuckerrueben], weight: 1 });
  if (md >= 801 && md <= 920) out.push({ service: 'guelle', crops: [Crop.Raps, Crop.Getreide], weight: 0.4 });
  // Silomais häckseln: Mitte September bis Mitte Oktober (Reife ~32 % TS), eilig
  if (md >= 910 && md <= 1020) out.push({ service: 'haeckseln', crops: [Crop.Mais], weight: md >= 920 && md <= 1010 ? 1.4 : 0.8 });
  // Mähdrusch: Raps ab Mitte Juli, Getreide Ende Juli bis Ende August (nur Betriebe ohne eigenen Drescher)
  if (md >= 710 && md <= 805) out.push({ service: 'drusch', crops: [Crop.Raps], weight: 1.2 });
  if (md >= 720 && md <= 830) out.push({ service: 'drusch', crops: [Crop.Getreide], weight: md >= 801 && md <= 820 ? 1.5 : 1 });
  // Rübenroden: Kampagne Nordzucker Uelzen ab Mitte September, Roden bis Ende November
  if (md >= 915 && md <= 1130) out.push({ service: 'roden', crops: [Crop.Zuckerrueben], weight: md >= 1001 && md <= 1115 ? 1.3 : 0.8 });
  // Lkw-Transport: Rübenabfuhr in der Kampagne (bis Mitte Januar), Korn vom Hoflager zum Landhandel
  if (md >= 920 || md <= 115) out.push({ service: 'transport', crops: [Crop.Zuckerrueben], weight: 1 });
  if (md >= 725 && md <= 915) out.push({ service: 'transport', crops: [Crop.Getreide, Crop.Raps], weight: 0.6 });
  return out;
}

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
  /** vom Kunden genannter Preis (€/ha; bei Gülle €/m³ × Gabe) */
  priceHa: number;
  /** Gülle: Gabe (m³/ha) */
  gabe?: number;
  /** Häckseln: nur Häcksler oder Komplettkette */
  chain?: 'haecksler' | 'komplett';
  /** Transport: Menge je ha (t), Ladestelle, Ziel (Knoten, Name) */
  tPerHa?: number;
  pickupNode?: number;
  destNode?: number;
  destName?: string;
  /** bestes Konkurrenzangebot (€/ha) und Anbieter (MK-02) */
  competitorPriceHa?: number;
  competitorId?: number;
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
  /** Gülle: Gabe (m³/ha) und schon ausgebrachte Menge */
  gabe?: number;
  doneM3?: number;
  /** Häckseln: Art der Kette, geerntete und am Silo angekommene Menge (t) */
  chain?: 'haecksler' | 'komplett';
  doneT?: number;
  /** Fremdleistungen (€), z. B. Fremdwalze */
  externalCost?: number;
  /** Eigenauftrag auf eigener Pachtfläche (keine Rechnung) */
  ownLeaseId?: number;
  /** Transport: Menge je ha (t), Ladestelle, Ziel; abgeliefert steht in doneT */
  tPerHa?: number;
  pickupNode?: number;
  destNode?: number;
  destName?: string;
  /** Lager/Silo statt Hofstelle des Kunden (Biogasanlage) */
  sourceNode?: number;
  /** Gärrest auf eigene Fläche (m³ schon aus dem Lager genommen) */
  gaerrest?: boolean;
  /** Mais auf dem Halm gekauft (€/t), Ernte ins eigene Silo */
  biogasPriceT?: number;
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

export type LedgerCategory =
  | 'Rechnung' | 'Diesel' | 'Maschinenkauf' | 'Personal' | 'Werkstatt'
  | 'Kredit' | 'Tilgung' | 'Zinsen' | 'Leasing' | 'Versicherung' | 'Steuern' | 'Gebäude' | 'Bau'
  | 'Pacht' | 'Ackerbau' | 'Ernte' | 'Strom' | 'Biogas' | 'Maut' | 'Sonstiges';

/** Sparten für die Auswertung (Vorschlag 13) */
export type Branch = 'lohn' | 'transport' | 'ackerbau' | 'biogas';
export const BRANCH_NAMES: Record<Branch, string> = { lohn: 'Lohnarbeit', transport: 'Transport', ackerbau: 'Ackerbau', biogas: 'Biogas' };

/** Auswertung: Monate (Umsatz und direkte Kosten je Sparte, übrige Kosten), Maschinen, Fahrer, Kunden */
export interface Analytics {
  months: { year: number; month: number; revenue: Record<Branch, number>; direct: Record<Branch, number>; overhead: number; profit: number }[];
  machines: { id: number; hours: number; orders: number; revenue: number }[];
  drivers: { id: number; minutes: number }[];
  customers: { farmId: number; orders: number; revenue: number; margin: number; open: number }[];
  /** Anteil des Jahres, der schon vergangen ist (für Auslastung) */
  yearShare: number;
}

/** Biogasanlage (PB-07 bis PB-10) */
export interface BiogasPlant {
  siteId: number;
  kw: BiogasSize;
  status: 'genehmigung' | 'ausschreibung' | 'bau' | 'betrieb';
  /** eigenes Gebot und Zuschlag (ct/kWh) */
  bidCt: number;
  ct?: number;
  permitUntil: number;
  tenderAt?: number;
  readyAt?: number;
  /** Lager: Gülle (m³, Vorgrube), Silage (t), Gärrest (m³) */
  stock: { guelle: number; mais: number; gps: number; gras: number };
  gaer: number;
  /** Gülle-Lieferverträge mit Viehbetrieben (nehmen Gärrest zurück) */
  contracts: { farmId: number; m3Day: number; until: number }[];
  /** laufender Monat: Strom (kWh), Kosten (€); Ration heute */
  kwhMonth: number;
  costMonth: number;
  kwhTotal: number;
  today: Feed | null;
  /** Hinweise, damit Warnungen nicht täglich kommen */
  warnedShort?: number;
  warnedFull?: number;
}

/** Pachtangebot (PB-01 bis PB-03) */
export interface LeaseOffer {
  id: number;
  farmId: number;
  fields: number[];
  areaHa: number;
  soil: number;
  irrigated: boolean;
  /** ortsüblicher Preis je ha, Laufzeit, Angebotsfrist, Gebot der Konkurrenz (verdeckt), eigenes Gebot */
  refRent: number;
  years: number;
  until: number;
  competitorBid: number;
  playerBid?: number;
  reason: string;
}

/** Arbeitsgang einer eigenen Kultur */
export interface StepState {
  key: string;
  from: number;
  to: number;
  status: 'geplant' | 'auftrag' | 'erledigt' | 'verpasst' | 'entfällt';
  orderId?: number;
}

/** Pachtfläche mit Anbau (PB-02, PB-04) */
export interface Lease {
  id: number;
  farmId: number;
  fields: number[];
  areaHa: number;
  soil: number;
  irrigated: boolean;
  rentHa: number;
  startAt: number;
  endsAt: number;
  crop?: OwnCrop;
  steps: StepState[];
  nextCrop?: OwnCrop;
  lastCrop?: OwnCrop;
  yieldFactor: number;
  history: { year: number; crop: OwnCrop; tonnes: number; revenue: number }[];
}

/** Jahresabschluss (WF-08) */
export interface YearResult {
  year: number;
  revenue: number;
  expenses: number;
  afa: number;
  saleGain: number;
  profit: number;
  tax: number;
}

/** Bestellte Neumaschine (HM-06: Lieferzeit) */
export interface Delivery {
  id: number;
  machine: Omit<Machine, 'id'>;
  dealerId: number;
  at: number;
  price: number;
  /** geleast statt gekauft (Laufzeit in Monaten) */
  leaseMonths?: number;
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
  | {
      kind: 'startJob'; orderId: number; tractorId: number; implementId: number; driverId?: number;
      /** Gülle-Kette: Zubringer mit eigenem Fahrer, Schlepper und Zubringerfass */
      feeder?: { driverId: number; tractorId: number; implementId: number };
      /** Häckselkette: Abfahrer (Fahrer, Schlepper, Häckselwagen) und Radlader am Silo */
      haulers?: { driverId: number; tractorId: number; implementId: number }[];
      roller?: { driverId: number; machineId: number };
    }
  | { kind: 'buy'; offerId: number }
  | { kind: 'recall'; vehicle: number }
  | { kind: 'remind'; invoiceId: number }
  | { kind: 'order'; dealerId: number; modelKey: string; leaseMonths?: number }
  | { kind: 'check'; offerId: number }
  | { kind: 'sell'; machineId: number; mode: 'tradein' | 'privat' }
  | { kind: 'service'; machineId: number }
  | { kind: 'hire'; applicantId: number; asKind: 'fest' | 'saison' }
  | { kind: 'fire'; employeeId: number }
  | { kind: 'vacation'; employeeId: number; fromDay: number; days: number }
  | { kind: 'rent'; poolId: number; days: number }
  | { kind: 'extendRent'; employeeId: number; days: number }
  | { kind: 'takeOver'; employeeId: number; asKind: 'fest' | 'saison' }
  | { kind: 'swapDriver'; vehicle: number; driverId: number; chauffeurId?: number }
  | { kind: 'repair'; machineId: number; mode: 'dealer' | 'own'; mechanicId?: number }
  | { kind: 'buyParts'; amount: number }
  | { kind: 'build'; siteId: number; building: BuildingKey }
  | { kind: 'bidLease'; offerId: number; rentHa: number }
  | { kind: 'askLand'; farmId: number }
  | { kind: 'setCrop'; leaseId: number; crop: OwnCrop }
  | { kind: 'buildBiogas'; siteId: number; kw: BiogasSize; bidCt: number }
  | { kind: 'biogasBid'; ct: number }
  | { kind: 'buySubstrate'; substrate: Substrate; t: number }
  | { kind: 'buyMaisField'; farmId: number }
  | { kind: 'guelleContract'; farmId: number }
  | { kind: 'spreadGaerrest'; leaseId: number }
  | { kind: 'sellGaerrest'; m3: number }
  | { kind: 'buySite'; offerKey: string }
  | { kind: 'sellSite'; siteId: number }
  | { kind: 'transfer'; machineId: number; siteId: number; driverId: number; implementId?: number }
  | { kind: 'takeLoan'; amount: number; years: number }
  | { kind: 'repayLoan'; loanId: number; amount: number }
  | { kind: 'leaseBuyout'; machineId: number; buyout: boolean }
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
  /** Pacht und eigener Ackerbau */
  readonly leaseOffers: LeaseOffer[] = [];
  readonly leases: Lease[] = [];
  /** Wetterabfrage für Ertrag (Regen eines Tages in mm; setzt der Rechenkern) */
  rainOfDay: ((day: number) => number) | null = null;
  /** nächster Straßenknoten zu [lon, lat] (setzt der Rechenkern) */
  lonLatNode: ((lonLat: [number, number]) => number) | null = null;
  /** eigene Biogasanlage */
  biogas: BiogasPlant | null = null;
  /** Markt (Phase 5): Konkurrenten, Ruf, Statistik gewonnen/verloren */
  readonly competitors: Competitor[];
  reputation = 50;
  won = 0;
  lost = 0;
  private marketRng: Rng;
  /** Hofstelle eines Betriebs als [lon, lat] (setzt der Rechenkern) */
  nodeLonLat: ((node: number) => [number, number]) | null = null;
  /** Dieselpreis netto €/l (WF-07), schwankt täglich */
  dieselPrice = DIESEL_START;
  /** Jahresabschlüsse und laufende Sonderposten des aktuellen Jahres */
  readonly years: YearResult[] = [];
  private yearSaleGain = 0;
  private yearAfaSold = 0;
  private overdraftInterest = 0;
  /** festgesetzte Steuer, fällig am */
  taxDue: { amount: number; at: number; year: number } | null = null;
  /** Umsatz je Händler (Rabatt und Werkstattvorrang, HM-07) */
  readonly dealerSpend: Record<number, number> = {};
  /** aufgelaufene Lohnkosten des laufenden Monats (wird am Monatsersten gebucht) */
  private payrollAccrued = 0;
  /** heute verbrauchter Diesel, wird täglich als eine Buchung zusammengefasst */
  private dieselTodayL = 0;
  private dieselTodayEur = 0;
  /** Maut des Tages (Lkw), einmal täglich gebucht */
  private tollToday = 0;
  /** Arbeitsminuten je Mitarbeiter im laufenden Jahr (Auswertung) */
  workYear = 0;
  readonly workMinutesYear: Record<number, number> = {};
  private analyticsCache: { day: number; v: number; data: Analytics } | null = null;
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
    // eigener Zufallsstrom für den Markt, damit die übrigen Abläufe unverändert bleiben
    this.marketRng = new Rng(seed ^ 0x3a7c0e);
    this.competitors = generateCompetitors(() => this.marketRng.next());
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
      tollToday: this.tollToday,
      workYear: this.workYear,
      workMinutesYear: this.workMinutesYear,
      applicants: this.applicants,
      payrollAccrued: this.payrollAccrued,
      deliveries: this.deliveries,
      staffRequests: this.staffRequests,
      agencyPool: this.agencyPool,
      dieselPrice: this.dieselPrice,
      leaseOffers: this.leaseOffers,
      leases: this.leases,
      biogas: this.biogas,
      market: { rng: this.marketRng.getState(), competitors: this.competitors, reputation: this.reputation, won: this.won, lost: this.lost },
      years: this.years,
      yearSaleGain: this.yearSaleGain,
      yearAfaSold: this.yearAfaSold,
      overdraftInterest: this.overdraftInterest,
      taxDue: this.taxDue,
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
    this.tollToday = s.tollToday ?? 0;
    this.workYear = s.workYear ?? 0;
    for (const k of Object.keys(this.workMinutesYear)) delete this.workMinutesYear[Number(k)];
    Object.assign(this.workMinutesYear, s.workMinutesYear ?? {});
    this.analyticsCache = null;
    put(this.applicants, s.applicants ?? []);
    put(this.deliveries, s.deliveries ?? []);
    put(this.staffRequests, s.staffRequests ?? []);
    put(this.agencyPool, s.agencyPool ?? []);
    this.dieselPrice = s.dieselPrice ?? DIESEL_START;
    put(this.leaseOffers, s.leaseOffers ?? []);
    put(this.leases, s.leases ?? []);
    this.applyLeases();
    this.biogas = s.biogas ? structuredClone(s.biogas) : null;
    if (s.market) {
      this.marketRng.setState(s.market.rng);
      put(this.competitors, s.market.competitors);
      this.reputation = s.market.reputation;
      this.won = s.market.won;
      this.lost = s.market.lost;
    }
    put(this.years, s.years ?? []);
    this.yearSaleGain = s.yearSaleGain ?? 0;
    this.yearAfaSold = s.yearAfaSold ?? 0;
    this.overdraftInterest = s.overdraftInterest ?? 0;
    this.taxDue = s.taxDue ?? null;
    // ältere Spielstände: Anschaffungswert zum heutigen Marktwert
    for (const m of this.company.machines) {
      if (m.purchasePrice !== undefined) continue;
      m.purchasePrice = this.machineValueNow(m, 0);
      m.boughtAt ??= 0;
      m.afaYears = afaYears(m.type, START_YEAR - m.year);
    }
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

  // ---------- Pacht und eigener Ackerbau ----------

  /** Pachtflächen aus den Kundenbetrieben herausnehmen (auch nach dem Laden) */
  private applyLeases() {
    const fs = this.farms;
    if (!fs) return;
    for (const l of this.leases) {
      const farm = fs.farms[l.farmId];
      if (farm) farm.fields = farm.fields.filter((f) => !l.fields.includes(f));
      for (const f of l.fields) fs.fieldFarm[f] = -2;
    }
  }

  /** Neues Pachtangebot eines Betriebs (Betriebsaufgabe, Generationswechsel, Anfrage) */
  private makeLeaseOffer(farmId: number, time: number, reason: string): LeaseOffer | null {
    const fs = this.farms, f = this.fields;
    if (!fs || !f) return null;
    const farm = fs.farms[farmId];
    const cand = farm.fields.filter((i) => fs.fieldCrop[i] !== Crop.Gruenland && f.areaHa[i] <= 40);
    if (!cand.length) return null;
    const picked: number[] = [];
    let ha = 0;
    const start = this.marketRng.int(cand.length);
    const want = 1 + this.marketRng.int(3);
    for (let k = 0; k < cand.length && picked.length < want; k++) {
      const i = cand[(start + k) % cand.length];
      if (ha + f.areaHa[i] > 45) continue;
      picked.push(i);
      ha += f.areaHa[i];
    }
    if (!picked.length) return null;
    let soil = 0, irr = 0;
    for (const i of picked) { soil += fieldSoil(i) * f.areaHa[i]; if (fieldIrrigated(i)) irr += f.areaHa[i]; }
    soil = Math.round(soil / ha);
    const irrigated = irr >= ha / 2;
    const refRent = referenceRent(soil, irrigated);
    const offer: LeaseOffer = {
      id: this.nextId++, farmId, fields: picked, areaHa: Math.round(ha * 100) / 100, soil, irrigated, refRent,
      years: this.marketRng.next() < 0.5 ? 9 : 12, until: time + 21 * 1440,
      // Konkurrenten und Nachbarn bieten mit (PB-03): 95–120 % des ortsüblichen Preises
      competitorBid: Math.round((refRent * (0.95 + this.marketRng.next() * 0.25)) / 5) * 5,
      reason,
    };
    this.leaseOffers.push(offer);
    return offer;
  }

  bidLease(offerId: number, rentHa: number): string {
    const o = this.leaseOffers.find((x) => x.id === offerId);
    if (!o) return 'Angebot nicht mehr aktuell';
    if (!(rentHa >= 100 && rentHa <= 2500)) return 'Gebot zwischen 100 und 2.500 €/ha';
    o.playerBid = Math.round(rentHa);
    this.version++;
    return `Gebot ${fmtEur(o.playerBid)}/ha abgegeben – Entscheidung am ${fmtDay(o.until)}`;
  }

  /** Selbst nach Pachtland fragen (PB-01): nur bekannte, zufriedene Betriebe, je Betrieb einmal im Jahr */
  askLand(farmId: number, time: number): string {
    const farm = this.farms?.farms[farmId];
    if (!farm?.known) return 'Erst den Betrieb besuchen';
    if ((farm.landAskedAt ?? -1e9) > time - 365 * 1440) return 'Schon in diesem Jahr gefragt';
    farm.landAskedAt = time;
    if (farm.satisfaction < 55 || this.marketRng.next() > 0.25 + (farm.satisfaction - 55) / 100) {
      this.emit(time, 'info', `${farm.name}: Zurzeit gibt es keine Flächen abzugeben.`, farmId);
      return 'keine Flächen frei';
    }
    const o = this.makeLeaseOffer(farmId, time, 'auf Ihre Anfrage');
    if (!o) return 'keine passenden Flächen';
    this.emit(time, 'info', `${farm.name} bietet ${fmtHa(o.areaHa)} zur Pacht an (Ackerzahl ${o.soil}${o.irrigated ? ', beregnet' : ''}). Gebote bis ${fmtDay(o.until)}.`, farmId);
    return 'Angebot erhalten';
  }

  /** Fenster (Monat*100+Tag) mit Beginn ab `minStart`, dessen Ende nicht vor `notBefore` liegt */
  private window(from: number, to: number, minStart: number, notBefore: number): [number, number] {
    let t = Math.floor(Math.max(0, minStart, notBefore - 370 * 1440) / 1440) * 1440;
    for (let k = 0; k < 800; k++, t += 1440) {
      const d = gameDate(t);
      if (d.month * 100 + d.day !== from) continue;
      let e = t;
      for (let j = 0; j < 370; j++) { const g = gameDate(e); if (g.month * 100 + g.day === to) break; e += 1440; }
      if (e + 1439 < notBefore) continue;
      return [t, e + 1439];
    }
    return [notBefore, notBefore];
  }

  /** Arbeitsgänge einer Kultur ab einem Zeitpunkt terminieren (PB-04) */
  private schedule(crop: OwnCrop, time: number): StepState[] {
    const def = CROPS.find((c) => c.key === crop)!;
    const out: StepState[] = [];
    // Pflichtschritte nacheinander; offene Fenster zählen noch
    let minStart = 0;
    for (const st of def.steps) {
      if (!st.required) continue;
      const [a, e] = this.window(st.from, st.to, minStart, time);
      out.push({ key: st.key, from: a, to: e, status: 'geplant' });
      minStart = a;
    }
    // freiwillige Schritte (Stoppel) nur, wenn sie noch vor den Pflichtschritten passen
    const res: StepState[] = [];
    let k = 0;
    for (const st of def.steps) {
      if (st.required) { res.push(out[k++]); continue; }
      const next = out[k];
      const [a, e] = this.window(st.from, st.to, 0, time);
      res.push({ key: st.key, from: a, to: e, status: next && a < next.from ? 'geplant' : 'entfällt' });
    }
    return res;
  }

  /** Kultur für die nächste Saison festlegen (PB-04) */
  setCrop(leaseId: number, crop: OwnCrop, time: number): string {
    const l = this.leases.find((x) => x.id === leaseId);
    const def = CROPS.find((c) => c.key === crop);
    if (!l || !def) return 'Unbekannt';
    if (l.crop && l.steps.some((st) => st.status === 'auftrag' || st.status === 'erledigt')) {
      l.nextCrop = crop;
      this.version++;
      return `${def.name} folgt nach der Ernte`;
    }
    l.crop = crop;
    l.yieldFactor = 1;
    l.steps = this.schedule(crop, time);
    this.version++;
    const harvest = l.steps[l.steps.length - 1];
    return `${def.name} geplant, Ernte etwa ab ${fmtDay(harvest.from)}`;
  }

  /** Arbeitsgang eines Eigenauftrags erledigt */
  private ownStepDone(o: Order, time: number) {
    const l = this.leases.find((x) => x.id === o.ownLeaseId);
    const st = l?.steps.find((x) => x.orderId === o.id);
    if (!l || !st) return;
    const def = CROPS.find((c) => c.key === l.crop)?.steps.find((x) => x.key === st.key);
    if (time > st.to && def?.harvest) {
      // späte Ernte: −2 % je Tag
      l.yieldFactor *= Math.max(0.5, 1 - 0.02 * Math.ceil((time - st.to) / 1440));
    }
    if (st.status === 'verpasst' && !def?.harvest) { this.version++; return; }
    st.status = 'erledigt';
    if (st.key === 'stoppel') l.yieldFactor *= 1.03;
    if (def?.harvest) this.harvest(l, time);
    this.version++;
  }

  /** Ernte: Ertrag aus Boden, Fruchtfolge, Trockenheit, Termintreue; Verkauf zum Marktpreis (PB-05, PB-06) */
  private harvest(l: Lease, time: number) {
    const def = CROPS.find((c) => c.key === l.crop);
    if (!def) return;
    // Regen April–August dieses Jahres im Verhältnis zum Klimamittel (≈ 300 mm)
    let rain = 0, days = 0;
    if (this.rainOfDay) {
      const d0 = Math.floor(time / 1440);
      for (let d = Math.max(0, d0 - 200); d <= d0; d++) {
        const m = gameDate(d * 1440).month;
        if (m >= 4 && m <= 8) { rain += this.rainOfDay(d); days++; }
      }
    }
    const ratio = days > 60 ? rain / (300 * (days / 153)) : 1;
    const dry = l.irrigated ? 1 : Math.max(0.4, 1 - def.drought * Math.max(0, 0.9 - ratio));
    const tonnes = Math.round(def.yieldT * soilFactor(l.soil) * rotationFactor(def.key, l.lastCrop) * dry * l.yieldFactor * l.areaHa * 10) / 10;
    const price = Math.round(def.priceT * (0.9 + this.marketRng.next() * 0.2) * 100) / 100;
    // Silomais in die eigene Biogasanlage (PB-06), soweit das Silo Platz hat
    const intoSilo = def.key === 'mais' ? Math.min(tonnes, this.siloRoom()) : 0;
    if (intoSilo > 0) {
      this.biogas!.stock.mais += intoSilo;
      this.emit(time, 'info', `${intoSilo.toLocaleString('de-DE')} t Silomais ins Silo der Biogasanlage.`);
    }
    const revenue = Math.round((tonnes - intoSilo) * price);
    if (revenue > 0) this.book(time, `Ernte ${def.name}: ${(Math.round((tonnes - intoSilo) * 10) / 10).toLocaleString('de-DE')} t à ${fmtEur(price)}`, revenue, 'Ernte');
    l.history.push({ year: gameDate(time).year, crop: def.key, tonnes, revenue });
    this.emit(time, 'info', `Ernte ${def.name} (${fmtHa(l.areaHa)}): ${tonnes.toLocaleString('de-DE')} t (${(tonnes / l.areaHa).toLocaleString('de-DE', { maximumFractionDigits: 1 })} t/ha${!l.irrigated && dry < 0.95 ? ', Trockenheit' : ''}) – verkauft für ${fmtEur(revenue)}.`);
    l.lastCrop = def.key;
    l.crop = undefined;
    l.steps = [];
    if (l.nextCrop) { const n = l.nextCrop; l.nextCrop = undefined; this.setCrop(l.id, n, time); }
  }

  /** Täglich: Pachtangebote, Gebotsentscheidung, Arbeitsgänge, Pacht und Beregnung (1.10.), Pachtende */
  private farmingDaily(time: number) {
    const fs = this.farms;
    if (!fs || !this.fields) return;
    const d = gameDate(time);
    // neue Angebote: im Mittel zweimal im Monat (Betriebsaufgabe, Generationswechsel)
    if (this.marketRng.next() < 0.07) {
      const farm = fs.farms[this.marketRng.int(fs.farms.length)];
      const reason = this.marketRng.next() < 0.5 ? 'Betriebsaufgabe' : 'Generationswechsel';
      const o = this.makeLeaseOffer(farm.id, time, reason);
      if (o) this.emit(time, 'info', `Pachtangebot (${reason}): ${farm.name} gibt ${fmtHa(o.areaHa)} ab, Ackerzahl ${o.soil}${o.irrigated ? ', beregnet' : ''}, ${o.years} Jahre. Gebote bis ${fmtDay(o.until)}.`, farm.id);
    }
    // Gebote entscheiden
    for (let i = this.leaseOffers.length - 1; i >= 0; i--) {
      const o = this.leaseOffers[i];
      if (o.until > time) continue;
      this.leaseOffers.splice(i, 1);
      if (o.playerBid !== undefined && o.playerBid >= o.competitorBid) {
        const l: Lease = {
          id: this.nextId++, farmId: o.farmId, fields: o.fields, areaHa: o.areaHa, soil: o.soil, irrigated: o.irrigated,
          rentHa: o.playerBid, startAt: time, endsAt: time + o.years * 365 * 1440, steps: [], yieldFactor: 1, history: [],
        };
        this.leases.push(l);
        this.applyLeases();
        this.emit(time, 'info', `Zuschlag: ${fmtHa(o.areaHa)} von ${this.farmName(o.farmId)} gepachtet (${fmtEur(o.playerBid)}/ha, ${o.years} Jahre). Kultur im Reiter Ackerbau wählen.`, o.farmId);
      } else if (o.playerBid !== undefined) {
        this.emit(time, 'warnung', `Pacht ${fmtHa(o.areaHa)} von ${this.farmName(o.farmId)}: Ein anderer hat mehr geboten (${fmtEur(o.competitorBid)}/ha).`, o.farmId);
      }
    }
    // Arbeitsgänge
    for (const l of this.leases) {
      const def = CROPS.find((c) => c.key === l.crop);
      if (!def) continue;
      for (const st of l.steps) {
        const sd = def.steps.find((x) => x.key === st.key)!;
        if (st.status === 'geplant' && time >= st.from) {
          // Ernte mit eigenem Drescher/Roder, sonst Fremdleistung (Häckseln immer mit eigener Kette)
          const own = sd.service && (sd.service === 'haeckseln' || !isHarvest(sd.service) || this.company.machines.some((m) => m.type === SERVICE_IMPLEMENT[sd.service!]));
          if (sd.service && own) {
            const o: Order = {
              id: this.nextId++, requestId: 0, farmId: -1, service: sd.service, fields: l.fields.slice(), doneFields: [],
              areaHa: l.areaHa, priceHa: 0, earliest: st.from, latest: st.to, status: 'offen', dieselL: 0, dieselCost: 0, tractorHours: 0,
              // eigenes Korn holt der Landhandel am Feldrand ab (wie „nur Drusch“)
              ownLeaseId: l.id, chain: sd.service === 'haeckseln' ? 'komplett' : sd.service === 'drusch' ? 'haecksler' : undefined, doneT: isHarvest(sd.service) ? 0 : undefined,
              sourceNode: sd.service === 'haeckseln' ? this.biogasNode() : undefined,
            };
            this.orders.push(o);
            st.orderId = o.id;
            st.status = 'auftrag';
            this.emit(time, 'auftrag', `Eigene Fläche: ${sd.name} (${fmtHa(l.areaHa)}) steht an – fertig bis ${fmtDay(st.to)}. Im Reiter Aufträge starten.`);
          } else {
            const cost = Math.round(sd.costHa * l.areaHa);
            this.book(time, `${sd.name}, ${fmtHa(l.areaHa)} ${def.name}`, -cost, 'Ackerbau');
            st.status = 'erledigt';
            if (sd.harvest) { this.harvest(l, time); break; }
          }
        } else if (st.status === 'auftrag' && time > st.to) {
          const o = this.orders.find((x) => x.id === st.orderId);
          if (o && o.status === 'fertig') continue;
          if (sd.harvest) continue; // Ernte wartet, wird aber teurer (−2 %/Tag)
          if (sd.required) { st.status = 'verpasst'; l.yieldFactor *= 0.9; this.emit(time, 'warnung', `Eigene Fläche: ${sd.name} verpasst – Ertrag −10 %.`); }
          else st.status = 'entfällt';
          if (o && o.status === 'offen') o.status = 'fertig';
        } else if (st.status === 'geplant' && time > st.to) {
          st.status = sd.required ? 'verpasst' : 'entfällt';
        }
      }
    }
    // Pacht und Beregnung am 1. Oktober (Pachtjahr)
    if (d.month === 10 && d.day === 1) {
      let rent = 0, irr = 0;
      for (const l of this.leases) { rent += l.rentHa * l.areaHa; if (l.irrigated) irr += IRRIGATION_EUR_HA * l.areaHa; }
      if (rent) this.book(time, `Pacht für ${this.leases.length} Pachtverträge`, -Math.round(rent), 'Pacht');
      if (irr) this.book(time, 'Beregnung (Wasser, Strom, Technik)', -Math.round(irr), 'Ackerbau');
    }
    // Pachtende: Flächen zurück, sobald keine Kultur mehr steht
    for (let i = this.leases.length - 1; i >= 0; i--) {
      const l = this.leases[i];
      if (time < l.endsAt || l.crop) continue;
      this.leases.splice(i, 1);
      const farm = fs.farms[l.farmId];
      if (farm) farm.fields.push(...l.fields);
      for (const f of l.fields) fs.fieldFarm[f] = l.farmId;
      this.emit(time, 'info', `Pachtvertrag mit ${this.farmName(l.farmId)} beendet: ${fmtHa(l.areaHa)} gehen zurück.`, l.farmId);
    }
  }

  // ---------- Biogasanlage (PB-07 bis PB-10) ----------

  /** Knoten der Anlage (Silo, Gärrestlager); ohne Anlage der Stammhof */
  private biogasNode(): number | undefined {
    return this.biogas ? this.site(this.biogas.siteId)?.node : undefined;
  }

  /** freier Platz im Silo (t), nur bei laufender Anlage */
  private siloRoom(): number {
    const p = this.biogas;
    if (!p || p.status !== 'betrieb') return 0;
    const def = BIOGAS.find((d) => d.kw === p.kw)!;
    return Math.max(0, Math.floor(def.siloT - p.stock.mais - p.stock.gps - p.stock.gras));
  }

  /** Bau beantragen (PB-07): Hofstelle oder Resthof (Abstand zur Wohnbebauung), eigene Flächen nötig */
  buildBiogas(siteId: number, kw: BiogasSize, bidCt: number, time: number): string {
    if (this.biogas) return 'Es gibt schon eine Anlage';
    const st = this.site(siteId);
    const def = BIOGAS.find((d) => d.kw === kw);
    if (!st || !def) return 'Unbekannt';
    if (st.kind === 'gewerbe') return 'Im Gewerbegebiet nicht genehmigungsfähig (Abstand zur Wohnbebauung, kein Außenbereich)';
    const ha = this.leases.reduce((a, l) => a + l.areaHa, 0);
    if (ha < 10) return 'Privilegierung braucht eigenen Ackerbau: mindestens 10 ha Pachtfläche';
    if (!(bidCt >= 10 && bidCt <= EEG_MAX_CT)) return `Gebot zwischen 10 und ${EEG_MAX_CT.toLocaleString('de-DE')} ct/kWh`;
    if (!this.canPay(def.permitFee)) return 'Nicht genug Geld für Gutachten und Genehmigung';
    this.book(time, `Biogasanlage ${kw} kW: Gutachten und Genehmigung`, -def.permitFee, 'Bau');
    this.biogas = {
      siteId, kw, status: 'genehmigung', bidCt: Math.round(bidCt * 100) / 100, permitUntil: time + def.permitWeeks * 7 * 1440,
      stock: { guelle: 0, mais: 0, gps: 0, gras: 0 }, gaer: 0, contracts: [], kwhMonth: 0, costMonth: 0, kwhTotal: 0, today: null,
    };
    this.version++;
    this.emit(time, 'info', `Biogasanlage ${kw} kW in ${st.name} beantragt. Genehmigung etwa bis ${fmtDay(this.biogas.permitUntil)}, danach EEG-Ausschreibung (1. April oder 1. Oktober).`);
    return `beantragt, Genehmigung bis ${fmtDay(this.biogas.permitUntil)}`;
  }

  biogasBid(ct: number): string {
    const p = this.biogas;
    if (!p || (p.status !== 'genehmigung' && p.status !== 'ausschreibung')) return 'Kein offenes Gebot';
    if (!(ct >= 10 && ct <= EEG_MAX_CT)) return `Gebot zwischen 10 und ${EEG_MAX_CT.toLocaleString('de-DE')} ct/kWh`;
    p.bidCt = Math.round(ct * 100) / 100;
    this.version++;
    return `Gebot ${p.bidCt.toLocaleString('de-DE')} ct/kWh`;
  }

  /** nächster Gebotstermin (1. April oder 1. Oktober) ab einem Zeitpunkt */
  private nextTender(after: number): number {
    let t = Math.ceil(after / 1440) * 1440;
    for (let k = 0; k < 400; k++, t += 1440) {
      const d = gameDate(t);
      if (d.day === 1 && (d.month === 4 || d.month === 10)) return t;
    }
    return t;
  }

  /** Substrat einkaufen (frei Silo); außerhalb der Ernte 20 % teurer (aus fremden Silos) */
  buySubstrate(kind: Substrate, t: number, time: number): string {
    const p = this.biogas;
    if (!p || p.status !== 'betrieb') return 'Erst wenn die Anlage läuft';
    if (!(t >= 10)) return 'Mindestens 10 t';
    const room = this.siloRoom();
    if (t > room) return `Im Silo ist nur Platz für ${room.toLocaleString('de-DE')} t`;
    const m = gameDate(time).month;
    const season = kind === 'mais' ? m === 9 || m === 10 : kind === 'gps' ? m === 6 || m === 7 : m >= 5 && m <= 9;
    const price = SUBSTRATE_PRICE[kind] * (season ? 1 : 1.2);
    const cost = Math.round(t * price);
    if (!this.canPay(cost)) return 'Nicht genug Geld';
    p.stock[kind] += Math.round(t);
    this.book(time, `${SUBSTRATE_NAME[kind]} ${Math.round(t).toLocaleString('de-DE')} t frei Silo à ${fmtEur(price)}`, -cost, 'Biogas');
    this.version++;
    return `${Math.round(t).toLocaleString('de-DE')} t ${SUBSTRATE_NAME[kind]} eingelagert`;
  }

  /** Mais auf dem Halm kaufen (PB-10): eigene Häckselkette erntet ins Silo der Anlage */
  buyMaisField(farmId: number, time: number): string {
    const p = this.biogas, fs = this.farms, f = this.fields;
    const farm = fs?.farms[farmId];
    if (!p || p.status !== 'betrieb' || !fs || !f) return 'Erst wenn die Anlage läuft';
    if (!farm?.known) return 'Erst den Betrieb besuchen';
    const m = gameDate(time).month;
    if (m !== 8 && m !== 9 && m !== 10) return 'Mais auf dem Halm gibt es von August bis Oktober';
    if (this.orders.some((o) => o.farmId === farmId && o.biogasPriceT !== undefined && o.status !== 'fertig')) return 'Läuft schon';
    const mais = farm.fields.filter((i) => fs.fieldCrop[i] === Crop.Mais);
    if (!mais.length || farm.satisfaction < 40) return `${farm.name} verkauft keinen Mais`;
    const picked: number[] = [];
    let ha = 0;
    for (const i of mais) { if (ha + f.areaHa[i] > 30) continue; picked.push(i); ha += f.areaHa[i]; }
    if (!picked.length) return 'keine passenden Flächen';
    const priceT = 32;
    const room = this.siloRoom();
    if (ha * 42 > room) return `Zu wenig Platz im Silo (${room.toLocaleString('de-DE')} t frei, etwa ${Math.round(ha * 42).toLocaleString('de-DE')} t)`;
    const o: Order = {
      id: this.nextId++, requestId: 0, farmId, service: 'haeckseln', fields: picked, doneFields: [], areaHa: Math.round(ha * 100) / 100,
      priceHa: 0, earliest: time, latest: time + 21 * 1440, status: 'offen', dieselL: 0, dieselCost: 0, tractorHours: 0,
      chain: 'komplett', doneT: 0, sourceNode: this.biogasNode(), biogasPriceT: priceT,
    };
    this.orders.push(o);
    this.version++;
    this.emit(time, 'auftrag', `${farm.name} verkauft ${fmtHa(o.areaHa)} Mais auf dem Halm (${priceT} €/t). Häckseln mit eigener Kette bis ${fmtDay(o.latest)} – im Reiter Aufträge starten.`, farmId);
    return 'gekauft, Auftrag angelegt';
  }

  /** Gülle-Liefervertrag mit einem Viehbetrieb (ein Jahr; der Betrieb nimmt Gärrest zurück) – zweiter Aufruf kündigt */
  guelleContract(farmId: number, time: number): string {
    const p = this.biogas;
    const farm = this.farms?.farms[farmId];
    if (!p) return 'Keine Biogasanlage';
    const i = p.contracts.findIndex((c) => c.farmId === farmId);
    if (i >= 0) { p.contracts.splice(i, 1); this.version++; return 'Vertrag beendet'; }
    if (!farm?.known) return 'Erst den Betrieb besuchen';
    if (!farm.livestock) return `${farm.name} hält kein Vieh`;
    if (farm.satisfaction < 50) return `${farm.name} ist nicht zufrieden genug`;
    const m3Day = farmSlurryPerDay(farm.fields.reduce((a, x) => a + (this.fields?.areaHa[x] ?? 0), 0));
    if (m3Day < 0.5) return 'zu wenig Gülle';
    p.contracts.push({ farmId, m3Day, until: time + 365 * 1440 });
    this.version++;
    return `Vertrag: ${m3Day.toLocaleString('de-DE')} m³ Gülle am Tag (Anfuhr ${fmtEur(GUELLE_HAUL_EUR)}/m³), Gärrest geht zurück`;
  }

  /** Gärrest auf eine eigene Pachtfläche (PB-09): Eigenauftrag mit dem Güllefass, außerhalb der Sperrfrist */
  spreadGaerrest(leaseId: number, time: number): string {
    const p = this.biogas;
    const l = this.leases.find((x) => x.id === leaseId);
    if (!p || p.status !== 'betrieb' || !l) return 'Unbekannt';
    if (gaerBlocked(gameDate(time).month)) return 'Sperrfrist (1. Oktober bis 31. Januar)';
    if (this.orders.some((o) => o.gaerrest && o.ownLeaseId === leaseId && o.status !== 'fertig')) return 'Läuft schon';
    const m3 = Math.round(l.areaHa * GAER_GABE);
    if (p.gaer < m3) return `Zu wenig Gärrest (${Math.round(p.gaer)} m³, gebraucht ${m3} m³)`;
    p.gaer -= m3;
    const o: Order = {
      id: this.nextId++, requestId: 0, farmId: -1, service: 'guelle', fields: l.fields.slice(), doneFields: [], areaHa: l.areaHa, priceHa: 0,
      earliest: time, latest: time + 21 * 1440, status: 'offen', dieselL: 0, dieselCost: 0, tractorHours: 0,
      gabe: GAER_GABE, doneM3: 0, ownLeaseId: l.id, gaerrest: true, sourceNode: this.biogasNode(),
    };
    this.orders.push(o);
    this.version++;
    return `Auftrag angelegt: ${m3.toLocaleString('de-DE')} m³ Gärrest auf ${fmtHa(l.areaHa)}`;
  }

  /** Gärrest abgeben (Gärrestbörse, Abholung durch Dritte) */
  sellGaerrest(m3: number, time: number): string {
    const p = this.biogas;
    if (!p) return 'Keine Biogasanlage';
    const v = Math.min(Math.round(m3), Math.floor(p.gaer));
    if (!(v >= 10)) return 'Mindestens 10 m³';
    if (gaerBlocked(gameDate(time).month)) return 'Sperrfrist: Abnehmer nehmen erst ab Februar wieder Gärrest';
    p.gaer -= v;
    this.book(time, `Gärrest abgegeben: ${v.toLocaleString('de-DE')} m³ à ${fmtEur(GAER_SELL_EUR)}`, -v * GAER_SELL_EUR, 'Biogas');
    this.version++;
    return `${v.toLocaleString('de-DE')} m³ abgegeben`;
  }

  /** AfA der Anlage (20 Jahre) */
  private biogasAfa(from: number, to: number): number {
    const p = this.biogas;
    if (!p || p.status !== 'betrieb' || p.readyAt === undefined) return 0;
    const cost = BIOGAS.find((d) => d.kw === p.kw)!.cost;
    const months = Math.max(0, Math.floor((to - Math.max(from, p.readyAt)) / (30 * 1440)));
    return Math.round((cost / (BIOGAS_AFA_YEARS * 12)) * months);
  }

  /** Täglich: Genehmigung, Ausschreibung, Bau, Lieferungen, Fütterung, Gärrest, Abrechnung */
  private biogasDaily(time: number) {
    const p = this.biogas;
    if (!p) return;
    const def = BIOGAS.find((d) => d.kw === p.kw)!;
    const d = gameDate(time);
    if (p.status === 'genehmigung' && time >= p.permitUntil) {
      p.status = 'ausschreibung';
      p.tenderAt = this.nextTender(time);
      this.version++;
      this.emit(time, 'info', `Biogasanlage genehmigt. Nächster Gebotstermin der EEG-Ausschreibung: ${fmtDay(p.tenderAt)} (Gebot ${p.bidCt.toLocaleString('de-DE')} ct/kWh).`);
    }
    if (p.status === 'ausschreibung' && time >= (p.tenderAt ?? 0)) {
      // Zuschlagsgrenze der Runde (verdeckt): 17,6 bis 19,43 ct/kWh
      const clearing = Math.round((17.6 + this.marketRng.next() * (EEG_MAX_CT - 17.6)) * 100) / 100;
      if (p.bidCt > clearing) {
        p.tenderAt = this.nextTender(time + 1440);
        this.emit(time, 'warnung', `EEG-Ausschreibung: kein Zuschlag (Grenze ${clearing.toLocaleString('de-DE')} ct/kWh). Nächste Runde ${fmtDay(p.tenderAt)}.`);
      } else if (!this.canPay(def.cost)) {
        p.tenderAt = this.nextTender(time + 1440);
        this.emit(time, 'warnung', `Zuschlag erhalten, aber die Finanzierung fehlt (${fmtEur(def.cost)}). Zuschlag verfällt – nächste Runde ${fmtDay(p.tenderAt)}.`);
      } else {
        p.ct = p.bidCt;
        p.status = 'bau';
        p.readyAt = time + def.buildWeeks * 7 * 1440;
        this.book(time, `Bau Biogasanlage ${p.kw} kW`, -def.cost, 'Bau');
        this.emit(time, 'info', `Zuschlag für ${p.ct.toLocaleString('de-DE')} ct/kWh (20 Jahre). Bau der Biogasanlage bis etwa ${fmtDay(p.readyAt)}.`);
      }
      this.version++;
    }
    if (p.status === 'bau' && time >= (p.readyAt ?? 0)) {
      p.status = 'betrieb';
      this.version++;
      this.emit(time, 'info', `Biogasanlage ${p.kw} kW läuft an. Substrat einlagern (Silo ${def.siloT.toLocaleString('de-DE')} t), Gülleverträge abschließen.`);
    }
    if (p.status !== 'betrieb') return;
    // Gülle-Anfuhr (Vorgrube fasst 30 Tage) und Rücknahme Gärrest durch die Lieferanten (Februar–September)
    let delivered = 0, back = 0;
    for (let i = p.contracts.length - 1; i >= 0; i--) {
      const c = p.contracts[i];
      if (time >= c.until) {
        const farm = this.farms?.farms[c.farmId];
        if (farm && farm.satisfaction >= 40) c.until += 365 * 1440;
        else { p.contracts.splice(i, 1); this.emit(time, 'info', `Güllevertrag mit ${this.farmName(c.farmId)} ausgelaufen.`, c.farmId); continue; }
      }
      delivered += c.m3Day;
      if (!gaerBlocked(d.month) && d.month <= 9) back += (c.m3Day * 365 / 243) * 0.95;
    }
    const pit = delivered * 30;
    const take = Math.max(0, Math.min(delivered, pit - p.stock.guelle));
    p.stock.guelle += take;
    p.costMonth += take * GUELLE_HAUL_EUR;
    p.gaer = Math.max(0, p.gaer - back);
    // Fütterung: so viel, wie Substrat und Platz im Gärrestlager erlauben
    const target = dailyTarget(p.kw);
    let feed = ration(target, p.stock);
    const room = def.gaerM3 - p.gaer;
    const gaer = gaerOf(feed);
    if (gaer > room) {
      const f = Math.max(0, room) / gaer;
      feed = { guelle: feed.guelle * f, mais: feed.mais * f, gps: feed.gps * f, gras: feed.gras * f, kwh: feed.kwh * f };
      if ((p.warnedFull ?? -1e9) < time - 7 * 1440) { p.warnedFull = time; this.emit(time, 'warnung', 'Gärrestlager voll – die Biogasanlage fährt herunter. Gärrest ausbringen oder abgeben.'); }
    } else if (feed.kwh < target * 0.95 && (p.warnedShort ?? -1e9) < time - 7 * 1440) {
      p.warnedShort = time;
      this.emit(time, 'warnung', `Biogasanlage: Substrat reicht nur für ${Math.round((feed.kwh / target) * 100)} % Leistung (Maisdeckel ${Math.round(0.25 * 100)} %: Gülle, GPS oder Gras nötig).`);
    }
    p.stock.guelle -= feed.guelle;
    p.stock.mais -= feed.mais;
    p.stock.gps -= feed.gps;
    p.stock.gras -= feed.gras;
    p.gaer += gaerOf(feed);
    p.kwhMonth += feed.kwh;
    p.kwhTotal += feed.kwh;
    p.today = feed;
    this.version++;
    // Abrechnung am Monatsersten: Strom (Netzbetreiber), Betrieb und Wartung, fixe Kosten, Gülle-Anfuhr
    if (d.day === 1 && p.kwhMonth > 0) {
      this.book(time, `Stromerlös Biogas: ${Math.round(p.kwhMonth).toLocaleString('de-DE')} kWh à ${(p.ct ?? 0).toLocaleString('de-DE')} ct`, Math.round((p.kwhMonth * (p.ct ?? 0)) / 100), 'Strom');
      const opex = (p.kwhMonth * OPEX_CT) / 100 + (def.cost * FIXED_SHARE) / 12 + p.costMonth;
      this.book(time, 'Biogas: Betrieb, Wartung BHKW, Versicherung, Gülle-Anfuhr', -Math.round(opex), 'Biogas');
      p.kwhMonth = 0;
      p.costMonth = 0;
    }
  }

  // ---------- Standorte und Gebäude ----------

  site(id?: number): Site | undefined {
    const sites = this.company.sites ?? [];
    return sites.find((x) => x.id === (id ?? 1)) ?? sites[0];
  }

  /** Gebäude fertig an einem Standort (ohne Angabe: irgendwo) */
  hasBuilding(key: BuildingKey, siteId?: number): boolean {
    const list = siteId === undefined ? this.company.sites ?? [] : [this.site(siteId)].filter(Boolean) as Site[];
    return list.some((x) => x.buildings[key]?.done);
  }

  /** Bauen (ST-03, ST-05): ggf. erst Genehmigung, dann Bauzeit; bezahlt wird bei Baubeginn */
  build(siteId: number, key: BuildingKey, time: number): string {
    const st = this.site(siteId);
    const def = BUILDINGS.find((b) => b.key === key);
    if (!st || !def) return 'Unbekannt';
    if (st.buildings[key]) return st.buildings[key]!.done ? 'Steht schon' : 'Ist schon beantragt bzw. im Bau';
    if (def.requires && !st.buildings[def.requires]) return `Zuerst ${BUILDINGS.find((b) => b.key === def.requires)!.name}`;
    const fee = def.permit ? PERMIT[st.kind].fee : 0;
    if (!this.canPay(def.cost + fee)) return 'Nicht genug Geld (auch nicht mit Kontokorrent) – Darlehen?';
    if (fee) this.book(time, `Baugenehmigung ${def.name} (${st.name})`, -fee, 'Gebäude');
    this.book(time, `Bau ${def.name} (${st.name})`, -def.cost, 'Bau');
    const permitUntil = def.permit ? time + PERMIT[st.kind].weeks * 7 * 1440 : undefined;
    const readyAt = (permitUntil ?? time) + def.weeks * 7 * 1440;
    st.buildings[key] = { done: false, permitUntil, readyAt };
    this.version++;
    this.emit(time, 'info', `${def.name} in ${st.name}: ${def.permit ? `Genehmigung bis etwa ${fmtDay(permitUntil!)}, ` : ''}fertig etwa ${fmtDay(readyAt)}.`);
    return `beauftragt, fertig etwa ${fmtDay(readyAt)}`;
  }

  /** Neuen Standort kaufen oder pachten (ST-01) */
  buySite(offerKey: string, time: number, node: number): string {
    const o = SITE_OFFERS.find((x) => x.key === offerKey);
    if (!o) return 'Angebot unbekannt';
    const sites = (this.company.sites ??= []);
    if (sites.some((x) => x.name === o.name)) return 'Gehört schon zum Betrieb';
    if (o.price && !this.canPay(o.price)) return 'Nicht genug Geld – Darlehen?';
    const id = sites.reduce((a, x) => Math.max(a, x.id), 0) + 1;
    const buildings: Site['buildings'] = {};
    for (const b of o.buildings) buildings[b] = { done: true };
    sites.push({ id, name: o.name, kind: o.kind, node, lonLat: o.lonLat, rentPerMonth: o.rentPerMonth, buildings, purchasePrice: o.price || undefined });
    if (o.price) this.book(time, `Kauf ${o.name}`, -o.price, 'Bau');
    this.version++;
    this.emit(time, 'info', `${o.name} gehört jetzt zum Betrieb${o.rentPerMonth ? ` (Pacht ${fmtEur(o.rentPerMonth)} im Monat)` : ''}. Maschinen lassen sich im Reiter Standorte dorthin überführen.`);
    return o.rentPerMonth ? 'gepachtet' : 'gekauft';
  }

  /** Standort aufgeben (ST-04): Verkauf zu 80 % des Grundstücks plus 50 % der Gebäude, Maschinen gehen zum Stammhof */
  sellSite(siteId: number, time: number): string {
    const sites = this.company.sites ?? [];
    const st = sites.find((x) => x.id === siteId);
    if (!st || st.id === 1) return 'Der Stammhof bleibt';
    let price = Math.round((st.purchasePrice ?? 0) * 0.8);
    for (const [k, b] of Object.entries(st.buildings)) if (b?.done) price += Math.round((BUILDINGS.find((x) => x.key === k)?.cost ?? 0) * 0.5);
    for (const m of this.company.machines) if (m.siteId === siteId) m.siteId = undefined;
    sites.splice(sites.indexOf(st), 1);
    if (price) this.book(time, `Verkauf ${st.name}`, price, 'Bau');
    this.version++;
    this.emit(time, 'info', `${st.name} aufgegeben${price ? `, Erlös ${fmtEur(price)}` : ''}. Maschinen zählen jetzt zum Stammhof.`);
    return 'aufgegeben';
  }

  /** Täglich: Genehmigungen, Bauende; monatlich laufende Kosten und Pacht */
  private sitesDaily(time: number) {
    for (const st of this.company.sites ?? []) {
      for (const [k, b] of Object.entries(st.buildings)) {
        if (!b || b.done) continue;
        const def = BUILDINGS.find((x) => x.key === k)!;
        if (b.permitUntil !== undefined && time >= b.permitUntil && time - 1440 < b.permitUntil) {
          this.emit(time, 'info', `Baugenehmigung erteilt: ${def.name} in ${st.name}. Der Bau beginnt.`);
        }
        if (time >= (b.readyAt ?? 0)) {
          b.done = true;
          this.version++;
          this.emit(time, 'info', `Fertig: ${def.name} in ${st.name}. ${def.effect}.`);
        }
      }
    }
    if (gameDate(time).day === 1) {
      let running = 0, rent = 0;
      for (const st of this.company.sites ?? []) {
        rent += st.rentPerMonth ?? 0;
        for (const [k, b] of Object.entries(st.buildings)) if (b?.done) running += (BUILDINGS.find((x) => x.key === k)?.runningPerYear ?? 0) / 12;
      }
      if (running > 0) this.book(time, 'Gebäude: Strom, Grundsteuer, Versicherung, Instandhaltung', -running, 'Gebäude');
      if (rent > 0) this.book(time, 'Pacht Standorte', -rent, 'Gebäude');
    }
  }

  /** AfA auf Gebäude (33 Jahre) für einen Zeitraum */
  private buildingAfa(from: number, to: number): number {
    let afa = 0;
    for (const st of this.company.sites ?? []) {
      for (const [k, b] of Object.entries(st.buildings)) {
        if (!b?.done || b.readyAt === undefined) continue;
        const cost = BUILDINGS.find((x) => x.key === k)?.cost ?? 0;
        const months = Math.max(0, Math.floor((to - Math.max(from, b.readyAt)) / (30 * 1440)));
        afa += (cost / (33 * 12)) * months;
      }
    }
    return Math.round(afa);
  }

  // ---------- Markt (Phase 5) ----------

  /** Stammkunde (MK-03): mindestens 3 erledigte Aufträge und zufrieden */
  isLoyal(farmId: number): boolean {
    const f = this.farms?.farms[farmId];
    return !!f && (f.orderCount ?? 0) >= 3 && f.satisfaction >= 70;
  }

  private farmLonLat(farmId: number): [number, number] | null {
    const f = this.farms?.farms[farmId];
    return f && this.nodeLonLat ? this.nodeLonLat(f.homeNode) : null;
  }

  /** Marktpreis je ha für eine Dienstleistung (ohne Konkurrenzaufschlag) */
  private marketPriceHa(service: Service, gabe?: number, chain?: 'haecksler' | 'komplett'): number {
    if (gabe) return SERVICE_BASE_PRICE.guelle * gabe;
    if (chain) return service === 'drusch' ? THRESH_PRICE_HA[chain] : CHOP_PRICE_HA[chain];
    return SERVICE_BASE_PRICE[service];
  }

  /** Bestes Angebot der Konkurrenz für einen Betrieb (Preisniveau, Preiskampf, Anfahrt) */
  competitorOffer(farmId: number, service: Service, time: number, gabe?: number, chain?: 'haecksler' | 'komplett'): { priceHa: number; id: number } | null {
    const pos = this.farmLonLat(farmId);
    if (!pos) return null;
    const base = this.marketPriceHa(service, gabe, chain);
    let best: { priceHa: number; id: number } | null = null;
    for (const c of this.competitors) {
      if (!c.services.includes(service)) continue;
      const km = kmBetween(c.lonLat, pos);
      if (km > COMPETITOR_RANGE_KM + 15) continue;
      const war = c.warUntil > time ? c.warCut : 0;
      const price = base * c.priceLevel * (1 - war) * (1 + Math.max(0, km - 15) * 0.004);
      if (!best || price < best.priceHa) best = { priceHa: Math.round(price * 100) / 100, id: c.id };
    }
    return best;
  }

  /** Preiskampf in der Nähe des Betriebs? (MK-04) */
  private priceWarNear(farmId: number, time: number): Competitor | null {
    const pos = this.farmLonLat(farmId);
    if (!pos) return null;
    for (const c of this.competitors) if (c.warUntil > time && kmBetween(c.lonLat, pos) <= PRICE_WAR_KM) return c;
    return null;
  }

  private changeReputation(delta: number) {
    this.reputation = Math.max(0, Math.min(100, Math.round((this.reputation + delta) * 10) / 10));
  }

  /** Auftrag an die Konkurrenz verloren (Statistik, Meldungstext) */
  private lostTo(r: Request): string {
    this.lost++;
    const c = this.competitors.find((x) => x.id === r.competitorId);
    if (c) c.won++;
    return c ? ` Den Auftrag bekommt ${c.name} (${c.town}).` : '';
  }

  /** Täglich: Preiskämpfe starten/enden, Abwanderung, Empfehlungen (MK-03 bis MK-05) */
  private marketDaily(time: number) {
    const r = this.marketRng;
    for (const c of this.competitors) {
      if (c.warUntil > 0 && c.warUntil <= time) {
        c.warUntil = 0;
        c.warCut = 0;
        this.emit(time, 'info', `${c.name} (${c.town}) beendet den Preiskampf.`);
      }
    }
    // im Mittel alle drei Monate ein Preiskampf irgendwo
    if (r.next() < 1 / 90) {
      const free = this.competitors.filter((c) => c.warUntil === 0 && c.size !== 'klein');
      if (free.length) {
        const c = free[r.int(free.length)];
        c.warCut = Math.round((0.1 + r.next() * 0.1) * 100) / 100;
        c.warUntil = time + (30 + r.int(31)) * 1440;
        this.emit(time, 'warnung', `Preiskampf: ${c.name} (${c.town}) senkt die Preise um ${Math.round(c.warCut * 100)} % bis ${fmtDay(c.warUntil)}. Kunden im Umkreis von ${PRICE_WAR_KM} km vergleichen jetzt genauer.`);
      }
    }
    const fs = this.farms;
    if (!fs) return;
    // Abwanderung im Preiskampf: unzufriedene Nicht-Stammkunden in der Nähe
    for (const f of fs.farms) {
      if (!f.known || f.rivalUntil > time || this.isLoyal(f.id) || f.satisfaction >= 65) continue;
      const war = this.priceWarNear(f.id, time);
      if (war && r.next() < 0.004) {
        f.rivalUntil = war.warUntil + 30 * 1440;
        war.won++;
        this.emit(time, 'warnung', `${f.name} wechselt im Preiskampf zu ${war.name}.`, f.id);
      }
    }
    // Empfehlungen bei gutem Ruf (monatlich): ein unbekannter Nachbar eines Stammkunden meldet sich
    if (gameDate(time).day === 15 && this.reputation >= 60 && r.next() < (this.reputation - 50) / 80) {
      const loyal = fs.farms.filter((f) => this.isLoyal(f.id));
      const unknown = fs.farms.filter((f) => !f.known && f.rivalUntil <= time);
      if (loyal.length && unknown.length && this.nodeLonLat) {
        const ref = loyal[r.int(loyal.length)];
        const pos = this.nodeLonLat(ref.homeNode);
        let best = unknown[0], bd = Infinity;
        for (const u of unknown) { const d = kmBetween(this.nodeLonLat(u.homeNode), pos); if (d < bd) { bd = d; best = u; } }
        best.known = true;
        this.emit(time, 'info', `Empfehlung: ${best.name} hat von ${ref.name} gehört und meldet sich – jetzt im Adressbuch.`, best.id);
      }
    }
    // Ruf: zufriedene Stammkunden stärken ihn langsam
    if (gameDate(time).day === 1) {
      const loyalCount = fs.farms.filter((f) => this.isLoyal(f.id)).length;
      this.changeReputation(Math.min(3, loyalCount * 0.3));
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
    if (id < 0) return 'Eigene Fläche';
    return this.farms?.farms[id]?.name ?? `Betrieb ${id}`;
  }

  /** Felder, die schon in einer offenen Anfrage oder einem laufenden Auftrag stecken */
  private busyFields(): Set<number> {
    const s = new Set<number>();
    for (const r of this.requests) if (r.status === 'offen') r.fields.forEach((f) => s.add(f));
    for (const o of this.orders) if (o.status !== 'fertig') o.fields.forEach((f) => s.add(f));
    return s;
  }

  /** Erzeugt ggf. eine Anfrage eines Betriebs für eine Dienstleistung der Saison */
  private maybeRequest(farmId: number, time: number, chance: number, channel: Request['channel']): Request | null {
    const fs = this.farms;
    const f = this.fields;
    const season = seasonServices(time);
    if (!fs || !f || !season.length) return null;
    const farm = fs.farms[farmId];
    if (this.isRival(farmId, time)) return null;
    if (this.requests.some((r) => r.farmId === farmId && r.status === 'offen')) return null;
    const trial = this.isTrial(farmId, time);
    // Gülle gibt es nur auf Betrieben mit Vieh
    const offered = season.filter((x) => x.service !== 'guelle' || farm.livestock);
    if (!offered.length) return null;
    season.length = 0;
    season.push(...offered);
    // Dienstleistung der Saison wählen (bei mehreren nach Gewicht)
    const total = season.reduce((a, x) => a + x.weight, 0);
    let pick = this.rng.next() * total;
    let sv = season[0];
    for (const x of season) { pick -= x.weight; if (pick < 0) { sv = x; break; } }
    // Ruf (MK-05), Stammkunde (MK-03) und Preiskampf in der Nähe (MK-04) wirken auf die Häufigkeit
    let mult = (0.7 + (0.6 * this.reputation) / 100) * (this.isLoyal(farmId) ? 1.5 : 1);
    if (this.priceWarNear(farmId, time) && !this.isLoyal(farmId)) mult *= 0.6;
    if (this.rng.next() >= (trial ? chance * 0.5 : chance) * Math.min(1, sv.weight) * mult) return null;
    const busy = this.busyFields();
    const cand = farm.fields.filter((i) => {
      if (busy.has(i) || f.areaHa[i] > (trial ? TRIAL_MAX_HA : MAX_REQUEST_FIELD_HA)) return false;
      return sv.crops.includes(fs.fieldCrop[i] as Crop);
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
    // Gülle: Gabe 20 m³/ha zu Getreide/Raps, 25 m³/ha vor Mais/Rüben (Annahme, etwa 80–100 kg N/ha)
    const gabe = sv.service === 'guelle' ? (sv.crops.includes(Crop.Mais) ? 25 : 20) : undefined;
    // Häckseln: Viehbetriebe mit eigener Technik geben oft nur den Häcksler in Auftrag
    // Drusch: die meisten Betriebe fahren das Korn selbst ab
    const chain = sv.service === 'haeckseln' ? (this.rng.next() < 0.3 + 0.5 * farm.mechanization ? 'haecksler' : 'komplett')
      : sv.service === 'drusch' ? (this.rng.next() < 0.55 + 0.35 * farm.mechanization ? 'haecksler' : 'komplett') : undefined;
    // Transport: Ladestelle (Miete am Feld bzw. Hoflager), nächstes passendes Ziel, Fracht je t
    const tr = sv.service === 'transport' ? this.transportTerms(farm.id, picked[0]) : null;
    const priceHa = tr
      ? tr.priceHa
      : gabe
      ? Math.round(SERVICE_BASE_PRICE.guelle * (0.9 + this.rng.next() * 0.25) * 10) / 10 * gabe
      : chain
        ? Math.round(((sv.service === 'drusch' ? THRESH_PRICE_HA : CHOP_PRICE_HA)[chain] * (0.92 + this.rng.next() * 0.16)) / 5) * 5
        : Math.round(SERVICE_BASE_PRICE[sv.service] * (0.92 + this.rng.next() * 0.16) * 2) / 2;
    // Kunde kennt das Angebot der Konkurrenz und bietet höchstens etwas darüber (Stammkunden mehr)
    const comp = this.competitorOffer(farmId, sv.service, time, gabe, chain);
    let offerHa = priceHa;
    if (comp) offerHa = Math.min(priceHa, Math.round(comp.priceHa * (this.isLoyal(farmId) ? 1.06 : 1.02) * 2) / 2);
    const req: Request = {
      id: this.nextId++,
      farmId,
      service: sv.service,
      fields: picked,
      areaHa: Math.round(ha * 100) / 100,
      earliest: time,
      latest: time + (chain ? 3 + this.rng.int(5) : tr ? 7 + this.rng.int(7) : 5 + this.rng.int(8)) * 1440,
      priceHa: offerHa,
      competitorPriceHa: comp?.priceHa,
      competitorId: comp?.id,
      gabe,
      chain,
      tPerHa: tr?.tPerHa,
      pickupNode: tr?.pickupNode,
      destNode: tr?.destNode,
      destName: tr?.destName,
      createdAt: time,
      replyBy: time + (this.isLoyal(farmId) ? 2 * REPLY_MINUTES : REPLY_MINUTES),
      status: 'offen',
      channel,
    };
    this.requests.push(req);
    return req;
  }

  /** Transportbedingungen: Ware nach Kultur, Ladestelle, nächstes Ziel, Fracht je t (als €/ha × t/ha) */
  private transportTerms(farmId: number, field: number) {
    const fs = this.farms!, f = this.fields!;
    const farm = fs.farms[farmId];
    const crop = fs.fieldCrop[field];
    const goods = crop === Crop.Zuckerrueben ? 'rueben' : 'korn';
    const tPerHa = goods === 'rueben' ? BEET_YIELD_T_HA : crop === Crop.Raps ? RAPE_YIELD_T_HA : GRAIN_YIELD_T_HA;
    const pickupNode = goods === 'rueben' ? f.access[field] : farm.homeNode;
    const pos = this.nodeLonLat ? this.nodeLonLat(pickupNode) : null;
    let best = DESTINATIONS.find((d) => d.goods.includes(goods))!;
    let km = 30;
    if (pos) {
      km = Infinity;
      for (const d of DESTINATIONS) {
        if (!d.goods.includes(goods)) continue;
        const k = kmBetween(d.lonLat, pos);
        if (k < km) { km = k; best = d; }
      }
    }
    const roadKm = km * 1.3;
    const perT = Math.round((FREIGHT_BASE_EUR_T + FREIGHT_EUR_TKM * roadKm) * (0.92 + this.rng.next() * 0.16) * 100) / 100;
    return {
      tPerHa, pickupNode, destName: best.name, roadKm,
      destNode: this.lonLatNode ? this.lonLatNode(best.lonLat) : farm.homeNode,
      priceHa: Math.round(perT * tPerHa * 100) / 100,
    };
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
      this.emit(time, 'anfrage', `${farm.name}: ${SERVICE_NAMES[req.service]} auf ${req.fields.length} ${req.fields.length === 1 ? 'Feld' : 'Feldern'}, ${fmtHa(req.areaHa)} für ${fmtEur(req.priceHa)}/ha`, farmId);
    } else {
      const rival = this.isRival(farmId, time);
      this.emit(time, 'besuch', `${farm.name}: ${first ? 'Kennengelernt, jetzt im Adressbuch.' : 'Besuch beendet.'} ${rival ? 'Arbeitet zurzeit mit einem anderen Lohnunternehmen.' : 'Zurzeit steht nichts an.'}`, farmId);
    }
  }

  /** Täglich um 06:00: Anfragen per Anruf/Nachricht von bekannten Betrieben, Fristen prüfen */
  /** zuletzt bekannte Spielminute (für zeitabhängige Prüfungen ohne Zeitparameter) */
  lastTime = 0;

  daily(time: number, workedMinutes: Record<number, number> = {}, surcharge: Record<number, number> = {}, busyDrivers: Set<number> = new Set()) {
    this.lastTime = time;
    this.bookDiesel(time);
    // Arbeitszeit des Vortags fürs Jahr sammeln (neues Jahr: neu zählen)
    const wy = gameDate(time - 1).year;
    if (this.workYear !== wy) { this.workYear = wy; for (const k of Object.keys(this.workMinutesYear)) delete this.workMinutesYear[Number(k)]; }
    for (const [d, m] of Object.entries(workedMinutes)) this.workMinutesYear[Number(d)] = (this.workMinutesYear[Number(d)] ?? 0) + m;
    this.payroll(time, workedMinutes, surcharge);
    if (gameDate(time).month === 11 && gameDate(time).day === 1) {
      this.emit(time, 'info', 'Winter: Bodenbearbeitung ruht bis März. Zeit für den Wintercheck – Wartung beim Händler bis Ende Februar 20 % günstiger, senkt das Pannenrisiko in der Saison.');
    }
    this.staffDaily(time, workedMinutes, busyDrivers);
    this.updateApplicants(time);
    this.updateMarket(time);
    this.arriveDeliveries(time);
    this.partsDaily(time);
    this.financeDaily(time);
    this.marketDaily(time);
    this.sitesDaily(time);
    this.farmingDaily(time);
    this.biogasDaily(time);
    // Auftrag steht wegen Panne: Kunde wartet und wird unzufriedener (MZ-07)
    for (const o of this.orders) {
      if (o.status !== 'läuft') continue;
      const down = this.company.machines.some((m) => (m.id === o.tractorId || m.id === o.implementId) && (m.downUntil ?? 0) > time);
      if (down) { this.satisfy(o.farmId, -1, time); this.changeReputation(-0.5); }
    }
    this.checkInvoices(time);
    for (const r of this.requests) {
      if (r.status === 'offen' && time >= r.replyBy) {
        r.status = 'abgelaufen';
        this.emit(time, 'warnung', `${this.farmName(r.farmId)} hat sich anderweitig umgesehen (keine Antwort).${this.lostTo(r)}`, r.farmId);
        this.satisfy(r.farmId, -5, time);
        this.changeReputation(-1);
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
        this.emit(time, 'anfrage', `${farm.contact === 'anruf' ? 'Anruf' : 'Nachricht'} von ${farm.name}: ${SERVICE_NAMES[req.service]} ${fmtHa(req.areaHa)}, bis ${fmtDay(req.latest)}, ${fmtEur(req.priceHa)}/ha`, farm.id);
      }
    }
  }

  /** Antwort auf eine Anfrage (AK-06): annehmen, ablehnen, Gegenangebot */
  respond(requestId: number, action: 'accept' | 'reject' | 'counter', time: number, priceHa?: number): string {
    const r = this.requests.find((x) => x.id === requestId);
    if (!r || r.status !== 'offen') return 'Anfrage nicht mehr offen';
    if (action === 'reject') {
      r.status = 'abgelehnt';
      this.emit(time, 'info', `Anfrage von ${this.farmName(r.farmId)} abgelehnt.${this.lostTo(r)}`, r.farmId);
      this.satisfy(r.farmId, -2, time);
      return 'abgelehnt';
    }
    let price = r.priceHa;
    if (action === 'counter') {
      const p = Math.max(1, priceHa ?? r.priceHa);
      const ratio = p / r.priceHa;
      // Obergrenze: Konkurrenzangebot + Aufschlag für Stammkunden und guten Ruf (MK-02, MK-03, MK-05)
      const acceptable = r.competitorPriceHa !== undefined
        ? r.competitorPriceHa * (1 + (this.isLoyal(r.farmId) ? 0.08 : 0) + this.reputation / 1000)
        : r.priceHa * 1.25;
      // +10 % → 60 % Zusage, +25 % → keine Zusage; günstiger nimmt jeder; über der Obergrenze keiner
      let chance = ratio <= 1 ? 1 : Math.max(0, 1 - (ratio - 1) * 4);
      if (p > r.priceHa) chance = Math.min(chance, Math.max(0, (acceptable - p) / Math.max(0.5, acceptable - r.priceHa)));
      if (this.rng.next() >= chance) {
        r.status = 'abgelehnt';
        this.satisfy(r.farmId, -3, time);
        this.emit(time, 'warnung', `${this.farmName(r.farmId)} lehnt ${fmtEur(p)}/ha ab.${this.lostTo(r)}`, r.farmId);
        return 'Kunde lehnt ab';
      }
      if (ratio > 1) this.satisfy(r.farmId, -1, time);
      price = p;
    }
    r.status = 'angenommen';
    this.won++;
    const o: Order = {
      id: this.nextId++,
      requestId: r.id,
      farmId: r.farmId,
      service: r.service,
      fields: r.fields.slice(),
      doneFields: [],
      areaHa: r.areaHa,
      priceHa: price,
      gabe: r.gabe,
      doneM3: r.gabe ? 0 : undefined,
      chain: r.chain,
      doneT: isHarvest(r.service) || r.service === 'transport' ? 0 : undefined,
      tPerHa: r.tPerHa,
      pickupNode: r.pickupNode,
      destNode: r.destNode,
      destName: r.destName,
      earliest: r.earliest,
      latest: r.latest,
      status: 'offen',
      dieselL: 0,
      dieselCost: 0,
      tractorHours: 0,
    };
    this.orders.push(o);
    this.emit(time, 'auftrag', `Auftrag ${this.farmName(r.farmId)}: ${SERVICE_NAMES[o.service]} ${fmtHa(o.areaHa)} zu ${fmtEur(price)}/ha, fertig bis ${fmtDay(o.latest)}`, r.farmId);
    return 'Auftrag angelegt';
  }

  /** Gerät kaufen (Startangebote); bezahlt aus dem Konto */
  /** Verfügbare Mittel: Konto plus Kontokorrentrahmen */
  canPay(amount: number): boolean {
    return this.company.cash + (this.company.overdraftLimit ?? 0) >= amount;
  }

  buy(offerId: number, time: number): string {
    const idx = this.offers.findIndex((o) => o.id === offerId);
    if (idx < 0) return 'Angebot nicht mehr verfügbar';
    const o = this.offers[idx];
    if (!this.canPay(o.price)) return 'Nicht genug Geld (auch nicht mit Kontokorrent) – Kredit aufnehmen?';
    this.company.cash -= o.price;
    const id = this.nextMachineId();
    const m: Machine = {
      id, ...structuredClone(o.machine), boughtAt: time, dealerId: o.dealerId || undefined,
      purchasePrice: o.price, afaYears: afaYears(o.machine.type, gameDate(time).year - o.machine.year),
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

  // ---------- Finanzen (Phase 4, Schritt 1) ----------

  private book(time: number, text: string, amount: number, category: LedgerCategory) {
    const a = Math.round(amount * 100) / 100;
    this.company.cash = Math.round((this.company.cash + a) * 100) / 100;
    this.ledger.push({ time, text, amount: a, category });
  }

  /** Beginn des Kalenderjahres der Spielminute (Spielstart 1. März: erstes Jahr ab Minute 0) */
  yearStart(time: number): number {
    const d = gameDate(time);
    // Tage seit 1. Januar 06:00 rückwärts zählen
    let t = Math.floor(time / 1440) * 1440;
    let g = d;
    while (t > 0 && !(g.month === 1 && g.day === 1)) { t -= 1440; g = gameDate(t); }
    return t;
  }

  /** Eigenkapital und Bilanzsumme (vereinfacht) für die Bonität */
  balance(time: number): { assets: number; debt: number; equity: number; receivables: number; machines: number } {
    let machines = 0;
    for (const m of this.company.machines) if (!m.lease) machines += this.machineValueNow(m, time);
    const receivables = this.invoices.filter((i) => i.status === 'offen' || i.status === 'überfällig').reduce((a, i) => a + i.amount, 0);
    const cash = this.company.cash;
    const debt = this.company.loan + Math.max(0, -cash);
    const assets = Math.max(0, cash) + machines + receivables + (this.company.partsStock ?? 0);
    return { assets, debt, equity: assets - debt, receivables, machines };
  }

  /** Darlehen aufnehmen (WF-01): Annuität, Zins nach Laufzeit und Bonität */
  takeLoan(amount: number, years: number, time: number): string {
    if (!(amount >= 5_000)) return 'Mindestens 5.000 €';
    if (![3, 5, 8, 10].includes(years)) return 'Laufzeit 3, 5, 8 oder 10 Jahre';
    const free = this.company.creditLimit - this.company.loan;
    if (amount > free) return `Kreditrahmen reicht nicht (frei ${fmtEur(free)})`;
    const rate = loanBaseRate(years) + RATING_SURCHARGE[this.company.rating ?? 'A'];
    const months = years * 12;
    const loan: Loan = { id: this.nextId++, principal: amount, rate, months, monthly: annuity(amount, rate, months), remaining: amount, startAt: time };
    (this.company.loans ??= []).push(loan);
    this.company.loan = Math.round((this.company.loan + amount) * 100) / 100;
    this.book(time, `Darlehen ${years} Jahre zu ${(rate * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`, amount, 'Kredit');
    this.version++;
    this.emit(time, 'info', `Darlehen über ${fmtEur(amount)} ausgezahlt: ${years} Jahre, ${(rate * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %, Rate ${fmtEur(loan.monthly)} im Monat.`);
    return `ausgezahlt, Rate ${fmtEur(loan.monthly)}/Monat`;
  }

  /** Sondertilgung (Annahme: ohne Vorfälligkeitsentschädigung) */
  repayLoan(loanId: number, amount: number, time: number): string {
    const l = (this.company.loans ?? []).find((x) => x.id === loanId);
    if (!l) return 'Darlehen unbekannt';
    const a = Math.min(amount, l.remaining);
    if (!(a > 0)) return 'Betrag fehlt';
    if (this.company.cash < a) return 'Nicht genug Geld auf dem Konto';
    this.book(time, 'Sondertilgung Darlehen', -a, 'Tilgung');
    l.remaining = Math.round((l.remaining - a) * 100) / 100;
    this.company.loan = Math.round((this.company.loan - a) * 100) / 100;
    if (l.remaining <= 0.01) this.company.loans = (this.company.loans ?? []).filter((x) => x !== l);
    else {
      // Rate bleibt, Laufzeit verkürzt sich: verbleibende Monate neu berechnen
      let n = 0, rest = l.remaining;
      while (rest > 0.01 && n < 600) { rest = rest * (1 + l.rate / 12) - l.monthly; n++; }
      l.months = n;
    }
    this.version++;
    return `getilgt: ${fmtEur(a)}`;
  }

  /** Leasingende: übernehmen (Restwert zahlen) oder zurückgeben */
  setLeaseBuyout(machineId: number, buyout: boolean): string {
    const m = this.company.machines.find((x) => x.id === machineId);
    if (!m?.lease) return 'Keine geleaste Maschine';
    m.lease.buyout = buyout;
    this.version++;
    return buyout ? `wird am ${fmtDay(m.lease.endsAt)} für ${fmtEur(m.lease.residual)} übernommen` : 'wird am Ende zurückgegeben';
  }

  /** Leasingende abwickeln (Engine ruft das täglich mit den belegten Maschinen auf) */
  endLeases(time: number, inUse: Set<number>): void {
    for (const m of [...this.company.machines]) {
      const l = m.lease;
      if (!l || time < l.endsAt || inUse.has(m.id)) continue;
      if (l.buyout) {
        this.book(time, `Übernahme Leasing ${m.brand} ${m.model}`, -l.residual, 'Maschinenkauf');
        m.purchasePrice = l.residual;
        m.boughtAt = time;
        m.afaYears = 4;
        m.lease = undefined;
        this.emit(time, 'info', `${m.brand} ${m.model} aus dem Leasing übernommen (${fmtEur(l.residual)}).`);
      } else {
        this.company.machines.splice(this.company.machines.indexOf(m), 1);
        this.emit(time, 'info', `${m.brand} ${m.model} an die Leasinggesellschaft zurückgegeben.`);
      }
      this.version++;
    }
  }

  /**
   * Täglich: Dieselpreis, Dispozinsen, am Monatsersten Raten, Leasing, Versicherung, Bonität;
   * am 1. Januar Jahresabschluss, Steuer fällig am 31. Mai des Folgejahres.
   */
  private financeDaily(time: number) {
    // Diesel: Zufallspfad mit Rückkehr zum Mittelwert (WF-07), ±0,6 ct am Tag
    this.dieselPrice = Math.round((this.dieselPrice + (DIESEL_MEAN - this.dieselPrice) * 0.01 + (this.rng.next() - 0.5) * 0.012) * 1000) / 1000;
    if (this.company.cash < 0) this.overdraftInterest += (-this.company.cash * OVERDRAFT_RATE) / 365;
    if (this.company.cash < -(this.company.overdraftLimit ?? 0)) {
      this.emit(time, 'warnung', `Konto über dem Kontokorrentrahmen (${fmtEur(this.company.cash)}). Neue Käufe sind gesperrt – Geld eintreiben, Maschinen verkaufen oder Darlehen aufnehmen.`);
    }
    const d = gameDate(time);
    if (d.day === 1) {
      // Darlehen: Zins und Tilgung
      for (const l of [...(this.company.loans ?? [])]) {
        const interest = Math.round(l.remaining * (l.rate / 12) * 100) / 100;
        const principal = Math.min(l.remaining, Math.round((l.monthly - interest) * 100) / 100);
        this.book(time, 'Darlehenszinsen', -interest, 'Zinsen');
        this.book(time, 'Tilgung Darlehen', -principal, 'Tilgung');
        l.remaining = Math.round((l.remaining - principal) * 100) / 100;
        this.company.loan = Math.round((this.company.loan - principal) * 100) / 100;
        if (l.remaining <= 0.01) {
          this.company.loans = (this.company.loans ?? []).filter((x) => x !== l);
          this.emit(time, 'info', `Darlehen über ${fmtEur(l.principal)} vollständig getilgt.`);
        }
      }
      if (this.overdraftInterest > 0) {
        this.book(time, 'Zinsen Kontokorrent', -this.overdraftInterest, 'Zinsen');
        this.overdraftInterest = 0;
      }
      // Leasing
      for (const m of this.company.machines) if (m.lease) this.book(time, `Leasingrate ${m.brand} ${m.model}`, -m.lease.monthly, 'Leasing');
      // Versicherung (WF-05)
      let ins = LIABILITY_PER_YEAR;
      for (const m of this.company.machines) ins += insurancePerYear(m, m.lease ? m.newPrice * 0.7 : this.machineValueNow(m, time));
      this.book(time, 'Versicherungen (Betrieb und Maschinen)', -ins / 12, 'Versicherung');
      // Bonität und Kreditrahmen
      const b = this.balance(time);
      const last = this.years.length ? this.years[this.years.length - 1].profit : 0;
      this.company.rating = rating(b.assets > 0 ? b.equity / b.assets : 0, last);
      this.company.creditLimit = Math.max(this.company.loan, Math.min(1_500_000, Math.floor((Math.max(0, b.equity) * 0.8) / 10_000) * 10_000));
      this.version++;
    }
    if (d.month === 1 && d.day === 1) this.closeYear(time);
    if (this.taxDue && time >= this.taxDue.at) {
      this.book(time, `Steuern ${this.taxDue.year} (Einkommen- und Gewerbesteuer)`, -this.taxDue.amount, 'Steuern');
      this.emit(time, 'info', `Steuern für ${this.taxDue.year} bezahlt: ${fmtEur(this.taxDue.amount)}.`);
      this.taxDue = null;
    }
  }

  /** Ergebnis eines Zeitraums aus den Buchungen + AfA (WF-08) */
  yearFigures(from: number, to: number): { revenue: number; expenses: number; afa: number } {
    let revenue = 0, expenses = 0;
    for (const l of this.ledger) {
      if (l.time < from || l.time >= to) continue;
      if (l.category === 'Rechnung' || l.category === 'Ernte' || l.category === 'Strom') revenue += l.amount;
      else if (l.category === 'Diesel' || l.category === 'Personal' || l.category === 'Werkstatt' || l.category === 'Zinsen' || l.category === 'Leasing' || l.category === 'Versicherung' || l.category === 'Gebäude' || l.category === 'Pacht' || l.category === 'Ackerbau' || l.category === 'Biogas' || l.category === 'Maut' || l.category === 'Sonstiges') expenses -= l.amount;
    }
    let afa = this.yearAfaSold + this.buildingAfa(from, to) + this.biogasAfa(from, to);
    for (const m of this.company.machines) afa += bookValue(m, Math.max(from, m.boughtAt ?? 0)) - bookValue(m, to);
    return { revenue: Math.round(revenue), expenses: Math.round(expenses), afa: Math.round(afa) };
  }

  /** Jahresabschluss am 1. Januar: Gewinn, Steuer (fällig 31. Mai) */
  private closeYear(time: number) {
    const year = gameDate(time).year - 1;
    const from = this.yearStart(time - 1440);
    const f = this.yearFigures(from, time);
    const profit = Math.round(f.revenue - f.expenses - f.afa + this.yearSaleGain);
    const tax = profitTax(profit).total;
    this.years.push({ year, revenue: f.revenue, expenses: f.expenses, afa: f.afa, saleGain: Math.round(this.yearSaleGain), profit, tax });
    this.yearSaleGain = 0;
    this.yearAfaSold = 0;
    if (tax > 0) {
      // Fälligkeit 31. Mai: Tage bis dahin zählen
      let t = time;
      for (let i = 0; i < 160 && !(gameDate(t).month === 5 && gameDate(t).day === 31); i++) t += 1440;
      this.taxDue = { amount: tax, at: t, year };
    }
    this.emit(time, 'info', `Jahresabschluss ${year}: Umsatz ${fmtEur(f.revenue)}, Kosten ${fmtEur(f.expenses)}, AfA ${fmtEur(f.afa)}, Gewinn ${fmtEur(profit)}${tax > 0 ? `, Steuern ${fmtEur(tax)} fällig am 31.05.` : ''}.`);
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
  order(dealerId: number, modelKey: string, time: number, leaseMonths?: number): string {
    const d = DEALERS.find((x) => x.id === dealerId);
    const m = CATALOG.find((x) => x.key === modelKey);
    if (!d || !m) return 'Modell nicht lieferbar';
    if (![...d.tractorBrands, ...d.implementBrands].includes(m.brand)) return `${d.name} führt ${m.brand} nicht`;
    const price = this.newPrice(dealerId, m);
    const committed = this.deliveries.filter((x) => !x.leaseMonths).reduce((a, x) => a + x.price, 0);
    if (!leaseMonths && !this.canPay(committed + price)) return 'Nicht genug Geld für Bestellung und Lieferung – Kredit oder Leasing?';
    if (leaseMonths && ![36, 48, 60].includes(leaseMonths)) return 'Leasing über 36, 48 oder 60 Monate';
    const weeks = m.deliveryWeeks + (this.rng.int(3) - 1);
    const del: Delivery = {
      id: this.nextMachineId(),
      machine: {
        type: m.type, brand: m.brand, model: m.model, year: gameDate(time).year, hours: 0, condition: 100,
        newPrice: m.newPrice, power: m.power, width: m.width, powerNeed: m.powerNeed, haPerHour: m.haPerHour,
        workKmh: m.workKmh, dieselLHa: m.dieselLHa, serviceAtH: serviceInterval(m), seats: m.seats, carKind: m.carKind,
      },
      dealerId,
      at: time + weeks * 7 * 1440,
      price,
      leaseMonths,
    };
    this.deliveries.push(del);
    if (leaseMonths) {
      const l = leaseRate(price, LEASE_BASE_RATE + RATING_SURCHARGE[this.company.rating ?? 'A'], leaseMonths);
      this.emit(time, 'info', `Leasing ${m.brand} ${m.model}: ${fmtEur(l.monthly)} im Monat über ${leaseMonths} Monate, Restwert ${fmtEur(l.residual)}, Lieferung etwa ${fmtDay(del.at)}.`);
      return `geleast, Lieferung etwa ${fmtDay(del.at)}`;
    }
    this.emit(time, 'info', `Bestellt bei ${d.name}: ${m.brand} ${m.model} für ${fmtEur(price)}, Lieferung etwa ${fmtDay(del.at)}.`);
    return `bestellt, Lieferung etwa ${fmtDay(del.at)}`;
  }

  private arriveDeliveries(time: number) {
    for (let i = this.deliveries.length - 1; i >= 0; i--) {
      const d = this.deliveries[i];
      if (d.at > time) continue;
      this.deliveries.splice(i, 1);
      this.dealerSpend[d.dealerId] = (this.dealerSpend[d.dealerId] ?? 0) + d.price;
      const base: Machine = { id: d.id, ...d.machine, boughtAt: time, dealerId: d.dealerId, warrantyUntil: time + 24 * 30 * 1440 };
      if (d.leaseMonths) {
        const l = leaseRate(d.price, LEASE_BASE_RATE + RATING_SURCHARGE[this.company.rating ?? 'A'], d.leaseMonths);
        this.company.machines.push({ ...base, lease: { monthly: l.monthly, endsAt: time + d.leaseMonths * 30 * 1440, residual: l.residual } });
        this.emit(time, 'info', `Geliefert (Leasing): ${d.machine.brand} ${d.machine.model}, ${fmtEur(l.monthly)} im Monat bis ${fmtDay(time + d.leaseMonths * 30 * 1440)}.`);
        continue;
      }
      this.company.cash = Math.round((this.company.cash - d.price) * 100) / 100;
      this.company.machines.push({ ...base, purchasePrice: d.price, afaYears: afaYears(d.machine.type, 0) });
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
        seats: m.seats, carKind: m.carKind,
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
    if (m.lease) return 'Geleaste Maschinen gehören der Leasinggesellschaft – erst am Ende übernehmen';
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
    // Buchgewinn bzw. -verlust und AfA bis zum Verkauf für den Jahresabschluss
    const yearStart = this.yearStart(time);
    const bvStart = bookValue(m, Math.max(yearStart, m.boughtAt ?? 0));
    const bvNow = bookValue(m, time);
    this.yearAfaSold += bvStart - bvNow;
    this.yearSaleGain += price - bvNow;
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

  /** Maut (Lkw) als Fremdkosten des Auftrags und Buchung */
  chargeToll(eur: number, o: Order | undefined, time: number) {
    this.tollToday = Math.round((this.tollToday + eur) * 100) / 100;
    if (o) o.externalCost = Math.round(((o.externalCost ?? 0) + eur) * 100) / 100;
    this.version++;
    void time;
  }

  /** Wartung beim Händler (MZ-05): Maschine einen Arbeitstag weg, Zustand +3, Intervall neu */
  service(m: Machine, time: number, home: [number, number], ownWorkshop = false): string {
    if (ownWorkshop) {
      // eigene Werkstatt am Standort mit Mechaniker: halber Preis, 4 Stunden (Werkstatt-Gebäude)
      const tractorW = SELF_PROPELLED.includes(m.type) || m.type === 'firmenwagen';
      const costW = Math.round(((tractorW ? 400 + 0.004 * m.newPrice : 150 + 0.003 * m.newPrice) * 0.5) / 10) * 10;
      m.downUntil = time + 4 * 60;
      m.downReason = 'Wartung in der eigenen Werkstatt';
      m.serviceAtH = m.hours + serviceInterval(m);
      m.condition = Math.min(100, m.condition + 3);
      const mo = gameDate(time).month;
      if (mo >= 11 || mo <= 2) m.winterCheckAt = time;
      this.payWorkshop(time, costW, `Wartung (eigene Werkstatt) ${m.brand} ${m.model}`, m);
      return `Wartung in der eigenen Werkstatt (${fmtEur(costW)}), fertig in 4 Stunden`;
    }
    const d = this.dealerKm(m.brand, home);
    const tractor = m.type === 'schlepper' || m.type === 'firmenwagen';
    // Wintercheck (MZ-05): November bis Februar 20 % günstiger, senkt das Pannenrisiko bis zum Herbst
    const mo = gameDate(time).month;
    const winter = mo >= 11 || mo <= 2;
    const cost = Math.round(((tractor ? 400 + 0.004 * m.newPrice : 150 + 0.003 * m.newPrice) * (winter ? 0.8 : 1)) / 10) * 10;
    if (winter) m.winterCheckAt = time;
    // Termin: nach Werkstattlast; Stammkunden kommen schneller dran (HM-07)
    let wait = this.workshopBusy(time) ? 2 : 0;
    if ((this.dealerSpend[d.id] ?? 0) >= 50_000) wait = Math.max(0, wait - 1);
    const hours = 6 + (2 * d.km) / 40;
    m.downUntil = time + wait * 1440 + Math.round(hours * 60);
    m.downReason = `Wartung bei ${d.name}`;
    m.serviceAtH = m.hours + serviceInterval(m);
    m.condition = Math.min(100, m.condition + 3);
    this.payWorkshop(time, cost, `Wartung ${m.brand} ${m.model}`, m);
    this.emit(time, 'info', `${m.brand} ${m.model} zur ${winter ? 'Wintercheck-' : ''}Wartung bei ${d.name} (${fmtEur(cost)}), zurück etwa ${fmtDay(m.downUntil)} ${fmtTime(m.downUntil)}.`);
    return `Wartung beauftragt, zurück etwa ${fmtDay(m.downUntil)} ${fmtTime(m.downUntil)}`;
  }

  /**
   * Pannenrisiko je Betriebsminute (MZ-04): Grundrate 0,2 % je Stunde, steigt mit sinkendem
   * Zustand, dreifach bei überfälliger Wartung und bei verstecktem Mangel.
   */
  rollBreakdown(m: Machine): boolean {
    let perHour = 0.002 * (1 + (100 - m.condition) / 25);
    // Wintercheck im letzten Winter: 30 % weniger Pannen in der Saison
    if (m.winterCheckAt !== undefined && this.lastTime - m.winterCheckAt < 300 * 1440) perHour *= 0.7;
    if (m.serviceAtH !== undefined && m.hours > m.serviceAtH) perHour *= 3;
    if (m.defect) perHour *= 3;
    // ohne Verschleißteile im Lager werden abgenutzte Schare und Zinken nicht getauscht
    if ((this.company.partsStock ?? 0) <= 0 && m.type !== 'schlepper' && m.type !== 'firmenwagen') perHour *= 2;
    return this.rng.next() < perHour / 60;
  }

  /**
   * Panne (MZ-04, MZ-06): Maschine steht. Der Spieler entscheidet: Service des Markenhändlers
   * rufen oder eigenen Werkstattwagen mit Mechaniker schicken. Ohne Entscheidung ruft der Fahrer
   * nach einer Stunde den Händler.
   */
  breakdown(m: Machine, time: number, home: [number, number], where: string): void {
    const d = this.dealerKm(m.brand, home);
    const day0 = Math.floor(time / 1440) * 1440;
    const orderedAt = time - day0 < 4 * 60 ? day0 + 8 * 60 : day0 + 1440 + 2 * 60; // vor 10 Uhr: 14 Uhr, sonst morgen 8 Uhr
    // Geräte verschleißen stärker: dort ist es öfter ein Verschleißteil
    const tractor = m.type === 'schlepper' || m.type === 'firmenwagen';
    const kind: Repair['kind'] = this.rng.next() < (tractor ? 0.35 : 0.6) ? 'verschleiss' : 'sonstiges';
    const partValue = Math.round((kind === 'verschleiss' ? 60 + this.rng.int(340) : 150 + 0.002 * m.newPrice * (0.5 + this.rng.next())) / 10) * 10;
    const stock = this.company.partsStock ?? 0;
    let parts: Repair['parts'];
    if (kind === 'verschleiss') parts = stock >= partValue ? (this.rng.next() < 0.65 ? 'wagen' : 'hof') : 'bestellt';
    else { const x = this.rng.next(); parts = x < 0.3 ? 'hof' : x < 0.75 ? 'haendler' : 'bestellt'; }
    const partsReadyAt = parts === 'bestellt' ? orderedAt : time;
    const workHours = Math.round(((kind === 'verschleiss' ? 0.5 + this.rng.next() * 1.5 : 1 + this.rng.next() * 2.5)) * 10) / 10;
    const warranty = (m.warrantyUntil ?? 0) > time;
    // Verschleißteile fallen nicht unter die Gewährleistung
    const cost = warranty && kind === 'sonstiges' ? 0 : Math.round(((kind === 'verschleiss' ? 120 + partValue * 1.3 : 200 + 0.004 * m.newPrice * (0.5 + this.rng.next() * 1.5)) * (1 + (100 - m.condition) / 100)) / 10) * 10;
    m.repair = { state: 'wartet', since: time, kind, parts, partValue, partsReadyAt, dealerId: d.id, dealer: d.name, dealerKm: d.km, workHours, cost };
    m.downUntil = time + 365 * 1440; // bis zur Reparatur
    m.downReason = 'Panne – Reparatur offen';
    m.breakdowns = (m.breakdowns ?? 0) + 1;
    this.emit(time, 'warnung', `Panne: ${m.brand} ${m.model} ${where}. ${partsText(m.repair)}. Händler-Service (${cost ? fmtEur(cost) : 'Gewährleistung'}) oder eigene Werkstatt? Ohne Entscheidung ruft der Fahrer in einer Stunde den Händler.`);
  }

  /** Verschleißteile nachkaufen: Lieferung am nächsten Morgen ins Lager am Hof */
  buyParts(amount: number, time: number): string {
    if (!(amount >= 100)) return 'Mindestens 100 €';
    if (!this.canPay(amount)) return 'Nicht genug Geld';
    const at = (Math.floor(time / 1440) + 1) * 1440 + 2 * 60;
    this.company.cash = Math.round((this.company.cash - amount) * 100) / 100;
    (this.company.partsIncoming ??= []).push({ amount, at });
    this.ledger.push({ time, text: 'Verschleißteile fürs Lager', amount: -amount, category: 'Werkstatt' });
    this.version++;
    return `bestellt, Lieferung ${fmtDay(at)} ${fmtTime(at)}`;
  }

  /** Fremdleistung (z. B. Fremdwalze) buchen und dem Auftrag zurechnen */
  bookExternal(time: number, text: string, amount: number, o?: Order) {
    if (amount <= 0) return;
    this.company.cash = Math.round((this.company.cash - amount) * 100) / 100;
    this.ledger.push({ time, text, amount: -amount, category: 'Sonstiges' });
    if (o) o.externalCost = Math.round(((o.externalCost ?? 0) + amount) * 100) / 100;
    this.emit(time, 'info', `${text}: ${fmtEur(amount)}.`);
  }

  /** Verbrauch von Verschleißteilen bei der Arbeit (z. B. Grubberschare je ha); false = Lager leer */
  useWearParts(amount: number): boolean {
    const st = this.company.partsStock ?? 0;
    this.company.partsStock = Math.max(0, Math.round((st - amount) * 100) / 100);
    return st >= amount;
  }

  private lowStockWarned = false;

  private partsDaily(time: number) {
    const inc = this.company.partsIncoming ?? [];
    for (let i = inc.length - 1; i >= 0; i--) {
      if (inc[i].at > time + 4 * 60) continue; // kommt im Laufe des Vormittags
      this.company.partsStock = Math.round(((this.company.partsStock ?? 0) + inc[i].amount) * 100) / 100;
      inc.splice(i, 1);
      this.lowStockWarned = false;
    }
    if ((this.company.partsStock ?? 0) < 200 && !this.lowStockWarned) {
      this.lowStockWarned = true;
      this.emit(time, 'warnung', `Verschleißteillager fast leer (${fmtEur(this.company.partsStock ?? 0)}). Geräte verschleißen schneller und fallen öfter aus – im Reiter Fuhrpark nachkaufen.`);
    }
  }

  /** Händler-Service: Anfahrt, ggf. Warten aufs bestellte Teil, Reparatur */
  callDealer(m: Machine, time: number): string {
    const r = m.repair;
    if (!r || r.state !== 'wartet') return 'Keine offene Panne';
    const travel = (2 * r.dealerKm) / 50;
    let hours = travel + r.workHours;
    if (this.workshopBusy(time)) hours *= 1.5; // Ernte: Werkstatt ausgelastet (HM-08)
    const start = Math.max(time, r.partsReadyAt);
    m.downUntil = start + Math.round(hours * 60);
    m.downReason = `Panne – ${r.dealer} repariert`;
    r.state = 'haendler';
    if (r.cost) this.payWorkshop(time, r.cost, `Reparatur ${m.brand} ${m.model}`, m);
    m.defect = undefined;
    this.version++;
    this.emit(time, 'info', `${r.dealer} übernimmt die Reparatur von ${m.brand} ${m.model}, fertig etwa ${fmtDay(m.downUntil)} ${fmtTime(m.downUntil)}.`);
    return `Händler kommt, fertig etwa ${fmtDay(m.downUntil)} ${fmtTime(m.downUntil)}`;
  }

  /** Reparaturdauer in eigener Regie (min): Stufe 2 = 120 %, 5 = 90 % der Profizeit */
  ownRepairMinutes(m: Machine, skill: number): number {
    return Math.round((m.repair?.workHours ?? 2) * (1.4 - 0.1 * skill) * 60);
  }

  /** Eigene Werkstatt beginnt (Engine schickt den Werkstattwagen): Teile kosten etwa 45 % */
  startOwnRepair(m: Machine, time: number): void {
    const r = m.repair!;
    r.state = 'eigen';
    m.downReason = 'Panne – eigene Werkstatt ist unterwegs';
    if (r.parts === 'wagen' || r.parts === 'hof') {
      // Teil aus dem eigenen Lager (schon bezahlt)
      this.company.partsStock = Math.max(0, Math.round(((this.company.partsStock ?? 0) - r.partValue) * 100) / 100);
      m.costTotal = Math.round(((m.costTotal ?? 0) + r.partValue) * 100) / 100;
    } else {
      const parts = Math.round((r.cost * 0.45) / 10) * 10;
      if (parts) this.payWorkshop(time, parts, `Ersatzteile ${m.brand} ${m.model}`, m);
    }
    this.version++;
  }

  finishOwnRepair(m: Machine, time: number, mechanic: string): void {
    m.downUntil = time;
    m.downReason = undefined;
    m.repair = undefined;
    m.defect = undefined;
    this.version++;
    this.emit(time, 'info', `${mechanic} hat ${m.brand} ${m.model} repariert.`);
  }

  /** Verschleiß je Betriebsstunde (MZ-03): Schlepper 0,6 %/100 h, Geräte 2 %/100 h, doppelt bei überfälliger Wartung */
  wear(m: Machine, hours: number): void {
    let rate = m.type === 'schlepper' || m.type === 'firmenwagen' ? 0.006 : 0.02;
    if (m.serviceAtH !== undefined && m.hours > m.serviceAtH) rate *= 2;
    // Maschinenhalle am Standort (25 % weniger), Waschplatz (10 % weniger)
    if (this.hasBuilding('halle', m.siteId ?? 1)) rate *= 0.75;
    if (this.hasBuilding('tank')) rate *= 0.9;
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
      if (o.gaerrest) {
        const m3 = Math.round(o.areaHa * (o.gabe ?? GAER_GABE));
        this.book(time, `Gärrest auf eigener Fläche: ${m3.toLocaleString('de-DE')} m³ (Mineraldünger gespart)`, m3 * GAER_VALUE_EUR, 'Ackerbau');
        return;
      }
      if (o.ownLeaseId !== undefined) { this.ownStepDone(o, time); return; }
      if (o.biogasPriceT !== undefined) {
        // Erntemenge aus Fläche × Ertrag (Wagen können noch unterwegs zum Silo sein)
        const harvested = Math.round(o.areaHa * SILAGE_YIELD_T_HA);
        const t = Math.min(harvested, this.siloRoom());
        if (this.biogas) this.biogas.stock.mais += t;
        this.book(time, `Mais auf dem Halm von ${this.farmName(o.farmId)}: ${harvested.toLocaleString('de-DE')} t à ${fmtEur(o.biogasPriceT)}`, -Math.round(harvested * o.biogasPriceT), 'Biogas');
        this.satisfy(o.farmId, 2, time);
        return;
      }
      this.satisfy(o.farmId, onTime ? 5 : -10, time);
      this.changeReputation(onTime ? 1.5 : -3);
      const farm = this.farms?.farms[o.farmId];
      if (farm) {
        const wasLoyal = this.isLoyal(farm.id);
        farm.orderCount = (farm.orderCount ?? 0) + 1;
        if (!wasLoyal && this.isLoyal(farm.id)) this.emit(time, 'info', `${farm.name} ist jetzt Stammkunde: fragt öfter an, gibt mehr Zeit für die Antwort und zahlt für gute Arbeit etwas mehr.`, farm.id);
      }
      this.issueInvoice(o, time);
    }
  }

  /** Diesel tanken/abrechnen: Kosten sofort vom Konto, beim Auftrag mitgeschrieben */
  chargeDiesel(liters: number, order: Order | undefined, _time: number) {
    if (liters <= 0) return;
    // eigener Dieseltank: 6 ct/l günstiger (Großabnahme)
    const cost = liters * (this.dieselPrice - (this.hasBuilding('tank') ? 0.06 : 0));
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
    if (this.tollToday > 0) {
      this.ledger.push({ time, text: 'Lkw-Maut', amount: -Math.round(this.tollToday * 100) / 100, category: 'Maut' });
      this.tollToday = 0;
    }
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
      text: o.chain
        ? `${SERVICE_NAMES[o.service]} (${chainName(o.service, o.chain)}) ${fmtHa(o.areaHa)} à ${fmtEur(o.priceHa)}/ha, ${Math.round(o.doneT ?? 0)} t`
        : o.tPerHa
        ? `${SERVICE_NAMES[o.service]} nach ${o.destName ?? 'Ziel'}: ${Math.round(o.areaHa * o.tPerHa).toLocaleString('de-DE')} t à ${fmtEur(o.priceHa / o.tPerHa)}/t`
        : o.gabe
        ? `${SERVICE_NAMES[o.service]} ${fmtM3(o.areaHa * o.gabe)} à ${fmtEur(o.priceHa / o.gabe)}/m³ (${fmtHa(o.areaHa)})`
        : `${SERVICE_NAMES[o.service]} ${fmtHa(o.areaHa)} à ${fmtEur(o.priceHa)}/ha`,
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
    const machines = Math.round((o.tractorHours * perH + o.areaHa * WEAR_GRUBBER_EUR_HA + (o.externalCost ?? 0)) * 100) / 100;
    return { revenue, diesel: o.dieselCost, machines, margin: Math.round((revenue - o.dieselCost - machines) * 100) / 100 };
  }

  /**
   * Auswertung (Vorschlag 13): letzte 12 Monate nach Sparten, Maschinen und Fahrer im laufenden
   * Jahr, Kunden über alle Aufträge. Umsatz Lohnarbeit/Transport nach Rechnungsdatum, Ackerbau
   * (Ernte) und Biogas (Strom) nach Buchung. Direkte Kosten: Ackerbau und Pacht, Biogas, Maut;
   * alles andere (Diesel, Personal, Werkstatt, Zinsen …) als allgemeine Kosten. Ohne AfA.
   * Einmal je Spieltag berechnet.
   */
  analytics(time: number): Analytics {
    const day = Math.floor(time / 1440);
    if (this.analyticsCache && this.analyticsCache.day === day && this.analyticsCache.v === this.ledger.length + this.invoices.length) return this.analyticsCache.data;
    const now = gameDate(time);
    const months: Analytics['months'] = [];
    const idx = new Map<number, number>();
    for (let k = 11; k >= 0; k--) {
      let m = now.month - k, y = now.year;
      while (m < 1) { m += 12; y--; }
      idx.set(y * 100 + m, months.length);
      const zero = (): Record<Branch, number> => ({ lohn: 0, transport: 0, ackerbau: 0, biogas: 0 });
      months.push({ year: y, month: m, revenue: zero(), direct: zero(), overhead: 0, profit: 0 });
    }
    const at = (t: number) => { const d = gameDate(t); return idx.get(d.year * 100 + d.month); };
    const orderOf = new Map(this.orders.map((o) => [o.id, o]));
    for (const inv of this.invoices) {
      const i = at(inv.issuedAt);
      if (i === undefined) continue;
      const o = orderOf.get(inv.orderId);
      months[i].revenue[o?.service === 'transport' ? 'transport' : 'lohn'] += inv.amount;
    }
    const overheadCats: LedgerCategory[] = ['Diesel', 'Personal', 'Werkstatt', 'Zinsen', 'Leasing', 'Versicherung', 'Gebäude', 'Sonstiges'];
    for (const l of this.ledger) {
      const i = at(l.time);
      if (i === undefined) continue;
      const m = months[i];
      if (l.category === 'Ernte') m.revenue.ackerbau += l.amount;
      else if (l.category === 'Strom') m.revenue.biogas += l.amount;
      else if (l.category === 'Ackerbau' || l.category === 'Pacht') m.direct.ackerbau -= l.amount;
      else if (l.category === 'Biogas') m.direct.biogas -= l.amount;
      else if (l.category === 'Maut') m.direct.transport -= l.amount;
      else if (overheadCats.includes(l.category)) m.overhead -= l.amount;
    }
    for (const m of months) {
      const r = m.revenue, c = m.direct;
      m.profit = Math.round(r.lohn + r.transport + r.ackerbau + r.biogas - c.lohn - c.transport - c.ackerbau - c.biogas - m.overhead);
      for (const k of Object.keys(r) as Branch[]) { r[k] = Math.round(r[k]); c[k] = Math.round(c[k]); }
      m.overhead = Math.round(m.overhead);
    }
    // Maschinen im laufenden Jahr: Einsatzstunden aus den Aufträgen
    const ys = this.yearStart(time);
    const mach = new Map<number, { id: number; hours: number; orders: number; revenue: number }>();
    for (const o of this.orders) {
      if ((o.startedAt ?? -1) < ys) continue;
      for (const id of new Set([o.tractorId, o.implementId])) {
        if (id === undefined) continue;
        const e = mach.get(id) ?? { id, hours: 0, orders: 0, revenue: 0 };
        e.hours += o.tractorHours;
        e.orders++;
        if (o.status === 'fertig') e.revenue += o.priceHa * o.areaHa;
        mach.set(id, e);
      }
    }
    const machines = this.company.machines.map((m) => mach.get(m.id) ?? { id: m.id, hours: 0, orders: 0, revenue: 0 })
      .map((e) => ({ ...e, hours: Math.round(e.hours * 10) / 10, revenue: Math.round(e.revenue) }));
    const drivers = this.company.drivers.map((d) => ({ id: d.id, minutes: this.workMinutesYear[d.id] ?? 0 }));
    // Kunden: alle fertigen Aufträge (Deckungsbeitrag nach Diesel und Maschinenkosten), offene Rechnungen
    const cust = new Map<number, Analytics['customers'][number]>();
    for (const o of this.orders) {
      if (o.status !== 'fertig' || o.farmId < 0 || o.ownLeaseId !== undefined || o.biogasPriceT !== undefined) continue;
      const r = this.orderResult(o);
      const e = cust.get(o.farmId) ?? { farmId: o.farmId, orders: 0, revenue: 0, margin: 0, open: 0 };
      e.orders++; e.revenue += r.revenue; e.margin += r.margin;
      cust.set(o.farmId, e);
    }
    for (const inv of this.invoices) {
      if (inv.status !== 'offen' && inv.status !== 'überfällig') continue;
      const e = cust.get(inv.farmId);
      if (e) e.open += inv.amount;
    }
    const customers = [...cust.values()].map((e) => ({ ...e, revenue: Math.round(e.revenue), margin: Math.round(e.margin), open: Math.round(e.open) }))
      .sort((a, b) => b.margin - a.margin);
    const yearShare = Math.max(1 / 365, Math.min(1, (time - ys) / (365 * 1440)));
    const data = { months, machines, drivers, customers, yearShare };
    this.analyticsCache = { day, v: this.ledger.length + this.invoices.length, data };
    return data;
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
    // Berufsbild ziehen (Gewicht), dann Stufen je Tätigkeit nach Erfahrung (Alter)
    const total = ROLES.reduce((x, y) => x + y.weight, 0);
    let pick = r.next() * total;
    let role = ROLES[0];
    for (const ro of ROLES) { pick -= ro.weight; if (pick < 0) { role = ro; break; } }
    const skills = baseSkills(0);
    const exp = Math.min(1, (age - 18) / 25);
    for (const [k, span] of Object.entries(role.skills) as [Skill, [number, number]][]) {
      const lvl = span[0] + Math.round((span[1] - span[0]) * Math.min(1, exp * 0.7 + r.next() * 0.5));
      skills[k] = Math.max(span[0], Math.min(span[1], lvl));
    }
    // Erntemaschinenfahrer: mindestens eine Erntemaschine ab Stufe 2
    if (role.key === 'ernte' && Math.max(skills.haecksler, skills.drescher, skills.roder) < 2) skills[(['haecksler', 'drescher', 'roder'] as Skill[])[r.int(3)]] = 2;
    const licenseC = r.next() < (role.licenseC ?? 0.3);
    // Gehaltsvorstellung: Marktlohn für diese Skills ± 0,50 € (Ecklohn-Annahme in marketWage)
    const wantFest = Math.round((marketWage({ skills, licenseC }) + (r.next() - 0.5)) * 10) / 10;
    const reliability = Math.round((0.5 + r.next() * 0.5) * 100) / 100;
    const resilience = Math.round((0.5 + r.next() * 0.5) * 100) / 100;
    const wage = Math.max(MIN_WAGE, wantFest);
    const first = FIRST_NAMES[r.int(FIRST_NAMES.length)];
    const last = SURNAMES[r.int(SURNAMES.length)];
    const notes = [`${role.name}, sucht feste Stelle`, `${role.name}, auch als Saisonkraft`, `${role.name}, kommt aus der Region`, `${role.name}, bisher bei einem anderen Lohnunternehmen`];
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
    if (!this.canPay(fee)) return `Provision ${fmtEur(fee)} – nicht genug Geld`;
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
      if (this.hasBuilding('buero')) target += 5; // Büro und Sozialräume
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
export function fmtM3(v: number): string {
  return v.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' m³';
}
export function fmtHa(v: number): string {
  return v.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' ha';
}
/** Ersatzteillage als Text (Meldung, Oberfläche) */
export function partsText(r: Repair): string {
  const was = r.kind === 'verschleiss' ? 'Verschleißteil' : 'Ersatzteil';
  switch (r.parts) {
    case 'wagen': return `${was} hat der Werkstattwagen an Bord`;
    case 'hof': return `${was} liegt im Lager am Hof`;
    case 'haendler': return `${was} liegt bei ${r.dealer} – muss geholt werden`;
    default: return `${was} wird bestellt${r.kind === 'verschleiss' ? ' (eigenes Lager leer)' : ''}, ab ${fmtDay(r.partsReadyAt)} ${fmtTime(r.partsReadyAt)} bei ${r.dealer}`;
  }
}

export function fmtTime(minutes: number): string {
  const d = gameDate(minutes);
  return `${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}`;
}
export function fmtDay(minutes: number): string {
  const d = gameDate(minutes);
  return `${String(d.day).padStart(2, '0')}.${String(d.month).padStart(2, '0')}.`;
}
