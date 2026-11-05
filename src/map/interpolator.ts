/**
 * Glättet Fahrzeugbewegungen zwischen den Schnappschüssen des Workers.
 * Interpoliert wird die Distanz entlang der Route (nicht die Luftlinie), damit
 * Fahrzeuge auch bei 100x auf der Straße bleiben. Die Darstellung läuft etwas
 * mehr als ein Meldeintervall hinter der Simulation her.
 */
import { MAX_SNAPSHOTS_PER_SECOND, STEPS_PER_SECOND_AT_1X, type Speed, type WireRoute } from '../sim/protocol';
import { SNAPSHOT_STRIDE } from '../sim/engine';

interface Snap {
  time: number;
  recv: number;
  positions: Float64Array;
}

export interface VehicleSample {
  lon: number;
  lat: number;
  /** Fahrtrichtung in Grad, 0 = Nord, im Uhrzeigersinn */
  bearing: number;
  state: number;
  /** bearbeitetes Feld (Index in fields.bin) oder -1 */
  field: number;
}

const MAX_SNAPS = 12;

export class VehicleInterpolator {
  private routes = new Map<number, WireRoute>();
  private snaps: Snap[] = [];
  private speed: Speed = 0;
  private lastBearing: Float64Array = new Float64Array(0);
  /** zuletzt gezeigte Spielzeit (für Anzeige der Uhr) */
  renderTime = 0;
  private clock = 0;
  private clockAt = 0;

  get routeCount() {
    return this.routes.size;
  }

  addTick(time: number, speed: Speed, positions: Float64Array, routes: WireRoute[], now: number) {
    for (const r of routes) this.routes.set(r.id, r);
    this.speed = speed;
    const last = this.snaps[this.snaps.length - 1];
    if (last && time < last.time) this.snaps = []; // Neustart
    if (last && time === last.time) this.snaps.pop();
    this.snaps.push({ time, recv: now, positions });
    if (this.snaps.length > MAX_SNAPS) this.snaps.shift();
    if (this.lastBearing.length !== positions.length / SNAPSHOT_STRIDE) {
      this.lastBearing = new Float64Array(positions.length / SNAPSHOT_STRIDE);
    }
    this.pruneRoutes();
  }

  /**
   * Spielzeit, die zum Zeitpunkt `now` (ms) dargestellt wird. Die Darstellungsuhr
   * läuft mit der eingestellten Rate weiter und wird nur sanft an das Ziel
   * (letzte Meldung minus Rückstand) herangeführt. So erzeugen verspätet oder
   * gebündelt eintreffende Meldungen keine Sprünge.
   */
  timeAt(now: number): number {
    const n = this.snaps.length;
    if (n === 0) return 0;
    const latest = this.snaps[n - 1];
    const oldest = this.snaps[0].time;
    if (this.speed === 0 || n === 1) {
      this.clock = latest.time;
      this.clockAt = now;
      return latest.time;
    }
    const rate = this.speed * STEPS_PER_SECOND_AT_1X; // Schritte pro Sekunde
    const interval = Math.max(1 / rate, 1 / MAX_SNAPSHOTS_PER_SECOND); // s zwischen Meldungen
    const lag = rate * interval * 1.25; // Spielminuten Rückstand
    const target = latest.time - lag + ((now - latest.recv) / 1000) * rate;
    const dt = Math.max(0, (now - this.clockAt) / 1000);
    let t = this.clock + dt * rate;
    const err = target - t;
    if (this.clockAt === 0 || Math.abs(err) > lag * 4 + rate) {
      t = target; // Neustart oder großer Versatz (z. B. Geschwindigkeitswechsel)
    } else {
      t += err * Math.min(1, dt * 3);
    }
    t = Math.min(latest.time, Math.max(oldest, t));
    // nie rückwärts laufen
    if (t < this.clock && this.clock <= latest.time) t = this.clock;
    this.clock = t;
    this.clockAt = now;
    return t;
  }

  /** Schreibt für jedes Fahrzeug Position und Richtung nach `out`. */
  sample(now: number, out: VehicleSample[]): number {
    const n = this.snaps.length;
    if (n === 0) return 0;
    const t = this.timeAt(now);
    this.renderTime = t;
    let i = n - 1;
    while (i > 0 && this.snaps[i - 1].time > t) i--;
    const b = this.snaps[i];
    const a = i > 0 ? this.snaps[i - 1] : b;
    const span = b.time - a.time;
    const f = span > 0 ? Math.min(1, Math.max(0, (t - a.time) / span)) : 1;
    const count = b.positions.length / SNAPSHOT_STRIDE;
    for (let v = 0; v < count; v++) {
      const k = v * SNAPSHOT_STRIDE;
      const rb = b.positions[k];
      const db = b.positions[k + 1];
      const st = f < 1 ? a.positions[k + 2] : b.positions[k + 2];
      const fieldIdx = f < 1 ? a.positions[k + 3] : b.positions[k + 3];
      let rid = rb;
      let d = db;
      if (a.positions[k] === rb) {
        d = a.positions[k + 1] + (db - a.positions[k + 1]) * f;
      } else if (f < 1) {
        // Route hat gewechselt: Rest der alten Route, dann Anfang der neuen
        const ra = this.routes.get(a.positions[k]);
        if (ra) {
          const remain = ra.cum[ra.cum.length - 1] - a.positions[k + 1];
          const total = remain + db;
          const dd = total * f;
          if (dd < remain) {
            rid = a.positions[k];
            d = a.positions[k + 1] + dd;
          } else {
            d = dd - remain;
          }
        } else {
          d = db * f;
        }
      }
      const s = out[v] ?? (out[v] = { lon: 0, lat: 0, bearing: 0, state: 0, field: -1 });
      s.state = st;
      s.field = fieldIdx;
      const r = this.routes.get(rid);
      if (!r) continue;
      pointOn(r, d, s);
      // Richtung aus einem kurzen Stück voraus bzw. zurück
      const p1 = { lon: 0, lat: 0 };
      const p2 = { lon: 0, lat: 0 };
      const total = r.cum[r.cum.length - 1];
      pointOn(r, Math.max(0, Math.min(d, total - 4)), p1);
      pointOn(r, Math.min(total, Math.max(d, 0) + 4), p2);
      const dx = (p2.lon - p1.lon) * Math.cos((s.lat * Math.PI) / 180);
      const dy = p2.lat - p1.lat;
      if (dx !== 0 || dy !== 0) this.lastBearing[v] = (Math.atan2(dx, dy) * 180) / Math.PI;
      s.bearing = this.lastBearing[v];
    }
    return count;
  }

  /** Routen, die in keinem gepufferten Schnappschuss mehr vorkommen, verwerfen. */
  private pruneRoutes() {
    if (this.routes.size < 200) return;
    const used = new Set<number>();
    for (const s of this.snaps) for (let k = 0; k < s.positions.length; k += SNAPSHOT_STRIDE) used.add(s.positions[k]);
    for (const id of this.routes.keys()) if (!used.has(id)) this.routes.delete(id);
  }
}

function pointOn(r: WireRoute, d: number, out: { lon: number; lat: number }) {
  const cum = r.cum;
  const n = cum.length;
  if (d <= 0 || n === 1) {
    out.lon = r.coords[0];
    out.lat = r.coords[1];
    return;
  }
  if (d >= cum[n - 1]) {
    out.lon = r.coords[(n - 1) * 2];
    out.lat = r.coords[(n - 1) * 2 + 1];
    return;
  }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const L = cum[hi] - cum[lo];
  const t = L > 0 ? (d - cum[lo]) / L : 0;
  out.lon = r.coords[lo * 2] + (r.coords[hi * 2] - r.coords[lo * 2]) * t;
  out.lat = r.coords[lo * 2 + 1] + (r.coords[hi * 2 + 1] - r.coords[lo * 2 + 1]) * t;
}
