import { defineConfig, devices } from '@playwright/test';

declare const process: { env: Record<string, string | undefined> };

// DAYLY_E2E_PORT lets several checkouts run e2e at the same time; 4173 by default.
const port = process.env.DAYLY_E2E_PORT ?? '4173';

// E2E of the MVP criteria against the production build (with the service worker), as on a phone.
export default defineConfig({
  testDir: 'e2e',
  // A browser profile needs a local disk; on a network mount set DAYLY_E2E_OUTPUT=/tmp/dayly-e2e.
  outputDir: process.env.DAYLY_E2E_OUTPUT ?? 'test-results',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 },
    locale: 'ru-RU',
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js build && node node_modules/vite/bin/vite.js preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
