/**
 * Verbindet Karte, Simulations-Worker und Darstellung.
 * Läuft außerhalb von React; die Oberfläche liest den Zustand über subscribe().
 */
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MlMap, ErrorEvent as MlErrorEvent } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
// MapLibre 6 lädt seinen Kachel-Worker als eigene Datei; Vite muss sie mitliefern.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { assetBase, mapDataUrl } from '../platform';
import { addFallbackImages, BASEMAP_SOURCE, buildStyle, circlePolygon } from '../map/style';
import { addVehicleIcons, vehicleIconId } from '../map/icons';
import { VehicleInterpolator, type VehicleSample } from '../map/interpolator';
import type { FromWorker, Speed, ToWorker, WorkerStats } from '../sim/protocol';
import type { VehicleInfo } from '../sim/engine';

export interface RegionInfo {
  tag: string;
  center: { name: string; lat: number; lon: number };
  radiusKm: number;
  protomapsBuild?: string;
  osmTimestamp?: string;
  attribution?: string;
}

export interface GameStatus {
  phase: 'loading' | 'running' | 'error';
  message?: string;
  speed: Speed;
  time: number;
  /** Spielzeit laut Worker (letzte Meldung) */
  simTime: number;
  vehicles: number;
  stats: WorkerStats | null;
  fps: number;
  frameP95: number;
  updateMs: number;
  region: RegionInfo | null;
  graph: { nodes: number; edges: number } | null;
  tilesLoaded: boolean;
  tileErrors: number;
}

const SEED = 20260304;
const VEHICLE_COUNT = 30;

let protocolRegistered = false;

export class GameController {
  private map: MlMap | null = null;
  private worker: Worker | null = null;
  private interp = new VehicleInterpolator();
  private samples: VehicleSample[] = [];
  private vehicles: VehicleInfo[] = [];
  private features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  private raf = 0;
  private listeners = new Set<(s: GameStatus) => void>();
  private frameTimes: number[] = [];
  private lastFrame = 0;
  private updateCost = 0;
  private notifyAt = 0;
  private tileTimer: ReturnType<typeof setInterval> | undefined;
  status: GameStatus = {
    phase: 'loading', speed: 0, time: 0, simTime: 0, vehicles: 0, stats: null, fps: 0, frameP95: 0, updateMs: 0,
    region: null, graph: null, tilesLoaded: false, tileErrors: 0,
  };

  subscribe(fn: (s: GameStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private emit(patch: Partial<GameStatus>) {
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) fn(this.status);
  }

  async start(container: HTMLElement): Promise<void> {
    try {
      const [region, graphBuf] = await Promise.all([
        fetchJson<RegionInfo>(mapDataUrl('region.json')),
        fetchBuffer(mapDataUrl('roadgraph.bin')),
      ]);
      this.emit({ region });

      if (!protocolRegistered) {
        maplibregl.setWorkerUrl(new URL(maplibreWorkerUrl, window.location.href).href);
        maplibregl.addProtocol('pmtiles', new Protocol().tile);
        protocolRegistered = true;
      }
      const center: [number, number] = [region.center.lon, region.center.lat];
      const map = new maplibregl.Map({
        container,
        style: buildStyle(mapDataUrl('region.pmtiles'), assetBase()),
        center,
        zoom: 9.3,
        minZoom: 7,
        maxZoom: 17.5,
        attributionControl: { compact: false },
        // keine Telemetrie, keine Online-Ressourcen
        localIdeographFontFamily: 'sans-serif',
      });
      this.map = map;
      addFallbackImages(map);
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      map.on('error', (e: MlErrorEvent) => {
        this.emit({ tileErrors: this.status.tileErrors + 1 });
        console.warn('Kartenfehler', e.error?.message ?? e);
      });
      await new Promise<void>((res) => map.once('load', () => res()));
      this.addGameLayers(center, region.radiusKm * 1000);

      this.worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onWorker(ev.data);
      this.post({ type: 'init', graph: graphBuf, seed: SEED, vehicleCount: VEHICLE_COUNT }, [graphBuf]);
      // „idle“ kommt nicht, solange Fahrzeuge sich bewegen – daher Kachelstatus prüfen
      const checkTiles = () => {
        // nur die Grundkarte: die Fahrzeugquelle wird ständig neu befüllt
        const loaded = map.isSourceLoaded(BASEMAP_SOURCE);
        if (loaded !== this.status.tilesLoaded) this.emit({ tilesLoaded: loaded });
      };
      map.on('idle', checkTiles);
      this.tileTimer = setInterval(checkTiles, 250);
      this.raf = requestAnimationFrame(this.frame);
    } catch (e) {
      this.emit({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  setSpeed(speed: Speed) {
    this.post({ type: 'speed', speed });
    this.emit({ speed });
  }

  fitRegion() {
    const r = this.status.region;
    if (!r || !this.map) return;
    const poly = circlePolygon([r.center.lon, r.center.lat], r.radiusKm * 1000, 32);
    const b = new maplibregl.LngLatBounds();
    for (const c of poly.geometry.coordinates[0]) b.extend(c as [number, number]);
    this.map.fitBounds(b, { padding: 30, duration: 0 });
  }

  /** Sicht auf den Hof (für Nahansicht der Fahrzeuge). */
  zoomHome(zoom = 13) {
    const r = this.status.region;
    if (!r || !this.map) return;
    this.map.jumpTo({ center: [r.center.lon, r.center.lat], zoom });
  }

  getMap() {
    return this.map;
  }

  /** Zuletzt dargestellte Spielzeit (Minuten, mit Nachkommastellen). */
  renderTime(): number {
    return this.interp.renderTime;
  }

  /** Aktuell gezeichnete Fahrzeugpositionen (für Tests). */
  vehiclePositions(): { lon: number; lat: number; state: number }[] {
    return this.samples.slice(0, this.vehicles.length).map((s) => ({ lon: s.lon, lat: s.lat, state: s.state }));
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearInterval(this.tileTimer);
    this.worker?.terminate();
    this.map?.remove();
    this.listeners.clear();
  }

  // ---------------------------------------------------------------------------

  private post(msg: ToWorker, transfer: Transferable[] = []) {
    this.worker?.postMessage(msg, transfer);
  }

  private onWorker(msg: FromWorker) {
    if (msg.type === 'ready') {
      this.vehicles = msg.vehicles;
      this.features = msg.vehicles.map((v) => ({
        type: 'Feature',
        id: v.id,
        properties: { icon: vehicleIconId(v.brand, v.profile), bearing: 0, state: 0, name: v.name },
        geometry: { type: 'Point', coordinates: [msg.home[0], msg.home[1]] },
      }));
      (this.map!.getSource('home') as GeoJSONSource).setData({
        type: 'Feature', properties: { name: 'Hof' }, geometry: { type: 'Point', coordinates: msg.home },
      });
      this.emit({ phase: 'running', vehicles: msg.vehicles.length, graph: { nodes: msg.nodeCount, edges: msg.edgeCount } });
    } else if (msg.type === 'tick') {
      this.interp.addTick(msg.time, msg.speed, msg.positions, msg.routes, performance.now());
      this.status.stats = msg.stats;
      this.status.simTime = msg.time;
    } else if (msg.type === 'error') {
      this.emit({ phase: 'error', message: msg.message });
    }
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (this.lastFrame) {
      this.frameTimes.push(now - this.lastFrame);
      if (this.frameTimes.length > 120) this.frameTimes.shift();
    }
    this.lastFrame = now;
    const map = this.map;
    if (!map || this.features.length === 0) return;

    const t0 = performance.now();
    const n = this.interp.sample(now, this.samples);
    for (let i = 0; i < n && i < this.features.length; i++) {
      const s = this.samples[i];
      const f = this.features[i];
      (f.geometry.coordinates as number[])[0] = s.lon;
      (f.geometry.coordinates as number[])[1] = s.lat;
      f.properties!.bearing = s.bearing;
      f.properties!.state = s.state;
    }
    (map.getSource('vehicles') as GeoJSONSource).setData({ type: 'FeatureCollection', features: this.features });
    const cost = performance.now() - t0;
    this.updateCost = this.updateCost * 0.95 + cost * 0.05;

    if (now >= this.notifyAt) {
      this.notifyAt = now + 250;
      const ft = [...this.frameTimes].sort((a, b) => a - b);
      const avg = ft.reduce((a, b) => a + b, 0) / (ft.length || 1);
      this.emit({
        time: this.interp.renderTime,
        fps: avg > 0 ? 1000 / avg : 0,
        frameP95: ft.length ? ft[Math.floor(ft.length * 0.95)] : 0,
        updateMs: this.updateCost,
      });
    }
  };

  private addGameLayers(center: [number, number], radiusM: number) {
    const map = this.map!;
    addVehicleIcons(map);
    map.addSource('region', { type: 'geojson', data: circlePolygon(center, radiusM) });
    map.addLayer({
      id: 'region-outline',
      type: 'line',
      source: 'region',
      paint: { 'line-color': '#b5512b', 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': 0.8 },
    });
    map.addSource('home', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'home-dot',
      type: 'circle',
      source: 'home',
      paint: { 'circle-radius': 7, 'circle-color': '#b5512b', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
    });
    map.addLayer({
      id: 'home-label',
      type: 'symbol',
      source: 'home',
      layout: {
        'text-field': 'Hof Groß Thondorf',
        'text-font': ['Noto Sans Medium'],
        'text-size': 13,
        'text-offset': [0, 1.3],
        'text-anchor': 'top',
      },
      paint: { 'text-color': '#7a2f12', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
    });
    map.addSource('vehicles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'vehicles',
      type: 'symbol',
      source: 'vehicles',
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-rotate': ['get', 'bearing'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.45, 12, 0.7, 16, 1.1],
      },
    });
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status} – Kartendaten fehlen? (npm run map-data)`);
  return r.json() as Promise<T>;
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status} – Kartendaten fehlen? (npm run map-data)`);
  return r.arrayBuffer();
}
