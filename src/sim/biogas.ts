/**
 * Biogasanlage (PB-07 bis PB-10): Bau mit Genehmigung und EEG-Ausschreibung, Substratlager,
 * Fütterung mit Maisdeckel, Stromerlös, Gärrest. Alle Werte sind Annahmen (Größenordnung
 * KTBL/FNR, EEG 2023), siehe docs/plan.md.
 */

export type BiogasSize = 250 | 500;
export type Substrate = 'mais' | 'gps' | 'gras';

export interface BiogasDef {
  kw: BiogasSize;
  /** Baukosten inkl. BHKW, Fermenter, Gärrestlager und Silo (€) */
  cost: number;
  /** Genehmigung (BImSchG/Baurecht) und Bauzeit in Wochen, Gebühr und Gutachten (€) */
  permitWeeks: number;
  permitFee: number;
  buildWeeks: number;
  /** Silo (t Silage) und Gärrestlager (m³), in der Anlage enthalten */
  siloT: number;
  gaerM3: number;
}

export const BIOGAS: BiogasDef[] = [
  { kw: 250, cost: 1_250_000, permitWeeks: 20, permitFee: 25_000, buildWeeks: 26, siloT: 4_000, gaerM3: 6_000 },
  { kw: 500, cost: 2_100_000, permitWeeks: 26, permitFee: 40_000, buildWeeks: 30, siloT: 8_000, gaerM3: 12_000 },
];

/** Strom je t bzw. m³ Frischmasse (kWh elektrisch, nach BHKW-Wirkungsgrad) */
export const KWH_PER: Record<Substrate | 'guelle', number> = { mais: 400, gps: 360, gras: 330, guelle: 45 };
/** Einkauf frei Silo (€/t) */
export const SUBSTRATE_PRICE: Record<Substrate, number> = { mais: 45, gps: 42, gras: 38 };
export const SUBSTRATE_NAME: Record<Substrate | 'guelle', string> = { mais: 'Maissilage', gps: 'Getreide-GPS', gras: 'Grassilage', guelle: 'Gülle' };

/** Höchstwert der EEG-Ausschreibung Biomasse (ct/kWh) und Maisdeckel (Massenanteil) */
export const EEG_MAX_CT = 19.43;
export const MAIS_CAP = 0.25;
/** Volllaststunden-Anteil, Betrieb und Wartung (ct/kWh), fixe Kosten (Anteil der Baukosten je Jahr) */
export const LOAD_FACTOR = 0.95;
export const OPEX_CT = 3.5;
export const FIXED_SHARE = 0.015;
/** Abschreibung (Jahre) */
export const BIOGAS_AFA_YEARS = 20;
/** Gärrest je t bzw. m³ Input (m³): Silage verliert Masse, Gülle kaum */
export const GAER_PER: Record<Substrate | 'guelle', number> = { mais: 0.75, gps: 0.75, gras: 0.75, guelle: 0.95 };
/** Gülle: Anfuhr durch Dritte (€/m³); Gärrest abgeben über die Gülle-/Gärrestbörse (€/m³) */
export const GUELLE_HAUL_EUR = 2.5;
export const GAER_SELL_EUR = 6;
/** Gärrest auf eigenen Flächen: Gabe (m³/ha) und eingesparter Mineraldünger (€/m³) */
export const GAER_GABE = 20;
export const GAER_VALUE_EUR = 4;

/** Sperrfrist für Gärrest auf Ackerland (vereinfacht 1.10. bis 31.1., DüV) */
export function gaerBlocked(month: number): boolean {
  return month >= 10 || month === 1;
}

/** Strombedarf je Tag bei voller Leistung (kWh) */
export function dailyTarget(kw: number): number {
  return kw * 24 * LOAD_FACTOR;
}

export interface Feed { guelle: number; mais: number; gps: number; gras: number; kwh: number }

/**
 * Tagesration: Gülle zuerst (billig), dann so viel Mais wie der Maisdeckel erlaubt, Rest mit
 * GPS und Gras. Fehlt Substrat, sinkt die Leistung. Nur + − × ÷.
 */
export function ration(target: number, stock: { guelle: number; mais: number; gps: number; gras: number }): Feed {
  const g = Math.min(stock.guelle, target / KWH_PER.guelle);
  let rest = target - g * KWH_PER.guelle;
  // Mais m mit m ≤ MAIS_CAP × (g + andere + m); andere decken den Rest der Energie
  // ohne GPS/Gras-Grenze: m × (1/c − 1 + kM/kO) ≤ g + rest/kO  (kO = Energie der anderen je t)
  const otherStock = stock.gps + stock.gras;
  const kO = otherStock > 0 ? (stock.gps * KWH_PER.gps + stock.gras * KWH_PER.gras) / otherStock : KWH_PER.gras;
  const mCap = (g + rest / kO) / (1 / MAIS_CAP - 1 + KWH_PER.mais / kO);
  const m = Math.max(0, Math.min(stock.mais, rest / KWH_PER.mais, mCap));
  rest -= m * KWH_PER.mais;
  // GPS vor Gras (mehr Energie je t), beide begrenzen zusätzlich den Mais nicht mehr
  const p = Math.max(0, Math.min(stock.gps, rest / KWH_PER.gps));
  rest -= p * KWH_PER.gps;
  const a = Math.max(0, Math.min(stock.gras, rest / KWH_PER.gras));
  rest -= a * KWH_PER.gras;
  // Maisdeckel mit tatsächlich gefütterter Menge prüfen (bei wenig GPS/Gras weniger Mais)
  let mais = m;
  const cap = (MAIS_CAP / (1 - MAIS_CAP)) * (g + p + a);
  if (mais > cap) mais = cap;
  const kwh = g * KWH_PER.guelle + mais * KWH_PER.mais + p * KWH_PER.gps + a * KWH_PER.gras;
  return { guelle: g, mais, gps: p, gras: a, kwh };
}

/** Gärrest aus einer Ration (m³) */
export function gaerOf(f: Feed): number {
  return f.guelle * GAER_PER.guelle + f.mais * GAER_PER.mais + f.gps * GAER_PER.gps + f.gras * GAER_PER.gras;
}

/** Gülle eines Viehbetriebs je Tag (m³): Annahme 0,5 GV/ha × 15 m³ im Jahr bei Viehhaltern */
export function farmSlurryPerDay(areaHa: number): number {
  return Math.round(((areaHa * 0.5 * 15) / 365) * 10) / 10;
}

/** Ausbau (Vorschlag 9): Nahwärmenetz, Flexibilisierung (zweites BHKW, Gasspeicher) */
export const HEAT_COST = 180_000;
/** Wärme: 0,9 kWh thermisch je kWh Strom, 40 % davon verkauft, 4,5 ct/kWh (Annahme) */
export const HEAT_SHARE = 0.9 * 0.4;
export const HEAT_CT = 4.5;
/** Flex: 600 € je kW, Flexzuschlag 65 €/kW und Jahr (EEG), bessere Vermarktung +0,8 ct/kWh */
export const FLEX_COST_KW = 600;
export const FLEX_EUR_KW_YEAR = 65;
export const FLEX_CT = 0.8;
/** Silo festfahren: ohne eigenen Radlader nach 2 Tagen Fremdwalze (100 t/h, 110 €/h) */
export const SILO_HIRED_TPH = 100;
export const SILO_HIRED_EUR_H = 110;

/** Gärrest beim Kunden ausbringen (€/m³): Gärrest gratis, Kunde zahlt nur die Ausbringung (Annahme) */
export const GAER_SERVICE_EUR_M3 = 3;
