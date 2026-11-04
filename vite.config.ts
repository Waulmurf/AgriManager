/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const MAP_DIR = resolve(import.meta.dirname, 'src-tauri/resources/map');

/**
 * Liefert im Browser-Modus (vite dev/preview, Playwright) die Kartendaten unter
 * /mapdata/<datei> mit HTTP-Range aus – wie das Tauri-Protokoll mapdata://.
 */
function mapDataServer(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? '';
    if (!url.startsWith('/mapdata/')) return next();
    const name = decodeURIComponent(url.slice('/mapdata/'.length).split('?')[0]);
    if (!/^[A-Za-z0-9_.-]+$/.test(name) || name.startsWith('.')) {
      res.statusCode = 400;
      return res.end();
    }
    const file = resolve(MAP_DIR, name);
    let size: number;
    try {
      size = statSync(file).size;
    } catch {
      res.statusCode = 404;
      return res.end('nicht gefunden');
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, ETag');
    res.setHeader('Cache-Control', 'no-cache');
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
    let start = 0;
    let end = size - 1;
    if (m) {
      if (m[1] === '') {
        start = Math.max(0, size - Number(m[2]));
      } else {
        start = Number(m[1]);
        if (m[2] !== '') end = Math.min(end, Number(m[2]));
      }
      if (start >= size || end < start) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${size}`);
        return res.end();
      }
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    }
    res.setHeader('Content-Length', String(end - start + 1));
    if (req.method === 'HEAD') return res.end();
    createReadStream(file, { start, end }).pipe(res);
  };
  return {
    name: 'map-data-server',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), mapDataServer()],
  base: './',
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: ['es2022', 'safari15'],
    chunkSizeWarningLimit: 2000,
  },
  worker: { format: 'es' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
