/**
 * Screens for the Coinside promo video (brand/video): the real live edition, driven like the e2e tests, with
 * the pretend Hyperliquid, Unit and Solana wallet from e2e/. Writes PNGs to brand/video/shots.
 *
 *   pnpm build && pnpm exec playwright test --config video/playwright.config.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { ADDRESS, SPOT } from '../e2e/hl-fixtures';
import { mockHyperliquid } from '../e2e/hl-mock';
import { fakeWallet, testSolanaWallet } from '../e2e/wallet-mock';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../../../brand/video/shots');
const svgData = (file: string) =>
  'data:image/svg+xml,' + encodeURIComponent(readFileSync(join(HERE, '../public/wallets', file), 'utf8'));

// plain coin marks for the three markets on screen; the rest show the app's letter avatar
const COIN: Record<string, string> = {
  BTC: '<circle cx="32" cy="32" r="32" fill="#F7931A"/><text x="32" y="44" font-family="Inter" font-weight="700" font-size="34" text-anchor="middle" fill="#fff">₿</text>',
  ETH: '<circle cx="32" cy="32" r="32" fill="#627EEA"/><path d="M32 10l-13 22 13 8 13-8z" fill="#fff" opacity=".9"/><path d="M32 43l-13-8 13 19 13-19z" fill="#fff" opacity=".7"/>',
  SOL: '<circle cx="32" cy="32" r="32" fill="#111"/><g fill="#14F195"><path d="M20 22h26l-4 5H16z"/><path d="M16 30h26l4 5H20z" fill="#9945FF"/><path d="M20 38h26l-4 5H16z" fill="#19D3C5"/></g>',
};

/** Two more Solana wallets in the connect list, for the picture only (never clicked). */
async function moreWallets(page: Page) {
  const list = [
    { name: 'Backpack', icon: svgData('backpack.svg') },
    { name: 'OKX Wallet', icon: svgData('okx.svg') },
  ];
  await page.addInitScript((wallets) => {
    for (const { name, icon } of wallets) {
      const std = {
        version: '1.0.0',
        name,
        icon,
        chains: ['solana:mainnet'],
        accounts: [],
        features: {
          'standard:connect': { version: '1.0.0', connect: async () => ({ accounts: [] }) },
          'standard:events': { version: '1.0.0', on: () => () => {} },
          'solana:signMessage': { version: '1.0.0', signMessage: async () => [] },
          'solana:signAndSendTransaction': { version: '1.0.0', signAndSendTransaction: async () => [] },
        },
      };
      const register = (api: { register: (w: unknown) => void }) => api.register(std);
      window.addEventListener('wallet-standard:app-ready', (e) =>
        register((e as CustomEvent).detail as { register: (w: unknown) => void }),
      );
      window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
    }
  }, list);
}

async function logos(page: Page) {
  await page.route('**/logos/*', (route) => {
    const coin = decodeURIComponent(route.request().url().split('/').pop() ?? '');
    const body = COIN[coin];
    return body
      ? route.fulfill({
          contentType: 'image/svg+xml',
          body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`,
        })
      : route.fulfill({ status: 404, body: '' });
  });
}

const shot = (page: Page, name: string) => page.screenshot({ path: join(OUT, `${name}.png`) });

/** Where things are on each screen (CSS px of the 1440x900 viewport), for the video's zooms and highlights. */
const boxes: Record<string, Record<string, { x: number; y: number; w: number; h: number }>> = {};
async function mark(page: Page, screen: string, marks: Record<string, string | [string, string]>) {
  const out: (typeof boxes)[string] = {};
  for (const [name, sel] of Object.entries(marks)) {
    const [a, b] = Array.isArray(sel) ? sel : [sel, sel];
    const p = await page.locator(a).first().boundingBox();
    const q = await page.locator(b).first().boundingBox();
    if (!p || !q) throw new Error(`${screen}: ${name} not on screen`);
    const x = Math.min(p.x, q.x),
      y = Math.min(p.y, q.y);
    out[name] = {
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(Math.max(p.x + p.width, q.x + q.width) - x),
      h: Math.round(Math.max(p.y + p.height, q.y + q.height) - y),
    };
  }
  boxes[screen] = out;
}

test('promo screens', async ({ page }) => {
  test.setTimeout(180_000);
  const sol = testSolanaWallet();
  const hl = await mockHyperliquid(page, { empty: true, solLamports: '2450000000' });
  await fakeWallet(page, {
    address: ADDRESS,
    solana: sol.address,
    solanaSignature: sol.signature,
    icon: svgData('phantom.svg'),
  });
  await moreWallets(page);
  await logos(page);
  await page.addStyleTag({ content: '*{caret-color:transparent!important}' }).catch(() => {});

  // 1. home
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await shot(page, 'home');
  await mark(page, 'home', { hero: '.hero', ticket: ['#tk-side', '#tk-amt'] });

  // 2. connect: Solana wallets
  await page.goto('/trade/BTC');
  await page.waitForTimeout(1200);
  await page.locator('#connect').click();
  await expect(page.locator('#swl button[data-sol="Phantom"]')).toBeVisible();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await shot(page, 'connect');
  await mark(page, 'connect', { dialog: '#wallets', list: '#swl' });
  await page.locator('#swl button[data-sol="Phantom"]').click();
  await expect(page.locator('#walletBtn')).toBeVisible();

  // 3. deposit SOL: balance, amount, where every bit goes
  await page.goto('/portfolio');
  await expect(page.locator('#solBal')).toContainText('2.45');
  await page.locator('#solAmt').fill('0.5');
  await expect(page.locator('#solBreakdown')).toContainText('Coinside feeFree');
  await page.locator('#deposit').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const el = document.querySelector('#deposit');
    if (el) window.scrollBy(0, el.getBoundingClientRect().top - 80);
  });
  await page.locator('#solAmt').blur();
  await page.waitForTimeout(500);
  await shot(page, 'deposit');
  await mark(page, 'deposit', {
    panel: '#deposit',
    balance: '#solBal',
    amount: '#solAmt',
    breakdown: '#solBreakdown',
    send: '#solDeposit',
  });

  // 4. sent, then arrived
  await page.locator('#solDeposit').click();
  await expect(page.locator('#depStatus')).toContainText('on its way');
  await page.goto('/trade/BTC');
  await page.waitForTimeout(800);
  // what 0.5 SOL becomes after Unit's fee, arriving over the socket as Hyperliquid sends it
  const arrived = {
    ...SPOT,
    balances: SPOT.balances.map((b) =>
      b.coin === 'USOL' ? { ...b, total: '0.485', entryNtl: '90.81' } : { ...b, total: '0.0', hold: '0.0' },
    ),
  };
  hl.push('spotState', { user: sol.account, spotState: arrived });
  await expect(page.locator('#depToast')).toContainText('arrived in your account as USOL');
  await page.waitForTimeout(800);
  await shot(page, 'arrived');
  await mark(page, 'arrived', { toast: '#depToast' });
  await page
    .locator('#depToast .dep-x')
    .click()
    .catch(() => {});
  hl.fund(sol.account);

  // 5. enable trading once, then Max at 10x
  await page.reload();
  await page.waitForTimeout(1500);
  await page.locator('#o-cta').click();
  await page.locator('#ack').check();
  await page.locator('#enableGo').click();
  await expect(page.locator('#enable')).toBeHidden();
  await page.locator('#o-lev button[data-lev="10"]').click();
  await page.locator('#o-max').click();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(600);
  await shot(page, 'terminal');
  await mark(page, 'terminal', {
    order: ['#o-side', '#o-cta'],
    amount: ['#o-amt', '#o-max'],
    lev: '#o-lev',
    chart: '#cbox',
    positions: '#tv-mypos',
  });

  // 6. a price in the book becomes a limit order
  const row = page.locator('#ob .ob-r.b').nth(2);
  await row.click();
  await expect(page.locator('#o-type button', { hasText: 'Limit' })).toHaveAttribute('aria-pressed', 'true');
  await row.hover();
  await page.waitForTimeout(400);
  await shot(page, 'book');
  await mark(page, 'book', { book: '#ob', row: '#ob .ob-r.b >> nth=2', price: '#o-px', type: '#o-type' });

  // 7. close: half, at a limit price, confirmed first
  await page.locator('#tv-mypos [data-close="SOL"]').scrollIntoViewIfNeeded();
  await page.locator('#tv-mypos [data-close="SOL"]').click();
  await page.locator('#closeKind button', { hasText: 'Limit' }).click();
  await page.locator('#closePct button', { hasText: '50%' }).click();
  await page.locator('#closePx').fill('195');
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await shot(page, 'close');
  await mark(page, 'close', { dialog: '#posDialog' });
  await page.keyboard.press('Escape');

  // 8. take profit and stop loss
  await page.locator('#tv-mypos [data-tpsl="SOL"]').click();
  await page.locator('#tpPx').fill('210');
  await page.locator('#slPx').fill('172');
  await page.locator('#slPx').blur();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await shot(page, 'tpsl');
  await mark(page, 'tpsl', { dialog: '#posDialog' });
  await page.keyboard.press('Escape');

  // 9. on a phone
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/trade/SOL');
  await page.waitForTimeout(1500);
  await shot(page, 'phone');
  writeFileSync(join(OUT, 'boxes.json'), JSON.stringify(boxes, null, 2));
});
