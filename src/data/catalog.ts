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
  tankM3?: number;
  payloadT?: number;
  weightT?: number;
  seats?: number;
  carKind?: 'kombi' | 'kleinbus' | 'werkstatt';
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
  // Güllefässer mit Schleppschlauch bzw. Schleppschuh (Pflicht auf bestelltem Ackerland).
  // Preise aus docs/maschinen.md (Zunhammer SKE 18,5 + Bomech 15 m 86.885 €; Joskin Volumetra
  // 16500 D neu 139.000 €; Kotte Garant VT 13900 109.896 € brutto AT ≈ 92.000 € netto; Joskin Alpina 2
  // 7100 S 43.553 € brutto AT ≈ 36.600 € netto). Flächenleistung: Breite × 8 km/h × 0,7 (Annahme).
  { key: 'joskin-alpina7', type: 'guellefass', brand: 'Joskin', model: 'Alpina 2 7100 S + Schleppschuh 7,5 m', tankM3: 7.1, width: 7.5, powerNeed: 110, haPerHour: 4.2, workKmh: 8, dieselLHa: 4, newPrice: 36_600, deliveryWeeks: 6 },
  { key: 'kotte-vt13900', type: 'guellefass', brand: 'Kotte', model: 'Garant VT 13900 + Schleppschlauch 12 m', tankM3: 13.9, width: 12, powerNeed: 180, haPerHour: 6.7, workKmh: 8, dieselLHa: 4, newPrice: 92_000, deliveryWeeks: 8 },
  { key: 'joskin-volumetra16', type: 'guellefass', brand: 'Joskin', model: 'Volumetra 16500 D + Schleppschlauch 15 m', tankM3: 16.5, width: 15, powerNeed: 200, haPerHour: 8.4, workKmh: 8, dieselLHa: 4, newPrice: 139_000, deliveryWeeks: 10 },
  { key: 'zunhammer-ske185', type: 'guellefass', brand: 'Zunhammer', model: 'SKE 18,5 PU + Bomech Multi 15 m', tankM3: 18.5, width: 15, powerNeed: 220, haPerHour: 8.4, workKmh: 8, dieselLHa: 4, newPrice: 86_900, deliveryWeeks: 10 },
  // Zubringerfässer ohne Verteiler (Annahme, Preise in der Größenordnung großer Tandem-/Tridemfässer)
  { key: 'kotte-zubringer24', type: 'zubringer', brand: 'Kotte', model: 'Zubringer VTR 24.000', tankM3: 24, powerNeed: 220, newPrice: 78_000, deliveryWeeks: 10 },
  { key: 'joskin-quadra20', type: 'zubringer', brand: 'Joskin', model: 'Quadra 20000 TS (Zubringer)', tankM3: 20, powerNeed: 200, newPrice: 66_000, deliveryWeeks: 8 },
  // Feldhäcksler mit Maisgebiss (Vorsatz passend zur Marke, docs/maschinen.md). Preisanker Krone BiG X 780
  // Bj. 2023 398.000 €; Neupreise Annahme. Flächenleistung Silomais (Annahme): 8 Reihen 2,4 ha/h, 10–12 Reihen 3,0–3,3 ha/h
  // (≈ 100–140 t/h bei 42 t/ha; topagrar: 90–120 t/h mit zwei festen Abfahrern).
  { key: 'claas-jaguar940', type: 'feldhaecksler', brand: 'Claas', model: 'Jaguar 940 + Orbis 600', power: 530, width: 6, haPerHour: 2.4, workKmh: 7, dieselLHa: 30, newPrice: 480_000, deliveryWeeks: 16 },
  { key: 'krone-bigx780', type: 'feldhaecksler', brand: 'Krone', model: 'BiG X 780 + EasyCollect 750', power: 770, width: 7.5, haPerHour: 3.0, workKmh: 7, dieselLHa: 32, newPrice: 560_000, deliveryWeeks: 16 },
  { key: 'jd-8500i', type: 'feldhaecksler', brand: 'John Deere', model: '8500i + Kemper 390 Plus', power: 770, width: 9, haPerHour: 3.3, workKmh: 7, dieselLHa: 32, newPrice: 620_000, deliveryWeeks: 16 },
  // Häckselwagen (Abfahrer, Annahme): Silomais etwa 300 kg/m³
  { key: 'krampe-bigbody650', type: 'haeckselwagen', brand: 'Krampe', model: 'Big Body 650 S (36 m³)', payloadT: 11, powerNeed: 150, newPrice: 62_000, deliveryWeeks: 8 },
  { key: 'fliegl-asw391', type: 'haeckselwagen', brand: 'Fliegl', model: 'Gigant ASW 391 (45 m³)', payloadT: 14, powerNeed: 200, newPrice: 95_000, deliveryWeeks: 10 },
  // Mähdrescher mit Schneidwerk (Annahme, Neupreise Größenordnung Händlerlisten; Korntank 9.500–14.000 l,
  // Weizen ≈ 0,78 t/m³). Flächenleistung Weizen (Annahme): 6 m 1,9 ha/h, 9 m 3,0 ha/h, 10,7 m 3,4–3,5 ha/h
  { key: 'deutz-c7206', type: 'maehdrescher', brand: 'Deutz-Fahr', model: 'C7206 TS + 6,3 m', power: 306, width: 6.3, haPerHour: 1.9, workKmh: 6, dieselLHa: 16, payloadT: 7, newPrice: 310_000, deliveryWeeks: 14 },
  { key: 'claas-lexion6800', type: 'maehdrescher', brand: 'Claas', model: 'Lexion 6800 + Vario 930', power: 435, width: 9.3, haPerHour: 3.0, workKmh: 6, dieselLHa: 18, payloadT: 9, newPrice: 520_000, deliveryWeeks: 16 },
  { key: 'nh-cr890', type: 'maehdrescher', brand: 'New Holland', model: 'CR 8.90 + Varifeed 10,7 m', power: 449, width: 10.7, haPerHour: 3.4, workKmh: 6, dieselLHa: 19, payloadT: 11, newPrice: 580_000, deliveryWeeks: 16 },
  { key: 'jd-s785', type: 'maehdrescher', brand: 'John Deere', model: 'S785i + 735X (10,7 m)', power: 473, width: 10.7, haPerHour: 3.5, workKmh: 6, dieselLHa: 19, payloadT: 11, newPrice: 610_000, deliveryWeeks: 16 },
  // Kipper zum Abfahren von Korn (Annahme)
  { key: 'krampe-hp20', type: 'kipper', brand: 'Krampe', model: 'Halfpipe HP 20 (18 t)', payloadT: 18, powerNeed: 160, newPrice: 52_000, deliveryWeeks: 8 },
  { key: 'fliegl-tdk302', type: 'kipper', brand: 'Fliegl', model: 'TDK 302 Tridem-Kipper (22 t)', payloadT: 22, powerNeed: 200, newPrice: 66_000, deliveryWeeks: 8 },
  // Rübenroder-Selbstfahrer 6-reihig, Bunker ≈ 30 t (docs/ablaeufe.md); Flächenleistung 1,6–1,8 ha/h (Annahme)
  { key: 'grimme-rexor6300', type: 'ruebenroder', brand: 'Grimme', model: 'Rexor 6300 Platinum', power: 627, width: 2.7, haPerHour: 1.6, workKmh: 6, dieselLHa: 32, payloadT: 30, newPrice: 690_000, deliveryWeeks: 20 },
  { key: 'ropa-tiger6s', type: 'ruebenroder', brand: 'Ropa', model: 'Tiger 6S', power: 796, width: 2.7, haPerHour: 1.8, workKmh: 6, dieselLHa: 34, payloadT: 33, newPrice: 760_000, deliveryWeeks: 20 },
  // Lkw: Sattelzugmaschine mit Kippauflieger (≈ 27 m³ Rüben/Getreide, 25 t Nutzlast; Annahme Neupreis Zug + Auflieger)
  { key: 'man-tgx', type: 'lkw', brand: 'MAN', model: 'TGX 18.510 + Kippsattel', power: 510, payloadT: 25, newPrice: 185_000, deliveryWeeks: 12 },
  { key: 'mb-actros', type: 'lkw', brand: 'Mercedes-Benz', model: 'Actros 1848 + Kippsattel', power: 480, payloadT: 25, newPrice: 178_000, deliveryWeeks: 12 },
  { key: 'scania-r500', type: 'lkw', brand: 'Scania', model: 'R 500 + Kippsattel', power: 500, payloadT: 26, newPrice: 192_000, deliveryWeeks: 14 },
  // Radlader zum Verteilen und Walzen am Silo (Annahme): Walzleistung ≈ Betriebsgewicht × 4 t Frischmasse je Stunde
  { key: 'jcb-437', type: 'radlader', brand: 'JCB', model: '437 HT Agri', weightT: 13, power: 200, newPrice: 150_000, deliveryWeeks: 8 },
  { key: 'liebherr-l526', type: 'radlader', brand: 'Liebherr', model: 'L 526', weightT: 12, power: 160, newPrice: 170_000, deliveryWeeks: 10 },
  { key: 'volvo-l90h', type: 'radlader', brand: 'Volvo', model: 'L90H', weightT: 15, power: 240, newPrice: 210_000, deliveryWeeks: 10 },
  // Firmenwagen (Annahme, Nettopreise gut ausgestatteter Nutzfahrzeuge): Kombi 5 Plätze,
  // Kleinbus 8 Plätze (Mannschaftswagen), Werkstattwagen 3 Plätze mit Werkstatteinbau
  { key: 'car-kombi', type: 'firmenwagen', brand: 'Firmenwagen', model: 'Kombi', newPrice: 38_000, seats: 5, carKind: 'kombi', deliveryWeeks: 3 },
  { key: 'car-kleinbus', type: 'firmenwagen', brand: 'Firmenwagen', model: 'Kleinbus (8 Plätze)', newPrice: 49_000, seats: 8, carKind: 'kleinbus', deliveryWeeks: 6 },
  { key: 'car-werkstatt', type: 'firmenwagen', brand: 'Firmenwagen', model: 'Werkstattwagen (3 Plätze)', newPrice: 68_000, seats: 3, carKind: 'werkstatt', deliveryWeeks: 8 },
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
  { id: 2, name: 'Kartoffel- und Rübentechnik Uelzen', town: 'Uelzen', lonLat: [10.5530, 52.9790], tractorBrands: [], implementBrands: ['Grimme', 'Ropa'] },
  { id: 3, name: 'Agrartechnik Lüneburg', town: 'Lüneburg', lonLat: [10.4140, 53.2490], tractorBrands: ['John Deere'], implementBrands: ['Kverneland', 'Krone'] },
  { id: 4, name: 'Landmaschinen Suhlendorf', town: 'Suhlendorf', lonLat: [10.7660, 52.9370], tractorBrands: ['Claas'], implementBrands: ['Horsch', 'Kotte', 'Zunhammer'] },
  { id: 5, name: 'Landtechnik Altmark', town: 'Salzwedel', lonLat: [11.1500, 52.8500], tractorBrands: ['Case IH', 'New Holland'], implementBrands: ['Kverneland', 'Joskin', 'Krampe', 'Fliegl'] },
  { id: 6, name: 'Agrarservice Wittingen', town: 'Wittingen', lonLat: [10.7300, 52.7270], tractorBrands: ['Deutz-Fahr'], implementBrands: ['Rabe', 'Köckerling'] },
  { id: 7, name: 'Nutzfahrzeuge Uelzen', town: 'Uelzen', lonLat: [10.5450, 52.9560], tractorBrands: ['Firmenwagen'], implementBrands: [] },
  { id: 9, name: 'Lkw-Zentrum Uelzen', town: 'Uelzen', lonLat: [10.5350, 52.9700], tractorBrands: ['MAN', 'Mercedes-Benz', 'Scania'], implementBrands: [] },
  { id: 8, name: 'Baumaschinen Lüneburg', town: 'Lüneburg', lonLat: [10.4350, 53.2380], tractorBrands: ['JCB', 'Liebherr', 'Volvo'], implementBrands: [] },
];

/** Händler, die eine Marke führen (für Werkstatt und Neukauf) */
export function dealersFor(brand: string): Dealer[] {
  return DEALERS.filter((d) => d.tractorBrands.includes(brand) || d.implementBrands.includes(brand));
}
