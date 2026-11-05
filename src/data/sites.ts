/**
 * Standorte und Gebäude (ST-01 bis ST-09). Kosten und Bauzeiten sind Annahmen
 * (Hallen um 250 €/m² Grundfläche, Hausjournal: Leimbinderhalle 20 × 15 m bis etwa 80.000 €),
 * siehe docs/plan.md.
 */
export type BuildingKey = 'platz' | 'halle' | 'werkstatt' | 'tank' | 'buero' | 'fahrsilo';

export interface BuildingDef {
  key: BuildingKey;
  name: string;
  cost: number;
  weeks: number;
  /** braucht Baugenehmigung (ST-03) */
  permit: boolean;
  /** laufende Kosten je Jahr (Strom, Grundsteuer, Versicherung, Instandhaltung; ST-05) */
  runningPerYear: number;
  effect: string;
  requires?: BuildingKey;
}

export const BUILDINGS: BuildingDef[] = [
  { key: 'platz', name: 'Befestigter Platz (2.500 m² Schotter/Pflaster)', cost: 45_000, weeks: 3, permit: false, runningPerYear: 500,
    effect: 'Ganzjährig befahrbar: kein Rangieren im Matsch (Rüstzeit +10 min und mehr Verschleiß bei nassem Boden entfallen), mehr Stellplätze' },
  { key: 'halle', name: 'Maschinenhalle (600 m²)', cost: 150_000, weeks: 8, permit: true, runningPerYear: 1_500, requires: 'platz',
    effect: 'Untergestellte Maschinen verschleißen 25 % langsamer (Platz für 10 Maschinen)' },
  { key: 'werkstatt', name: 'Werkstatt mit Grube (200 m²)', cost: 220_000, weeks: 10, permit: true, runningPerYear: 3_000, requires: 'platz',
    effect: 'Wartung am Hof durch eigene Mechaniker: halber Preis, 4 Stunden, keine Fahrt zum Händler' },
  { key: 'tank', name: 'Dieseltank (10.000 l) und Waschplatz', cost: 40_000, weeks: 3, permit: true, runningPerYear: 800,
    effect: 'Diesel 6 ct/l günstiger (Großabnahme), Pflege senkt den Verschleiß um 10 %' },
  { key: 'buero', name: 'Büro und Sozialräume', cost: 85_000, weeks: 6, permit: true, runningPerYear: 2_000,
    effect: 'Zufriedenheit der Mitarbeiter am Standort +5' },
  { key: 'fahrsilo', name: 'Fahrsilo (3 Kammern, 3.000 t)', cost: 120_000, weeks: 6, permit: true, runningPerYear: 1_200, requires: 'platz',
    effect: 'Lager für eigene Silage (Ackerbau, Biogas)' },
];

/** Genehmigungsdauer (Wochen) und Gebühr je Lage (ST-03, vereinfacht) */
export const PERMIT: Record<SiteKind, { weeks: number; fee: number }> = {
  hof: { weeks: 16, fee: 3_000 }, // Außenbereich: Lohnunternehmen ist nicht privilegiert
  resthof: { weeks: 10, fee: 2_000 },
  gewerbe: { weeks: 6, fee: 1_500 },
};

export type SiteKind = 'hof' | 'gewerbe' | 'resthof';

export interface SiteOffer {
  key: string;
  name: string;
  town: string;
  kind: SiteKind;
  lonLat: [number, number];
  /** Kaufpreis bzw. Pacht je Monat */
  price: number;
  rentPerMonth?: number;
  /** schon vorhandene Gebäude */
  buildings: BuildingKey[];
  note: string;
}

/** Grundstücke und Hofstellen im Angebot (Annahme; Gewerbeland 20–45 €/m²) */
export const SITE_OFFERS: SiteOffer[] = [
  { key: 'gw-uelzen', name: 'Gewerbegrundstück Uelzen-Veerßen', town: 'Uelzen', kind: 'gewerbe', lonLat: [10.583, 52.952], price: 225_000, buildings: [], note: '5.000 m² im Gewerbegebiet, 45 €/m², nah an der B4 und den Händlern' },
  { key: 'gw-dannenberg', name: 'Gewerbegrundstück Dannenberg', town: 'Dannenberg', kind: 'gewerbe', lonLat: [11.09, 53.09], price: 125_000, buildings: [], note: '5.000 m², 25 €/m², erschließt das Wendland' },
  { key: 'gw-salzwedel', name: 'Gewerbegrundstück Salzwedel', town: 'Salzwedel', kind: 'gewerbe', lonLat: [11.165, 52.86], price: 100_000, buildings: [], note: '5.000 m², 20 €/m², Altmark mit viel Mais und Futter' },
  { key: 'rh-bevensen', name: 'Resthof bei Bad Bevensen', town: 'Bad Bevensen', kind: 'resthof', lonLat: [10.62, 53.1], price: 380_000, buildings: ['platz', 'halle'], note: 'Hofstelle mit befestigtem Platz und Maschinenhalle' },
  { key: 'rh-neuhaus', name: 'Resthof Neuhaus (rechts der Elbe)', town: 'Neuhaus', kind: 'resthof', lonLat: [10.93, 53.28], price: 0, rentPerMonth: 1_400, buildings: ['platz'], note: 'Zur Pacht, jenseits der Elbe – ohne langen Umweg über die Fähren' },
];
