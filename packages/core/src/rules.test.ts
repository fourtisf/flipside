import { describe, expect, it } from 'vitest';
import { LAMPORTS_PER_SOL } from './money';
import { DEFAULT_RULES, canonicalRules, loadRules, maxLeverage, maxWinBps, sideCap } from './rules';

const SOL = LAMPORTS_PER_SOL;

describe('rules', () => {
  it('defaults match the brief', () => {
    const r = loadRules({});
    expect(r).toEqual(DEFAULT_RULES);
    expect(r.minTrade).toBe(SOL / 100n);
    expect(r.sideCapMax).toBe(30n * SOL);
    expect(r.levTiers.map((t) => t.leverage)).toEqual([2, 5, 10]);
  });

  it('applies env overrides in the .env.example format', () => {
    const r = loadRules({
      OPEN_FEE_BPS: '50',
      LEV_TIERS: '10:500, 2:0, 5:150',
      MAX_WIN_TIERS: '20000:0,40000:100',
      SIDE_CAP_MAX_SOL: '12.5',
      MIN_TRADE_LAMPORTS: '20000000',
    });
    expect(r.openFeeBps).toBe(50);
    expect(r.levTiers.map((t) => t.leverage)).toEqual([2, 5, 10]);
    expect(r.maxWinTiers).toHaveLength(2);
    expect(r.sideCapMax).toBe(12_500_000_000n);
    expect(r.minTrade).toBe(20_000_000n);
  });

  it('rejects invalid overrides with the variable name', () => {
    expect(() => loadRules({ OPEN_FEE_BPS: '1.5' })).toThrow(/OPEN_FEE_BPS/);
    expect(() => loadRules({ LEV_TIERS: '5:150' })).toThrow(/LEV_TIERS/);
    expect(() => loadRules({ SIDE_CAP_MAX_SOL: '-1' })).toThrow(/SIDE_CAP_MAX_SOL/);
  });

  it('picks leverage and max win tiers by threshold', () => {
    expect(maxLeverage(149n * SOL)).toBe(2);
    expect(maxLeverage(150n * SOL)).toBe(5);
    expect(maxLeverage(500n * SOL)).toBe(10);
    expect(maxWinBps(99n * SOL)).toBe(20000);
    expect(maxWinBps(418n * SOL)).toBe(60000);
    expect(maxWinBps(500n * SOL)).toBe(100000);
  });

  it('caps each side at min(1% of liquidity, 30 SOL)', () => {
    expect(sideCap(612n * SOL)).toBe((612n * SOL) / 100n);
    expect(sideCap(4210n * SOL)).toBe(30n * SOL);
  });

  it('serializes canonically for the boot hash', () => {
    expect(canonicalRules(loadRules({}))).toBe(canonicalRules(DEFAULT_RULES));
    expect(canonicalRules(DEFAULT_RULES)).toContain('"minTrade":"10000000"');
  });
});
