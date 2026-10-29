import { DEFAULT_RULES, loadRules } from '@coinside/core';
import { describe, expect, it } from 'vitest';
import { docsCopy, solText } from './docs-copy';

// The Docs page copy as approved in prototype.html (lifted from the page before it was generated).
const PROTOTYPE_GUARDS: Array<[string, string]> = [
  [
    "Pulled liquidity can't pay a short",
    'If a coin loses 30% of its pool liquidity within 5 minutes, every position on it settles at its average price from before the drop. A dev who shorts and then pulls liquidity earns nothing.',
  ],
  [
    "Insiders can't short their own coin",
    "The deployer, wallets it funded and the coin's top 20 holders at the moment you open are blocked from shorting it.",
  ],
  [
    'The crowded side pays',
    'When one side of a coin outweighs the other by more than 2 to 1, that side pays the other an hourly fee. Wallets piling into one short together pay for it.',
  ],
  [
    'Hourly loss breaker',
    'If the pool loses 3% in an hour, new trades pause for 15 minutes. Open positions keep running and can still be closed.',
  ],
  [
    'Verified, with a 72-hour timelock',
    "The vault program is verified on-chain. Any upgrade is published 72 hours before it can run, so you can withdraw first if you don't like it.",
  ],
  [
    'Your full balance, even if we go dark',
    'Every 5 minutes the engine posts a balance proof on-chain. If it stops for 72 hours, you can withdraw your whole balance, profits included, straight from the program.',
  ],
];

const PROTOTYPE_RULES: Array<[string, string]> = [
  [
    'Leverage',
    '2x below 150 SOL of liquidity, 5x from 150 SOL, 10x from 500 SOL. Each coin shows what it allows.',
  ],
  [
    'Fees',
    '1% of your stake to open and 1% of what comes back to close. No spread, no fee on profits, nothing on deposits or withdrawals.',
  ],
  [
    'Fills',
    "You get the worse of the live price and the 60-second average, both on the way in and on the way out. A one-second pump can't be farmed.",
  ],
  [
    'Wins and losses',
    'A position can win up to +200% of its stake while the pool is under 100 SOL, rising to +400% at 100 SOL, +600% at 250 SOL and +1000% at 500 SOL. You never lose more than your stake.',
  ],
  [
    'Which coins open',
    'At least $30K market cap (checked on every trade), 100 holders, 7 SOL paid in trading fees and 24 hours of trading history.',
  ],
  ['New wallets', "A wallet first funded less than 24 hours ago can't trade yet."],
];

describe('docs copy', () => {
  it('is the prototype copy word for word with the default rules', () => {
    const copy = docsCopy(DEFAULT_RULES);
    expect(copy.rules).toEqual(PROTOTYPE_RULES);
    expect(copy.guards).toEqual(PROTOTYPE_GUARDS);
    expect(copy.leverageChoice).toBe('Pick 2x, 5x or 10x');
    expect(copy.minHold).toBe('After 10 seconds you can close any time.');
    expect(copy.maxLeverageRisk).toBe('At 10x, a 10% move against you takes your whole stake.');
  });

  it('follows the rules when they are overridden', () => {
    const copy = docsCopy(
      loadRules({
        LEV_TIERS: '3:0,6:200.5',
        MAX_WIN_TIERS: '15000:0',
        MIN_HOLD_SECONDS: '1',
        RUG_GUARD_WINDOW_SECONDS: '90',
        MIN_MCAP_USD: '45500',
        OPEN_FEE_BPS: '50',
      }),
    );
    expect(copy.rules[0]![1]).toBe(
      '3x below 200.5 SOL of liquidity, 6x from 200.5 SOL. Each coin shows what it allows.',
    );
    expect(copy.rules[1]![1]).toMatch(/^0.5% of your stake to open and 1% of what comes back/);
    expect(copy.rules[3]![1]).toBe(
      'A position can win up to +150% of its stake. You never lose more than your stake.',
    );
    expect(copy.rules[4]![1]).toMatch(/^At least \$45,500 market cap/);
    expect(copy.guards[0]![1]).toMatch(/within 90 seconds,/);
    expect(copy.leverageChoice).toBe('Pick 3x or 6x');
    expect(copy.minHold).toBe('After 1 second you can close any time.');
    expect(copy.maxLeverageRisk).toBe('At 6x, a 16.7% move against you takes your whole stake.');
  });

  it('writes SOL amounts without trailing zeros', () => {
    expect(solText(150_000_000_000n)).toBe('150');
    expect(solText(2_500_000_000n)).toBe('2.5');
    expect(solText(1n)).toBe('0.000000001');
  });
});
