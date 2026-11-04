/**
 * Straßengraph im Binärformat RGR1 (erzeugt von scripts/data/build-roadgraph.mjs).
 *
 * Layout (little endian), Kopf 64 Byte:
 *   0  "RGR1"   4  u32 Version   8  u32 Knoten N   12 u32 Kanten E
 *   16 u32 Geometriepunkte G      24 f64 lat0       32 f64 lon0     40 f64 Radius (m)
 * Danach: f32 X[N], f32 Y[N] (Meter, lokale Projektion um lat0/lon0),
 *   u32 U[E], u32 V[E], f32 Länge[E], u32 GeomStart[E], u32 GeomAnzahl[E],
 *   u8 Klasse[E], u8 Flags[E], u8 MaxGewicht_t[E], u8 MaxBreite_dm[E],
 *   f32 GX[G], f32 GY[G] (Zwischenpunkte der Kanten, ohne Endpunkte).
 * Flags: Bit 0 Einbahn (nur U→V), Bit 1 Brücke, Bit 2 Tunnel.
 */

export const RoadClass = {
  Trunk: 1,
  Primary: 2,
  Secondary: 3,
  Tertiary: 4,
  Unclassified: 5,
  Residential: 6,
  Service: 7,
  Track: 8,
  Ferry: 9,
} as const;

export interface RoadGraph {
  nodeCount: number;
  edgeCount: number;
  lat0: number;
  lon0: number;
  radiusM: number;
  x: Float32Array;
  y: Float32Array;
  edgeU: Uint32Array;
  edgeV: Uint32Array;
  edgeLen: Float32Array;
  edgeGeomStart: Uint32Array;
  edgeGeomCount: Uint32Array;
  edgeClass: Uint8Array;
  edgeFlags: Uint8Array;
  edgeMaxWeight: Uint8Array;
  edgeMaxWidth: Uint8Array;
  geomX: Float32Array;
  geomY: Float32Array;
  /** CSR-Nachbarschaft: für Knoten n die Einträge adjStart[n] .. adjStart[n+1]-1 */
  adjStart: Uint32Array;
  /** Gerichtete Kante als edgeId*2 + Richtung (0 = U→V, 1 = V→U) */
  adjDirEdge: Uint32Array;
  adjTo: Uint32Array;
}

const EARTH_K = (6371008.8 * Math.PI) / 180;

export function parseRoadGraph(buffer: ArrayBuffer): RoadGraph {
  const dv = new DataView(buffer);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'RGR1') throw new Error(`Kein Straßengraph (Kennung ${magic})`);
  const version = dv.getUint32(4, true);
  if (version !== 1) throw new Error(`Unbekannte Graph-Version ${version}`);
  const N = dv.getUint32(8, true);
  const E = dv.getUint32(12, true);
  const G = dv.getUint32(16, true);
  let off = 64;
  const f32 = (n: number) => { const a = new Float32Array(buffer, off, n); off += n * 4; return a; };
  const u32 = (n: number) => { const a = new Uint32Array(buffer, off, n); off += n * 4; return a; };
  const u8 = (n: number) => { const a = new Uint8Array(buffer, off, n); off += n; return a; };
  const x = f32(N), y = f32(N);
  const edgeU = u32(E), edgeV = u32(E), edgeLen = f32(E), edgeGeomStart = u32(E), edgeGeomCount = u32(E);
  const edgeClass = u8(E), edgeFlags = u8(E), edgeMaxWeight = u8(E), edgeMaxWidth = u8(E);
  const geomX = f32(G), geomY = f32(G);
  if (off !== buffer.byteLength) throw new Error('Straßengraph hat unerwartete Länge');

  // CSR aufbauen (deterministisch: Kanten in Dateireihenfolge)
  const degree = new Uint32Array(N + 1);
  for (let e = 0; e < E; e++) {
    degree[edgeU[e]]++;
    if (!(edgeFlags[e] & 1)) degree[edgeV[e]]++;
  }
  const adjStart = new Uint32Array(N + 1);
  for (let n = 0; n < N; n++) adjStart[n + 1] = adjStart[n] + degree[n];
  const fill = adjStart.slice(0, N);
  const total = adjStart[N];
  const adjDirEdge = new Uint32Array(total);
  const adjTo = new Uint32Array(total);
  for (let e = 0; e < E; e++) {
    const u = edgeU[e], v = edgeV[e];
    let i = fill[u]++;
    adjDirEdge[i] = e * 2;
    adjTo[i] = v;
    if (!(edgeFlags[e] & 1)) {
      i = fill[v]++;
      adjDirEdge[i] = e * 2 + 1;
      adjTo[i] = u;
    }
  }

  return {
    nodeCount: N, edgeCount: E,
    lat0: dv.getFloat64(24, true), lon0: dv.getFloat64(32, true), radiusM: dv.getFloat64(40, true),
    x, y, edgeU, edgeV, edgeLen, edgeGeomStart, edgeGeomCount, edgeClass, edgeFlags,
    edgeMaxWeight, edgeMaxWidth, geomX, geomY, adjStart, adjDirEdge, adjTo,
  };
}

/** Lokale Meter → [lon, lat] (Umkehrung der Projektion beim Bauen). */
export function unproject(g: Pick<RoadGraph, 'lat0' | 'lon0'>, x: number, y: number): [number, number] {
  const cos0 = Math.cos((g.lat0 * Math.PI) / 180);
  return [g.lon0 + x / (EARTH_K * cos0), g.lat0 + y / EARTH_K];
}

export function project(g: Pick<RoadGraph, 'lat0' | 'lon0'>, lon: number, lat: number): [number, number] {
  const cos0 = Math.cos((g.lat0 * Math.PI) / 180);
  return [(lon - g.lon0) * EARTH_K * cos0, (lat - g.lat0) * EARTH_K];
}

/** Hängt die Punkte einer gerichteten Kante an (ohne Startpunkt) – xs/ys in Metern. */
export function appendEdgePoints(g: RoadGraph, dirEdge: number, xs: number[], ys: number[]): void {
  const e = dirEdge >>> 1;
  const rev = dirEdge & 1;
  const s = g.edgeGeomStart[e];
  const c = g.edgeGeomCount[e];
  if (!rev) {
    for (let i = 0; i < c; i++) { xs.push(g.geomX[s + i]); ys.push(g.geomY[s + i]); }
    xs.push(g.x[g.edgeV[e]]); ys.push(g.y[g.edgeV[e]]);
  } else {
    for (let i = c - 1; i >= 0; i--) { xs.push(g.geomX[s + i]); ys.push(g.geomY[s + i]); }
    xs.push(g.x[g.edgeU[e]]); ys.push(g.y[g.edgeU[e]]);
  }
}

/** Nächster Knoten zu (x, y) – lineare Suche, nur für Initialisierung. */
export function nearestNode(g: RoadGraph, x: number, y: number): number {
  let best = 0, bestD = Infinity;
  for (let n = 0; n < g.nodeCount; n++) {
    const dx = g.x[n] - x, dy = g.y[n] - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}
