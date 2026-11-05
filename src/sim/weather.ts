/**
 * Wetter (Phase 4, Schritt 2): ein Wert je Tag für das ganze Spielgebiet, deterministisch aus
 * dem Seed. Monatswerte der DWD-Station Uelzen (Niederschlag und Regentage laut wetterdienst.de),
 * Temperaturen als Annahme für die Lüneburger Heide.
 *
 * Bodenfeuchte als einfacher Speicher (mm im Oberboden, sandige Böden um Uelzen trocknen
 * schnell ab). Feldarbeit ruht bei Starkregen ab Regenbeginn, bei nassem oder gefrorenem
 * Boden. Nur + − × ÷ im Zustand.
 */
import { Rng } from './rng';
import { gameDate } from './economy';

/** Niederschlag (mm) und Regentage je Monat, Januar–Dezember (Station Uelzen) */
const RAIN_MM = [66, 63, 32, 40, 56, 71, 75, 55, 52, 58, 61, 67];
const RAIN_DAYS = [19, 15, 12, 13, 13, 13, 18, 13, 12, 18, 19, 19];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Tagesmitteltemperatur je Monat (°C, Annahme) */
const TEMP = [1, 1.5, 4.5, 9, 13, 16, 18, 17.5, 14, 9.5, 5, 2];

/** Speicher Oberboden (mm) und Schwelle „zu nass“ */
export const SOIL_MAX = 40;
export const SOIL_WET = 30;
/** Starkregen: ab dieser Tagesmenge ruht die Feldarbeit ab Regenbeginn */
export const HEAVY_RAIN_MM = 5;

export interface DayWeather {
  /** Regen (mm) und Beginn (Minute ab 06:00, -1 = trocken) */
  rain: number;
  rainFrom: number;
  /** Tagesmittel (°C) */
  temp: number;
  /** Bodenfeuchte am Morgen (mm im Oberboden) */
  soil: number;
  /** Boden gefroren (Bodenbearbeitung nicht möglich) */
  frost: boolean;
}

export class Weather {
  private rng: Rng;
  private days: DayWeather[] = [];
  private soil = 18;
  private wetYesterday = false;
  private tempAnomaly = 0;

  constructor(seed: number) {
    this.rng = new Rng(seed ^ 0x77ea7);
  }

  /** Wetter des Spieltags (Tag 0 = 1. März 2027) */
  day(index: number): DayWeather {
    while (this.days.length <= index) this.generate(this.days.length);
    return this.days[index];
  }

  private generate(index: number) {
    const mo = gameDate(index * 1440).month - 1;
    const r = this.rng;
    // Regen als Markow-Kette: nach einem Regentag ist Regen wahrscheinlicher
    const p = RAIN_DAYS[mo] / MONTH_DAYS[mo];
    const pWet = this.wetYesterday ? p + 0.3 * (1 - p) : p * 0.7;
    const wet = r.next() < pWet;
    // Menge: schiefe Verteilung mit Mittelwert = Monatssumme / Regentage (E[3u²] = 1)
    const u = r.next();
    const rain = wet ? Math.round((RAIN_MM[mo] / RAIN_DAYS[mo]) * 3 * u * u * 10) / 10 : 0;
    const rainFrom = wet ? r.int(16 * 60) : -1;
    // Temperatur: Monatsmittel + träge Abweichung
    this.tempAnomaly = this.tempAnomaly * 0.8 + (r.next() - 0.5) * 3;
    const temp = Math.round((TEMP[mo] + this.tempAnomaly) * 10) / 10;
    const frost = temp < -1.5;
    const soilMorning = Math.round(this.soil * 10) / 10;
    this.days.push({ rain, rainFrom, temp, soil: soilMorning, frost });
    // Bodenfeuchte zum nächsten Morgen: Regen rein, Verdunstung (0,3–4 mm am Tag) und
    // Versickerung raus (Sand: 12 % des Überschusses über 20 mm je Tag)
    const evap = Math.max(0.3, Math.min(4, 0.4 + 0.17 * temp));
    const drain = Math.max(0, this.soil - 20) * 0.12;
    this.soil = Math.max(0, Math.min(SOIL_MAX, this.soil + rain * 0.9 - evap - drain));
    this.wetYesterday = wet;
  }

  /** Feldarbeit (Bodenbearbeitung) zur Spielminute möglich? Sonst Grund */
  fieldBlocked(time: number): string | null {
    const idx = Math.floor(time / 1440);
    const w = this.day(idx);
    const minute = time - idx * 1440;
    if (w.frost) return 'Boden gefroren';
    if (w.soil > SOIL_WET) return 'Boden zu nass';
    if (idx > 0 && this.day(idx - 1).rain >= 10) return 'Boden nach Starkregen zu nass';
    if (w.rain >= HEAVY_RAIN_MM && w.rainFrom >= 0 && minute >= w.rainFrom) return 'Starkregen';
    return null;
  }

  /** Ganzer Arbeitstag gesperrt (für Planung und Schätzung)? */
  dayBlocked(index: number): boolean {
    const w = this.day(index);
    if (index > 0 && this.day(index - 1).rain >= 10) return true;
    return w.frost || w.soil > SOIL_WET || (w.rain >= HEAVY_RAIN_MM && w.rainFrom >= 0 && w.rainFrom < 3 * 60);
  }

  /** Arbeitstempo bei feuchtem Boden (AK-07): ab 25 mm etwas langsamer */
  speedFactor(time: number): number {
    return this.day(Math.floor(time / 1440)).soil > 25 ? 0.9 : 1;
  }

  /**
   * Vorhersage ab Tag `from` über `n` Tage: Regenwahrscheinlichkeit und Menge, unsicherer je
   * weiter weg (aus dem tatsächlichen künftigen Wetter mit Rauschen, ohne den Zufallsstrom
   * der Simulation zu berühren).
   */
  forecast(from: number, n: number): { day: number; rainChance: number; rainMm: number; temp: number; blocked: boolean }[] {
    const out = [];
    for (let k = 0; k < n; k++) {
      const w = this.day(from + k);
      // deterministisches Rauschen aus dem Tagesindex
      const h = ((from + k) * 2654435761) % 1000 / 1000;
      const sure = 1 - k * 0.12;
      const base = w.rain > 0 ? 0.55 + 0.4 * Math.min(1, w.rain / 8) : 0.08;
      const chance = Math.max(0, Math.min(1, base * sure + (1 - sure) * h));
      out.push({ day: from + k, rainChance: Math.round(chance * 10) * 10, rainMm: Math.round(w.rain * (0.7 + 0.6 * h)), temp: Math.round(w.temp + (h - 0.5) * 2 * k * 0.5), blocked: this.dayBlocked(from + k) });
    }
    return out;
  }

  serialize() {
    return { rng: this.rng.getState(), days: this.days, soil: this.soil, wetYesterday: this.wetYesterday, tempAnomaly: this.tempAnomaly };
  }

  restore(s: ReturnType<Weather['serialize']>) {
    this.rng.setState(s.rng);
    this.days = s.days.map((d) => ({ ...d }));
    this.soil = s.soil;
    this.wetYesterday = s.wetYesterday;
    this.tempAnomaly = s.tempAnomaly;
  }
}
