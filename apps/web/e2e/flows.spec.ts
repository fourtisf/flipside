/**
 * End-to-end flows against the P0 mock, at 1440 px and 390 px. Every test also fails on any page
 * error or console error, which catches hydration mismatches between the server render and client.
 */
import { expect, test, type Page } from '@playwright/test';

const GLOOP = 'AK6sDVobPJFuVSuepJF6QdZYvT9R4RqnerRJ8P5qpump';
const KELP = '9CZbPcwKhrm6S3fJ2qVarJ1XTrrJBKwuRkrmZJ33U5uK';

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

const mobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1000;
const toasts = (page: Page) => page.locator('#toasts');

/** Client-side navigation (keeps the mock state), through the header nav or the mobile tab bar. */
async function nav(page: Page, name: 'Markets' | 'Trade' | 'Portfolio' | 'Pool' | 'Leaderboard') {
  const label = mobile(page) && name === 'Leaderboard' ? 'Leaders' : name;
  const bar = mobile(page) ? page.locator('nav.tabbar') : page.locator('header nav.nav');
  await bar.getByRole('link', { name: label, exact: true }).click();
}

test('markets renders every section and the quick ticket trades', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Every coin has');
  await expect(page.locator('#map .tile')).toHaveCount(22);
  await expect(page.locator('#rows .mk')).toHaveCount(22);
  await expect(page.locator('#l-hot .lr')).toHaveCount(5);
  expect(await page.locator('#feed li').count()).toBeGreaterThanOrEqual(8);
  await expect(page.locator('#wins .wn')).toHaveCount(6);

  // practice: the CTA claims paper SOL first, then trades
  await page.locator('#tk-cta').click();
  await expect(toasts(page)).toContainText('10 paper SOL added');
  await expect(page.locator('#walletbox .bal')).toContainText('10.00');

  await page.locator('#tk-amt').fill('0.001');
  await page.locator('#tk-cta').click();
  await expect(page.locator('#tk-msg')).toHaveText('The minimum trade is 0.01 SOL.');
  await page.locator('#tk-amt').fill('50');
  await page.locator('#tk-cta').click();
  await expect(page.locator('#tk-msg')).toHaveText('Not enough paper SOL. Lower the amount.');

  await page.locator('#tk-pct').getByRole('button', { name: '25%' }).click();
  await expect(page.locator('#tk-amt')).toHaveValue('2.50');
  await page.locator('#tk-amt').fill('0.25');
  await expect(page.locator('#tk-cta')).toHaveText('Long $GLOOP with 0.25 SOL at 2x');
  await page.locator('#tk-cta').click();
  await expect(toasts(page)).toContainText('Long opened on $GLOOP: 0.25 SOL at 2x');
  await expect(page.locator('#tk-pos')).toContainText('1 open position');
  await expect(page.locator('#walletbox .bal')).toContainText('9.75');
  // other simulated trades can land above it, so look anywhere in the feed
  await expect(page.locator('#feed .w', { hasText: /^You$/ })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('search: tickers, addresses, keyboard and the shortcut', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const q2 = page.locator('#q2');
  await q2.click();
  await expect(page.locator('#dd2')).toContainText('Moving now');
  await q2.fill('zzz');
  await expect(page.locator('#dd2')).toContainText('No coin matches that.');
  await q2.fill('So11111111111111111111111111111111111111112');
  await expect(page.locator('#dd2')).toContainText("That address isn't tradable yet.");
  await q2.fill(KELP);
  await q2.press('Enter');
  await expect(page.locator('#tk-coin')).toContainText('$KELP');
  await q2.fill('ch');
  await q2.press('ArrowDown');
  await q2.press('Escape');
  await expect(page.locator('#dd2')).toBeHidden();

  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('Control+k');
  if (mobile(page)) {
    await expect(page.locator('#q2')).toBeFocused();
  } else {
    await expect(page.locator('#q1')).toBeFocused();
    await page.locator('#q1').fill('$kelp');
    await page.locator('#q1').press('Enter');
    await expect(page).toHaveURL(new RegExp(`/trade/${KELP}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('$KELP');
  }
  expect(errors).toEqual([]);
});

test('terminal: open with TP/SL, minimum hold, close, history, chart', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.goto(`/trade/${GLOOP}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('$GLOOP');
  await expect(page.locator('#cbox canvas').first()).toBeVisible();

  await page.locator('#o-cta').click(); // claims paper SOL
  await expect(page.locator('#o-cta')).toHaveText(/Long \$GLOOP with/);
  await page.locator('#o-side').getByRole('button', { name: 'Short' }).click();
  await page.locator('#o-lev').getByRole('button', { name: '5x' }).click();
  await page.locator('#o-amt').fill('0.5');
  await page.locator('#o-tpsl').click();
  await expect(page.locator('#o-tpsl')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#o-sl').fill('120');
  await page.locator('#o-cta').click();
  await expect(page.locator('#o-msg')).toContainText('Stop loss has to be under 100%');
  await page.locator('#o-tp').fill('900');
  await page.locator('#o-sl').fill('90');
  await expect(page.locator('#o-cta')).toHaveText('Short $GLOOP with 0.50 SOL at 5x');
  await page.locator('#o-cta').click();
  await expect(toasts(page)).toContainText('Short opened on $GLOOP: 0.50 SOL at 5x');
  await expect(page.locator('#ptabs')).toContainText('Open positions (1)');
  await expect(page.locator('#cbox .entry')).toHaveText('Your short 5x');

  const close = page.locator('#tv-pos').getByRole('button', { name: /Close/ });
  await expect(close).toBeDisabled();
  await expect(close).toHaveText(/Close in \d+s/);
  await expect(close).toBeEnabled({ timeout: 15_000 });
  await close.click();
  await expect(toasts(page)).toContainText('Closed your 5x short on $GLOOP');
  await page.locator('#ptabs').getByRole('button', { name: 'History' }).click();
  await expect(page.locator('#tv-pos')).toContainText('Closed by you');

  await page.locator('#flip').click();
  await expect(page.locator('#flipnote')).toBeVisible();
  await page.locator('#tfs').getByRole('button', { name: '30s' }).click();
  await expect(page.locator('#tfs').getByRole('button', { name: '30s' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  if (!mobile(page)) {
    await page
      .locator('#watch')
      .getByRole('link', { name: /\$KELP/ })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('$KELP');
  }
  expect(errors).toEqual([]);
});

test('real mode: connect, deposit, pool add and remove, withdraw', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.locator('#modeT').getByRole('button', { name: 'Real' }).click();
  await page.locator('#walletbox').getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.locator('#wallets')).toBeVisible();
  await page
    .locator('#wallets')
    .getByRole('button', { name: /Phantom/ })
    .click();
  await expect(toasts(page)).toContainText('Phantom connected');

  await nav(page, 'Portfolio');
  await page.locator('#pf-acts').getByRole('button', { name: 'Deposit' }).click();
  await expect(page.locator('#fund')).toBeVisible();
  await page.locator('#fundAmt').fill('2');
  await page.locator('#fundOk').click();
  await expect(toasts(page)).toContainText("Deposited 2.00 SOL. It's in your balance now.");
  await expect(page.locator('#pf-metrics')).toContainText('2.00');

  await nav(page, 'Pool');
  await page.locator('#lpAmt').fill('0.5');
  await page.locator('#lpBtn').click();
  await expect(toasts(page)).toContainText('Added 0.50 SOL to the pool');
  await page.locator('#lpSeg').getByRole('button', { name: 'Remove' }).click();
  await page.locator('#lpAmt').fill('5');
  await page.locator('#lpBtn').click();
  await expect(page.locator('#lpMsg')).toContainText('SOL in the pool.');
  await page.locator('#lpAmt').fill('0.2');
  await page.locator('#lpBtn').click();
  await expect(toasts(page)).toContainText('Removed 0.20 SOL from the pool.');

  await nav(page, 'Portfolio');
  await page.locator('#pf-acts').getByRole('button', { name: 'Withdraw' }).click();
  await expect(page.locator('#fundAmt')).toHaveValue('1.70');
  await page.locator('#fundOk').click();
  await expect(toasts(page)).toContainText('Withdrew 1.70 SOL');
  expect(errors).toEqual([]);
});

test('leaderboard ranges and copy', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/leaderboard');
  await expect(page.locator('#podium .pod')).toHaveCount(3);
  await page.locator('#ldSeg').getByRole('button', { name: 'This week' }).click();
  await expect(page.locator('#prize')).toContainText('9.62 SOL prize pot');
  await page.locator('#podium').getByRole('button', { name: 'Copy' }).first().click();
  await expect(toasts(page)).toContainText('with 0.10 SOL a trade');
  const traders = await page.locator('#leaders .tr:not(.hd) .n:nth-child(2)').allTextContents();
  expect(new Set(traders).size).toBe(traders.length);
  expect(errors).toEqual([]);
});

test('rug guard settles a position at the pre-drop price and pauses the coin', async ({ page }) => {
  test.setTimeout(80_000);
  const errors = watchErrors(page);
  await page.goto('/');
  await page.locator('#tk-cta').click(); // claim
  await page.locator('#q2').fill('$FERN');
  await page.locator('#q2').press('Enter');
  await page.locator('#tk-side').getByRole('button', { name: 'Short' }).click();
  await page.locator('#tk-amt').fill('0.1');
  await page.locator('#tk-cta').click();
  await expect(toasts(page)).toContainText('Short opened on $FERN');
  await expect(page.locator('#feed')).toContainText('Rug guard settled $FERN', { timeout: 50_000 });
  await expect(toasts(page)).toContainText('Rug guard settled your 2x short on $FERN');
  await expect(page.locator('#rows .mk.off')).toContainText('Paused by rug guard');
  await expect(page.locator('#tk-coin')).toContainText('$GLOOP');
  expect(errors).toEqual([]);
});

test('routes: redirects, referral cookie, not found, emergency, docs', async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.goto('/trade');
  await expect(page).toHaveURL(new RegExp(`/trade/${GLOOP}$`));
  await page.goto('/leaders');
  await expect(page).toHaveURL(/\/leaderboard$/);
  await page.goto('/r/Alfa_01');
  await expect(page).toHaveURL(/\/$/);
  const ref = (await context.cookies()).find((c) => c.name === 'flipside_ref');
  expect(ref?.value).toBe('alfa_01');
  expect(ref?.httpOnly).toBe(true);

  const res = await page.goto('/trade/NotARealMint111111111111111111111111');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing here');

  await page.goto('/emergency');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Emergency withdraw');
  await expect(page.getByRole('button', { name: 'Opens after 72 hours without a proof' })).toBeDisabled();

  await page.goto('/docs');
  await expect(page.locator('#guards .gd')).toHaveCount(6);
  // the 404 above logs a failed resource load by design
  expect(errors.filter((e) => !e.includes('404'))).toEqual([]);
});

/** Every token avatar on the page is a loaded logo image, none fell back to a letter. */
async function expectAllLogos(page: Page) {
  await expect(page.locator('.tok').first()).toBeVisible();
  await expect(page.locator('.tok:not(.img)')).toHaveCount(0);
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>('.tok.img img')].every(
      (i) => i.complete && i.naturalWidth > 0,
    ),
  );
}

test('every token shows its logo, everywhere a token appears', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expectAllLogos(page);
  expect(await page.locator('#rows .mk .tok.img').count()).toBe(22);
  await expect(page.locator('#map .tile b .tok.img').first()).toBeVisible();
  await page.goto(`/trade/${GLOOP}`);
  await expectAllLogos(page);
  await expect(page.locator('#th-tok .tok.img img')).toHaveAttribute('src', '/tokens/gloop.svg');
  await page.goto('/leaderboard');
  await expectAllLogos(page);
  expect(await page.locator('#leaders .tok.inl.img').count()).toBe(9);
  await page.goto('/pool');
  await expectAllLogos(page);
  expect(errors).toEqual([]);
});

test('a token whose logo fails to load falls back to the letter avatar', async ({ page }) => {
  await page.route('**/tokens/kelp.svg', (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  const kelp = page.locator('#rows .mk', { hasText: '$KELP' }).locator('.tok');
  await expect(kelp).not.toHaveClass(/\bimg\b/);
  await expect(kelp).toHaveText('K');
  await expect(page.locator('#rows .mk', { hasText: '$CHAD' }).locator('.tok.img')).toHaveCount(1);
});

test('mobile layout collapses like the prototype', async ({ page }) => {
  test.skip(!mobile(page), 'mobile only');
  await page.goto('/');
  await expect(page.locator('nav.tabbar')).toBeVisible();
  await expect(page.locator('header nav.nav')).toBeHidden();
  await expect(page.locator('.search')).toBeHidden();
  await expect(page.locator('#rows .mk').first().locator('.c-mc')).toBeHidden();
  await expect(page.locator('#rows .mk').first().locator('.acts')).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
