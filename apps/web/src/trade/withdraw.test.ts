import { describe, expect, it } from 'vitest';
import { SPOT_META } from '../../e2e/hl-fixtures';
import {
  MAX_WITHDRAW_SOL,
  MIN_WITHDRAW_SOL,
  minWithdrawUsd,
  planSendUsol,
  planWithdraw,
  usolMarket,
  withdrawProblem,
  withdrawable,
} from './funds';

const m = usolMarket(SPOT_META)!; // USOL/USDC, lot 0.01, mid 187.1

describe('withdrawing to Solana: the rules', () => {
  it("starts at Unit's 0.12 SOL and Hyperliquid's $10 order, and caps at 1 SOL while new", () => {
    expect([MIN_WITHDRAW_SOL, MAX_WITHDRAW_SOL]).toEqual([0.12, 1]);
    // 0.12 SOL bought 1% through the price, and a cent for rounding
    expect(minWithdrawUsd(95.3)).toBe(11.57);
    expect(minWithdrawUsd(187.1)).toBe(22.69);
    // a cheap SOL: Hyperliquid's $10 order is the larger
    expect(minWithdrawUsd(50)).toBe(10.11);
  });

  it('says what stops a withdrawal', () => {
    expect(withdrawProblem(0, 100, 95)).toBe('Enter an amount in USDC.');
    expect(withdrawProblem(30, 20, 95)).toBe('You have $20.00 to withdraw.');
    expect(withdrawProblem(20, 100, 0)).toMatch(/No SOL price/);
    // ALFA's account: $9.84 trading + $0.05 spot is under the minimum at $95.30
    expect(withdrawProblem(9.89, withdrawable(9.84, 0.05), 95.3)).toBe(
      "Withdraw at least $11.57: Unit pays out 0.12 SOL or more, and Hyperliquid's smallest order is $10.",
    );
    expect(withdrawProblem(150, 500, 95.3)).toBe(
      'While withdrawals are new, one can be at most 1 SOL (about $95.30).',
    );
    expect(withdrawProblem(50, 500, 95.3)).toBeNull();
  });
});

describe('withdrawing to Solana: the plan', () => {
  it('moves what spot lacks, then buys USOL 1% over the ask, rounded down to the lot', () => {
    const r = planWithdraw({ amount: 50, perp: 744.26, spotUsdc: 0, m, ask: 187.2 });
    expect(r).toEqual({
      ok: true,
      plan: {
        order: { a: 10156, b: true, p: '189.07', s: '0.26', r: false, t: { limit: { tif: 'Ioc' } } },
        size: '0.26',
        toSpot: '49.16',
      },
    });
  });

  it('uses spot USDC first and moves only the rest', () => {
    const all = planWithdraw({ amount: 50, perp: 744.26, spotUsdc: 480.12, m, ask: 187.2 });
    expect(all.ok && all.plan.toSpot).toBeNull();
    const some = planWithdraw({ amount: 50, perp: 744.26, spotUsdc: 20, m, ask: 187.2 });
    expect(some.ok && some.plan.toSpot).toBe('29.16');
  });

  it('refuses what the rules refuse, before anything moves', () => {
    expect(planWithdraw({ amount: 15, perp: 10, spotUsdc: 5, m, ask: 187.2 })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Withdraw at least $22.70'),
    });
    expect(planWithdraw({ amount: 50, perp: 744.26, spotUsdc: 0, m: null, ask: 0 })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('No SOL price'),
    });
  });
});

describe('withdrawing USOL already in the account', () => {
  const usol = (total: string) => [{ coin: 'USOL', total: Number(total), hold: 0 }] as never;

  it('sends all of it, rounded down to the lot, up to the cap', () => {
    // ALFA's account after a withdrawal whose send didn't go through
    expect(planSendUsol(usol('0.2409'), m)).toEqual({ ok: true, amount: '0.24' });
    expect(planSendUsol(usol('1.5'), m)).toEqual({ ok: true, amount: '1' });
  });

  it("refuses under Unit's minimum, and has nothing to say without USOL", () => {
    expect(planSendUsol(usol('0.1'), m)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('0.12 SOL'),
    });
    expect(planSendUsol([], m)).toBeNull();
  });
});
