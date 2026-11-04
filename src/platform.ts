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
}

/** Selbsttest: in der App über LOHNBETRIEB_SELFTEST=1, im Browser über ?selftest=1. */
export async function selftestConfig(): Promise<SelftestConfig> {
  const q = new URLSearchParams(window.location.search);
  if (q.has('selftest')) return { enabled: true, seconds: Number(q.get('seconds') ?? 20), minFps: Number(q.get('minFps') ?? 30) };
  if (isTauri) {
    try {
      return await invoke<SelftestConfig>('selftest_config');
    } catch {
      /* ältere Hülle ohne Befehl */
    }
  }
  return { enabled: false, seconds: 0, minFps: 30 };
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
