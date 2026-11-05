import { describe, expect, it } from 'vitest';
import { parseRoadGraph, RoadClass } from '../../src/sim/roadgraph';
import { parseFields } from '../../src/sim/fields';
import { Simulation } from '../../src/sim/engine';
import { buildRoadGraphBuffer } from './helpers/grid';
import { buildFieldsBuffer } from './helpers/fields';
import { BIOGAS, KWH_PER, MAIS_CAP, dailyTarget, ration } from '../../src/sim/biogas';

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

/** Anlage bis zum Betrieb bringen (Fristen verkürzt) */
function runningPlant(s: Simulation, kw: 250 | 500 = 500) {
  const b = s.business;
  s.company.cash = 3_000_000;
  winLease(s);
  b.leases[0].areaHa = Math.max(b.leases[0].areaHa, 12);
  expect(s.command({ kind: 'buildBiogas', siteId: 1, kw, bidCt: 17 })).toMatch(/beantragt/);
  b.biogas!.permitUntil = s.time + 1440;
  runUntil(s, () => b.biogas!.status === 'ausschreibung', 3 * 1440);
  b.biogas!.tenderAt = s.time + 1440;
  runUntil(s, () => b.biogas!.status === 'bau', 3 * 1440);
  b.biogas!.readyAt = s.time + 1440;
  runUntil(s, () => b.biogas!.status === 'betrieb', 3 * 1440);
  return b.biogas!;
}

describe('Biogasanlage', () => {
  it('Ration: Maisdeckel, Gülle zuerst, ohne Substrat keine Leistung', () => {
    const target = dailyTarget(500);
    expect(ration(target, { guelle: 0, mais: 1000, gps: 0, gras: 0 }).kwh).toBe(0);
    const f = ration(target, { guelle: 1000, mais: 1000, gps: 1000, gras: 0 });
    expect(f.kwh).toBeCloseTo(target, 3);
    expect(f.mais / (f.mais + f.gps + f.guelle + f.gras)).toBeLessThanOrEqual(MAIS_CAP + 1e-9);
    // nur Gülle und Mais: Mais genau am Deckel
    const g = ration(target, { guelle: 40, mais: 1000, gps: 0, gras: 0 });
    expect(g.guelle).toBe(40);
    expect(g.mais / (g.mais + g.guelle)).toBeCloseTo(MAIS_CAP, 6);
    expect(g.kwh).toBeCloseTo(40 * KWH_PER.guelle + g.mais * KWH_PER.mais, 6);
  });

  it('Bau nur mit Pachtfläche und nicht im Gewerbegebiet', () => {
    const s = world(4);
    s.company.cash = 3_000_000;
    expect(s.command({ kind: 'buildBiogas', siteId: 1, kw: 250, bidCt: 18 })).toMatch(/10 ha/);
    s.command({ kind: 'buySite', offerKey: 'gw-uelzen' });
    const gw = s.company.sites!.find((x) => x.kind === 'gewerbe')!;
    expect(s.command({ kind: 'buildBiogas', siteId: gw.id, kw: 250, bidCt: 18 })).toMatch(/Gewerbegebiet/);
  });

  it('Genehmigung, Zuschlag, Bau, Betrieb mit Stromerlös und Gärrest', () => {
    const s = world(4);
    const b = s.business;
    const p = runningPlant(s);
    expect(p.ct).toBe(17);
    expect(b.ledger.some((l) => l.category === 'Bau' && l.amount === -BIOGAS[1].cost)).toBe(true);
    expect(s.command({ kind: 'buySubstrate', substrate: 'mais', t: 9000 })).toMatch(/Platz/);
    expect(s.command({ kind: 'buySubstrate', substrate: 'mais', t: 1000 })).toMatch(/eingelagert/);
    expect(s.command({ kind: 'buySubstrate', substrate: 'gps', t: 2000 })).toMatch(/eingelagert/);
    s.run(40 * 1440);
    expect(p.today!.kwh).toBeGreaterThan(dailyTarget(500) * 0.9);
    expect(p.gaer).toBeGreaterThan(0);
    const strom = b.ledger.filter((l) => l.category === 'Strom');
    expect(strom.length).toBeGreaterThan(0);
    expect(strom[0].amount).toBeGreaterThan(0);
    expect(b.ledger.some((l) => l.category === 'Biogas' && l.text.startsWith('Biogas: Betrieb'))).toBe(true);
    // Auswertung: Strom als Umsatz der Sparte Biogas, Betriebskosten direkt
    const a = b.analytics(s.time);
    expect(a.months.reduce((x, m) => x + m.revenue.biogas, 0)).toBeGreaterThan(0);
    expect(a.months.reduce((x, m) => x + m.direct.biogas, 0)).toBeGreaterThan(0);
    expect(a.months.length).toBe(12);
    const y = b.yearFigures(0, s.time + 1);
    expect(y.revenue).toBeGreaterThanOrEqual(strom.reduce((a, l) => a + l.amount, 0));
  });

  it('Gülle-Vertrag liefert in die Vorgrube, volles Gärrestlager drosselt', () => {
    const s = world(4);
    const b = s.business;
    const p = runningPlant(s, 250);
    const area = (f: { fields: number[] }) => f.fields.reduce((a, i) => a + s.fields!.areaHa[i], 0);
    const farm = s.farms!.farms.filter((f) => f.livestock).sort((x, y) => area(y) - area(x))[0];
    farm.known = true; farm.satisfaction = 80;
    expect(s.command({ kind: 'guelleContract', farmId: farm.id })).toMatch(/Vertrag/);
    s.command({ kind: 'buySubstrate', substrate: 'gps', t: 500 });
    s.run(3 * 1440);
    expect(p.contracts.length).toBe(1);
    expect(p.today!.guelle).toBeGreaterThan(0);
    p.gaer = BIOGAS[0].gaerM3;
    let full = false;
    for (let d = 0; d < 2; d++) { s.run(1440); full ||= b.drainEvents().some((e) => e.text.includes('Gärrestlager voll')); }
    expect(p.today!.kwh).toBeLessThan(dailyTarget(250) * 0.5);
    expect(full).toBe(true);
  });

  it('Gärrest ausbringen nur außerhalb der Sperrfrist, legt Eigenauftrag an', () => {
    const s = world(4);
    const b = s.business;
    const p = runningPlant(s);
    p.gaer = 5000;
    const l = b.leases[0];
    const msg = s.command({ kind: 'spreadGaerrest', leaseId: l.id });
    if (/Sperrfrist/.test(msg)) return; // Spielstart März: keine Sperrfrist, zur Sicherheit
    expect(msg).toMatch(/Auftrag/);
    const o = b.orders.find((x) => x.gaerrest)!;
    expect(o.service).toBe('guelle');
    expect(o.sourceNode).toBe(s.company.sites![0].node);
    expect(p.gaer).toBe(5000 - Math.round(l.areaHa * 20));
  });

  it('viehlose Kunden fragen Gärrest an: Preis je m³ niedriger als Gülle, Lager wird reserviert', () => {
    const s = world(4);
    const b = s.business;
    const p = runningPlant(s);
    p.gaer = 8000;
    for (const f of s.farms!.farms) { f.known = true; f.satisfaction = 70; f.rivalUntil = 0; }
    let req;
    for (let d = 0; d < 40 && !req; d++) { s.run(1440); p.gaer = Math.max(p.gaer, 8000); req = b.requests.find((r) => r.status === 'offen' && r.gaerrest); }
    expect(req).toBeDefined();
    expect(s.farms!.farms[req!.farmId].livestock).toBe(false);
    expect(req!.priceHa / req!.gabe!).toBeLessThan(3.5);
    const before = p.gaer;
    expect(s.command({ kind: 'respond', requestId: req!.id, action: 'accept' })).not.toMatch(/Zu wenig/);
    const o = b.orders.find((x) => x.requestId === req!.id)!;
    expect(o.gaerrest).toBe(true);
    expect(o.sourceNode).toBe(s.company.sites![0].node);
    expect(before - p.gaer).toBe(Math.round(o.areaHa * o.gabe!));
  });

  it('Güllevertrag mit Selbstabholung: Auftrag „Gülle holen“ füllt die Vorgrube', () => {
    const s = world(4);
    const b = s.business;
    const p = runningPlant(s, 250);
    const area = (f: { fields: number[] }) => f.fields.reduce((a, i) => a + s.fields!.areaHa[i], 0);
    const farm = s.farms!.farms.filter((f) => f.livestock).sort((x, y) => area(y) - area(x))[0];
    farm.known = true; farm.satisfaction = 80;
    expect(s.command({ kind: 'guelleContract', farmId: farm.id, selfHaul: true })).toMatch(/eigenem Fass/);
    s.run(2 * 1440);
    expect(p.stock.guelle).toBe(0); // keine Anfuhr durch Dritte
    expect(s.command({ kind: 'fetchSlurry', farmId: farm.id })).toMatch(/Auftrag/);
    const o = b.orders.find((x) => x.slurrySupply)!;
    s.company.machines.push({ id: 950, type: 'zubringer', brand: 'Kotte', model: 'VTR 24', year: 2022, hours: 0, condition: 95, newPrice: 78000, purchasePrice: 78000, afaYears: 10, boughtAt: 0, tankM3: 24, powerNeed: 100 });
    const tractor = s.company.machines.find((m) => m.type === 'schlepper')!;
    runUntil(s, () => s.time % 1440 > 10 && s.time % 1440 < 60, 2 * 1440);
    expect(s.command({ kind: 'startJob', orderId: o.id, tractorId: tractor.id, implementId: 950 })).toMatch(/gestartet/);
    runUntil(s, () => o.status === 'fertig', 10 * 1440);
    expect(o.status).toBe('fertig');
    expect(o.doneT).toBeCloseTo(o.tPerHa!, 0);
    expect(b.invoices.some((i) => i.orderId === o.id)).toBe(false);
  });

  it('Spielstand mit Biogasanlage läuft bitgleich weiter', () => {
    const a = world(4);
    runningPlant(a);
    a.command({ kind: 'buySubstrate', substrate: 'gras', t: 800 });
    a.run(3 * 1440);
    const b = world(4);
    b.restore(JSON.parse(JSON.stringify(a.serialize())));
    a.run(35 * 1440);
    b.run(35 * 1440);
    expect(b.hash()).toBe(a.hash());
    expect(b.business.biogas!.status).toBe('betrieb');
  });
});
