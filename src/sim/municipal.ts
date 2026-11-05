/**
 * Kommunale Arbeiten und Winterdienst (Vorschläge 2 und 3). Gemeinden im Spielgebiet schreiben
 * Böschungsmähen, Heckenschnitt und Wegebau aus und vergeben Winterdienst-Verträge. Gearbeitet wird
 * als Tour über Straßen rund um den Ort (Aufgabe „tour“ im Rechenkern). Werte sind Annahmen.
 */
import type { Service } from './business';

export interface Municipality {
  id: number;
  name: string;
  lonLat: [number, number];
}

/** Kunden-Id für Gemeinden (Rechnungen, Namen): −100 − Index */
export const MUNI_BASE = -100;

export const MUNICIPALITIES: Municipality[] = [
  { id: 0, name: 'Hansestadt Uelzen', lonLat: [10.560, 52.966] },
  { id: 1, name: 'Stadt Bad Bevensen', lonLat: [10.584, 53.079] },
  { id: 2, name: 'Flecken Ebstorf', lonLat: [10.411, 53.028] },
  { id: 3, name: 'Gemeinde Bienenbüttel', lonLat: [10.488, 53.144] },
  { id: 4, name: 'Gemeinde Suderburg', lonLat: [10.450, 52.897] },
  { id: 5, name: 'Gemeinde Rosche', lonLat: [10.747, 52.989] },
  { id: 6, name: 'Flecken Bodenteich', lonLat: [10.687, 52.833] },
  { id: 7, name: 'Gemeinde Wrestedt', lonLat: [10.588, 52.906] },
  { id: 8, name: 'Samtgemeinde Lüchow', lonLat: [11.153, 52.968] },
  { id: 9, name: 'Stadt Wittingen', lonLat: [10.739, 52.728] },
];

/** Tourdienste: Gerät, Arbeitstempo (km/h), Saison (Monat*100+Tag), Preis je km bzw. Stunde */
export type TourService = 'winterdienst' | 'maehen' | 'hecke' | 'wegebau';
export const TOUR_SERVICES: TourService[] = ['winterdienst', 'maehen', 'hecke', 'wegebau'];
export const TOUR: Record<TourService, { name: string; implement: 'streuer' | 'auslegemaeher' | 'astschere' | 'wegehobel'; kmh: number; from: number; to: number; eurKm: number }> = {
  winterdienst: { name: 'Winterdienst', implement: 'streuer', kmh: 25, from: 1101, to: 331, eurKm: 0 },
  maehen: { name: 'Böschungsmähen', implement: 'auslegemaeher', kmh: 4, from: 501, to: 930, eurKm: 60 },
  hecke: { name: 'Heckenschnitt', implement: 'astschere', kmh: 2, from: 1001, to: 228, eurKm: 150 },
  wegebau: { name: 'Wegebau (Wirtschaftswege)', implement: 'wegehobel', kmh: 3, from: 401, to: 1031, eurKm: 400 },
};
/** Winterdienst: Bereitschaft je Monat (Nov–März) und Einsatzstunde (Annahme) */
export const WINTER_STANDBY_MONTH = 1_200;
export const WINTER_EUR_H = 95;
/** Strafe, wenn ein Einsatz nicht binnen 2 Stunden beginnt */
export const WINTER_PENALTY = 300;

export function isTour(s: Service): s is TourService {
  return s === 'winterdienst' || s === 'maehen' || s === 'hecke' || s === 'wegebau';
}

export function inWindow(md: number, from: number, to: number): boolean {
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
}
