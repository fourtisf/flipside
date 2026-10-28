#!/usr/bin/env node
/**
 * Lighthouse accessibility for every route, mobile and desktop (P0 needs 95 or higher everywhere).
 * Expects the web app running at BASE_URL (default http://localhost:3000). Exits 1 below MIN_SCORE.
 *
 *   pnpm --filter @flipside/web build && pnpm --filter @flipside/web start
 *   pnpm a11y
 *
 * Env: BASE_URL, MIN_SCORE (default 95), CHROME_PATH (any Chromium; Lighthouse finds Chrome if unset).
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const min = Number(process.env.MIN_SCORE ?? 95);
const out = join(process.cwd(), 'artifacts', 'lighthouse');
const ROUTES = [
  '/',
  '/trade/AK6sDVobPJFuVSuepJF6QdZYvT9R4RqnerRJ8P5qpump',
  '/portfolio',
  '/pool',
  '/leaderboard',
  '/docs',
  '/emergency',
];

await mkdir(out, { recursive: true });
let failed = false;
for (const preset of ['mobile', 'desktop']) {
  for (const route of ROUTES) {
    const file = join(out, `${preset}${route.replace(/\//g, '_') || '_'}.json`.slice(0, 120));
    const args = [
      '-y',
      'lighthouse@13.6.0',
      base + route,
      '--only-categories=accessibility',
      '--output=json',
      `--output-path=${file}`,
      '--quiet',
      '--chrome-flags=--headless=new --no-sandbox',
      ...(preset === 'desktop' ? ['--preset=desktop'] : []),
    ];
    await run('npx', args, { env: process.env, maxBuffer: 64 * 1024 * 1024 });
    const lhr = JSON.parse(await readFile(file, 'utf8'));
    const score = Math.round(lhr.categories.accessibility.score * 100);
    const fails = Object.values(lhr.audits)
      .filter((a) => a.score === 0 && a.scoreDisplayMode === 'binary')
      .map((a) => a.id);
    if (score < min) failed = true;
    console.log(
      `${score >= min ? 'ok  ' : 'FAIL'} ${score}  ${preset.padEnd(7)} ${route}${fails.length ? '  failing: ' + fails.join(', ') : ''}`,
    );
  }
}
process.exit(failed ? 1 : 0);
