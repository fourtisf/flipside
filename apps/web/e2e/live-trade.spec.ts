/**
 * Trading from Coinside (H3) in the live edition: enable trading once (the wallet approves a trading key), then
 * orders, take profit and stop loss, close and cancel go to Hyperliquid signed by that key. Hyperliquid is the
 * fixture mock, which records every signed action; the wallet is pretend.
 */
import { expect, test, type Page } from '@playwright/test';
import { ADDRESS } from './hl-fixtures';

const SOL_ADDRESS = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
import { mockHyperliquid, type HlMock } from './hl-mock';
import { fakeWallet, testSolanaWallet, type FakeWallet } from './wallet-mock';

async function connected(page: Page): Promise<{ hl: HlMock; wallet: FakeWallet }> {
  const hl = await mockHyperliquid(page);
  const wallet = await fakeWallet(page, { address: ADDRESS });
  await page.goto('/trade/SOL');
  await page.locator('#connect').click();
  await page.locator('#wl button[data-wallet="app.phantom"]').click();
  await expect(page.locator('#walletBtn')).toBeVisible();
  return { hl, wallet };
}

async function enable(page: Page) {
  await expect(page.locator('#o-cta')).toHaveText('Enable trading');
  await page.locator('#o-cta').click();
  const dialog = page.locator('#enable');
  await expect(dialog).toContainText('can never withdraw or move your funds');
  await expect(dialog).toContainText('Coinside charges no fee');
  await expect(page.locator('#enableGo')).toBeDisabled();
  await page.locator('#ack').check();
  await page.locator('#enableGo').click();
  await expect(dialog).toBeHidden();
}

const orders = (hl: HlMock) => hl.exchange.filter((e) => e.action.type === 'order');

test('enable trading once, then a market long goes to Hyperliquid signed by the trading key', async ({
  page,
}) => {
  const { hl, wallet } = await connected(page);
  await enable(page);

  // the wallet signed one thing: approving the trading key, on its own chain, with no pop-up per order after that
  const signed = await wallet.signed();
  expect(signed).toHaveLength(1);
  expect(signed[0]!.primaryType).toBe('HyperliquidTransaction:ApproveAgent');
  expect(signed[0]!.domain.chainId).toBe(42161);
  expect(hl.exchange[0]!.action).toMatchObject({
    type: 'approveAgent',
    agentName: 'coinside',
    signatureChainId: '0xa4b1',
  });

  await expect(page.locator('#o-cta')).toHaveText('Long SOL');
  await expect(page.locator('#o-sum')).toContainText('Coinside feeFree');
  await page.locator('#o-amt').fill('100');
  await page.locator('#o-lev button[data-lev="5"]').click();
  await page.locator('#o-cta').click();
  await expect(page.locator('#o-cta-msg')).toHaveText('Filled 2.67 SOL at $187.25.');

  const lev = hl.exchange.find((e) => e.action.type === 'updateLeverage')!;
  expect(lev.action).toMatchObject({ asset: 2, isCross: true, leverage: 5 });
  expect(orders(hl)[0]!.action).toMatchObject({
    grouping: 'na',
    orders: [{ a: 2, b: true, p: '189.1', s: '2.67', r: false, t: { limit: { tif: 'Ioc' } } }],
  });
  // Coinside charges no fee: orders carry no builder code
  expect(orders(hl)[0]!.action.builder).toBeUndefined();
  expect(await wallet.signed()).toHaveLength(1);

  // a reload keeps trading on: the key stays in this browser
  await page.reload();
  await expect(page.locator('#o-cta')).toHaveText('Long SOL');
});

test('short with take profit and stop loss, a limit order, and plain reasons when an order cannot go', async ({
  page,
}) => {
  const { hl } = await connected(page);
  await enable(page);
  await page.locator('#o-side [data-side="short"]').click();
  await page.locator('#o-amt').fill('2');
  await page.locator('#o-lev button[data-lev="2"]').click();
  await expect(page.locator('#o-cta')).toBeDisabled();
  await expect(page.locator('#o-cta-msg')).toContainText('at least $10');

  await page.locator('#o-amt').fill('50');
  await page.locator('#o-lev button[data-lev="10"]').click();
  await page.locator('#o-tpsl').click();
  await page.locator('#o-tp').fill('30');
  await page.locator('#o-sl').fill('20');
  await expect(page.locator('#o-cta')).toHaveText('Short SOL');
  await page.locator('#o-cta').click();
  await expect(page.locator('#o-cta-msg')).toContainText('Filled');
  const o = orders(hl).at(-1)!.action as unknown as {
    grouping: string;
    orders: Array<Record<string, unknown>>;
  };
  expect(o.grouping).toBe('normalTpsl');
  expect(o.orders).toHaveLength(3);
  expect(o.orders[1]).toMatchObject({ b: true, r: true, t: { trigger: { tpsl: 'tp' } } });
  expect(o.orders[2]).toMatchObject({ b: true, r: true, t: { trigger: { tpsl: 'sl' } } });

  // a limit order rests on the book
  await page.locator('#o-tpsl').click();
  await page.locator('#o-type button', { hasText: 'Limit' }).click();
  await page.locator('#o-px').fill('195');
  await page.locator('#o-cta').click();
  await expect(page.locator('#o-cta-msg')).toHaveText('Order placed. It fills when the price gets there.');
  expect(orders(hl).at(-1)!.action).toMatchObject({
    orders: [{ b: false, p: '195', t: { limit: { tif: 'Gtc' } } }],
  });

  // Hyperliquid's errors come back in plain words
  hl.failNext('Insufficient margin to place order. asset=2');
  await page.locator('#o-cta').click();
  await expect(page.locator('#o-cta-msg')).toHaveText(
    'Not enough margin for this order. Lower the amount or the leverage.',
  );
});

test('close a position and cancel an order from the terminal and from Portfolio', async ({ page }) => {
  const { hl } = await connected(page);
  await enable(page);
  // the account's positions and orders show above the order book
  await expect(page.locator('#tv-mypos')).toContainText('SOL');
  await page.locator('#tv-mypos [data-close="SOL"]').click();
  await expect(page.locator('#o-cta-msg')).toHaveText('Closed your SOL long.');
  expect(orders(hl).at(-1)!.action).toMatchObject({
    orders: [{ a: 2, b: false, s: '10.5', r: true, t: { limit: { tif: 'Ioc' } } }],
  });

  await page.goto('/portfolio');
  await page.locator('#pf-orders [data-cancel="9001"]').click();
  await expect
    .poll(() => hl.exchange.find((e) => e.action.type === 'cancel')?.action)
    .toMatchObject({
      cancels: [{ a: 2, o: 9001 }],
    });
});

test('a closed wallet prompt during setup says so; the wallet menu turns trading off', async ({ page }) => {
  const { wallet } = await connected(page);
  await page.locator('#o-cta').click();
  await page.locator('#ack').check();
  await wallet.reject();
  await page.locator('#enableGo').click();
  await expect(page.locator('#enable')).toContainText(
    'You closed the request in Phantom. Nothing was signed.',
  );
  await page.locator('#enableGo').click();
  await expect(page.locator('#enable')).toBeHidden();
  await expect(page.locator('#o-cta')).toHaveText('Long SOL');

  await page.locator('#walletBtn').click();
  await page.locator('#tradingOff').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#o-cta')).toHaveText('Enable trading');
});

test('an empty account is sent to Deposit in its own Coinside account, and trades once funds arrive', async ({
  page,
}) => {
  // Hyperliquid refuses every action, approving a trading key too, from an address that has never deposited
  const hl = await mockHyperliquid(page, { empty: true });
  await fakeWallet(page, { address: ADDRESS, solana: SOL_ADDRESS });
  await page.goto('/trade/SOL');
  await page.locator('#connect').click();
  // this person already has a 0x Hyperliquid account: the 0x list is one click away
  await page.locator('#evmToggle').click();
  await page.locator('#wl button[data-wallet="app.phantom"]').click();
  await expect(page.locator('#o-cta')).toHaveText('Deposit first');
  await page.locator('#o-cta').click();

  // the person's own account on Coinside, at its Deposit panel: never another site
  await expect(page).toHaveURL(/\/portfolio#deposit$/);
  const panel = page.locator('#deposit');
  await expect(panel).toContainText('Your account is empty');
  await expect(panel.locator('a')).toHaveCount(0);
  await expect(page.locator('main a[href*="hyperliquid.xyz"]')).toHaveCount(0);
  await expect(page.locator('#moveBtn')).toHaveText('Nothing to move yet');
  await expect(page.locator('#moveBtn')).toBeDisabled();
  expect(hl.exchange).toHaveLength(0);

  // the SOL in the Solana side of the same wallet shows here: an empty account came to deposit, so the wallet
  // is asked for its Solana side right away, with no button to find
  const bal = page.locator('#solBal');
  await expect(bal).toContainText('Phantom, Solana');
  await expect(bal).toContainText('7xKX…gAsU');
  await expect(bal).toContainText('0.2');
  await expect(bal).toContainText('≈ $37.45');
  // Max leaves 0.002 SOL for the network fee
  await page.locator('#solMax').click();
  await expect(page.locator('#solAmt')).toHaveValue('0.198');
  await expect(page.locator('#solDeposit')).toBeDisabled();
  // a reload reconnects it without asking again
  await page.reload();
  await expect(page.locator('#solBal')).toContainText('0.2');

  // SOL lands as USOL (and some USDC): enable trading, then one click makes it tradable
  hl.fund(ADDRESS);
  await expect(panel).not.toContainText('Your account is empty');
  await expect(panel).toContainText('1.5');
  await expect(page.locator('#moveBtn')).toHaveText('Enable trading first');
  await page.locator('#moveBtn').click();
  await page.locator('#ack').check();
  await page.locator('#enableGo').click();
  await expect(page.locator('#enable')).toBeHidden();
  await expect(page.locator('#moveBtn')).toHaveText('Move to trading balance');
  await page.locator('#moveBtn').click();
  await expect(page.locator('#moveMsg')).toHaveText('Moved $480.12 to your trading balance.');
  // the USOL is sold on USOL/USDC (spot asset 10000 + 156) with the trading key...
  expect(hl.exchange.find((e) => e.action.type === 'order')!.action).toMatchObject({
    grouping: 'na',
    orders: [{ a: 10156, b: false, p: '185.22', s: '1.5', r: false, t: { limit: { tif: 'Ioc' } } }],
  });
  // ...and the free spot USDC moves to perps, signed by the wallet
  expect(hl.exchange.find((e) => e.action.type === 'usdClassTransfer')!.action).toMatchObject({
    amount: '480.12',
    toPerp: true,
  });

  // the wallet menu goes to the same place
  await page.goto('/trade/SOL');
  await page.locator('#walletBtn').click();
  await page.locator('#depositBtn').click();
  await expect(page).toHaveURL(/\/portfolio#deposit$/);
});

test('Bitget: its older Solana provider is found, asked once, and its SOL shows in Deposit', async ({
  page,
}) => {
  await mockHyperliquid(page, { empty: true });
  await fakeWallet(page, {
    address: ADDRESS,
    name: 'Bitget Wallet',
    rdns: 'com.bitget.web3',
    solana: SOL_ADDRESS,
    legacySolana: 'bitkeep',
  });
  await page.goto('/portfolio');
  await page.locator('#connect').click();
  await page.locator('#evmToggle').click();
  await page.locator('#wl button[data-wallet="com.bitget.web3"]').click();
  const bal = page.locator('#solBal');
  await expect(bal).toContainText('Bitget Wallet, Solana');
  await expect(bal).toContainText('0.2');
  const prompts = () =>
    page.evaluate(() => (window as unknown as { __solanaPrompts?: number }).__solanaPrompts);
  expect(await prompts()).toBe(1);

  // a reload reconnects the wallet it remembers, asking only "if trusted": no second prompt
  await page.reload();
  await expect(page.locator('#solBal')).toContainText('0.2');
  expect(await prompts()).toBeUndefined();
});

test('one Connect wallet covers both accounts: the 0x one, then the Solana one with the SOL', async ({
  page,
}) => {
  await mockHyperliquid(page);
  await fakeWallet(page, { address: ADDRESS, solana: SOL_ADDRESS });
  await page.goto('/trade/SOL');
  await page.locator('#connect').click();
  await page.locator('#evmToggle').click();
  await page.locator('#wl button[data-wallet="app.phantom"]').click();
  await expect(page.locator('#walletBtn')).toBeVisible();
  // a funded account (no Deposit prompt of its own): the SOL is already there when Portfolio opens
  await page.goto('/portfolio');
  await expect(page.locator('#solBal')).toContainText('0.2');
});

test('sign in with a Solana wallet alone: two signatures open a Hyperliquid account, then trade', async ({
  page,
}) => {
  const sol = testSolanaWallet();
  const hl = await mockHyperliquid(page);
  const wallet = await fakeWallet(page, {
    address: ADDRESS,
    solana: sol.address,
    solanaSignature: sol.signature,
  });
  await page.goto('/trade/SOL');
  await page.locator('#connect').click();
  // Solana wallets come first; no 0x wallet is involved
  await expect(page.locator('#wl')).toBeHidden();
  await page.locator('#swl button[data-sol="Phantom"]').click();
  const short = `${sol.address.slice(0, 4)}…${sol.address.slice(-4)}`;
  await expect(page.locator('#walletBtn')).toHaveText(short);
  // signed twice the first time (the second checks the wallet signs the same way); no 0x signature at all
  expect(await wallet.solanaSigns()).toBe(2);
  expect(await wallet.signed()).toHaveLength(0);
  // the account read is the one derived from the Solana signature
  await expect
    .poll(() => hl.info.some((i) => i.type === 'clearinghouseState' && i.user === sol.account))
    .toBe(true);

  // a reload reconnects with no signature: the account address is remembered on this device
  await page.reload();
  await expect(page.locator('#walletBtn')).toHaveText(short);
  expect(await wallet.solanaSigns()).toBe(0);

  // enabling trading asks the Solana wallet to sign once more; the derived key approves the trading key
  await page.locator('#o-cta').click();
  await page.locator('#ack').check();
  await page.locator('#enableGo').click();
  await expect(page.locator('#enable')).toBeHidden();
  expect(await wallet.solanaSigns()).toBe(1);
  expect(hl.exchange.find((e) => e.action.type === 'approveAgent')!.action).toMatchObject({
    agentName: 'coinside',
  });
  await page.locator('#o-amt').fill('100');
  await page.locator('#o-cta').click();
  await expect(page.locator('#o-cta-msg')).toContainText('Filled');
  expect(await wallet.signed()).toHaveLength(0);

  // the wallet menu shows the Solana address and the trading account under it
  await page.locator('#walletBtn').click();
  await expect(page.locator('#walletMenu')).toContainText('Phantom, Solana');
  await expect(page.locator('#walletMenu')).toContainText(sol.account.slice(0, 6));
});

test('a Solana sign-in the person closes says so, and nothing is opened', async ({ page }) => {
  const sol = testSolanaWallet();
  await mockHyperliquid(page);
  const wallet = await fakeWallet(page, {
    address: ADDRESS,
    solana: sol.address,
    solanaSignature: sol.signature,
  });
  await page.goto('/trade/SOL');
  await page.locator('#connect').click();
  // closing the connect prompt
  await wallet.reject();
  await page.locator('#swl button[data-sol="Phantom"]').click();
  await expect(page.locator('#wErr')).toContainText('You closed the request in Phantom');
  // connecting, then closing the signature prompt
  await wallet.rejectSign();
  await page.locator('#swl button[data-sol="Phantom"]').click();
  await expect(page.locator('#wErr')).toHaveText('You closed the request in Phantom. Nothing was signed.');
  await expect(page.locator('#walletBtn')).toHaveCount(0);
});
