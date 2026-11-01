// Renders banner.html to x-banner.png (2560x1440, 16:9) for X posts.
//   node brand/premium/build-banner.mjs
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 4 / 3 });
await page.goto(`file://${join(here, 'banner.html')}`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({ path: join(here, 'x-banner.png') });
await browser.close();
console.log('ok');
