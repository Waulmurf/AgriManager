/**
 * Felder im Binärformat FLD1 (erzeugt von scripts/data/build-fields.mjs).
 *
 * Kopf 32 Byte: "FLD1", u32 Version, u32 Felder F, u32 Punkte P, f64 lat0, f64 lon0.
 * Danach: f32 cx[F], f32 cy[F] (Schwerpunkt, m), f32 areaHa[F], u32 access[F] (Graph-Knoten),
 *   u32 ptStart[F], u32 ptCount[F], u8 kind[F] (1 Acker, 2 Grünland), u8 src[F]
 *   (1 NI, 2 SH, 3 BB, 4 OSM), char id[F*16] (FLIK bzw. OSM-ID, ASCII, mit Leerzeichen
 *   aufgefüllt), Füllbytes bis 4-Byte-Grenze, f32 px[P], f32 py[P] (Außenring, m, offen).
 */

export const FieldKind = { Acker: 1, Gruenland: 2 } as const;
export const FieldSource = { 1: 'Niedersachsen', 2: 'Schleswig-Holstein', 3: 'Brandenburg', 4: 'OpenStreetMap' } as const;

export interface FieldSet {
  count: number;
  cx: Float32Array;
  cy: Float32Array;
  areaHa: Float32Array;
  access: Uint32Array;
  ptStart: Uint32Array;
  ptCount: Uint32Array;
  kind: Uint8Array;
  src: Uint8Array;
  ids: Uint8Array;
  px: Float32Array;
  py: Float32Array;
}

export function parseFields(buffer: ArrayBuffer): FieldSet {
  const dv = new DataView(buffer);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'FLD1') throw new Error(`Keine Felddatei (Kennung ${magic})`);
  if (dv.getUint32(4, true) !== 1) throw new Error('Unbekannte Feld-Version');
  const F = dv.getUint32(8, true);
  const P = dv.getUint32(12, true);
  let off = 32;
  const f32 = (n: number) => { const a = new Float32Array(buffer, off, n); off += n * 4; return a; };
  const u32 = (n: number) => { const a = new Uint32Array(buffer, off, n); off += n * 4; return a; };
  const u8 = (n: number) => { const a = new Uint8Array(buffer, off, n); off += n; return a; };
  const cx = f32(F), cy = f32(F), areaHa = f32(F), access = u32(F), ptStart = u32(F), ptCount = u32(F);
  const kind = u8(F), src = u8(F), ids = u8(F * 16);
  off += (4 - ((F * 18) % 4)) % 4;
  const px = f32(P), py = f32(P);
  if (off !== buffer.byteLength) throw new Error('Felddatei hat unerwartete Länge');
  return { count: F, cx, cy, areaHa, access, ptStart, ptCount, kind, src, ids, px, py };
}

export function fieldId(f: FieldSet, i: number): string {
  let s = '';
  for (let c = 0; c < 16; c++) s += String.fromCharCode(f.ids[i * 16 + c]);
  return s.trimEnd();
}

/**
 * Bahnenmuster über ein Feld (Polygon), parallel zur längsten Kante, Abstand = Arbeitsbreite.
 * Je Bahn wird der Schnitt mit dem Polygon gefahren, Bahnen abwechselnd hin und zurück.
 * Nur +, -, *, / und sqrt – deterministisch auf allen Plattformen.
 * Liefert die Punktfolge (ohne An-/Abfahrt) und die Arbeitslänge auf den Bahnen.
 */
export function fieldPattern(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  width: number,
  maxLanes = 400,
): { xs: number[]; ys: number[]; workLength: number } {
  const n = xs.length;
  // Richtung: längste Kante
  let ux = 1, uy = 0, best = -1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = xs[j] - xs[i], dy = ys[j] - ys[i];
    const l2 = dx * dx + dy * dy;
    if (l2 > best) { best = l2; const l = Math.sqrt(l2); ux = dx / l; uy = dy / l; }
  }
  const vx = -uy, vy = ux; // quer
  // Polygon in (u, v)-Koordinaten
  const us = new Float64Array(n), vs = new Float64Array(n);
  let vmin = Infinity, vmax = -Infinity;
  for (let i = 0; i < n; i++) {
    us[i] = xs[i] * ux + ys[i] * uy;
    vs[i] = xs[i] * vx + ys[i] * vy;
    if (vs[i] < vmin) vmin = vs[i];
    if (vs[i] > vmax) vmax = vs[i];
  }
  let w = width;
  const lanesNeeded = Math.floor((vmax - vmin) / w);
  if (lanesNeeded > maxLanes) w = (vmax - vmin) / maxLanes; // sehr große Felder: gröbere Darstellung
  const outU: number[] = [], outV: number[] = [];
  let work = 0;
  let lane = 0;
  for (let v = vmin + w / 2; v < vmax; v += w, lane++) {
    // Schnittpunkte der Linie v mit den Kanten
    const cuts: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = vs[i], b = vs[j];
      if ((a <= v && b > v) || (b <= v && a > v)) {
        const t = (v - a) / (b - a);
        cuts.push(us[i] + (us[j] - us[i]) * t);
      }
    }
    if (cuts.length < 2) continue;
    cuts.sort((p, q) => p - q);
    // innere Abschnitte: Paare (0,1), (2,3), …
    const segs: [number, number][] = [];
    for (let k = 0; k + 1 < cuts.length; k += 2) if (cuts[k + 1] - cuts[k] > 0.5) segs.push([cuts[k], cuts[k + 1]]);
    if (!segs.length) continue;
    const forward = lane % 2 === 0;
    const ordered = forward ? segs : segs.slice().reverse();
    for (const [a, b] of ordered) {
      const [s, e] = forward ? [a, b] : [b, a];
      outU.push(s, e);
      outV.push(v, v);
      work += b - a;
    }
  }
  const ox: number[] = [], oy: number[] = [];
  for (let i = 0; i < outU.length; i++) {
    ox.push(outU[i] * ux + outV[i] * vx);
    oy.push(outU[i] * uy + outV[i] * vy);
  }
  return { xs: ox, ys: oy, workLength: work };
}

/** Punkt-in-Polygon (für Tests und Auswertung). */
export function pointInPolygon(x: number, y: number, xs: ArrayLike<number>, ys: ArrayLike<number>): boolean {
  let inside = false;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    if (ys[i] > y !== ys[j] > y && x < ((xs[j] - xs[i]) * (y - ys[i])) / (ys[j] - ys[i]) + xs[i]) inside = !inside;
  }
  return inside;
}
