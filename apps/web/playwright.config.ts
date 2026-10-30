import { defineConfig, devices } from '@playwright/test';

// Two builds (lib/edition.ts): the prototype edition (`pnpm build:prototype`, simulated trading and Practice)
// for the flows suite, and the live edition (`pnpm build`, what coinside.fun serves) for live.spec, which
// replaces Hyperliquid with fixtures.
const PROTOTYPE = Number(process.env.E2E_PORT ?? 3100);
const LIVE = PROTOTYPE + 1;
// HL_REAL=1: only real-hl.spec.ts, against the live edition and the real Hyperliquid (the "Live data" CI job).
const REAL = !!process.env.HL_REAL;
const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };
const mobile = { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true };

const liveServer = {
  command: `pnpm exec next start -p ${LIVE}`,
  port: LIVE,
  reuseExistingServer: !process.env.CI,
  timeout: 60_000,
};

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: REAL
    ? [
        {
          name: 'real-hyperliquid',
          testMatch: /real-hl/,
          use: { ...desktop, baseURL: `http://localhost:${LIVE}` },
        },
      ]
    : [
        {
          name: 'desktop',
          testIgnore: [/live/, /real-hl/],
          use: { ...desktop, baseURL: `http://localhost:${PROTOTYPE}` },
        },
        {
          name: 'mobile',
          testIgnore: [/live/, /real-hl/],
          use: { ...mobile, baseURL: `http://localhost:${PROTOTYPE}` },
        },
        { name: 'live-desktop', testMatch: /live/, use: { ...desktop, baseURL: `http://localhost:${LIVE}` } },
        { name: 'live-mobile', testMatch: /live/, use: { ...mobile, baseURL: `http://localhost:${LIVE}` } },
      ],
  webServer: REAL
    ? [liveServer]
    : [
        {
          command: `pnpm exec next start -p ${PROTOTYPE}`,
          env: { NEXT_DIST_DIR: '.next-prototype' },
          port: PROTOTYPE,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
        liveServer,
      ],
});
