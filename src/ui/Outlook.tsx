/**
 * Ausblick: welche Dienste in den nächsten Monaten gefragt sein werden – aus dem Jahreslauf der
 * Kulturen (seasonServices: Bestellung, Pflege, Ernte) und den Flächen der Kunden. Die erwartete
 * Zahl der Anfragen folgt derselben Rechnung wie die Anfragen im Spiel (Chance je Tag nach
 * Mechanisierung, Wahl des Dienstes nach Gewicht), ohne Ruf, Stammkunden und Preiskampf.
 */
import { useMemo, useState } from 'react';
import type { GameController, GameStatus } from '../game/controller';
import { SERVICE_IMPLEMENT, SERVICE_NAMES, seasonServices, type Service } from '../sim/business';
import { gameDate, type MachineType } from '../sim/economy';
import { CROP_NAMES, Crop, hasBga, isOrganic } from '../sim/farms';
import type { FarmSummary } from '../sim/protocol';
import { TYPE_NAMES } from './Panels';

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const HORIZON_DAYS = 183;
const CROPS_SHOWN: Crop[] = [Crop.Getreide, Crop.Raps, Crop.Mais, Crop.Zuckerrueben, Crop.Kartoffeln];

interface Cell { weightDays: number; days: number; crops: Set<number>; expected: number; ha: number }
interface Row { key: string; service: Service; liquid: boolean; cells: Map<string, Cell> }

const rowName = (service: Service, liquid: boolean) => (liquid ? 'Gülle-/Gärresttransport' : SERVICE_NAMES[service]);

/** benötigte Maschine für einen Dienst */
function machineFor(service: Service, liquid: boolean): MachineType[] {
  if (service === 'transport') return liquid ? ['guellefass', 'zubringer'] : ['lkw'];
  return [SERVICE_IMPLEMENT[service]];
}

export function OutlookWindow({ status, game }: { status: GameStatus; game: GameController | null }) {
  const b = status.business;
  const c = status.company;
  const [scope, setScope] = useState<'kunden' | 'region'>('kunden');
  const day = b ? Math.floor(b.time / 1440) : 0;
  const knownKey = b?.knownFarms.length ?? 0;
  const flagsKey = `${b?.farmFlags.closed.length ?? 0}/${b?.farmFlags.organic.length ?? 0}`;
  const data = useMemo(() => {
    if (!b || !game) return null;
    const closed = new Set(b.farmFlags.closed);
    const organicIds = new Set(b.farmFlags.organic);
    const farms: FarmSummary[] = (scope === 'kunden' ? b.knownFarms.map((id) => game.farmById(id)).filter((f): f is FarmSummary => !!f) : game.farmList())
      .filter((f) => !closed.has(f.id));
    const months: string[] = [];
    const rows = new Map<string, Row>();
    const cropMonth = new Map<number, Map<string, Set<Service>>>();
    const t0 = day * 1440 + 6 * 60; // Mittag des Tages (Minute 0 = 06:00)
    for (let d = 0; d < HORIZON_DAYS; d++) {
      const t = t0 + d * 1440;
      const gd = gameDate(t);
      const mk = `${gd.year}-${gd.month}`;
      if (months[months.length - 1] !== mk) months.push(mk);
      const season = seasonServices(t);
      for (const x of season) {
        const key = `${x.service}${x.liquid ? ':liquid' : ''}`;
        let row = rows.get(key);
        if (!row) { row = { key, service: x.service, liquid: !!x.liquid, cells: new Map() }; rows.set(key, row); }
        let cell = row.cells.get(mk);
        if (!cell) { cell = { weightDays: 0, days: 0, crops: new Set(), expected: 0, ha: 0 }; row.cells.set(mk, cell); }
        cell.weightDays += x.weight;
        cell.days++;
        for (const cr of x.crops) {
          cell.crops.add(cr);
          let cm = cropMonth.get(cr);
          if (!cm) { cm = new Map(); cropMonth.set(cr, cm); }
          let set = cm.get(mk);
          if (!set) { set = new Set(); cm.set(mk, set); }
          if (!x.liquid) set.add(x.service);
        }
      }
      // erwartete Anfragen: je Betrieb Chance je Tag × Anteil des Dienstes nach Gewicht (wie im Spiel)
      for (const f of farms) {
        const bga = hasBga(f);
        const organic = organicIds.has(f.id) || isOrganic({ id: f.id, livestock: f.livestock });
        const offered = season.filter((x) => (x.service !== 'guelle' || f.livestock || bga) && (!x.liquid || bga)
          && (organic ? x.service !== 'pflanzenschutz' : x.service !== 'striegeln' && x.service !== 'hacken'));
        if (!offered.length) continue;
        const total = offered.reduce((a, x) => a + x.weight, 0);
        const chance = 0.06 + 0.1 * (1 - f.mechanization);
        for (const x of offered) {
          if (!x.crops.some((cr) => (f.cropHa[cr] ?? 0) > 0)) continue;
          const key = `${x.service}${x.liquid ? ':liquid' : ''}`;
          rows.get(key)!.cells.get(mk)!.expected += chance * Math.min(1, x.weight) * (x.weight / total);
        }
      }
    }
    // Fläche der betroffenen Kulturen je Zelle
    for (const row of rows.values()) {
      for (const cell of row.cells.values()) {
        let ha = 0;
        for (const f of farms) {
          if (row.service === 'guelle' && !f.livestock && !hasBga(f)) continue;
          for (const cr of cell.crops) ha += f.cropHa[cr] ?? 0;
        }
        cell.ha = ha;
      }
    }
    const list = [...rows.values()].sort((x, y) => {
      const sx = [...x.cells.values()].reduce((a, v) => a + v.expected, 0);
      const sy = [...y.cells.values()].reduce((a, v) => a + v.expected, 0);
      return sy - sx;
    });
    return { months, rows: list, cropMonth, farms: farms.length };
  // nur neu rechnen bei neuem Tag, neuen Kunden oder Strukturwandel (nicht bei jeder Statusmeldung)
  }, [game, scope, day, knownKey, flagsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!b || !c || !data) return <p className="hint">–</p>;
  const have = new Set(c.machines.map((m) => m.type));
  const ordered = new Set(b.deliveries.map((d) => d.machine.type));
  const maxExp = Math.max(0.5, ...data.rows.flatMap((r) => [...r.cells.values()].map((x) => x.expected)));
  const monthLabel = (mk: string) => MONTHS[Number(mk.split('-')[1]) - 1];
  const fmt = (v: number) => (v >= 10 ? Math.round(v).toLocaleString('de-DE') : v.toLocaleString('de-DE', { maximumFractionDigits: 1 }));

  return (
    <div className="outlook" data-testid="outlook">
      <div className="outlook-head">
        <p className="hint">
          Was die Kunden in den nächsten sechs Monaten wahrscheinlich anfragen – abgeleitet aus dem Jahreslauf der Kulturen
          (Bestellung, Düngung, Pflege, Ernte) und den Flächen der Betriebe. Zahl = erwartete Anfragen im Monat, Farbe = Stärke.
          Ein guter Ruf und Stammkunden bringen mehr, Preiskämpfe weniger.
        </p>
        <div className="segmented outlook-scope">
          <button className={scope === 'kunden' ? 'active' : ''} onClick={() => setScope('kunden')} data-testid="outlook-kunden">Adressbuch ({b.knownFarms.length} Betriebe)</button>
          <button className={scope === 'region' ? 'active' : ''} onClick={() => setScope('region')} data-testid="outlook-region" title="Potenzial, wenn alle Betriebe der Region Kunden wären">ganze Region (Potenzial)</button>
        </div>
      </div>
      {scope === 'kunden' && !b.knownFarms.length && <p className="market-note">Noch keine Kunden im Adressbuch – Höfe besuchen, dann füllt sich der Ausblick. Mit „ganze Region“ siehst du das Potenzial.</p>}
      <div className="tbl-wrap">
        <table className="outlook-tbl" data-testid="outlook-table">
          <thead>
            <tr>
              <th>Dienst</th>
              {data.months.map((m) => <th key={m}>{monthLabel(m)}</th>)}
              <th>Dein Fuhrpark</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const need = machineFor(r.service, r.liquid);
              const ok = need.some((t) => have.has(t));
              const soon = !ok && need.some((t) => ordered.has(t));
              return (
                <tr key={r.key}>
                  <th>{rowName(r.service, r.liquid)}</th>
                  {data.months.map((m) => {
                    const cell = r.cells.get(m);
                    if (!cell || cell.expected < 0.05) return <td key={m} className="ol-empty">{cell ? '·' : ''}</td>;
                    const level = Math.min(1, cell.expected / maxExp);
                    const crops = [...cell.crops].map((x) => CROP_NAMES[x]).join(', ');
                    return (
                      <td key={m} style={{ background: `rgba(54, 124, 43, ${0.1 + level * 0.65})`, color: level > 0.55 ? '#fff' : undefined }}
                        title={`${rowName(r.service, r.liquid)} im ${monthLabel(m)}: etwa ${fmt(cell.expected)} Anfragen · ${crops} · ${Math.round(cell.ha).toLocaleString('de-DE')} ha bei ${data.farms} Betrieben · an ${cell.days} Tagen`}>
                        {fmt(cell.expected)}
                      </td>
                    );
                  })}
                  <td className={ok ? 'pos' : soon ? '' : 'neg'}>{ok ? '✓ vorhanden' : soon ? 'bestellt' : `fehlt: ${need.map((t) => TYPE_NAMES[t] ?? t).join(' oder ')}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2>Was auf den Feldern ansteht</h2>
      <div className="tbl-wrap">
        <table className="outlook-tbl crops" data-testid="outlook-crops">
          <thead>
            <tr><th>Kultur</th>{data.months.map((m) => <th key={m}>{monthLabel(m)}</th>)}</tr>
          </thead>
          <tbody>
            {CROPS_SHOWN.map((cr) => {
              const cm = data.cropMonth.get(cr);
              return (
                <tr key={cr}>
                  <th>{CROP_NAMES[cr]}</th>
                  {data.months.map((m) => {
                    const sv = [...(cm?.get(m) ?? [])];
                    return <td key={m}>{sv.length ? sv.map((x) => SERVICE_NAMES[x]).join(', ') : <span className="hint">Wachstum</span>}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">Tipp: Geräte für die Hauptzeiten rechtzeitig bestellen – neue Maschinen haben Lieferzeiten von 4 bis 14 Wochen. Absagen für Dienste ohne Gerät am Hof bleiben ohne Folgen.</p>
    </div>
  );
}
