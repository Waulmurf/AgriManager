import { defineConfig, devices } from '@playwright/test';

/**
 * Oberflächentests im Browser gegen den Produktions-Build (vite preview).
 * Chromium entspricht WebView2 (Windows), WebKit entspricht WKWebView (macOS).
 * PW_PROJECTS=chromium,webkit wählt die Engines (Standard: chromium).
 */
const wanted = (process.env.PW_PROJECTS ?? 'chromium').split(',');
const chromiumArgs = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173/',
    viewport: { width: 1400, height: 900 },
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1400, height: 900 },
        launchOptions: {
          args: chromiumArgs,
          executablePath: process.env.PW_CHROMIUM_PATH || undefined,
        },
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1400, height: 900 } } },
  ].filter((p) => wanted.includes(p.name)),
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
