/** Nachrichten zwischen Oberfläche und Simulations-Worker. */
import type { JobEstimate, PlanBar, PlayerUnitInfo, SaveState, VehicleInfo } from './engine';
import type { Competitor } from './market';
import type { Company } from './economy';
import type { ContactPreference } from './farms';
import type { Analytics, BiogasPlant, Lease, LeaseOffer } from './business';
import type { Applicant, Command, Delivery, StaffRequest, YearResult, GameEvent, Invoice, LedgerEntry, Order, QueueItem, Request } from './business';
import type { MarketOffer } from './economy';

/** Spielminuten pro Sekunde Echtzeit bei 1x. 10x/100x vervielfachen die Schrittzahl. */
export const STEPS_PER_SECOND_AT_1X = 1;
/** Höchstens so viele Positionsmeldungen pro Sekunde an die Oberfläche */
export const MAX_SNAPSHOTS_PER_SECOND = 10;

export type Speed = 0 | 1 | 10 | 100;

export type ToWorker =
  | { type: 'init'; graph: ArrayBuffer; fields?: ArrayBuffer; seed: number; vehicleCount: number }
  | { type: 'speed'; speed: Speed }
  | { type: 'stepOnce' }
  | { type: 'command'; id: number; cmd: Command }
  | { type: 'save'; id: number }
  | { type: 'load'; id: number; state: SaveState };

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

/** Geschäftszustand für die Oberfläche (bei Änderung gesendet) */
export interface BusinessState {
  time: number;
  company: Company;
  requests: Request[];
  orders: Order[];
  offers: MarketOffer[];
  units: PlayerUnitInfo[];
  /** heutige Arbeitszeit des Chefs (min) und Höchstwert */
  chefMinutes: number;
  chefMaxMinutes: number;
  dieselTotalL: number;
  chefBusy: string | null;
  /** geplante Aufgaben je Fahrer (driverId im Eintrag) */
  queue: QueueItem[];
  /** heutige Arbeitsminuten und aktuelle Aufgabe je Mitarbeiter */
  driverMinutes: Record<number, number>;
  driverStatus: Record<number, string | null>;
  applicants: Applicant[];
  staffRequests: StaffRequest[];
  agencyPool: Applicant[];
  /** bestellte Neumaschinen, Rabatt je Händler, aktueller Wert je eigener Maschine */
  deliveries: Delivery[];
  discounts: Record<number, number>;
  machineValues: Record<number, number>;
  /** Markt (Phase 5): Ruf, gewonnen/verloren, Konkurrenten, Stammkunden */
  market: { reputation: number; won: number; lost: number; competitors: Competitor[]; loyalFarms: number[] };
  /** Pacht und eigener Ackerbau: offene Angebote (ohne verdecktes Konkurrenzgebot), eigene Pachtflächen */
  farming: { offers: (Omit<LeaseOffer, 'competitorBid'> & { center: [number, number] })[]; leases: (Lease & { center: [number, number] })[] };
  /** Auswertung (Vorschlag 13) */
  analytics: Analytics;
  /** eigene Biogasanlage (PB-07 bis PB-10) */
  biogas: BiogasPlant | null;
  /** Wetter (Phase 4, Schritt 2): heute und Vorhersage */
  weather: {
    temp: number; rain: number; rainFrom: number; soil: number; frost: boolean; blocked: string | null;
    forecast: { day: number; rainChance: number; rainMm: number; temp: number; blocked: boolean }[];
  };
  /** Finanzen (Phase 4): Dieselpreis, laufendes Jahr, Jahresabschlüsse, Steuer, Bilanz */
  dieselPrice: number;
  yearNow: { revenue: number; expenses: number; afa: number; profit: number };
  years: YearResult[];
  taxDue: { amount: number; at: number; year: number } | null;
  balance: { assets: number; debt: number; equity: number; machines: number };
  /** Konditionen für neue Darlehen und Leasing je Laufzeit (Bonität eingerechnet) */
  loanRates: Record<number, number>;
  leaseRates: Record<number, number>;
  /** Planungsboard: Balken je Fahrer */
  plan: PlanBar[];
  /** Maschinen gerade im Einsatz */
  busyMachines: number[];
  /** Zeitschätzung je offener Anfrage bzw. offenem Auftrag (Schlüssel = ID) */
  estimates: Record<number, JobEstimate>;
  /** Kunden bei der Konkurrenz bzw. in der Probephase (nur kleine Aufträge) */
  rivalFarms: number[];
  trialFarms: number[];
  knownFarms: number[];
  satisfaction: Record<number, number>;
  events: GameEvent[];
  invoices: Invoice[];
  /** letzte Buchungen (neueste zuletzt) */
  ledger: LedgerEntry[];
  /** Auswertung je Auftrag (WF-09) */
  results: Record<number, { revenue: number; diesel: number; machines: number; margin: number }>;
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
  | { type: 'vehicles'; vehicles: VehicleInfo[] }
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
  | { type: 'business'; state: BusinessState }
  | { type: 'commandResult'; id: number; message: string }
  | { type: 'saveData'; id: number; state: SaveState }
  | { type: 'loaded'; id: number; ok: boolean; message: string }
  | { type: 'error'; message: string };
