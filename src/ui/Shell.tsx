/**
 * Rahmen der Oberfläche: Leitstand (Startseite), Fahrzeugleiste über der Karte,
 * Meldungen (Toasts) und Kartenebenen.
 */
import { useEffect, useRef, useState } from 'react';
import { LAYER_GROUPS, type GameController, type GameStatus, type LayerGroup } from '../game/controller';
import { formatGameTime } from '../game/clock';
import { SERVICE_NAMES, fmtDay, fmtTime, partsText } from '../sim/business';
import type { Machine } from '../sim/economy';
import { eur } from './Panels';

/** Bereiche der Navigationsleiste */
export type AreaId = 'leitstand' | 'auftraege' | 'fuhrpark' | 'personal' | 'finanzen' | 'markt' | 'sparten' | 'auswertung' | 'meldungen' | 'technik';
export type Go = (area: AreaId, sub?: string) => void;

const machineName = (m: Pick<Machine, 'brand' | 'model'>) => [m.brand, m.model].filter(Boolean).join(' ');
const weekday = (day: number) => formatGameTime(day * 1440).date.slice(0, 2);

export type Tone = 'ok' | 'run' | 'warn' | 'info' | 'muted';

interface Attention {
  key: string;
  tone: Tone;
  title: string;
  sub: string;
  badge: string;
  actions: { label: string; run: () => void; testid?: string }[];
}

/** Startseite: Kennzahlen und was eine Entscheidung braucht */
export function Leitstand({ status, game, go }: { status: GameStatus; game: GameController | null; go: Go }) {
  const [msg, setMsg] = useState<string | null>(null);
  const b = status.business;
  const c = status.company;
  if (!b || !c) return <p className="hint">–</p>;
  const send = async (cmd: Parameters<GameController['command']>[0]) => {
    const m = await game!.command(cmd);
    setMsg(m);
    setTimeout(() => setMsg((x) => (x === m ? null : x)), 4000);
  };
  const t = b.time;
  const dayEnd = (Math.floor(t / 1440) + 1) * 1440;
  const units = b.units;
  const busy = units.filter((u) => u.busy).length;
  const down = c.machines.filter((m) => m.repair || (m.downUntil ?? 0) > t).length;
  const drivers = c.drivers.filter((d) => !d.hiredFarmId);
  const onDuty = drivers.filter((d) => b.driverStatus[d.id]).length;
  const week = b.invoices.filter((i) => i.issuedAt >= t - 7 * 1440).reduce((a, i) => a + i.amount, 0);
  const prevWeek = b.invoices.filter((i) => i.issuedAt >= t - 14 * 1440 && i.issuedAt < t - 7 * 1440).reduce((a, i) => a + i.amount, 0);
  const open = b.requests.filter((r) => r.status === 'offen');
  const expiring = open.filter((r) => r.replyBy <= dayEnd);
  const farmName = (id: number) => game?.farmById(id)?.name ?? `Betrieb ${id}`;

  const items: Attention[] = [];
  if (c.bankruptAt !== undefined) items.push({ key: 'bankrott', tone: 'warn', title: 'Insolvenz – Spiel vorbei', sub: 'Die Sanierung ist gescheitert. Einen älteren Spielstand laden oder neu beginnen.', badge: 'Ende', actions: [] });
  else if (c.sanierung) items.push({ key: 'sanierung', tone: 'warn', title: `Sanierungsphase bis ${fmtDay(c.sanierung.until)}`, sub: 'Keine Käufe und neuen Darlehen. Konto im Rahmen halten, sonst verwertet die Bank Maschinen.', badge: 'Bank', actions: [{ label: 'Finanzen', run: () => go('finanzen', 'ueberblick') }] });
  for (const m of c.machines) {
    if (m.repair?.state === 'wartet') {
      items.push({
        key: `panne${m.id}`, tone: 'warn', title: `Panne: ${machineName(m)}`,
        sub: `${partsText(m.repair)} · ohne Entscheidung ruft der Fahrer um ${fmtTime(m.repair.since + 60)} den Händler`, badge: 'Stillstand',
        actions: [
          { label: 'Händler-Service', run: () => send({ kind: 'repair', machineId: m.id, mode: 'dealer' }) },
          { label: 'Werkstatt …', run: () => go('fuhrpark', 'werkstatt') },
        ],
      });
    }
  }
  for (const r of expiring) {
    items.push({
      key: `anfrage${r.id}`, tone: r.notOffered ? 'muted' : 'run', title: `Anfrage läuft ab: ${farmName(r.farmId)}`,
      sub: `${SERVICE_NAMES[r.service]} · Antwort bis ${fmtTime(r.replyBy)}${r.notOffered ? ' · bieten wir nicht an, Absage ohne Folgen' : ''}`, badge: `${Math.max(0, Math.round((r.replyBy - t) / 60))} h`,
      actions: [
        { label: 'Ansehen', run: () => go('auftraege', 'anfragen') },
        { label: 'Ablehnen', run: () => send({ kind: 'respond', requestId: r.id, action: 'reject' }) },
      ],
    });
  }
  for (const i of b.invoices) {
    if (i.status === 'überfällig' && i.remindedAt === undefined) {
      items.push({
        key: `rechnung${i.id}`, tone: 'warn', title: `Rechnung überfällig: ${farmName(i.farmId)}`,
        sub: `${eur(i.amount)} · ${i.number} · Kunden bis ${fmtDay(i.contactBy!)} anrufen oder besuchen`, badge: 'überfällig',
        actions: [
          { label: 'Anrufen', run: () => send({ kind: 'remind', invoiceId: i.id }) },
          { label: 'Besuchen', run: () => send({ kind: 'visit', farmId: i.farmId }) },
        ],
      });
    }
  }
  for (const o of b.orders) {
    if (o.status !== 'fertig' && !o.cancelled && t > o.latest) {
      items.push({ key: `spaet${o.id}`, tone: 'warn', title: `Verspätet: ${o.ownLeaseId !== undefined ? 'Eigene Fläche' : farmName(o.farmId)}`, sub: `${SERVICE_NAMES[o.service]} · Zeitfenster war bis ${fmtDay(o.latest)}`, badge: 'verspätet', actions: [{ label: 'Aufträge', run: () => go('auftraege', 'laufend') }] });
    }
  }
  for (const r of b.staffRequests) {
    const e = c.drivers.find((d) => d.id === r.employeeId);
    items.push({ key: `wunsch${r.id}`, tone: 'info', title: `Wunsch: ${e?.name ?? 'Mitarbeiter'}`, sub: `${r.kind === 'urlaub' ? `Urlaub ${r.days} Tage ab ${fmtDay(r.from!)}` : `mehr Lohn: ${r.wage!.toLocaleString('de-DE')} €/h`} · Antwort bis ${fmtDay(r.until)}`, badge: 'Personal', actions: [{ label: 'Zusagen', run: () => send({ kind: 'staffAnswer', requestId: r.id, accept: true }) }, { label: 'Ablehnen', run: () => send({ kind: 'staffAnswer', requestId: r.id, accept: false }) }] });
  }
  if (b.weather.blocked) items.push({ key: 'wetter', tone: 'info', title: 'Feldarbeit ruht', sub: b.weather.blocked, badge: 'Wetter', actions: [] });
  else {
    const wet = b.weather.forecast.find((f) => f.day > Math.floor(t / 1440) && f.blocked);
    if (wet) items.push({ key: 'wetter', tone: 'info', title: `Nässe ab ${weekday(wet.day)} erwartet`, sub: `${wet.rainMm.toLocaleString('de-DE', { maximumFractionDigits: 0 })} mm Regen (${Math.round(wet.rainChance * 100)} %) · Feldarbeit vorher abschließen`, badge: 'Wetter', actions: [] });
  }
  for (const f of b.frameOffers) items.push({ key: `rahmen${f.id}`, tone: 'info', title: `Rahmenvertrag angeboten: ${farmName(f.farmId)}`, sub: `${f.services.map((x) => SERVICE_NAMES[x]).join(', ')} · ${f.years} Jahre · Antwort bis ${fmtDay(f.until)}`, badge: 'Angebot', actions: [{ label: 'Ansehen', run: () => go('auftraege', 'wettbewerb') }] });

  return (
    <>
      <div className="kpis" data-testid="leitstand">
        <div className="kpi"><span>Gespanne im Einsatz</span><strong>{busy} / {units.length}</strong><small className={down ? 'neg' : ''}>{down ? `${down} in der Werkstatt` : 'keine Panne'}</small></div>
        <div className="kpi"><span>Fahrer im Dienst</span><strong>{onDuty} / {drivers.length}</strong><small>Chef {(b.chefMinutes / 60).toLocaleString('de-DE', { maximumFractionDigits: 1 })} von {b.chefMaxMinutes / 60} h</small></div>
        <div className="kpi"><span>Umsatz 7 Tage</span><strong>{eur(week)}</strong><small className={week >= prevWeek ? 'pos' : 'neg'}>{prevWeek ? `${week >= prevWeek ? '+' : ''}${Math.round(((week - prevWeek) / prevWeek) * 100)} % zur Vorwoche` : 'Vorwoche ohne Rechnung'}</small></div>
        <div className="kpi"><span>Offene Anfragen</span><strong>{open.length}</strong><small className={expiring.length ? 'neg' : ''}>{expiring.length ? `${expiring.length} laufen heute ab` : 'keine läuft heute ab'}</small></div>
      </div>
      <h2>Braucht deine Entscheidung</h2>
      {items.length ? (
        <ul className="cards" data-testid="attention">
          {items.map((x) => (
            <li key={x.key} className={`card tone-${x.tone}`}>
              <div className="card-head"><strong>{x.title}</strong><span className={`badge ${x.tone}`}>{x.badge}</span></div>
              <small className="hint">{x.sub}</small>
              {x.actions.length > 0 && <div className="card-actions">{x.actions.map((a) => <button key={a.label} onClick={a.run}>{a.label}</button>)}</div>}
            </li>
          ))}
        </ul>
      ) : <p className="hint">Alles im Griff – nichts wartet auf dich.</p>}
      {msg && <p className="feedback">{msg}</p>}
      <h2>Wetter</h2>
      <div className="forecast">
        {b.weather.forecast.slice(0, 5).map((f) => (
          <div key={f.day} className={f.blocked ? 'wet' : ''}>
            <span>{weekday(f.day)}</span>
            <strong>{f.rainMm >= 5 ? '🌧' : f.rainMm > 0 ? '🌦' : '☀'} {Math.round(f.temp)}°</strong>
            <small>{f.rainMm > 0 ? `${f.rainMm.toLocaleString('de-DE', { maximumFractionDigits: 0 })} mm` : 'trocken'}</small>
          </div>
        ))}
      </div>
    </>
  );
}

/** Ampelfarbe eines Gespanns */
function unitTone(status: GameStatus, machineId: number, busy: boolean, text: string): Tone {
  const m = status.company?.machines.find((x) => x.id === machineId);
  if (m && (m.repair || (m.downUntil ?? 0) > (status.business?.time ?? 0))) return 'warn';
  if (/wartet|Pause|Ruhezeit|ruht/i.test(text)) return 'run';
  return busy ? 'ok' : 'muted';
}

/** Leiste über der Karte: jedes eigene Gespann mit Ampel, Aufgabe und Fortschritt */
export function FleetBar({ status, game }: { status: GameStatus; game: GameController | null }) {
  const [open, setOpen] = useState(true);
  const b = status.business;
  if (!b || !b.units.length) return null;
  return (
    <div className={`fleet-bar ${open ? '' : 'closed'}`} data-testid="fleet-bar">
      <button className="fleet-toggle" onClick={() => setOpen((o) => !o)} title={open ? 'Leiste einklappen' : 'Fahrzeuge zeigen'}>{open ? '▾' : `▴ ${b.units.length} Fahrzeuge`}</button>
      {open && b.units.map((u) => {
        const m = status.company?.machines.find((x) => x.id === u.machineId);
        const o = u.orderId !== undefined ? b.orders.find((x) => x.id === u.orderId) : undefined;
        const pct = o && o.fields.length ? Math.round((o.doneFields.length / o.fields.length) * 100) : 0;
        const tone = unitTone(status, u.machineId, u.busy, u.status);
        return (
          <button key={u.vehicle} className={`fleet-tile tone-${tone}`} onClick={() => game?.flyToVehicle(u.vehicle)} title={u.status}>
            <span className="fleet-name"><i className={`dot ${tone}`} />{m ? machineName(m) : `Fahrzeug ${u.vehicle}`}</span>
            <small>{u.status}</small>
            <span className="meter"><span style={{ width: `${tone === 'warn' ? 100 : pct}%` }} /></span>
          </button>
        );
      })}
    </div>
  );
}

interface Toast { id: string; tone: Tone; title: string; text: string; area: AreaId; sub?: string; farmId?: number }

/** Meldungen oben rechts über der Karte: neue Anfragen und Pannen */
export function Toasts({ status, game, go }: { status: GameStatus; game: GameController | null; go: Go }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const b = status.business;
  useEffect(() => {
    if (!b) return;
    const now: Toast[] = [];
    for (const r of b.requests) {
      if (r.status !== 'offen') continue;
      now.push({ id: `r${r.id}`, tone: 'run', title: 'Neue Anfrage', text: `${game?.farmById(r.farmId)?.name ?? 'Kunde'}: ${SERVICE_NAMES[r.service]}, bis ${fmtDay(r.latest)}`, area: 'auftraege', sub: 'anfragen', farmId: r.farmId });
    }
    for (const m of status.company?.machines ?? []) {
      if (m.repair) now.push({ id: `p${m.id}-${m.repair.since}`, tone: 'warn', title: 'Panne', text: `${machineName(m)}: ${partsText(m.repair)}`, area: 'fuhrpark', sub: 'werkstatt' });
    }
    // beim ersten Stand (z. B. Spielstand geladen) nichts melden
    if (!seen.current) { seen.current = new Set(now.map((x) => x.id)); return; }
    const fresh = now.filter((x) => !seen.current!.has(x.id));
    if (!fresh.length) return;
    for (const x of fresh) seen.current.add(x.id);
    setToasts((cur) => [...fresh.reverse(), ...cur].slice(0, 3));
  }, [b, game, status.company]);
  useEffect(() => {
    if (!toasts.length) return;
    const h = setTimeout(() => setToasts((cur) => cur.slice(0, -1)), 12000);
    return () => clearTimeout(h);
  }, [toasts]);
  // erledigte Anfragen (angenommen, abgelehnt) nicht weiter melden
  const live = toasts.filter((x) => !x.id.startsWith('r') || b?.requests.some((r) => `r${r.id}` === x.id && r.status === 'offen'));
  if (!live.length) return null;
  const close = (id: string) => setToasts((cur) => cur.filter((x) => x.id !== id));
  return (
    <div className="toasts" data-testid="toasts">
      {live.map((x) => (
        <div key={x.id} className={`toast tone-${x.tone}`}>
          <div className="card-head"><strong>{x.title}</strong><button className="close" onClick={() => close(x.id)} aria-label="Schließen">×</button></div>
          <span>{x.text}</span>
          <div className="card-actions">
            <button onClick={() => { go(x.area, x.sub); close(x.id); }}>Ansehen</button>
            {x.farmId !== undefined && <button onClick={() => game?.flyToFarm(x.farmId!)}>Auf Karte</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

const LAYER_LABELS: Record<LayerGroup, string> = { fahrzeuge: 'Fahrzeuge', kunden: 'Kunden', felder: 'Felder', konkurrenz: 'Händler und Konkurrenz' };

/** Kartenebenen umschalten */
export function MapLayers({ game }: { game: GameController | null }) {
  const [on, setOn] = useState<Record<LayerGroup, boolean>>({ fahrzeuge: true, kunden: true, felder: true, konkurrenz: true });
  return (
    <div className="map-layers" role="group" aria-label="Kartenebenen">
      {(Object.keys(LAYER_GROUPS) as LayerGroup[]).map((g) => (
        <button key={g} className={on[g] ? 'active' : ''} aria-pressed={on[g]} onClick={() => { game?.setLayerGroup(g, !on[g]); setOn({ ...on, [g]: !on[g] }); }}>
          {LAYER_LABELS[g]}
        </button>
      ))}
    </div>
  );
}
