/** Unterschiede zwischen Tauri-App und Browser (Entwicklung, Playwright). */
import { convertFileSrc, invoke } from '@tauri-apps/api/core';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Absolute URL einer Kartendatei (PMTiles, Straßengraph, region.json). */
export function mapDataUrl(name: string): string {
  if (isTauri) return convertFileSrc(name, 'mapdata');
  return new URL(`mapdata/${name}`, window.location.href).href;
}

/** Absolute Basis-URL für mitgelieferte Dateien (Schriften). */
export function assetBase(): string {
  return new URL('.', window.location.href).href;
}

export interface SelftestConfig {
  enabled: boolean;
  seconds: number;
  minFps: number;
  minSps: number;
}

/** Selbsttest: in der App über LOHNBETRIEB_SELFTEST=1, im Browser über ?selftest=1. */
export async function selftestConfig(): Promise<SelftestConfig> {
  const q = new URLSearchParams(window.location.search);
  if (q.has('selftest')) return { enabled: true, seconds: Number(q.get('seconds') ?? 20), minFps: Number(q.get('minFps') ?? 30), minSps: Number(q.get('minSps') ?? 90) };
  if (isTauri) {
    try {
      return await invoke<SelftestConfig>('selftest_config');
    } catch {
      /* ältere Hülle ohne Befehl */
    }
  }
  return { enabled: false, seconds: 0, minFps: 30, minSps: 90 };
}

export async function reportSelftest(result: unknown): Promise<void> {
  (window as unknown as { __selftest?: unknown }).__selftest = result;
  console.log('SELFTEST_RESULT ' + JSON.stringify(result));
  if (isTauri) await invoke('selftest_report', { json: JSON.stringify(result) });
}

export function platformName(): string {
  const ua = navigator.userAgent;
  const plat = navigator.platform || ua;
  const engine = isTauri ? (/Windows/.test(ua) ? 'WebView2' : /Mac/.test(ua) ? 'WKWebView' : 'WebKitGTK') : 'Browser';
  const os = /Win/.test(plat) ? 'Windows' : /Mac/.test(plat) ? 'macOS' : /Linux/.test(plat) ? 'Linux' : 'unbekannt';
  return `${os} · ${engine}`;
}

/** Leitet im Selbsttest Fehler und Fortschritt auf die Konsole der App um (für CI-Logs). */
export function forwardLogsToHost(): (msg: string) => void {
  const send = (msg: string) => {
    if (isTauri) invoke('selftest_log', { msg: msg.slice(0, 2000) }).catch(() => {});
    else console.log('[selbsttest]', msg);
  };
  window.addEventListener('error', (e) => send(`Fehler: ${e.message} (${e.filename}:${e.lineno})`));
  window.addEventListener('unhandledrejection', (e) => send(`Promise-Fehler: ${String(e.reason)}`));
  for (const level of ['error', 'warn'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      orig(...args);
      send(`${level}: ${args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ')}`);
    };
  }
  return send;
}
