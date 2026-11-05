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
import { DEALERS } from '../data/catalog';
import { VehicleInterpolator, type VehicleSample } from '../map/interpolator';
import type { BusinessState, FarmSummary, FromWorker, Speed, ToWorker, WorkerStats } from '../sim/protocol';
import type { Command, GameEvent } from '../sim/business';
import type { Company } from '../sim/economy';
import { CROP_NAMES, CHARACTER_NAMES, farmCharacter } from '../sim/farms';
import type { VehicleInfo } from '../sim/engine';
import { FieldSource, fieldId, parseFields, type FieldSet } from '../sim/fields';
import { AUTOSAVE, createSaveStore, type SaveInfo } from './savegame';
import type { SaveState } from '../sim/engine';

export interface RegionInfo {
  tag: string;
  center: { name: string; lat: number; lon: number };
  radiusKm: number;
  protomapsBuild?: string;
  osmTimestamp?: string;
  attribution?: string;
  fieldAttribution?: string;
  /** [west, süd, ost, nord] der Kartendaten */
  bbox?: [number, number, number, number];
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
  /** Anzahl Felder (0 = keine Felddaten) */
  fieldCount: number;
  company: Company | null;
  farmCount: number;
  knownFarms: number;
  business: BusinessState | null;
  testVehiclesVisible: boolean;
  /** offenes Rechtsklick-Menü (Bildschirmposition relativ zur Karte) */
  contextMenu: { x: number; y: number; vehicle: number } | null;
  /** vorhandene Spielstände */
  saves: SaveInfo[];
  /** zuletzt geladener/gespeicherter Spielstand */
  saveName: string | null;
  /** letzte Ereignisse, neueste zuerst */
  events: GameEvent[];
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
  private fields: FieldSet | null = null;
  private activeFields = new Set<number>();
  private farms: FarmSummary[] = [];
  private cmdId = 1;
  private store = createSaveStore();
  private pendingSaves = new Map<number, (s: SaveState) => void>();
  private pendingLoads = new Map<number, (r: { ok: boolean; message: string }) => void>();
  private lastAutosaveDay = 0;
  private saving = false;
  /** Autosave abschalten (Selbsttest) */
  autosave = true;
  private pendingCmds = new Map<number, (msg: string) => void>();
  private fieldFarm: Int32Array = new Int32Array(0);
  private fieldCrop: Uint8Array = new Uint8Array(0);
  status: GameStatus = {
    phase: 'loading', speed: 0, time: 0, simTime: 0, vehicles: 0, stats: null, fps: 0, frameP95: 0, updateMs: 0,
    region: null, graph: null, fieldCount: 0, company: null, farmCount: 0, knownFarms: 0, business: null, events: [], testVehiclesVisible: false, contextMenu: null, saves: [], saveName: null, tilesLoaded: false, tileErrors: 0,
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
      const [region, graphBuf, fieldsBuf] = await Promise.all([
        fetchJson<RegionInfo>(mapDataUrl('region.json')),
        fetchBuffer(mapDataUrl('roadgraph.bin')),
        fetchOptionalBuffer(mapDataUrl('fields.bin')),
      ]);
      // eigene Kopie für Feld-Infos auf der Karte; das Original geht an den Worker
      this.fields = fieldsBuf ? parseFields(fieldsBuf.slice(0)) : null;
      this.emit({ region });

      if (!protocolRegistered) {
        maplibregl.setWorkerUrl(new URL(maplibreWorkerUrl, window.location.href).href);
        maplibregl.addProtocol('pmtiles', new Protocol().tile);
        protocolRegistered = true;
      }
      if (!document.createElement('canvas').getContext('webgl2')) {
        throw new Error('WebGL2 ist in dieser Umgebung nicht verfügbar');
      }
      const center: [number, number] = [region.center.lon, region.center.lat];
      const map = new maplibregl.Map({
        container,
        style: buildStyle(mapDataUrl('region.pmtiles'), assetBase()),
        center,
        zoom: 9.3,
        // nur innerhalb der Kartendaten verschieben/zoomen: keine leeren (grauen) Ränder
        minZoom: 8,
        maxZoom: 17.5,
        maxBounds: region.bbox ? [[region.bbox[0], region.bbox[1]], [region.bbox[2], region.bbox[3]]] : undefined,
        renderWorldCopies: false,
        fadeDuration: 0,
        maxTileCacheSize: 600,
        attributionControl: { compact: true },
        // keine Telemetrie, keine Online-Ressourcen
        localIdeographFontFamily: 'sans-serif',
      });
      this.map = map;
      addFallbackImages(map);
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      map.on('webglcontextlost', () => {
        console.error('WebGL-Kontext verloren');
        this.emit({ phase: 'error', message: 'Die Grafik (WebGL) ist ausgefallen. Grafiktreiber bzw. GPU-Unterstützung prüfen.' });
      });
      map.on('error', (e: MlErrorEvent) => {
        this.emit({ tileErrors: this.status.tileErrors + 1 });
        console.warn('Kartenfehler', e.error?.message ?? e);
      });
      await new Promise<void>((res, rej) => {
        let lastError = '';
        const onErr = (e: MlErrorEvent) => { lastError = e.error?.message ?? String(e); };
        map.on('error', onErr);
        const timer = setTimeout(
          () => rej(new Error(`Karte lädt nicht (30 s)${lastError ? ': ' + lastError : ''}`)),
          30000,
        );
        map.once('load', () => {
          clearTimeout(timer);
          map.off('error', onErr);
          res();
        });
      });
      this.addGameLayers(region);
      // Quellenangabe zugeklappt starten (Info-Knopf klappt sie auf)
      container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');

      this.worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onWorker(ev.data);
      this.post(
        { type: 'init', graph: graphBuf, fields: fieldsBuf ?? undefined, seed: SEED, vehicleCount: VEHICLE_COUNT },
        fieldsBuf ? [graphBuf, fieldsBuf] : [graphBuf],
      );
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
        properties: { icon: vehicleIconId(v.brand, v.profile), bearing: 0, state: 0, name: v.name, player: v.owner === 'player' },
        geometry: { type: 'Point', coordinates: [msg.home[0], msg.home[1]] },
      }));
      (this.map!.getSource('home') as GeoJSONSource).setData({
        type: 'Feature', properties: { name: 'Hof' }, geometry: { type: 'Point', coordinates: msg.home },
      });
      this.farms = msg.farms;
      this.fieldFarm = msg.fieldFarm;
      this.fieldCrop = msg.fieldCrop;
      this.setFarmData();
      this.emit({
        phase: 'running',
        vehicles: msg.vehicles.filter((v) => v.owner === 'test').length,
        graph: { nodes: msg.nodeCount, edges: msg.edgeCount },
        fieldCount: msg.fieldCount,
        company: msg.company,
        farmCount: msg.farms.length,
        knownFarms: msg.farms.filter((f) => f.known).length,
      });
    } else if (msg.type === 'vehicles') {
      // Fahrzeugliste geändert (Kauf, Laden): Symbole neu aufbauen, bekannte Positionen behalten
      this.vehicles = msg.vehicles;
      const home = (this.features[0]?.geometry.coordinates as [number, number] | undefined) ?? [0, 0];
      this.features = msg.vehicles.map((v, i) => ({
        type: 'Feature',
        id: v.id,
        properties: { icon: vehicleIconId(v.brand, v.profile), bearing: 0, state: 0, name: v.name, player: v.owner === 'player' },
        geometry: { type: 'Point', coordinates: [...((this.features[i]?.geometry.coordinates as [number, number] | undefined) ?? home)] },
      }));
    } else if (msg.type === 'tick') {
      this.interp.addTick(msg.time, msg.speed, msg.positions, msg.routes, performance.now());
      this.status.stats = msg.stats;
      this.status.simTime = msg.time;
    } else if (msg.type === 'business') {
      const st = msg.state;
      let changed = false;
      const known = new Set(st.knownFarms);
      for (const f of this.farms) {
        const k = known.has(f.id);
        const sat = st.satisfaction[f.id] ?? f.satisfaction;
        if (f.known !== k || f.satisfaction !== sat) { f.known = k; f.satisfaction = sat; changed = true; }
      }
      if (changed) this.setFarmData();
      // eigene Standorte auf der Karte (ST-09)
      const siteKey = (st.company.sites ?? []).map((x) => `${x.id}:${Object.values(x.buildings).filter((y) => y?.done).length}`).join(',');
      if (siteKey !== this.siteKey && this.map?.getSource('sites')) {
        this.siteKey = siteKey;
        (this.map.getSource('sites') as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: (st.company.sites ?? []).filter((x) => x.id !== 1).map((x) => ({
            type: 'Feature', properties: { name: x.name }, geometry: { type: 'Point', coordinates: x.lonLat },
          })),
        });
      }
      // eigene Pachtflächen auf der Karte (feature-state own)
      const own = new Set(st.farming.leases.flatMap((l) => l.fields));
      const ownKey = [...own].join(',');
      if (ownKey !== this.ownKey && this.map?.getSource('fields')) {
        this.ownKey = ownKey;
        for (const fi of this.ownFields) if (!own.has(fi)) this.map.setFeatureState({ source: 'fields', sourceLayer: 'fields', id: fi + 1 }, { own: false });
        for (const fi of own) this.map.setFeatureState({ source: 'fields', sourceLayer: 'fields', id: fi + 1 }, { own: true });
        this.ownFields = own;
      }
      // aufgegebene Betriebe ausblenden, Empfehlungen als Linien (Vorschläge 27, 28)
      const closed = new Set(st.farmFlags.closed);
      if (closed.size !== this.closedCount) { this.closedCount = closed.size; this.closedFarms = closed; this.setFarmData(); }
      this.organicFarms = new Set(st.farmFlags.organic);
      if (st.referrals.length !== this.referralCount && this.map?.getSource('referrals')) {
        this.referralCount = st.referrals.length;
        (this.map.getSource('referrals') as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: st.referrals.filter((r) => this.farms[r.from] && this.farms[r.to]).map((r) => ({
            type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [this.farms[r.from].home, this.farms[r.to].home] },
          })),
        });
      }
      // Konkurrenten auf der Karte aktualisieren (nur bei Änderung)
      const compKey = st.market.competitors.map((c) => `${c.id}:${c.warUntil > st.time ? 1 : 0}`).join(',');
      if (compKey !== this.competitorKey && this.map?.getSource('competitors')) {
        this.competitorKey = compKey;
        const size = { gross: 'groß', mittel: 'mittel', klein: 'klein' } as const;
        (this.map.getSource('competitors') as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: st.market.competitors.map((c) => ({
            type: 'Feature', properties: {
              name: c.name, war: c.warUntil > st.time,
              info: `Lohnunternehmen in ${c.town}, ${size[c.size]} · Preise ${Math.round((c.priceLevel - 1) * 100)} %${c.warUntil > st.time ? ` · Preiskampf −${Math.round(c.warCut * 100)} %` : ''}`,
            }, geometry: { type: 'Point', coordinates: c.lonLat },
          })),
        });
      }
      const events = [...st.events.slice().reverse(), ...this.status.events].slice(0, 60);
      this.emit({ business: st, company: st.company, knownFarms: st.knownFarms.length, events });
      // Autosave einmal je Spieltag (beim Tageswechsel um 06:00)
      const day = Math.floor(st.time / 1440);
      if (this.autosave && day > this.lastAutosaveDay) {
        this.lastAutosaveDay = day;
        void this.saveGame(AUTOSAVE).catch((e) => console.warn('Autosave fehlgeschlagen', e));
      }
    } else if (msg.type === 'saveData') {
      this.pendingSaves.get(msg.id)?.(msg.state);
      this.pendingSaves.delete(msg.id);
    } else if (msg.type === 'loaded') {
      this.pendingLoads.get(msg.id)?.(msg);
      this.pendingLoads.delete(msg.id);
    } else if (msg.type === 'commandResult') {
      this.pendingCmds.get(msg.id)?.(msg.message);
      this.pendingCmds.delete(msg.id);
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
    if (this.fields) this.updateActiveFields(map, n);
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

  /** Felder, auf denen gerade gearbeitet wird, über feature-state hervorheben. */
  private updateActiveFields(map: MlMap, n: number) {
    const now = new Set<number>();
    for (let i = 0; i < n; i++) if (this.samples[i].field >= 0) now.add(this.samples[i].field);
    // Kachel-ID = Feld-Index + 1 (tippecanoe erlaubt keine ID 0)
    for (const fi of this.activeFields) {
      if (!now.has(fi)) map.setFeatureState({ source: 'fields', sourceLayer: 'fields', id: fi + 1 }, { active: false });
    }
    for (const fi of now) {
      if (!this.activeFields.has(fi)) map.setFeatureState({ source: 'fields', sourceLayer: 'fields', id: fi + 1 }, { active: true });
    }
    this.activeFields = now;
  }

  /** Feld-Infos für die Anzeige (Klick auf ein Feld). */
  fieldInfo(i: number): { id: string; ha: number; kind: string; source: string; crop: string; farm: string } | null {
    const f = this.fields;
    if (!f || i < 0 || i >= f.count) return null;
    const farm = this.ownFields.has(i) ? { name: 'Eigene Pachtfläche' } : this.farms[this.fieldFarm[i]];
    return {
      id: fieldId(f, i),
      ha: Math.round(f.areaHa[i] * 100) / 100,
      kind: f.kind[i] === 2 ? 'Grünland' : 'Acker',
      source: FieldSource[f.src[i] as keyof typeof FieldSource] ?? '–',
      crop: this.fieldCrop.length ? CROP_NAMES[this.fieldCrop[i]] : '–',
      farm: farm ? farm.name : '–',
    };
  }

  /** Spielstand speichern (Name; Standard: Autosave) */
  private competitorKey = '';
  private siteKey = '';
  private closedCount = 0;
  private closedFarms = new Set<number>();
  private organicFarms = new Set<number>();
  private referralCount = 0;
  private ownKey = '';
  private ownFields = new Set<number>();

  /** Spielzeit des zuletzt gespeicherten Stands (Selbsttest) */
  lastSavedTime = -1;

  async saveGame(name: string = AUTOSAVE): Promise<string> {
    if (this.saving) return 'Speichern läuft bereits';
    this.saving = true;
    try {
      const id = this.cmdId++;
      const state = await new Promise<SaveState>((res) => {
        this.pendingSaves.set(id, res);
        this.post({ type: 'save', id });
      });
      this.lastSavedTime = state.time;
      await this.store.save(name, state, {
        dataTag: this.status.region?.tag ?? '',
        business: this.status.business,
        farms: this.farms,
      });
      this.emit({ saveName: name });
      await this.refreshSaves();
      return `Gespeichert: ${name}`;
    } finally {
      this.saving = false;
    }
  }

  /** Spielstand laden */
  async loadGame(name: string): Promise<string> {
    const data = await this.store.load(name);
    if (!data) return 'Spielstand nicht gefunden';
    const tag = this.status.region?.tag;
    if (data.info.dataTag && tag && data.info.dataTag !== tag) {
      console.warn(`Spielstand mit Kartendaten ${data.info.dataTag}, geladen sind ${tag}`);
    }
    const id = this.cmdId++;
    const r = await new Promise<{ ok: boolean; message: string }>((res) => {
      this.pendingLoads.set(id, res);
      this.post({ type: 'load', id, state: data.state });
    });
    if (!r.ok) return `Laden fehlgeschlagen: ${r.message}`;
    this.lastAutosaveDay = Math.floor(data.state.time / 1440);
    this.emit({ saveName: name, speed: 0, events: [] });
    return `Geladen: ${name}`;
  }

  async refreshSaves(): Promise<SaveInfo[]> {
    const saves = await this.store.list().catch(() => [] as SaveInfo[]);
    this.emit({ saves });
    return saves;
  }

  async deleteSave(name: string) {
    await this.store.remove(name);
    await this.refreshSaves();
  }

  /** Spielerbefehl an die Simulation; liefert die Rückmeldung. */
  command(cmd: Command): Promise<string> {
    const id = this.cmdId++;
    return new Promise((res) => {
      this.pendingCmds.set(id, res);
      this.post({ type: 'command', id, cmd });
    });
  }

  farmById(id: number): FarmSummary | undefined {
    return this.farms[id];
  }

  /** Rechtsklick-Menü schließen */
  closeMenu() {
    if (this.status.contextMenu) this.emit({ contextMenu: null });
  }

  /** Name, Besitzer und aktueller Zustand eines Fahrzeugs (für das Menü) */
  vehicleDetails(id: number): { name: string; player: boolean; state: number; field: number } | null {
    const v = this.vehicles[id];
    if (!v) return null;
    const smp = this.samples[id];
    return { name: v.name, player: v.owner === 'player', state: smp?.state ?? 0, field: smp?.field ?? -1 };
  }

  /** Karte auf ein Fahrzeug zentrieren */
  flyToVehicle(id: number) {
    const smp = this.samples[id];
    if (smp && this.map) this.map.flyTo({ center: [smp.lon, smp.lat], zoom: Math.max(this.map.getZoom(), 14), duration: 600 });
  }

  /** Testfahrzeuge (zufälliger Verkehr für Leistungstests) ein- oder ausblenden */
  showTestVehicles(show: boolean) {
    const map = this.map;
    if (!map?.getLayer('vehicles')) return;
    map.setFilter('vehicles', show ? null : ['==', ['get', 'player'], true]);
    this.emit({ testVehiclesVisible: show });
  }

  /** Karte auf einen Punkt ausrichten */
  flyTo(lonLat: [number, number]) {
    if (this.map) this.map.flyTo({ center: lonLat, zoom: Math.max(this.map.getZoom(), 14), duration: 800 });
  }

  /** Karte auf einen Betrieb ausrichten */
  flyToFarm(id: number) {
    const f = this.farms[id];
    if (f && this.map) this.map.flyTo({ center: f.home, zoom: Math.max(this.map.getZoom(), 13), duration: 800 });
  }

  /** Kundenbetriebe (für Tests und Oberfläche). */
  farmList(): FarmSummary[] {
    return this.farms;
  }

  private setFarmData() {
    const map = this.map!;
    (map.getSource('farms') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: this.farms.filter((f) => !this.closedFarms.has(f.id)).map((f) => ({
        type: 'Feature',
        id: f.id,
        properties: { id: f.id, name: f.name, known: f.known, ha: f.areaHa },
        geometry: { type: 'Point', coordinates: f.home },
      })),
    });
  }

  private farmPopupHtml(f: FarmSummary): string {
    const crops = f.cropHa
      .map((ha, c) => ({ ha, c }))
      .filter((x) => x.ha > 0)
      .sort((a, b) => b.ha - a.ha)
      .map((x) => `${CROP_NAMES[x.c]} ${Math.round(x.ha).toLocaleString('de-DE')} ha`)
      .join(', ');
    const esc = (t: string) => t.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]!);
    return (
      `<strong>${esc(f.name)}</strong><br>` +
      `${f.areaHa.toLocaleString('de-DE', { maximumFractionDigits: 0 })} ha auf ${f.fieldCount} ${f.fieldCount === 1 ? 'Feld' : 'Feldern'}` +
      `${f.livestock ? ', mit Viehhaltung' : ', reiner Ackerbau'}<br>` +
      `<small>${crops}</small><br>` +
      `<small>${this.organicFarms.has(f.id) ? 'Ökobetrieb · ' : ''}Charakter: ${CHARACTER_NAMES[farmCharacter(f)]}</small><br>` +
      `<small>${f.known ? `Im Adressbuch · Zufriedenheit ${f.satisfaction} % · bevorzugt ${f.contact === 'anruf' ? 'Anrufe' : 'Nachrichten'}` : 'Noch nicht besucht – erst nach einem Besuch im Adressbuch'}</small>` +
      (this.status.business?.rivalFarms.includes(f.id) ? `<small class="warn">Arbeitet zurzeit mit einem anderen Lohnunternehmen</small>` : this.status.business?.trialFarms.includes(f.id) ? `<small>Probephase: nur kleine Aufträge, bis das Vertrauen wieder da ist</small>` : '') +
      `<div class="popup-actions"><button data-visit="${f.id}">${f.known ? 'Erneut besuchen' : 'Besuchen'}</button>${f.known ? `<button data-askland="${f.id}">Land anfragen</button>` : ''}<span class="popup-msg"></span></div>`
    );
  }

  private addFieldLayers(region: RegionInfo) {
    const map = this.map!;
    map.addSource('fields', {
      type: 'vector',
      url: `pmtiles://${mapDataUrl('fields.pmtiles')}`,
      attribution: region.fieldAttribution ?? '',
    });
    // unter den Straßen der Grundkarte einfügen
    const before = map.getStyle().layers.find((l) => l.id.startsWith('roads'))?.id;
    map.addLayer({
      id: 'fields-fill',
      type: 'fill',
      source: 'fields',
      'source-layer': 'fields',
      minzoom: 10,
      paint: {
        'fill-color': [
          'case',
          ['boolean', ['feature-state', 'active'], false], '#e8a33d',
          ['boolean', ['feature-state', 'own'], false], '#9cc7e8',
          ['==', ['get', 'k'], 2], '#cfe3b0',
          '#efe2c4',
        ],
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.35, 13, 0.7],
      },
    }, before);
    map.addLayer({
      id: 'fields-line',
      type: 'line',
      source: 'fields',
      'source-layer': 'fields',
      minzoom: 12,
      paint: {
        'line-color': ['case', ['boolean', ['feature-state', 'active'], false], '#b86e12', ['boolean', ['feature-state', 'own'], false], '#2f6f9f', '#b7a47a'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 1.5],
      },
    }, before);
    map.on('click', 'fields-fill', (e) => {
      if (e.defaultPrevented) return;
      if (map.queryRenderedFeatures(e.point, { layers: ['farms-dot'] }).length) return;
      const feat = e.features?.[0];
      if (!feat || feat.id === undefined) return;
      const info = this.fieldInfo(Number(feat.id) - 1);
      if (!info) return;
      new maplibregl.Popup({ closeButton: true, maxWidth: '260px' })
        .setLngLat(e.lngLat)
        .setHTML(
          `<strong>Feld ${info.id}</strong><br>${info.kind}: ${info.crop}, ${info.ha.toLocaleString('de-DE')} ha<br>` +
            `Bewirtschaftet von ${info.farm}<br><small>Feldgrenze: ${info.source}</small>`,
        )
        .addTo(map);
    });
    map.on('mouseenter', 'fields-fill', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'fields-fill', () => (map.getCanvas().style.cursor = ''));
  }

  private addGameLayers(region: RegionInfo) {
    const map = this.map!;
    if (this.fields) this.addFieldLayers(region);
    addVehicleIcons(map);
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
    // Händler (HM-04): Standort mit Namen, Klick zeigt die Marken
    map.addSource('dealers', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: DEALERS.map((d) => ({ type: 'Feature', id: d.id, properties: { id: d.id, name: d.name }, geometry: { type: 'Point', coordinates: d.lonLat } })),
      },
    });
    map.addLayer({
      id: 'dealers-dot',
      type: 'circle',
      source: 'dealers',
      paint: { 'circle-radius': 6, 'circle-color': '#3a4a5a', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
    });
    map.addLayer({
      id: 'dealers-label',
      type: 'symbol',
      source: 'dealers',
      minzoom: 9,
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Medium'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true },
      paint: { 'text-color': '#2b3a48', 'text-halo-color': '#fff', 'text-halo-width': 1.4 },
    });
    map.on('click', 'dealers-dot', (e) => {
      const d = DEALERS.find((x) => x.id === Number(e.features?.[0]?.properties?.id));
      if (!d) return;
      e.preventDefault();
      const brands = [...d.tractorBrands, ...d.implementBrands].join(', ');
      new maplibregl.Popup({ maxWidth: '260px' }).setLngLat(d.lonLat)
        .setHTML(`<strong>${d.name}</strong><br><small>${d.town} · ${brands}</small><br><small>Kauf, Bestellung und Werkstatt – Reiter Markt bzw. Fuhrpark</small>`).addTo(map);
    });
    // weitere eigene Standorte (wie der Hof)
    map.addSource('sites', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'sites-dot', type: 'circle', source: 'sites', paint: { 'circle-radius': 6, 'circle-color': '#b5512b', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    map.addLayer({
      id: 'sites-label', type: 'symbol', source: 'sites',
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top' },
      paint: { 'text-color': '#7a2f12', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
    });
    // Konkurrenten (Phase 5): Standorte, rot im Preiskampf
    map.addSource('competitors', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'competitors-dot', type: 'circle', source: 'competitors',
      paint: { 'circle-radius': 5, 'circle-color': ['case', ['get', 'war'], '#c0392b', '#8a7f72'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
    });
    map.addLayer({
      id: 'competitors-label', type: 'symbol', source: 'competitors', minzoom: 9.5,
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Medium'], 'text-size': 10, 'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true },
      paint: { 'text-color': '#5a5148', 'text-halo-color': '#fff', 'text-halo-width': 1.2 },
    });
    map.on('click', 'competitors-dot', (e) => {
      const p = e.features?.[0]?.properties as { name: string; info: string } | undefined;
      if (!p) return;
      e.preventDefault();
      new maplibregl.Popup({ maxWidth: '240px' }).setLngLat(e.lngLat).setHTML(`<strong>${p.name}</strong><br><small>${p.info}</small>`).addTo(map);
    });
    // Empfehlungen zwischen Betrieben (Vorschlag 27)
    map.addSource('referrals', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'referrals-line', type: 'line', source: 'referrals', minzoom: 9, paint: { 'line-color': '#2a78d6', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': 0.7 } });
    map.addSource('farms', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'farms-dot',
      type: 'circle',
      source: 'farms',
      minzoom: 10,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 6],
        'circle-color': ['case', ['get', 'known'], '#2f6f2a', '#8a8a7a'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.2,
      },
    });
    map.addLayer({
      id: 'farms-label',
      type: 'symbol',
      source: 'farms',
      minzoom: 12.5,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-offset': [0, 1],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': '#4a4a3c', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
    });
    map.on('click', 'farms-dot', (e) => {
      const id = e.features?.[0]?.properties?.id;
      const farm = id === undefined ? undefined : this.farms[Number(id)];
      if (!farm) return;
      e.preventDefault();
      const popup = new maplibregl.Popup({ maxWidth: '280px' }).setLngLat(farm.home).setHTML(this.farmPopupHtml(farm)).addTo(map);
      const el = popup.getElement();
      el.querySelector<HTMLButtonElement>('[data-visit]')?.addEventListener('click', async (ev) => {
        const btn = ev.currentTarget as HTMLButtonElement;
        btn.disabled = true;
        const msg = await this.command({ kind: 'visit', farmId: farm.id });
        const out = el.querySelector('.popup-msg');
        if (out) out.textContent = msg;
      });
      el.querySelector<HTMLButtonElement>('[data-askland]')?.addEventListener('click', async (ev) => {
        const btn = ev.currentTarget as HTMLButtonElement;
        btn.disabled = true;
        const msg = await this.command({ kind: 'askLand', farmId: farm.id });
        const out = el.querySelector('.popup-msg');
        if (out) out.textContent = msg;
      });
    });
    // Rechtsklick auf ein Fahrzeug: Menü mit Status und Befehlen
    const openMenu = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f || f.id === undefined) return;
      e.originalEvent.preventDefault();
      e.preventDefault();
      this.emit({ contextMenu: { x: e.point.x, y: e.point.y, vehicle: Number(f.id) } });
    };
    map.on('contextmenu', 'vehicles', openMenu);
    map.on('contextmenu', 'vehicles-player-halo', openMenu);
    map.on('click', () => this.closeMenu());
    map.on('movestart', (e) => { if ((e as { originalEvent?: unknown }).originalEvent) this.closeMenu(); });
    map.getCanvas().addEventListener('contextmenu', (ev) => ev.preventDefault());
    map.on('mouseenter', 'vehicles', () => (map.getCanvas().style.cursor = 'context-menu'));
    map.on('mouseleave', 'vehicles', () => (map.getCanvas().style.cursor = ''));
    map.on('mouseenter', 'farms-dot', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'farms-dot', () => (map.getCanvas().style.cursor = ''));
    map.addSource('vehicles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    // eigene Fahrzeuge: farbiger Ring darunter
    map.addLayer({
      id: 'vehicles-player-halo',
      type: 'circle',
      source: 'vehicles',
      filter: ['==', ['get', 'player'], true],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 9, 12, 13, 16, 20],
        'circle-color': 'rgba(255, 222, 0, 0.35)',
        'circle-stroke-color': '#c79a00',
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: 'vehicles',
      type: 'symbol',
      source: 'vehicles',
      filter: ['==', ['get', 'player'], true],
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

/** Optionale Datei (z. B. fields.bin älterer Kartendaten): null statt Fehler. */
async function fetchOptionalBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url);
    return r.ok ? await r.arrayBuffer() : null;
  } catch {
    return null;
  }
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status} – Kartendaten fehlen? (npm run map-data)`);
  return r.arrayBuffer();
}
