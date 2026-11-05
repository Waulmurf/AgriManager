import { useEffect, useRef, useState } from 'react';
import { GameController, type GameStatus } from './game/controller';
import { formatGameTime } from './game/clock';
import { runSelftest } from './game/selftest';
import { forwardLogsToHost, platformName, selftestConfig } from './platform';
import type { Speed } from './sim/protocol';
import { BusinessTab, FinanceTab, MarketTab, NewsTab, OrdersTab, SavePanel, VehicleMenu } from './ui/Panels';
import { AUTOSAVE } from './game/savegame';

const TABS = [
  { id: 'betrieb', label: 'Betrieb' },
  { id: 'auftraege', label: 'Aufträge' },
  { id: 'finanzen', label: 'Finanzen' },
  { id: 'markt', label: 'Markt' },
  { id: 'nachrichten', label: 'Meldungen' },
  { id: 'technik', label: 'Technik' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const SPEEDS: { value: Speed; label: string; key: string }[] = [
  { value: 0, label: 'Pause', key: 'Leertaste' },
  { value: 1, label: '1x', key: '1' },
  { value: 10, label: '10x', key: '2' },
  { value: 100, label: '100x', key: '3' },
];

export function App() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<GameController | null>(null);
  const [status, setStatus] = useState<GameStatus | null>(null);
  const [selftest, setSelftest] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('betrieb');
  const [saveOpen, setSaveOpen] = useState(false);

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
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') game.closeMenu();
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
  const openRequests = status?.business?.requests.filter((r) => r.status === 'offen').length ?? 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>Lohnbetrieb-Simulation</strong>
          <span className="sub">Technischer Prototyp</span>
        </div>
        <div className="clock" data-testid="clock">
          <span className="date">{clock.date}</span>
          <span className="time">{clock.time}</span>
        </div>
        <div className="save-wrap">
          <button className="save-btn" onClick={() => { setSaveOpen((o) => !o); void game?.refreshSaves(); }} data-testid="save-menu">
            Spielstand{status?.saveName ? `: ${status.saveName}` : ''}
          </button>
          {saveOpen && status && <SavePanel status={status} game={game} onClose={() => setSaveOpen(false)} />}
        </div>
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
              {s.label}
            </button>
          ))}
        </div>
      </header>

      <main className="main">
        <div ref={mapRef} className="map" data-testid="map" />
        {status && <VehicleMenu status={status} game={game} />}
        {status?.phase === 'loading' && <div className="overlay">Karte und Straßengraph werden geladen …</div>}
        {status?.phase === 'error' && (
          <div className="overlay error" role="alert">
            <strong>Fehler beim Start</strong>
            <span>{status.message}</span>
          </div>
        )}

        <aside className="panel" data-testid="panel">
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}>
                {t.label}
                {t.id === 'auftraege' && openRequests > 0 ? <span className="dot">{openRequests}</span> : null}
              </button>
            ))}
          </nav>
          {status && (
            <>
              <section hidden={tab !== 'betrieb'}><BusinessTab status={status} game={game} /></section>
              <section hidden={tab !== 'auftraege'}><OrdersTab status={status} game={game} /></section>
              <section hidden={tab !== 'finanzen'}><FinanceTab status={status} game={game} /></section>
              <section hidden={tab !== 'markt'}><MarketTab status={status} game={game} /></section>
              <section hidden={tab !== 'nachrichten'}><NewsTab status={status} game={game} /></section>
            </>
          )}
          <section hidden={tab !== 'technik'}>
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
        </aside>
      </main>
    </div>
  );
}
