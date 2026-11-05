/** FLD1-Datei für Tests: Rechteck-Felder an einem Gitter-Graphen */
export function buildFieldsBuffer(polys: [number, number][][], access: number[], kinds?: number[]): ArrayBuffer {
  const F = polys.length, P = polys.reduce((s, p) => s + p.length, 0);
  const pad = (4 - ((F * 18) % 4)) % 4;
  const buf = new ArrayBuffer(32 + F * 24 + F * 18 + pad + P * 8);
  const dv = new DataView(buf);
  'FLD1'.split('').forEach((c, i) => dv.setUint8(i, c.charCodeAt(0)));
  dv.setUint32(4, 1, true); dv.setUint32(8, F, true); dv.setUint32(12, P, true);
  let off = 32;
  const f32 = (n: number) => { const a = new Float32Array(buf, off, n); off += n * 4; return a; };
  const u32 = (n: number) => { const a = new Uint32Array(buf, off, n); off += n * 4; return a; };
  const u8 = (n: number) => { const a = new Uint8Array(buf, off, n); off += n; return a; };
  const cx = f32(F), cy = f32(F), area = f32(F), acc = u32(F), ps = u32(F), pc = u32(F);
  const kind = u8(F); u8(F); const ids = u8(F * 16).fill(32);
  off += pad;
  const px = f32(P), py = f32(P);
  let p = 0;
  polys.forEach((poly, i) => {
    let a = 0;
    for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) a += (poly[j][0] + poly[k][0]) * (poly[j][1] - poly[k][1]);
    area[i] = Math.abs(a) / 2 / 10000;
    cx[i] = poly.reduce((s, q) => s + q[0], 0) / poly.length;
    cy[i] = poly.reduce((s, q) => s + q[1], 0) / poly.length;
    acc[i] = access[i]; ps[i] = p; pc[i] = poly.length; kind[i] = kinds?.[i] ?? 1;
    `F${i}`.split('').forEach((c, k) => (ids[i * 16 + k] = c.charCodeAt(0)));
    for (const [x, y] of poly) { px[p] = x; py[p] = y; p++; }
  });
  return buf;
}

