import { describe, expect, it } from 'vitest';
import { parseRoadGraph, RoadClass } from '../../src/sim/roadgraph';
import { parseFields } from '../../src/sim/fields';
import { Simulation, SNAPSHOT_STRIDE, VehicleState } from '../../src/sim/engine';
import { gameDate } from '../../src/sim/economy';
import { buildRoadGraphBuffer } from './helpers/grid';
import { buildFieldsBuffer } from './helpers/fields';

/** 8×8 km Gitter mit Ortsstraßen und 200 Feldern (Mais, Rüben, Kartoffeln kommen vor) */
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
    polys.push([[x, y], [x + 350, y], [x + 350, y + 300], [x, y + 300]]); // 10,5 ha
    access.push(Math.round((y + 4000) / 1000) * n + Math.round((x + 4000) / 1000));
  }
  const g = parseRoadGraph(buildRoadGraphBuffer(nodes, edges));
  const f = parseFields(buildFieldsBuffer(polys, access));
  return new Simulation(g, { seed, vehicleCount: 0, fields: f });
}

const runUntil = (s: Simulation, cond: () => boolean, max = 5000) => {
  for (let i = 0; i < max && !cond(); i++) s.step();
};

describe('Spielkalender', () => {
  it('rechnet Minuten in Datum um', () => {
    expect(gameDate(0)).toEqual({ year: 2027, month: 3, day: 1, hour: 6, minute: 0 });
    expect(gameDate(1440 * 31)).toMatchObject({ month: 4, day: 1 });
    expect(gameDate(1440 * 306)).toMatchObject({ year: 2028, month: 1, day: 1 });
  });
});

describe('Besuch, Anfrage, Auftrag', () => {
  it('Besuch mit dem Firmenwagen bringt den Betrieb ins Adressbuch', () => {
    const s = world();
    const farm = s.farms!.farms.find((f) => f.homeNode !== s.homeNode)!;
    expect(s.command({ kind: 'visit', farmId: farm.id })).toMatch(/Fahrt zu/);
    expect(s.chefBusy).toMatch(/Besuch/);
    // zweiter Befehl während der Fahrt: wird eingeplant, hier gleich wieder gestrichen
    expect(s.command({ kind: 'visit', farmId: farm.id })).toMatch(/^Eingeplant für Chef als Nr\. 1: Besuch/);
    expect(s.command({ kind: 'dequeue', queueId: s.queue[0].id })).toMatch(/Aus dem Plan/);
    expect(s.queue.length).toBe(0);
    runUntil(s, () => farm.known);
    expect(farm.known).toBe(true);
    const ev = s.business.drainEvents();
    expect(ev.some((e) => e.farmId === farm.id)).toBe(true);
    runUntil(s, () => !s.chefBusy);
    expect(s.chefBusy).toBeNull();
    expect(s.playerUnits().every((u) => u.status === 'am Hof')).toBe(true);
  });

  it('Anfrage annehmen, Grubber kaufen, Auftrag fahren', () => {
    const s = world(5);
    // Betriebe besuchen, bis eine Anfrage kommt
    let req = undefined;
    for (const farm of s.farms!.farms) {
      s.command({ kind: 'visit', farmId: farm.id });
      runUntil(s, () => !s.chefBusy);
      req = s.business.requests.find((r) => r.status === 'offen');
      if (req) break;
    }
    expect(req).toBeDefined();
    expect(req!.priceHa).toBeGreaterThan(45);
    expect(req!.priceHa).toBeLessThan(65);
    expect(s.command({ kind: 'respond', requestId: req!.id, action: 'accept' })).toBe('Auftrag angelegt');
    const order = s.business.orders[0];
    // ohne Grubber geht es nicht
    expect(s.command({ kind: 'startJob', orderId: order.id, tractorId: 1, implementId: 2 })).toMatch(/Grubber/);
    const cashBefore = s.company.cash; // Besuchsfahrten haben schon Diesel gekostet
    expect(cashBefore).toBeLessThan(100_000);
    expect(s.command({ kind: 'buy', offerId: 1 })).toBe('gekauft');
    expect(s.company.cash).toBeCloseTo(cashBefore - 12_500, 2);
    const grubber = s.company.machines.find((m) => m.type === 'grubber')!;
    const hoursBefore = s.company.machines[0].hours;
    expect(s.command({ kind: 'startJob', orderId: order.id, tractorId: 1, implementId: grubber.id })).toMatch(/^Auftrag gestartet/);
    expect(order.status).toBe('läuft');
    let sawWork = false;
    const start = s.time;
    runUntil(s, () => {
      const snap = s.snapshot();
      for (let k = 0; k < snap.length; k += SNAPSHOT_STRIDE) if (snap[k + 2] === VehicleState.Working && order.fields.includes(snap[k + 3])) sawWork = true;
      return order.status === 'fertig';
    }, 20000);
    expect(order.status).toBe('fertig');
    expect(sawWork).toBe(true);
    // Arbeitszeit mindestens Fläche / Flächenleistung (1,7 ha/h) plus Rüstzeiten
    expect(s.time - start).toBeGreaterThanOrEqual((order.areaHa / 1.7) * 60 + 15 + 5 * order.fields.length - 1);
    // Betriebsstunden: Feldarbeit plus Straßenfahrt
    expect(s.company.machines[0].hours).toBeGreaterThan(hoursBefore + order.areaHa / 1.7 - 0.2);
    // Diesel: 9 l/ha bei der Arbeit plus Anfahrt
    expect(order.dieselL).toBeGreaterThan(order.areaHa * 9 - 1);
    // Dieselpreis schwankt (netto um 1,58 €/l)
    expect(order.dieselCost / order.dieselL).toBeGreaterThan(1.4);
    expect(order.dieselCost / order.dieselL).toBeLessThan(1.8);
    runUntil(s, () => !s.chefBusy, 5000);
    expect(s.chefBusy).toBeNull();
  });

  it('Gegenangebot: zu teuer wird abgelehnt, günstiger angenommen', () => {
    const s = world(8);
    const reqs = () => s.business.requests.filter((r) => r.status === 'offen');
    for (const farm of s.farms!.farms) {
      if (reqs().length >= 2) break;
      s.command({ kind: 'visit', farmId: farm.id });
      runUntil(s, () => !s.chefBusy);
    }
    const [a, b] = reqs();
    expect(s.command({ kind: 'respond', requestId: a.id, action: 'counter', priceHa: a.priceHa * 1.5 })).toBe('Kunde lehnt ab');
    expect(a.status).toBe('abgelehnt');
    expect(s.command({ kind: 'respond', requestId: b.id, action: 'counter', priceHa: b.priceHa - 2 })).toBe('Auftrag angelegt');
    expect(s.business.orders.at(-1)!.priceHa).toBe(b.priceHa - 2);
  });

  it('unbeantwortete Anfragen verfallen nach zwei Tagen', () => {
    const s = world(5);
    for (const farm of s.farms!.farms) {
      s.command({ kind: 'visit', farmId: farm.id });
      runUntil(s, () => !s.chefBusy);
      if (s.business.requests.length) break;
    }
    const r = s.business.requests[0];
    const sat = s.farms!.farms[r.farmId].satisfaction;
    s.run(3 * 1440);
    expect(r.status).toBe('abgelaufen');
    expect(s.farms!.farms[r.farmId].satisfaction).toBeLessThan(sat);
  });

  it('bekannte Betriebe melden sich per Anruf oder Nachricht', () => {
    const s = world(11);
    for (const farm of s.farms!.farms.slice(0, 15)) {
      s.command({ kind: 'visit', farmId: farm.id });
      runUntil(s, () => !s.chefBusy);
    }
    for (const r of s.business.requests) if (r.status === 'offen') s.command({ kind: 'respond', requestId: r.id, action: 'reject' });
    s.run(20 * 1440);
    expect(s.business.requests.some((r) => r.channel === 'anruf' || r.channel === 'nachricht')).toBe(true);
  });

  it('bleibt mit Spielerbefehlen deterministisch', () => {
    const play = () => {
      const s = world(4);
      for (const farm of s.farms!.farms.slice(0, 5)) {
        s.command({ kind: 'visit', farmId: farm.id });
        runUntil(s, () => !s.chefBusy);
      }
      s.run(2000);
      return s.hash();
    };
    expect(play()).toBe(play());
  });
});

describe('Rückruf, Rüstzeit, Arbeitszeit', () => {
  const setupJob = (seed: number) => {
    const s = world(seed);
    for (const farm of s.farms!.farms) {
      s.command({ kind: 'visit', farmId: farm.id });
      runUntil(s, () => !s.chefBusy);
      if (s.business.requests.some((r) => r.status === 'offen')) break;
    }
    const req = s.business.requests.find((r) => r.status === 'offen')!;
    s.command({ kind: 'respond', requestId: req.id, action: 'accept' });
    s.command({ kind: 'buy', offerId: 1 });
    const order = s.business.orders[0];
    const grubber = s.company.machines.find((m) => m.type === 'grubber')!;
    return { s, order, grubber };
  };

  it('beginnt mit Rüstzeit am Hof', () => {
    const { s, order, grubber } = setupJob(5);
    s.command({ kind: 'startJob', orderId: order.id, tractorId: 1, implementId: grubber.id });
    expect(s.playerUnits()[0].status).toMatch(/Rüstzeit/);
    s.run(14);
    expect(s.playerUnits()[0].status).toMatch(/Rüstzeit/);
    s.run(2);
    expect(s.playerUnits()[0].status).toMatch(/fährt zum Feld/);
  });

  it('zurückgerufener Schlepper fährt heim, Auftrag bleibt mit erledigten Feldern offen', () => {
    const { s, order, grubber } = setupJob(5);
    s.command({ kind: 'startJob', orderId: order.id, tractorId: 1, implementId: grubber.id });
    runUntil(s, () => /grubbert/.test(s.playerUnits()[0].status), 3000);
    s.run(30);
    const tractor = s.playerUnits()[0].vehicle;
    expect(s.command({ kind: 'recall', vehicle: tractor })).toMatch(/zurück zum Hof/);
    expect(order.status).toBe('offen');
    runUntil(s, () => !s.chefBusy, 3000);
    expect(s.playerUnits()[0].status).toBe('am Hof');
    // neu starten: nur die offenen Felder
    expect(s.command({ kind: 'startJob', orderId: order.id, tractorId: 1, implementId: grubber.id })).toMatch(/^Auftrag gestartet/);
    runUntil(s, () => order.status === 'fertig', 20000);
    expect(order.status).toBe('fertig');
    expect(new Set(order.doneFields).size).toBe(order.fields.length);
  });

  it('macht nach 10 Stunden Arbeit des Chefs Feierabend bis 06:00', () => {
    const { s, order, grubber } = setupJob(5);
    s.driverMinutes[1] = 590; // Tag ist fast voll
    s.command({ kind: 'startJob', orderId: order.id, tractorId: 1, implementId: grubber.id });
    s.run(40);
    expect(s.playerUnits()[0].status).toMatch(/Feierabend/);
    const pos = s.position(s.playerUnits()[0].vehicle);
    s.run(60);
    expect(s.position(s.playerUnits()[0].vehicle)).toEqual(pos); // steht
    s.run(1440 - (s.time % 1440) + 5);
    expect(s.playerUnits()[0].status).not.toMatch(/Feierabend/);
  });

  it('Testfahrzeuge lassen sich nicht zurückrufen', () => {
    const g = world(1);
    expect(g.command({ kind: 'recall', vehicle: 999 })).toMatch(/Nur eigene/);
  });
});

describe('Rechnung, Zahlung, Buchungen', () => {
  it('stellt nach dem Auftrag eine Rechnung, der Kunde zahlt, alles wird gebucht', () => {
    const s = world(5);
    for (const farm of s.farms!.farms) {
      s.command({ kind: 'visit', farmId: farm.id });
      runUntil(s, () => !s.chefBusy);
      if (s.business.requests.some((r) => r.status === 'offen')) break;
    }
    const req = s.business.requests.find((r) => r.status === 'offen')!;
    s.command({ kind: 'respond', requestId: req.id, action: 'accept' });
    s.command({ kind: 'buy', offerId: 1 });
    const order = s.business.orders[0];
    const grubber = s.company.machines.find((m) => m.type === 'grubber')!;
    s.command({ kind: 'startJob', orderId: order.id, tractorId: 1, implementId: grubber.id });
    runUntil(s, () => order.status === 'fertig', 20000);
    const inv = s.business.invoices.find((i) => i.orderId === order.id)!;
    expect(inv).toBeDefined();
    expect(inv.amount).toBeCloseTo(order.priceHa * order.areaHa, 2);
    expect(inv.number).toMatch(/^RE-2027-0001$/);
    expect(inv.dueAt - inv.issuedAt).toBe(30 * 1440);
    const cash = s.company.cash;
    runUntil(s, () => inv.status !== 'offen', 32 * 1440);
    if (inv.status === 'überfällig') expect(s.command({ kind: 'remind', invoiceId: inv.id })).toBe('Kunde angerufen');
    runUntil(s, () => inv.status === 'bezahlt', 12 * 1440);
    expect(inv.status).toBe('bezahlt');
    // Zahlungseingang gebucht (Kontostand ändert sich zusätzlich durch Diesel, Versicherung …)
    expect(s.business.ledger.some((l) => l.category === 'Rechnung' && l.amount === inv.amount)).toBe(true);
    expect(cash).toBeGreaterThan(0);
    const cats = new Set(s.business.ledger.map((l) => l.category));
    expect(cats.has('Maschinenkauf')).toBe(true);
    expect(cats.has('Diesel')).toBe(true);
    expect(cats.has('Rechnung')).toBe(true);
    // Auswertung: Erlös − Diesel − Maschinen
    const r = s.business.orderResult(order);
    expect(r.revenue).toBeCloseTo(inv.amount, 2);
    expect(r.margin).toBeCloseTo(r.revenue - r.diesel - r.machines, 2);
    expect(r.margin).toBeGreaterThan(0);
  });
});

/** Auftrag fertig fahren und die Rechnung zurückgeben */
function finishedInvoice(seed: number) {
  const s = world(seed);
  for (const farm of s.farms!.farms) {
    s.command({ kind: 'visit', farmId: farm.id });
    runUntil(s, () => !s.chefBusy);
    if (s.business.requests.some((r) => r.status === 'offen')) break;
  }
  const req = s.business.requests.find((r) => r.status === 'offen')!;
  s.command({ kind: 'respond', requestId: req.id, action: 'accept' });
  s.command({ kind: 'buy', offerId: 1 });
  const order = s.business.orders[0];
  const grubber = s.company.machines.find((m) => m.type === 'grubber')!;
  s.command({ kind: 'startJob', orderId: order.id, tractorId: 1, implementId: grubber.id });
  runUntil(s, () => order.status === 'fertig', 20000);
  const inv = s.business.invoices[0];
  return { s, inv };
}

describe('Warteschlange des Chefs', () => {
  it('plant Besuche, während der Chef grubbert, und arbeitet sie danach der Reihe nach ab', () => {
    const { s } = (() => {
      const s = world(5);
      for (const farm of s.farms!.farms) {
        s.command({ kind: 'visit', farmId: farm.id });
        runUntil(s, () => !s.chefBusy);
        if (s.business.requests.some((r) => r.status === 'offen')) break;
      }
      return { s };
    })();
    const req = s.business.requests.find((r) => r.status === 'offen')!;
    s.command({ kind: 'respond', requestId: req.id, action: 'accept' });
    s.command({ kind: 'buy', offerId: 1 });
    const order = s.business.orders[0];
    const grubber = s.company.machines.find((m) => m.type === 'grubber')!;
    runUntil(s, () => s.time % 1440 > 30 && s.time % 1440 < 120, 1440); // morgens starten
    expect(s.command({ kind: 'startJob', orderId: order.id, tractorId: 1, implementId: grubber.id })).toMatch(/^Auftrag gestartet/);
    const others = s.farms!.farms.filter((f) => f.id !== order.farmId && f.homeNode !== s.homeNode);
    const [f1, f2, f3] = others;
    expect(s.command({ kind: 'visit', farmId: f1.id })).toMatch(/^Eingeplant für Chef als Nr\. 1/);
    expect(s.command({ kind: 'visit', farmId: f2.id })).toMatch(/^Eingeplant für Chef als Nr\. 2/);
    expect(s.command({ kind: 'visit', farmId: f1.id })).toBe('Besuch ist schon eingeplant');
    expect(s.command({ kind: 'visit', farmId: f3.id })).toMatch(/^Eingeplant für Chef als Nr\. 3/);
    // Reihenfolge ändern: f3 nach vorn
    s.command({ kind: 'queueMove', queueId: s.queue[2].id, dir: -1 });
    s.command({ kind: 'queueMove', queueId: s.queue[1].id, dir: -1 });
    expect(s.queue.map((q) => (q.cmd as { farmId: number }).farmId)).toEqual([f3.id, f1.id, f2.id]);
    expect(s.queue.length).toBe(3);
    // erst nach dem Auftrag geht es los
    const order1 = order;
    const visited: number[] = [];
    runUntil(s, () => {
      for (const f of [f1, f2, f3]) if (f.known && !visited.includes(f.id)) visited.push(f.id);
      return visited.length === 3;
    }, 6 * 1440);
    expect(order1.status).toBe('fertig');
    expect(visited).toEqual([f3.id, f1.id, f2.id]);
    expect(s.queue.length).toBe(0);
  });

  it('übersteht Speichern und Laden', () => {
    const a = world(6);
    const fs = a.farms!.farms.filter((f) => f.homeNode !== a.homeNode);
    a.command({ kind: 'visit', farmId: fs[0].id });
    a.command({ kind: 'visit', farmId: fs[1].id });
    a.run(5);
    const b = world(6);
    b.restore(JSON.parse(JSON.stringify(a.serialize())));
    expect(b.queue.length).toBe(1);
    expect(b.hash()).toBe(a.hash());
    a.run(400);
    b.run(400);
    expect(b.hash()).toBe(a.hash());
    expect(b.farms!.farms[fs[1].id].known).toBe(a.farms!.farms[fs[1].id].known);
  });
});

describe('Kundenbindung', () => {
  it('unzufriedener Kunde wechselt zur Konkurrenz und kommt später mit kleinen Aufträgen zurück', () => {
    const s = world(5);
    // ein bekannter Betrieb mit Ackerflächen
    const farm = s.farms!.farms.find((f) => f.fields.length >= 3)!;
    farm.known = true;
    farm.satisfaction = 22;
    const b = s.business as unknown as { satisfy(id: number, d: number, t: number): void };
    b.satisfy(farm.id, -5, s.time); // z. B. Anfrage nicht beantwortet
    expect(s.business.isRival(farm.id, s.time)).toBe(true);
    expect(s.business.drainEvents().some((e) => e.kind === 'warnung' && e.text.includes('anderen Lohnunternehmen'))).toBe(true);
    // in der Zeit bei der Konkurrenz: keine Anfragen
    const until = farm.rivalUntil;
    expect(until - s.time).toBeGreaterThanOrEqual(60 * 1440);
    runUntil(s, () => s.time >= until - 1440, 130 * 1440);
    expect(s.business.requests.filter((r) => r.farmId === farm.id).length).toBe(0);
    // danach Probephase: nur ein Feld, höchstens 10 ha
    runUntil(s, () => s.time > until + 1440, 3 * 1440);
    expect(s.business.isRival(farm.id, s.time)).toBe(false);
    expect(s.business.isTrial(farm.id, s.time)).toBe(true);
    expect(farm.satisfaction).toBe(25);
    for (let k = 0; k < 200; k++) {
      runUntil(s, () => s.business.requests.some((r) => r.farmId === farm.id), 1440);
      if (s.business.requests.some((r) => r.farmId === farm.id)) break;
    }
    const req = s.business.requests.find((r) => r.farmId === farm.id);
    if (req) {
      expect(req.fields.length).toBe(1);
      expect(req.areaHa).toBeLessThanOrEqual(10);
    }
    // Vertrauen zurück ab 40 %
    farm.satisfaction = 40;
    expect(s.business.isTrial(farm.id, s.time)).toBe(false);
  });

  it('Ablehnen kostet weniger Zufriedenheit als Nichtantworten', () => {
    const s = world(5);
    for (const farm of s.farms!.farms) {
      s.command({ kind: 'visit', farmId: farm.id });
      runUntil(s, () => !s.chefBusy);
      if (s.business.requests.some((r) => r.status === 'offen')) break;
    }
    const req = s.business.requests.find((r) => r.status === 'offen')!;
    const farm = s.farms!.farms[req.farmId];
    const sat = farm.satisfaction;
    s.command({ kind: 'respond', requestId: req.id, action: 'reject' });
    expect(farm.satisfaction).toBe(sat - 2);
  });
});

describe('Zeitschätzung', () => {
  it('schätzt Dauer und Fertigtermin für offene Anfragen', () => {
    const s = world(5);
    for (const farm of s.farms!.farms) {
      s.command({ kind: 'visit', farmId: farm.id });
      runUntil(s, () => !s.chefBusy);
      if (s.business.requests.some((r) => r.status === 'offen')) break;
    }
    const req = s.business.requests.find((r) => r.status === 'offen')!;
    const e = s.planEstimates()[req.id];
    expect(e).toBeDefined();
    // Feldarbeit nach Flächenleistung des Grubbers aus dem Markt (1,7 ha/h)
    expect(e.workMinutes).toBeCloseTo((req.areaHa / 1.7) * 60, -1);
    expect(e.minutes).toBeGreaterThan(e.workMinutes + 25);
    expect(e.finishAt).toBeGreaterThan(s.time);
    // Schätzung gegen die echte Fahrt prüfen
    s.command({ kind: 'respond', requestId: req.id, action: 'accept' });
    s.command({ kind: 'buy', offerId: 1 });
    const order = s.business.orders[0];
    const est = s.planEstimates()[order.id].minutes;
    const grubber = s.company.machines.find((m) => m.type === 'grubber')!;
    runUntil(s, () => s.time % 1440 > 10 && s.time % 1440 < 60, 1440);
    s.command({ kind: 'startJob', orderId: order.id, tractorId: 1, implementId: grubber.id });
    // tatsächliche Arbeitszeit des Chefs über alle Tage
    let worked = 0;
    let prev = s.chefMinutes;
    runUntil(s, () => {
      worked += s.chefMinutes >= prev ? s.chefMinutes - prev : s.chefMinutes;
      prev = s.chefMinutes;
      return !s.chefBusy;
    }, 5 * 1440);
    expect(order.status).toBe('fertig');
    expect(Math.abs(worked - est) / est).toBeLessThan(0.25);
  });

  it('schätzt größere Aufträge länger', () => {
    const s = world(5);
    const f = s.farms!.farms.find((x) => x.fields.length >= 3)!;
    const one = s.estimateJobMinutes(f.fields.slice(0, 1));
    const three = s.estimateJobMinutes(f.fields.slice(0, 3));
    expect(three.minutes).toBeGreaterThan(one.minutes);
    expect(three.workMinutes).toBeGreaterThan(one.workMinutes);
  });
});

describe('Zahlungsmoral', () => {
  it('zahlt innerhalb von 30 Tagen an einem beliebigen Tag oder wird überfällig', () => {
    const days = new Set<number>();
    let late = 0;
    for (const seed of [5, 7, 11, 13, 17, 19]) {
      const { s, inv } = finishedInvoice(seed);
      runUntil(s, () => inv.status !== 'offen', 32 * 1440);
      if (inv.status === 'bezahlt') {
        expect(inv.paidAt!).toBeLessThanOrEqual(inv.dueAt + 1440);
        days.add(Math.floor((inv.paidAt! - inv.issuedAt) / 1440));
      } else {
        expect(inv.status).toBe('überfällig');
        late++;
      }
    }
    expect(days.size + late).toBeGreaterThan(1); // nicht alle am selben Tag
  });

  it('warnt bei Überfälligkeit; ohne Kontakt verfällt die Rechnung nach 14 Tagen', () => {
    const { s, inv } = finishedInvoice(5);
    inv.payAt = -1; // Kunde zahlt nicht von selbst
    const cash = s.company.cash;
    const events: string[] = [];
    runUntil(s, () => { events.push(...s.business.drainEvents().filter((e) => e.kind === 'warnung').map((e) => e.text)); return inv.status === 'überfällig'; }, 32 * 1440);
    expect(inv.status).toBe('überfällig');
    expect(events.some((t) => t.includes('Zahlung überfällig') && t.includes(inv.number))).toBe(true);
    expect(inv.contactBy! - inv.overdueAt!).toBe(14 * 1440);
    runUntil(s, () => inv.status !== 'überfällig', 15 * 1440);
    expect(inv.status).toBe('verfallen');
    expect(s.business.drainEvents().some((e) => e.text.includes('Forderung verfallen'))).toBe(true);
    expect(s.company.cash).toBeLessThanOrEqual(cash); // kein Geldeingang
    expect(s.command({ kind: 'remind', invoiceId: inv.id })).toBe('Rechnung ist nicht überfällig');
  });

  it('nach Anruf zahlt der Kunde in 1–10 Tagen, Zufriedenheit sinkt etwas', () => {
    const { s, inv } = finishedInvoice(5);
    inv.payAt = -1;
    runUntil(s, () => inv.status === 'überfällig', 32 * 1440);
    const farm = s.farms!.farms[inv.farmId];
    const sat = farm.satisfaction;
    const chef = s.chefMinutes;
    expect(s.command({ kind: 'remind', invoiceId: inv.id })).toBe('Kunde angerufen');
    expect(s.command({ kind: 'remind', invoiceId: inv.id })).toBe('Kunde wurde schon erinnert');
    expect(farm.satisfaction).toBe(sat - 3);
    expect(s.chefMinutes).toBe(chef + 10);
    const t0 = s.time;
    runUntil(s, () => inv.status === 'bezahlt', 12 * 1440);
    expect(inv.status).toBe('bezahlt');
    expect(inv.paidAt! - t0).toBeLessThanOrEqual(11 * 1440);
  });

  it('ein Besuch zählt als Kontakt', () => {
    const { s, inv } = finishedInvoice(5);
    inv.payAt = -1;
    runUntil(s, () => inv.status === 'überfällig', 32 * 1440);
    runUntil(s, () => !s.chefBusy && s.chefMinutes < 500 && s.time % 1440 > 60 && s.time % 1440 < 300, 3000);
    expect(s.command({ kind: 'visit', farmId: inv.farmId })).toMatch(/^Fahrt zu/);
    runUntil(s, () => inv.remindedAt !== undefined, 1440);
    expect(inv.remindedAt).toBeDefined();
    runUntil(s, () => inv.status === 'bezahlt', 12 * 1440);
    expect(inv.status).toBe('bezahlt');
  });
});

describe('Spielstand', () => {
  it('läuft nach Speichern und Laden bitgleich weiter', () => {
    const a = world(6);
    // etwas spielen: Besuche, Auftrag annehmen und starten
    for (const farm of a.farms!.farms.slice(0, 8)) {
      a.command({ kind: 'visit', farmId: farm.id });
      runUntil(a, () => !a.chefBusy);
    }
    const req = a.business.requests.find((r) => r.status === 'offen');
    if (req) {
      a.command({ kind: 'respond', requestId: req.id, action: 'accept' });
      a.command({ kind: 'buy', offerId: 1 });
      const g = a.company.machines.find((m) => m.type === 'grubber')!;
      a.command({ kind: 'startJob', orderId: a.business.orders[0].id, tractorId: 1, implementId: g.id });
    }
    a.run(200); // mitten in der Fahrt/Arbeit speichern
    const saved = JSON.parse(JSON.stringify(a.serialize()));
    const b = world(6);
    b.restore(saved);
    expect(b.hash()).toBe(a.hash());
    a.run(3000);
    b.run(3000);
    expect(b.hash()).toBe(a.hash());
    expect(b.company.cash).toBe(a.company.cash);
    expect(b.business.invoices.length).toBe(a.business.invoices.length);
    expect(b.farms!.farms.filter((f) => f.known).length).toBe(a.farms!.farms.filter((f) => f.known).length);
  });

  it('weist unpassende Spielstände ab', () => {
    const a = world(6);
    const s = a.serialize();
    expect(() => world(6).restore({ ...s, version: 99 })).toThrow();
  });
});
