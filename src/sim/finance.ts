/**
 * Finanzen (Phase 4, Schritt 1): Kredit, Leasing, Abschreibung, Steuer – reine Rechenfunktionen.
 * Alle Werte sind Annahmen mit Quellen in docs/plan.md („Phase 4, Schritt 1“). Nur + − × ÷
 * (Potenzen als Schleife), damit plattformgleich.
 */
import type { Machine, MachineType } from './economy';

/** Kreditzins p. a. nach Laufzeit (Jahre) für Bonität A; Anker: Rentenbank LR-Basis 3 Jahre 3,85 % */
export function loanBaseRate(years: number): number {
  if (years <= 3) return 0.0385;
  if (years <= 5) return 0.041;
  if (years <= 8) return 0.044;
  return 0.046;
}

/** Aufschlag je Bonitätsklasse (Annahme, Preisklassen A–D der Förderbanken) */
export const RATING_SURCHARGE: Record<Rating, number> = { A: 0, B: 0.005, C: 0.012, D: 0.025 };
export type Rating = 'A' | 'B' | 'C' | 'D';

/** Kontokorrent (Dispo): Rahmen und Zins p. a. (Annahme, typische Hausbank-Konditionen) */
export const OVERDRAFT_LIMIT = 30_000;
export const OVERDRAFT_RATE = 0.11;

/** Leasingzins p. a. für Bonität A (Annahme, Herstellerfinanzierer) und Restwert nach Laufzeit */
export const LEASE_BASE_RATE = 0.059;
export function leaseResidualShare(months: number): number {
  return months <= 36 ? 0.45 : months <= 48 ? 0.35 : 0.25;
}

function pow(x: number, n: number): number {
  let r = 1;
  for (let i = 0; i < n; i++) r *= x;
  return r;
}

/** Monatliche Annuität: Darlehen P, Jahreszins r, n Monate */
export function annuity(principal: number, annualRate: number, months: number): number {
  const i = annualRate / 12;
  if (i === 0) return principal / months;
  const q = pow(1 + i, months);
  return Math.round(((principal * i * q) / (q - 1)) * 100) / 100;
}

/** Leasingrate: Barwert ohne abgezinsten Restwert, verrentet über die Laufzeit */
export function leaseRate(price: number, annualRate: number, months: number): { monthly: number; residual: number } {
  const residual = Math.round(price * leaseResidualShare(months));
  const i = annualRate / 12;
  const q = pow(1 + i, months);
  const pv = price - residual / q;
  return { monthly: Math.round(((pv * i * q) / (q - 1)) * 100) / 100, residual };
}

/**
 * Nutzungsdauer für die lineare AfA (Jahre). Traktoren 12 Jahre nach der AfA-Tabelle des BMF
 * (laut Lexware), Pkw 6 Jahre (AfA-Tabelle allgemein verwendbare Anlagegüter), Geräte 10 Jahre
 * (Annahme). Gebrauchte: Restnutzungsdauer, mindestens 3 Jahre.
 */
export function afaYears(type: MachineType, ageYears: number): number {
  const life = type === 'schlepper' ? 12 : type === 'firmenwagen' ? 6 : 10;
  return Math.max(3, life - Math.max(0, ageYears));
}

/** Buchwert einer Maschine zur Spielminute (linear, monatsgenau) */
export function bookValue(m: Machine, time: number): number {
  if (m.lease) return 0; // Leasing: gehört der Leasinggesellschaft
  const price = m.purchasePrice ?? 0;
  const years = m.afaYears ?? 10;
  const months = Math.max(0, Math.floor((time - (m.boughtAt ?? 0)) / (30 * 1440)));
  return Math.max(0, Math.round(price * (1 - months / (years * 12))));
}

/**
 * Steuer auf den Jahresgewinn eines Einzelunternehmens, vereinfacht (WF-04):
 * Gewerbesteuer: (Gewinn − 24.500 € Freibetrag) × 3,5 % Messzahl × Hebesatz 380 % (Annahme).
 * Einkommensteuer: Grundfreibetrag 12.348 €, Grenzsteuersatz steigt linear von 14 % auf 42 %
 * bis 68.480 €, darüber 42 %, ab 277.826 € 45 % (Tarif 2026, vereinfacht als lineare Progression).
 * Die Gewerbesteuer wird bis zum 3,8-fachen Messbetrag auf die Einkommensteuer angerechnet.
 */
export function profitTax(profit: number): { income: number; trade: number; total: number } {
  if (profit <= 0) return { income: 0, trade: 0, total: 0 };
  const base = Math.max(0, profit - 24_500);
  const messbetrag = base * 0.035;
  const trade = Math.round(messbetrag * 3.8);
  const G = 12_348, Z = 68_480, H = 277_826;
  let est = 0;
  if (profit > G) {
    const x = Math.min(profit, Z) - G;
    const span = Z - G;
    // Integral des linear steigenden Grenzsteuersatzes 14 % → 42 %
    est = x * 0.14 + (0.28 * x * x) / (2 * span);
  }
  if (profit > Z) est += (Math.min(profit, H) - Z) * 0.42;
  if (profit > H) est += (profit - H) * 0.45;
  const income = Math.max(0, Math.round(est - Math.min(messbetrag * 3.8, trade)));
  return { income, trade, total: income + trade };
}

/** Bonität aus Eigenkapitalquote und letztem Jahresergebnis (Annahme) */
export function rating(equityRatio: number, lastProfit: number): Rating {
  if (equityRatio >= 0.6 && lastProfit >= 0) return 'A';
  if (equityRatio >= 0.4) return 'B';
  if (equityRatio >= 0.2) return 'C';
  return 'D';
}

/** Versicherung je Jahr (WF-05, Annahme): Schlepper/Fahrzeuge Haftpflicht 400 € + Kasko 0,8 % vom Wert, Geräte 0,3 % */
export function insurancePerYear(m: Machine, value: number): number {
  const vehicle = m.type === 'schlepper' || m.type === 'firmenwagen';
  return Math.round(vehicle ? 400 + value * 0.008 : value * 0.003);
}
/** Betriebshaftpflicht je Jahr (Annahme) */
export const LIABILITY_PER_YEAR = 1_800;

/** Dieselpreis netto €/l (ohne MwSt): Startwert und langjähriger Mittelwert (Annahme, Niveau 2026) */
export const DIESEL_START = 1.62;
export const DIESEL_MEAN = 1.58;
