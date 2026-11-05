import { describe, expect, it } from 'vitest';
import { easter, holiday, surchargeFactor, weekday } from '../../src/sim/calendar';

// Spielminute aus Datum (ab 1. März 2027, 06:00)
const at = (dayIndex: number, hour: number) => dayIndex * 1440 + (hour - 6) * 60;

describe('Kalender und Zuschläge', () => {
  it('Ostern und Feiertage', () => {
    expect(easter(2027)).toEqual([3, 28]);
    expect(easter(2028)).toEqual([4, 16]);
    expect(easter(2024)).toEqual([3, 31]);
    expect(holiday(2027, 3, 26)).toBe(1); // Karfreitag
    expect(holiday(2027, 3, 29)).toBe(1); // Ostermontag
    expect(holiday(2027, 5, 6)).toBe(1); // Himmelfahrt
    expect(holiday(2027, 5, 17)).toBe(1); // Pfingstmontag
    expect(holiday(2027, 10, 31)).toBe(1); // Reformationstag (Niedersachsen)
    expect(holiday(2027, 5, 1)).toBe(2);
    expect(holiday(2027, 12, 25)).toBe(2);
    expect(holiday(2027, 6, 15)).toBe(0);
  });

  it('Wochentag und Zuschläge nach § 3b EStG', () => {
    expect(weekday(0)).toBe(0); // Mo 01.03.2027
    expect(weekday(at(6, 10))).toBe(6); // So 07.03.
    expect(surchargeFactor(at(1, 10))).toBe(0); // Di 10 Uhr
    expect(surchargeFactor(at(1, 21))).toBe(0.25); // Di 21 Uhr
    expect(surchargeFactor(at(2, 2))).toBe(0.4); // Mi 02 Uhr (Nacht nach Mitternacht)
    expect(surchargeFactor(at(6, 10))).toBe(0.5); // Sonntag
    expect(surchargeFactor(at(6, 22))).toBe(0.75); // Sonntag + Nacht
    expect(surchargeFactor(at(25, 10))).toBe(1.25); // Karfreitag 26.03.
    expect(surchargeFactor(at(61, 10))).toBe(1.5); // 1. Mai
  });
});
