/** Spielkalender: Minute 0 = Montag, 1. März 2027, 06:00 (Annahme für den Prototyp). */
const START_UTC = Date.UTC(2027, 2, 1, 6, 0);
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function formatGameTime(minutes: number): { date: string; time: string; day: number } {
  const d = new Date(START_UTC + Math.floor(minutes) * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${WEEKDAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
    day: Math.floor(minutes / 1440) + 1,
  };
}
