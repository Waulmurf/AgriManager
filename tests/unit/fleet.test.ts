import { describe, expect, it } from 'vitest';
import { parseRoadGraph, RoadClass } from '../../src/sim/roadgraph';
import { parseFields } from '../../src/sim/fields';
import { Simulation } from '../../src/sim/engine';
import { marketValue } from '../../src/sim/economy';
import { CATALOG, DEALERS } from '../../src/data/catalog';
import { buildRoadGraphBuffer } from './helpers/grid';
import { buildFieldsBuffer } from './helpers/fields';

function world(seed = 3) {
  const n = 9;
  const nodes: [number, number][] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) nodes.push([i * 1000 - 4000, j * 1000 - 4000]);
  const edges: { u: number; v: number; cls: number }[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * n + i;
    if (i + 1 < n) edges.push({ u: a, v: a + 1, cls: j % 2 === 0 ? RoadClass.Residential : RoadClass.Track });
    if (j + 1 < n) edges.push({ u: a, v: a + n, cls: RoadClass.Tertiary });
  }
  const polys: [number, number][][] = [];
  const access: number[] = [];
  for (let k = 0; k < 200; k++) {
    const x = -3900 + (k % 20) * 390, y = -3900 + Math.floor(k / 20) * 780;
    polys.push([[x, y], [x + 350, y], [x + 350, y + 300], [x, y + 300]]);
    access.push(Math.round((y + 4000) / 1000) * n + Math.round((x + 4000) / 1000));
  }
  return new Simulation(parseRoadGraph(buildRoadGraphBuffer(nodes, edges)), { seed, vehicleCount: 0, fields: parseFields(buildFieldsBuffer(polys, access)) });
}

describe('Katalog und Händler', () => {
  it('jede Marke im Katalog hat einen Händler, Daten sind vollständig', () => {
    for (const m of CATALOG) {
      expect(DEALERS.some((d) => d.tractorBrands.includes(m.brand) || d.implementBrands.includes(m.brand))).toBe(true);
      expect(m.newPrice).toBeGreaterThan(0);
      if (m.type === 'schlepper') expect(m.power).toBeGreaterThan(90);
      else { expect(m.width).toBeGreaterThan(0); expect(m.powerNeed).toBeGreaterThan(0); expect(m.haPerHour).toBeGreaterThan(0); }
    }
  });
});

describe('Fuhrpark', () => {
  it('Markt füllt sich mit Gebrauchten von Händlern und von privat', () => {
    const s = world(5);
    s.run(14 * 1440);
    const offers = s.business.offers.filter((o) => o.id >= 1000);
    expect(offers.some((o) => (o.dealerId ?? 0) > 0)).toBe(true);
    expect(offers.some((o) => o.dealerId === 0)).toBe(true);
    for (const o of offers) {
      const age = 2027 - o.machine.year;
      const value = marketValue(o.machine.newPrice, age, o.machine.hours);
      // Preis in sinnvoller Spanne um den Marktwert (Zustand und Händleraufschlag)
      expect(o.price).toBeGreaterThan(value * 0.6);
      expect(o.price).toBeLessThan(value * 1.4);
    }
  });

  it('Neumaschine bestellen: Lieferung nach einigen Wochen, Bezahlung bei Lieferung, erscheint als Fahrzeug', () => {
    const s = world(5);
    s.company.cash = 300_000; // Kredit kommt mit Phase 4
    const cash = s.company.cash;
    const units = s.playerUnits().length;
    expect(s.command({ kind: 'order', dealerId: 1, modelKey: 'jd-6130r' })).toMatch(/führt John Deere nicht/);
    expect(s.command({ kind: 'order', dealerId: 1, modelKey: 'fendt-314' })).toMatch(/^bestellt/);
    expect(s.company.cash).toBe(cash);
    expect(s.business.deliveries.length).toBe(1);
    const at = s.business.deliveries[0].at;
    expect(at - s.time).toBeGreaterThanOrEqual(7 * 7 * 1440);
    s.run(at - s.time + 1440);
    expect(s.business.deliveries.length).toBe(0);
    const m = s.company.machines.find((x) => x.model === '314 Vario')!;
    expect(m.condition).toBe(100);
    expect(s.company.cash).toBeLessThan(cash - 140_000);
    expect(s.playerUnits().length).toBe(units + 1);
  });

  it('Werkstattcheck deckt Mängel auf der Börse auf', () => {
    const s = world(7);
    let offer;
    for (let d = 0; d < 120 && !offer; d++) {
      s.run(1440);
      offer = s.business.offers.find((o) => o.dealerId === 0 && o.machine.defect);
    }
    expect(offer).toBeDefined();
    const cash = s.company.cash;
    expect(s.command({ kind: 'check', offerId: offer!.id })).toMatch(/Mangel gefunden/);
    expect(s.company.cash).toBeCloseTo(cash - 180, 2);
    expect(s.business.ledger.some((l) => l.category === 'Werkstatt')).toBe(true);
  });

  it('Verkauf: Inzahlungnahme sofort, privat nach einigen Tagen; Fahrzeug verschwindet', () => {
    const s = world(5);
    s.command({ kind: 'buy', offerId: 4 }); // Fendt 516
    const fendt = s.company.machines.find((m) => m.model === '516 Vario')!;
    expect(s.playerUnits().length).toBe(3);
    const value = s.business.machineValueNow(fendt, s.time);
    const cash = s.company.cash;
    expect(s.command({ kind: 'sell', machineId: fendt.id, mode: 'tradein' })).toMatch(/in Zahlung/);
    expect(s.company.cash).toBeCloseTo(cash + Math.round((value * 0.8) / 100) * 100, 0);
    expect(s.playerUnits().length).toBe(2);
    // Firmenwagen: nicht verkaufbar, solange es der einzige ist
    expect(s.command({ kind: 'sell', machineId: 2, mode: 'tradein' })).toMatch(/Besuche/);
    // privat: Startschlepper inserieren
    expect(s.command({ kind: 'sell', machineId: 1, mode: 'privat' })).toMatch(/inseriert/);
    s.run(27 * 1440);
    expect(s.company.machines.some((m) => m.id === 1)).toBe(false);
    expect(s.playerUnits().length).toBe(1);
  });

  it('Wartung: Maschine einen Tag weg, Intervall neu, Auftrag wartet', () => {
    const s = world(5);
    const m = s.company.machines[0];
    const cash = s.company.cash;
    expect(s.command({ kind: 'service', machineId: 1 })).toMatch(/Wartung beauftragt/);
    expect(m.downUntil!).toBeGreaterThan(s.time);
    expect(m.serviceAtH).toBe(m.hours + 500);
    expect(s.company.cash).toBeLessThan(cash - 1000);
    expect(s.command({ kind: 'service', machineId: 1 })).toMatch(/Schon in der Werkstatt/);
  });

  it('Pannen kommen bei schlechtem Zustand und überfälliger Wartung häufiger, Auftrag steht bis zur Reparatur', () => {
    const s = world(5);
    const good = { ...s.company.machines[0], condition: 95, serviceAtH: 99999 };
    const bad = { ...s.company.machines[0], condition: 30, serviceAtH: 0, defect: true };
    let g = 0, b = 0;
    for (let i = 0; i < 60 * 2000; i++) { if (s.business.rollBreakdown(good)) g++; if (s.business.rollBreakdown(bad)) b++; }
    expect(b).toBeGreaterThan(g * 5);
    // Panne setzt die Maschine außer Betrieb, Gewährleistung spart die Kosten
    const m = s.company.machines[0];
    m.warrantyUntil = s.time + 1440 * 30;
    const cash = s.company.cash;
    s.business.breakdown(m, s.time, s.homeLonLat, 'unterwegs');
    expect(m.downUntil!).toBeGreaterThan(s.time + 60);
    expect(m.breakdowns).toBe(1);
    expect(s.company.cash).toBe(cash);
  });

  it('Spielstand mit Lieferung, Inserat und Wartung läuft bitgleich weiter', () => {
    const a = world(6);
    a.command({ kind: 'order', dealerId: 4, modelKey: 'horsch-terrano5' });
    a.command({ kind: 'buy', offerId: 4 });
    a.command({ kind: 'service', machineId: 1 });
    a.run(3 * 1440);
    const b = world(6);
    b.restore(JSON.parse(JSON.stringify(a.serialize())));
    expect(b.hash()).toBe(a.hash());
    a.run(40 * 1440);
    b.run(40 * 1440);
    expect(b.hash()).toBe(a.hash());
    expect(b.company.machines.length).toBe(a.company.machines.length);
    expect(b.business.offers.length).toBe(a.business.offers.length);
  });
});
