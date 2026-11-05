/**
 * Kalender für Löhne: Wochentag, gesetzliche Feiertage in Niedersachsen und Zuschläge nach
 * § 3b EStG (ZU-01, ZU-02). Nur Ganzzahlrechnung, damit plattformgleich.
 */
import { gameDate } from './economy';

/** Wochentag 0 = Montag … 6 = Sonntag (Spielstart 1. März 2027 ist ein Montag) */
export function weekday(minutes: number): number {
  return Math.floor((minutes + 6 * 60) / 1440) % 7;
}

/** Ostersonntag (gregorianisch, anonymer Algorithmus) als [Monat, Tag] */
export function easter(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

const DAYS_BEFORE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
function dayOfYear(year: number, month: number, day: number): number {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return DAYS_BEFORE[month - 1] + day + (leap && month > 2 ? 1 : 0);
}

/**
 * Feiertagsart: 0 kein Feiertag, 1 gesetzlicher Feiertag (125 %), 2 hoher Feiertag (150 %:
 * 25./26.12., 1. Mai; 24.12. ab 14 Uhr – das prüft surchargeFactor).
 */
export function holiday(year: number, month: number, day: number): 0 | 1 | 2 {
  if ((month === 12 && (day === 25 || day === 26)) || (month === 5 && day === 1)) return 2;
  if ((month === 1 && day === 1) || (month === 10 && (day === 3 || day === 31))) return 1;
  const [em, ed] = easter(year);
  const diff = dayOfYear(year, month, day) - dayOfYear(year, em, ed);
  // Karfreitag, Ostersonntag (nur Sonntagszuschlag), Ostermontag, Himmelfahrt, Pfingstmontag
  if (diff === -2 || diff === 1 || diff === 39 || diff === 50) return 1;
  return 0;
}

export function holidayName(minutes: number): string | null {
  const d = gameDate(minutes);
  const h = holiday(d.year, d.month, d.day);
  return h ? 'Feiertag' : null;
}

/**
 * Zuschlag auf den Stundenlohn für eine Arbeitsminute (§ 3b EStG): Nacht 20–6 Uhr 25 %,
 * 0–4 Uhr 40 %; Sonntag 50 %; Feiertag 125 %, hohe Feiertage 150 %. Nacht wird zu Sonntag bzw.
 * Feiertag addiert, Sonntag und Feiertag nicht (ZU-02).
 */
export function surchargeFactor(minutes: number): number {
  const d = gameDate(minutes);
  const h = d.hour;
  const night = h < 4 ? 0.4 : h < 6 || h >= 20 ? 0.25 : 0;
  const hol = holiday(d.year, d.month, d.day);
  let day = 0;
  if (hol === 2 || (d.month === 12 && d.day === 24 && h >= 14)) day = 1.5;
  else if (hol === 1) day = 1.25;
  else if (weekday(minutes) === 6) day = 0.5;
  return night + day;
}
