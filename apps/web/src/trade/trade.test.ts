import { approveAgent, order, type OrderSuccessResponse } from '@nktkas/hyperliquid/api/exchange';
import { createL1ActionHash } from '@nktkas/hyperliquid/signing';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverTypedDataAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { META_AND_CTXS, SPOT, SPOT_META } from '../../e2e/hl-fixtures';
import { toMarkets } from '@/hl/markets';
import { toSpot, type PositionRow } from '@/wallet/account';
import { free, planSellUsol, usdcToMove, usolMarket } from './funds';
import type { Eip1193 } from '@/wallet/store';
import {
  describe as describeFill,
  explain,
  planClose,
  planOpen,
  planTpsl,
  pnlAt,
  through,
  triggerAt,
} from './orders';
import { agentSigner, newAgent, typedDataJson, walletSigner } from './signer';

const markets = Object.fromEntries(toMarkets(META_AND_CTXS).map((m) => [m.name, m]));
const SOL = markets.SOL!; // asset 2, szDecimals 2, max 20x, price 187.23
const BTC = markets.BTC!; // asset 0, szDecimals 5

describe('planOpen', () => {
  it('sends a market long as an immediate-or-cancel limit 1% above the price, size rounded down', () => {
    const r = planOpen({ m: SOL, side: 'long', margin: 100, lev: 5, type: 'market' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.orders).toEqual([
      { a: 2, b: true, p: '189.1', s: '2.67', r: false, t: { limit: { tif: 'Ioc' } } },
    ]);
    expect(r.plan.grouping).toBe('na');
    expect(r.plan.leverage).toEqual({ asset: 2, isCross: true, leverage: 5 });
    // Coinside charges no fee: no builder code on any order
    expect(r.plan).not.toHaveProperty('builder');
    expect(r.plan.orders[0]).not.toHaveProperty('builder');
  });

  it('sends a market short 1% below, and a limit order at its own price', () => {
    const short = planOpen({ m: BTC, side: 'short', margin: 50, lev: 10, type: 'market' });
    expect(short.ok && short.plan.orders[0]).toMatchObject({ b: false, p: '96152', s: '0.00514' });
    const limit = planOpen({ m: SOL, side: 'long', margin: 100, lev: 2, type: 'limit', limit: 180 });
    expect(limit.ok && limit.plan.orders[0]).toMatchObject({
      p: '180',
      s: '1.11',
      t: { limit: { tif: 'Gtc' } },
    });
  });

  it('adds take profit and stop loss as reduce-only market triggers on the other side', () => {
    const r = planOpen({ m: SOL, side: 'long', margin: 100, lev: 5, type: 'market', tp: 50, sl: 20 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.grouping).toBe('normalTpsl');
    const [, tp, sl] = r.plan.orders;
    // +50% of margin at 5x is a 10% move up; −20% is a 4% move down
    expect(tp).toMatchObject({
      a: 2,
      b: false,
      r: true,
      s: '2.67',
      t: { trigger: { isMarket: true, triggerPx: '205.95', tpsl: 'tp' } },
    });
    expect(sl).toMatchObject({ b: false, r: true, t: { trigger: { triggerPx: '179.74', tpsl: 'sl' } } });
    expect(triggerAt(100, 5, 'short', 50)).toBeCloseTo(90);
  });

  it('says plainly why an order cannot go', () => {
    const go = (o: Partial<Parameters<typeof planOpen>[0]>) =>
      planOpen({ m: SOL, side: 'long', margin: 100, lev: 5, type: 'market', ...o });
    expect(go({ margin: 0 })).toEqual({ ok: false, reason: 'Enter an amount.' });
    expect(go({ margin: 2, lev: 2 })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('at least $10'),
    });
    expect(go({ margin: 600, lev: 2 })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('at most a $1,000'),
    });
    expect(go({ available: 50 })).toMatchObject({
      ok: false,
      reason: 'You have $50 available. Deposit more or lower the amount.',
    });
    expect(go({ type: 'limit', limit: 0 })).toEqual({ ok: false, reason: 'Enter a limit price.' });
    expect(go({ sl: 120 })).toMatchObject({ ok: false });
    expect(go({ m: { ...SOL, px: 0 } })).toEqual({ ok: false, reason: 'No price yet. Wait a moment.' });
  });

  it('uses isolated margin on isolated-only markets', () => {
    const r = planOpen({ m: markets.POPCAT!, side: 'long', margin: 10, lev: 2, type: 'market' });
    expect(r.ok && r.plan.leverage.isCross).toBe(false);
  });
});

describe('moving a deposit to the trading balance', () => {
  const m = usolMarket(SPOT_META)!;
  const spot = toSpot(SPOT); // 1.5 USOL, 500.12 USDC with 20 held by orders

  it('finds USOL/USDC and its price', () => {
    expect(m).toEqual({ pair: '@156', asset: 10156, szDecimals: 2, px: 187.1 });
    expect(usolMarket([{ ...SPOT_META[0], tokens: [] }, []])).toBeNull();
  });

  it('sells all free USOL 1% under the mid, immediate or cancel', () => {
    expect(planSellUsol(spot, m)).toEqual({
      ok: true,
      size: '1.5',
      order: { a: 10156, b: false, p: '185.22', s: '1.5', r: false, t: { limit: { tif: 'Ioc' } } },
    });
    // at the best bid when the book gives one
    expect(planSellUsol(spot, m, 186.9)).toMatchObject({ ok: true, order: { p: '186.9', s: '1.5' } });
    // the $10 check is on what Hyperliquid checks: the size after rounding down, times the limit price
    // (ALFA's first deposit: 0.1065 USOL; with two size decimals that sells 0.10, under $10 at $95)
    expect(planSellUsol([{ coin: 'USOL', total: 0.1065, hold: 0 }], { ...m, px: 95.3 }, 95.2)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('worth $9.52'),
    });
    expect(
      planSellUsol([{ coin: 'USOL', total: 0.1065, hold: 0 }], { ...m, szDecimals: 4, px: 95.3 }, 95.2),
    ).toMatchObject({
      ok: true,
      size: '0.1065',
    });
    // nothing to sell, too little to sell, no price
    expect(planSellUsol([], m)).toBeNull();
    expect(planSellUsol([{ coin: 'USOL', total: 0.05, hold: 0 }], m)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("under Hyperliquid's $10 smallest order"),
    });
    expect(planSellUsol(spot, { ...m, px: 0 })).toMatchObject({ ok: false });
    // a crumb left after a sale (0.0005 USOL) is nothing to sell, not an error
    expect(planSellUsol([{ coin: 'USOL', total: 0.0005, hold: 0 }], m)).toBeNull();
    expect(planSellUsol([{ coin: 'USOL', total: 0.004, hold: 0 }], m, 186.9)).toBeNull();
  });

  it('moves the free USDC, rounded down to the cent', () => {
    expect(free(spot, 'USDC')).toBeCloseTo(480.12);
    expect(usdcToMove(spot)).toBe('480.12');
    expect(usdcToMove([{ coin: 'USDC', total: 480.11999999, hold: 0 }])).toBe('480.11');
    expect(usdcToMove([{ coin: 'USDC', total: 0.004, hold: 0 }])).toBeNull();
    // under $1 isn't worth a wallet signature
    expect(usdcToMove([{ coin: 'USDC', total: 0.99, hold: 0 }])).toBeNull();
    expect(usdcToMove([{ coin: 'USDC', total: 1, hold: 0 }])).toBe('1.00');
    expect(usdcToMove(null)).toBeNull();
  });
});

describe('planClose', () => {
  it('closes the whole position at market, reduce only, on the other side', () => {
    const p = { coin: 'SOL', side: 'long', size: 10.5 } as PositionRow;
    expect(planClose(p, SOL)).toEqual({
      a: 2,
      b: false,
      p: '185.35',
      s: '10.5',
      r: true,
      t: { limit: { tif: 'Ioc' } },
    });
    const s = { coin: 'BTC', side: 'short', size: 0.01 } as PositionRow;
    expect(planClose(s, BTC)).toMatchObject({ b: true, p: '98094', s: '0.01', r: true });
    expect(through(100, true)).toBeCloseTo(101);
  });

  it('closes part of it, or rests at a limit price until the price gets there', () => {
    const p = { coin: 'SOL', side: 'long', size: 10.5 } as PositionRow;
    expect(planClose(p, SOL, 0.5)).toMatchObject({ s: '5.25', t: { limit: { tif: 'Ioc' } } });
    expect(planClose(p, SOL, 0.25)).toMatchObject({ s: '2.62' });
    expect(planClose(p, SOL, 1, 195)).toMatchObject({
      b: false,
      p: '195',
      s: '10.5',
      r: true,
      t: { limit: { tif: 'Gtc' } },
    });
  });
});

describe('take profit and stop loss on an open position', () => {
  const long = { coin: 'SOL', side: 'long', size: 10.5, entry: 180, liq: 150 } as PositionRow;
  const short = { coin: 'SOL', side: 'short', size: 2, entry: 190, liq: 220 } as PositionRow;

  it('sets reduce-only market triggers on the other side, for the whole position', () => {
    const r = planTpsl(long, SOL, 210, 160);
    expect(r).toMatchObject({
      ok: true,
      orders: [
        { b: false, r: true, s: '10.5', t: { trigger: { triggerPx: '210', tpsl: 'tp', isMarket: true } } },
        { b: false, r: true, s: '10.5', t: { trigger: { triggerPx: '160', tpsl: 'sl', isMarket: true } } },
      ],
    });
    expect(planTpsl(short, SOL, 170, undefined)).toMatchObject({
      ok: true,
      orders: [{ b: true, t: { trigger: { tpsl: 'tp' } } }],
    });
  });

  it('says plainly when a price is on the wrong side or past liquidation', () => {
    expect(planTpsl(long, SOL)).toMatchObject({ ok: false, reason: expect.stringContaining('Enter') });
    expect(planTpsl(long, SOL, 180)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('above the price now'),
    });
    expect(planTpsl(long, SOL, undefined, 190)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('below the price now'),
    });
    expect(planTpsl(long, SOL, undefined, 140)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('past your liquidation price'),
    });
    expect(planTpsl(short, SOL, 200)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('below the price now'),
    });
  });

  it('works out the P&L at a price', () => {
    expect(pnlAt(long, 200)).toBeCloseTo(210);
    expect(pnlAt(long, 200, 5.25)).toBeCloseTo(105);
    expect(pnlAt(short, 180)).toBeCloseTo(20);
  });
});

describe('results and errors', () => {
  it('describes a fill and a resting order', () => {
    const filled: OrderSuccessResponse = {
      status: 'ok',
      response: {
        type: 'order',
        data: { statuses: [{ filled: { totalSz: '2.67', avgPx: '187.25', oid: 1 } }] },
      },
    };
    expect(describeFill(filled, SOL)).toBe('Filled 2.67 SOL at $187.25.');
    const resting: OrderSuccessResponse = {
      status: 'ok',
      response: { type: 'order', data: { statuses: [{ resting: { oid: 2 } }] } },
    };
    expect(describeFill(resting, SOL)).toBe('Order placed. It fills when the price gets there.');
  });

  it("explains Hyperliquid's errors in plain words", () => {
    expect(explain('Order could not immediately match against any resting orders. asset=5')).toMatch(
      /price moved/,
    );
    expect(explain('Insufficient margin to place order. asset=5')).toMatch(/Not enough margin/);
    expect(explain('User or API Wallet 0xabc does not exist.')).toMatch(/Deposit first/);
    expect(explain('Must deposit before performing actions. User: 0xe614')).toBe(
      'Your account is empty. Deposit first, then enable trading.',
    );
    expect(explain('Something new')).toBe('Something new');
  });
});

/** A transport that records what the SDK would send to Hyperliquid and answers like it. */
function recorder(response: unknown = { status: 'ok', response: { type: 'default' } }) {
  const sent: Array<{
    action: Record<string, unknown>;
    nonce: number;
    signature: { r: string; s: string; v: number };
  }> = [];
  return {
    sent,
    transport: {
      isTestnet: false,
      async request<T>(_endpoint: string, payload: unknown): Promise<T> {
        sent.push(payload as (typeof sent)[number]);
        return response as T;
      },
    },
  };
}

const sig = (s: { r: string; s: string; v: number }) =>
  `${s.r}${s.s.slice(2).padStart(64, '0')}${s.v.toString(16)}` as `0x${string}`;

describe('signatures Hyperliquid will accept', () => {
  it("signs orders with the trading key, recoverable to the key's address under Hyperliquid's L1 scheme", async () => {
    const agent = newAgent();
    const rec = recorder({
      status: 'ok',
      response: { type: 'order', data: { statuses: [{ filled: { totalSz: '1', avgPx: '1', oid: 1 } }] } },
    });
    await order(
      { transport: rec.transport, wallet: agentSigner(agent) },
      {
        orders: [{ a: 2, b: true, p: '189.1', s: '2.67', r: false, t: { limit: { tif: 'Ioc' } } }],
        grouping: 'na',
      },
    );
    const { action, nonce, signature } = rec.sent[0]!;
    const recovered = await recoverTypedDataAddress({
      domain: {
        name: 'Exchange',
        version: '1',
        chainId: 1337,
        verifyingContract: '0x0000000000000000000000000000000000000000',
      },
      types: {
        Agent: [
          { name: 'source', type: 'string' },
          { name: 'connectionId', type: 'bytes32' },
        ],
      },
      primaryType: 'Agent',
      message: { source: 'a', connectionId: createL1ActionHash({ action, nonce }) },
      signature: sig(signature),
    });
    expect(recovered.toLowerCase()).toBe(agent.address);
  });

  it('has the wallet sign account actions through eth_signTypedData_v4, on its own chain', async () => {
    // a wallet on Arbitrum that signs with a real key, so the signature can be checked
    const owner = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
    const calls: Array<{ method: string; params?: unknown[] }> = [];
    const provider: Eip1193 = {
      async request({ method, params }) {
        calls.push({ method, params });
        if (method === 'eth_chainId') return '0xa4b1';
        if (method === 'eth_signTypedData_v4') {
          const data = JSON.parse(String(params![1]));
          const { EIP712Domain: _, ...types } = data.types;
          return owner.signTypedData({
            domain: data.domain,
            types,
            primaryType: data.primaryType,
            message: data.message,
          });
        }
        throw new Error(method);
      },
    };
    const agent = newAgent();
    const rec = recorder();
    await approveAgent(
      {
        transport: rec.transport,
        wallet: walletSigner(provider, owner.address.toLowerCase() as `0x${string}`),
      },
      { agentAddress: agent.address, agentName: 'coinside' },
    );
    const { action, signature } = rec.sent[0]!;
    expect(action).toMatchObject({
      type: 'approveAgent',
      signatureChainId: '0xa4b1',
      agentName: 'coinside',
      hyperliquidChain: 'Mainnet',
    });
    const payload = JSON.parse(String(calls.find((c) => c.method === 'eth_signTypedData_v4')!.params![1]));
    expect(payload.domain).toMatchObject({ name: 'HyperliquidSignTransaction', chainId: 42161 });
    expect(payload.types.EIP712Domain).toHaveLength(4);
    const { EIP712Domain: _, ...types } = payload.types;
    const recovered = await recoverTypedDataAddress({
      domain: payload.domain,
      types,
      primaryType: payload.primaryType,
      message: payload.message,
      signature: sig(signature),
    });
    expect(recovered).toBe(owner.address);
  });

  it('serializes bigints in typed data', () => {
    const json = typedDataJson({ domain: {}, types: {}, primaryType: 'X', message: { nonce: 12n } });
    expect(JSON.parse(json).message.nonce).toBe('12');
  });
});
