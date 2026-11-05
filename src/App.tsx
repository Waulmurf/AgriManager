import { useEffect, useRef, useState } from 'react';
import { GameController, type GameStatus } from './game/controller';
import { formatGameTime } from './game/clock';
import { runSelftest } from './game/selftest';
import { forwardLogsToHost, platformName, selftestConfig } from './platform';
import type { Speed } from './sim/protocol';
import { machineValue } from './sim/economy';

const eur = (v: number) => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

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
        setSelftest('läuft …');
        const r = await runSelftest(g, cfg.seconds, cfg.minFps, cfg.minSps, log ?? undefined);
        setSelftest(r.ok ? 'bestanden' : `fehlgeschlagen: ${r.failures.join(', ')}`);
      } else {
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
        {status?.phase === 'loading' && <div className="overlay">Karte und Straßengraph werden geladen …</div>}
        {status?.phase === 'error' && (
          <div className="overlay error" role="alert">
            <strong>Fehler beim Start</strong>
            <span>{status.message}</span>
          </div>
        )}

        <aside className="panel" data-testid="panel">
          <h2>Mein Betrieb</h2>
          {status?.company ? (
            <>
              <dl data-testid="company">
                <dt>Konto</dt><dd data-testid="cash">{eur(status.company.cash)}</dd>
                <dt>Kreditrahmen</dt><dd>{eur(status.company.creditLimit - status.company.loan)} frei</dd>
                <dt>Standort</dt><dd>Groß Thondorf</dd>
                <dt>Fahrer</dt><dd>{status.company.drivers.length} (nur du)</dd>
              </dl>
              <ul className="machines">
                {status.company.machines.map((m) => (
                  <li key={m.id}>
                    <span>{[m.brand, m.model].filter(Boolean).join(' ')}{m.power ? `, ${m.power} PS` : ''}</span>
                    <small>Bj. {m.year} · {m.hours.toLocaleString('de-DE')} h · Zustand {m.condition} % · Wert {eur(machineValue(m))}</small>
                  </li>
                ))}
              </ul>
              <p className="hint">{status.company.site}</p>
            </>
          ) : (
            <p className="hint">–</p>
          )}
          <h2>Kunden</h2>
          <dl>
            <dt>Betriebe im Gebiet</dt><dd data-testid="farm-count">{status?.farmCount ? status.farmCount.toLocaleString('de-DE') : '–'}</dd>
            <dt>im Adressbuch</dt><dd>{status?.knownFarms ?? 0}</dd>
          </dl>
          {status?.farmCount ? <p className="hint">Hofstellen anklicken für Details. Erst ein Besuch bringt einen Betrieb ins Adressbuch.</p> : null}
          <h2>Testfahrzeuge</h2>
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
          {selftest && <p className="selftest" data-testid="selftest">Selbsttest: {selftest}</p>}
        </aside>
      </main>
    </div>
  );
}
