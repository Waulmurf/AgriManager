/**
 * Maschinenkatalog und Händler (HM-01, HM-04, HM-09) – erweiterbare Datentabelle.
 *
 * Neupreise netto: Anker aus docs/maschinen.md (Case IH Puma CVX 175 164.900 €, Maxxum 150
 * 149.900 €, Claas Axion 960 ca. 252.000 €, Fendt 720 Vario 225.000 €), übrige Modelle als
 * Annahme in derselben Größenordnung (etwa 1.000–1.150 € je PS). Geräte: Horsch Terrano 4 FX
 * 23.500 € (landwirt.com), übrige Annahme. Flächenleistung nach LWK-Erfahrungssätzen
 * (Stoppelgrubber 3–4 m 1,49–1,89 ha/h, Kurzscheibenegge 3 m 2,0 ha/h); größere Breiten
 * proportional hochgerechnet (Annahme).
 */
import type { MachineType } from '../sim/economy';

export interface CatalogModel {
  key: string;
  type: MachineType;
  brand: string;
  model: string;
  newPrice: number;
  /** Schlepper: PS */
  power?: number;
  /** Geräte */
  width?: number;
  powerNeed?: number;
  haPerHour?: number;
  workKmh?: number;
  dieselLHa?: number;
  /** Lieferzeit neu (Wochen) */
  deliveryWeeks: number;
}

const T = (key: string, brand: string, model: string, power: number, newPrice: number, deliveryWeeks = 8): CatalogModel =>
  ({ key, type: 'schlepper', brand, model, power, newPrice, deliveryWeeks });
const G = (key: string, brand: string, model: string, width: number, powerNeed: number, haPerHour: number, newPrice: number, deliveryWeeks = 4): CatalogModel =>
  ({ key, type: 'grubber', brand, model, width, powerNeed, haPerHour, workKmh: 10, dieselLHa: 9, newPrice, deliveryWeeks });
const K = (key: string, brand: string, model: string, width: number, powerNeed: number, haPerHour: number, newPrice: number): CatalogModel =>
  ({ key, type: 'kurzscheibenegge', brand, model, width, powerNeed, haPerHour, workKmh: 12, dieselLHa: 6, newPrice, deliveryWeeks: 4 });

export const CATALOG: CatalogModel[] = [
  // Schlepper S (100–150 PS)
  T('fendt-314', 'Fendt', '314 Vario', 142, 158_000),
  T('jd-6130r', 'John Deere', '6130R', 130, 140_000),
  T('mf-6s145', 'Massey Ferguson', '6S.145', 145, 138_000),
  T('valtra-n155', 'Valtra', 'N155e', 155, 146_000),
  T('claas-arion550', 'Claas', 'Arion 550', 165, 152_000),
  T('case-maxxum150', 'Case IH', 'Maxxum 150', 150, 149_900),
  T('nh-t6180', 'New Holland', 'T6.180', 175, 160_000),
  T('df-6165', 'Deutz-Fahr', '6165 TTV', 165, 150_000),
  // M (150–250 PS)
  T('fendt-516', 'Fendt', '516 Vario', 165, 185_000),
  T('fendt-720', 'Fendt', '720 Vario', 200, 225_000),
  T('jd-6r215', 'John Deere', '6R 215', 215, 235_000),
  T('mf-7s190', 'Massey Ferguson', '7S.190', 190, 182_000),
  T('valtra-t235', 'Valtra', 'T235 Versu', 235, 228_000),
  T('case-puma175', 'Case IH', 'Puma 175 CVX', 175, 164_900),
  T('nh-t7270', 'New Holland', 'T7.270', 270, 255_000),
  T('claas-axion870', 'Claas', 'Axion 870', 295, 270_000),
  T('df-7250', 'Deutz-Fahr', '7250 TTV', 247, 232_000),
  // L (250–400 PS)
  T('fendt-828', 'Fendt', '828 Vario', 287, 320_000, 12),
  T('jd-7r330', 'John Deere', '7R 330', 330, 365_000, 12),
  T('claas-axion960', 'Claas', 'Axion 960', 445, 400_000, 12),
  // Grubber
  G('koeck-trio300', 'Köckerling', 'Trio 300', 3, 120, 1.5, 19_000),
  G('horsch-terrano4', 'Horsch', 'Terrano 4 FX', 4, 160, 1.7, 23_500),
  G('lemken-karat400', 'Lemken', 'Karat 10/400', 4, 160, 1.8, 27_500),
  G('horsch-terrano5', 'Horsch', 'Terrano 5 FM', 5, 200, 2.2, 38_000),
  G('amazone-cenius6', 'Amazone', 'Cenius 6003-2TX', 6, 240, 2.7, 52_000),
  G('horsch-tiger6', 'Horsch', 'Tiger 6 DT', 6, 300, 2.6, 68_000),
  // Kurzscheibeneggen (für spätere Stoppelaufträge)
  K('horsch-joker3', 'Horsch', 'Joker 3 CT', 3, 110, 2.0, 21_000),
  K('koeck-rebell6', 'Köckerling', 'Rebell 600 T', 6, 190, 3.8, 48_000),
];

export interface Dealer {
  id: number;
  name: string;
  town: string;
  /** Standort [lon, lat] (Ortsmitte, Annahme) */
  lonLat: [number, number];
  tractorBrands: string[];
  implementBrands: string[];
}

/** Fiktive Händler an echten Orten (docs/maschinen.md, „Händler im Spiel“) */
export const DEALERS: Dealer[] = [
  { id: 1, name: 'Landtechnik Uelzen', town: 'Uelzen', lonLat: [10.5627, 52.9645], tractorBrands: ['Fendt', 'Massey Ferguson', 'Valtra'], implementBrands: ['Amazone', 'Lemken', 'Pöttinger'] },
  { id: 2, name: 'Kartoffel- und Rübentechnik Uelzen', town: 'Uelzen', lonLat: [10.5530, 52.9790], tractorBrands: [], implementBrands: ['Grimme'] },
  { id: 3, name: 'Agrartechnik Lüneburg', town: 'Lüneburg', lonLat: [10.4140, 53.2490], tractorBrands: ['John Deere'], implementBrands: ['Kverneland', 'Krone'] },
  { id: 4, name: 'Landmaschinen Suhlendorf', town: 'Suhlendorf', lonLat: [10.7660, 52.9370], tractorBrands: ['Claas'], implementBrands: ['Horsch', 'Kotte', 'Zunhammer'] },
  { id: 5, name: 'Landtechnik Altmark', town: 'Salzwedel', lonLat: [11.1500, 52.8500], tractorBrands: ['Case IH', 'New Holland'], implementBrands: ['Kverneland', 'Joskin'] },
  { id: 6, name: 'Agrarservice Wittingen', town: 'Wittingen', lonLat: [10.7300, 52.7270], tractorBrands: ['Deutz-Fahr'], implementBrands: ['Rabe', 'Köckerling'] },
];

/** Händler, die eine Marke führen (für Werkstatt und Neukauf) */
export function dealersFor(brand: string): Dealer[] {
  return DEALERS.filter((d) => d.tractorBrands.includes(brand) || d.implementBrands.includes(brand));
}
