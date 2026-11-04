#!/usr/bin/env node
// Lädt die Kartendaten (Release-Tag aus data/map-data.json) nach
// src-tauri/resources/map/ und prüft die SHA-256-Summen.
// Nutzt GITHUB_TOKEN/GH_TOKEN, falls gesetzt (nötig bei privatem Repo).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO = process.env.MAP_DATA_REPO ?? 'waulmurf/agrimanager';
const { tag } = JSON.parse(readFileSync(join(ROOT, 'data/map-data.json'), 'utf8'));
const OUT = join(ROOT, 'src-tauri/resources/map');
const FILES = ['region.json', 'region.pmtiles', 'roadgraph.bin'];
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
let headers = { 'User-Agent': 'lohnbetrieb-fetch', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

mkdirSync(OUT, { recursive: true });
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

const relUrl = `https://api.github.com/repos/${REPO}/releases/tags/${tag}`;
let rel = await fetch(relUrl, { headers });
if (rel.status === 401 && token) {
  // ungültiges Token in der Umgebung: öffentliches Repo ohne Anmeldung versuchen
  headers = { 'User-Agent': headers['User-Agent'] };
  rel = await fetch(relUrl, { headers });
}
if (!rel.ok) throw new Error(`Release ${tag} nicht gefunden (${rel.status}). Workflow „map-data“ gelaufen?`);
const assets = Object.fromEntries((await rel.json()).assets.map((a) => [a.name, a]));

async function download(name) {
  const a = assets[name];
  if (!a) throw new Error(`Datei ${name} fehlt im Release ${tag}`);
  const res = await fetch(a.url, { headers: { ...headers, Accept: 'application/octet-stream' } });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const sums = Object.fromEntries(
  (await download('SHA256SUMS')).toString().trim().split('\n').map((l) => l.trim().split(/\s+/).reverse()),
);
for (const name of FILES) {
  const target = join(OUT, name);
  if (existsSync(target) && sha(readFileSync(target)) === sums[name]) {
    console.log(`✓ ${name} aktuell`);
    continue;
  }
  const buf = await download(name);
  if (sha(buf) !== sums[name]) throw new Error(`${name}: Prüfsumme falsch`);
  writeFileSync(target, buf);
  console.log(`↓ ${name} (${(buf.length / 1e6).toFixed(1)} MB)`);
}
console.log(`Kartendaten ${tag} in ${OUT}`);
