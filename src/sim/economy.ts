/**
 * Betrieb des Spielers: Konto, Kredit, Fuhrpark, Standort (Startbedingungen laut Anforderungs-Doc).
 */

/** Spielbeginn: Baujahr-Bezug für Maschinenalter */
export const START_YEAR = 2027;

/**
 * Startformel Marktwert (MZ-02): W = N · 0,9 · 0,94^A · (1 − 0,025 · h/1000),
 * Untergrenze 15 % des Neupreises. N Neupreis, A Alter in Jahren, h Betriebsstunden.
 * Nur +, −, × (Potenz als Schleife), damit plattformgleich.
 */
export function marketValue(newPrice: number, ageYears: number, hours: number): number {
  let f = 0.9;
  for (let i = 0; i < ageYears; i++) f *= 0.94;
  const w = newPrice * f * (1 - 0.025 * (hours / 1000));
  return Math.max(newPrice * 0.15, w);
}

export type MachineType = 'schlepper' | 'firmenwagen' | 'grubber' | 'kurzscheibenegge';

export interface Machine {
  id: number;
  type: MachineType;
  brand: string;
  model: string;
  year: number;
  hours: number;
  /** Zustand 0–100 % (MZ-01) */
  condition: number;
  newPrice: number;
  /** PS (Schlepper) bzw. Arbeitsbreite in m (Geräte) */
  power?: number;
  width?: number;
  /** Geräte: nötige Schlepperleistung (PS) */
  powerNeed?: number;
  /** Geräte: Flächenleistung (ha/h, LWK-Erfahrungssätze) */
  haPerHour?: number;
  /** Geräte: Arbeitstempo auf der Bahn (km/h) */
  workKmh?: number;
  /** Geräte: Dieselverbrauch des Gespanns bei der Arbeit (l/ha) */
  dieselLHa?: number;
  /** nächste Wartung fällig bei diesen Betriebsstunden (MZ-05) */
  serviceAtH?: number;
  /** in der Werkstatt bzw. ausgefallen bis Spielminute (MZ-06) */
  downUntil?: number;
  downReason?: string;
  /** Gewährleistung bis Spielminute (Händlerkauf) */
  warrantyUntil?: number;
  /** versteckter Mangel (MZ-11): höhere Pannengefahr, Zustand schlechter als angegeben */
  defect?: boolean;
  /** Kosten für Wartung und Reparaturen gesamt (€) und Zahl der Pannen */
  costTotal?: number;
  breakdowns?: number;
  /** Ausfallzeit gesamt (min) */
  downMinutes?: number;
  /** privat zum Verkauf inseriert: verkauft am, zum Preis */
  saleAt?: number;
  salePrice?: number;
  /** gekauft am (Spielminute) und bei Händler */
  boughtAt?: number;
  dealerId?: number;
}

/** Wartungsintervall (Betriebsstunden): Schlepper 500 h, Geräte 250 h (Annahme) */
export function serviceInterval(m: Pick<Machine, 'type'>): number {
  return m.type === 'schlepper' || m.type === 'firmenwagen' ? 500 : 250;
}

export interface MarketOffer {
  id: number;
  machine: Omit<Machine, 'id'>;
  /** Kaufpreis netto (€) */
  price: number;
  seller: string;
  note: string;
  /** Händler (0 = Gebrauchtbörse, privat) */
  dealerId?: number;
  /** Gewährleistung in Monaten (privat 0) */
  warrantyMonths?: number;
  /** Angebot gilt bis (Spielminute); ohne = unbefristet */
  until?: number;
  /** Werkstattcheck gemacht (MZ-11); Ergebnis: Mangel ja/nein */
  checked?: boolean;
}

/**
 * Gebrauchtangebote zum Spielstart (Annahmen, angelehnt an Inserate auf landwirt.com:
 * Horsch Terrano 4 FX gebraucht 11.500–14.500 € netto, neu 23.500 € netto).
 * Flächenleistung nach LWK-Erfahrungssätzen (Stoppelgrubber 3–4 m 1,49–1,89 ha/h,
 * Kurzscheibenegge 3 m 2,0 ha/h). Diesel bei der Arbeit (Annahme, KTBL-Größenordnung):
 * Grubber 9 l/ha, Kurzscheibenegge 6 l/ha. Ab Phase 3 ersetzt der Händlermarkt diese Liste.
 */
export const START_OFFERS: MarketOffer[] = [
  {
    id: 1,
    machine: { type: 'grubber', brand: 'Horsch', model: 'Terrano 4 FX', year: 2017, hours: 0, condition: 70, newPrice: 23_500, width: 4, powerNeed: 160, haPerHour: 1.7, workKmh: 10, dieselLHa: 9 },
    price: 12_500,
    seller: 'Landmaschinen Suhlendorf (Händler)',
    note: 'Grubber 4 m, Gewährleistung 6 Monate',
    dealerId: 4,
    warrantyMonths: 6,
  },
  {
    id: 2,
    machine: { type: 'grubber', brand: 'Köckerling', model: 'Trio 300', year: 2012, hours: 0, condition: 55, newPrice: 19_000, width: 3, powerNeed: 120, haPerHour: 1.5, workKmh: 10, dieselLHa: 9 },
    price: 7_900,
    seller: 'Privat, Bad Bevensen',
    note: 'Grubber 3 m, ohne Gewährleistung',
    dealerId: 0,
    warrantyMonths: 0,
  },
  {
    id: 3,
    machine: { type: 'kurzscheibenegge', brand: 'Horsch', model: 'Joker 3 CT', year: 2016, hours: 0, condition: 65, newPrice: 21_000, width: 3, powerNeed: 110, haPerHour: 2.0, workKmh: 12, dieselLHa: 6 },
    price: 11_900,
    seller: 'Landmaschinen Suhlendorf (Händler)',
    note: 'Kurzscheibenegge 3 m – für Grubber-Aufträge nicht geeignet',
    dealerId: 4,
    warrantyMonths: 6,
  },
  {
    // Wert nach Startformel: 185.000 € · 0,9 · 0,94^11 · (1 − 0,025 · 6,5) ≈ 70.600 €
    id: 4,
    machine: { type: 'schlepper', brand: 'Fendt', model: '516 Vario', year: 2016, hours: 6500, condition: 72, newPrice: 185_000, power: 165 },
    price: 69_500,
    seller: 'Landtechnik Uelzen (Händler)',
    note: 'Schlepper 165 PS, Gewährleistung 6 Monate',
    dealerId: 1,
    warrantyMonths: 6,
  },
  {
    // Wert nach Startformel: 140.000 € · 0,9 · 0,94^12 · (1 − 0,025 · 8) ≈ 48.000 €
    id: 5,
    machine: { type: 'schlepper', brand: 'John Deere', model: '6130R', year: 2015, hours: 8000, condition: 64, newPrice: 140_000, power: 130 },
    price: 44_000,
    seller: 'Privat, Suderburg',
    note: 'Schlepper 130 PS, ohne Gewährleistung – reicht für den 3-m-Grubber',
    dealerId: 0,
    warrantyMonths: 0,
  },
];

/** Tätigkeiten mit eigenem Skill (PA-02) */
export type Skill = 'boden' | 'saat' | 'guelle' | 'haecksler' | 'drescher' | 'roder' | 'kartoffel' | 'transport' | 'werkstatt';
export const SKILLS: { key: Skill; name: string }[] = [
  { key: 'boden', name: 'Schlepper/Bodenbearbeitung' },
  { key: 'saat', name: 'Saat' },
  { key: 'guelle', name: 'Gülle' },
  { key: 'haecksler', name: 'Häcksler' },
  { key: 'drescher', name: 'Mähdrescher' },
  { key: 'roder', name: 'Rübenroder' },
  { key: 'kartoffel', name: 'Kartoffeltechnik' },
  { key: 'transport', name: 'Transport' },
  { key: 'werkstatt', name: 'Werkstatt' },
];

/** Gesetzlicher Mindestlohn 2027 (PA-03), €/h brutto */
export const MIN_WAGE = 14.6;
/** Arbeitgeberanteil Sozialversicherung (PA-15, Annahme ca. 21 %) */
export const EMPLOYER_SV = 0.21;
/** Monatsstunden bei 40-h-Woche (40 × 52 ÷ 12) */
export const MONTH_HOURS = 173;
/** Erfahrung für die nächste Stufe: Stufe n → n+1 braucht n × 100 Arbeitsstunden (PA-08) */
export const XP_MINUTES_PER_LEVEL = 100 * 60;

/** Mitarbeiter (PA-01, PA-02, PA-13). Der Chef ist Mitarbeiter Nr. 1 ohne Lohn (KK-13, KK-15). */
export interface Employee {
  id: number;
  name: string;
  isPlayer: boolean;
  /** fest = Monatsgehalt, saison = Stundenlohn nur für geleistete Stunden */
  kind: 'chef' | 'fest' | 'saison';
  /** Stundenlohn brutto (€/h); Monatsgehalt = Lohn × 173 h */
  wage: number;
  /** Skillstufe 1–5 je Tätigkeit (PA-07) */
  skills: Record<Skill, number>;
  /** gesammelte Arbeitsminuten je Tätigkeit seit der letzten Stufe */
  xp: Partial<Record<Skill, number>>;
  /** Führerschein LKW (C/CE) – für spätere Lkw (PA-10) */
  licenseC: boolean;
  hiredAt: number;
  /** Alter in Jahren (Anzeige) */
  age: number;
}

export function baseSkills(level = 1): Record<Skill, number> {
  const s = {} as Record<Skill, number>;
  for (const k of SKILLS) s[k.key] = level;
  return s;
}

/** Arbeitstempo nach Skillstufe (PA-07): Stufe 1 = 90 %, 3 = 100 %, 5 = 110 % */
export function skillSpeed(level: number): number {
  return 0.85 + 0.05 * level;
}
/** Dieselverbrauch nach Skillstufe: Stufe 1 = +6 %, 3 = ±0, 5 = −6 % */
export function skillDiesel(level: number): number {
  return 1.09 - 0.03 * level;
}

/** Arbeitgeberkosten je Arbeitsstunde inkl. Sozialversicherung */
export function employerHourCost(e: Employee): number {
  return Math.round(e.wage * (1 + EMPLOYER_SV) * 100) / 100;
}
/** Monatliche Arbeitgeberkosten eines festen Mitarbeiters */
export function employerMonthCost(e: Employee): number {
  return Math.round(e.wage * MONTH_HOURS * (1 + EMPLOYER_SV) * 100) / 100;
}

export interface Company {
  name: string;
  cash: number;
  creditLimit: number;
  loan: number;
  /** Standort: Graph-Knoten in Groß Thondorf */
  homeNode: number;
  site: string;
  machines: Machine[];
  /** Mitarbeiter; zu Beginn nur der Chef selbst (Nr. 1) */
  drivers: Employee[];
}

export function machineValue(m: Machine, year = START_YEAR): number {
  return Math.round(marketValue(m.newPrice, year - m.year, m.hours));
}

/**
 * Startbetrieb: gebrauchter 200-PS-Schlepper (Bj. 2014, ~9.000 h, Wert ~70.000 €; Neupreis-Anker
 * Fendt 720 Vario 225.000 €), 100.000 € Konto, 150.000 € Kreditrahmen, gebrauchter Firmenwagen
 * (Annahme: Bj. 2018, 140.000 km ≈ 2.800 h, Neupreis 38.000 €), unbefestigter Abstellplatz.
 */
export function startCompany(homeNode: number): Company {
  return {
    name: 'Lohnbetrieb Groß Thondorf',
    cash: 100_000,
    creditLimit: 150_000,
    loan: 0,
    homeNode,
    site: 'Unbefestigter Abstellplatz, Büro im Wohnhaus',
    machines: [
      { id: 1, type: 'schlepper', brand: 'Fendt', model: '720 Vario', year: 2014, hours: 9000, condition: 68, newPrice: 225_000, power: 200, serviceAtH: 9200 },
      { id: 2, type: 'firmenwagen', brand: '', model: 'Firmenwagen (Kombi)', year: 2018, hours: 2800, condition: 75, newPrice: 38_000, serviceAtH: 3000 },
    ],
    drivers: [chefEmployee()],
  };
}

export function chefEmployee(): Employee {
  return {
    id: 1, name: 'Chef (du)', isPlayer: true, kind: 'chef', wage: 0,
    skills: { ...baseSkills(1), boden: 3, saat: 2, guelle: 2, transport: 2 },
    xp: {}, licenseC: false, hiredAt: 0, age: 34,
  };
}

/** Mitarbeiterliste aus älteren Spielständen auf den aktuellen Aufbau bringen */
export function normalizeDrivers(c: Company): void {
  c.drivers = (c.drivers ?? []).map((d) => (d.isPlayer && !(d as Partial<Employee>).skills ? chefEmployee() : d));
  if (!c.drivers.length) c.drivers.push(chefEmployee());
}

/** Spielkalender ohne Date-Objekt (deterministisch): Minute 0 = 1. März 2027, 06:00. */
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function gameDate(minutes: number): { year: number; month: number; day: number; hour: number; minute: number } {
  let total = Math.floor(minutes) + 6 * 60; // ab 1. März 00:00
  let dayIndex = Math.floor(total / 1440);
  const rest = total - dayIndex * 1440;
  let year = START_YEAR;
  let month = 3; // März
  for (;;) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const len = month === 2 && leap ? 29 : MONTH_DAYS[month - 1];
    if (dayIndex < len) break;
    dayIndex -= len;
    month++;
    if (month > 12) { month = 1; year++; }
  }
  total = rest;
  return { year, month, day: dayIndex + 1, hour: Math.floor(total / 60), minute: total % 60 };
}
