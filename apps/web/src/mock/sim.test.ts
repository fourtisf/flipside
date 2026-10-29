import { LAMPORTS_PER_SOL as SOL } from '@coinside/core';
import { describe, expect, it } from 'vitest';
import { Sim, type Position } from './sim';

/** Pin a coin's live price and 60s history so fills and marks are exact. */
function pin(sim: Sim, sym: string, price: number) {
  const c = sim.bySym[sym]!;
  c.price = price;
  c.hist = c.hist.map(() => price);
}

const book = (s: Sim) =>
  s.balance.real +
  s.pool.value +
  s.buffer +
  s.positions.filter((p) => p.mode === 'real').reduce((a, p) => a + p.margin, 0n);

describe('mock engine', () => {
  it('is deterministic for a seed, so server and client renders agree', () => {
    const a = new Sim(7, 0);
    const b = new Sim(7, 0);
    expect(a.coins.map((c) => [c.price, c.h1, c.oiL, c.oiS, c.v24])).toEqual(
      b.coins.map((c) => [c.price, c.h1, c.oiL, c.oiS, c.v24]),
    );
    expect(a.tapeItems()).toEqual(b.tapeItems());
  });

  it('charges 1% in and 1% out, rounded toward the pool', () => {
    const s = new Sim(1, 0);
    s.claim();
    pin(s, 'KELP', 0.25); // exactly representable, so the 60s average equals the live price
    expect(s.openPosition('KELP', 'long', 2, '1', null, null)).toBeNull();
    const p = s.positions[0]!;
    expect(p.openFee).toBe(SOL / 100n);
    expect(p.margin).toBe((SOL * 99n) / 100n);
    s.closePos(p, 'manual');
    // flat close: margin minus ceil(1% of margin)
    expect(s.bal()).toBe(9n * SOL + 990_000_000n - 9_900_000n);
    expect(s.history[0]!.net).toBe(-19_900_000n);
  });

  it('conserves every real lamport across open and close (the pool is the counterparty)', () => {
    const s = new Sim(2, 0);
    s.setMode('real');
    s.wallet = 'w';
    s.balance.real = 5n * SOL;
    pin(s, 'CHAD', 0.0189);
    const before = book(s);
    expect(s.openPosition('CHAD', 'short', 5, '1.234567891', null, null)).toBeNull();
    expect(book(s)).toBe(before);
    pin(s, 'CHAD', 0.0171);
    s.closePos(s.positions[0]!, 'manual');
    expect(book(s)).toBe(before);
    expect(s.history[0]!.net > 0n).toBe(true);
  });

  it('liquidates at -100% of margin and closes at max win', () => {
    const s = new Sim(3, 0);
    s.claim();
    pin(s, 'OBVS', 0.04);
    s.openPosition('OBVS', 'long', 10, '1', null, null);
    s.openPosition('OBVS', 'short', 10, '1', null, null);
    const [long, short] = s.positions as [Position, Position];
    pin(s, 'OBVS', 0.0359); // -10.25% move: long at 10x is wiped out, short is up 102.5%
    s.tick();
    expect(s.history.find((h) => h.id === long.id)?.reason).toBe('liq');
    expect(s.positions.map((p) => p.id)).toEqual([short.id]);
    pin(s, 'OBVS', 0.001); // short far past its cap
    s.tick();
    const closed = s.history.find((h) => h.id === short.id)!;
    expect(closed.reason).toBe('max');
    // max win at a 418 SOL pool is +600% of margin, minus the close fee
    const value = short.margin + short.margin * 6n;
    expect(closed.net).toBe(value - (value + 99n) / 100n - short.stake);
  });

  it('validates orders like the prototype, in the same order', () => {
    const s = new Sim(4, 0);
    expect(s.openPosition('KELP', 'long', 2, '1', null, null)).toBe('');
    expect(s.bal()).toBe(10n * SOL);
    expect(s.openPosition('KELP', 'long', 2, '0.009', null, null)).toBe('The minimum trade is 0.01 SOL.');
    expect(s.openPosition('KELP', 'long', 2, '11', null, null)).toBe(
      'Not enough paper SOL. Lower the amount.',
    );
    expect(s.openPosition('FERN', 'short', 2, '1', null, null)).toMatch(
      /^Only 0\.16 SOL of room is left for shorts on \$FERN/,
    );
    expect(s.openPosition('KELP', 'long', 2, '1', null, '100')).toMatch(/^Stop loss has to be under 100%/);
  });
});
