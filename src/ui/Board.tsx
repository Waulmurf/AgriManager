/**
 * Planungsboard (Phase 3, Schritt 3): Zeitleiste je Fahrer über sieben Tage. Aufträge per Ziehen
 * auf Fahrer und Tag legen, Balken verschieben, Schlepper und Gerät zuweisen. Warnungen am Balken
 * (Termin, Maschine doppelt belegt oder in der Werkstatt). Die Simulation arbeitet die
 * Warteschlangen der Fahrer ab; das Board schreibt nur in diese Warteschlangen.
 */
import { useState, type DragEvent } from 'react';
import type { GameController, GameStatus } from '../game/controller';
import type { PlanBar } from '../sim/engine';
import type { Machine } from '../sim/economy';
import { fmtDay, fmtTime, type Order, type Request } from '../sim/business';
import { formatGameTime } from '../game/clock';

/** sichtbares Fenster je Tag: 06:00–22:00 */
const DAY_SPAN = 16 * 60;
const DAYS = 7;

const machineName = (m: Machine) => [m.brand, m.model].filter(Boolean).join(' ');
const eur = (v: number) => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** Schlepper/Gerät-Kombination mit der höchsten Flächenleistung, die zusammenpasst */
export function bestCombo(machines: Machine[]): { tractorId: number; implementId: number } | null {
  let best: { tractorId: number; implementId: number; ha: number } | null = null;
  for (const g of machines.filter((m) => m.type === 'grubber')) {
    for (const t of machines.filter((m) => m.type === 'schlepper')) {
      if ((g.powerNeed ?? 0) > (t.power ?? 0)) continue;
      // möglichst nicht den stärksten Schlepper für ein kleines Gerät verbrauchen
      const ha = (g.haPerHour ?? 0) - (t.power ?? 0) / 10000;
      if (!best || ha > best.ha) best = { tractorId: t.id, implementId: g.id, ha };
    }
  }
  return best && { tractorId: best.tractorId, implementId: best.implementId };
}

/** Ein Balken über mehrere Tage: in Stücke je Tag zerlegen (Position in % der Zeile) */
function segments(bar: PlanBar, viewStart: number): { left: number; width: number }[] {
  const out: { left: number; width: number }[] = [];
  for (let d = 0; d < DAYS; d++) {
    const d0 = viewStart + d * 1440;
    const a = Math.max(bar.start, d0);
    const b = Math.min(bar.end, d0 + DAY_SPAN);
    if (b <= a) continue;
    const left = ((d + (a - d0) / DAY_SPAN) / DAYS) * 100;
    const width = Math.max(0.6, (((b - a) / DAY_SPAN) / DAYS) * 100);
    out.push({ left, width });
  }
  return out;
}

type DragData = { kind: 'order'; orderId: number } | { kind: 'bar'; queueId: number };

export function PlanningBoard({ status, game, onClose }: { status: GameStatus; game: GameController | null; onClose: () => void }) {
  const b = status.business;
  const c = status.company;
  const [week, setWeek] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (!b || !c) return null;
  const today0 = Math.floor(b.time / 1440) * 1440;
  const viewStart = today0 + week * DAYS * 1440;
  const show = (m: string) => { setMsg(m); setTimeout(() => setMsg((x) => (x === m ? null : x)), 5000); };
  const send = async (cmd: Parameters<GameController['command']>[0]) => show(await game!.command(cmd));

  const queuedOrders = new Set(b.plan.filter((x) => x.orderId !== undefined).map((x) => x.orderId!));
  const unplanned: Order[] = b.orders.filter((o) => o.status === 'offen' && !queuedOrders.has(o.id));
  const requests: Request[] = b.requests.filter((r) => r.status === 'offen');
  const selected = b.plan.find((x) => x.key === sel) ?? null;

  const dropAt = (e: DragEvent, driverId: number, day: number) => {
    e.preventDefault();
    let data: DragData;
    try { data = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }
    const dayStart = viewStart + day * 1440;
    const notBefore = dayStart <= b.time ? undefined : dayStart;
    if (data.kind === 'order') {
      const combo = bestCombo(c.machines);
      if (!combo) { show('Kein passendes Gespann (Schlepper + Grubber) im Fuhrpark'); return; }
      void send({ kind: 'plan', orderId: data.orderId, driverId, ...combo, notBefore });
    } else {
      void send({ kind: 'queueEdit', queueId: data.queueId, driverId, notBefore: notBefore ?? null });
    }
  };
  const drag = (data: DragData) => (e: DragEvent) => {
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
  };

  const tractors = c.machines.filter((m) => m.type === 'schlepper');
  const implementsList = c.machines.filter((m) => m.type === 'grubber');
  const dayLabels = Array.from({ length: DAYS }, (_, d) => {
    const t = formatGameTime(viewStart + d * 1440);
    return t.date.slice(0, 2) + ' ' + t.date.slice(4, 10);
  });
  const nowPct = week === 0 ? (((b.time - viewStart) % 1440) / DAY_SPAN) * (100 / DAYS) : -1;

  return (
    <div className="board" data-testid="board" role="dialog" aria-label="Planungsboard">
      <div className="board-head">
        <strong>Planungsboard</strong>
        <span className="board-nav">
          <button onClick={() => setWeek((w) => Math.max(0, w - 1))} disabled={week === 0}>‹</button>
          <span>{dayLabels[0]} – {dayLabels[DAYS - 1]}</span>
          <button onClick={() => setWeek((w) => w + 1)}>›</button>
        </span>
        <button onClick={onClose} aria-label="Schließen" data-testid="board-close">✕</button>
      </div>
      <div className="board-grid">
        <div className="board-row board-days">
          <div className="board-name" />
          <div className="board-track">
            {dayLabels.map((l, d) => <div key={d} className="board-day" style={{ left: `${(d / DAYS) * 100}%`, width: `${100 / DAYS}%` }}>{l}<small> 06–22</small></div>)}
          </div>
        </div>
        {c.drivers.map((dr) => (
          <div className="board-row" key={dr.id} data-testid="board-row">
            <div className="board-name">
              <strong>{dr.isPlayer ? 'Chef' : dr.name}</strong>
              <small>Boden {dr.skills.boden} · heute {((b.driverMinutes[dr.id] ?? 0) / 60).toLocaleString('de-DE', { maximumFractionDigits: 1 })} h</small>
            </div>
            <div className="board-track">
              {Array.from({ length: DAYS }, (_, d) => (
                <div
                  key={d}
                  className="board-cell"
                  style={{ left: `${(d / DAYS) * 100}%`, width: `${100 / DAYS}%` }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => dropAt(e, dr.id, d)}
                  data-testid={`cell-${dr.id}-${d}`}
                />
              ))}
              {nowPct >= 0 && nowPct <= 100 / DAYS && <div className="board-now" style={{ left: `${nowPct}%` }} />}
              {b.plan.filter((x) => x.driverId === dr.id).flatMap((bar) =>
                segments(bar, viewStart).map((sg, i) => (
                  <div
                    key={`${bar.key}-${i}`}
                    className={`board-bar ${bar.kind}${bar.warnings.length ? ' warn' : ''}${sel === bar.key ? ' sel' : ''}`}
                    style={{ left: `${sg.left}%`, width: `${sg.width}%` }}
                    draggable={bar.kind === 'queued'}
                    onDragStart={bar.queueId !== undefined ? drag({ kind: 'bar', queueId: bar.queueId }) : undefined}
                    onClick={() => setSel(bar.key)}
                    title={`${bar.label}\n${fmtDay(bar.start)} ${fmtTime(bar.start)} – ${fmtDay(bar.end)} ${fmtTime(bar.end)}${bar.warnings.length ? '\n⚠ ' + bar.warnings.join('\n⚠ ') : ''}`}
                    data-testid="board-bar"
                  >
                    {bar.warnings.length ? '⚠ ' : ''}{bar.label}
                  </div>
                )),
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="board-bottom">
        <div className="board-pool">
          <h3>Ungeplante Aufträge ({unplanned.length})</h3>
          {unplanned.length ? (
            <ul className="board-cards">
              {unplanned.map((o) => {
                const e = b.estimates[o.id];
                return (
                  <li key={o.id} draggable onDragStart={drag({ kind: 'order', orderId: o.id })} className={e && e.finishAt > o.latest ? 'warn' : ''} data-testid="board-order">
                    <strong>{game?.farmById(o.farmId)?.name ?? `Betrieb ${o.farmId}`}</strong>
                    <small>Grubbern {o.areaHa.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ha · bis {fmtDay(o.latest)}{e ? ` · ca. ${(e.minutes / 60).toLocaleString('de-DE', { maximumFractionDigits: 1 })} h` : ''}</small>
                  </li>
                );
              })}
            </ul>
          ) : <p className="hint">Alles eingeplant.</p>}
          <p className="hint">Auftrag auf Fahrer und Tag ziehen. Geplante Balken lassen sich verschieben; Klick zeigt Details.</p>
        </div>
        <div className="board-pool">
          <h3>Offene Anfragen ({requests.length})</h3>
          {requests.length ? (
            <ul className="board-cards">
              {requests.map((r) => {
                const e = b.estimates[r.id];
                const ok = !e || e.finishAt <= r.latest;
                return (
                  <li key={r.id} className={ok ? '' : 'warn'}>
                    <strong>{game?.farmById(r.farmId)?.name ?? `Betrieb ${r.farmId}`}</strong>
                    <small>Grubbern {r.areaHa.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ha · {r.priceHa} €/ha · bis {fmtDay(r.latest)}{e ? ` · fertig etwa ${fmtDay(e.finishAt)} ${ok ? '✓' : '⚠'}` : ''}</small>
                    <span className="card-actions">
                      <button onClick={() => send({ kind: 'respond', requestId: r.id, action: 'accept' })}>Annehmen</button>
                      <button onClick={() => send({ kind: 'respond', requestId: r.id, action: 'reject' })}>Ablehnen</button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="hint">Keine offenen Anfragen.</p>}
        </div>
        <div className="board-pool">
          <h3>Auswahl</h3>
          {selected ? (
            <div data-testid="board-detail">
              <strong>{selected.label}</strong>
              <small className="hint">{selected.kind === 'running' ? 'läuft' : selected.kind === 'visit' ? 'Besuch läuft' : 'geplant'} · {fmtDay(selected.start)} {fmtTime(selected.start)} – {fmtDay(selected.end)} {fmtTime(selected.end)}{selected.latest !== undefined ? ` · Termin ${fmtDay(selected.latest)}` : ''}</small>
              {selected.warnings.map((w, i) => <small key={i} className="warn">⚠ {w}</small>)}
              {selected.kind === 'running' && selected.vehicle !== undefined && (
                <div className="board-form">
                  <label>Fahrer wechseln
                    <select value={selected.driverId} onChange={(e) => send({ kind: 'swapDriver', vehicle: selected.vehicle!, driverId: Number(e.target.value) })}>
                      {c.drivers.map((d) => <option key={d.id} value={d.id} disabled={d.id !== selected.driverId && !!b.driverStatus[d.id]}>{d.isPlayer ? 'Chef' : d.name}{b.driverStatus[d.id] && d.id !== selected.driverId ? ` (${b.driverStatus[d.id]})` : ''}</option>)}
                    </select>
                  </label>
                </div>
              )}
              {selected.kind === 'queued' && selected.queueId !== undefined && (
                <div className="board-form">
                  {selected.orderId !== undefined && (
                    <>
                      <label>Fahrer
                        <select value={selected.driverId} onChange={(e) => send({ kind: 'queueEdit', queueId: selected.queueId!, driverId: Number(e.target.value) })}>
                          {c.drivers.map((d) => <option key={d.id} value={d.id}>{d.isPlayer ? 'Chef' : d.name}</option>)}
                        </select>
                      </label>
                      <label>Schlepper
                        <select value={selected.tractorId} onChange={(e) => send({ kind: 'queueEdit', queueId: selected.queueId!, tractorId: Number(e.target.value) })}>
                          {tractors.map((m) => <option key={m.id} value={m.id}>{machineName(m)} ({m.power} PS)</option>)}
                        </select>
                      </label>
                      <label>Gerät
                        <select value={selected.implementId} onChange={(e) => send({ kind: 'queueEdit', queueId: selected.queueId!, implementId: Number(e.target.value) })}>
                          {implementsList.map((m) => <option key={m.id} value={m.id}>{machineName(m)} ({m.width} m, ab {m.powerNeed} PS)</option>)}
                        </select>
                      </label>
                    </>
                  )}
                  <label>Start frühestens
                    <select value={selected.notBefore ? Math.floor(selected.notBefore / 1440) * 1440 : ''} onChange={(e) => send({ kind: 'queueEdit', queueId: selected.queueId!, notBefore: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">sofort</option>
                      {Array.from({ length: 14 }, (_, d) => today0 + (d + 1) * 1440).map((t) => {
                        const g = formatGameTime(t);
                        return <option key={t} value={t}>{g.date.slice(0, 2)} {g.date.slice(4, 10)}</option>;
                      })}
                    </select>
                  </label>
                  <button onClick={() => { void send({ kind: 'dequeue', queueId: selected.queueId! }); setSel(null); }}>Aus dem Plan nehmen</button>
                </div>
              )}
            </div>
          ) : <p className="hint">Balken anklicken.</p>}
          {msg && <p className="feedback" data-testid="board-msg">{msg}</p>}
          <p className="hint">Konto {eur(c.cash)} · Arbeitszeit je Fahrer höchstens 10 h am Tag, Start neuer Aufgaben bis 20:00.</p>
        </div>
      </div>
    </div>
  );
}
