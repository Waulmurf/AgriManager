#!/usr/bin/env node
// Baut aus einer OPL-Datei (osmium, Wege mit Koordinaten) den Straßengraphen
// für Landmaschinen. Ausgabeformat: siehe src/sim/roadgraph.ts (RGR1).
//
// Regeln (Prototyp, siehe docs/anforderungen.md „Routing“):
// - keine Autobahnen und Kraftfahrstraßen (motorroad=yes), da Schlepper < 60 km/h
// - keine Fuß-, Rad-, Reitwege, Treppen, Baustellen
// - access=no/private nur, wenn agricultural/vehicle/motor_vehicle es erlaubt
// - Feldwege (track) erlaubt; Fähren (route=ferry) erlaubt
// - Einbahnstraßen werden beachtet
// - nur die größte zusammenhängende Komponente innerhalb Radius + Rand
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    opl: { type: 'string' },
    lat: { type: 'string' },
    lon: { type: 'string' },
    'radius-km': { type: 'string', default: '50' },
    'margin-km': { type: 'string', default: '5' },
    out: { type: 'string' },
  },
});

const LAT0 = Number(args.lat);
const LON0 = Number(args.lon);
const RADIUS_M = Number(args['radius-km']) * 1000;
const KEEP_M = RADIUS_M + Number(args['margin-km']) * 1000;
const K = (6371008.8 * Math.PI) / 180;
const COS0 = Math.cos((LAT0 * Math.PI) / 180);
const projX = (lon) => (lon - LON0) * K * COS0;
const projY = (lat) => (lat - LAT0) * K;

export const CLASS = {
  trunk: 1, trunk_link: 1,
  primary: 2, primary_link: 2,
  secondary: 3, secondary_link: 3,
  tertiary: 4, tertiary_link: 4,
  unclassified: 5, road: 5,
  residential: 6, living_street: 6,
  service: 7,
  track: 8,
  ferry: 9,
};

const NO = new Set(['no', 'private', 'agricultural_no']);
const YES = new Set(['yes', 'agricultural', 'designated', 'permissive', 'destination', 'delivery', 'forestry']);

function decodeOpl(s) {
  // OPL kodiert Sonderzeichen als %hex%
  return s.replace(/%([0-9a-fA-F]+)%/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function parseTags(s) {
  const tags = {};
  if (!s) return tags;
  for (const kv of s.split(',')) {
    const i = kv.indexOf('=');
    if (i < 0) continue;
    tags[decodeOpl(kv.slice(0, i))] = decodeOpl(kv.slice(i + 1));
  }
  return tags;
}

function allowed(t) {
  let cls;
  if (t.route === 'ferry') {
    cls = CLASS.ferry;
    if (NO.has(t.motor_vehicle) || NO.has(t.vehicle)) return null;
    return cls;
  }
  cls = CLASS[t.highway];
  if (!cls) return null;
  if (t.motorroad === 'yes') return null;
  if (t.area === 'yes') return null;
  const agriOk = YES.has(t.agricultural);
  for (const key of ['access', 'vehicle', 'motor_vehicle']) {
    if (NO.has(t[key]) && !agriOk) {
      // Feldwege mit motor_vehicle=no sind für Landwirtschaft fast immer frei
      if (cls === CLASS.track && key === 'motor_vehicle' && t.agricultural !== 'no') continue;
      return null;
    }
  }
  if (t.service === 'parking_aisle') return null;
  return cls;
}

function parseNumber(v, unit) {
  if (!v) return 0;
  const m = String(v).replace(',', '.').match(/[\d.]+/);
  if (!m) return 0;
  let n = Number(m[0]);
  if (unit === 'width' && /'|ft/.test(v)) n *= 0.3048;
  return n;
}

// ---------- 1. Wege einlesen ----------
const ways = []; // {cls, flags, maxW, maxWidth, nodes: [id...], xs, ys}
const nodeUse = new Map(); // nodeId -> count

const rl = createInterface({ input: createReadStream(args.opl), crlfDelay: Infinity });
let lineCount = 0;
for await (const line of rl) {
  lineCount++;
  if (line[0] !== 'w') continue;
  let tagStr = '';
  let nodeStr = '';
  for (const part of line.split(' ')) {
    if (part[0] === 'T') tagStr = part.slice(1);
    else if (part[0] === 'N') nodeStr = part.slice(1);
  }
  const t = parseTags(tagStr);
  const cls = allowed(t);
  if (!cls || !nodeStr) continue;
  const ids = [];
  const xs = [];
  const ys = [];
  for (const n of nodeStr.split(',')) {
    const m = n.match(/^n(\d+)x(-?[\d.]+)y(-?[\d.]+)$/);
    if (!m) continue; // Knoten ohne Koordinate (außerhalb des Auszugs)
    ids.push(Number(m[1]));
    xs.push(projX(Number(m[2])));
    ys.push(projY(Number(m[3])));
  }
  if (ids.length < 2) continue;
  let oneway = t.oneway === 'yes' || t.oneway === 'true' || t.oneway === '1' || t.junction === 'roundabout' || t.junction === 'circular';
  if (t.oneway === '-1') {
    oneway = true;
    ids.reverse(); xs.reverse(); ys.reverse();
  }
  if (t.oneway === 'no') oneway = false;
  let flags = 0;
  if (oneway) flags |= 1;
  if (t.bridge && t.bridge !== 'no') flags |= 2;
  if (t.tunnel && t.tunnel !== 'no') flags |= 4;
  const maxW = Math.min(255, Math.round(parseNumber(t.maxweight || t['maxweight:hgv'])));
  const maxWidth = Math.min(255, Math.round(parseNumber(t.maxwidth || t['maxwidth:physical'], 'width') * 10));
  ways.push({ cls, flags, maxW, maxWidth, ids, xs, ys });
  for (let i = 0; i < ids.length; i++) {
    const c = nodeUse.get(ids[i]) || 0;
    // Endpunkte zählen doppelt, damit sie immer Knoten werden
    nodeUse.set(ids[i], c + (i === 0 || i === ids.length - 1 ? 2 : 1));
  }
}
console.log(`OPL-Zeilen: ${lineCount}, nutzbare Wege: ${ways.length}`);

// ---------- 2. An Kreuzungen aufteilen ----------
const vIndex = new Map(); // osm node id -> vertex index
const vx = [];
const vy = [];
function vertex(id, x, y) {
  let i = vIndex.get(id);
  if (i === undefined) {
    i = vx.length;
    vIndex.set(id, i);
    vx.push(x);
    vy.push(y);
  }
  return i;
}

const edges = []; // {u, v, len, cls, flags, maxW, maxWidth, gx: [], gy: []}
for (const w of ways) {
  let start = 0;
  for (let i = 1; i < w.ids.length; i++) {
    const isVertex = i === w.ids.length - 1 || nodeUse.get(w.ids[i]) >= 2;
    if (!isVertex) continue;
    const u = vertex(w.ids[start], w.xs[start], w.ys[start]);
    const v = vertex(w.ids[i], w.xs[i], w.ys[i]);
    let len = 0;
    for (let j = start + 1; j <= i; j++) len += Math.hypot(w.xs[j] - w.xs[j - 1], w.ys[j] - w.ys[j - 1]);
    if (u !== v || len > 0) {
      edges.push({
        u, v, len, cls: w.cls, flags: w.flags, maxW: w.maxW, maxWidth: w.maxWidth,
        gx: w.xs.slice(start + 1, i), gy: w.ys.slice(start + 1, i),
      });
    }
    start = i;
  }
}
console.log(`Knoten: ${vx.length}, Kanten: ${edges.length}`);

// ---------- 3. Zuschneiden auf Radius + Rand ----------
const inside = (i) => Math.hypot(vx[i], vy[i]) <= KEEP_M;
let kept = edges.filter((e) => (inside(e.u) || inside(e.v)) && e.u !== e.v);

// ---------- 4. Größte Komponente ----------
const parent = new Int32Array(vx.length).map((_, i) => i);
const find = (a) => {
  while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
  return a;
};
for (const e of kept) {
  const a = find(e.u), b = find(e.v);
  if (a !== b) parent[a] = b;
}
const compSize = new Map();
for (const e of kept) {
  const r = find(e.u);
  compSize.set(r, (compSize.get(r) || 0) + 1);
}
let bestRoot = -1, bestSize = 0;
for (const [r, s] of compSize) if (s > bestSize) { bestRoot = r; bestSize = s; }
kept = kept.filter((e) => find(e.u) === bestRoot);
console.log(`Kanten in größter Komponente: ${kept.length}`);

// ---------- 5. Geometrie vereinfachen (Douglas-Peucker, 1,5 m) ----------
function simplify(xs, ys, tol) {
  const n = xs.length;
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
    if (maxD > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const ox = [], oy = [];
  for (let i = 1; i < n - 1; i++) if (keep[i]) { ox.push(xs[i]); oy.push(ys[i]); }
  return [ox, oy];
}

// ---------- 6. Knoten neu nummerieren und schreiben ----------
const remap = new Int32Array(vx.length).fill(-1);
const nx = [], ny = [];
for (const e of kept) {
  for (const k of [e.u, e.v]) {
    if (remap[k] < 0) { remap[k] = nx.length; nx.push(vx[k]); ny.push(vy[k]); }
  }
}
let geomCount = 0;
for (const e of kept) {
  const xs = [vx[e.u], ...e.gx, vx[e.v]];
  const ys = [vy[e.u], ...e.gy, vy[e.v]];
  [e.gx, e.gy] = simplify(xs, ys, 1.5);
  geomCount += e.gx.length;
}

const N = nx.length, E = kept.length, G = geomCount;
const HEADER = 64;
const size = HEADER + N * 8 + E * (4 * 5 + 4) + G * 8;
const buf = new ArrayBuffer(size);
const dv = new DataView(buf);
'RGR1'.split('').forEach((c, i) => dv.setUint8(i, c.charCodeAt(0)));
dv.setUint32(4, 1, true);
dv.setUint32(8, N, true);
dv.setUint32(12, E, true);
dv.setUint32(16, G, true);
dv.setFloat64(24, LAT0, true);
dv.setFloat64(32, LON0, true);
dv.setFloat64(40, RADIUS_M, true);

let off = HEADER;
const f32 = (n) => { const a = new Float32Array(buf, off, n); off += n * 4; return a; };
const u32 = (n) => { const a = new Uint32Array(buf, off, n); off += n * 4; return a; };
const u8 = (n) => { const a = new Uint8Array(buf, off, n); off += n; return a; };

const X = f32(N), Y = f32(N);
X.set(nx); Y.set(ny);
const EU = u32(E), EV = u32(E), EL = f32(E), EGS = u32(E), EGC = u32(E);
const EC = u8(E), EF = u8(E), EMW = u8(E), EMWI = u8(E);
// Geometrie-Abschnitt beginnt an 4-Byte-Grenze (E*4 Bytes u8 ist immer aligned)
const GX = f32(G), GY = f32(G);
let g = 0;
kept.forEach((e, i) => {
  EU[i] = remap[e.u];
  EV[i] = remap[e.v];
  EL[i] = e.len;
  EGS[i] = g;
  EGC[i] = e.gx.length;
  EC[i] = e.cls;
  EF[i] = e.flags;
  EMW[i] = e.maxW;
  EMWI[i] = e.maxWidth;
  for (let j = 0; j < e.gx.length; j++) { GX[g] = e.gx[j]; GY[g] = e.gy[j]; g++; }
});
if (off !== size) throw new Error(`Größenfehler ${off} != ${size}`);
writeFileSync(args.out, new Uint8Array(buf));

const byClass = {};
for (const e of kept) byClass[e.cls] = (byClass[e.cls] || 0) + e.len / 1000;
console.log(`geschrieben: ${args.out} (${(size / 1e6).toFixed(1)} MB) Knoten=${N} Kanten=${E} Geometriepunkte=${G}`);
console.log('km je Klasse:', Object.fromEntries(Object.entries(byClass).map(([k, v]) => [k, Math.round(v)])));
