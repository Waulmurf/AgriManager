#!/usr/bin/env node
// Lädt die Kartenschriften (Glyph-PBF, SIL OFL) aus protomaps/basemaps-assets
// nach public/map-assets/fonts. Die Dateien liegen versioniert im Repo; das
// Skript ist nur zum Aktualisieren nötig.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts';
const FONTS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
// Latein, Latein erweitert, Allgemeine Interpunktion („ “ – …)
const RANGES = ['0-255', '256-511', '8192-8447'];
const OUT = new URL('../public/map-assets/fonts/', import.meta.url).pathname;

for (const font of FONTS) {
  mkdirSync(join(OUT, font), { recursive: true });
  for (const r of RANGES) {
    const res = await fetch(`${BASE}/${encodeURIComponent(font)}/${r}.pbf`);
    if (!res.ok) throw new Error(`${font} ${r}: ${res.status}`);
    writeFileSync(join(OUT, font, `${r}.pbf`), Buffer.from(await res.arrayBuffer()));
    console.log('ok', font, r);
  }
}
const lic = await fetch(`${BASE}/OFL.txt`);
writeFileSync(join(OUT, 'OFL.txt'), await lic.text());
