/**
 * The live edition (lib/edition.ts), which coinside.fun serves: Hyperliquid's markets, read only. Runs against
 * `pnpm build` at 1440 and 390 px, with Hyperliquid's API replaced by fixtures (hl-mock.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { NO_LOGO, mockHyperliquid } from './hl-mock';

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // a coin without an icon is a 404 the browser logs; the page shows its letter avatar instead
  page.on(
    'console',
    (m) => m.type() === 'error' && !m.location().url.includes('/logos/') && errors.push(m.text()),
  );
  return errors;
}

/** Nothing from the original design: paper SOL, Practice, the pool, the vault, contract addresses. */
const nothingOld = async (page: Page) =>
  expect(page.locator('main')).not.toContainText(/paper SOL|Practice|the pool|vault|rug guard/i);

const rowPrice = (page: Page, name: string) =>
  page
    .locator('#rows .mk')
    .filter({ has: page.locator(`b:text-is("${name}")`) })
    .locator('[role="cell"]')
    .nth(1);

test('markets: every Hyperliquid market, live prices, and an order button that asks for a wallet', async ({
  page,
}) => {
  const errors = watchErrors(page);
  const hl = await mockHyperliquid(page);
  await page.goto('/');

  await expect(page.locator('#connect')).toHaveText('Connect wallet');
  await expect(page.locator('.status')).toHaveText('Live prices from Hyperliquid');
  await expect(page.getByRole('link', { name: 'Pool' })).toHaveCount(0);

  // all 23 listed markets (the delisted one left out), sorted by volume
  await expect(page.locator('#mkCount')).toHaveText('23 markets');
  await expect(page.locator('#rows .mk')).toHaveCount(23);
  await expect(page.locator('#rows .mk').first()).toContainText('BTC');
  await expect(page.locator('#rows')).not.toContainText('OLDCOIN');
  await expect(rowPrice(page, 'BTC')).toHaveText('$97,124');
  await expect(rowPrice(page, 'kPEPE')).toHaveText('$0.020145');
  await expect(page.locator('.hero .sub')).toContainText('SOL, BTC and 21 more markets');

  // lists and map
  await expect(page.locator('#l-up .lr').first()).toContainText('PUMP');
  await expect(page.locator('#l-down .lr').first()).toContainText('WIF');
  await expect(page.locator('#l-vol .lr').first()).toContainText('BTC');
  await expect(page.locator('#map a.tile').first()).toHaveAttribute('href', '/trade/BTC');

  // a price pushed over the WebSocket shows within a second
  hl.pushMids({ BTC: '98100' });
  await expect(rowPrice(page, 'BTC')).toHaveText('$98,100', { timeout: 1_000 });

  // every coin shows its icon, or its letter when it has none
  const row = (name: string) =>
    page.locator('#rows .mk').filter({ has: page.locator(`b:text-is("${name}")`) });
  await expect(row('BTC').locator('.tok.img img')).toHaveJSProperty('complete', true);
  await expect
    .poll(() =>
      row('BTC')
        .locator('.tok img')
        .evaluate((i: HTMLImageElement) => i.naturalWidth),
    )
    .toBeGreaterThan(0);
  await row(NO_LOGO).scrollIntoViewIfNeeded();
  await expect(row(NO_LOGO).locator('.tok')).not.toHaveClass(/img/);
  await expect(row(NO_LOGO).locator('.tok')).toHaveText('P');
  await page.evaluate(() => window.scrollTo(0, 0));

  // Quick trade: SOL by default, estimates, closed order button
  await expect(page.locator('#tk-coin')).toContainText('SOL');
  await expect(page.locator('#tk-lev button')).toHaveText(['2x', '5x', '10x', '20x']);
  await expect(page.locator('#tk-sum')).toContainText('$500.00'); // 100 USDC at 5x
  await expect(page.locator('#tk-sum')).toContainText('2.67 SOL');
  await expect(page.locator('#tk-cta')).toHaveText('Connect wallet');
  await expect(page.locator('#tk-mode')).toHaveText('Market order');
  await page.locator('#tk-side [data-side="short"]').click();
  await expect(page.locator('#tk-side [data-side="short"]')).toHaveAttribute('aria-pressed', 'true');

  // search picks a market; a contract address gets a clear answer
  await page.locator('#q2').fill('0xnot-a-ticker');
  await expect(page.locator('#dd2')).toContainText('No market matches that');
  await page.locator('#q2').fill('AK6sDVobPJFuVSuepJF6QdZYvT9R4RqnerRJ8P5qpump');
  await expect(page.locator('#dd2')).toContainText('not contract addresses');
  await page.locator('#q2').fill('pep');
  await page.locator('#q2').press('Enter');
  await expect(page.locator('#tk-coin')).toContainText('kPEPE');
  await expect(page.locator('#tk-lev button')).toHaveText(['2x', '5x', '10x']);

  // sorting (the column headers are hidden on phones)
  if ((page.viewportSize()?.width ?? 0) > 640) {
    await page.getByRole('button', { name: '24h' }).click();
    await expect(page.locator('#rows .mk').first()).toContainText('PUMP');
  }

  await nothingOld(page);
  await expect(page.locator('.fb')).toContainText('Prices are live from Hyperliquid');
  expect(errors).toEqual([]);
});

test('terminal: chart, order book, trades and stats for one market', async ({ page }) => {
  const errors = watchErrors(page);
  const hl = await mockHyperliquid(page);
  await page.goto('/trade/sol');

  // any case works; the URL takes Hyperliquid's spelling
  await expect(page).toHaveURL(/\/trade\/SOL$/);
  await expect(page.locator('#th-title')).toHaveText('SOL-USD');
  await expect(page).toHaveTitle(/SOL-USD/);
  await expect(page.locator('.th-px b')).toHaveText('$187.23');
  await expect(page.locator('#th-chg')).toHaveText('+5.3% 24h');
  await expect(page.locator('#th-stats')).toContainText('Max leverage20x');
  await expect(page.locator('#th-stats')).toContainText(/Funding, 1h\+0\.0016% in \d\d:\d\d/);

  // live data
  await expect(page.locator('.tvc canvas').first()).toBeVisible();
  await expect(page.locator('.cmsg')).toHaveCount(0);
  await expect(page.locator('#ob .ob-r.a')).toHaveCount(10);
  await expect(page.locator('#ob .ob-r.b')).toHaveCount(10);
  await expect(page.locator('#ob .ob-r.b').first()).toContainText('187.22');
  await expect(page.locator('#ob .ob-sp')).toContainText('Spread 0.02 (0.011%)');
  await expect(page.locator('#rt .ob-r').first()).toBeVisible();
  expect(hl.subs.map((s) => s.type)).toEqual(
    expect.arrayContaining(['l2Book', 'trades', 'candle', 'activeAssetCtx']),
  );

  // candle size and the Short view
  await page.locator('#tfs [data-tf="1h"]').click();
  await expect
    .poll(() => hl.info.some((i) => i.type === 'candleSnapshot' && i.req?.interval === '1h'))
    .toBe(true);
  await page.locator('#flip').click();
  await expect(page.locator('#flipnote')).toBeVisible();

  // the order panel: limit orders, take profit and stop loss, closed button
  await expect(page.locator('#o-lev button')).toHaveText(['2x', '5x', '10x', '20x']);
  await page.locator('#o-type button', { hasText: 'Limit' }).click();
  await expect(page.locator('#o-px')).toHaveValue('187.23');
  await page.locator('#o-tpsl').click();
  await page.locator('#o-tp').fill('50');
  await expect(page.locator('#o-sum')).toContainText('Take profit at');
  const cta = page.locator('#o-cta');
  await expect(cta).toHaveText('Connect wallet');
  await cta.click();
  await expect(page.locator('#wallets')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // switching market from the watchlist (desktop) moves every panel to it
  if ((page.viewportSize()?.width ?? 0) > 1200) {
    await page.locator('#watch a', { hasText: 'ETH' }).click();
    await expect(page).toHaveURL(/\/trade\/ETH$/);
    await expect(page.locator('#th-title')).toHaveText('ETH-USD');
    await expect(page.locator('#ob .ob-r.b').first()).toContainText('3,456.6');
    await page.locator('#watch a', { hasText: 'SOL' }).click();
    await expect(page.locator('#ob .ob-r.b').first()).toContainText('187.22');
  }

  // the header Trade link remembers the market
  await page.goto('/');
  await expect(page.locator('.hero .btn.w')).toHaveAttribute('href', '/trade/SOL');
  await nothingOld(page);
  expect(errors).toEqual([]);
});

test('terminal: an unknown market says so', async ({ page }) => {
  await mockHyperliquid(page);
  await page.goto('/trade/NOPE');
  await expect(page.locator('#th-title')).toHaveText('Market not found');
  await expect(page.locator('main')).toContainText('Hyperliquid has no perpetual market called NOPE');
  // an address that decodes to a broken escape is an unknown market too, not a server error
  const r = await page.goto('/trade/%25E0');
  expect(r?.status()).toBe(200);
  await expect(page.locator('#th-title')).toHaveText('Market not found');
});

test('when Hyperliquid cannot be reached, the page says so and keeps trying', async ({ page }) => {
  await mockHyperliquid(page, { down: true });
  await page.goto('/');
  await expect(page.locator('.status')).toHaveText("Can't reach Hyperliquid right now. Retrying.");
  await expect(page.locator('#rows')).toContainText("Can't reach Hyperliquid right now");
  await page.goto('/trade/SOL');
  await expect(page.locator('main')).toContainText("Can't reach Hyperliquid right now");
});

test('/trade opens SOL', async ({ request }) => {
  const r = await request.get('/trade', { maxRedirects: 0 });
  expect(r.status()).toBe(307);
  expect(r.headers().location).toBe('/trade/SOL');
});

for (const path of ['/pool', '/emergency']) {
  test(`${path} is gone: there is no pool or vault on Hyperliquid`, async ({ page }) => {
    await mockHyperliquid(page);
    const r = await page.goto(path);
    expect(r?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing here');
  });
}

for (const [path, heading, state] of [
  ['/portfolio', 'Portfolio', 'Connect a wallet to see your account'],
  ['/leaderboard', 'Leaderboard', 'Starts with trading'],
] as const) {
  test(`${path}: says what comes, shows nothing simulated`, async ({ page }) => {
    const errors = watchErrors(page);
    await mockHyperliquid(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.locator('.soon-page')).toContainText(state);
    await expect(page.locator('main .n')).toHaveCount(0); // no figures (every number in the UI is .n)
    await nothingOld(page);
    expect(errors).toEqual([]);
  });
}

test('nothing is wider than the screen', async ({ page }) => {
  await mockHyperliquid(page);
  for (const path of ['/', '/trade/SOL', '/docs', '/portfolio']) {
    await page.goto(path);
    await expect(page.locator('main')).not.toBeEmpty();
    await page.waitForTimeout(500);
    const [scroll, client] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(scroll, path).toBe(client);
  }
});

test('docs: how it works on Hyperliquid', async ({ page }) => {
  await mockHyperliquid(page);
  await page.goto('/docs');
  await expect(page.locator('#d-safety')).toContainText('Coinside never holds your funds');
  // Coinside charges no fee
  await expect(page.locator('#d-rules')).toContainText('Coinside charges no fee');
  await expect(page.locator('#d-safety')).toContainText('No Coinside fee');
  await expect(page.locator('main')).not.toContainText('0.1%');
  await nothingOld(page);
});
