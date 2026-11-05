/**
 * Selbsttest für Leistung und Darstellung: wartet auf die Grundkarte, lässt
 * die Simulation mit 100x laufen und misst Bildrate und Schritte pro Sekunde.
 * Läuft in der fertigen App (WKWebView / WebView2) und im Browser (Playwright).
 */
import type { GameController } from './controller';
import { platformName, reportSelftest } from '../platform';

export interface SelftestResult {
  ok: boolean;
  platform: string;
  userAgent: string;
  webgl2: boolean;
  tilesLoaded: boolean;
  tileLoadMs: number;
  tileErrors: number;
  /** gezeichnete Objekte der Grundkarte im sichtbaren Ausschnitt */
  basemapFeatures: number;
  sourceLoaded: boolean;
  vehicles: number;
  vehiclesOnMap: number;
  seconds: number;
  simMinutes: number;
  stepsPerSecond: number;
  msPerStep: number;
  fpsAvg: number;
  fpsMin: number;
  frameP95: number;
  updateMs: number;
  devicePixelRatio: number;
  minFps: number;
  minSps: number;
  /** Spielstand speichern und laden (SQLite in der App) */
  saveOk: boolean;
  saveMessage: string;
  failures: string[];
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSelftest(
  game: GameController,
  seconds: number,
  minFps = 30,
  minSps = 90,
  log: (msg: string) => void = () => {},
): Promise<SelftestResult> {
  const failures: string[] = [];
  const t0 = performance.now();
  while (game.status.phase === 'loading' && performance.now() - t0 < 30000) await wait(100);
  game.fitRegion();
  game.showTestVehicles(true);
  await wait(300);
  while (!game.status.tilesLoaded && performance.now() - t0 < 45000) await wait(100);
  const tileLoadMs = performance.now() - t0;
  log(`Grundkarte: geladen=${game.status.tilesLoaded} nach ${Math.round(tileLoadMs)} ms, Phase ${game.status.phase}`);

  game.setSpeed(100);
  await wait(1500); // Einschwingen
  const startTime = game.status.time;
  const fps: number[] = [];
  const sps: number[] = [];
  const p95: number[] = [];
  const upd: number[] = [];
  const end = performance.now() + seconds * 1000;
  while (performance.now() < end) {
    await wait(1000);
    fps.push(game.status.fps);
    p95.push(game.status.frameP95);
    upd.push(game.status.updateMs);
    if (game.status.stats) sps.push(game.status.stats.stepsPerSecond);
  }
  const simMinutes = game.status.time - startTime;
  log(`Messung fertig: ${Math.round(simMinutes)} Spielminuten, fps ${fps.map((f) => f.toFixed(0)).join('/')}`);
  game.setSpeed(1);

  // Spielstand: speichern, laden, Zeit muss übereinstimmen
  let saveOk = false;
  let saveMessage = '';
  try {
    game.setSpeed(0);
    await wait(500);
    const t = game.status.business?.time ?? -1;
    const m1 = await game.saveGame('Selbsttest');
    const m2 = await game.loadGame('Selbsttest');
    await wait(500);
    saveOk = m1.startsWith('Gespeichert') && m2.startsWith('Geladen') && game.status.business?.time === t;
    await game.deleteSave('Selbsttest');
    saveMessage = `${m1}; ${m2}; Zeit ${t} → ${game.status.business?.time}`;
  } catch (e) {
    saveOk = false;
    saveMessage = e instanceof Error ? e.message : String(e);
  }
  log(`Spielstand: ${saveMessage}`);

  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const positions = game.vehiclePositions();
  const r = game.status.region;
  const onMap = positions.filter((p) => r && Math.abs(p.lat - r.center.lat) < 0.6 && Math.abs(p.lon - r.center.lon) < 0.9).length;

  const map = game.getMap()!;
  const basemapFeatures = map.queryRenderedFeatures().filter((f) => f.source === 'protomaps').length;
  const sourceLoaded = map.isSourceLoaded('protomaps');
  const canvas = document.createElement('canvas');
  const webgl2 = !!canvas.getContext('webgl2');

  const result: SelftestResult = {
    ok: false,
    platform: platformName(),
    userAgent: navigator.userAgent,
    webgl2,
    tilesLoaded: game.status.tilesLoaded,
    tileLoadMs: Math.round(tileLoadMs),
    tileErrors: game.status.tileErrors,
    basemapFeatures,
    sourceLoaded,
    vehicles: game.status.vehicles,
    vehiclesOnMap: onMap,
    seconds,
    simMinutes: Math.round(simMinutes),
    stepsPerSecond: Math.round(avg(sps) * 10) / 10,
    msPerStep: Math.round((game.status.stats?.msPerStep ?? 0) * 1000) / 1000,
    fpsAvg: Math.round(avg(fps) * 10) / 10,
    fpsMin: Math.round(Math.min(...(fps.length ? fps : [0])) * 10) / 10,
    frameP95: Math.round(Math.max(...(p95.length ? p95 : [0])) * 10) / 10,
    updateMs: Math.round(avg(upd) * 100) / 100,
    devicePixelRatio: window.devicePixelRatio,
    minFps,
    minSps,
    saveOk,
    saveMessage,
    failures,
  };
  if (!webgl2) failures.push('kein WebGL2');
  if (basemapFeatures < 200) failures.push(`Grundkarte nicht gezeichnet (${basemapFeatures} Objekte)`);
  if (result.tileErrors > 0) failures.push(`${result.tileErrors} Kartenfehler`);
  if (result.vehicles !== 30 || result.vehiclesOnMap < 30) failures.push('nicht alle 30 Fahrzeuge auf der Karte');
  if (result.stepsPerSecond < minSps) failures.push(`nur ${result.stepsPerSecond} Schritte/s bei 100x`);
  if (!saveOk) failures.push(`Spielstand: ${saveMessage}`);
  if (result.fpsAvg < minFps) failures.push(`Bildrate ${result.fpsAvg} fps unter ${minFps} fps`);
  result.ok = failures.length === 0;
  await reportSelftest(result);
  return result;
}
