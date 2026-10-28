import { describe, expect, it } from 'vitest';
import {
  LAMPORTS_PER_SOL,
  PRICE_SCALE,
  bpsDown,
  bpsUp,
  ceilDiv,
  fairFill,
  floorDiv,
  formatSol,
  liquidationPrice,
  parseSol,
  positionPnl,
  quoteClose,
  quoteOpen,
  toPriceScaled,
} from './money';

const SOL = LAMPORTS_PER_SOL;
const P = (n: bigint) => n * PRICE_SCALE;

describe('division helpers', () => {
  it('floors and ceils toward the right infinity for both signs', () => {
    expect(floorDiv(7n, 2n)).toBe(3n);
    expect(floorDiv(-7n, 2n)).toBe(-4n);
    expect(floorDiv(-8n, 2n)).toBe(-4n);
    expect(ceilDiv(7n, 2n)).toBe(4n);
    expect(ceilDiv(-7n, 2n)).toBe(-3n);
    expect(ceilDiv(8n, 2n)).toBe(4n);
  });
  it('rejects non-positive divisors', () => {
    expect(() => floorDiv(1n, 0n)).toThrow(RangeError);
    expect(() => ceilDiv(1n, -1n)).toThrow(RangeError);
  });
  it('rounds bps debits up and credits down', () => {
    expect(bpsUp(101n, 100)).toBe(2n);
    expect(bpsDown(101n, 100)).toBe(1n);
    expect(bpsUp(100n, 100)).toBe(1n);
  });
});

describe('parseSol', () => {
  it.each([
    ['0.25', 250_000_000n],
    ['1', SOL],
    ['1.', SOL],
    ['.5', SOL / 2n],
    [' 2.000000001 ', 2n * SOL + 1n],
    ['0.0000000019', 1n],
    ['0', 0n],
  ])('%s', (input, want) => expect(parseSol(input)).toBe(want));
  it.each(['', '.', '-1', '1e3', 'abc', '1.2.3', '0x10'])('rejects %j', (input) =>
    expect(parseSol(input)).toBeNull(),
  );
});

describe('formatSol', () => {
  it('rounds half away from zero and groups', () => {
    expect(formatSol(1_234_567_890_000n, { group: true })).toBe('1,234.57');
    expect(formatSol(5_000_000n, { dp: 2 })).toBe('0.01');
    expect(formatSol(4_999_999n, { dp: 2 })).toBe('0.00');
    expect(formatSol(-1_500_000_000n, { dp: 3, signed: true })).toBe('−1.500');
    expect(formatSol(0n, { dp: 3, signed: true })).toBe('+0.000');
    expect(formatSol(-1n, { dp: 3, signed: true })).toBe('+0.000');
    expect(formatSol(SOL, { dp: 0 })).toBe('1');
  });
});

describe('position math', () => {
  it('takes the open fee rounded up', () => {
    expect(quoteOpen(SOL, 100)).toEqual({ stake: SOL, openFee: SOL / 100n, margin: (SOL * 99n) / 100n });
    expect(quoteOpen(101n, 100)).toEqual({ stake: 101n, openFee: 2n, margin: 99n });
  });

  const base = { margin: 990_000_000n, leverage: 2, side: 'long' as const, entry: P(100n), maxWinBps: 20000 };

  it('computes long and short pnl from the price ratio', () => {
    expect(positionPnl({ ...base, exit: P(110n) })).toBe(198_000_000n);
    expect(positionPnl({ ...base, side: 'short', exit: P(110n) })).toBe(-198_000_000n);
    expect(positionPnl({ ...base, side: 'short', exit: P(90n) })).toBe(198_000_000n);
  });

  it('rounds pnl toward the pool', () => {
    // 1 lamport margin, 2x, +1/3 move: exact pnl 0.666…, user gets 0; on a loss user pays 1.
    const tiny = { margin: 1n, leverage: 2, entry: 3n * PRICE_SCALE, maxWinBps: 20000 };
    expect(positionPnl({ ...tiny, side: 'long', exit: 4n * PRICE_SCALE })).toBe(0n);
    expect(positionPnl({ ...tiny, side: 'short', exit: 4n * PRICE_SCALE })).toBe(-1n);
  });

  it('clamps to the stake on the downside and max win on the upside', () => {
    expect(positionPnl({ ...base, exit: P(10n) })).toBe(-base.margin);
    expect(positionPnl({ ...base, exit: P(1000n) })).toBe(base.margin * 2n);
  });

  it('quotes a close with fee rounded up and flags', () => {
    const q = quoteClose({ ...base, exit: P(110n) }, 100);
    expect(q.value).toBe(1_188_000_000n);
    expect(q.closeFee).toBe(11_880_000n);
    expect(q.returned).toBe(1_176_120_000n);
    expect(q.liquidated).toBe(false);
    const liq = quoteClose({ ...base, exit: P(50n) }, 100);
    expect(liq).toMatchObject({ pnl: -base.margin, value: 0n, closeFee: 0n, returned: 0n, liquidated: true });
    expect(quoteClose({ ...base, exit: P(500n) }, 100).maxWin).toBe(true);
  });

  it('places liquidation at 1/lev from entry', () => {
    expect(liquidationPrice(P(100n), 2, 'long')).toBe(P(50n));
    expect(liquidationPrice(P(100n), 10, 'short')).toBe(P(110n));
  });

  it('fills at the worse of live and twap for the user', () => {
    expect(fairFill(10n, 12n, 'long', 'entry')).toBe(12n);
    expect(fairFill(10n, 12n, 'long', 'exit')).toBe(10n);
    expect(fairFill(10n, 12n, 'short', 'entry')).toBe(10n);
    expect(fairFill(10n, 12n, 'short', 'exit')).toBe(12n);
  });

  it('converts float prices to fixed point', () => {
    expect(toPriceScaled(1)).toBe(PRICE_SCALE);
    expect(toPriceScaled(0.0048)).toBe(4_800_000_000_000_000n);
    expect(toPriceScaled(5.612e-8)).toBe(56_120_000_000n);
    expect(toPriceScaled(123.456)).toBe(123_456_000_000_000_000_000n);
    expect(toPriceScaled(1e-20)).toBe(0n);
    expect(() => toPriceScaled(0)).toThrow(RangeError);
  });
});
