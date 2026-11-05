import { expect, test, type Page } from '@playwright/test';

// Browser-Konsole (Warnungen, Fehler) in die Testausgabe übernehmen – hilft bei Engine-Unterschieden
test.beforeEach(async ({ page }, info) => {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      if (!/GPU stall|GL Driver/.test(m.text())) console.log(`[${info.project.name} ${m.type()}] ${m.text().slice(0, 400)}`);
    }
  });
  page.on('pageerror', (e) => console.log(`[${info.project.name} pageerror] ${e.message}`));
});

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    const s = await page.evaluate(() => JSON.stringify((window as any).__game?.status ?? null)).catch(() => 'n/a');
    console.log(`[${info.project.name}] Status bei Fehler: ${s}`);
  }
});

async function waitForGame(page: Page) {
  await page.waitForFunction(() => {
    const g = (window as any).__game;
    return g && g.status.phase === 'running' && g.status.tilesLoaded;
  }, null, { timeout: 60_000 });
  await page.evaluate(() => (window as any).__game.showTestVehicles(true));
}

const status = (page: Page) => page.evaluate(() => {
  const s = (window as any).__game.status;
  return { time: s.simTime, speed: s.speed, vehicles: s.vehicles, tileErrors: s.tileErrors, phase: s.phase };
});

test('Karte lädt aus der lokalen PMTiles-Datei und zeigt 30 Fahrzeuge', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await waitForGame(page);
  await expect(page.getByTestId('vehicle-count')).toHaveText('30');
  const s = await status(page);
  expect(s.tileErrors).toBe(0);
  expect(errors).toEqual([]);

  // Kartenbild ist nicht leer: ein einfarbiges Bild wäre als PNG nur wenige kB groß
  const shot = await page.getByTestId('map').screenshot();
  expect(shot.length).toBeGreaterThan(100_000);

  await page.screenshot({ path: info.outputPath('uebersicht.png') });
  await page.evaluate(() => (window as any).__game.zoomHome(13.5));
  await page.waitForFunction(() => (window as any).__game.status.tilesLoaded);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: info.outputPath('hof-nah.png') });
  await info.attach('uebersicht', { path: info.outputPath('uebersicht.png'), contentType: 'image/png' });
  await info.attach('hof-nah', { path: info.outputPath('hof-nah.png'), contentType: 'image/png' });
});

test('Pause, 1x, 10x und 100x steuern die Spielzeit', async ({ page }) => {
  // Ratenprüfung abschaltbar für CI-Rechner, deren Browser-Worker ohne GPU stark gebremst ist
  const strict = process.env.E2E_STRICT_TIMING !== '0';
  await page.goto('./');
  await waitForGame(page);
  const waitAdvance = (from: number) =>
    page.waitForFunction((t) => (window as any).__game.status.simTime > t, from, { timeout: 60_000 });

  await page.getByTestId('speed-0').click();
  await page.waitForTimeout(500); // letzte Meldung des Workers abwarten
  const t0 = (await status(page)).time;
  await page.waitForTimeout(1500);
  expect((await status(page)).time).toBe(t0);

  await page.getByTestId('speed-10').click();
  await expect(page.getByTestId('speed-10')).toHaveClass(/active/);
  await waitAdvance(t0);
  if (strict) {
    await page.waitForTimeout(1000); // Anlauf
    const t10 = (await status(page)).time;
    await page.waitForTimeout(3000);
    const dt10 = (await status(page)).time - t10;
    expect(dt10).toBeGreaterThan(15); // ~30 Minuten in 3 s
    expect(dt10).toBeLessThan(90); // grob: unter Last kommen Meldungen gebündelt an
  }

  await page.getByTestId('speed-100').click();
  await expect(page.getByTestId('speed-100')).toHaveClass(/active/);
  const t1 = (await status(page)).time;
  await waitAdvance(t1);
  if (strict) {
    const t2 = (await status(page)).time;
    await page.waitForTimeout(3000);
    const dt100 = (await status(page)).time - t2;
    expect(dt100).toBeGreaterThan(200); // ~300 Minuten in 3 s
    expect(dt100).toBeLessThan(900);
  }

  // Tastatur: Leertaste pausiert, „1“ startet mit 1x
  await page.keyboard.press('Space');
  await expect(page.getByTestId('speed-0')).toHaveClass(/active/);
  await page.keyboard.press('1');
  await expect(page.getByTestId('speed-1')).toHaveClass(/active/);
});

test('Fahrzeuge bewegen sich flüssig und bleiben im Spielgebiet', async ({ page }) => {
  await page.goto('./');
  await waitForGame(page);
  await page.getByTestId('speed-10').click();
  await page.waitForTimeout(4000);
  // Je Bild: Weg passt zur dargestellten Spielzeit (kein Springen, unabhängig von der Bildrate)
  const track = await page.evaluate(async () => {
    const g = (window as any).__game;
    const out: { t: number; p: { lon: number; lat: number }[] }[] = [];
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      out.push({ t: g.renderTime(), p: g.vehiclePositions().map((p: any) => ({ lon: p.lon, lat: p.lat })) });
    }
    return out;
  });
  const m = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) =>
    Math.hypot((b.lon - a.lon) * 67000, (b.lat - a.lat) * 111000);
  expect(track[track.length - 1].t).toBeGreaterThan(track[0].t);
  let moving = 0;
  for (let v = 0; v < 30; v++) {
    if (m(track[0].p[v], track[track.length - 1].p[v]) > 1) moving++;
    for (let i = 1; i < track.length; i++) {
      const dMin = track[i].t - track[i - 1].t; // Spielminuten zwischen zwei Bildern
      expect(dMin).toBeGreaterThanOrEqual(0);
      // höchstens 100 km/h (Pkw) = 1667 m je Spielminute (+ Rundung)
      expect(m(track[i - 1].p[v], track[i].p[v])).toBeLessThan(1667 * dMin * 1.05 + 5);
    }
    expect(Math.abs(track[track.length - 1].p[v].lat - 53.128)).toBeLessThan(0.6);
  }
  expect(moving).toBeGreaterThan(5);
});

test('Leistung: 100x mit 30 Fahrzeugen', async ({ page }, info) => {
  const minFps = Number(process.env.PERF_MIN_FPS ?? 20);
  // kleinere Fläche: CI-Rechner rendern WebGL ohne GPU
  await page.setViewportSize({ width: 1024, height: 700 });
  const minSps = Number(process.env.E2E_MIN_SPS ?? 90);
  await page.goto(`./?selftest=1&seconds=10&minFps=${minFps}&minSps=${minSps}`);
  const result = await page.waitForFunction(() => (window as any).__selftest, null, { timeout: 110_000 });
  const r = await result.jsonValue();
  await info.attach('selftest.json', { body: JSON.stringify(r, null, 2), contentType: 'application/json' });
  console.log('Selbsttest', info.project.name, JSON.stringify(r));
  expect(r.basemapFeatures).toBeGreaterThan(200);
  expect(r.vehiclesOnMap).toBeGreaterThanOrEqual(30);
  expect(r.tileErrors).toBe(0);
  expect(r.failures).toEqual([]);
});

test('Kern-Schleife: Besuch → Anfrage → Gerät kaufen → Auftrag starten', async ({ page }) => {
  await page.goto('./');
  await waitForGame(page);
  const fields = await page.evaluate(() => (window as any).__game.status.fieldCount);
  test.skip(!fields, 'keine Felddaten (Kartendaten v3 nötig)');
  await expect(page.getByTestId('farm-count')).not.toHaveText('–');
  await page.getByTestId('speed-100').click();
  const near: number[] = await page.evaluate(() => {
    const g = (window as any).__game;
    const r = g.status.region;
    return g.farmList()
      .map((f: any) => ({ id: f.id, d: Math.hypot(f.home[0] - r.center.lon, f.home[1] - r.center.lat) }))
      .sort((a: any, b: any) => a.d - b.d).slice(0, 20).map((x: any) => x.id);
  });
  for (const id of near) {
    await page.evaluate((id) => (window as any).__game.command({ kind: 'visit', farmId: id }), id);
    await page.waitForFunction(() => {
      const b = (window as any).__game.status.business;
      return b && !b.chefBusy;
    }, null, { timeout: 90_000 });
    await page.waitForTimeout(200);
    if (await page.evaluate(() => (window as any).__game.status.business.requests.some((r: any) => r.status === 'offen'))) break;
  }
  await page.getByTestId('speed-0').click();
  expect(Number(await page.getByTestId('known-count').textContent())).toBeGreaterThan(0);
  await page.getByTestId('tab-auftraege').click();
  await expect(page.getByTestId('request').first()).toBeVisible();
  await page.getByTestId('tab-markt').click();
  await page.getByTestId('buy').first().click();
  await expect(page.getByTestId('cash')).toHaveText(/87\.500/);
  await page.getByTestId('tab-auftraege').click();
  await page.getByTestId('accept').first().click();
  await expect(page.getByTestId('order').first()).toBeVisible();
  await page.getByTestId('start-job').first().click();
  await expect(page.getByTestId('order').first()).toContainText('läuft');
});

test('Personal: Bewerber einstellen, zweiten Schlepper kaufen – erscheint auf der Karte', async ({ page }) => {
  await page.goto('./?neu');
  await waitForGame(page);
  await page.getByTestId('speed-100').click();
  await page.waitForFunction(() => ((window as any).__game.status.business?.applicants.length ?? 0) > 0, null, { timeout: 60_000 });
  await page.getByTestId('speed-0').click();
  await page.getByTestId('tab-personal').click();
  await page.getByTestId('hire').first().click();
  await expect(page.getByTestId('staff').locator('li')).toHaveCount(2);
  const before = await page.evaluate(() => (window as any).__game.status.business.units.length);
  await page.getByTestId('tab-markt').click();
  await page.locator('li', { hasText: '516 Vario' }).getByTestId('buy').click();
  await page.waitForFunction((n) => (window as any).__game.status.business.units.length === n + 1, before, { timeout: 10_000 });
  // neues Fahrzeug hat eine Position auf der Karte
  await page.getByTestId('speed-1').click();
  await page.waitForFunction(() => {
    const g = (window as any).__game;
    const pos = g.vehiclePositions();
    return pos.length >= g.status.business.units.length + 30 && pos.every((p: any) => Math.abs(p.lon) > 1);
  }, null, { timeout: 15_000 });
});
