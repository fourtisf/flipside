import type { Rules } from '@coinside/core/rules';

/**
 * The numbers on the Docs page, written from the rules the engine enforces (packages/core/rules.ts), so the
 * page can never state a different rule. With DEFAULT_RULES this is the prototype's copy word for word
 * (docs-copy.test.ts). From P1 the page passes the live rules from GET /api/rules (CLAUDE.md section 14).
 */
export interface DocsCopy {
  /** "The rules" list: [term, description]. */
  rules: Array<[string, string]>;
  /** "Pool protection" cards: [title, text]. */
  guards: Array<[string, string]>;
  /** "Pick 2x, 5x or 10x" */
  leverageChoice: string;
  /** "After 10 seconds you can close any time." */
  minHold: string;
  /** "At 10x, a 10% move against you takes your whole stake." */
  maxLeverageRisk: string;
}

const LAMPORTS_PER_SOL = 1_000_000_000n;

/** 150_000_000_000n -> "150", 2_500_000_000n -> "2.5" */
export function solText(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL;
  const frac = (lamports % LAMPORTS_PER_SOL).toString().padStart(9, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** 3000 -> "30%", 250 -> "2.5%" */
const pct = (bps: number) => `${+(bps / 100).toFixed(2)}%`;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** 300 -> "5 minutes", 45 -> "45 seconds" */
const duration = (seconds: number) =>
  seconds % 3600 === 0 && seconds > 0
    ? plural(seconds / 3600, 'hour')
    : seconds % 60 === 0 && seconds > 0
      ? plural(seconds / 60, 'minute')
      : plural(seconds, 'second');

/** 30000 -> "$30K", 30500 -> "$30,500" */
const usd = (n: number) => (n % 1000 === 0 ? `$${n / 1000}K` : `$${n.toLocaleString('en-US')}`);

/** ["a", "b", "c"] -> "a, b and c" */
const list = (items: string[], last: string) =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} ${last} ${items[items.length - 1]}`;

export function docsCopy(r: Rules): DocsCopy {
  const lev = r.levTiers;
  const win = r.maxWinTiers;
  const maxLev = lev[lev.length - 1]?.leverage ?? 1;

  const leverage =
    lev.length === 1
      ? `${lev[0]!.leverage}x on every coin.`
      : `${[
          `${lev[0]!.leverage}x below ${solText(lev[1]!.minLiquidity)} SOL of liquidity`,
          ...lev.slice(1).map((t) => `${t.leverage}x from ${solText(t.minLiquidity)} SOL`),
        ].join(', ')}.`;

  const maxWin =
    win.length === 1
      ? `A position can win up to +${pct(win[0]!.bps)} of its stake.`
      : `A position can win up to +${pct(win[0]!.bps)} of its stake while the pool is under ${solText(win[1]!.minPool)} SOL, rising to ${list(
          win.slice(1).map((t) => `+${pct(t.bps)} at ${solText(t.minPool)} SOL`),
          'and',
        )}.`;

  return {
    rules: [
      ['Leverage', `${leverage} Each coin shows what it allows.`],
      [
        'Fees',
        `${pct(r.openFeeBps)} of your stake to open and ${pct(r.closeFeeBps)} of what comes back to close. No spread, no fee on profits, nothing on deposits or withdrawals.`,
      ],
      [
        'Fills',
        `You get the worse of the live price and the ${r.twapSeconds}-second average, both on the way in and on the way out. A one-second pump can't be farmed.`,
      ],
      ['Wins and losses', `${maxWin} You never lose more than your stake.`],
      [
        'Which coins open',
        `At least ${usd(r.minMcapUsd)} market cap (checked on every trade), ${r.minHolders} holders, ${solText(r.minFeesPaid)} SOL paid in trading fees and ${plural(r.minTradingHours, 'hour')} of trading history.`,
      ],
      [
        'New wallets',
        `A wallet first funded less than ${plural(r.minWalletAgeHours, 'hour')} ago can't trade yet.`,
      ],
    ],
    guards: [
      [
        "Pulled liquidity can't pay a short",
        `If a coin loses ${pct(r.rugGuardLiqDropBps)} of its pool liquidity within ${duration(r.rugGuardWindowSeconds)}, every position on it settles at its average price from before the drop. A dev who shorts and then pulls liquidity earns nothing.`,
      ],
      [
        "Insiders can't short their own coin",
        `The deployer, wallets it funded and the coin's top ${r.insiderTopHolders} holders at the moment you open are blocked from shorting it.`,
      ],
      [
        'The crowded side pays',
        `When one side of a coin outweighs the other by more than ${r.skewRatio} to 1, that side pays the other an hourly fee. Wallets piling into one short together pay for it.`,
      ],
      [
        'Hourly loss breaker',
        `If the pool loses ${pct(r.hourlyLossBreakerBps)} in an hour, new trades pause for ${plural(r.hourlyLossPauseMinutes, 'minute')}. Open positions keep running and can still be closed.`,
      ],
      [
        // The 72-hour upgrade timelock is the vault program's own (CLAUDE.md section 5), not a rule.
        'Verified, with a 72-hour timelock',
        "The vault program is verified on-chain. Any upgrade is published 72 hours before it can run, so you can withdraw first if you don't like it.",
      ],
      [
        'Your full balance, even if we go dark',
        `Every ${duration(r.balanceRootIntervalSeconds)} the engine posts a balance proof on-chain. If it stops for ${plural(r.emergencyStaleHours, 'hour')}, you can withdraw your whole balance, profits included, straight from the program.`,
      ],
    ],
    leverageChoice: `Pick ${list(
      lev.map((t) => `${t.leverage}x`),
      'or',
    )}`,
    minHold: `After ${plural(r.minHoldSeconds, 'second')} you can close any time.`,
    maxLeverageRisk: `At ${maxLev}x, a ${+(100 / maxLev).toFixed(1)}% move against you takes your whole stake.`,
  };
}
