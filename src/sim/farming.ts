/**
 * Eigener Ackerbau (PB-04 bis PB-06, PF-01): Kulturen mit Arbeitsgängen, Erträgen und Preisen.
 * Werte sind Annahmen für Niedersachsen (Größenordnung KTBL/LWK, Erzeugerpreise 2025/26), siehe
 * docs/plan.md. Arbeitsgänge mit eigenem Fuhrpark werden Eigenaufträge, die übrigen werden als
 * Fremdleistung eingekauft (Saat, Pflanzenschutz/Düngung, Drusch, Roden).
 */
import type { Service } from './business';
import { Crop } from './farms';

export type OwnCrop = 'weizen' | 'raps' | 'mais' | 'rueben' | 'kartoffeln';

export interface CropStep {
  key: string;
  name: string;
  /** eigener Fuhrpark (Dienstleistung) oder Fremdleistung */
  service?: Service;
  /** Fenster als Monat*100+Tag (von, bis); bis < von = über den Jahreswechsel */
  from: number;
  to: number;
  /** Kosten je ha bei Fremdleistung inkl. Betriebsmittel (Saatgut, Dünger, Pflanzenschutz) */
  costHa: number;
  /** ohne diesen Schritt sinkt der Ertrag (verpasst: −10 %) */
  required: boolean;
  /** Ernte: Ertrag wird gebucht */
  harvest?: boolean;
}

export interface CropDef {
  key: OwnCrop;
  name: string;
  /** passende Kultur im Kartenmodell */
  mapCrop: Crop;
  /** Ertrag je ha bei mittlerem Boden (t), Preis je t (€) */
  yieldT: number;
  priceT: number;
  /** wie stark Trockenheit ohne Beregnung den Ertrag senkt (0 = gar nicht, 1 = voll) */
  drought: number;
  steps: CropStep[];
}

const STOPPEL: CropStep = { key: 'stoppel', name: 'Stoppelbearbeitung', service: 'stoppel', from: 801, to: 915, costHa: 0, required: false };

export const CROPS: CropDef[] = [
  {
    key: 'weizen', name: 'Winterweizen', mapCrop: Crop.Getreide, yieldT: 7.5, priceT: 215, drought: 0.6,
    steps: [
      STOPPEL,
      { key: 'grubbern', name: 'Grubbern', service: 'grubbern', from: 901, to: 1005, costHa: 0, required: true },
      { key: 'saat', name: 'Saat (Fremdleistung inkl. Saatgut)', from: 925, to: 1025, costHa: 45 + 95, required: true },
      { key: 'pflege', name: 'Düngung und Pflanzenschutz (Fremdleistung inkl. Mittel)', from: 301, to: 531, costHa: 30 + 380, required: true },
      { key: 'drusch', name: 'Mähdrusch (Fremdleistung)', from: 720, to: 820, costHa: 155, required: true, harvest: true },
    ],
  },
  {
    key: 'raps', name: 'Winterraps', mapCrop: Crop.Raps, yieldT: 3.8, priceT: 450, drought: 0.5,
    steps: [
      { key: 'stoppel', name: 'Stoppelbearbeitung', service: 'stoppel', from: 720, to: 815, costHa: 0, required: false },
      { key: 'saat', name: 'Saat (Fremdleistung inkl. Saatgut)', from: 815, to: 910, costHa: 50 + 85, required: true },
      { key: 'pflege', name: 'Düngung und Pflanzenschutz (Fremdleistung inkl. Mittel)', from: 301, to: 430, costHa: 30 + 450, required: true },
      { key: 'drusch', name: 'Mähdrusch (Fremdleistung)', from: 710, to: 805, costHa: 155, required: true, harvest: true },
    ],
  },
  {
    key: 'mais', name: 'Silomais', mapCrop: Crop.Mais, yieldT: 42, priceT: 40, drought: 0.8,
    steps: [
      STOPPEL,
      { key: 'grubbern', name: 'Grubbern', service: 'grubbern', from: 315, to: 430, costHa: 0, required: true },
      { key: 'saat', name: 'Maislegen (Fremdleistung inkl. Saatgut)', from: 415, to: 510, costHa: 60 + 220, required: true },
      { key: 'pflege', name: 'Düngung und Pflanzenschutz (Fremdleistung inkl. Mittel)', from: 501, to: 615, costHa: 30 + 320, required: true },
      { key: 'haeckseln', name: 'Häckseln (eigene Kette, Silo am Hof)', service: 'haeckseln', from: 915, to: 1020, costHa: 0, required: true, harvest: true },
    ],
  },
  {
    key: 'rueben', name: 'Zuckerrüben (Nordzucker Uelzen)', mapCrop: Crop.Zuckerrueben, yieldT: 80, priceT: 45, drought: 0.6,
    steps: [
      STOPPEL,
      { key: 'grubbern', name: 'Grubbern', service: 'grubbern', from: 301, to: 410, costHa: 0, required: true },
      { key: 'saat', name: 'Rübensaat (Fremdleistung inkl. Saatgut)', from: 320, to: 420, costHa: 60 + 270, required: true },
      { key: 'pflege', name: 'Düngung und Pflanzenschutz (Fremdleistung inkl. Mittel)', from: 501, to: 731, costHa: 40 + 450, required: true },
      { key: 'roden', name: 'Roden und Mietenladen (Fremdleistung)', from: 1001, to: 1130, costHa: 260, required: true, harvest: true },
    ],
  },
  {
    key: 'kartoffeln', name: 'Kartoffeln', mapCrop: Crop.Kartoffeln, yieldT: 45, priceT: 140, drought: 0.9,
    steps: [
      STOPPEL,
      { key: 'grubbern', name: 'Grubbern', service: 'grubbern', from: 315, to: 415, costHa: 0, required: true },
      { key: 'legen', name: 'Kartoffeln legen (Fremdleistung inkl. Pflanzgut)', from: 410, to: 505, costHa: 150 + 1_200, required: true },
      { key: 'pflege', name: 'Düngung, Pflanzenschutz, Dämme (Fremdleistung inkl. Mittel)', from: 515, to: 815, costHa: 80 + 800, required: true },
      { key: 'roden', name: 'Roden (Fremdleistung)', from: 901, to: 1015, costHa: 420, required: true, harvest: true },
    ],
  },
];

/** Beregnung (Kosten je ha und Jahr bei beregneten Flächen, Annahme) */
export const IRRIGATION_EUR_HA = 140;

/** Ackerzahl eines Feldes (deterministisch aus dem Index): Uelzener Sandböden um 25–50 */
export function fieldSoil(i: number): number {
  const h = (((i + 1) * 2654435761) % 4294967296) / 4294967296;
  return Math.round(25 + h * 25);
}

/** Beregnung möglich (deterministisch): im Kreis Uelzen rund drei Viertel, hier 60 % (Annahme) */
export function fieldIrrigated(i: number): boolean {
  const h = (((i + 7) * 40503) % 65536) / 65536;
  return h < 0.6;
}

/** Ortsüblicher Pachtpreis je ha (Annahme: Niedersachsen 643 € Bestand, 755 € Neupacht) */
export function referenceRent(soil: number, irrigated: boolean): number {
  return Math.round((620 + (soil - 35) * 12 + (irrigated ? 140 : 0)) / 5) * 5;
}

/** Ertragsfaktor Boden: Ackerzahl 35 = 1,0, je Punkt ±1,2 % */
export function soilFactor(soil: number): number {
  return 1 + (soil - 35) * 0.012;
}

/** Fruchtfolge (PF-01): Selbstfolge −15 %, Raps/Rüben/Kartoffeln in Folge −25 % */
export function rotationFactor(crop: OwnCrop, last?: OwnCrop): number {
  if (!last || last !== crop) return 1;
  return crop === 'raps' || crop === 'rueben' || crop === 'kartoffeln' ? 0.75 : 0.85;
}
