#!/usr/bin/env node
// Baut die Kartendaten lokal in Docker (wie der Workflow „map-data“) und kopiert sie
// nach src-tauri/resources/map. Dauer: ca. 15–30 min, Download ca. 1,5 GB.
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const run = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: ROOT });
// amd64 auch auf Apple Silicon (pmtiles-Binary), läuft dort emuliert
run('docker build --platform linux/amd64 -t lohnbetrieb-mapdata -f scripts/data/Dockerfile scripts/data');
// Arbeitsdateien (OSM-Auszüge) bleiben in build/map-work und werden beim nächsten Lauf wiederverwendet
run(`docker run --platform linux/amd64 --rm -v "${ROOT}:/work" lohnbetrieb-mapdata bash scripts/data/build-region.sh`);
const out = join(ROOT, 'build', 'map-data');
const dest = join(ROOT, 'src-tauri', 'resources', 'map');
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(out)) cpSync(join(out, f), join(dest, f));
console.log(`Kartendaten nach ${dest} kopiert.`);
