/** Nachrichten zwischen Oberfläche und Simulations-Worker. */
import type { VehicleInfo } from './engine';
import type { Company } from './economy';
import type { ContactPreference } from './farms';

/** Spielminuten pro Sekunde Echtzeit bei 1x. 10x/100x vervielfachen die Schrittzahl. */
export const STEPS_PER_SECOND_AT_1X = 1;
/** Höchstens so viele Positionsmeldungen pro Sekunde an die Oberfläche */
export const MAX_SNAPSHOTS_PER_SECOND = 10;

export type Speed = 0 | 1 | 10 | 100;

export type ToWorker =
  | { type: 'init'; graph: ArrayBuffer; fields?: ArrayBuffer; seed: number; vehicleCount: number }
  | { type: 'speed'; speed: Speed }
  | { type: 'stepOnce' };

export interface WireRoute {
  id: number;
  kind: 'road' | 'field';
  /** [lon, lat] abwechselnd (Float64) */
  coords: Float64Array;
  /** kumulierte Distanz je Punkt (m) */
  cum: Float64Array;
}

/** Kurzfassung eines Kundenbetriebs für die Oberfläche */
export interface FarmSummary {
  id: number;
  name: string;
  /** Hofstelle [lon, lat] */
  home: [number, number];
  areaHa: number;
  fieldCount: number;
  livestock: boolean;
  mechanization: number;
  contact: ContactPreference;
  known: boolean;
  satisfaction: number;
  /** Fläche je Kultur (Index = Crop) in ha */
  cropHa: number[];
}

export interface WorkerStats {
  /** tatsächlich erreichte Schritte pro Sekunde (gleitend) */
  stepsPerSecond: number;
  /** Rechenzeit pro Schritt in ms (gleitend) */
  msPerStep: number;
  driving: number;
  working: number;
  waiting: number;
  trips: number;
  searches: number;
  cacheHits: number;
}

export type FromWorker =
  | {
      type: 'ready';
      vehicles: VehicleInfo[];
      home: [number, number];
      center: [number, number];
      radiusM: number;
      nodeCount: number;
      edgeCount: number;
      fieldCount: number;
      company: Company;
      farms: FarmSummary[];
      /** je Feld: Betrieb oder -1 (leer ohne Felddaten) */
      fieldFarm: Int32Array;
      /** je Feld: Kultur */
      fieldCrop: Uint8Array;
    }
  | {
      type: 'tick';
      /** Spielzeit (Minuten) dieses Schnappschusses */
      time: number;
      speed: Speed;
      /** je Fahrzeug [routeId, Distanz, Zustand, Feld-Index oder -1] */
      positions: Float64Array;
      routes: WireRoute[];
      stats: WorkerStats;
    }
  | { type: 'error'; message: string };
