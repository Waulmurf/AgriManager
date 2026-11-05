/**
 * Seitenleisten-Inhalte für das Spiel: Betrieb, Aufträge (Anfragen + Aufträge), Markt, Nachrichten.
 */
import { useState } from 'react';
import type { GameController, GameStatus } from '../game/controller';
import { machineValue, type Machine } from '../sim/economy';
import { SERVICE_NAMES, fmtDay, type Invoice, type Request, type Order } from '../sim/business';
import { formatGameTime } from '../game/clock';

export const eur = (v: number) => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const ha = (v: number) => `${v.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ha`;
const machineName = (m: Machine) => [m.brand, m.model].filter(Boolean).join(' ');

function useFeedback() {
  const [msg, setMsg] = useState<string | null>(null);
  const show = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 4000);
  };
  return { msg, show };
}

export function BusinessTab({ status, game }: { status: GameStatus; game: GameController | null }) {
  const c = status.company;
  const b = status.business;
  if (!c) return <p className="hint">–</p>;
  const unitStatus = (id: number) => b?.units.find((u) => u.machineId === id)?.status;
  return (
    <>
      <h2>Mein Betrieb</h2>
      <dl data-testid="company">
        <dt>Konto</dt><dd data-testid="cash">{eur(c.cash)}</dd>
        <dt>Kreditrahmen</dt><dd>{eur(c.creditLimit - c.loan)} frei</dd>
        <dt>Standort</dt><dd>Groß Thondorf</dd>
        <dt>Chef</dt><dd>{b?.chefBusy ?? 'im Büro'}</dd>
        <dt>Arbeitszeit heute</dt><dd>{b ? `${(b.chefMinutes / 60).toLocaleString('de-DE', { maximumFractionDigits: 1 })} von ${b.chefMaxMinutes / 60} h` : '–'}</dd>
        <dt>Diesel gesamt</dt><dd>{b ? `${b.dieselTotalL.toLocaleString('de-DE')} l` : '–'}</dd>
      </dl>
      <p className="hint">Rechtsklick auf ein Fahrzeug zeigt Status und Befehle (z. B. zurück zum Hof).</p>
      <h2>Fuhrpark</h2>
      <ul className="machines">
        {c.machines.map((m) => (
          <li key={m.id}>
            <span>
              {machineName(m)}
              {m.power ? `, ${m.power} PS` : ''}
              {m.width ? `, ${m.width.toLocaleString('de-DE')} m` : ''}
            </span>
            <small>
              Bj. {m.year}
              {m.hours ? ` · ${m.hours.toLocaleString('de-DE')} h` : ''} · Zustand {m.condition} % · Wert {eur(machineValue(m))}
            </small>
            {unitStatus(m.id) && <small className="unit-status">{unitStatus(m.id)}</small>}
          </li>
        ))}
      </ul>
      <p className="hint">{c.site}</p>
      <h2>Kunden</h2>
      <dl>
        <dt>Betriebe im Gebiet</dt><dd data-testid="farm-count">{status.farmCount ? status.farmCount.toLocaleString('de-DE') : '–'}</dd>
        <dt>im Adressbuch</dt><dd data-testid="known-count">{status.knownFarms}</dd>
      </dl>
      {status.farmCount ? (
        <p className="hint">Hofstelle auf der Karte anklicken und „Besuchen“ wählen. Erst ein Besuch bringt einen Betrieb ins Adressbuch; danach melden sich Kunden auch per Anruf oder Nachricht.</p>
      ) : (
        <p className="hint">Keine Felddaten geladen – Kunden gibt es erst mit Kartendaten v3.</p>
      )}
      {b && b.knownFarms.length > 0 && (
        <ul className="list">
          {b.knownFarms.map((id) => {
            const f = game?.farmById(id);
            return f ? (
              <li key={id}>
                <button className="link" onClick={() => game?.flyToFarm(id)}>{f.name}</button>
                <small>{ha(f.areaHa)} · Zufriedenheit {f.satisfaction} %</small>
              </li>
            ) : null;
          })}
        </ul>
      )}
    </>
  );
}

function RequestItem({ r, game, time }: { r: Request; game: GameController | null; time: number }) {
  const [price, setPrice] = useState(String(r.priceHa));
  const fb = useFeedback();
  const farm = game?.farmById(r.farmId);
  const send = async (action: 'accept' | 'reject' | 'counter') => {
    const msg = await game!.command({ kind: 'respond', requestId: r.id, action, priceHa: Number(price.replace(',', '.')) });
    fb.show(msg);
  };
  const hoursLeft = Math.max(0, Math.round((r.replyBy - time) / 60));
  return (
    <li className="card" data-testid="request">
      <div className="card-head">
        <button className="link" onClick={() => game?.flyToFarm(r.farmId)}>{farm?.name ?? `Betrieb ${r.farmId}`}</button>
        <small>{r.channel === 'besuch' ? 'beim Besuch' : r.channel === 'anruf' ? 'Anruf' : 'Nachricht'}</small>
      </div>
      <div>
        {SERVICE_NAMES[r.service]}: {r.fields.length} {r.fields.length === 1 ? 'Feld' : 'Felder'}, {ha(r.areaHa)} · bis {fmtDay(r.latest)}
      </div>
      <div>
        Angebot Kunde: <strong>{r.priceHa.toLocaleString('de-DE')} €/ha</strong> = {eur(r.priceHa * r.areaHa)}
      </div>
      {r.status === 'offen' ? (
        <>
          <small className="hint">Antwort erwartet in {hoursLeft} h</small>
          <div className="card-actions">
            <button onClick={() => send('accept')} data-testid="accept">Annehmen</button>
            <button onClick={() => send('reject')}>Ablehnen</button>
            <span className="counter">
              <input value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Gegenangebot €/ha" />
              <button onClick={() => send('counter')}>€/ha anbieten</button>
            </span>
          </div>
        </>
      ) : (
        <small className="hint">{r.status}</small>
      )}
      {fb.msg && <small className="feedback">{fb.msg}</small>}
    </li>
  );
}

function OrderItem({ o, game, status }: { o: Order; game: GameController | null; status: GameStatus }) {
  const c = status.company!;
  const tractors = c.machines.filter((m) => m.type === 'schlepper');
  const implementsOk = c.machines.filter((m) => m.type === 'grubber');
  const [tractor, setTractor] = useState(tractors[0]?.id ?? 0);
  const [impl, setImpl] = useState(0);
  const fb = useFeedback();
  const farm = game?.farmById(o.farmId);
  const implId = impl || implementsOk[0]?.id || 0;
  const start = async () => {
    fb.show(await game!.command({ kind: 'startJob', orderId: o.id, tractorId: tractor, implementId: implId }));
  };
  const late = status.business && o.status !== 'fertig' && status.business.time > o.latest;
  return (
    <li className="card" data-testid="order">
      <div className="card-head">
        <button className="link" onClick={() => game?.flyToFarm(o.farmId)}>{farm?.name ?? `Betrieb ${o.farmId}`}</button>
        <small className={`badge ${o.status === 'fertig' ? 'done' : o.status === 'läuft' ? 'run' : ''}`}>{o.status}</small>
      </div>
      <div>
        {SERVICE_NAMES[o.service]} {ha(o.areaHa)} zu {o.priceHa.toLocaleString('de-DE')} €/ha = {eur(o.priceHa * o.areaHa)}
      </div>
      <small className={late ? 'warn' : 'hint'}>
        Zeitfenster bis {fmtDay(o.latest)}
        {o.status === 'läuft' ? ` · ${o.doneFields.length}/${o.fields.length} Felder fertig` : ''}
        {o.finishedAt !== undefined ? ` · fertig ${formatGameTime(o.finishedAt).date.slice(4)} ${formatGameTime(o.finishedAt).time}` : ''}
        {late ? ' · verspätet!' : ''}
        {o.dieselL > 0 ? ` · Diesel ${o.dieselL.toLocaleString('de-DE')} l (${eur(o.dieselCost)})` : ''}
      </small>
      {o.status === 'offen' && (
        <div className="card-actions">
          <select value={tractor} onChange={(e) => setTractor(Number(e.target.value))} aria-label="Schlepper">
            {tractors.map((m) => <option key={m.id} value={m.id}>{machineName(m)}</option>)}
          </select>
          {implementsOk.length ? (
            <select value={implId} onChange={(e) => setImpl(Number(e.target.value))} aria-label="Gerät">
              {implementsOk.map((m) => <option key={m.id} value={m.id}>{machineName(m)} ({m.width} m)</option>)}
            </select>
          ) : (
            <small className="warn">Kein Grubber – im Markt kaufen</small>
          )}
          <button onClick={start} disabled={!implementsOk.length} data-testid="start-job">Fahrer: Chef · Starten</button>
        </div>
      )}
      {fb.msg && <small className="feedback">{fb.msg}</small>}
    </li>
  );
}

export function OrdersTab({ status, game }: { status: GameStatus; game: GameController | null }) {
  const b = status.business;
  if (!b) return <p className="hint">–</p>;
  const open = b.requests.filter((r) => r.status === 'offen');
  const orders = b.orders.slice().reverse();
  return (
    <>
      <h2>Anfragen ({open.length})</h2>
      {open.length ? (
        <ul className="cards">{open.map((r) => <RequestItem key={r.id} r={r} game={game} time={b.time} />)}</ul>
      ) : (
        <p className="hint">Keine offenen Anfragen. Kunden besuchen oder auf Anrufe warten.</p>
      )}
      <h2>Aufträge ({orders.filter((o) => o.status !== 'fertig').length} offen)</h2>
      {orders.length ? (
        <ul className="cards">{orders.map((o) => <OrderItem key={o.id} o={o} game={game} status={status} />)}</ul>
      ) : (
        <p className="hint">Noch keine Aufträge.</p>
      )}
      <h2>Planungstafel</h2>
      <ul className="list">
        <li><span>Chef</span><small>{b.chefBusy ?? 'frei, im Büro'}</small></li>
        {b.units.map((u) => {
          const m = status.company?.machines.find((x) => x.id === u.machineId);
          return <li key={u.machineId}><span>{m ? machineName(m) : u.machineId}</span><small>{u.status}</small></li>;
        })}
      </ul>
    </>
  );
}

export function MarketTab({ status, game }: { status: GameStatus; game: GameController | null }) {
  const b = status.business;
  const fb = useFeedback();
  if (!b) return <p className="hint">–</p>;
  return (
    <>
      <h2>Gebrauchtgeräte</h2>
      <p className="hint">Startangebote (Preise angelehnt an reale Inserate). Der Händlermarkt folgt in Phase 3.</p>
      <ul className="cards">
        {b.offers.map((o) => (
          <li className="card" key={o.id} data-testid="offer">
            <div className="card-head">
              <strong>{o.machine.brand} {o.machine.model}</strong>
              <strong>{eur(o.price)}</strong>
            </div>
            <small>Bj. {o.machine.year} · {o.machine.width} m · ab {o.machine.powerNeed} PS · {o.machine.haPerHour?.toLocaleString('de-DE')} ha/h · Zustand {o.machine.condition} %</small>
            <small className="hint">{o.seller} – {o.note}</small>
            <div className="card-actions">
              <button onClick={async () => fb.show(await game!.command({ kind: 'buy', offerId: o.id }))} disabled={status.company!.cash < o.price} data-testid="buy">Kaufen</button>
            </div>
          </li>
        ))}
      </ul>
      {!b.offers.length && <p className="hint">Alle Angebote verkauft.</p>}
      {fb.msg && <p className="feedback">{fb.msg}</p>}
    </>
  );
}

export function NewsTab({ status, game }: { status: GameStatus; game: GameController | null }) {
  if (!status.events.length) return <p className="hint">Noch keine Nachrichten.</p>;
  return (
    <ul className="news">
      {status.events.map((e, i) => {
        const t = formatGameTime(e.time);
        return (
          <li key={`${e.time}-${i}`} className={e.kind}>
            <small>{t.date} {t.time}</small>
            {e.farmId !== undefined ? (
              <button className="link" onClick={() => game?.flyToFarm(e.farmId!)}>{e.text}</button>
            ) : (
              <span>{e.text}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Rechtsklick-Menü für Fahrzeuge: Status und Befehle */
export function VehicleMenu({ status, game }: { status: GameStatus; game: GameController | null }) {
  const fb = useFeedback();
  const menu = status.contextMenu;
  if (!menu || !game) return null;
  const d = game.vehicleDetails(menu.vehicle);
  if (!d) return null;
  const unit = status.business?.units.find((u) => u.vehicle === menu.vehicle);
  const order = unit?.orderId !== undefined ? status.business?.orders.find((o) => o.id === unit.orderId) : undefined;
  const stateText = ['steht', 'fährt', 'arbeitet auf dem Feld'][d.state] ?? '–';
  const left = Math.min(menu.x + 12, window.innerWidth - 640);
  return (
    <div className="vehicle-menu" style={{ left: Math.max(8, left), top: menu.y + 8 }} data-testid="vehicle-menu" onContextMenu={(e) => e.preventDefault()}>
      <div className="card-head">
        <strong>{d.name}</strong>
        <button className="close" onClick={() => game.closeMenu()} aria-label="Schließen">×</button>
      </div>
      {d.player && unit ? (
        <>
          <div data-testid="vehicle-status">{unit.status}</div>
          <small className="hint">
            {unit.kmh > 0 ? `${unit.kmh} km/h · ` : ''}
            {unit.hours.toLocaleString('de-DE')} Betriebsstunden
          </small>
          {order && (
            <small className="hint">
              Auftrag {game.farmById(order.farmId)?.name}: {order.doneFields.length}/{order.fields.length} Felder · Diesel {order.dieselL.toLocaleString('de-DE')} l ({eur(order.dieselCost)})
            </small>
          )}
          <div className="card-actions">
            <button
              disabled={!unit.busy}
              data-testid="recall"
              onClick={async () => fb.show(await game.command({ kind: 'recall', vehicle: menu.vehicle }))}
            >
              Zurück zum Hof
            </button>
            <button onClick={() => game.flyToVehicle(menu.vehicle)}>Hinzoomen</button>
          </div>
        </>
      ) : (
        <>
          <div>Testfahrzeug ({stateText})</div>
          <small className="hint">Zufälliger Verkehr für Leistungstests – keine Befehle möglich.</small>
        </>
      )}
      {fb.msg && <small className="feedback">{fb.msg}</small>}
    </div>
  );
}

const CATEGORIES = ['Rechnung', 'Diesel', 'Maschinenkauf', 'Sonstiges'] as const;

/** Finanzen: Konto, Monatsübersicht, Rechnungen, Auswertung je Auftrag (WF-08, WF-09) */
function invoiceState(i: Invoice): string {
  switch (i.status) {
    case 'bezahlt': return `bezahlt am ${fmtDay(i.paidAt!)}`;
    case 'verfallen': return 'verfallen (Kunde nicht kontaktiert)';
    case 'überfällig': return i.remindedAt !== undefined ? `überfällig, erinnert am ${fmtDay(i.remindedAt)}` : `überfällig – Kunden bis ${fmtDay(i.contactBy!)} kontaktieren (Anruf oder Besuch)`;
    default: return `zahlbar bis ${fmtDay(i.dueAt)}`;
  }
}

export function FinanceTab({ status, game }: { status: GameStatus; game: GameController | null }) {
  const fb = useFeedback();
  const b = status.business;
  const c = status.company;
  if (!b || !c) return <p className="hint">–</p>;
  // Monatsübersicht aus den Buchungen
  const months = new Map<string, Record<string, number>>();
  for (const l of b.ledger) {
    const t = formatGameTime(l.time).date; // „Mo, 01.03.2027“
    const key = t.slice(-7); // „03.2027“
    const m = months.get(key) ?? {};
    m[l.category] = (m[l.category] ?? 0) + l.amount;
    months.set(key, m);
  }
  const openInv = b.invoices.filter((i) => i.status === 'offen' || i.status === 'überfällig');
  const lost = b.invoices.filter((i) => i.status === 'verfallen');
  const finished = b.orders.filter((o) => o.status === 'fertig').slice().reverse();
  return (
    <>
      <h2>Konto</h2>
      <dl>
        <dt>Kontostand</dt><dd data-testid="cash-finance">{eur(c.cash)}</dd>
        <dt>Offene Rechnungen</dt><dd>{eur(openInv.reduce((a, i) => a + i.amount, 0))} ({openInv.length})</dd>
        {lost.length > 0 && <><dt>Forderungsausfall</dt><dd className="neg">{eur(lost.reduce((a, i) => a + i.amount, 0))} ({lost.length})</dd></>}
        <dt>Kreditrahmen frei</dt><dd>{eur(c.creditLimit - c.loan)}</dd>
      </dl>
      <h2>Monatsübersicht</h2>
      {months.size ? (
        <table className="tbl">
          <thead><tr><th>Monat</th>{CATEGORIES.map((k) => <th key={k}>{k === 'Maschinenkauf' ? 'Maschinen' : k}</th>)}<th>Saldo</th></tr></thead>
          <tbody>
            {[...months.entries()].reverse().map(([m, v]) => {
              const sum = Object.values(v).reduce((a, x) => a + x, 0);
              return (
                <tr key={m}>
                  <td>{m}</td>
                  {CATEGORIES.map((k) => <td key={k}>{v[k] ? eur(v[k]) : '–'}</td>)}
                  <td className={sum < 0 ? 'neg' : 'pos'}>{eur(sum)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="hint">Noch keine Buchungen.</p>
      )}
      <h2>Rechnungen</h2>
      {b.invoices.length ? (
        <ul className="list" data-testid="invoices">
          {b.invoices.slice().reverse().map((i) => (
            <li key={i.id}>
              <span>
                {i.number} · {game?.farmById(i.farmId)?.name} · <strong>{eur(i.amount)}</strong>
              </span>
              <small className={i.status === 'überfällig' || i.status === 'verfallen' ? 'warn' : 'hint'}>
                {i.text} · {invoiceState(i)}
              </small>
              {i.status === 'überfällig' && i.remindedAt === undefined && (
                <button onClick={async () => fb.show(await game!.command({ kind: 'remind', invoiceId: i.id }))} data-testid={`remind-${i.id}`}>
                  Kunden anrufen
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Rechnungen entstehen automatisch, wenn ein Auftrag fertig ist.</p>
      )}
      {fb.msg && <p className="feedback">{fb.msg}</p>}
      <h2>Auswertung je Auftrag</h2>
      {finished.length ? (
        <table className="tbl">
          <thead><tr><th>Kunde</th><th>Erlös</th><th>Diesel</th><th>Maschinen*</th><th>Ergebnis</th></tr></thead>
          <tbody>
            {finished.map((o) => {
              const r = b.results[o.id];
              return r ? (
                <tr key={o.id}>
                  <td>{game?.farmById(o.farmId)?.name}</td>
                  <td>{eur(r.revenue)}</td>
                  <td>{eur(r.diesel)}</td>
                  <td>{eur(r.machines)}</td>
                  <td className={r.margin < 0 ? 'neg' : 'pos'}>{eur(r.margin)}</td>
                </tr>
              ) : null;
            })}
          </tbody>
        </table>
      ) : (
        <p className="hint">Noch keine abgeschlossenen Aufträge.</p>
      )}
      <p className="hint">* kalkulatorisch: Reparaturkosten Schlepper 8 €/h, Verschleiß Grubber 3 €/ha (Annahmen); Lohn des Chefs nicht eingerechnet.</p>
      <h2>Letzte Buchungen</h2>
      <ul className="list">
        {b.ledger.slice(-15).reverse().map((l, i) => (
          <li key={i}>
            <span className={l.amount < 0 ? 'neg' : 'pos'}>{eur(l.amount)}</span>
            <small className="hint">{formatGameTime(l.time).date} · {l.text}</small>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Spielstände: speichern, laden, löschen */
export function SavePanel({ status, game, onClose }: { status: GameStatus; game: GameController | null; onClose: () => void }) {
  const [name, setName] = useState(status.saveName && status.saveName !== 'Autosave' ? status.saveName : 'Mein Betrieb');
  const fb = useFeedback();
  return (
    <div className="save-panel" data-testid="save-panel">
      <div className="card-head">
        <strong>Spielstand</strong>
        <button className="close" onClick={onClose} aria-label="Schließen">×</button>
      </div>
      <div className="card-actions">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name des Spielstands" />
        <button onClick={async () => fb.show(await game!.saveGame(name.trim() || 'Mein Betrieb'))} data-testid="save-now">Speichern</button>
      </div>
      <small className="hint">Automatisch gespeichert wird einmal je Spieltag („Autosave“). Beim Start geht es mit dem Autosave weiter.</small>
      <ul className="list">
        {status.saves.map((sv) => {
          const t = formatGameTime(sv.gameTime);
          return (
            <li key={sv.name}>
              <span><strong>{sv.name}</strong> · {t.date} {t.time} · {eur(sv.cash)}</span>
              <span className="card-actions">
                <button onClick={async () => { fb.show(await game!.loadGame(sv.name)); }} data-testid="load">Laden</button>
                {sv.name !== 'Autosave' && <button onClick={() => game!.deleteSave(sv.name)}>Löschen</button>}
              </span>
            </li>
          );
        })}
      </ul>
      {!status.saves.length && <p className="hint">Noch keine Spielstände.</p>}
      <div className="card-actions">
        <button onClick={() => { window.location.search = '?neu'; }}>Neues Spiel</button>
      </div>
      {fb.msg && <small className="feedback">{fb.msg}</small>}
    </div>
  );
}
