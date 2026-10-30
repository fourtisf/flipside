import { describe, expect, it } from 'vitest';
import {
  bookSide,
  fundingCountdown,
  fundingText,
  levChoices,
  liqPrice,
  mergeSide,
  pxDecimals,
  pxParts,
  pxDiffText,
  pxText,
  sizeFor,
  szCol,
  szText,
  withDepth,
} from './format';

describe('prices', () => {
  it('shows up to 5 significant figures, capped at 6 - szDecimals decimals', () => {
    expect(pxText(97123.5, 5)).toBe('97,124');
    expect(pxText(3456.7, 4)).toBe('3,456.7');
    expect(pxText(187.23, 2)).toBe('187.23');
    expect(pxText(41.873, 2)).toBe('41.873');
    expect(pxText(2.4512, 0)).toBe('2.4512');
    expect(pxText(0.020145, 0)).toBe('0.020145');
    expect(pxText(0.0061234, 0)).toBe('0.006123');
    // the cap: 3 size decimals leave 3 price decimals
    expect(pxDecimals(0.51234, 3)).toBe(3);
    expect(pxDecimals(0, 2)).toBe(2);
    expect(pxDecimals(123456, 0)).toBe(0);
  });

  it('uses the subscript-zero format under $0.001, like the rest of the app', () => {
    expect(pxParts(97123.5, 5)).toEqual({ kind: 'plain', text: '$97,124' });
    expect(pxParts(0.000061, 0)).toEqual({ kind: 'sub', zeros: 3, digits: '610' });
  });

  it('formats funding as an hourly percentage with a true minus', () => {
    expect(fundingText(0.0000125)).toBe('+0.0013%');
    expect(fundingText(-0.00004)).toBe('−0.0040%');
    expect(fundingText(0)).toBe('+0.0000%');
  });

  it('formats sizes to the market size decimals', () => {
    expect(szText(0.00153, 5)).toBe('0.00153');
    expect(szText(12345, 0)).toBe('12,345');
    expect(szText(1.5, 2)).toBe('1.5');
    // in columns every row has all the decimals, so digits line up
    expect(szCol(1.5, 2)).toBe('1.50');
    expect(szCol(624.3, 2)).toBe('624.30');
  });

  it('shows a spread with the decimals of the price', () => {
    expect(pxDiffText(0.02, 187.23, 2)).toBe('0.02');
    expect(pxDiffText(1, 97123.5, 5)).toBe('1');
    expect(pxDiffText(0.000001, 0.020145, 0)).toBe('0.000001');
  });

  it('counts down to the next hourly funding', () => {
    const hour = Date.UTC(2026, 9, 30, 12);
    expect(fundingCountdown(hour)).toBe('60:00');
    expect(fundingCountdown(hour + 17 * 60_000 + 53_000)).toBe('42:07');
  });
});

describe('order estimates', () => {
  it('offers 2x, 5x and 10x where allowed, plus the market maximum, at least three buttons', () => {
    expect(levChoices(40)).toEqual([2, 5, 10, 40]);
    expect(levChoices(25)).toEqual([2, 5, 10, 25]);
    expect(levChoices(10)).toEqual([2, 5, 10]);
    expect(levChoices(5)).toEqual([1, 2, 5]);
    expect(levChoices(3)).toEqual([1, 2, 3]);
  });

  it('estimates liquidation with maintenance margin at half the initial margin at max leverage', () => {
    // 10x long on a 40x market: liquidated after a fall of about 8.9%
    expect(liqPrice(100, 10, 40, 'long')).toBeCloseTo(91.139, 3);
    expect(liqPrice(100, 10, 40, 'short')).toBeCloseTo(108.642, 3);
    // at max leverage the room is half the initial margin
    expect(1 - liqPrice(100, 40, 40, 'long') / 100).toBeCloseTo(0.0127, 4);
    // a long is always liquidated below entry and a short above
    for (const [lev, max] of [
      [1, 3],
      [3, 3],
      [5, 20],
      [20, 20],
    ] as const) {
      expect(liqPrice(50, lev, max, 'long')).toBeLessThan(50);
      expect(liqPrice(50, lev, max, 'short')).toBeGreaterThan(50);
    }
  });

  it('rounds the size down to the market size decimals', () => {
    expect(sizeFor(100, 5, 97123.5, 5)).toBe(0.00514);
    expect(sizeFor(100, 10, 0.020145, 0)).toBe(49640);
    expect(sizeFor(0, 10, 1, 2)).toBe(0);
    expect(sizeFor(10, 2, 0, 2)).toBe(0);
    // no float drift above the true value: 0.3 / 0.1 is 2.9999999999999996 in floating point
    expect(sizeFor(0.3, 1, 0.1, 0)).toBe(3);
  });
});

describe('order book', () => {
  const bids = bookSide(
    [
      { px: '99', sz: '1' },
      { px: '98', sz: '2' },
      { px: '97', sz: '3' },
    ],
    2,
  );
  const asks = bookSide(
    [
      { px: '100', sz: '4' },
      { px: '101', sz: '1' },
    ],
    2,
  );

  it('keeps running totals from the best price out', () => {
    expect(bids.map((r) => r.total)).toEqual([1, 3]);
    expect(asks.map((r) => r.total)).toEqual([4, 5]);
  });

  it('scales depth bars to the deeper side and measures the spread', () => {
    const b = withDepth(bids, asks);
    expect(b.asks[1]!.depth).toBe(1);
    expect(b.bids[1]!.depth).toBeCloseTo(0.6);
    expect(b.spread).toBe(1);
    expect(b.spreadPct).toBeCloseTo(0.01);
    expect(withDepth([], []).spread).toBeNull();
  });
});

describe('order book from two feeds', () => {
  const L = (px: number, sz = 1) => ({ px: String(px), sz: String(sz) });
  it('takes the top from the fast feed and the rest from the deep one', () => {
    const top = [L(101), L(102)];
    const deep = [L(101), L(102.5), L(103), L(104)];
    expect(mergeSide(top, deep, 1, 4).map((l) => l.px)).toEqual(['101', '102', '102.5', '103']);
    const bids = mergeSide([L(99), L(98)], [L(99), L(97.5), L(97)], -1, 3);
    expect(bids.map((l) => l.px)).toEqual(['99', '98', '97.5']);
  });

  it('uses whichever feed has arrived', () => {
    expect(mergeSide(null, [L(1), L(2)], 1, 5)).toHaveLength(2);
    expect(mergeSide([L(1)], null, 1, 5)).toHaveLength(1);
    expect(mergeSide(null, null, 1, 5)).toEqual([]);
  });
});
