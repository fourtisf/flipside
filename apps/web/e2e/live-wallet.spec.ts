/**
 * Connect a wallet (H2) in the live edition: every wallet in the dialog has its own logo, an installed wallet
 * connects, the header and Portfolio read the account from Hyperliquid, and nothing is ever signed.
 * Hyperliquid is the fixture mock (hl-mock.ts) and the wallet is pretend (wallet-mock.ts).
 */
import { expect, test, type Page } from '@playwright/test';
import { ADDRESS } from './hl-fixtures';
import { mockHyperliquid } from './hl-mock';
import { fakeWallet } from './wallet-mock';

const WALLETS = [
  'Phantom',
  'Backpack',
  'MetaMask',
  'Rabby',
  'OKX Wallet',
  'Coinbase Wallet',
  'Rainbow',
  'Trust Wallet',
  'Zerion',
];
const SHORT = '0x1234…5678';

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on(
    'console',
    (m) => m.type() === 'error' && !m.location().url.includes('/logos/') && errors.push(m.text()),
  );
  return errors;
}

/** Every logo in the dialog loaded as a real image. */
async function logosLoaded(page: Page) {
  const imgs = page.locator('#wl img');
  await expect(imgs).toHaveCount(WALLETS.length);
  await expect
    .poll(() => imgs.evaluateAll((all) => all.every((i) => (i as HTMLImageElement).naturalWidth > 0)))
    .toBe(true);
}

test('the connect dialog lists every wallet with its own logo, and links the ones not installed', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await mockHyperliquid(page);
  await page.goto('/');
  await page.locator('#connect').click();
  await expect(page.locator('#wallets')).toBeVisible();
  const rows = page.locator('#wl > *');
  await expect(rows).toHaveCount(WALLETS.length);
  for (const [i, name] of WALLETS.entries()) await expect(rows.nth(i)).toContainText(name);
  await logosLoaded(page);
  await expect(page.locator('#wl a[data-wallet="metamask"]')).toHaveAttribute(
    'href',
    'https://metamask.io/download/',
  );
  await expect(page.locator('#wl a[data-wallet="phantom"]')).toContainText('Install');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#wallets')).toBeHidden();
  expect(errors).toEqual([]);
});

test('connect a wallet: the header and Portfolio read the account from Hyperliquid', async ({ page }) => {
  const errors = watchErrors(page);
  await mockHyperliquid(page);
  await fakeWallet(page, { address: ADDRESS });
  await page.goto('/portfolio');
  await expect(page.locator('main')).toContainText('Connect a wallet to see your account');

  await page.locator('#connect').click();
  // the installed wallet comes first, with its own icon
  await expect(page.locator('#wl > *').first()).toContainText('Phantom');
  await expect(page.locator('#wl > *').first()).toContainText('Detected');
  await logosLoaded(page);
  await page.locator('#wl button[data-wallet="app.phantom"]').click();

  await expect(page.locator('#wallets')).toBeHidden();
  await expect(page.locator('#walletBtn')).toHaveText(SHORT);
  await expect(page.locator('#walletBtn img')).toHaveAttribute('src', '/wallets/phantom.svg');
  await expect(page.locator('#acct')).toContainText('$1,234.56');

  // Portfolio: summary, positions, orders, balances, trades
  const metrics = page.locator('#pf-metrics');
  await expect(metrics).toContainText('$1,234.56');
  await expect(metrics).toContainText('$744.26');
  await expect(metrics).toContainText('+$63.42');
  await expect(metrics).toContainText('$490.30');
  await expect(page.locator('#pf-pos')).toContainText('SOL');
  await expect(page.locator('#pf-pos')).toContainText('Long 5x');
  await expect(page.locator('#pf-pos')).toContainText('Short 10x');
  await expect(page.locator('#pf-pos')).toContainText('+$74.66');
  await expect(page.locator('#pf-orders')).toContainText('Buy');
  await expect(page.locator('#pf-orders')).toContainText('Limit');
  await expect(page.locator('#pf-spot')).toContainText('USDC');
  await expect(page.locator('#pf-spot')).toContainText('USOL');
  await expect(page.locator('#pf-spot')).not.toContainText('PURR');
  await expect(page.locator('#pf-fills')).toContainText('Open Long');
  await expect(page.locator('#pf-fills')).toContainText('+$12.50');

  // the order form shows what the account can use
  await page.goto('/trade/SOL');
  await expect(page.locator('.order .fl').filter({ hasText: 'Amount' })).toContainText('Available $744.26');
  expect(errors).toEqual([]);
});

test('the wallet menu copies, links and disconnects; a reload reconnects without a prompt', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockHyperliquid(page);
  await fakeWallet(page, { address: ADDRESS });
  await page.goto('/');
  await page.locator('#connect').click();
  await page.locator('#wl button[data-wallet="app.phantom"]').click();
  await expect(page.locator('#walletBtn')).toHaveText(SHORT);

  await page.reload();
  await expect(page.locator('#walletBtn')).toHaveText(SHORT);

  await page.locator('#walletBtn').click();
  const menu = page.locator('#walletMenu');
  await expect(menu).toContainText('Connected with Phantom');
  await expect(menu).toContainText('$744.26');
  await expect(menu.getByRole('link', { name: 'View on Hyperliquid' })).toHaveAttribute(
    'href',
    `https://app.hyperliquid.xyz/explorer/address/${ADDRESS}`,
  );
  await menu.getByRole('button', { name: 'Copy address' }).click();
  await expect(menu.getByRole('button', { name: 'Copied' })).toBeVisible();
  await page.locator('#disconnect').click();
  await expect(page.locator('#connect')).toHaveText('Connect wallet');

  // disconnected stays disconnected after a reload
  await page.reload();
  await page.waitForTimeout(600);
  await expect(page.locator('#connect')).toHaveText('Connect wallet');
});

test('a closed wallet prompt says what happened; switching account in the wallet follows it', async ({
  page,
}) => {
  await mockHyperliquid(page);
  const wallet = await fakeWallet(page, { address: ADDRESS });
  await page.goto('/');
  await wallet.reject();
  await page.locator('#connect').click();
  await page.locator('#wl button[data-wallet="app.phantom"]').click();
  await expect(page.locator('#wErr')).toHaveText(
    "You closed the request in Phantom. Try again when you're ready.",
  );
  await page.locator('#wl button[data-wallet="app.phantom"]').click();
  await expect(page.locator('#walletBtn')).toHaveText(SHORT);

  await wallet.switchTo('0xabcdefabcdefabcdefabcdefabcdefabcdef0001');
  await expect(page.locator('#walletBtn')).toHaveText('0xabcd…0001');
});
