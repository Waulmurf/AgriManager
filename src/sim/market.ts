/**
 * Markt und Konkurrenz (Phase 5, MK-01 bis MK-05): konkurrierende Lohnunternehmen im Spielgebiet,
 * ihre Preise, Preiskampf, Ruf des eigenen Betriebs. Konkurrenten sind nicht als Fahrzeuge
 * simuliert, sondern bieten auf die Anfragen der Kunden mit.
 *
 * Anzahl und Größen nach der Festlegung in docs/anforderungen.md („Betriebe und Konkurrenz im
 * Spielgebiet“): 2–3 große, 4–5 mittlere, rund 4 kleine Anbieter. Namen sind erfunden.
 */
import type { Service } from './business';

export interface Competitor {
  id: number;
  name: string;
  town: string;
  lonLat: [number, number];
  size: 'gross' | 'mittel' | 'klein';
  services: Service[];
  /** Preisniveau relativ zum Marktpreis (1 = Durchschnitt) */
  priceLevel: number;
  /** Preiskampf: gilt bis Spielminute, Abschlag */
  warUntil: number;
  warCut: number;
  /** gewonnene Aufträge gegen den Spieler (Statistik) */
  won: number;
}

/** Orte im Spielgebiet (Ortsmitte, gerundet) */
const TOWNS: { town: string; lonLat: [number, number] }[] = [
  { town: 'Uelzen', lonLat: [10.56, 52.966] },
  { town: 'Lüneburg', lonLat: [10.414, 53.251] },
  { town: 'Dannenberg', lonLat: [11.098, 53.098] },
  { town: 'Lüchow', lonLat: [11.153, 52.968] },
  { town: 'Salzwedel', lonLat: [11.151, 52.85] },
  { town: 'Wittingen', lonLat: [10.739, 52.728] },
  { town: 'Bad Bevensen', lonLat: [10.584, 53.079] },
  { town: 'Ebstorf', lonLat: [10.411, 53.028] },
  { town: 'Bienenbüttel', lonLat: [10.488, 53.144] },
  { town: 'Clenze', lonLat: [10.96, 52.935] },
  { town: 'Hankensbüttel', lonLat: [10.607, 52.732] },
];

const NAMES = [
  'Agrarservice Heide', 'Lohnunternehmen Wendland', 'Elbmarsch Agrar', 'Ilmenau Lohndienst', 'Altmark Agrartechnik',
  'Heidjer Lohnbetrieb', 'Lohnunternehmen Drawehn', 'Feldtechnik Nord', 'Agrardienst Ostheide', 'Lohnbetrieb Jeetzel', 'Hof- und Feldservice Ilmenau',
];

const SERVICES: Record<Competitor['size'], Service[]> = {
  gross: ['grubbern', 'stoppel', 'guelle', 'haeckseln'],
  mittel: ['grubbern', 'stoppel', 'guelle'],
  klein: ['grubbern', 'stoppel'],
};

/** Konkurrenten deterministisch aus dem Zufallsstrom (Funktion für Werte 0…1) */
export function generateCompetitors(rand: () => number): Competitor[] {
  const sizes: Competitor['size'][] = ['gross', 'gross', 'mittel', 'mittel', 'mittel', 'mittel', 'mittel', 'klein', 'klein', 'klein', 'klein'];
  return sizes.map((size, i) => {
    const t = TOWNS[i % TOWNS.length];
    // Große etwas teurer, Kleine (oft Nebenerwerb) günstiger
    const base = size === 'gross' ? 1.04 : size === 'mittel' ? 1 : 0.92;
    return {
      id: i + 1,
      name: NAMES[i],
      town: t.town,
      lonLat: [t.lonLat[0] + (rand() - 0.5) * 0.04, t.lonLat[1] + (rand() - 0.5) * 0.03],
      size,
      services: SERVICES[size],
      priceLevel: Math.round((base + (rand() - 0.5) * 0.08) * 100) / 100,
      warUntil: 0,
      warCut: 0,
      won: 0,
    };
  });
}

/** Entfernung in km (Näherung für 53° N) */
export function kmBetween(a: [number, number], b: [number, number]): number {
  const dx = (a[0] - b[0]) * 67, dy = (a[1] - b[1]) * 111;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Einzugsgebiet eines Konkurrenten für die Anfahrt (km); weiter weg wird es teurer */
export const COMPETITOR_RANGE_KM = 30;
/** Preiskampf wirkt im Umkreis (km) */
export const PRICE_WAR_KM = 25;
