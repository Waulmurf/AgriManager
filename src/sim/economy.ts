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

export type MachineType = 'schlepper' | 'firmenwagen' | 'grubber';

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
