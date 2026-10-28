#!/usr/bin/env node
/**
 * Side-by-side check of the Next.js port against prototype.html (CLAUDE.md P0 definition of done).
 * For every view at 1440 px and 390 px it screenshots the prototype and the port and writes one
 * combined PNG per view to artifacts/compare/<width>-<view>.png (prototype left, port right).
 *
 *   pnpm --filter @flipside/web build && pnpm --filter @flipside/web start   # in one shell
 *   pnpm compare                                                            # in another
 *
 * Env: BASE_URL (default http://localhost:3000), VIEWS (comma list), WIDTHS (comma list), WAIT_MS.
 * Needs Playwright with Chromium (`npx playwright install chromium` if it is not on the machine).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error(
    'Playwright is not installed. Run `npx playwright install chromium` and `npm i -g playwright`.',
  );
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'artifacts', 'compare');
const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const proto = pathToFileURL(join(root, 'prototype.html')).href;
const wait = Number(process.env.WAIT_MS ?? 2500);
const GLOOP = 'AK6sDVobPJFuVSuepJF6QdZYvT9R4RqnerRJ8P5qpump';

const VIEWS = {
  markets: '/',
  trade: `/trade/${GLOOP}`,
  portfolio: '/portfolio',
  pool: '/pool',
  leaders: '/leaderboard',
  docs: '/docs',
};
const views = (process.env.VIEWS ?? Object.keys(VIEWS).join(',')).split(',');
const widths = (process.env.WIDTHS ?? '1440,390').split(',').map(Number);

// Seed the prototype's Math.random so runs are repeatable.
const seedRandom = () => {
  let a = 0x2f6b;
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

async function shot(browser, width, url, view, isProto) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 600 ? 844 : 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  if (isProto) await ctx.addInitScript(seedRandom);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  if (isProto && view !== 'markets') {
    await page.evaluate((v) => document.querySelector(`[data-go="${v}"]`).click(), view);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(wait);
  const png = await page.screenshot({ fullPage: true });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await ctx.close();
  return { png, height };
}

async function combine(browser, width, a, b, label) {
  const gap = 24;
  const ctx = await browser.newContext({
    viewport: { width: width * 2 + gap, height: 400 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const img = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
  await page.setContent(
    `<body style="margin:0;background:#300;display:flex;gap:${gap}px;align-items:flex-start">
      <img src="${img(a.png)}" style="width:${width}px"><img src="${img(b.png)}" style="width:${width}px">
      <div style="position:fixed;top:0;left:0;font:12px monospace;color:#fff;background:#c00;padding:2px 6px">${label}</div>
    </body>`,
  );
  await page.waitForLoadState('load');
  const png = await page.screenshot({ fullPage: true });
  await ctx.close();
  return png;
}

const browser = await chromium.launch();
await mkdir(out, { recursive: true });
for (const width of widths) {
  for (const view of views) {
    const a = await shot(browser, width, proto, view, true);
    const b = await shot(browser, width, base + VIEWS[view], view, false);
    const file = join(out, `${width}-${view}.png`);
    await writeFile(file, await combine(browser, width, a, b, `${width}px ${view}: prototype | port`));
    console.log(`${file}  prototype ${a.height}px, port ${b.height}px`);
  }
}
await browser.close();
