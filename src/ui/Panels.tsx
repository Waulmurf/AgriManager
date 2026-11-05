/**
 * Seitenleisten-Inhalte für das Spiel: Betrieb, Aufträge (Anfragen + Aufträge), Markt, Nachrichten.
 */
import { useState } from 'react';
import type { GameController, GameStatus } from '../game/controller';
import type { JobEstimate } from '../sim/engine';
import { MECHANIC_MIN, SKILLS, roleName, employerHourCost, employerMonthCost, machineValue, marketWage, takeOverFee, type Employee, type Machine } from '../sim/economy';
import { SERVICE_IMPLEMENT, SERVICE_NAMES, fmtDay, fmtTime, partsText, CHECK_COST, type Invoice, type Request, type Order } from '../sim/business';
import { CATALOG, DEALERS } from '../data/catalog';
import { BUILDINGS, SITE_OFFERS } from '../data/sites';
import { leaseRate } from '../sim/finance';
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

/** „ca. 7,5 h (1 Arbeitstag)“ */
function fmtDuration(min: number): string {
  const h = min / 60;
  const days = Math.max(1, Math.ceil(min / 600));
  return `ca. ${h.toLocaleString('de-DE', { maximumFractionDigits: h < 10 ? 1 : 0 })} h (${days} ${days === 1 ? 'Arbeitstag' : 'Arbeitstage'})`;
}

/** Schätzung mit Ampel gegen den Termin */
function EstimateLine({ e, latest }: { e?: JobEstimate; latest: number }) {
  if (!e) return null;
  const ok = e.finishAt <= latest;
  return (
    <small className={ok ? 'hint' : 'warn'} data-testid="estimate">
      Dauer {fmtDuration(e.minutes)} · fertig etwa {fmtDay(e.finishAt)} {ok ? '✓ schaffbar' : `⚠ Termin ${fmtDay(latest)} wird knapp – lieber ablehnen oder umplanen`}
    </small>
  );
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
        <dt>Chef</dt><dd>{b?.chefBusy ?? 'im Büro'}{b?.queue.length ? ` · ${b.queue.length} geplant` : ''}</dd>
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
              {m.hours ? ` · ${m.hours.toLocaleString('de-DE')} h` : ''} · Zustand {Math.round(m.condition)} % · Wert {eur(machineValue(m))}
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
        <p className="hint">Hofstelle auf der Karte anklicken und „Besuchen“ wählen. Erst ein Besuch bringt einen Betrieb ins Adressbuch; danach melden sich Kunden auch per Anruf oder Nachricht. Unbeantwortete Anfragen und verspätete Aufträge kosten Zufriedenheit – unter 20 % wechselt der Kunde zur Konkurrenz. Was nicht zu schaffen ist, lieber gleich ablehnen.</p>
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
                <small className={b.rivalFarms.includes(id) ? 'warn' : 'hint'}>
                  {ha(f.areaHa)} · Zufriedenheit {f.satisfaction} %
                  {b.rivalFarms.includes(id) ? ' · bei der Konkurrenz' : b.trialFarms.includes(id) ? ' · Probephase: nur kleine Aufträge' : ''}
                </small>
              </li>
            ) : null;
          })}
        </ul>
      )}
    </>
  );
}

function RequestItem({ r, game, time, estimate }: { r: Request; game: GameController | null; time: number; estimate?: JobEstimate }) {
  // Gülle wird je m³ verhandelt, intern als €/ha (× Gabe)
  const [price, setPrice] = useState(String(r.gabe ? Math.round((r.priceHa / r.gabe) * 100) / 100 : r.priceHa));
  const fb = useFeedback();
  const farm = game?.farmById(r.farmId);
  const send = async (action: 'accept' | 'reject' | 'counter') => {
    const p = Number(price.replace(',', '.'));
    const msg = await game!.command({ kind: 'respond', requestId: r.id, action, priceHa: r.gabe ? p * r.gabe : p });
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
        {SERVICE_NAMES[r.service]}{r.chain ? ` (${r.chain === 'komplett' ? 'Komplettkette: Häcksler, Abfahrer, Walzen' : 'nur Häcksler'})` : ''}: {r.fields.length} {r.fields.length === 1 ? 'Feld' : 'Felder'}, {ha(r.areaHa)} · bis {fmtDay(r.latest)}
      </div>
      <div>
        Angebot Kunde: <strong>{r.gabe ? `${(r.priceHa / r.gabe).toLocaleString('de-DE', { maximumFractionDigits: 2 })} €/m³` : `${r.priceHa.toLocaleString('de-DE')} €/ha`}</strong> = {eur(r.priceHa * r.areaHa)}
        {r.gabe ? <small className="hint"> · {r.gabe} m³/ha = {Math.round(r.areaHa * r.gabe).toLocaleString('de-DE')} m³ ab Güllelager des Kunden</small> : null}
      </div>
      {r.competitorPriceHa !== undefined && r.status === 'offen' && (
        <small className="hint">Konkurrenz bietet etwa {r.gabe ? `${(r.competitorPriceHa / r.gabe).toLocaleString('de-DE', { maximumFractionDigits: 2 })} €/m³` : `${Math.round(r.competitorPriceHa).toLocaleString('de-DE')} €/ha`} – deutlich darüber verliert man den Auftrag</small>
      )}
      {r.status === 'offen' && <EstimateLine e={estimate} latest={r.latest} />}
      {r.status === 'offen' ? (
        <>
          <small className="hint">Antwort erwartet in {hoursLeft} h</small>
          <div className="card-actions">
            <button onClick={() => send('accept')} data-testid="accept">Annehmen</button>
            <button onClick={() => send('reject')}>Ablehnen</button>
            <span className="counter">
              <input value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Gegenangebot €/ha" />
              <button onClick={() => send('counter')}>{r.gabe ? '€/m³' : '€/ha'} anbieten</button>
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

/** Häckselkette einteilen: Häcksler mit Fahrer, Abfahrer (Fahrer, Schlepper, Wagen), Radlader am Silo */
function ChopStart({ o, game, status, show }: { o: Order; game: GameController | null; status: GameStatus; show: (m: string) => void }) {
  const c = status.company!;
  const harvesters = c.machines.filter((m) => m.type === 'feldhaecksler');
  const tractors = c.machines.filter((m) => m.type === 'schlepper');
  const wagons = c.machines.filter((m) => m.type === 'haeckselwagen');
  const loaders = c.machines.filter((m) => m.type === 'radlader');
  const drivers = c.drivers;
  const name = (d: Employee) => (d.isPlayer ? 'Chef' : d.name);
  const [h, setH] = useState(harvesters[0]?.id ?? 0);
  const [hd, setHd] = useState(drivers.find((d) => (d.skills.haecksler ?? 0) >= 2)?.id ?? 1);
  const [haulers, setHaulers] = useState<{ driverId: number; tractorId: number; implementId: number }[]>([]);
  const [roller, setRoller] = useState<{ driverId: number; machineId: number } | null>(null);
  const addHauler = () => {
    const usedD = new Set([hd, ...haulers.map((x) => x.driverId)]);
    const usedM = new Set(haulers.flatMap((x) => [x.tractorId, x.implementId]));
    const d = drivers.find((x) => !usedD.has(x.id) && (x.skills.boden ?? 0) >= 1);
    const t = tractors.find((x) => !usedM.has(x.id));
    const w = wagons.find((x) => !usedM.has(x.id));
    if (!d || !t || !w) { show('Für einen weiteren Abfahrer fehlt ein freier Fahrer, Schlepper oder Häckselwagen'); return; }
    setHaulers([...haulers, { driverId: d.id, tractorId: t.id, implementId: w.id }]);
  };
  const start = async () => {
    show(await game!.command({ kind: 'startJob', orderId: o.id, tractorId: h, implementId: h, driverId: hd, haulers, roller: roller ?? undefined }));
  };
  if (!harvesters.length) return <small className="warn">Kein Feldhäcksler im Fuhrpark – im Markt kaufen oder leasen</small>;
  return (
    <div className="chop-start">
      <div className="card-actions">
        <select value={h} onChange={(e) => setH(Number(e.target.value))} aria-label="Feldhäcksler">
          {harvesters.map((m) => <option key={m.id} value={m.id}>{machineName(m)}</option>)}
        </select>
        <select value={hd} onChange={(e) => setHd(Number(e.target.value))} aria-label="Häckslerfahrer">
          {drivers.map((d) => <option key={d.id} value={d.id}>{name(d)} · Häcksler {d.skills.haecksler ?? 0}</option>)}
        </select>
      </div>
      {haulers.map((x, i) => (
        <div className="card-actions" key={i}>
          <small>Abfahrer {i + 1}:</small>
          <select value={x.driverId} onChange={(e) => setHaulers(haulers.map((y, j) => (j === i ? { ...y, driverId: Number(e.target.value) } : y)))} aria-label="Fahrer Abfahrer">
            {drivers.map((d) => <option key={d.id} value={d.id}>{name(d)}</option>)}
          </select>
          <select value={x.tractorId} onChange={(e) => setHaulers(haulers.map((y, j) => (j === i ? { ...y, tractorId: Number(e.target.value) } : y)))} aria-label="Schlepper Abfahrer">
            {tractors.map((t) => <option key={t.id} value={t.id}>{machineName(t)} ({t.power} PS)</option>)}
          </select>
          <select value={x.implementId} onChange={(e) => setHaulers(haulers.map((y, j) => (j === i ? { ...y, implementId: Number(e.target.value) } : y)))} aria-label="Häckselwagen">
            {wagons.map((w) => <option key={w.id} value={w.id}>{machineName(w)} ({w.payloadT} t)</option>)}
          </select>
          <button onClick={() => setHaulers(haulers.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div className="card-actions">
        <button onClick={addHauler} disabled={!wagons.length}>+ Abfahrer</button>
        {loaders.length > 0 && (
          roller ? (
            <>
              <select value={roller.driverId} onChange={(e) => setRoller({ ...roller, driverId: Number(e.target.value) })} aria-label="Radladerfahrer">
                {drivers.map((d) => <option key={d.id} value={d.id}>{name(d)} · Radlader {d.skills.radlader ?? 0}</option>)}
              </select>
              <select value={roller.machineId} onChange={(e) => setRoller({ ...roller, machineId: Number(e.target.value) })} aria-label="Radlader">
                {loaders.map((m) => <option key={m.id} value={m.id}>{machineName(m)} ({m.weightT} t)</option>)}
              </select>
              <button onClick={() => setRoller(null)}>✕</button>
            </>
          ) : (
            <button onClick={() => setRoller({ driverId: drivers.find((d) => (d.skills.radlader ?? 0) >= 1 && d.id !== hd)?.id ?? 1, machineId: loaders[0].id })}>+ Radlader am Silo</button>
          )
        )}
        <button onClick={start} data-testid="start-chop">Kette starten</button>
      </div>
      <small className="hint">
        {o.chain === 'komplett'
          ? 'Komplettkette: Abfahrer vom Lohnbetrieb (mindestens einer, besser zwei bis drei). Ohne eigenen Radlader walzt eine Fremdwalze (110 €/h). Der Häcksler arbeitet nur mit Abfahrer nebenher.'
          : 'Nur Häcksler: Der Kunde stellt Abfahrer und Walze. Eigene Abfahrer können zusätzlich mitfahren.'}
      </small>
    </div>
  );
}

function OrderItem({ o, game, status }: { o: Order; game: GameController | null; status: GameStatus }) {
  const c = status.company!;
  const tractors = c.machines.filter((m) => m.type === 'schlepper');
  const implementsOk = c.machines.filter((m) => m.type === SERVICE_IMPLEMENT[o.service]);
  const [tractor, setTractor] = useState(tractors[0]?.id ?? 0);
  const [impl, setImpl] = useState(0);
  const [driver, setDriver] = useState(1);
  // Gülle-Kette: optionaler Zubringer
  const feeders = c.machines.filter((m) => m.type === 'zubringer');
  const [useFeeder, setUseFeeder] = useState(false);
  const [fDriver, setFDriver] = useState(0);
  const [fTractor, setFTractor] = useState(0);
  const [fImpl, setFImpl] = useState(0);
  const fb = useFeedback();
  const farm = game?.farmById(o.farmId);
  const implId = impl || implementsOk[0]?.id || 0;
  const drivers = c.drivers;
  const start = async () => {
    const feeder = useFeeder ? {
      driverId: fDriver || drivers.find((d) => d.id !== driver)?.id || 0,
      tractorId: fTractor || tractors.find((t) => t.id !== tractor)?.id || 0,
      implementId: fImpl || feeders[0]?.id || 0,
    } : undefined;
    fb.show(await game!.command({ kind: 'startJob', orderId: o.id, tractorId: tractor, implementId: implId, driverId: driver, feeder }));
  };
  const driverBusy = status.business?.driverStatus[driver] || status.business?.queue.some((q) => q.driverId === driver);
  const late = status.business && o.status !== 'fertig' && status.business.time > o.latest;
  const queued = !!status.business?.queue.some((q) => q.cmd.kind === 'startJob' && q.cmd.orderId === o.id);
  return (
    <li className="card" data-testid="order">
      <div className="card-head">
        <button className="link" onClick={() => game?.flyToFarm(o.farmId)}>{farm?.name ?? `Betrieb ${o.farmId}`}</button>
        <small className={`badge ${o.status === 'fertig' ? 'done' : o.status === 'läuft' ? 'run' : ''}`}>{o.status}</small>
      </div>
      <div>
        {SERVICE_NAMES[o.service]}{o.chain ? ` (${o.chain === 'komplett' ? 'Komplettkette' : 'nur Häcksler'})` : ''} {ha(o.areaHa)} zu {o.gabe ? `${(o.priceHa / o.gabe).toLocaleString('de-DE', { maximumFractionDigits: 2 })} €/m³ (${Math.round(o.areaHa * o.gabe).toLocaleString('de-DE')} m³)` : `${o.priceHa.toLocaleString('de-DE')} €/ha`} = {eur(o.priceHa * o.areaHa)}
        {o.gabe && o.status === 'läuft' ? <small className="hint"> · ausgebracht {Math.round(o.doneM3 ?? 0).toLocaleString('de-DE')} m³</small> : null}
        {o.chain && o.status !== 'offen' ? <small className="hint"> · am Silo {Math.round(o.doneT ?? 0).toLocaleString('de-DE')} t</small> : null}
      </div>
      <small className={late ? 'warn' : 'hint'}>
        Zeitfenster bis {fmtDay(o.latest)}
        {o.status === 'läuft' ? ` · ${o.doneFields.length}/${o.fields.length} Felder fertig` : ''}
        {o.finishedAt !== undefined ? ` · fertig ${formatGameTime(o.finishedAt).date.slice(4)} ${formatGameTime(o.finishedAt).time}` : ''}
        {late ? ' · verspätet!' : ''}
        {o.dieselL > 0 ? ` · Diesel ${o.dieselL.toLocaleString('de-DE')} l (${eur(o.dieselCost)})` : ''}
      </small>
      {o.status !== 'fertig' && <EstimateLine e={status.business?.estimates[o.id]} latest={o.latest} />}
      {o.status === 'offen' && o.service === 'haeckseln' && <ChopStart o={o} game={game} status={status} show={fb.show} />}
      {o.status === 'offen' && o.service !== 'haeckseln' && (
        <div className="card-actions">
          <select value={tractor} onChange={(e) => setTractor(Number(e.target.value))} aria-label="Schlepper">
            {tractors.map((m) => <option key={m.id} value={m.id}>{machineName(m)}</option>)}
          </select>
          {implementsOk.length ? (
            <select value={implId} onChange={(e) => setImpl(Number(e.target.value))} aria-label="Gerät">
              {implementsOk.map((m) => <option key={m.id} value={m.id}>{machineName(m)} ({m.tankM3 ? `${m.tankM3} m³, ` : ''}{m.width} m)</option>)}
            </select>
          ) : (
            <small className="warn">Kein Gerät ({TYPE_NAMES[SERVICE_IMPLEMENT[o.service]]}) – im Markt kaufen</small>
          )}
          <select value={driver} onChange={(e) => setDriver(Number(e.target.value))} aria-label="Fahrer" data-testid="driver">
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.isPlayer ? 'Chef (du)' : d.name} · Traktor {d.skills.boden}</option>)}
          </select>
          <button onClick={start} disabled={!implementsOk.length || queued} data-testid="start-job">
            {queued ? 'Eingeplant' : driverBusy ? 'Einplanen' : 'Starten'}
          </button>
        </div>
      )}
      {o.status === 'offen' && o.service === 'guelle' && (
        <div className="card-actions">
          <label><input type="checkbox" checked={useFeeder} onChange={(e) => setUseFeeder(e.target.checked)} disabled={!feeders.length || tractors.length < 2 || drivers.length < 2} /> mit Zubringer</label>
          {useFeeder && (
            <>
              <select value={fDriver} onChange={(e) => setFDriver(Number(e.target.value))} aria-label="Fahrer Zubringer">
                <option value={0}>Fahrer …</option>
                {drivers.filter((d) => d.id !== driver).map((d) => <option key={d.id} value={d.id}>{d.isPlayer ? 'Chef' : d.name}</option>)}
              </select>
              <select value={fTractor} onChange={(e) => setFTractor(Number(e.target.value))} aria-label="Schlepper Zubringer">
                <option value={0}>Schlepper …</option>
                {tractors.filter((t) => t.id !== tractor).map((t) => <option key={t.id} value={t.id}>{machineName(t)} ({t.power} PS)</option>)}
              </select>
              <select value={fImpl} onChange={(e) => setFImpl(Number(e.target.value))} aria-label="Zubringerfass">
                {feeders.map((m) => <option key={m.id} value={m.id}>{machineName(m)} ({m.tankM3} m³)</option>)}
              </select>
            </>
          )}
          {!feeders.length && <small className="hint">Zubringer: Zubringerfass, zweiter Schlepper und zweiter Fahrer nötig. Lohnt sich bei weiten Wegen vom Güllelager zum Feld.</small>}
        </div>
      )}
      {fb.msg && <small className="feedback">{fb.msg}</small>}
    </li>
  );
}

/** Warteschlangen je Fahrer: geplante Besuche und Aufträge, der Reihe nach */
function QueueList({ status, game }: { status: GameStatus; game: GameController | null }) {
  const fb = useFeedback();
  const q = status.business?.queue ?? [];
  const drivers = status.company?.drivers ?? [];
  const send = async (cmd: Parameters<GameController['command']>[0]) => fb.show(await game!.command(cmd));
  return (
    <>
      <h3>Geplant ({q.length})</h3>
      {q.length ? (
        drivers.filter((d) => q.some((x) => x.driverId === d.id)).map((d) => {
          const mine = q.filter((x) => x.driverId === d.id);
          return (
            <div key={d.id}>
              <small className="hint">{d.isPlayer ? 'Chef' : d.name}</small>
              <ol className="queue" data-testid="queue">
                {mine.map((item, i) => (
                  <li key={item.id}>
                    <span>{item.label}</span>
                    <span className="queue-actions">
                      <button onClick={() => send({ kind: 'queueMove', queueId: item.id, dir: -1 })} disabled={i === 0} title="früher">▲</button>
                      <button onClick={() => send({ kind: 'queueMove', queueId: item.id, dir: 1 })} disabled={i === mine.length - 1} title="später">▼</button>
                      <button onClick={() => send({ kind: 'dequeue', queueId: item.id })} title="aus dem Plan nehmen" data-testid="dequeue">✕</button>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })
      ) : (
        <p className="hint">Nichts geplant. Ist ein Fahrer unterwegs oder sein Schlepper im Einsatz, werden Aufträge hier eingereiht und danach der Reihe nach gestartet (zwischen 06:00 und 20:00). Besuche macht immer der Chef.</p>
      )}
      {fb.msg && <p className="feedback">{fb.msg}</p>}
    </>
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
        <ul className="cards">{open.map((r) => <RequestItem key={r.id} r={r} game={game} time={b.time} estimate={b.estimates[r.id]} />)}</ul>
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
        {(status.company?.drivers ?? []).map((d) => (
          <li key={`d${d.id}`}>
            <span>{d.isPlayer ? 'Chef' : d.name}</span>
            <small>{b.driverStatus[d.id] ?? (d.isPlayer ? 'frei, im Büro' : 'frei, am Hof')} · {((b.driverMinutes[d.id] ?? 0) / 60).toLocaleString('de-DE', { maximumFractionDigits: 1 })} h heute</small>
          </li>
        ))}
        {b.units.map((u) => {
          const m = status.company?.machines.find((x) => x.id === u.machineId);
          return <li key={u.machineId}><span>{m ? machineName(m) : u.machineId}</span><small>{u.status}</small></li>;
        })}
      </ul>
      <QueueList status={status} game={game} />
    </>
  );
}

const skillShort = (e: Pick<Employee, 'skills' | 'isPlayer'>) =>
  `${roleName(e)}: ` + (SKILLS.filter((k) => (e.skills[k.key] ?? 0) > 0).map((k) => `${k.short} ${e.skills[k.key]}`).join(' · ') || 'keine Qualifikation');

function EmployeeCard({ e, status, game, show }: { e: Employee; status: GameStatus; game: GameController | null; show: (m: string) => void }) {
  const b = status.business!;
  const [days, setDays] = useState('5');
  const [from, setFrom] = useState(1);
  const [wage, setWage] = useState(String(e.wage));
  const send = async (cmd: Parameters<GameController['command']>[0]) => show(await game!.command(cmd));
  const today = Math.floor(b.time / 1440);
  const sat = e.satisfaction ?? 70;
  const abs = (e.absences ?? []).filter((a) => a.to > b.time);
  return (
    <li className="card" data-testid="employee">
      <div className="card-head">
        <strong>{e.isPlayer ? 'Chef (du)' : e.name}</strong>
        <small>{e.kind === 'chef' ? 'kein Lohn' : e.kind === 'fest' ? `fest · ${eur(employerMonthCost(e))}/Monat` : e.kind === 'leih' ? `Leiharbeit · ${eur(e.agencyRate ?? 0)}/h` : `Saison · ${eur(employerHourCost(e))}/h`}</small>
      </div>
      <small className="hint">{skillShort(e)}{e.licenseC ? ' · Führerschein C/CE' : ''}{!e.isPlayer && e.kind !== 'leih' ? ` · ${e.age} Jahre · ${e.wage.toLocaleString('de-DE')} €/h brutto (Markt ${marketWage(e).toLocaleString('de-DE')} €)` : ''}</small>
      <small>{b.driverStatus[e.id] ?? (e.kind === 'leih' && b.time < (e.availableFrom ?? 0) ? `kommt ${fmtDay(e.availableFrom!)} 06:00` : 'frei')} · heute {((b.driverMinutes[e.id] ?? 0) / 60).toLocaleString('de-DE', { maximumFractionDigits: 1 })} von 10 h</small>
      {e.kind === 'leih' && <LeihActions e={e} status={status} send={send} />}
      {!e.isPlayer && e.kind !== 'leih' && (
        <>
          <small className={sat < 40 ? 'warn' : 'hint'}>
            Zufriedenheit {Math.round(sat)} %
            {e.reliability !== undefined ? ` · Zuverlässigkeit ${Math.round(e.reliability * 100)} % · Belastbarkeit ${Math.round((e.resilience ?? 0.75) * 100)} %` : ''}
            {e.overtime30 ? ` · Überstunden (30 Tage) ${(e.overtime30 / 60).toLocaleString('de-DE', { maximumFractionDigits: 0 })} h` : ''}
            {e.kind === 'fest' ? ` · Resturlaub ${e.vacationLeft ?? 0} Tage` : ''}
          </small>
          {abs.map((a, i) => <small key={i} className="hint">{a.kind === 'urlaub' ? 'Urlaub' : 'krank'} {fmtDay(a.from)} bis {fmtDay(a.to - 1)}</small>)}
          {e.leavesAt !== undefined && <small className="warn">gekündigt – geht am {fmtDay(e.leavesAt)}</small>}
          <div className="card-actions">
            {e.kind === 'fest' && (
              <span className="counter">
                <select value={from} onChange={(x) => setFrom(Number(x.target.value))} aria-label="Urlaub ab">
                  {Array.from({ length: 30 }, (_, d) => d + 1).map((d) => <option key={d} value={d}>ab {fmtDay((today + d) * 1440)}</option>)}
                </select>
                <input value={days} onChange={(x) => setDays(x.target.value)} aria-label="Urlaubstage" style={{ width: 36 }} />
                <button onClick={() => send({ kind: 'vacation', employeeId: e.id, fromDay: today + from, days: Number(days) })}>Urlaub</button>
              </span>
            )}
            <span className="counter">
              <input value={wage} onChange={(x) => setWage(x.target.value)} aria-label="Stundenlohn" style={{ width: 48 }} />
              <button onClick={() => send({ kind: 'setWage', employeeId: e.id, wage: Number(wage.replace(',', '.')) })}>€/h setzen</button>
            </span>
            {e.leavesAt === undefined && <button onClick={() => send({ kind: 'fire', employeeId: e.id })}>{e.kind === 'fest' ? 'Kündigen (4 Wochen)' : 'Entlassen'}</button>}
          </div>
        </>
      )}
    </li>
  );
}

function LeihActions({ e, status, send }: { e: Employee; status: GameStatus; send: (cmd: Parameters<GameController['command']>[0]) => void }) {
  const b = status.business!;
  const [days, setDays] = useState('7');
  const deployed = Math.max(0, Math.floor((b.time - (e.availableFrom ?? b.time)) / 1440));
  const fee = takeOverFee(marketWage(e), deployed);
  return (
    <>
      <small className="hint">gebucht bis {fmtDay((e.contractUntil ?? b.time) - 1)} · {deployed} Tage im Einsatz · Übernahme {fee ? `gegen Provision ${eur(fee)}` : 'ohne Provision'}, Lohn dann etwa {marketWage(e).toLocaleString('de-DE')} €/h</small>
      <div className="card-actions">
        <span className="counter">
          <input value={days} onChange={(x) => setDays(x.target.value)} aria-label="Tage verlängern" style={{ width: 36 }} />
          <button onClick={() => send({ kind: 'extendRent', employeeId: e.id, days: Number(days) })}>Tage verlängern</button>
        </span>
        <button onClick={() => send({ kind: 'takeOver', employeeId: e.id, asKind: 'fest' })} data-testid="take-over">Fest übernehmen</button>
        <button onClick={() => send({ kind: 'takeOver', employeeId: e.id, asKind: 'saison' })}>Als Saisonkraft</button>
        <button onClick={() => send({ kind: 'fire', employeeId: e.id })}>Abbestellen</button>
      </div>
    </>
  );
}

function AgencyOffer({ a, send }: { a: { id: number; person: Omit<Employee, 'id' | 'hiredAt'>; until: number }; send: (cmd: Parameters<GameController['command']>[0]) => void }) {
  const [days, setDays] = useState('7');
  return (
    <li className="card" data-testid="agency-offer">
      <div className="card-head">
        <strong>{a.person.name}</strong>
        <strong>{eur(a.person.agencyRate ?? 0)}/h</strong>
      </div>
      <small className="hint">{skillShort(a.person)}{a.person.licenseC ? ' · Führerschein C/CE' : ''} · mindestens 4 h je Einsatztag · verfügbar bis {fmtDay(a.until)}</small>
      <div className="card-actions">
        <span className="counter">
          <input value={days} onChange={(x) => setDays(x.target.value)} aria-label="Tage" style={{ width: 36 }} />
          <button onClick={() => send({ kind: 'rent', poolId: a.id, days: Number(days) })} data-testid="rent">Tage buchen (ab morgen)</button>
        </span>
      </div>
    </li>
  );
}

/** Personal (PA-01 bis PA-17): Mitarbeiter, Wünsche, Bewerbungen, Lohnkosten */
export function StaffTab({ status, game }: { status: GameStatus; game: GameController | null }) {
  const fb = useFeedback();
  const b = status.business;
  const c = status.company;
  if (!b || !c) return <p className="hint">–</p>;
  const monthly = c.drivers.reduce((a, e) => a + (e.kind === 'fest' ? employerMonthCost(e) : 0), 0);
  const name = (id: number) => c.drivers.find((d) => d.id === id)?.name ?? `Mitarbeiter ${id}`;
  return (
    <>
      {b.staffRequests.length > 0 && (
        <>
          <h2>Wünsche ({b.staffRequests.length})</h2>
          <ul className="cards">
            {b.staffRequests.map((r) => (
              <li key={r.id} className="card" data-testid="staff-request">
                <strong>{name(r.employeeId)}</strong>
                <small>{r.kind === 'urlaub' ? `Urlaub: ${r.days} Tage ab ${fmtDay(r.from!)}` : `mehr Lohn: ${r.wage!.toLocaleString('de-DE')} €/h`} · Antwort bis {fmtDay(r.until)}</small>
                <div className="card-actions">
                  <button onClick={async () => fb.show(await game!.command({ kind: 'staffAnswer', requestId: r.id, accept: true }))}>Zusagen</button>
                  <button onClick={async () => fb.show(await game!.command({ kind: 'staffAnswer', requestId: r.id, accept: false }))}>Ablehnen</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <h2>Mitarbeiter ({c.drivers.length})</h2>
      <ul className="cards" data-testid="staff">
        {c.drivers.map((e) => <EmployeeCard key={e.id} e={e} status={status} game={game} show={fb.show} />)}
      </ul>
      <dl>
        <dt>Lohnkosten fest</dt><dd>{eur(monthly)} je Monat</dd>
      </dl>
      <p className="hint">Löhne inkl. Arbeitgeberanteil (21 %) werden am Monatsersten gebucht, dazu Zuschläge für Nacht (25 %, 0–4 Uhr 40 %), Sonntag (50 %), Feiertage (125–150 %) und Überstunden über 8 h (25 %). Feste haben 4 Wochen Kündigungsfrist und 26 Tage Urlaub. Unzufriedene Mitarbeiter fordern mehr Lohn und kündigen sonst.</p>
      <h2>Zeitarbeit ({b.agencyPool.length})</h2>
      <p className="hint">Leiharbeiter als Ersatz bei Krankheit oder für Spitzen: befristet buchbar, ab dem nächsten Morgen im Einsatz, teurer als eigene Leute. Wer sich bewährt, lässt sich übernehmen – die Provision der Zeitarbeitsfirma sinkt mit der Einsatzdauer (unter 3 Monaten zwei Monatslöhne, ab 12 Monaten frei).</p>
      {b.agencyPool.length ? (
        <ul className="cards">{b.agencyPool.map((a) => <AgencyOffer key={a.id} a={a} send={async (cmd) => fb.show(await game!.command(cmd))} />)}</ul>
      ) : <p className="hint">Die Zeitarbeitsfirma meldet sich morgen früh mit Angeboten.</p>}
      <h2>Bewerbungen ({b.applicants.length})</h2>
      {b.applicants.length ? (
        <ul className="cards" data-testid="applicants">
          {b.applicants.map((a) => (
            <li key={a.id} className="card">
              <div className="card-head">
                <strong>{a.person.name}</strong>
                <small>{a.person.age} Jahre · bis {fmtDay(a.until)}</small>
              </div>
              <small className="hint">{skillShort(a.person)}{a.person.licenseC ? ' · Führerschein C/CE' : ''} · {a.note}</small>
              <div>Gehaltswunsch: <strong>{a.person.wage.toLocaleString('de-DE')} €/h</strong> ({eur(a.person.wage * 173)} brutto im Monat)</div>
              <div className="card-actions">
                <button onClick={async () => fb.show(await game!.command({ kind: 'hire', applicantId: a.id, asKind: 'fest' }))} data-testid="hire">Fest einstellen</button>
                <button onClick={async () => fb.show(await game!.command({ kind: 'hire', applicantId: a.id, asKind: 'saison' }))}>Als Saisonkraft</button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Gerade keine Bewerbungen. Neue kommen alle paar Tage.</p>
      )}
      {fb.msg && <p className="feedback">{fb.msg}</p>}
    </>
  );
}

const TYPE_NAMES: Record<string, string> = { schlepper: 'Schlepper', grubber: 'Grubber', kurzscheibenegge: 'Kurzscheibenegge', firmenwagen: 'Firmenwagen', guellefass: 'Güllefass', zubringer: 'Zubringerfass', feldhaecksler: 'Feldhäcksler', haeckselwagen: 'Häckselwagen', radlader: 'Radlader' };

function machineSpecs(m: Pick<Machine, 'type' | 'power' | 'width' | 'powerNeed' | 'haPerHour' | 'seats' | 'tankM3' | 'payloadT' | 'weightT'>): string {
  if (m.type === 'schlepper') return `${m.power} PS`;
  if (m.type === 'zubringer') return `${m.tankM3} m³ · ab ${m.powerNeed} PS`;
  if (m.type === 'feldhaecksler') return `${m.power} PS · ${m.haPerHour?.toLocaleString('de-DE')} ha/h Silomais`;
  if (m.type === 'haeckselwagen') return `${m.payloadT} t · ab ${m.powerNeed} PS`;
  if (m.type === 'radlader') return `${m.weightT} t Betriebsgewicht · walzt etwa ${(m.weightT ?? 0) * 4} t/h`;
  if (m.type === 'guellefass') return `${m.tankM3} m³ · ${m.width} m · ab ${m.powerNeed} PS`;
  if (m.type === 'firmenwagen') return `${m.seats ?? 5} Plätze`;
  if (m.width) return `${m.width.toLocaleString('de-DE')} m · ab ${m.powerNeed} PS · ${m.haPerHour?.toLocaleString('de-DE')} ha/h`;
  return '';
}

/** Markt (HM-04 bis HM-07, MZ-10, MZ-11): Gebrauchte bei Händlern und auf der Börse, Neubestellung */
export function MarketTab({ status, game }: { status: GameStatus; game: GameController | null }) {
  const b = status.business;
  const fb = useFeedback();
  const [view, setView] = useState<'gebraucht' | 'neu'>('gebraucht');
  const [type, setType] = useState<string>('alle');
  const [dealer, setDealer] = useState(1);
  if (!b) return <p className="hint">–</p>;
  const offers = b.offers.filter((o) => type === 'alle' || o.machine.type === type);
  const send = async (cmd: Parameters<GameController['command']>[0]) => fb.show(await game!.command(cmd));
  const d = DEALERS.find((x) => x.id === dealer)!;
  const brands = [...d.tractorBrands, ...d.implementBrands];
  const models = CATALOG.filter((m) => brands.includes(m.brand) && (type === 'alle' || m.type === type));
  const disc = b.discounts[dealer] ?? 0.05;
  return (
    <>
      <div className="card-actions">
        <button className={view === 'gebraucht' ? 'active' : ''} onClick={() => setView('gebraucht')} data-testid="market-used">Gebraucht</button>
        <button className={view === 'neu' ? 'active' : ''} onClick={() => setView('neu')} data-testid="market-new">Neu bestellen</button>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Maschinenart">
          <option value="alle">alle Arten</option>
          <option value="schlepper">Schlepper</option>
          <option value="grubber">Grubber</option>
          <option value="kurzscheibenegge">Kurzscheibenegge</option>
          <option value="guellefass">Güllefass</option>
          <option value="zubringer">Zubringerfass</option>
          <option value="feldhaecksler">Feldhäcksler</option>
          <option value="haeckselwagen">Häckselwagen</option>
          <option value="radlader">Radlader</option>
          <option value="firmenwagen">Firmenwagen</option>
        </select>
      </div>
      {view === 'gebraucht' ? (
        <>
          <p className="hint">Händler: geprüft, 6 Monate Gewährleistung. Gebrauchtbörse: günstiger, ohne Gewährleistung, versteckte Mängel möglich – Werkstattcheck {eur(CHECK_COST)}.</p>
          <ul className="cards">
            {offers.map((o) => (
              <li className="card" key={o.id} data-testid="offer">
                <div className="card-head">
                  <strong>{o.machine.brand} {o.machine.model}</strong>
                  <strong>{eur(o.price)}</strong>
                </div>
                <small>{TYPE_NAMES[o.machine.type]} · {machineSpecs(o.machine)} · Bj. {o.machine.year}{o.machine.hours ? ` · ${o.machine.hours.toLocaleString('de-DE')} h` : ''} · Zustand {o.machine.condition} %</small>
                <small className="hint">{o.seller} – {o.note}{o.until !== undefined ? ` · bis ${fmtDay(o.until)}` : ''}</small>
                {o.checked && <small className={o.machine.defect ? 'warn' : 'hint'}>Werkstattcheck: {o.machine.defect ? `Mangel gefunden – Zustand eher ${Math.max(10, o.machine.condition - 20)} %` : 'keine Mängel'}</small>}
                <div className="card-actions">
                  <button onClick={() => send({ kind: 'buy', offerId: o.id })} disabled={status.company!.cash < o.price} data-testid="buy">Kaufen</button>
                  {!o.dealerId && !o.checked && <button onClick={() => send({ kind: 'check', offerId: o.id })}>Werkstattcheck</button>}
                </div>
              </li>
            ))}
          </ul>
          {!offers.length && <p className="hint">Gerade keine passenden Angebote. Neue kommen fast täglich.</p>}
        </>
      ) : (
        <>
          <select value={dealer} onChange={(e) => setDealer(Number(e.target.value))} aria-label="Händler" data-testid="dealer">
            {DEALERS.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.town})</option>)}
          </select>
          <p className="hint">{d.name}: {brands.join(', ')} · Rabatt {Math.round(disc * 100)} % (steigt mit dem Umsatz) · Bezahlung bei Lieferung, 24 Monate Gewährleistung.</p>
          <ul className="cards">
            {models.map((m) => (
              <li className="card" key={m.key}>
                <div className="card-head">
                  <strong>{m.brand} {m.model}</strong>
                  <strong>{eur(Math.round((m.newPrice * (1 - disc)) / 100) * 100)}</strong>
                </div>
                <small>{TYPE_NAMES[m.type]} · {machineSpecs(m)} · Liste {eur(m.newPrice)} · Lieferzeit etwa {m.deliveryWeeks} Wochen</small>
                <div className="card-actions">
                  <button onClick={() => send({ kind: 'order', dealerId: dealer, modelKey: m.key })} data-testid="order-new">Kaufen</button>
                  {[36, 48, 60].map((mo) => {
                    const price = Math.round((m.newPrice * (1 - disc)) / 100) * 100;
                    const rate = leaseRate(price, b.leaseRates[mo] ?? 0.059, mo);
                    return <button key={mo} onClick={() => send({ kind: 'order', dealerId: dealer, modelKey: m.key, leaseMonths: mo })} title={`Restwert ${eur(rate.residual)}`}>Leasing {mo} M · {eur(rate.monthly)}/M</button>;
                  })}
                </div>
              </li>
            ))}
          </ul>
          {!models.length && <p className="hint">Dieser Händler führt keine passenden Maschinen (z. B. Rüben- und Kartoffeltechnik kommt mit Phase 4).</p>}
        </>
      )}
      {b.deliveries.length > 0 && (
        <>
          <h3>Bestellt</h3>
          <ul className="list">
            {b.deliveries.map((x) => <li key={x.id}><span>{x.machine.brand} {x.machine.model}</span><small>Lieferung etwa {fmtDay(x.at)} · {eur(x.price)}</small></li>)}
          </ul>
        </>
      )}
      {fb.msg && <p className="feedback">{fb.msg}</p>}
    </>
  );
}

/** Offene Panne: Händler-Service oder eigener Werkstattwagen mit Mechaniker; Ersatzteillage */
function RepairChoice({ m, status, send }: { m: Machine; status: GameStatus; send: (cmd: Parameters<GameController['command']>[0]) => void }) {
  const r = m.repair!;
  const b = status.business!;
  const c = status.company!;
  const mechanics = c.drivers.filter((d) => (d.skills.werkstatt ?? 0) >= MECHANIC_MIN);
  const [mech, setMech] = useState(mechanics[0]?.id ?? 0);
  const van = c.machines.some((x) => x.carKind === 'werkstatt');
  const teil = partsText(r);
  const own = r.parts === 'wagen' || r.parts === 'hof' ? `Teil aus eigenem Lager, ${eur(r.partValue)}` : `Teile ~${eur(Math.round((r.cost * 0.45) / 10) * 10)}`;
  if (r.state !== 'wartet') return <small className="hint">{teil}</small>;
  return (
    <div className="repair-choice" data-testid="repair-choice">
      <small className="warn">Panne – {teil}. Ohne Entscheidung ruft der Fahrer um {fmtTime(r.since + 60)} den Händler.{r.mechanicId !== undefined ? ' Eigene Werkstatt ist eingeplant.' : ''}</small>
      <div className="card-actions">
        <button onClick={() => send({ kind: 'repair', machineId: m.id, mode: 'dealer' })} data-testid="repair-dealer">Händler-Service ({r.cost ? eur(r.cost) : 'Gewährleistung'})</button>
        {van && mechanics.length > 0 ? (
          <span className="counter">
            <select value={mech} onChange={(e) => setMech(Number(e.target.value))} aria-label="Mechaniker">
              {mechanics.map((d) => <option key={d.id} value={d.id}>{d.isPlayer ? 'Chef' : d.name} (Werkstatt {d.skills.werkstatt}){b.driverStatus[d.id] ? ' – beschäftigt' : ''}</option>)}
            </select>
            <button onClick={() => send({ kind: 'repair', machineId: m.id, mode: 'own', mechanicId: mech })} data-testid="repair-own">Eigene Werkstatt ({own})</button>
          </span>
        ) : <small className="hint">Eigene Reparatur braucht Werkstattwagen und Mechaniker (Werkstatt ab Stufe {MECHANIC_MIN}).</small>}
      </div>
    </div>
  );
}

/** Fuhrpark (MF-07, MZ-01, MZ-05, MZ-09, MZ-12): Zustand, Wartung, Kosten, Verkauf */
export function FleetTab({ status, game }: { status: GameStatus; game: GameController | null }) {
  const b = status.business;
  const c = status.company;
  const fb = useFeedback();
  if (!b || !c) return <p className="hint">–</p>;
  const send = async (cmd: Parameters<GameController['command']>[0]) => fb.show(await game!.command(cmd));
  return (
    <>
      <h2>Verschleißteillager</h2>
      <dl data-testid="parts-stock">
        <dt>Bestand</dt><dd className={(c.partsStock ?? 0) < 200 ? 'neg' : ''}>{eur(c.partsStock ?? 0)}</dd>
        {(c.partsIncoming ?? []).flatMap((x, i) => [<dt key={`a${i}`}>Lieferung {fmtDay(x.at)}</dt>, <dd key={`b${i}`}>{eur(x.amount)}</dd>])}
      </dl>
      <div className="card-actions">
        <button onClick={() => send({ kind: 'buyParts', amount: 500 })}>+500 € nachkaufen</button>
        <button onClick={() => send({ kind: 'buyParts', amount: 2000 })} data-testid="buy-parts">+2.000 €</button>
      </div>
      <p className="hint">Schare, Zinken, Scheiben, Filter, Riemen, Schläuche: Bodenbearbeitung verbraucht etwa 3 € je ha. Bei Pannen hat der Werkstattwagen Verschleißteile meist an Bord, sonst lädt er sie am Hof. Ist das Lager leer, müssen sie bestellt werden, und Geräte fallen doppelt so oft aus.</p>
      <h2>Fuhrpark ({c.machines.length})</h2>
      <ul className="cards" data-testid="fleet">
        {c.machines.map((m) => {
          const busy = b.busyMachines.includes(m.id);
          const down = (m.downUntil ?? 0) > b.time;
          const due = m.serviceAtH !== undefined && m.hours >= m.serviceAtH - 20;
          const unit = b.units.find((u) => u.machineId === m.id);
          return (
            <li className="card" key={m.id}>
              <div className="card-head">
                <strong>{machineName(m)}</strong>
                <small>Wert {eur(b.machineValues[m.id] ?? 0)}</small>
              </div>
              <small>{TYPE_NAMES[m.type]}{machineSpecs(m) ? ` · ${machineSpecs(m)}` : ''} · Bj. {m.year} · {m.hours.toLocaleString('de-DE')} h · Zustand {Math.round(m.condition)} %</small>
              <small className={down ? 'warn' : busy ? 'unit-status' : 'hint'}>
                {down ? `${m.downReason}, bis ${fmtDay(m.downUntil!)} ${fmtTime(m.downUntil!)}` : busy ? (unit?.status ?? 'im Einsatz') : 'am Hof'}
              </small>
              <small className={due ? 'warn' : 'hint'}>
                {m.serviceAtH !== undefined ? (m.hours > m.serviceAtH ? `Wartung überfällig (seit ${Math.round(m.hours - m.serviceAtH)} h) – höheres Pannenrisiko` : `nächste Wartung bei ${m.serviceAtH.toLocaleString('de-DE')} h`) : ''}
                {m.breakdowns ? ` · ${m.breakdowns} Pannen` : ''}
                {m.costTotal ? ` · Werkstatt ${eur(m.costTotal)}` : ''}
                {m.downMinutes ? ` · Ausfall ${(m.downMinutes / 60).toLocaleString('de-DE', { maximumFractionDigits: 0 })} h` : ''}
                {(m.warrantyUntil ?? 0) > b.time ? ` · Gewährleistung bis ${fmtDay(m.warrantyUntil!)}` : ''}
              </small>
              {m.saleAt !== undefined && <small className="hint">inseriert – Käufer meldet sich bis etwa {fmtDay(m.saleAt)}</small>}
              {m.lease && (
                <div>
                  <small className="hint">Leasing {eur(m.lease.monthly)}/Monat bis {fmtDay(m.lease.endsAt)} · Restwert {eur(m.lease.residual)} · am Ende {m.lease.buyout ? 'übernehmen' : 'zurückgeben'}</small>
                  <button onClick={() => send({ kind: 'leaseBuyout', machineId: m.id, buyout: !m.lease!.buyout })}>{m.lease.buyout ? 'Doch zurückgeben' : 'Am Ende übernehmen'}</button>
                </div>
              )}
              {m.repair && <RepairChoice m={m} status={status} send={send} />}
              <div className="card-actions">
                <button onClick={() => send({ kind: 'service', machineId: m.id })} disabled={busy || down} data-testid="service">Wartung</button>
                <button onClick={() => send({ kind: 'sell', machineId: m.id, mode: 'tradein' })} disabled={busy}>In Zahlung geben ({eur(Math.round(((b.machineValues[m.id] ?? 0) * 0.8) / 100) * 100)})</button>
                {m.saleAt === undefined && <button onClick={() => send({ kind: 'sell', machineId: m.id, mode: 'privat' })} disabled={busy}>Privat inserieren</button>}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="hint">Zustand sinkt mit den Betriebsstunden, schneller bei überfälliger Wartung. Schlechter Zustand und überfällige Wartung erhöhen das Pannenrisiko. Bei einer Panne kommt der Service des nächsten Markenhändlers – je weiter weg, desto länger dauert es.</p>
      {fb.msg && <p className="feedback">{fb.msg}</p>}
    </>
  );
}

/** Wettbewerb (Phase 5): Ruf, Stammkunden, Konkurrenten mit Preisniveau und Preiskampf */
export function CompetitionTab({ status, game }: { status: GameStatus; game: GameController | null }) {
  const b = status.business;
  if (!b) return <p className="hint">–</p>;
  const m = b.market;
  const quote = m.won + m.lost > 0 ? Math.round((m.won / (m.won + m.lost)) * 100) : 0;
  const sizeName = { gross: 'groß', mittel: 'mittel', klein: 'klein' } as const;
  return (
    <>
      <h2>Ruf</h2>
      <div className="rep-bar" data-testid="reputation"><div style={{ width: `${m.reputation}%` }} /><span>{Math.round(m.reputation)} / 100</span></div>
      <dl>
        <dt>Aufträge gewonnen</dt><dd>{m.won}</dd>
        <dt>an die Konkurrenz verloren</dt><dd>{m.lost}{m.won + m.lost > 0 ? ` (Quote ${quote} %)` : ''}</dd>
        <dt>Stammkunden</dt><dd>{m.loyalFarms.length}</dd>
      </dl>
      <p className="hint">Der Ruf steigt mit pünktlich erledigten Aufträgen und zufriedenen Stammkunden, er sinkt bei Verspätungen, Ausfällen und unbeantworteten Anfragen. Ein guter Ruf bringt mehr Anfragen, Empfehlungen und etwas mehr Spielraum beim Preis.</p>
      {m.loyalFarms.length > 0 && (
        <ul className="list">
          {m.loyalFarms.map((id) => {
            const f = game?.farmById(id);
            return f ? <li key={id}><button className="link" onClick={() => game?.flyToFarm(id)}>{f.name}</button><small>Stammkunde · Zufriedenheit {f.satisfaction} %</small></li> : null;
          })}
        </ul>
      )}
      <h2>Konkurrenz ({m.competitors.length})</h2>
      <table className="tbl" data-testid="competitors">
        <thead><tr><th>Lohnunternehmen</th><th>Ort</th><th>Größe</th><th>Preise</th><th>gewonnen</th></tr></thead>
        <tbody>
          {m.competitors.map((c) => {
            const war = c.warUntil > b.time;
            return (
              <tr key={c.id} className={war ? 'war' : ''}>
                <td>{c.name}</td>
                <td>{c.town}</td>
                <td>{sizeName[c.size]}</td>
                <td className={war ? 'neg' : ''}>{Math.round((c.priceLevel * (war ? 1 - c.warCut : 1) - 1) * 100) >= 0 ? '+' : ''}{Math.round((c.priceLevel * (war ? 1 - c.warCut : 1) - 1) * 100)} %{war ? ` (Preiskampf bis ${fmtDay(c.warUntil)})` : ''}</td>
                <td>{c.won}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">Preise relativ zum Marktpreis. Große Anbieter häckseln auch, mittlere fahren Gülle, kleine nur Bodenbearbeitung. Im Preiskampf vergleichen Kunden im Umkreis von 25 km genauer; unzufriedene Kunden wechseln dann eher.</p>
    </>
  );
}

/** Standorte und Gebäude (ST-01 bis ST-09) */
export function SitesTab({ status, game }: { status: GameStatus; game: GameController | null }) {
  const b = status.business;
  const c = status.company;
  const fb = useFeedback();
  const [mv, setMv] = useState(0);
  const [imp, setImp] = useState(0);
  const [drv, setDrv] = useState(1);
  const [target, setTarget] = useState(1);
  if (!b || !c) return <p className="hint">–</p>;
  const sites = c.sites ?? [];
  const send = async (cmd: Parameters<GameController['command']>[0]) => fb.show(await game!.command(cmd));
  const owned = new Set(sites.map((x) => x.name));
  const movable = c.machines.filter((m) => ['schlepper', 'feldhaecksler', 'radlader', 'firmenwagen'].includes(m.type));
  const implementsList = c.machines.filter((m) => !['schlepper', 'feldhaecksler', 'radlader', 'firmenwagen'].includes(m.type));
  const siteName = (id?: number) => sites.find((x) => x.id === (id ?? 1))?.name ?? 'Stammhof';
  return (
    <>
      {sites.map((st) => (
        <div key={st.id}>
          <h2>{st.name}</h2>
          <small className="hint">{st.kind === 'hof' ? 'Hofstelle im Außenbereich' : st.kind === 'gewerbe' ? 'Gewerbegebiet' : 'Resthof'}{st.rentPerMonth ? ` · Pacht ${eur(st.rentPerMonth)}/Monat` : ''} · {c.machines.filter((m) => (m.siteId ?? 1) === st.id).length} Maschinen</small>
          <ul className="cards" data-testid="buildings">
            {BUILDINGS.map((d) => {
              const bl = st.buildings[d.key];
              const state = !bl ? null : bl.done ? 'fertig' : bl.permitUntil !== undefined && b.time < bl.permitUntil ? `Genehmigung bis ${fmtDay(bl.permitUntil)}` : `im Bau bis ${fmtDay(bl.readyAt ?? b.time)}`;
              const blocked = d.requires && !st.buildings[d.requires];
              return (
                <li key={d.key} className="card">
                  <div className="card-head"><strong>{d.name}</strong><small>{state ?? `${eur(d.cost)} · ${d.weeks} Wochen${d.permit ? ' + Genehmigung' : ''}`}</small></div>
                  <small className="hint">{d.effect} · laufend {eur(d.runningPerYear)}/Jahr</small>
                  {!bl && (
                    <div className="card-actions">
                      <button onClick={() => send({ kind: 'build', siteId: st.id, building: d.key })} disabled={!!blocked} data-testid={`build-${d.key}`}>
                        {blocked ? `erst ${BUILDINGS.find((x) => x.key === d.requires)!.name.split(' (')[0]}` : 'Bauen'}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {st.id !== 1 && <button onClick={() => send({ kind: 'sellSite', siteId: st.id })}>{st.rentPerMonth ? 'Pacht kündigen' : 'Standort verkaufen'}</button>}
        </div>
      ))}
      <h2>Maschinen überführen</h2>
      <div className="card-actions">
        <select value={mv} onChange={(e) => setMv(Number(e.target.value))} aria-label="Maschine">
          <option value={0}>Maschine …</option>
          {movable.map((m) => <option key={m.id} value={m.id}>{machineName(m)} ({siteName(m.siteId)})</option>)}
        </select>
        <select value={imp} onChange={(e) => setImp(Number(e.target.value))} aria-label="Gerät mitnehmen">
          <option value={0}>ohne Gerät</option>
          {implementsList.map((m) => <option key={m.id} value={m.id}>{machineName(m)} ({siteName(m.siteId)})</option>)}
        </select>
        <select value={drv} onChange={(e) => setDrv(Number(e.target.value))} aria-label="Fahrer">
          {c.drivers.map((d) => <option key={d.id} value={d.id}>{d.isPlayer ? 'Chef' : d.name}</option>)}
        </select>
        <select value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="nach">
          {sites.map((x) => <option key={x.id} value={x.id}>nach {x.name}</option>)}
        </select>
        <button onClick={() => send({ kind: 'transfer', machineId: mv, siteId: target, driverId: drv, implementId: imp || undefined })} disabled={!mv}>Überführen</button>
      </div>
      <p className="hint">Fahrten starten und enden am Standort der Maschine. Geräte fahren mit einem Schlepper mit.</p>
      <h2>Grundstücke und Hofstellen</h2>
      <ul className="cards">
        {SITE_OFFERS.filter((o) => !owned.has(o.name)).map((o) => (
          <li key={o.key} className="card">
            <div className="card-head"><strong>{o.name}</strong><strong>{o.rentPerMonth ? `${eur(o.rentPerMonth)}/Monat` : eur(o.price)}</strong></div>
            <small className="hint">{o.note}{o.buildings.length ? ` · vorhanden: ${o.buildings.map((k) => BUILDINGS.find((x) => x.key === k)!.name.split(' (')[0]).join(', ')}` : ''} · Genehmigungen: {o.kind === 'gewerbe' ? '6' : '10'} Wochen</small>
            <div className="card-actions"><button onClick={() => send({ kind: 'buySite', offerKey: o.key })}>{o.rentPerMonth ? 'Pachten' : 'Kaufen'}</button></div>
          </li>
        ))}
      </ul>
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

/**
 * Fahrerwechsel: am Hof sofort, draußen bringt ein dritter Fahrer den Ersatz mit dem
 * Firmenwagen hin und nimmt den abgelösten Fahrer mit zurück.
 */
export function SwapDriver({ status, game, vehicle, atHome, show, current }: { status: GameStatus; game: GameController | null; vehicle: number; atHome: boolean; show: (m: string) => void; current?: number }) {
  const [driver, setDriver] = useState(0);
  const [chauffeur, setChauffeur] = useState(0);
  const drivers = status.company?.drivers ?? [];
  const free = drivers.filter((x) => !status.business?.driverStatus[x.id] && x.id !== current);
  const name = (x: Employee) => (x.isPlayer ? 'Chef' : x.name);
  return (
    <div className="card-actions">
      <select value={driver} onChange={(e) => setDriver(Number(e.target.value))} aria-label="Neuer Fahrer" data-testid="swap-driver">
        <option value={0}>Fahrer wechseln …</option>
        {free.map((x) => <option key={x.id} value={x.id}>{name(x)}</option>)}
      </select>
      {!atHome && (
        <select value={chauffeur} onChange={(e) => setChauffeur(Number(e.target.value))} aria-label="Bringt ihn hin" data-testid="swap-chauffeur">
          <option value={0}>… gebracht von</option>
          {free.filter((x) => x.id !== driver).map((x) => <option key={x.id} value={x.id}>{name(x)} (Firmenwagen)</option>)}
        </select>
      )}
      <button disabled={!driver || (!atHome && !chauffeur)} onClick={async () => show(await game!.command({ kind: 'swapDriver', vehicle, driverId: driver, chauffeurId: atHome ? undefined : chauffeur }))} data-testid="swap-go">
        {atHome ? 'Am Hof wechseln' : 'Hinbringen'}
      </button>
    </div>
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
          {unit.orderId !== undefined && unit.busy && <SwapDriver status={status} game={game} vehicle={menu.vehicle} atHome={unit.atHome} show={fb.show} />}
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

/** Spalten der Monatsübersicht; Finanzierung = Kredit, Tilgung, Zinsen, Leasing; Abgaben = Versicherung, Steuern */
const CATEGORIES = ['Rechnung', 'Diesel', 'Personal', 'Werkstatt', 'Maschinenkauf', 'Finanzierung', 'Abgaben', 'Sonstiges'] as const;
const CATEGORY_GROUP: Record<string, string> = { Kredit: 'Finanzierung', Tilgung: 'Finanzierung', Zinsen: 'Finanzierung', Leasing: 'Finanzierung', Versicherung: 'Abgaben', Steuern: 'Abgaben' };
const pct = (v: number) => `${(v * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;

/** Finanzen: Konto, Monatsübersicht, Rechnungen, Auswertung je Auftrag (WF-08, WF-09) */
function invoiceState(i: Invoice): string {
  switch (i.status) {
    case 'bezahlt': return `bezahlt am ${fmtDay(i.paidAt!)}`;
    case 'verfallen': return 'verfallen (Kunde nicht kontaktiert)';
    case 'überfällig': return i.remindedAt !== undefined ? `überfällig, erinnert am ${fmtDay(i.remindedAt)}` : `überfällig – Kunden bis ${fmtDay(i.contactBy!)} kontaktieren (Anruf oder Besuch)`;
    default: return `zahlbar bis ${fmtDay(i.dueAt)}`;
  }
}

/** Darlehen (WF-01): aufnehmen, Übersicht, Sondertilgung */
function LoanPanel({ status, game }: { status: GameStatus; game: GameController | null }) {
  const b = status.business!;
  const c = status.company!;
  const fb = useFeedback();
  const [amount, setAmount] = useState('50000');
  const [years, setYears] = useState(5);
  const [extra, setExtra] = useState('5000');
  const send = async (cmd: Parameters<GameController['command']>[0]) => fb.show(await game!.command(cmd));
  const loans = c.loans ?? [];
  return (
    <>
      <h2>Darlehen</h2>
      <dl>
        <dt>Kreditrahmen</dt><dd>{eur(c.creditLimit)} · frei {eur(c.creditLimit - c.loan)}</dd>
        <dt>Offene Darlehen</dt><dd>{eur(c.loan)}</dd>
      </dl>
      {loans.length > 0 && (
        <ul className="list" data-testid="loans">
          {loans.map((l) => (
            <li key={l.id}>
              <span>{eur(l.principal)} · {pct(l.rate)} · Rest {eur(l.remaining)}</span>
              <small className="hint">Rate {eur(l.monthly)}/Monat · noch etwa {Math.ceil(l.remaining / Math.max(1, l.monthly - (l.remaining * l.rate) / 12))} Monate</small>
              <span className="counter">
                <input value={extra} onChange={(e) => setExtra(e.target.value)} aria-label="Sondertilgung" style={{ width: 70 }} />
                <button onClick={() => send({ kind: 'repayLoan', loanId: l.id, amount: Number(extra) })}>Sondertilgung</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="card-actions">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Darlehensbetrag" style={{ width: 80 }} data-testid="loan-amount" />
        <select value={years} onChange={(e) => setYears(Number(e.target.value))} aria-label="Laufzeit">
          {[3, 5, 8, 10].map((y) => <option key={y} value={y}>{y} Jahre · {pct(b.loanRates[y] ?? 0)}</option>)}
        </select>
        <button onClick={() => send({ kind: 'takeLoan', amount: Number(amount), years })} data-testid="take-loan">Darlehen aufnehmen</button>
      </div>
      <small className="hint">Annuität mit monatlicher Rate. Zins nach Laufzeit und Bonität (A–D); der Kreditrahmen richtet sich nach dem Eigenkapital. Sondertilgung ohne Gebühr.</small>
      {fb.msg && <p className="feedback">{fb.msg}</p>}
    </>
  );
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
    const cat = CATEGORY_GROUP[l.category] ?? l.category;
    m[cat] = (m[cat] ?? 0) + l.amount;
    months.set(key, m);
  }
  const openInv = b.invoices.filter((i) => i.status === 'offen' || i.status === 'überfällig');
  const lost = b.invoices.filter((i) => i.status === 'verfallen');
  const finished = b.orders.filter((o) => o.status === 'fertig').slice().reverse();
  return (
    <>
      <h2>Konto</h2>
      <dl>
        <dt>Kontostand</dt><dd data-testid="cash-finance" className={c.cash < 0 ? 'neg' : ''}>{eur(c.cash)}</dd>
        <dt>Kontokorrent</dt><dd>{eur(c.overdraftLimit ?? 0)} Rahmen · 11 % Zins im Minus</dd>
        <dt>Offene Rechnungen</dt><dd>{eur(openInv.reduce((a, i) => a + i.amount, 0))} ({openInv.length})</dd>
        {lost.length > 0 && <><dt>Forderungsausfall</dt><dd className="neg">{eur(lost.reduce((a, i) => a + i.amount, 0))} ({lost.length})</dd></>}
        <dt>Bonität</dt><dd data-testid="rating">{c.rating ?? 'A'} · Eigenkapital {eur(b.balance.equity)} ({b.balance.assets > 0 ? Math.round((b.balance.equity / b.balance.assets) * 100) : 0} %)</dd>
        <dt>Dieselpreis</dt><dd>{b.dieselPrice.toLocaleString('de-DE', { minimumFractionDigits: 3 })} €/l netto</dd>
        {b.taxDue && <><dt>Steuern {b.taxDue.year}</dt><dd className="neg">{eur(b.taxDue.amount)} fällig {fmtDay(b.taxDue.at)}</dd></>}
      </dl>
      <LoanPanel status={status} game={game} />
      <h2>Laufendes Jahr</h2>
      <dl data-testid="year-now">
        <dt>Umsatz</dt><dd>{eur(b.yearNow.revenue)}</dd>
        <dt>Kosten (ohne Investitionen)</dt><dd>{eur(b.yearNow.expenses)}</dd>
        <dt>Abschreibung (AfA)</dt><dd>{eur(b.yearNow.afa)}</dd>
        <dt>Ergebnis vor Steuern</dt><dd className={b.yearNow.profit < 0 ? 'neg' : 'pos'}>{eur(b.yearNow.profit)}</dd>
      </dl>
      {b.years.length > 0 && (
        <table className="tbl" data-testid="years">
          <thead><tr><th>Jahr</th><th>Umsatz</th><th>Kosten</th><th>AfA</th><th>Gewinn</th><th>Steuern</th></tr></thead>
          <tbody>
            {b.years.slice().reverse().map((y) => (
              <tr key={y.year}><td>{y.year}</td><td>{eur(y.revenue)}</td><td>{eur(y.expenses)}</td><td>{eur(y.afa)}</td><td className={y.profit < 0 ? 'neg' : 'pos'}>{eur(y.profit)}</td><td>{eur(y.tax)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <h2>Monatsübersicht</h2>
      {months.size ? (
        <div className="tbl-wrap"><table className="tbl">
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
        </table></div>
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
        <div className="tbl-wrap"><table className="tbl">
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
        </table></div>
      ) : (
        <p className="hint">Noch keine abgeschlossenen Aufträge.</p>
      )}
      <p className="hint">* kalkulatorisch: Reparaturkosten Schlepper 4 € + 0,50 € je 1.000 Betriebsstunden je Stunde, Verschleiß Grubber 3 €/ha (Annahmen); Lohn des Chefs nicht eingerechnet.</p>
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
