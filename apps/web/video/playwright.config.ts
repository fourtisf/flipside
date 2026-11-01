import { defineConfig, devices } from '@playwright/test';

// Screens for the promo video (capture.spec.ts), from the live edition build. Not part of CI.
const PORT = 3109;

export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: { command: `pnpm exec next start -p ${PORT}`, cwd: '..', port: PORT, timeout: 60_000 },
});
