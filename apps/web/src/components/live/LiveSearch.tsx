'use client';

import type { ReactNode } from 'react';
import { change24h, findMarket, pair, tokName, type Market } from '@/hl/markets';
import { useHl } from '@/hl/provider';
import { pct } from '@/lib/format';
import { ComboSearch } from '../ComboSearch';
import { Price, Tok } from '../ui';

const CA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const marketMsg = (v: string) =>
  CA_RE.test(v.trim())
    ? "Coinside trades Hyperliquid's markets, not contract addresses. Try a ticker like SOL or BTC."
    : 'No market matches that. Try a ticker like SOL, BTC or HYPE.';

/** Most traded first when empty; otherwise names that start with the text, then names that contain it. */
export function marketMatches(ms: Market[], v: string, n = 6): string[] {
  const q = v.trim().replace(/^\$/, '').toLowerCase();
  if (!q)
    return [...ms]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5)
      .map((m) => m.name);
  const starts = (m: Market) => (m.name.toLowerCase().startsWith(q) ? 0 : 1);
  return ms
    .filter((m) => m.name.toLowerCase().includes(q))
    .sort((a, b) => starts(a) - starts(b) || b.volume - a.volume)
    .slice(0, n)
    .map((m) => m.name);
}

/** Search Hyperliquid's markets: the header box (q1) and the Quick trade ticket (q2). */
export function LiveSearchBox({
  onPick,
  ...rest
}: {
  id: 'q1' | 'q2';
  placeholder: string;
  label: string;
  onPick: (name: string) => void;
  className: string;
  before?: ReactNode;
  after?: ReactNode;
}) {
  const hl = useHl();
  return (
    <ComboSearch
      {...rest}
      heading="Most traded"
      matches={(v) => marketMatches(hl.markets, v)}
      resolve={(v) => findMarket(hl.markets, v)?.name}
      emptyMsg={(v) =>
        hl.markets.length
          ? marketMsg(v)
          : hl.status === 'down'
            ? "Can't reach Hyperliquid right now. Markets show up as soon as it answers."
            : 'Loading markets from Hyperliquid.'
      }
      onPick={onPick}
      renderItem={(name) => {
        const m = hl.byName[name]!;
        const ch = change24h(m);
        return (
          <>
            <Tok s={tokName(m.name)} size={26} />
            <span>
              <b>{m.name}</b>
              <small>
                {pair(m.name)}, up to {m.maxLeverage}x
              </small>
            </span>
            <span className="r n">
              <Price p={m.px} sz={m.szDecimals} />
              <br />
              <small className={ch >= 0 ? 'up' : 'dn'}>{pct(ch)}</small>
            </span>
          </>
        );
      }}
    />
  );
}
