/**
 * Kundenbetriebe: ausgedachte Betriebe auf echten Feldern (AK-02, AK-03).
 *
 * Die Betriebe werden deterministisch aus Feldern, Straßengraph und Seed erzeugt:
 * - Anzahl: rund 2.000 im Radius (Festlegung im Anforderungs-Doc), höchstens Fläche / 105 ha
 * - Zuordnung der Felder per gewichteter Voronoi-Teilung um Startfelder → unterschiedliche
 *   Betriebsgrößen wie in der Statistik (Ø gut 100 ha)
 * - Viehhaltung bei gut der Hälfte (LZ 2020: 1.016 von 1.783 Betrieben), eher bei viel Grünland
 * - Kulturen je Acker-Feld nach regionalen Anteilen (Uelzen/Lüneburg vs. Altmark)
 * - Hofstelle: Knoten an einer Ortsstraße nahe dem Schwerpunkt der Felder
 * Namen sind erfunden (häufige norddeutsche Familiennamen), keine echten Betriebe.
 */
import { Rng } from './rng';
import { FieldKind, type FieldSet } from './fields';
import { RoadClass, type RoadGraph } from './roadgraph';

export const Crop = {
  Gruenland: 0,
  Getreide: 1,
  Zuckerrueben: 2,
  Kartoffeln: 3,
  Mais: 4,
  Raps: 5,
  Ackerfutter: 6,
} as const;
export type Crop = (typeof Crop)[keyof typeof Crop];
export const CROP_NAMES = ['Grünland', 'Getreide', 'Zuckerrüben', 'Kartoffeln', 'Mais', 'Raps', 'Ackerfutter'];

export type ContactPreference = 'anruf' | 'nachricht';

export interface Farm {
  id: number;
  name: string;
  /** Graph-Knoten der Hofstelle */
  homeNode: number;
  fields: number[];
  areaHa: number;
  livestock: boolean;
  /** Eigenmechanisierung 0 (nichts) … 1 (alles selbst) – bestimmt später den Bedarf an Lohnarbeit */
  mechanization: number;
  contact: ContactPreference;
  /** erst nach einem Besuch im Adressbuch (KK-01) */
  known: boolean;
  /** Zufriedenheit 0–100 (AK-08) */
  satisfaction: number;
}

export interface FarmSet {
  farms: Farm[];
  /** je Feld: Betrieb (Index) oder -1 */
  fieldFarm: Int32Array;
  /** je Feld: aktuelle Kultur */
  fieldCrop: Uint8Array;
}

const AVG_FARM_HA = 105;
const MAX_FARMS = 2000;

// Kulturanteile auf dem Acker (Summe 1)
const SHARES_NORTH = [0, 0.38, 0.12, 0.14, 0.18, 0.1, 0.08]; // Uelzen/Lüneburg/Lüchow-Dannenberg (Annahme)
const SHARES_ALTMARK = [0, 0.35, 0.04, 0.04, 0.19, 0.17, 0.21]; // Steckbrief Altmarkkreis Salzwedel
const LIVESTOCK_SHIFT = [0, -0.05, -0.05, -0.08, 0.1, -0.02, 0.1]; // Viehbetriebe: mehr Mais und Futter

const SURNAMES = [
  'Meyer', 'Müller', 'Schulz', 'Schröder', 'Wilkens', 'Brandt', 'Lüdemann', 'Peters', 'Harms', 'Rieckmann',
  'Heuer', 'Bartels', 'Hoppe', 'Niebuhr', 'Gerdes', 'Schütte', 'Burmester', 'Dittmer', 'Evers', 'Garbers',
  'Hennings', 'Kröger', 'Lemke', 'Martens', 'Ohlhoff', 'Prigge', 'Rademacher', 'Stöver', 'Thies', 'Voß',
  'Wendt', 'Ahrens', 'Beckmann', 'Cordes', 'Dierks', 'Ehlers', 'Fricke', 'Grote', 'Heine', 'Jahnke',
  'Köhler', 'Lange', 'Möller', 'Nagel', 'Otte', 'Pape', 'Rohde', 'Seebeck', 'Timm', 'Wiechmann',
];
const FIRST_INITIALS = 'ABCDEFGHJKLMNPRSTUW';
const FORMS = ['Hof {n}', '{n} GbR', 'Landwirtschaft {n}', 'Agrar {n} KG', 'Hof {i}. {n}', '{n} Ackerbau'];

/** Altmark grob: Südosten der Karte (Sachsen-Anhalt) */
function isAltmark(x: number, y: number): boolean {
  return x > 12000 && y < -8000;
}

export function generateFarms(g: RoadGraph, f: FieldSet, seed: number): FarmSet {
  const rng = new Rng(seed ^ 0x5a17);
  let totalHa = 0;
  for (let i = 0; i < f.count; i++) totalHa += f.areaHa[i];
  const nFarms = Math.max(1, Math.min(MAX_FARMS, Math.round(totalHa / AVG_FARM_HA), f.count));

  // Startfelder ziehen (ohne Wiederholung), Gewicht für unterschiedliche Größen
  const taken = new Uint8Array(f.count);
  const seedX: number[] = [], seedY: number[] = [], weight: number[] = [];
  while (seedX.length < nFarms) {
    const i = rng.int(f.count);
    if (taken[i]) continue;
    taken[i] = 1;
    seedX.push(f.cx[i]);
    seedY.push(f.cy[i]);
    // 0,55 … 1,6: größere Gewichte ziehen mehr Felder an
    weight.push(0.55 + rng.next() * 1.05);
  }

  // Raster der Startpunkte für schnelle Nachbarsuche
  const CELL = 4000;
  const key = (cx: number, cy: number) => cx * 100003 + cy;
  const grid = new Map<number, number[]>();
  for (let s = 0; s < nFarms; s++) {
    const k = key(Math.floor(seedX[s] / CELL), Math.floor(seedY[s] / CELL));
    let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(s);
  }
  const fieldFarm = new Int32Array(f.count).fill(-1);
  for (let i = 0; i < f.count; i++) {
    const gx = Math.floor(f.cx[i] / CELL), gy = Math.floor(f.cy[i] / CELL);
    let best = -1, bestD = Infinity;
    for (let r = 1; r <= 4 && best < 0; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        const a = grid.get(key(gx + dx, gy + dy));
        if (!a) continue;
        for (const s of a) {
          const ddx = f.cx[i] - seedX[s], ddy = f.cy[i] - seedY[s];
          const d = Math.sqrt(ddx * ddx + ddy * ddy) / weight[s];
          if (d < bestD || (d === bestD && s < best)) { bestD = d; best = s; }
        }
      }
    }
    fieldFarm[i] = best;
  }

  // Betriebe zusammensetzen
  const fieldsOf: number[][] = Array.from({ length: nFarms }, () => []);
  for (let i = 0; i < f.count; i++) if (fieldFarm[i] >= 0) fieldsOf[fieldFarm[i]].push(i);

  // Hofstellen: Knoten an Ortsstraßen (residential), Raster für Suche
  const resGrid = new Map<number, number[]>();
  const RC = 1000;
  const seen = new Uint8Array(g.nodeCount);
  for (let e = 0; e < g.edgeCount; e++) {
    if (g.edgeClass[e] !== RoadClass.Residential && g.edgeClass[e] !== RoadClass.Unclassified) continue;
    for (const n of [g.edgeU[e], g.edgeV[e]]) {
      if (seen[n]) continue;
      seen[n] = 1;
      const k = key(Math.floor(g.x[n] / RC), Math.floor(g.y[n] / RC));
      let a = resGrid.get(k);
      if (!a) resGrid.set(k, (a = []));
      a.push(n);
    }
  }
  const nearestHome = (x: number, y: number, fallback: number) => {
    const gx = Math.floor(x / RC), gy = Math.floor(y / RC);
    let best = -1, bestD = Infinity;
    for (let r = 1; r <= 5 && best < 0; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        const a = resGrid.get(key(gx + dx, gy + dy));
        if (!a) continue;
        for (const n of a) {
          const ddx = g.x[n] - x, ddy = g.y[n] - y;
          const d = ddx * ddx + ddy * ddy;
          if (d < bestD || (d === bestD && n < best)) { bestD = d; best = n; }
        }
      }
    }
    return best >= 0 ? best : fallback;
  };

  const fieldCrop = new Uint8Array(f.count);
  const farms: Farm[] = [];
  const usedNames = new Set<string>();
  for (let s = 0; s < nFarms; s++) {
    const fl = fieldsOf[s];
    let ha = 0, grass = 0, wx = 0, wy = 0;
    for (const i of fl) {
      ha += f.areaHa[i];
      if (f.kind[i] === FieldKind.Gruenland) grass += f.areaHa[i];
      wx += f.cx[i] * f.areaHa[i];
      wy += f.cy[i] * f.areaHa[i];
    }
    const cx = ha > 0 ? wx / ha : seedX[s];
    const cy = ha > 0 ? wy / ha : seedY[s];
    const grassShare = ha > 0 ? grass / ha : 0;
    const livestock = rng.next() < 0.38 + 0.5 * grassShare;
    const sizeFactor = Math.min(1, ha / 400);
    const mechanization = Math.min(1, Math.max(0, 0.2 + 0.55 * sizeFactor + (rng.next() - 0.5) * 0.4));
    const contact: ContactPreference = rng.next() < 0.5 ? 'anruf' : 'nachricht';

    // Kulturen je Acker-Feld
    const base = isAltmark(cx, cy) ? SHARES_ALTMARK : SHARES_NORTH;
    const w = base.map((v, c) => Math.max(0, v + (livestock ? LIVESTOCK_SHIFT[c] : 0)));
    const sum = w.reduce((a, b) => a + b, 0);
    for (const i of fl) {
      if (f.kind[i] === FieldKind.Gruenland) { fieldCrop[i] = Crop.Gruenland; continue; }
      let r = rng.next() * sum;
      let c = 1;
      for (; c < w.length - 1; c++) { r -= w[c]; if (r < 0) break; }
      fieldCrop[i] = c;
    }

    let name = '';
    for (let tries = 0; tries < 300; tries++) {
      const n = SURNAMES[rng.int(SURNAMES.length)];
      // nach vielen Versuchen immer mit Vornamen-Initial (mehr Kombinationen)
      const form = tries < 30 ? FORMS[rng.int(FORMS.length)] : 'Hof {i}. {n}';
      name = form.replace('{n}', n).replace('{i}', FIRST_INITIALS[rng.int(FIRST_INITIALS.length)]);
      if (!usedNames.has(name)) break;
    }
    if (usedNames.has(name)) name = `${name} ${FIRST_INITIALS[s % FIRST_INITIALS.length]}${FIRST_INITIALS[(s >> 4) % FIRST_INITIALS.length]}`;
    usedNames.add(name);

    const fallbackNode = fl.length ? f.access[fl[0]] : 0;
    farms.push({
      id: s,
      name,
      homeNode: nearestHome(cx, cy, fallbackNode),
      fields: fl,
      areaHa: Math.round(ha * 100) / 100,
      livestock,
      mechanization: Math.round(mechanization * 100) / 100,
      contact,
      known: false,
      satisfaction: 50,
    });
  }
  return { farms, fieldFarm, fieldCrop };
}
