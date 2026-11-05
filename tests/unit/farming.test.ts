import { describe, expect, it } from 'vitest';
import { parseRoadGraph, RoadClass } from '../../src/sim/roadgraph';
import { parseFields } from '../../src/sim/fields';
import { Simulation } from '../../src/sim/engine';
import { buildRoadGraphBuffer } from './helpers/grid';
import { buildFieldsBuffer } from './helpers/fields';
import { CROPS, referenceRent, rotationFactor, soilFactor } from '../../src/sim/farming';
import { gameDate } from '../../src/sim/economy';

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
const runUntil = (s: Simulation, cond: () => boolean, max = 5000) => {
  for (let i = 0; i < max && !cond(); i++) s.step();
};


/** Pachtfläche über eine Anfrage gewinnen */
function winLease(s: Simulation) {
  const b = s.business;
  for (const f of s.farms!.farms) { f.known = true; f.satisfaction = 100; }
  let offer;
  for (const f of s.farms!.farms) {
    if (b.askLand(f.id, s.time) === 'Angebot erhalten') { offer = b.leaseOffers[b.leaseOffers.length - 1]; break; }
  }
  expect(offer).toBeDefined();
  expect(s.command({ kind: 'bidLease', offerId: offer!.id, rentHa: 2000 })).toMatch(/Gebot/);
  runUntil(s, () => b.leases.length > 0, 25 * 1440);
  return b.leases[0];
}
const md = (t: number) => { const d = gameDate(t); return d.month * 100 + d.day; };

describe('Pacht und eigener Ackerbau', () => {
  it('Grundwerte: Pachtpreis, Bodenfaktor, Fruchtfolge', () => {
    expect(referenceRent(35, false)).toBe(620);
    expect(referenceRent(35, true)).toBe(760);
    expect(soilFactor(45)).toBeCloseTo(1.12);
    expect(rotationFactor('weizen', 'weizen')).toBe(0.85);
    expect(rotationFactor('raps', 'raps')).toBe(0.75);
    expect(rotationFactor('weizen', 'raps')).toBe(1);
    // Deckungsbeitrag vor Pacht bei Ackerzahl 35 durchweg positiv
    for (const c of CROPS) expect(c.yieldT * c.priceT - c.steps.reduce((s, x) => s + x.costHa, 0)).toBeGreaterThan(300);
  });

  it('Land anfragen nur bei bekannten Betrieben, einmal im Jahr', () => {
    const s = world(4);
    const f = s.farms!.farms[0];
    f.known = false;
    expect(s.command({ kind: 'askLand', farmId: f.id })).toMatch(/besuchen/);
    f.known = true;
    s.command({ kind: 'askLand', farmId: f.id });
    expect(s.command({ kind: 'askLand', farmId: f.id })).toMatch(/Schon/);
  });

  it('Zuschlag bei höherem Gebot: Felder gehören dann zum eigenen Betrieb', () => {
    const s = world(4);
    const l = winLease(s);
    expect(l.rentHa).toBe(2000);
    for (const fi of l.fields) {
      expect(s.farms!.fieldFarm[fi]).toBe(-2);
      expect(s.farms!.farms[l.farmId].fields).not.toContain(fi);
    }
  });

  it('niedriges Gebot verliert', () => {
    const s = world(4);
    const b = s.business;
    for (const f of s.farms!.farms) { f.known = true; f.satisfaction = 100; }
    for (const f of s.farms!.farms) if (b.askLand(f.id, s.time) === 'Angebot erhalten') break;
    const o = b.leaseOffers[0];
    s.command({ kind: 'bidLease', offerId: o.id, rentHa: 100 });
    s.run(22 * 1440);
    expect(b.leases.length).toBe(0);
    expect(b.leaseOffers.find((x) => x.id === o.id)).toBeUndefined();
  });

  it('Terminplan: Mais im Frühjahr ohne Stoppel, Weizen mit Stoppel im August', () => {
    const s = world(4);
    const l = winLease(s);
    s.command({ kind: 'setCrop', leaseId: l.id, crop: 'mais' });
    expect(l.steps.map((x) => x.status)).toEqual(['entfällt', 'geplant', 'geplant', 'geplant', 'geplant']);
    expect(md(l.steps[1].from)).toBe(315);
    expect(gameDate(l.steps[4].from).year).toBe(gameDate(s.time).year);
    s.command({ kind: 'setCrop', leaseId: l.id, crop: 'weizen' });
    expect(l.steps[0].status).toBe('geplant');
    expect(md(l.steps[0].from)).toBe(801);
    expect(md(l.steps[2].from)).toBe(925);
    expect(l.steps[3].from).toBeGreaterThan(l.steps[2].from);
  });

  it('Eigenauftrag, Fremdleistung, Ernte und Pacht am 1. Oktober', () => {
    const s = world(4);
    const b = s.business;
    s.company.cash = 1_000_000;
    const l = winLease(s);
    s.command({ kind: 'setCrop', leaseId: l.id, crop: 'rueben' });
    // Grubbern als Eigenauftrag ohne Rechnung
    runUntil(s, () => b.orders.some((o) => o.ownLeaseId === l.id), 60 * 1440);
    const o = b.orders.find((x) => x.ownLeaseId === l.id)!;
    expect(o.farmId).toBe(-1);
    expect(o.service).toBe('grubbern');
    // Rübensaat wird eingekauft
    runUntil(s, () => b.ledger.some((x) => x.category === 'Ackerbau'), 40 * 1440);
    expect(b.ledger.find((x) => x.category === 'Ackerbau')!.amount).toBeLessThan(0);
    // ohne Grubbern verpasst: Ertrag −10 %, Ernte im Oktober mit Erlös
    runUntil(s, () => l.history.length > 0, 240 * 1440);
    expect(l.steps).toEqual([]);
    expect(l.history[0].crop).toBe('rueben');
    expect(l.history[0].tonnes).toBeGreaterThan(0);
    expect(b.ledger.some((x) => x.category === 'Ernte' && x.amount > 0)).toBe(true);
    expect(b.ledger.some((x) => x.category === 'Pacht' && x.amount === -Math.round(2000 * l.areaHa))).toBe(true);
    expect(b.invoices.some((i) => i.orderId === o.id)).toBe(false);
  });

  it('mit eigenem Mähdrescher wird der Drusch zum Eigenauftrag statt Fremdleistung', () => {
    const s = world(4);
    const b = s.business;
    s.company.cash = 1_000_000;
    const l = winLease(s);
    s.company.machines.push({ id: 900, type: 'maehdrescher', brand: 'Claas', model: 'Lexion', year: 2022, hours: 0, condition: 95, newPrice: 500000, purchasePrice: 500000, afaYears: 10, boughtAt: 0, power: 435, width: 9.3, haPerHour: 3, payloadT: 9 });
    s.command({ kind: 'setCrop', leaseId: l.id, crop: 'raps' });
    runUntil(s, () => b.orders.some((o) => o.ownLeaseId === l.id && o.service === 'drusch'), 520 * 1440);
    const o = b.orders.find((x) => x.ownLeaseId === l.id && x.service === 'drusch')!;
    expect(o.chain).toBe('haecksler');
    expect(b.ledger.some((x) => x.text.startsWith('Mähdrusch'))).toBe(false);
  });

  it('Vermarktung: Lager verkaufen, Vorkontrakt liefern, Fehlmenge kostet Ausgleich', () => {
    const s = world(4);
    const b = s.business;
    b.cropStock.weizen = 100;
    const p0 = b.cropPriceT('weizen', s.time);
    expect(p0).toBeGreaterThan(150);
    expect(s.command({ kind: 'sellCrop', crop: 'weizen', t: 40 })).toMatch(/verkauft/);
    expect(b.cropStock.weizen).toBe(60);
    expect(s.command({ kind: 'forward', crop: 'weizen', t: 50, months: 1 })).toMatch(/Vorkontrakt/);
    expect(s.command({ kind: 'forward', crop: 'raps', t: 20, months: 1 })).toMatch(/Vorkontrakt/);
    s.run(32 * 1440);
    expect(b.cropStock.weizen).toBe(10);
    expect(b.ledger.some((l) => l.text.includes('Vorkontrakt Winterweizen') && l.amount > 0)).toBe(true);
    expect(b.ledger.some((l) => l.text.includes('Vorkontrakt Winterraps') && l.amount < 0)).toBe(true);
    // Preise bewegen sich
    expect(b.cropPriceT('weizen', s.time)).not.toBe(p0);
  });

  it('Flächenkauf: Kaufangebot, Eigentum ohne Pacht, Bilanzwert', () => {
    const s = world(4);
    const b = s.business;
    s.company.cash = 2_000_000;
    for (const f of s.farms!.farms) { f.known = true; f.satisfaction = 100; }
    for (const f of s.farms!.farms) if (b.askLand(f.id, s.time) === 'Angebot erhalten') break;
    const o = b.leaseOffers[0];
    o.salePrice = 30_000 * Math.round(o.areaHa);
    const before = b.balance(s.time).assets;
    expect(s.command({ kind: 'buyLand', offerId: o.id })).toMatch(/gekauft/);
    const l = b.leases[0];
    expect(l.owned).toBe(true);
    expect(l.rentHa).toBe(0);
    expect(s.farms!.fieldFarm[l.fields[0]]).toBe(-2);
    expect(b.balance(s.time).assets).toBeCloseTo(before, -2); // Geld gegen Land getauscht
  });

  it('Spielstand mit Pachtflächen läuft bitgleich weiter', () => {
    const a = world(4);
    const l = winLease(a);
    a.command({ kind: 'setCrop', leaseId: l.id, crop: 'mais' });
    a.run(5 * 1440);
    const b = world(4);
    b.restore(JSON.parse(JSON.stringify(a.serialize())));
    expect(b.farms!.fieldFarm[l.fields[0]]).toBe(-2);
    a.run(60 * 1440);
    b.run(60 * 1440);
    expect(b.hash()).toBe(a.hash());
    expect(b.business.leases[0].steps.length).toBe(5);
  });
});
