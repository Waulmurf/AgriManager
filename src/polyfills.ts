/**
 * Kleine Nachrüstungen für ältere WebKit-Versionen (macOS: WKWebView = Safari der jeweiligen
 * macOS-Version). Mindestens nötig sind Safari 15 bzw. macOS 12 (WebGL2, Module-Worker); diese
 * Funktionen kamen erst mit Safari 15.4/16 und werden hier ergänzt, falls sie fehlen.
 * Wird im Hauptfenster und im Simulations-Worker zuerst geladen.
 */

/** tiefe Kopie für einfache Daten (Objekte, Felder, Zahlenfelder, Datum, Map/Set) */
function cloneDeep<T>(v: T, seen = new Map<unknown, unknown>()): T {
  if (v === null || typeof v !== 'object') return v;
  if (seen.has(v)) return seen.get(v) as T;
  if (ArrayBuffer.isView(v)) return (v as unknown as { slice(): T }).slice();
  if (v instanceof Date) return new Date(v.getTime()) as T;
  if (v instanceof Map) {
    const m = new Map();
    seen.set(v, m);
    for (const [k, x] of v) m.set(cloneDeep(k, seen), cloneDeep(x, seen));
    return m as T;
  }
  if (v instanceof Set) {
    const s = new Set();
    seen.set(v, s);
    for (const x of v) s.add(cloneDeep(x, seen));
    return s as T;
  }
  if (Array.isArray(v)) {
    const a: unknown[] = [];
    seen.set(v, a);
    for (const x of v) a.push(cloneDeep(x, seen));
    return a as T;
  }
  const o: Record<string, unknown> = {};
  seen.set(v, o);
  for (const k of Object.keys(v as object)) o[k] = cloneDeep((v as Record<string, unknown>)[k], seen);
  return o as T;
}

const g = globalThis as unknown as { structuredClone?: <T>(v: T) => T };
if (typeof g.structuredClone !== 'function') g.structuredClone = (v) => cloneDeep(v);

// Array.prototype.at (Safari 15.4)
if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    value(this: unknown[], i: number) {
      const n = Math.trunc(i) || 0;
      return this[n < 0 ? this.length + n : n];
    },
    configurable: true,
    writable: true,
  });
}

// CanvasRenderingContext2D.roundRect (Safari 16): einfache Variante mit einem Radius
type Ctx = { roundRect?: (x: number, y: number, w: number, h: number, r?: number) => void; moveTo(x: number, y: number): void; arcTo(a: number, b: number, c: number, d: number, r: number): void; closePath(): void };
const proto = (globalThis as unknown as { CanvasRenderingContext2D?: { prototype: Ctx } }).CanvasRenderingContext2D?.prototype;
if (proto && !proto.roundRect) {
  proto.roundRect = function (this: Ctx, x: number, y: number, w: number, h: number, r = 0) {
    const rr = Math.min(r, w / 2, h / 2);
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
  };
}

/** Prüft, ob die Umgebung das Spiel tragen kann; gibt eine Meldung zurück, wenn nicht */
export function compatibilityProblem(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    if (!c.getContext('webgl2')) return 'Die Grafik (WebGL 2) ist nicht verfügbar. Unter macOS ist mindestens macOS 12 Monterey mit aktuellem Safari nötig, unter Windows ein aktueller Grafiktreiber.';
  } catch {
    return 'Die Grafik (WebGL 2) ist nicht verfügbar.';
  }
  if (typeof Worker === 'undefined') return 'Hintergrundberechnung (Web Worker) wird nicht unterstützt.';
  return null;
}
