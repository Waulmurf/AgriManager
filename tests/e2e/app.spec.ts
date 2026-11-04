import { expect, test, type Page } from '@playwright/test';

async function waitForGame(page: Page) {
  await page.waitForFunction(() => {
    const g = (window as any).__game;
    return g && g.status.phase === 'running' && g.status.tilesLoaded;
  }, null, { timeout: 60_000 });
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
  await page.goto('./');
  await waitForGame(page);
  await page.getByTestId('speed-0').click();
  await page.waitForTimeout(500); // letzte Meldung des Workers abwarten
  const t0 = (await status(page)).time;
  await page.waitForTimeout(1500);
  expect((await status(page)).time).toBe(t0);

  await page.getByTestId('speed-10').click();
  await page.waitForTimeout(3000);
  const dt10 = (await status(page)).time - t0;
  expect(dt10).toBeGreaterThan(15); // ~30 Minuten in 3 s
  expect(dt10).toBeLessThan(40);

  await page.getByTestId('speed-100').click();
  const t1 = (await status(page)).time;
  await page.waitForTimeout(3000);
  const dt100 = (await status(page)).time - t1;
  // ~300 Minuten in 3 s; auf CI-Rechnern ohne GPU teilt sich der Worker die CPU mit dem Software-Rendering
  expect(dt100).toBeGreaterThan(Number(process.env.E2E_MIN_STEPS_100X ?? 200));
  expect(dt100).toBeLessThan(450);
  await expect(page.getByTestId('speed-100')).toHaveClass(/active/);

  // Tastatur: Leertaste pausiert
  await page.keyboard.press('Space');
  await expect(page.getByTestId('speed-0')).toHaveClass(/active/);
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
      // höchstens 60 km/h = 1000 m je Spielminute (+ Rundung)
      expect(m(track[i - 1].p[v], track[i].p[v])).toBeLessThan(1000 * dMin * 1.05 + 5);
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
  expect(r.vehiclesOnMap).toBe(30);
  expect(r.tileErrors).toBe(0);
  expect(r.failures).toEqual([]);
});
