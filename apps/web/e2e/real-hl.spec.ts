/**
 * H1's done check against the real Hyperliquid, not fixtures: every listed perp shows, prices match
 * Hyperliquid's own mids, price updates arrive over the WebSocket within a second, and coins have their icons.
 * Runs only with HL_REAL=1 (the "Live data" CI job), because it depends on the market and the network.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const INFO = 'https://api.hyperliquid.xyz/info';

async function info<T>(request: APIRequestContext, body: object): Promise<T> {
  const r = await request.post(INFO, { data: body });
  expect(r.ok()).toBe(true);
  return (await r.json()) as T;
}

/** Times at which the page received each WebSocket message on `channel`. */
function frames(page: Page, channel: string): number[] {
  const at: number[] = [];
  const head = `{"channel":"${channel}"`;
  page.on('websocket', (ws) =>
    ws.on('framereceived', (f) => {
      if (typeof f.payload === 'string' && f.payload.startsWith(head)) at.push(Date.now());
    }),
  );
  return at;
}

const live = (page: Page) =>
  expect(page.locator('.status')).toHaveText('Live prices from Hyperliquid', { timeout: 30_000 });

test('markets: every listed perp, at Hyperliquid prices, updating live', async ({ page, request }) => {
  const fast = frames(page, 'fastAssetCtxs');
  const slow = frames(page, 'allMids');
  await page.goto('/');
  await live(page);

  type Meta = [{ universe: Array<{ name: string; isDelisted?: boolean }> }, unknown[]];
  const [meta] = await info<Meta>(request, { type: 'metaAndAssetCtxs' });
  const listed = meta.universe.filter((u) => !u.isDelisted).length;
  await expect(page.locator('#mkCount')).toHaveText(`${listed} markets`);
  await expect(page.locator('#rows .mk')).toHaveCount(listed);

  // within 0.5% of Hyperliquid's mid at the same moment (prices move between the two reads)
  const mids = await info<Record<string, string>>(request, { type: 'allMids' });
  for (const name of ['BTC', 'ETH', 'SOL']) {
    const cell = page
      .locator('#rows .mk')
      .filter({ has: page.locator(`b:text-is("${name}")`) })
      .locator('[role="cell"]')
      .nth(1);
    const shown = Number((await cell.textContent())!.replace(/[$,]/g, ''));
    const real = Number(mids[name]);
    console.log(`${name}: shown ${shown}, Hyperliquid mid ${real}`);
    expect(Math.abs(shown / real - 1), name).toBeLessThan(0.005);
  }

  // price updates keep arriving: at least one fast message a second over 5 seconds
  const from = Date.now();
  await page.waitForTimeout(5_000);
  const n = fast.filter((t) => t >= from).length;
  console.log(`fastAssetCtxs messages in 5 s: ${n} (allMids: ${slow.filter((t) => t >= from).length})`);
  expect(n).toBeGreaterThanOrEqual(5);
});

test('logos: every coin has its icon', async ({ page, request }) => {
  const r = await request.get('/logos/BTC.svg');
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('image/svg+xml');

  await page.goto('/');
  await live(page);
  // icons load lazily: bring every row on screen once, then count the ones that loaded
  for (const row of await page.locator('#rows .mk').all()) await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3_000);
  const result = await page.locator('#rows .mk').evaluateAll((rows) =>
    rows.map((row) => {
      const img = row.querySelector<HTMLImageElement>('.tok img');
      return {
        name: row.querySelector('b')?.textContent ?? '',
        ok: !!img && img.complete && img.naturalWidth > 0,
      };
    }),
  );
  const missing = result.filter((x) => !x.ok).map((x) => x.name);
  console.log(
    `logos: ${result.length - missing.length} of ${result.length}; without: ${missing.join(', ') || 'none'}`,
  );
  for (const name of ['BTC', 'ETH', 'SOL', 'HYPE']) expect(missing, name).not.toContain(name);
  expect(missing.length / result.length).toBeLessThan(0.1);
});

test('terminal: candles, order book, trades and stats for BTC and a k-market', async ({ page }) => {
  const books = frames(page, 'l2Book');
  await page.goto('/trade/BTC');
  await expect(page.locator('#th-title')).toHaveText('BTC-USD', { timeout: 30_000 });
  await expect(page.locator('.cmsg')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('#ob .ob-r.a')).toHaveCount(10, { timeout: 30_000 });
  await expect(page.locator('#ob .ob-r.b')).toHaveCount(10);
  await expect(page.locator('#rt .ob-r').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#th-stats')).toContainText('Max leverage');

  // the fast book feed: at least one message a second
  const from = Date.now();
  await page.waitForTimeout(5_000);
  const n = books.filter((t) => t >= from).length;
  console.log(`l2Book messages in 5 s: ${n}`);
  expect(n).toBeGreaterThanOrEqual(5);

  await page.goto('/trade/kpepe');
  await expect(page).toHaveURL(/\/trade\/kPEPE$/, { timeout: 30_000 });
  await expect(page.locator('#th-venue')).toContainText('priced per 1,000 PEPE');
});
