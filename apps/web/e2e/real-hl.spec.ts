/**
 * H1's done check against the real Hyperliquid, not fixtures: every listed perp shows, prices match
 * Hyperliquid's own mids, and price updates arrive over the WebSocket within a second. Runs only with
 * HL_REAL=1 (the "Live data" CI job), because it depends on the market and the network.
 */
import { expect, test, type APIRequestContext } from '@playwright/test';

const INFO = 'https://api.hyperliquid.xyz/info';

async function info<T>(request: APIRequestContext, body: object): Promise<T> {
  const r = await request.post(INFO, { data: body });
  expect(r.ok()).toBe(true);
  return (await r.json()) as T;
}

test('markets: every listed perp, at Hyperliquid prices, updating live', async ({ page, request }) => {
  const frames: number[] = [];
  page.on('websocket', (ws) =>
    ws.on('framereceived', (f) => {
      if (typeof f.payload === 'string' && f.payload.startsWith('{"channel":"allMids"'))
        frames.push(Date.now());
    }),
  );
  await page.goto('/');
  await expect(page.locator('.status')).toHaveText('Live prices from Hyperliquid', { timeout: 30_000 });

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

  // price updates keep arriving: at least one allMids message a second over 5 seconds
  const from = Date.now();
  await page.waitForTimeout(5_000);
  const n = frames.filter((t) => t >= from).length;
  console.log(`allMids messages in 5 s: ${n}`);
  expect(n).toBeGreaterThanOrEqual(5);
});

test('terminal: candles, order book, trades and stats for BTC and a k-market', async ({ page }) => {
  const books: number[] = [];
  page.on('websocket', (ws) =>
    ws.on('framereceived', (f) => {
      if (typeof f.payload === 'string' && f.payload.startsWith('{"channel":"l2Book"'))
        books.push(Date.now());
    }),
  );
  await page.goto('/trade/BTC');
  await expect(page.locator('#th-title')).toHaveText('BTC-USD', { timeout: 30_000 });
  await expect(page.locator('.cmsg')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('#ob .ob-r.a')).toHaveCount(10, { timeout: 30_000 });
  await expect(page.locator('#ob .ob-r.b')).toHaveCount(10);
  await expect(page.locator('#rt .ob-r').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#th-stats')).toContainText('Max leverage');
  await page.waitForTimeout(10_000);
  // how often Hyperliquid pushes the book by default, for the record
  const gaps = books.slice(1).map((t, i) => t - books[i]!);
  console.log(`l2Book messages in ~10 s: ${books.length}, gaps ms: ${gaps.join(', ')}`);
  expect(books.length).toBeGreaterThan(0);

  await page.goto('/trade/kpepe');
  await expect(page).toHaveURL(/\/trade\/kPEPE$/, { timeout: 30_000 });
  await expect(page.locator('#th-venue')).toContainText('priced per 1,000 PEPE');
});
