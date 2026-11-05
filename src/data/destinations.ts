/**
 * Abladestellen für Transporte (Plan Vorschlag 1). Zuckerfabrik Uelzen (Nordzucker), Lage
 * angenähert; Landhandel/Getreidelager erfunden, an echten Orten (Ortsmitte, Annahme).
 */
export interface Destination {
  key: string;
  name: string;
  lonLat: [number, number];
  /** was dort angenommen wird */
  goods: ('rueben' | 'korn')[];
  /** Abladen inkl. Waage und Probe (min) */
  unloadMin: number;
}

export const DESTINATIONS: Destination[] = [
  { key: 'nz-uelzen', name: 'Zuckerfabrik Uelzen', lonLat: [10.585, 52.982], goods: ['rueben'], unloadMin: 20 },
  { key: 'lh-uelzen', name: 'Getreidelager Uelzen', lonLat: [10.548, 52.958], goods: ['korn'], unloadMin: 15 },
  { key: 'lh-bevensen', name: 'Landhandel Bad Bevensen', lonLat: [10.590, 53.083], goods: ['korn'], unloadMin: 15 },
  { key: 'lh-luechow', name: 'Landhandel Lüchow', lonLat: [11.150, 52.972], goods: ['korn'], unloadMin: 15 },
  { key: 'lh-wittingen', name: 'Landhandel Wittingen', lonLat: [10.728, 52.731], goods: ['korn'], unloadMin: 15 },
  { key: 'lh-salzwedel', name: 'Landhandel Salzwedel', lonLat: [11.142, 52.846], goods: ['korn'], unloadMin: 15 },
];
