/** Nachrichten zwischen Oberfläche und Simulations-Worker. */
import type { VehicleInfo } from './engine';

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
