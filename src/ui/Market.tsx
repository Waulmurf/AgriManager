/**
 * Markt als großes Fenster: links Händler wählen (zeigt alles, was er führt) oder „Alle Händler“
 * und oben eine Geräteart (zeigt diese Art bei allen Händlern, günstigster markiert).
 * Neu und gebraucht in einer Liste, nach Preis sortiert.
 */
import { useState } from 'react';
import type { GameController, GameStatus } from '../game/controller';
import { CATALOG, DEALERS, type CatalogModel } from '../data/catalog';
import { BRANDS } from '../data/brands';
import { CHECK_COST, fmtDay } from '../sim/business';
import type { MarketOffer } from '../sim/economy';
import { leaseRate } from '../sim/finance';
import { TYPE_NAMES, eur, machineSpecs } from './Panels';

/** 0 = alle Händler, −1 = Gebrauchtbörse (privat) */
const ALL = 0;
const BOERSE = -1;

const brandColor = (name: string) => BRANDS.find((b) => b.name === name)?.main ?? '#9a978f';

type Item =
  | { kind: 'neu'; key: string; model: CatalogModel; dealerId: number; price: number }
  | { kind: 'gebraucht'; key: string; offer: MarketOffer; price: number };

function dealerBrands(id: number): string[] {
  const d = DEALERS.find((x) => x.id === id);
  return d ? [...d.tractorBrands, ...d.implementBrands] : [];
}

export function MarketWindow({ status, game }: { status: GameStatus; game: GameController | null }) {
  const b = status.business;
  const c = status.company;
  const [dealer, setDealer] = useState(ALL);
  const [type, setType] = useState('alle');
  const [fitOnly, setFitOnly] = useState(false);
  const [showNew, setShowNew] = useState(true);
  const [showUsed, setShowUsed] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  if (!b || !c) return <p className="hint">–</p>;
  const send = async (cmd: Parameters<GameController['command']>[0]) => {
    const m = await game!.command(cmd);
    setMsg(m);
    setTimeout(() => setMsg((x) => (x === m ? null : x)), 5000);
  };
  const maxPower = Math.max(0, ...c.machines.filter((m) => m.type === 'schlepper').map((m) => m.power ?? 0));
  const fits = (m: { type: string; powerNeed?: number }) => !fitOnly || m.type === 'schlepper' || !m.powerNeed || m.powerNeed <= maxPower;
  const disc = (id: number) => Math.min(0.2, (b.discounts[id] ?? 0.05) + (b.incidents.fairDiscount ?? 0));
  const newPrice = (m: CatalogModel, id: number) => Math.round((m.newPrice * (1 - disc(id))) / 100) * 100;

  // alle Angebote (ohne Geräteart-Filter), damit die Chips nur vorhandene Arten zeigen
  const all: Item[] = [];
  if (showNew && dealer !== BOERSE) {
    for (const d of DEALERS) {
      if (dealer !== ALL && d.id !== dealer) continue;
      const brands = dealerBrands(d.id);
      for (const m of CATALOG) if (brands.includes(m.brand) && fits(m)) all.push({ kind: 'neu', key: `n${d.id}-${m.key}`, model: m, dealerId: d.id, price: newPrice(m, d.id) });
    }
  }
  if (showUsed) {
    for (const o of b.offers) {
      const from = o.dealerId ? o.dealerId : BOERSE;
      if (dealer !== ALL && from !== dealer) continue;
      if (fits(o.machine)) all.push({ kind: 'gebraucht', key: `g${o.id}`, offer: o, price: o.price });
    }
  }
  const typeOf = (x: Item) => (x.kind === 'neu' ? x.model.type : x.offer.machine.type);
  const types = [...new Set(all.map(typeOf))].sort((x, y) => (TYPE_NAMES[x] ?? x).localeCompare(TYPE_NAMES[y] ?? y, 'de'));
  const items = all.filter((x) => type === 'alle' || typeOf(x) === type).sort((x, y) => x.price - y.price);
  // gleiches Modell bei mehreren Händlern: günstigsten markieren
  const cheapest = new Map<string, number>();
  const sameCount = new Map<string, number>();
  for (const x of items) if (x.kind === 'neu') {
    cheapest.set(x.model.key, Math.min(cheapest.get(x.model.key) ?? Infinity, x.price));
    sameCount.set(x.model.key, (sameCount.get(x.model.key) ?? 0) + 1);
  }
  const compare = dealer === ALL && type !== 'alle';
  const dName = (id: number) => DEALERS.find((d) => d.id === id)?.name ?? '';
  const typeLabel = type === 'alle' ? '' : TYPE_NAMES[type] ?? type;
  const heading = dealer === ALL
    ? (type === 'alle' ? 'Alle Angebote' : `${typeLabel} bei allen Händlern`)
    : `${dealer === BOERSE ? 'Gebrauchtbörse' : dName(dealer)}${type === 'alle' ? ': alles im Angebot' : `: ${typeLabel}`}`;
  const shown = items.slice(0, 120);
  const sanierung = !!c.sanierung;

  return (
    <div className="market" data-testid="market">
      <aside className="market-dealers">
        <h2>Händler</h2>
        <button className={dealer === ALL ? 'active' : ''} onClick={() => setDealer(ALL)} data-testid="dealer-all">
          <strong>Alle Händler</strong><small>neu und gebraucht</small>
        </button>
        {DEALERS.map((d) => (
          <button key={d.id} className={dealer === d.id ? 'active' : ''} onClick={() => setDealer(d.id)} data-testid={`dealer-${d.id}`}>
            <strong>{d.name}</strong>
            <small>{dealerBrands(d.id).join(', ')} · {d.town} · Rabatt {Math.round(disc(d.id) * 100)} %</small>
          </button>
        ))}
        <button className={dealer === BOERSE ? 'active' : ''} onClick={() => setDealer(BOERSE)} data-testid="dealer-boerse">
          <strong>Gebrauchtbörse</strong><small>privat, ohne Gewährleistung · Werkstattcheck {eur(CHECK_COST)}</small>
        </button>
        {b.deliveries.length > 0 && (
          <>
            <h2>Bestellt</h2>
            <ul className="list">
              {b.deliveries.map((x) => <li key={x.id}><span>{x.machine.brand} {x.machine.model}</span><small className="hint">Lieferung etwa {fmtDay(x.at)} · {eur(x.price)}</small></li>)}
            </ul>
          </>
        )}
      </aside>
      <div className="market-main">
        <div className="market-filters">
          <div className="chips-row" role="group" aria-label="Geräteart">
            <button className={type === 'alle' ? 'active' : ''} onClick={() => setType('alle')}>Alle</button>
            {types.map((t) => <button key={t} className={type === t ? 'active' : ''} onClick={() => setType(t)} data-testid={`type-${t}`}>{TYPE_NAMES[t] ?? t}</button>)}
          </div>
          <div className="market-toggles">
            <label><input type="checkbox" checked={fitOnly} onChange={(e) => setFitOnly(e.target.checked)} /> passt zu meinen Schleppern ({maxPower} PS)</label>
            <label><input type="checkbox" checked={showNew} onChange={(e) => setShowNew(e.target.checked)} data-testid="market-new" /> neu</label>
            <label><input type="checkbox" checked={showUsed} onChange={(e) => setShowUsed(e.target.checked)} data-testid="market-used" /> gebraucht</label>
          </div>
        </div>
        <div className="market-head">
          <h3>{heading}</h3>
          <small className="hint">{items.length} Treffer · nach Preis sortiert{items.length > shown.length ? ` · erste ${shown.length}` : ''}</small>
        </div>
        {compare && <p className="market-note">Eine Geräteart bei allen Händlern: gleiche Modelle stehen untereinander, der günstigste ist markiert.</p>}
        {b.incidents.fairDiscount > 0 && <p className="market-note">Messe: {Math.round(b.incidents.fairDiscount * 100)} % zusätzlicher Rabatt auf neue Maschinen.</p>}
        {sanierung && <p className="warn">Sanierungsphase: keine Käufe und Bestellungen.</p>}
        {msg && <p className="feedback">{msg}</p>}
        <ul className="market-list">
          {shown.map((x) => {
            const m = x.kind === 'neu' ? x.model : x.offer.machine;
            const best = x.kind === 'neu' && compare && (sameCount.get(x.model.key) ?? 0) > 1 && x.price === cheapest.get(x.model.key);
            return (
              <li key={x.key} className="market-card" data-offer={x.kind === 'gebraucht' ? x.offer.id : undefined}>
                <span className="brand-stripe" style={{ background: brandColor(m.brand) }} />
                <div className="market-info">
                  <div className="market-title">
                    <strong>{m.brand} {m.model}</strong>
                    <span className={`badge ${x.kind === 'neu' ? 'ok' : 'run'}`}>{x.kind}</span>
                    {best && <span className="badge best">günstigster</span>}
                  </div>
                  <small>{TYPE_NAMES[m.type]}{machineSpecs(m) ? ` · ${machineSpecs(m)}` : ''}{x.kind === 'neu' ? ` · Lieferzeit etwa ${x.model.deliveryWeeks} Wochen` : ` · Bj. ${x.offer.machine.year}${x.offer.machine.hours ? ` · ${x.offer.machine.hours.toLocaleString('de-DE')} h` : ''} · Zustand ${x.offer.machine.condition} %`}</small>
                  <small className="hint">
                    {x.kind === 'neu'
                      ? `${dName(x.dealerId)} · Liste ${eur(x.model.newPrice)}, Rabatt ${Math.round(disc(x.dealerId) * 100)} % · 24 Monate Gewährleistung`
                      : `${x.offer.seller} – ${x.offer.note}${x.offer.until !== undefined ? ` · bis ${fmtDay(x.offer.until)}` : ''}`}
                  </small>
                  {x.kind === 'gebraucht' && x.offer.checked && <small className={x.offer.machine.defect ? 'warn' : 'hint'}>Werkstattcheck: {x.offer.machine.defect ? `Mangel gefunden – Zustand eher ${Math.max(10, x.offer.machine.condition - 20)} %` : 'keine Mängel'}</small>}
                </div>
                <div className="market-buy">
                  <strong className="price">{eur(x.price)}</strong>
                  {x.kind === 'neu' ? <NewActions x={x} rates={b.leaseRates} send={send} disabled={sanierung} /> : (
                    <div className="card-actions">
                      <button onClick={() => send({ kind: 'buy', offerId: x.offer.id })} disabled={c.cash < x.price || sanierung} data-testid="buy">Kaufen</button>
                      {!x.offer.dealerId && !x.offer.checked && <button onClick={() => send({ kind: 'check', offerId: x.offer.id })}>Werkstattcheck</button>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {!items.length && <p className="hint">{dealer === BOERSE || !showNew ? 'Gerade keine passenden Gebrauchten. Neue Angebote kommen fast täglich.' : 'Dieser Händler führt nichts in dieser Auswahl.'}</p>}
      </div>
    </div>
  );
}

/** Neumaschine: kaufen (Bezahlung bei Lieferung) oder leasen */
function NewActions({ x, rates, send, disabled }: { x: Extract<Item, { kind: 'neu' }>; rates: Record<number, number>; send: (cmd: Parameters<GameController['command']>[0]) => void; disabled: boolean }) {
  const [months, setMonths] = useState(60);
  const rate = leaseRate(x.price, rates[months] ?? 0.059, months);
  return (
    <>
      <small className="hint">Leasing {months} M: {eur(rate.monthly)}/M · Restwert {eur(rate.residual)}</small>
      <div className="card-actions">
        <button onClick={() => send({ kind: 'order', dealerId: x.dealerId, modelKey: x.model.key })} disabled={disabled} data-testid="order-new">Kaufen</button>
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Leasinglaufzeit">
          {[36, 48, 60].map((m) => <option key={m} value={m}>{m} Monate</option>)}
        </select>
        <button onClick={() => send({ kind: 'order', dealerId: x.dealerId, modelKey: x.model.key, leaseMonths: months })} disabled={disabled}>Leasen</button>
      </div>
    </>
  );
}
