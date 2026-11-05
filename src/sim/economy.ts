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
}

export interface MarketOffer {
  id: number;
  machine: Omit<Machine, 'id'>;
  /** Kaufpreis netto (€) */
  price: number;
  seller: string;
  note: string;
}

/**
 * Gebrauchtangebote zum Spielstart (Annahmen, angelehnt an Inserate auf landwirt.com:
 * Horsch Terrano 4 FX gebraucht 11.500–14.500 € netto, neu 23.500 € netto).
 * Flächenleistung nach LWK-Erfahrungssätzen (Stoppelgrubber 3–4 m 1,49–1,89 ha/h,
 * Kurzscheibenegge 3 m 2,0 ha/h). Ab Phase 3 ersetzt der Händlermarkt diese Liste.
 */
export const START_OFFERS: MarketOffer[] = [
  {
    id: 1,
    machine: { type: 'grubber', brand: 'Horsch', model: 'Terrano 4 FX', year: 2017, hours: 0, condition: 70, newPrice: 23_500, width: 4, powerNeed: 160, haPerHour: 1.7 },
    price: 12_500,
    seller: 'Landtechnik Uelzen (Händler)',
    note: 'Grubber 4 m, Gewährleistung 6 Monate',
  },
  {
    id: 2,
    machine: { type: 'grubber', brand: 'Köckerling', model: 'Trio 300', year: 2012, hours: 0, condition: 55, newPrice: 19_000, width: 3, powerNeed: 120, haPerHour: 1.5 },
    price: 7_900,
    seller: 'Privat, Bad Bevensen',
    note: 'Grubber 3 m, ohne Gewährleistung',
  },
  {
    id: 3,
    machine: { type: 'kurzscheibenegge', brand: 'Horsch', model: 'Joker 3 CT', year: 2016, hours: 0, condition: 65, newPrice: 21_000, width: 3, powerNeed: 110, haPerHour: 2.0 },
    price: 11_900,
    seller: 'Landtechnik Uelzen (Händler)',
    note: 'Kurzscheibenegge 3 m – für Grubber-Aufträge nicht geeignet',
  },
];

export interface Company {
  name: string;
  cash: number;
  creditLimit: number;
  loan: number;
  /** Standort: Graph-Knoten in Groß Thondorf */
  homeNode: number;
  site: string;
  machines: Machine[];
  /** Fahrer; zu Beginn nur der Chef selbst */
  drivers: { id: number; name: string; isPlayer: boolean }[];
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
      { id: 1, type: 'schlepper', brand: 'Fendt', model: '720 Vario', year: 2014, hours: 9000, condition: 68, newPrice: 225_000, power: 200 },
      { id: 2, type: 'firmenwagen', brand: '', model: 'Firmenwagen (Kombi)', year: 2018, hours: 2800, condition: 75, newPrice: 38_000 },
    ],
    drivers: [{ id: 1, name: 'Chef (du)', isPlayer: true }],
  };
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
