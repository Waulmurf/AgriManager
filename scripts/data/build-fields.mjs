#!/usr/bin/env node
// Baut die Felder der Spielregion aus amtlichen Feldblöcken (wo offen lizenziert)
// und OSM-Ackerflächen (wo keine amtlichen Daten vorliegen).
//
// Eingaben (GeoJSONSeq, WGS84):
//   --official NI:ni.geojsonl --official SH:sh.geojsonl ...   amtliche Feldblöcke
//   --osm osm-fields.geojsonl                                 landuse=farmland/meadow
//   --roadgraph roadgraph.bin                                 für die Feldzufahrt
// Ausgaben:
//   --out-bin fields.bin          Format FLD1 (siehe src/sim/fields.ts)
//   --out-geojson fields.geojsonl für tippecanoe (Kartendarstellung)
import { createReadStream, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    official: { type: 'string', multiple: true, default: [] },
    osm: { type: 'string' },
    roadgraph: { type: 'string' },
    'radius-km': { type: 'string', default: '50' },
    'out-bin': { type: 'string' },
    'out-geojson': { type: 'string' },
  },
});

export const SOURCES = { NI: 1, SH: 2, BB: 3, OSM: 4 };
export const KIND = { Acker: 1, Gruenland: 2 };
const MIN_HA = 0.3;
const ACCESS_MAX_M = 400;
const OSM_COVERAGE_M = 1500; // OSM-Fläche nur, wenn kein amtlicher Feldblock in der Nähe

// ---------- Straßengraph (RGR1) lesen ----------
const gb = readFileSync(args.roadgraph);
const gdv = new DataView(gb.buffer, gb.byteOffset, gb.byteLength);
const N = gdv.getUint32(8, true);
const E = gdv.getUint32(12, true);
const LAT0 = gdv.getFloat64(24, true);
const LON0 = gdv.getFloat64(32, true);
const RADIUS_M = Number(args['radius-km']) * 1000;
const base = gb.byteOffset;
const GX = new Float32Array(gb.buffer, base + 64, N);
const GY = new Float32Array(gb.buffer, base + 64 + N * 4, N);
const eOff = base + 64 + N * 8;
const EU = new Uint32Array(gb.buffer, eOff, E);
const EV = new Uint32Array(gb.buffer, eOff + E * 4, E);
const EC = new Uint8Array(gb.buffer, eOff + E * 20, E);

const K = (6371008.8 * Math.PI) / 180;
const COS0 = Math.cos((LAT0 * Math.PI) / 180);
const projX = (lon) => (lon - LON0) * K * COS0;
const projY = (lat) => (lat - LAT0) * K;
const unX = (x) => LON0 + x / (K * COS0);
const unY = (y) => LAT0 + y / K;

// Knoten, die als Feldzufahrt taugen: an Feldwegen, Nebenstraßen, Wirtschaftswegen
// (keine Bundes-/Landesstraßen). Strafaufschlag für Nicht-Feldwege.
const accessPenalty = new Float32Array(N).fill(Infinity);
for (let e = 0; e < E; e++) {
  const c = EC[e];
  const pen = c === 8 ? 0 : c === 5 || c === 7 ? 40 : c === 6 || c === 4 ? 80 : Infinity;
  for (const n of [EU[e], EV[e]]) if (pen < accessPenalty[n]) accessPenalty[n] = pen;
}
const CELL = 250;
const grid = new Map();
const key = (cx, cy) => cx * 100003 + cy;
for (let n = 0; n < N; n++) {
  if (accessPenalty[n] === Infinity) continue;
  const k = key(Math.floor(GX[n] / CELL), Math.floor(GY[n] / CELL));
  let a = grid.get(k);
  if (!a) grid.set(k, (a = []));
  a.push(n);
}
console.log(`Graph: ${N} Knoten, ${E} Kanten, Zufahrtsknoten im Raster: ${[...grid.values()].reduce((s, a) => s + a.length, 0)}`);
function nearestAccess(xs, ys) {
  let best = -1, bestD = Infinity;
  const step = Math.max(1, Math.floor(xs.length / 40));
  for (let i = 0; i < xs.length; i += step) {
    const cx = Math.floor(xs[i] / CELL), cy = Math.floor(ys[i] / CELL);
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      const a = grid.get(key(cx + dx, cy + dy));
      if (!a) continue;
      for (const n of a) {
        const d = Math.hypot(GX[n] - xs[i], GY[n] - ys[i]);
        if (d > ACCESS_MAX_M) continue;
        const score = d + accessPenalty[n];
        if (score < bestD) { bestD = score; best = n; }
      }
    }
  }
  return best;
}

// ---------- Geometrie ----------
function ringArea(xs, ys) {
  let a = 0;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) a += (xs[j] + xs[i]) * (ys[j] - ys[i]);
  return Math.abs(a) / 2;
}
function centroid(xs, ys) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    const f = xs[j] * ys[i] - xs[i] * ys[j];
    a += f; cx += (xs[j] + xs[i]) * f; cy += (ys[j] + ys[i]) * f;
  }
  if (Math.abs(a) < 1e-9) return [xs[0], ys[0]];
  return [cx / (3 * a), cy / (3 * a)];
}
function simplify(xs, ys, tol) {
  const n = xs.length;
  if (n <= 4) return [xs, ys];
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    const dx = xs[b] - xs[a], dy = ys[b] - ys[a];
    const L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (xs[i] - xs[a]) - dx * (ys[i] - ys[a])) / L;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const ox = [], oy = [];
  for (let i = 0; i < n; i++) if (keep[i]) { ox.push(xs[i]); oy.push(ys[i]); }
  return [ox, oy];
}
/** Größte Außenfläche einer (Multi-)Polygon-Geometrie, projiziert, ohne Schlusspunkt. */
function outerRing(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  let best = null, bestA = 0;
  for (const p of polys) {
    const ring = p[0];
    if (!ring || ring.length < 4) continue;
    const xs = [], ys = [];
    for (let i = 0; i < ring.length - 1; i++) { xs.push(projX(ring[i][0])); ys.push(projY(ring[i][1])); }
    const a = ringArea(xs, ys);
    if (a > bestA) { bestA = a; best = [xs, ys]; }
  }
  return best ? { xs: best[0], ys: best[1], area: bestA } : null;
}

function classify(props) {
  const get = (...names) => {
    for (const k of Object.keys(props)) if (names.includes(k.toLowerCase())) return String(props[k] ?? '');
    return '';
  };
  const lu = get('bnk', 'hbn', 'nutzung', 'bnk_txt').trim();
  const id = get('flik', 'fbi', 'id', 'feldblock');
  let kind = 0;
  if (/^AL|acker/i.test(lu)) kind = KIND.Acker;
  else if (/^GL|grünland|gruenland/i.test(lu)) kind = KIND.Gruenland;
  return { kind, id: id.slice(0, 16) };
}

async function* readSeq(file) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (let line of rl) {
    line = line.replace(/^\x1e/, '').trim();
    if (!line) continue;
    try { yield JSON.parse(line); } catch { /* defekte Zeile überspringen */ }
  }
}

// ---------- Einlesen ----------
const fields = []; // {src, kind, id, xs, ys, area, cx, cy}
const coverage = new Map(); // Raster amtlicher Abdeckung (alle Nutzungsarten)
const COV = 500;
const stats = {};

for (const spec of args.official) {
  const [code, file] = spec.split(':');
  const src = SOURCES[code];
  let n = 0, kept = 0;
  for await (const f of readSeq(file)) {
    n++;
    if (!f.geometry) continue;
    const ring = outerRing(f.geometry);
    if (!ring) continue;
    const [cx, cy] = centroid(ring.xs, ring.ys);
    coverage.set(key(Math.floor(cx / COV), Math.floor(cy / COV)), 1);
    const { kind, id } = classify(f.properties ?? {});
    if (!kind || ring.area < MIN_HA * 10000) continue;
    if (Math.hypot(cx, cy) > RADIUS_M) continue;
    fields.push({ src, kind, id: id || `${code}-${n}`, ...ring, cx, cy });
    kept++;
  }
  stats[code] = { gelesen: n, behalten: kept };
}

function covered(cx, cy) {
  const r = Math.ceil(OSM_COVERAGE_M / COV);
  const gx = Math.floor(cx / COV), gy = Math.floor(cy / COV);
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (coverage.has(key(gx + dx, gy + dy))) return true;
  return false;
}

if (args.osm) {
  let n = 0, kept = 0;
  for await (const f of readSeq(args.osm)) {
    n++;
    if (!f.geometry) continue;
    const ring = outerRing(f.geometry);
    if (!ring || ring.area < MIN_HA * 10000) continue;
    const [cx, cy] = centroid(ring.xs, ring.ys);
    if (Math.hypot(cx, cy) > RADIUS_M || covered(cx, cy)) continue;
    const p = f.properties ?? {};
    const kind = p.landuse === 'meadow' ? KIND.Gruenland : KIND.Acker;
    const osmId = `OSM-${String(p['@type'] ?? 'a')[0]}${p['@id'] ?? n}`.slice(0, 16);
    fields.push({ src: SOURCES.OSM, kind, id: osmId, ...ring, cx, cy });
    kept++;
  }
  stats.OSM = { gelesen: n, behalten: kept };
}

// ---------- Zufahrt, Vereinfachen, deterministisch sortieren ----------
let noAccess = 0;
const out = [];
for (const f of fields) {
  // Ring an Punkt 0 und dem davon entferntesten Punkt teilen, beide Hälften vereinfachen
  let far = 0, farD = -1;
  for (let i = 1; i < f.xs.length; i++) {
    const d = Math.hypot(f.xs[i] - f.xs[0], f.ys[i] - f.ys[0]);
    if (d > farD) { farD = d; far = i; }
  }
  const [ax, ay] = simplify(f.xs.slice(0, far + 1), f.ys.slice(0, far + 1), 2.0);
  const [bx, by] = simplify([...f.xs.slice(far), f.xs[0]], [...f.ys.slice(far), f.ys[0]], 2.0);
  const sx = [...ax, ...bx.slice(1, -1)];
  const sy = [...ay, ...by.slice(1, -1)];
  if (sx.length < 3) continue;
  const acc = nearestAccess(sx, sy);
  if (acc < 0) { noAccess++; continue; }
  out.push({ ...f, xs: sx, ys: sy, access: acc });
}
out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.cx - b.cx));

// ---------- FLD1 schreiben ----------
const F = out.length;
const P = out.reduce((s, f) => s + f.xs.length, 0);
const u8Bytes = F * 2 + F * 16;
const pad = (4 - (u8Bytes % 4)) % 4;
const size = 32 + F * 24 + u8Bytes + pad + P * 8;
const buf = new ArrayBuffer(size);
const dv = new DataView(buf);
'FLD1'.split('').forEach((c, i) => dv.setUint8(i, c.charCodeAt(0)));
dv.setUint32(4, 1, true);
dv.setUint32(8, F, true);
dv.setUint32(12, P, true);
dv.setFloat64(16, LAT0, true);
dv.setFloat64(24, LON0, true);
let off = 32;
const f32 = (n) => { const a = new Float32Array(buf, off, n); off += n * 4; return a; };
const u32 = (n) => { const a = new Uint32Array(buf, off, n); off += n * 4; return a; };
const u8 = (n) => { const a = new Uint8Array(buf, off, n); off += n; return a; };
const CX = f32(F), CY = f32(F), AREA = f32(F), ACC = u32(F), PS = u32(F), PC = u32(F);
const KD = u8(F), SR = u8(F), IDS = u8(F * 16);
off += pad;
const PX = f32(P), PY = f32(P);
let p = 0;
const gj = args['out-geojson'] ? createWriteStream(args['out-geojson']) : null;
out.forEach((f, i) => {
  CX[i] = f.cx; CY[i] = f.cy; AREA[i] = f.area / 10000; ACC[i] = f.access;
  PS[i] = p; PC[i] = f.xs.length; KD[i] = f.kind; SR[i] = f.src;
  for (let c = 0; c < 16; c++) IDS[i * 16 + c] = c < f.id.length ? f.id.charCodeAt(c) & 0x7f : 32;
  const coords = [];
  for (let j = 0; j < f.xs.length; j++) {
    PX[p] = f.xs[j]; PY[p] = f.ys[j]; p++;
    coords.push([Math.round(unX(f.xs[j]) * 1e7) / 1e7, Math.round(unY(f.ys[j]) * 1e7) / 1e7]);
  }
  coords.push(coords[0]);
  gj?.write(JSON.stringify({ type: 'Feature', properties: { i, k: f.kind, ha: Math.round(f.area / 100) / 100, s: f.src }, geometry: { type: 'Polygon', coordinates: [coords] } }) + '\n');
});
gj?.end();
if (off !== size) throw new Error(`Größenfehler ${off} != ${size}`);
writeFileSync(args['out-bin'], new Uint8Array(buf));

const haByKind = {};
const bySrc = {};
for (const f of out) {
  haByKind[f.kind] = (haByKind[f.kind] ?? 0) + f.area / 10000;
  bySrc[f.src] = (bySrc[f.src] ?? 0) + 1;
}
console.log('Quellen:', JSON.stringify(stats));
console.log(`Felder: ${F} (ohne Zufahrt verworfen: ${noAccess}), Punkte: ${P}, ${(size / 1e6).toFixed(1)} MB`);
console.log('ha je Art (1=Acker, 2=Grünland):', JSON.stringify(Object.fromEntries(Object.entries(haByKind).map(([k, v]) => [k, Math.round(v)]))));
console.log('Felder je Quelle (1=NI, 2=SH, 3=BB, 4=OSM):', JSON.stringify(bySrc));
