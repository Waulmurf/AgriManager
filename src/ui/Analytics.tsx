/**
 * Auswertung (Vorschlag 13): Umsatz je Sparte und Monat (gestapelt), Ergebnis je Monat,
 * Auslastung von Maschinen und Fahrern, Deckungsbeitrag je Kunde. Diagramme als SVG mit
 * Hover-Tooltip, Legende und Tabellenansicht (Farbe nie allein).
 */
import { Fragment, useState } from 'react';
import type { GameController, GameStatus } from '../game/controller';
import { BRANCH_NAMES, type Analytics, type Branch } from '../sim/business';
import { SELF_PROPELLED } from '../sim/economy';

const BRANCHES: Branch[] = ['lohn', 'transport', 'ackerbau', 'biogas'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const eur = (v: number) => `${Math.round(v).toLocaleString('de-DE')} €`;
const keur = (v: number) => (Math.abs(v) >= 10_000 ? `${Math.round(v / 1000).toLocaleString('de-DE')} T€` : eur(v));

/** gerundete Achsenschritte */
function niceMax(v: number): number {
  if (v < 1000) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * p >= v) return f * p;
  return 10 * p;
}

const W = 330, H = 170, PAD_L = 50, PAD_B = 18, PAD_T = 8;

function RevenueChart({ months }: { months: Analytics['months'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = months.map((m) => BRANCHES.reduce((a, k) => a + m.revenue[k], 0));
  const max = niceMax(Math.max(...totals));
  const plotH = H - PAD_B - PAD_T;
  const bw = (W - PAD_L) / months.length;
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  return (
    <div className="viz">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Umsatz je Sparte und Monat" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W} y1={y(t)} y2={y(t)} className="viz-grid" />
            <text x={PAD_L - 6} y={y(t) + 4} textAnchor="end" className="viz-axis">{keur(t)}</text>
          </g>
        ))}
        {months.map((m, i) => {
          let acc = 0;
          const x = PAD_L + i * bw + bw * 0.18;
          const w = bw * 0.64;
          const segs = BRANCHES.filter((k) => m.revenue[k] > 0);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={PAD_L + i * bw} y={PAD_T} width={bw} height={plotH} fill="transparent" />
              {segs.map((k, j) => {
                const v = m.revenue[k];
                const y0 = y(acc), y1 = y(acc + v);
                acc += v;
                // 2px Abstand zwischen Segmenten, oberes Ende abgerundet
                const top = j === segs.length - 1;
                const h = Math.max(0, y0 - y1 - (j > 0 ? 2 : 0));
                return <rect key={k} x={x} y={y1} width={w} height={h} rx={top ? 3 : 0} className={`viz-s-${k}`} />;
              })}
              <text x={PAD_L + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="viz-axis">{MONTHS[m.month - 1]}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="viz-tip" style={{ left: `${((PAD_L + (hover + 0.5) * bw) / W) * 100}%` }}>
          <strong>{MONTHS[months[hover].month - 1]} {months[hover].year}</strong>
          {BRANCHES.map((k) => <div key={k}><i className={`viz-dot viz-s-${k}`} />{BRANCH_NAMES[k]}: {eur(months[hover].revenue[k])}</div>)}
          <div>Summe: {eur(totals[hover])}</div>
        </div>
      )}
      <div className="viz-legend">
        {BRANCHES.map((k) => <span key={k}><i className={`viz-dot viz-s-${k}`} />{BRANCH_NAMES[k]}</span>)}
      </div>
    </div>
  );
}

function ProfitChart({ months }: { months: Analytics['months'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = months.map((m) => m.profit);
  const lim = niceMax(Math.max(1000, ...vals.map(Math.abs)));
  const plotH = H - PAD_B - PAD_T;
  const bw = (W - PAD_L) / months.length;
  const y = (v: number) => PAD_T + plotH / 2 - (v / lim) * (plotH / 2);
  return (
    <div className="viz">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ergebnis je Monat" onMouseLeave={() => setHover(null)}>
        {[-lim, 0, lim].map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W} y1={y(t)} y2={y(t)} className={t === 0 ? 'viz-zero' : 'viz-grid'} />
            <text x={PAD_L - 6} y={y(t) + 4} textAnchor="end" className="viz-axis">{keur(t)}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const v = m.profit;
          const x = PAD_L + i * bw + bw * 0.2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={PAD_L + i * bw} y={PAD_T} width={bw} height={plotH} fill="transparent" />
              <rect x={x} y={Math.min(y(v), y(0))} width={bw * 0.6} height={Math.abs(y(v) - y(0))} rx={2} className="viz-profit" />
              <text x={PAD_L + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="viz-axis">{MONTHS[m.month - 1]}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="viz-tip" style={{ left: `${((PAD_L + (hover + 0.5) * bw) / W) * 100}%` }}>
          <strong>{MONTHS[months[hover].month - 1]} {months[hover].year}</strong>
          <div>Umsatz: {eur(BRANCHES.reduce((a, k) => a + months[hover].revenue[k], 0))}</div>
          <div>direkte Kosten: {eur(BRANCHES.reduce((a, k) => a + months[hover].direct[k], 0))}</div>
          <div>allgemeine Kosten: {eur(months[hover].overhead)}</div>
          <div>Ergebnis: {eur(months[hover].profit)}</div>
        </div>
      )}
    </div>
  );
}

/** Auslastungsbalken (Anteil an einem Richtwert) */
function Bar({ share }: { share: number }) {
  const pct = Math.round(Math.min(1.5, share) * 100);
  return <span className="util-bar" title={`${pct} %`}><span style={{ width: `${Math.min(100, pct)}%` }} /><small>{pct} %</small></span>;
}

export function AnalyticsTab({ status, game }: { status: GameStatus; game: GameController | null }) {
  const b = status.business;
  const c = status.company;
  const [table, setTable] = useState(false);
  if (!b || !c) return <p className="hint">–</p>;
  const a = b.analytics;
  const sum = (k: Branch) => a.months.reduce((s, m) => s + m.revenue[k], 0);
  const machineName = (id: number) => { const m = c.machines.find((x) => x.id === id); return m ? [m.brand, m.model].filter(Boolean).join(' ') : `#${id}`; };
  // Richtwerte je Jahr (Annahme): selbstfahrende Maschinen 800 h, Geräte 300 h; Fahrer 1.900 h
  const target = (id: number) => (SELF_PROPELLED.includes(c.machines.find((x) => x.id === id)?.type ?? 'grubber') ? 800 : 300) * a.yearShare;
  const machines = a.machines.filter((m) => c.machines.find((x) => x.id === m.id)?.type !== 'firmenwagen').sort((x, y) => y.hours - x.hours);
  return (
    <>
      <h2>Umsatz je Sparte (12 Monate)</h2>
      <dl>
        {BRANCHES.map((k) => <Fragment key={k}><dt>{BRANCH_NAMES[k]}</dt><dd>{eur(sum(k))}</dd></Fragment>)}
      </dl>
      <RevenueChart months={a.months} />
      <h2>Ergebnis je Monat</h2>
      <ProfitChart months={a.months} />
      <p className="hint">Ergebnis = Umsatz − direkte Kosten (Ackerbau und Pacht, Biogas, Maut) − allgemeine Kosten (Diesel, Personal, Werkstatt, Gebäude, Zinsen, Leasing, Versicherung), ohne Abschreibung.</p>
      <button onClick={() => setTable(!table)}>{table ? 'Tabelle ausblenden' : 'Als Tabelle'}</button>
      {table && (
        <table className="tbl" data-testid="analytics-table">
          <thead><tr><th>Monat</th>{BRANCHES.map((k) => <th key={k}>{BRANCH_NAMES[k]}</th>)}<th>Kosten</th><th>Ergebnis</th></tr></thead>
          <tbody>
            {a.months.map((m) => (
              <tr key={`${m.year}-${m.month}`}>
                <td>{MONTHS[m.month - 1]} {m.year}</td>
                {BRANCHES.map((k) => <td key={k}>{eur(m.revenue[k])}</td>)}
                <td>{eur(BRANCHES.reduce((s, k) => s + m.direct[k], 0) + m.overhead)}</td>
                <td className={m.profit < 0 ? 'neg' : ''}>{eur(m.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2>Auslastung Maschinen (laufendes Jahr)</h2>
      <table className="tbl" data-testid="util-machines">
        <thead><tr><th>Maschine</th><th>Stunden</th><th>Aufträge</th><th>Umsatz</th><th>Ausl.</th></tr></thead>
        <tbody>
          {machines.map((m) => (
            <tr key={m.id}><td>{machineName(m.id)}</td><td>{m.hours.toLocaleString('de-DE')}</td><td>{m.orders}</td><td>{eur(m.revenue)}</td><td><Bar share={m.hours / Math.max(1, target(m.id))} /></td></tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Richtwert: selbstfahrende Maschinen 800 h, Geräte 300 h im Jahr (anteilig bis heute). Unter 50 % lohnt sich Leasing, Miete oder Verkauf.</p>
      <h2>Auslastung Personal (laufendes Jahr)</h2>
      <table className="tbl" data-testid="util-drivers">
        <thead><tr><th>Mitarbeiter</th><th>Stunden</th><th>Ausl.</th></tr></thead>
        <tbody>
          {a.drivers.map((d) => {
            const e = c.drivers.find((x) => x.id === d.id);
            return <tr key={d.id}><td>{e?.isPlayer ? 'Chef' : e?.name ?? `#${d.id}`}</td><td>{Math.round(d.minutes / 60).toLocaleString('de-DE')}</td><td><Bar share={d.minutes / 60 / (1900 * a.yearShare)} /></td></tr>;
          })}
        </tbody>
      </table>
      <p className="hint">Richtwert 1.900 Arbeitsstunden im Jahr (anteilig). Erfasst wird die Arbeitszeit auf Fahrten und Aufträgen.</p>
      <h2>Kunden nach Deckungsbeitrag</h2>
      {a.customers.length === 0 ? <p className="hint">Noch keine abgeschlossenen Aufträge.</p> : (
        <table className="tbl" data-testid="customers-db">
          <thead><tr><th>Betrieb</th><th>Aufträge</th><th>Umsatz</th><th>DB</th><th>offen</th></tr></thead>
          <tbody>
            {a.customers.slice(0, 25).map((x) => (
              <tr key={x.farmId}>
                <td><button className="link" onClick={() => game?.flyToFarm(x.farmId)}>{game?.farmById(x.farmId)?.name ?? `Betrieb ${x.farmId}`}</button></td>
                <td>{x.orders}</td><td>{eur(x.revenue)}</td><td className={x.margin < 0 ? 'neg' : ''}>{eur(x.margin)}</td><td>{x.open ? eur(x.open) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">Deckungsbeitrag = Rechnungsbetrag − Diesel − Maschinenkosten (Reparatur je Stunde, Verschleiß, Fremdkosten wie Fremdwalze oder Maut), ohne Lohn.</p>
    </>
  );
}
