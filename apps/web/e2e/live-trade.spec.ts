/**
 * Trading from Coinside (H3) in the live edition: enable trading once (the wallet approves a trading key), then
 * orders, take profit and stop loss, close and cancel go to Hyperliquid signed by that key. Hyperliquid is the
 * fixture mock, which records every signed action; the wallet is pretend.
 */
import { expect, test, type Page } from '@playwright/test';
import { ADDRESS } from './hl-fixtures';

const SOL_ADDRESS = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
import {
  TEST_BLOCKHASH,
  UNIT_DEPOSIT_ADDRESS,
  UNIT_WITHDRAW_ADDRESS,
  mockHyperliquid,
  type HlMock,
} from './hl-mock';
import { SPOT } from './hl-fixtures';
import { base58Encode, transferTx } from '../src/wallet/solana-tx';
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
  // Close never acts at once: it opens the position dialog with the size, the price and the P&L
  const before = orders(hl).length;
  await page.locator('#tv-mypos [data-close="SOL"]').click();
  const dlg = page.locator('#posDialog');
  await expect(dlg).toContainText('SOL long 5x');
  await expect(page.locator('#closeSum')).toContainText('Closing10.5 SOL');
  expect(orders(hl)).toHaveLength(before);
  // half, at market
  await page.locator('#closePct button', { hasText: '50%' }).click();
  await expect(page.locator('#closeSum')).toContainText('Closing5.25 SOL');
  await page.locator('#closeGo').click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('#o-cta-msg')).toHaveText('Closed 50% of your SOL long.');
  expect(orders(hl).at(-1)!.action).toMatchObject({
    orders: [{ a: 2, b: false, s: '5.25', r: true, t: { limit: { tif: 'Ioc' } } }],
  });
  // all of it, with a limit price: it rests until the price gets there
  await page.locator('#tv-mypos [data-close="SOL"]').click();
  await page.locator('#closeKind button', { hasText: 'Limit' }).click();
  await page.locator('#closePx').fill('195');
  await expect(page.locator('#closeGo')).toHaveText('Place limit close (100%)');
  await page.locator('#closeGo').click();
  await expect(page.locator('#o-cta-msg')).toContainText('Limit close placed for your SOL long at $195');
  expect(orders(hl).at(-1)!.action).toMatchObject({
    orders: [{ a: 2, b: false, p: '195', s: '10.5', r: true, t: { limit: { tif: 'Gtc' } } }],
  });
  // take profit and stop loss on the open position: a wrong-side price says why, a good pair is set
  await page.locator('#tv-mypos [data-tpsl="SOL"]').click();
  await page.locator('#tpPx').fill('210');
  await page.locator('#slPx').fill('190');
  await page.locator('#tpslGo').click();
  await expect(page.locator('#posMsg')).toContainText('Stop loss must be below the price now');
  await page.locator('#slPx').fill('160');
  await page.locator('#tpslGo').click();
  await expect(page.locator('#posDialog')).toBeHidden();
  await expect(page.locator('#o-cta-msg')).toContainText('Take profit and stop loss set on your SOL long');
  const tpsl = orders(hl).at(-1)!.action as unknown as {
    grouping: string;
    orders: Array<Record<string, unknown>>;
  };
  expect(tpsl.grouping).toBe('positionTpsl');
  expect(tpsl.orders).toMatchObject([
    { a: 2, b: false, r: true, s: '10.5', t: { trigger: { triggerPx: '210', tpsl: 'tp', isMarket: true } } },
    { a: 2, b: false, r: true, s: '10.5', t: { trigger: { triggerPx: '160', tpsl: 'sl', isMarket: true } } },
  ]);

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
  await expect(panel.locator('a[href*="hyperliquid"]')).toHaveCount(0);
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
  // a valid amount from a wallet that can send: Deposit is ready
  await expect(page.locator('#solDeposit')).toBeEnabled();
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
  await expect(page.locator('#moveMsg')).toHaveText(
    'Moved $480.12 to your trading balance. You can trade now.',
  );
  // and a notice says so, with the way to trade
  await expect(page.locator('#notice')).toContainText('$480.12 is in your trading balance');
  await expect(page.locator('#notice a')).toHaveAttribute('href', '/trade/SOL');
  // the USOL is sold on USOL/USDC (spot asset 10000 + 156) with the trading key...
  expect(hl.exchange.find((e) => e.action.type === 'order')!.action).toMatchObject({
    grouping: 'na',
    // sold at the best bid, so a small deposit isn't pushed under $10 by slippage
    orders: [{ a: 10156, b: false, p: '186.9', s: '1.5', r: false, t: { limit: { tif: 'Ioc' } } }],
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

test('a Solana account with no SOL shows its full address, and another account is one click away', async ({
  page,
}) => {
  const sol = testSolanaWallet();
  await mockHyperliquid(page, { empty: true, solLamports: '0' });
  await fakeWallet(page, { address: ADDRESS, solana: sol.address, solanaSignature: sol.signature });
  await page.goto('/portfolio');
  await page.locator('#connect').click();
  await page.locator('#swl button[data-sol="Phantom"]').click();
  await expect(page.locator('#solAddr')).toHaveText(sol.address);
  await expect(page.locator('#solEmpty')).toContainText('Solana shows no SOL at this address');
  await expect(page.locator('.sol-addr a')).toHaveAttribute(
    'href',
    `https://solscan.io/account/${sol.address}`,
  );
  await page.locator('#solOther').click();
  await expect(page.locator('#wallets')).toBeVisible();
  await expect(page.locator('#walletBtn')).toHaveCount(0);
});

test("deposit SOL from the Solana wallet to the account's Unit address, within the minimum and the cap", async ({
  page,
}) => {
  const sol = testSolanaWallet();
  const hl = await mockHyperliquid(page, { empty: true });
  const wallet = await fakeWallet(page, {
    address: ADDRESS,
    solana: sol.address,
    solanaSignature: sol.signature,
  });
  await page.goto('/portfolio');
  await page.locator('#connect').click();
  await page.locator('#swl button[data-sol="Phantom"]').click();
  await expect(page.locator('#solBal')).toContainText('0.2');

  // below Unit's minimum, above the cap, more than the wallet holds: each says why, and the button stays off
  const amt = page.locator('#solAmt');
  const go = page.locator('#solDeposit');
  await amt.fill('0.1');
  await expect(page.locator('#solMsg')).toContainText('at least 0.12 SOL');
  await expect(go).toBeDisabled();
  await amt.fill('1.5');
  await expect(page.locator('#solMsg')).toContainText('at most 1 SOL');
  await amt.fill('0.199');
  await expect(page.locator('#solMsg')).toContainText('Keep 0.002 SOL');
  await expect(go).toBeDisabled();

  // a closed prompt sends nothing and says so
  await amt.fill('0.15');
  await expect(go).toBeEnabled();
  // before sending, where every bit goes: Unit's fee and what arrives
  await expect(page.locator('#solBreakdown')).toContainText('You send0.15 SOL');
  await expect(page.locator('#solBreakdown')).toContainText('Arrives as, about0.135 SOL');
  await expect(page.locator('#solBreakdown')).toContainText('Coinside feeFree');
  await wallet.rejectSign();
  await go.click();
  await expect(page.locator('#solMsg')).toHaveText('You closed the request in Phantom. Nothing was sent.');
  expect(await wallet.sentTransactions()).toHaveLength(0);

  // a good amount: the wallet signs and sends a plain transfer to the Unit deposit address
  await go.click();
  await expect(page.locator('#solMsg')).toContainText('Sent 0.15 SOL');
  await expect(page.locator('#solMsg a')).toHaveAttribute('href', /^https:\/\/solscan\.io\/tx\//);
  const [tx] = await wallet.sentTransactions();
  expect(Buffer.from(tx!).toString('hex')).toBe(
    Buffer.from(transferTx(sol.address, UNIT_DEPOSIT_ADDRESS, 150_000_000n, TEST_BLOCKHASH)).toString('hex'),
  );

  // the deposit is followed: on its way, Unit's own status, then arrived as USOL, on every page
  const status = page.locator('#depStatus');
  await expect(status).toContainText('Deposit of 0.15 SOL on its way');
  await expect(status).toContainText('The SOL has already left your wallet');
  await expect(status).toContainText('Enable trading (once), and Move to trading balance');
  await expect(page.locator('#solMsg')).toContainText('Your wallet balance went down by that much');
  const sig = base58Encode(new Uint8Array(64).fill(9));
  hl.unitOps = [{ state: 'waitForSrcTxFinalization', sourceTxHash: `${sig}:0` }];
  await expect(status).toContainText('Waiting for Solana to finalize the transfer.', { timeout: 15_000 });
  await page.goto('/trade/SOL');
  await expect(page.locator('#depToast')).toContainText('Deposit of 0.15 SOL on its way');
  hl.fund(sol.account);
  await expect(page.locator('#depToast')).toContainText('0.15 SOL arrived in your account');
  await page.locator('#depToast a').click();
  await expect(page).toHaveURL(/\/portfolio#deposit$/);
  await expect(page.locator('#depStatus')).toContainText('Deposit complete: 0.15 SOL arrived');
  await page.locator('#depStatus .dep-x').click();
  await expect(page.locator('#depStatus')).toHaveCount(0);
});

test('Max fills the usable margin, and a price in the order book becomes a limit order', async ({ page }) => {
  await connected(page);
  // Max: what the account can use ($744.26), less 0.1% per 1x of leverage for the trading fee, and never a
  // position over the $1,000 one order may open while trading is new
  await page.locator('#o-lev button[data-lev="5"]').click();
  await page.locator('#o-max').click();
  await expect(page.locator('#o-amt')).toHaveValue('200.00');
  await expect(page.locator('#o-cta-msg')).not.toContainText('at most');
  await page.locator('#o-lev button[data-lev="20"]').click();
  await page.locator('#o-max').click();
  await expect(page.locator('#o-amt')).toHaveValue('50.00');

  // a click on a bid in the book: Limit, at that price, ready to place
  const row = page.locator('#ob .ob-r.b').first();
  const px = await row.getAttribute('data-px');
  await row.click();
  await expect(page.locator('#o-type button', { hasText: 'Limit' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#o-px')).toHaveValue(px!);
  await expect(page.locator('#o-px')).toBeFocused();
  // and an ask, by keyboard on its price
  const ask = page.locator('#ob .ob-r.a').last();
  const askPx = await ask.getAttribute('data-px');
  await ask.locator('.ob-px').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#o-px')).toHaveValue(askPx!);
});

test('withdraw to the Solana wallet: trading balance to spot, USDC to USOL, USOL to Unit', async ({
  page,
}) => {
  const sol = testSolanaWallet();
  const hl = await mockHyperliquid(page);
  await fakeWallet(page, { address: ADDRESS, solana: sol.address, solanaSignature: sol.signature });
  await page.goto('/portfolio');
  await page.locator('#connect').click();
  await page.locator('#swl button[data-sol="Phantom"]').click();
  await expect(page.locator('#walletBtn')).toBeVisible();

  const panel = page.locator('#withdraw');
  // where it goes, and what can go: $744.26 withdrawable plus $480.12 free spot USDC
  await expect(page.locator('#wdTo')).toHaveText(sol.address);
  await expect(page.locator('#wdBal')).toContainText('$1,224.38');
  // the trading key buys the SOL, so trading must be on
  await expect(page.locator('#wdGo')).toHaveText('Enable trading first');
  await page.locator('#wdGo').click();
  await page.locator('#ack').check();
  await page.locator('#enableGo').click();
  await expect(page.locator('#enable')).toBeHidden();

  // under Unit's 0.12 SOL (about $22.71 at $187.23), and over 1 SOL: each says why
  await page.locator('#wdAmt').fill('10');
  await expect(page.locator('#wdMsg')).toContainText('Withdraw at least $22.71');
  await expect(page.locator('#wdGo')).toBeDisabled();
  await page.locator('#wdAmt').fill('300');
  await expect(page.locator('#wdMsg')).toContainText('at most 1 SOL');
  // Max stays within the cap
  await page.locator('#wdMax').click();
  await expect(page.locator('#wdAmt')).toHaveValue('187.23');

  // spot holds only $5: the rest comes from the trading balance first
  hl.setSpot({ balances: [{ ...SPOT.balances[1]!, total: '5.0', hold: '0.0' }] });
  await page.locator('#wdAmt').fill('50');
  await expect(panel.locator('#wdBreakdown')).toContainText('Coinside feeFree');
  await page.locator('#wdGo').click();
  await expect(page.locator('#wdMsg')).toContainText('Sent 0.26 SOL to Unit');
  await expect(page.locator('#notice')).toContainText('0.26 SOL is on its way to your Solana wallet');

  const sent = hl.exchange.map((e) => e.action);
  const move = sent.find((a) => a.type === 'usdClassTransfer')!;
  // 0.26 USOL at 1% over the 187.3 ask needs $49.19 (rounded up); spot had $5
  expect(move).toMatchObject({ amount: '44.19', toPerp: false });
  const buy = sent.find((a) => a.type === 'order')!;
  expect((buy.orders as unknown[])[0]).toMatchObject({ a: 10156, b: true, p: '189.17', s: '0.26', r: false });
  expect(sent.find((a) => a.type === 'spotSend')).toMatchObject({
    destination: UNIT_WITHDRAW_ADDRESS,
    token: 'USOL:0x000000000000000000000000000000fe',
    amount: '0.26',
  });
  // in that order
  expect(sent.map((a) => a.type).filter((t) => t !== 'approveAgent')).toEqual([
    'usdClassTransfer',
    'order',
    'spotSend',
  ]);
});

test('USOL already in the account goes straight to the Solana wallet, one signature, nothing bought', async ({
  page,
}) => {
  const sol = testSolanaWallet();
  const hl = await mockHyperliquid(page);
  hl.setSpot({ balances: [{ ...SPOT.balances[0]!, total: '0.2409', hold: '0.0' }] });
  await fakeWallet(page, { address: ADDRESS, solana: sol.address, solanaSignature: sol.signature });
  await page.goto('/portfolio');
  await page.locator('#connect').click();
  await page.locator('#swl button[data-sol="Phantom"]').click();
  await expect(page.locator('#walletBtn')).toBeVisible();

  await expect(page.locator('#wdUsolBox')).toContainText('You have 0.2409 SOL in your account');
  await expect(page.locator('#wdSol')).toHaveText('0.2409');
  await page.locator('#wdUsol').click();
  await expect(page.locator('#wdMsg')).toContainText('Sent 0.24 SOL to Unit');
  const sent = hl.exchange.map((e) => e.action);
  expect(sent.find((a) => a.type === 'order')).toBeUndefined();
  expect(sent.find((a) => a.type === 'spotSend')).toMatchObject({
    destination: UNIT_WITHDRAW_ADDRESS,
    token: 'USOL:0x000000000000000000000000000000fe',
    amount: '0.24',
  });
});
