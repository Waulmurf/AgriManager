/** Baut synthetische Straßengraphen im RGR1-Format für Tests. */
export interface TestEdge {
  u: number;
  v: number;
  cls?: number;
  oneway?: boolean;
  geom?: [number, number][];
}

export function buildRoadGraphBuffer(
  nodes: [number, number][],
  edges: TestEdge[],
  opts: { lat0?: number; lon0?: number; radiusM?: number } = {},
): ArrayBuffer {
  const N = nodes.length, E = edges.length;
  const G = edges.reduce((s, e) => s + (e.geom?.length ?? 0), 0);
  const size = 64 + N * 8 + E * 24 + G * 8;
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  'RGR1'.split('').forEach((c, i) => dv.setUint8(i, c.charCodeAt(0)));
  dv.setUint32(4, 1, true);
  dv.setUint32(8, N, true);
  dv.setUint32(12, E, true);
  dv.setUint32(16, G, true);
  dv.setFloat64(24, opts.lat0 ?? 53.08, true);
  dv.setFloat64(32, opts.lon0 ?? 10.7, true);
  dv.setFloat64(40, opts.radiusM ?? 50000, true);
  let off = 64;
  const f32 = (n: number) => { const a = new Float32Array(buf, off, n); off += n * 4; return a; };
  const u32 = (n: number) => { const a = new Uint32Array(buf, off, n); off += n * 4; return a; };
  const u8 = (n: number) => { const a = new Uint8Array(buf, off, n); off += n; return a; };
  const X = f32(N), Y = f32(N);
  nodes.forEach(([x, y], i) => { X[i] = x; Y[i] = y; });
  const EU = u32(E), EV = u32(E), EL = f32(E), EGS = u32(E), EGC = u32(E);
  const EC = u8(E), EF = u8(E);
  u8(E); u8(E);
  const GX = f32(G), GY = f32(G);
  let g = 0;
  edges.forEach((e, i) => {
    EU[i] = e.u; EV[i] = e.v;
    const pts = [nodes[e.u], ...(e.geom ?? []), nodes[e.v]];
    let len = 0;
    for (let j = 1; j < pts.length; j++) len += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
    EL[i] = len;
    EGS[i] = g;
    EGC[i] = e.geom?.length ?? 0;
    EC[i] = e.cls ?? 5;
    EF[i] = e.oneway ? 1 : 0;
    for (const [x, y] of e.geom ?? []) { GX[g] = x; GY[g] = y; g++; }
  });
  return buf;
}

/** Gitter n×n mit Abstand d Metern, Mitte im Ursprung; jede 3. Kante ein Feldweg. */
export function gridGraph(n = 12, d = 1000): ArrayBuffer {
  const nodes: [number, number][] = [];
  const half = ((n - 1) * d) / 2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) nodes.push([i * d - half, j * d - half]);
  const edges: TestEdge[] = [];
  let k = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      if (i + 1 < n) edges.push({ u: a, v: a + 1, cls: k++ % 3 === 0 ? 8 : 4, geom: [[i * d - half + d / 2, j * d - half + 30]] });
      if (j + 1 < n) edges.push({ u: a, v: a + n, cls: k++ % 3 === 0 ? 8 : 3 });
    }
  }
  return buildRoadGraphBuffer(nodes, edges);
}
