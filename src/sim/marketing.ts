/**
 * Vermarktung und Lager (Vorschlag 6) sowie Flächenkauf und Düngung (Vorschlag 8).
 * Preise je Kultur schwanken täglich (Zufallsgang um den Basispreis) mit Saisonmuster:
 * zur Ernte billig, im Frühjahr teurer. Werte sind Annahmen, siehe docs/plan.md.
 */
import type { OwnCrop } from './farming';

/** lagerfähige Kulturen (Getreidelager); Rüben gehen an die Zuckerfabrik, Mais ins Silo, Kartoffeln direkt */
export const STORABLE: OwnCrop[] = ['weizen', 'raps'];
/** Lagerkosten je t und Monat (Belüftung, Versicherung, Schwund) */
export const STORE_EUR_T_MONTH = 1.5;
/** Saisonfaktor je Monat (Januar–Dezember) für lagerfähige Kulturen */
export const SEASON_FACTOR = [1.04, 1.05, 1.06, 1.06, 1.05, 1.0, 0.94, 0.92, 0.95, 0.98, 1.0, 1.02];

/** Kaufpreis je ha (Annahme Kreis Uelzen, Sandböden: um 30.000 €, je Ackerzahlpunkt ±800 €, Beregnung +4.000 €) */
export function landPrice(soil: number, irrigated: boolean): number {
  return Math.round((30_000 + (soil - 35) * 800 + (irrigated ? 4_000 : 0)) / 500) * 500;
}

/** Stickstoffbedarf je ha und Jahr (kg N, Düngebedarfsermittlung, Annahme) */
export const N_NEED: Record<OwnCrop, number> = { weizen: 230, raps: 200, mais: 200, rueben: 160, kartoffeln: 180 };
/** Gärrest: kg N je m³ und Grenze für organischen Stickstoff (DüV, kg N/ha und Jahr) */
export const GAER_N_KG_M3 = 3.5;
export const ORGANIC_N_LIMIT = 170;
