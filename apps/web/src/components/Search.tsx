'use client';

import type { ReactNode } from 'react';
import { pct } from '@/lib/format';
import { chg1h, hot, type Coin } from '@/mock/sim';
import { useSim } from '@/mock/provider';
import { ComboSearch } from './ComboSearch';
import { Price, Tok } from './ui';

const CA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const caMsg = (v: string) =>
  CA_RE.test(v.trim())
    ? "That address isn't tradable yet. Coins open once they reach a $30K market cap, 100 holders and 7 SOL in trading fees."
    : 'No coin matches that. Paste a full contract address (32 to 44 characters) or a ticker like $GLOOP.';

function matches(coins: Coin[], v: string): string[] {
  const q = v.trim().replace(/^\$/, '').toLowerCase();
  if (!q)
    return coins
      .filter((c) => c.status === 'open')
      .sort((a, b) => hot(b) - hot(a))
      .slice(0, 5)
      .map((c) => c.sym);
  return coins
    .filter(
      (c) =>
        c.sym.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.mint.toLowerCase() === q,
    )
    .slice(0, 6)
    .map((c) => c.sym);
}

/**
 * The prototype's coin search: suggests "Moving now" coins when empty, and matches tickers, names and full
 * contract addresses.
 */
export function SearchBox({
  onPick,
  ...rest
}: {
  id: 'q1' | 'q2';
  placeholder: string;
  label: string;
  onPick: (c: Coin) => void;
  className: string;
  before?: ReactNode;
  after?: ReactNode;
}) {
  const sim = useSim();
  return (
    <ComboSearch
      {...rest}
      heading="Moving now"
      matches={(v) => matches(sim.coins, v)}
      resolve={(v) => (sim.bySym[v.replace(/^\$/, '').toUpperCase()] ?? sim.byMint[v])?.sym}
      emptyMsg={caMsg}
      onPick={(sym) => onPick(sim.bySym[sym]!)}
      renderItem={(sym) => {
        const c = sim.bySym[sym]!;
        const ch = chg1h(c);
        return (
          <>
            <Tok s={c.sym} logo={c.logo} size={26} />
            <span>
              <b>${c.sym}</b>
              <small>
                {c.name}, {c.venue}
              </small>
            </span>
            <span className="r n">
              <Price p={c.price} />
              <br />
              <small className={ch >= 0 ? 'up' : 'dn'}>{pct(ch)}</small>
            </span>
          </>
        );
      }}
    />
  );
}
