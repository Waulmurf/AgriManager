import { useEffect, useRef, useState } from 'react';
import { GameController, type GameStatus } from './game/controller';
import { formatGameTime } from './game/clock';
import { runSelftest } from './game/selftest';
import { forwardLogsToHost, platformName, selftestConfig } from './platform';
import type { Speed } from './sim/protocol';
import { AnalyticsTab } from './ui/Analytics';
import { MunicipalTab, BiogasTab, BusinessTab, CompetitionTab, FarmingTab, SitesTab, FinanceTab, FleetTab, MarketTab, NewsTab, OrdersTab, SavePanel, StaffTab, VehicleMenu, eur, needsWorkshop } from './ui/Panels';
import { FleetBar, Leitstand, MapLayers, Toasts, type AreaId } from './ui/Shell';
import { AUTOSAVE } from './game/savegame';
import { PlanningBoard } from './ui/Board';

type Sub = { id: string; label: string };
interface Area { id: AreaId; icon: string; label: string; subs?: Sub[]; window?: boolean }

/** Bereiche der Navigationsleiste; Unterbereiche als Umschalter in der Seitenleiste */
const AREAS: Area[] = [
  { id: 'leitstand', icon: '⌂', label: 'Leitstand', subs: [{ id: 'heute', label: 'Heute' }, { id: 'betrieb', label: 'Betrieb und Kunden' }] },
  { id: 'auftraege', icon: '✎', label: 'Aufträge', subs: [{ id: 'anfragen', label: 'Anfragen' }, { id: 'laufend', label: 'Laufend' }, { id: 'erledigt', label: 'Erledigt' }, { id: 'wettbewerb', label: 'Wettbewerb' }] },
  { id: 'fuhrpark', icon: '⚙', label: 'Fuhrpark', subs: [{ id: 'alle', label: 'Alle' }, { id: 'einsatz', label: 'Im Einsatz' }, { id: 'werkstatt', label: 'Werkstatt' }] },
  { id: 'personal', icon: '☺', label: 'Personal', subs: [{ id: 'team', label: 'Mitarbeiter' }, { id: 'bewerbung', label: 'Bewerbungen' }, { id: 'buero', label: 'Büro' }] },
  { id: 'finanzen', icon: '€', label: 'Finanzen', subs: [{ id: 'ueberblick', label: 'Überblick' }, { id: 'rechnungen', label: 'Rechnungen' }, { id: 'kredite', label: 'Darlehen' }] },
  { id: 'markt', icon: '⚖', label: 'Markt', window: true },
  { id: 'sparten', icon: '❖', label: 'Sparten', subs: [{ id: 'ackerbau', label: 'Ackerbau' }, { id: 'biogas', label: 'Biogas' }, { id: 'kommunal', label: 'Kommunal' }, { id: 'standorte', label: 'Standorte' }] },
  { id: 'auswertung', icon: '▤', label: 'Auswertung', window: true },
  { id: 'meldungen', icon: '✉', label: 'Meldungen', subs: [{ id: 'alle', label: 'Alle' }, { id: 'wichtig', label: 'Wichtig' }, { id: 'auftraege', label: 'Aufträge' }] },
];
const TECHNIK: Area = { id: 'technik', icon: '⚒', label: 'Technik und Leistung' };

const SPEEDS: { value: Speed; label: string; key: string }[] = [
  { value: 0, label: 'Pause', key: 'Leertaste' },
  { value: 1, label: '1x', key: '1' },
  { value: 10, label: '10x', key: '2' },
  { value: 100, label: '100x', key: '3' },
];

/** einfaches Wettersymbol */
export function weatherIcon(rain: number, frost = false): string {
  if (frost) return '❄';
  if (rain >= 5) return '🌧';
  if (rain > 0) return '🌦';
  return '☀';
}

export function App() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<GameController | null>(null);
  const [status, setStatus] = useState<GameStatus | null>(null);
  const [selftest, setSelftest] = useState<string | null>(null);
  const [area, setArea] = useState<AreaId>('leitstand');
  const [subs, setSubs] = useState<Partial<Record<AreaId, string>>>({});
  const [windowOpen, setWindowOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  /** Bereich (und Unterbereich) wählen; Markt und Auswertung öffnen ein großes Fenster */
  const go = (a: AreaId, sub?: string) => {
    setArea(a);
    if (sub) setSubs((x) => ({ ...x, [a]: sub }));
    const def = AREAS.find((x) => x.id === a);
    setWindowOpen(!!def?.window);
    if (def?.window) setBoardOpen(false);
    setMenuOpen(false);
  };

  useEffect(() => {
    const g = new GameController();
    const unsub = g.subscribe(setStatus);
    setGame(g);
    (window as unknown as { __game?: GameController }).__game = g;
    let cancelled = false;
    selftestConfig().then(async (cfg) => {
      const log = cfg.enabled ? forwardLogsToHost() : null;
      log?.(`Start ${navigator.userAgent}`);
      await g.start(mapRef.current!);
      if (cancelled) return;
      log?.(`Spielstatus ${g.status.phase}${g.status.message ? ': ' + g.status.message : ''}`);
      if (cfg.enabled) {
        g.autosave = false;
        setSelftest('läuft …');
        const r = await runSelftest(g, cfg.seconds, cfg.minFps, cfg.minSps, log ?? undefined);
        setSelftest(r.ok ? 'bestanden' : `fehlgeschlagen: ${r.failures.join(', ')}`);
      } else {
        // Weiterspielen: Autosave laden, sofern vorhanden (nicht bei ?neu)
        const saves = await g.refreshSaves();
        const fresh = new URLSearchParams(window.location.search).has('neu');
        if (!fresh && saves.some((x) => x.name === AUTOSAVE)) await g.loadGame(AUTOSAVE);
        g.setSpeed(1);
      }
    });
    return () => {
      cancelled = true;
      unsub();
      g.destroy();
    };
  }, []);

  useEffect(() => {
    if (!game) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      // Kürzel mit Cmd/Strg/Alt gehören dem System (macOS: Cmd+1 usw.)
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') { game.closeMenu(); setBoardOpen(false); setWindowOpen(false); setMenuOpen(false); }
      if (e.code === 'Space') {
        e.preventDefault();
        game.setSpeed(game.status.speed === 0 ? 1 : 0);
      } else if (e.key === '1') game.setSpeed(1);
      else if (e.key === '2') game.setSpeed(10);
      else if (e.key === '3') game.setSpeed(100);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game]);

  const clock = formatGameTime(status?.time ?? 0);
  const st = status?.stats;
  const b = status?.business;
  const c = status?.company;
  const openRequests = b?.requests.filter((r) => r.status === 'offen').length ?? 0;
  // überfällige Rechnungen ohne Kontakt: aktive Benachrichtigung in der oberen Leiste
  const overdue = b?.invoices.filter((i) => i.status === 'überfällig' && i.remindedAt === undefined).length ?? 0;
  const workshop = c && b ? c.machines.filter((m) => needsWorkshop(m, b.time)).length : 0;
  const breakdowns = c && b ? c.machines.filter((m) => m.repair || (m.downUntil ?? 0) > b.time).length : 0;
  const badges: Partial<Record<AreaId, number>> = { auftraege: openRequests, fuhrpark: breakdowns, finanzen: overdue, personal: b?.staffRequests.length ?? 0 };
  const subCount: Record<string, number | undefined> = {
    'auftraege/anfragen': openRequests,
    'auftraege/laufend': b?.orders.filter((o) => o.status !== 'fertig').length,
    'fuhrpark/werkstatt': workshop || undefined,
    'personal/bewerbung': b ? b.applicants.length + b.agencyPool.length : undefined,
    'finanzen/rechnungen': overdue || undefined,
  };
  const cur = area === 'technik' ? TECHNIK : AREAS.find((x) => x.id === area)!;
  const sub = subs[area] ?? cur.subs?.[0].id;
  const show = (a: AreaId, s?: string) => area === a && (s === undefined || sub === s);
  const fc = b?.weather.forecast.filter((f) => f.day > Math.floor((b?.time ?? 0) / 1440)).slice(0, 2) ?? [];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>{c?.name ?? 'Lohnbetrieb'}</strong>
          <span className="sub">Groß Thondorf · {clock.date.slice(-4)}</span>
        </div>
        {c && (
          <div className="chips">
            <button className="chip" onClick={() => go('finanzen', 'ueberblick')} title="Finanzen">
              <span>Konto</span><strong data-testid="cash" className={c.cash < 0 ? 'neg' : ''}>{eur(c.cash)}</strong>
            </button>
            <button className="chip" onClick={() => go('finanzen', 'kredite')} title="Darlehen">
              <span>Kreditrahmen frei</span><strong>{eur(c.creditLimit - c.loan)}</strong>
            </button>
            {b && (
              <button className="chip" onClick={() => go('auftraege', 'wettbewerb')} title="Ruf und Wettbewerb">
                <span>Ruf</span><strong>{Math.round(b.market.reputation)} / 100</strong>
              </button>
            )}
          </div>
        )}
        {c?.bankruptAt !== undefined && <strong className="warn-chip" data-testid="game-over">Insolvenz – Spiel vorbei (Spielstand laden)</strong>}
        {c?.sanierung && c.bankruptAt === undefined && <strong className="warn-chip">Sanierungsphase</strong>}
        {overdue > 0 && (
          <button className="alert-btn" onClick={() => go('finanzen', 'rechnungen')} data-testid="overdue-alert" title="Kunden anrufen oder besuchen, sonst verfällt die Forderung">
            {overdue === 1 ? '1 Rechnung überfällig' : `${overdue} Rechnungen überfällig`}
          </button>
        )}
        <div className="clock" data-testid="clock">
          <span className="date">{clock.date}</span>
          <span className="time">{clock.time}</span>
        </div>
        {b && (
          <div className="weather" data-testid="weather" title={`Bodenfeuchte ${b.weather.soil.toLocaleString('de-DE')} mm · ${b.weather.blocked ?? 'Feldarbeit möglich'}`}>
            <div className={`wx-day ${b.weather.blocked ? 'wet' : ''}`}>
              <small>heute</small>
              <span>{weatherIcon(b.weather.rain, b.weather.frost)} {Math.round(b.weather.temp)}°</span>
            </div>
            {fc.map((f) => (
              <div key={f.day} className={`wx-day ${f.blocked ? 'wet' : ''}`} title={`${Math.round(f.rainChance * 100)} % Regen, ${f.rainMm.toLocaleString('de-DE', { maximumFractionDigits: 0 })} mm`}>
                <small>{formatGameTime(f.day * 1440).date.slice(0, 2)}</small>
                <span>{weatherIcon(f.rainMm)} {Math.round(f.temp)}°</span>
              </div>
            ))}
            <small className={b.weather.blocked ? 'wx-bad' : 'wx-ok'}>{b.weather.blocked ?? 'Feldarbeit möglich'}</small>
          </div>
        )}
        <div className="speeds" role="group" aria-label="Spielgeschwindigkeit">
          {SPEEDS.map((s) => (
            <button
              key={s.value}
              className={status?.speed === s.value ? 'active' : ''}
              onClick={() => game?.setSpeed(s.value)}
              title={`${s.label} (Taste ${s.key})`}
              disabled={status?.phase !== 'running'}
              data-testid={`speed-${s.value}`}
            >
              {s.value === 0 ? '❚❚' : s.label}
            </button>
          ))}
        </div>
        <button className="planning-btn" onClick={() => { setBoardOpen((o) => !o); setWindowOpen(false); }} data-testid="board-open" disabled={status?.phase !== 'running'}>Planung</button>
        <div className="save-wrap">
          <button className="menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Menü" aria-expanded={menuOpen} data-testid="menu">☰</button>
          {menuOpen && (
            <div className="menu-panel" role="menu">
              <button role="menuitem" onClick={() => { setSaveOpen(true); setMenuOpen(false); void game?.refreshSaves(); }} data-testid="save-menu">Spielstand{status?.saveName ? `: ${status.saveName}` : ' …'}</button>
              <button role="menuitem" onClick={() => go('technik')} data-testid="tab-technik">Technik und Leistung</button>
              <button role="menuitem" onClick={() => { game?.fitRegion(); setMenuOpen(false); }}>Ganzes Gebiet zeigen</button>
              <button role="menuitem" onClick={() => { game?.zoomHome(13); setMenuOpen(false); }}>Zum Hof</button>
            </div>
          )}
          {saveOpen && status && <SavePanel status={status} game={game} onClose={() => setSaveOpen(false)} />}
        </div>
      </header>

      <main className="main">
        <nav className="rail" role="tablist" aria-label="Bereiche">
          {AREAS.map((a) => (
            <button key={a.id} role="tab" aria-selected={area === a.id} className={area === a.id ? 'active' : ''} onClick={() => go(a.id)} data-testid={`tab-${a.id}`}>
              <span className="rail-icon" aria-hidden>{a.icon}</span>
              <span>{a.label}</span>
              {badges[a.id] ? <span className="dot">{badges[a.id]}</span> : null}
            </button>
          ))}
        </nav>

        <div className="map-wrap">
          <div ref={mapRef} className="map" data-testid="map" />
          {status?.phase === 'running' && <MapLayers game={game} />}
          {status && <Toasts status={status} game={game} go={go} />}
          {status && <FleetBar status={status} game={game} />}
          {status && <VehicleMenu status={status} game={game} />}
          {boardOpen && status && <PlanningBoard status={status} game={game} onClose={() => setBoardOpen(false)} />}
          {windowOpen && status && (area === 'markt' || area === 'auswertung') && (
            <div className="window" data-testid={`window-${area}`}>
              <div className="window-head">
                <strong>{cur.label}</strong>
                {c && <span className="hint">Konto {eur(c.cash)} · Kreditrahmen frei {eur(c.creditLimit - c.loan)}</span>}
                <button className="close" onClick={() => setWindowOpen(false)} aria-label="Schließen">×</button>
              </div>
              <div className="window-body">
                {area === 'markt' ? <MarketTab status={status} game={game} /> : <AnalyticsTab status={status} game={game} />}
              </div>
            </div>
          )}
          {status?.phase === 'loading' && <div className="overlay">Karte und Straßengraph werden geladen …</div>}
          {status?.phase === 'error' && (
            <div className="overlay error" role="alert">
              <strong>Fehler beim Start</strong>
              <span>{status.message}</span>
            </div>
          )}
        </div>

        <aside className="panel" data-testid="panel">
          <div className="panel-head">
            <h1>{cur.label}</h1>
            {cur.subs && (
              <div className="segmented" role="tablist">
                {cur.subs.map((x) => (
                  <button key={x.id} role="tab" aria-selected={sub === x.id} className={sub === x.id ? 'active' : ''} onClick={() => go(area, x.id)} data-testid={`sub-${x.id}`}>
                    {x.label}{subCount[`${area}/${x.id}`] ? <span className="count">{subCount[`${area}/${x.id}`]}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="panel-body">
          {status && (
            <>
              <section hidden={!show('leitstand', 'heute')}><Leitstand status={status} game={game} go={go} /></section>
              <section hidden={!show('leitstand', 'betrieb')}><BusinessTab status={status} game={game} /></section>
              <section hidden={!show('auftraege', 'anfragen')}><OrdersTab status={status} game={game} part="anfragen" /></section>
              <section hidden={!show('auftraege', 'laufend')}><OrdersTab status={status} game={game} part="laufend" /></section>
              <section hidden={!show('auftraege', 'erledigt')}><OrdersTab status={status} game={game} part="erledigt" /></section>
              <section hidden={!show('auftraege', 'wettbewerb')}><CompetitionTab status={status} game={game} /></section>
              <section hidden={!show('fuhrpark', 'alle')}><FleetTab status={status} game={game} part="alle" /></section>
              <section hidden={!show('fuhrpark', 'einsatz')}><FleetTab status={status} game={game} part="einsatz" /></section>
              <section hidden={!show('fuhrpark', 'werkstatt')}><FleetTab status={status} game={game} part="werkstatt" /></section>
              <section hidden={!show('personal', 'team')}><StaffTab status={status} game={game} part="team" /></section>
              <section hidden={!show('personal', 'bewerbung')}><StaffTab status={status} game={game} part="bewerbung" /></section>
              <section hidden={!show('personal', 'buero')}><StaffTab status={status} game={game} part="buero" /></section>
              <section hidden={!show('finanzen', 'ueberblick')}><FinanceTab status={status} game={game} part="ueberblick" /></section>
              <section hidden={!show('finanzen', 'rechnungen')}><FinanceTab status={status} game={game} part="rechnungen" /></section>
              <section hidden={!show('finanzen', 'kredite')}><FinanceTab status={status} game={game} part="kredite" /></section>
              <section hidden={!show('sparten', 'ackerbau')}><FarmingTab status={status} game={game} /></section>
              <section hidden={!show('sparten', 'biogas')}><BiogasTab status={status} game={game} /></section>
              <section hidden={!show('sparten', 'kommunal')}><MunicipalTab status={status} game={game} /></section>
              <section hidden={!show('sparten', 'standorte')}><SitesTab status={status} game={game} /></section>
              <section hidden={!show('meldungen', 'alle')}><NewsTab status={status} game={game} filter="alle" /></section>
              <section hidden={!show('meldungen', 'wichtig')}><NewsTab status={status} game={game} filter="wichtig" /></section>
              <section hidden={!show('meldungen', 'auftraege')}><NewsTab status={status} game={game} filter="auftraege" /></section>
              {(area === 'markt' || area === 'auswertung') && (
                <section>
                  <p className="hint">{area === 'markt' ? 'Der Markt braucht Platz und öffnet als großes Fenster über der Karte: Händler links wählen oder eine Geräteart über alle Händler vergleichen.' : 'Diagramme nach Sparten, Auslastung von Maschinen und Fahrern und Deckungsbeitrag je Kunde im großen Fenster.'}</p>
                  {!windowOpen && <div className="card-actions"><button onClick={() => setWindowOpen(true)}>Großes Fenster öffnen</button></div>}
                </section>
              )}
            </>
          )}
          <section hidden={area !== 'technik'}>
          <h2>Testfahrzeuge</h2>
          <label className="toggle">
            <input type="checkbox" checked={status?.testVehiclesVisible ?? false} onChange={(e) => game?.showTestVehicles(e.target.checked)} data-testid="toggle-test-vehicles" />
            auf der Karte zeigen (zufälliger Verkehr für Leistungstests)
          </label>
          <dl>
            <dt>Fahrzeuge</dt><dd data-testid="vehicle-count">{status?.vehicles ?? 0}</dd>
            <dt>unterwegs</dt><dd>{st?.driving ?? 0}</dd>
            <dt>auf dem Feld</dt><dd>{st?.working ?? 0}</dd>
            <dt>am Hof / wartend</dt><dd>{st?.waiting ?? 0}</dd>
            <dt>erledigte Felder</dt><dd>{st?.trips ?? 0}</dd>
          </dl>
          <h2>Leistung</h2>
          <dl>
            <dt>Bildrate</dt><dd data-testid="fps">{(status?.fps ?? 0).toFixed(0)} fps</dd>
            <dt>Bildzeit (P95)</dt><dd>{(status?.frameP95 ?? 0).toFixed(1)} ms</dd>
            <dt>Schritte/s</dt><dd data-testid="sps">{(st?.stepsPerSecond ?? 0).toFixed(0)}</dd>
            <dt>Rechenzeit/Schritt</dt><dd>{(st?.msPerStep ?? 0).toFixed(3)} ms</dd>
            <dt>Zeichnen/Bild</dt><dd>{(status?.updateMs ?? 0).toFixed(2)} ms</dd>
            <dt>Routen (A*/Cache)</dt><dd>{st ? `${st.searches} / ${st.cacheHits}` : '–'}</dd>
          </dl>
          <h2>Karte</h2>
          <dl>
            <dt>Gebiet</dt><dd>{status?.region ? `${status.region.radiusKm} km um Groß Thondorf` : '–'}</dd>
            <dt>Straßengraph</dt><dd>{status?.graph ? `${status.graph.nodes.toLocaleString('de-DE')} Knoten` : '–'}</dd>
            <dt>Felder</dt><dd data-testid="field-count">{status?.fieldCount ? status.fieldCount.toLocaleString('de-DE') : '–'}</dd>
            <dt>Daten</dt><dd>{status?.region?.tag ?? '–'}</dd>
            <dt>System</dt><dd>{platformName()}</dd>
          </dl>
          <div className="panel-actions">
            <button onClick={() => game?.fitRegion()}>Ganzes Gebiet</button>
            <button onClick={() => game?.zoomHome(13)}>Zum Hof</button>
          </div>
          </section>
          {selftest && <p className="selftest" data-testid="selftest">Selbsttest: {selftest}</p>}
          </div>
        </aside>
      </main>
    </div>
  );
}
