import { describe, expect, it } from 'vitest';
import { ago, pct, plain, priceParts, priceTxt, sgn, shortA, sol, usd } from './format';

describe('format (prototype parity)', () => {
  it('formats prices like the prototype price()', () => {
    expect(priceParts(1.234)).toEqual({ kind: 'plain', text: '$1.23' });
    expect(priceParts(0.0482)).toEqual({ kind: 'plain', text: '$0.0482' });
    expect(priceParts(0.0048)).toEqual({ kind: 'plain', text: '$0.00480' });
    expect(priceParts(0.000386)).toEqual({ kind: 'plain', text: '$0.000386' });
    // 0.0 then z zeros then the digits: $0.0₃610 is 0.0000610
    expect(priceParts(0.000061)).toEqual({ kind: 'sub', zeros: 3, digits: '610' });
    expect(priceParts(0.0000099999)).toEqual({ kind: 'sub', zeros: 4, digits: '1000' });
    expect(plain(0.000005612)).toBe('$0.0{4}561');
  });

  it('formats axis prices, caps, percents and amounts', () => {
    expect(priceTxt(0.0048)).toBe('0.00480');
    expect(priceTxt(0.000061)).toBe('0.0000610');
    expect(priceTxt(2)).toBe('2.000');
    expect(usd(4.8e6)).toBe('$4.80M');
    expect(usd(61e3)).toBe('$61.0K');
    expect(usd(44.2e9)).toBe('$44.20B');
    expect(pct(0.123)).toBe('+12.3%');
    expect(pct(-0.5, 0)).toBe('−50%');
    expect(sol(1_284_600_000_000n, 1)).toBe('1,284.6');
    expect(sgn(-123_456_789n)).toBe('−0.123');
    expect(sgn(1_000_000_000n, 2)).toBe('+1.00');
  });

  it('formats addresses and ages', () => {
    expect(shortA('AK6sDVobPJFuVSuepJF6QdZYvT9R4RqnerRJ8P5qpump')).toBe('AK6s…pump');
    expect(ago(400)).toBe('1s');
    expect(ago(90_000)).toBe('2m');
    expect(ago(7_200_000)).toBe('2h');
  });
});
