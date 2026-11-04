import { describe, expect, it } from 'vitest';
import { formatGameTime } from '../../src/game/clock';

describe('Spieluhr', () => {
  it('beginnt am Montag, 1. März 2027, 06:00', () => {
    expect(formatGameTime(0)).toEqual({ date: 'Mo, 01.03.2027', time: '06:00', day: 1 });
  });
  it('zählt Minuten und Tage weiter', () => {
    expect(formatGameTime(18 * 60 + 5)).toEqual({ date: 'Di, 02.03.2027', time: '00:05', day: 1 });
    expect(formatGameTime(1440 * 31).date).toBe('Do, 01.04.2027');
  });
});
