'use client';

import type { JSX } from 'react';
import { fundingText, levChoices, liqPrice, sizeFor, szText } from '@/hl/format';
import type { Market } from '@/hl/markets';
import type { Draft, Side } from '@/hl/store';
import { Price } from '../ui';

/** The draft's leverage on this market: kept if the market offers it, else the next lower choice. */
export function levFor(m: Market, lev: number): number {
  const c = levChoices(m.maxLeverage);
  return c.includes(lev) ? lev : (c.filter((l) => l <= lev).pop() ?? c[0]!);
}

/** A typed amount as a number, 0 if it isn't one. */
export const amount = (s: string): number => {
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function Sides({ id, side, onPick }: { id: string; side: Side; onPick: (s: Side) => void }) {
  return (
    <div className="sides" id={id} role="group" aria-label="Side">
      {(['long', 'short'] as const).map((sd) => (
        <button key={sd} type="button" data-side={sd} aria-pressed={side === sd} onClick={() => onPick(sd)}>
          {sd === 'long' ? 'Long' : 'Short'}
        </button>
      ))}
    </div>
  );
}

export function LevButtons({
  id,
  m,
  lev,
  onPick,
}: {
  id: string;
  m: Market;
  lev: number;
  onPick: (l: number) => void;
}) {
  const choices = levChoices(m.maxLeverage);
  return (
    <div
      className="levs"
      id={id}
      role="group"
      aria-label="Leverage"
      style={{ gridTemplateColumns: `repeat(${choices.length},1fr)` }}
    >
      {choices.map((l) => (
        <button key={l} data-lev={l} type="button" aria-pressed={l === lev} onClick={() => onPick(l)}>
          {l}x
        </button>
      ))}
    </div>
  );
}

/** Where a take profit or stop loss set as a % of margin would trigger. */
export function triggerPx(entry: number, lev: number, side: Side, pctOfMargin: number): number {
  return entry * (1 + ((side === 'long' ? 1 : -1) * pctOfMargin) / 100 / lev);
}

/**
 * Estimates for an order: the ticket shows the first four rows, the terminal all of them. Rounded the safe
 * way: sizes down, and the liquidation price is Hyperliquid's own formula before fees.
 */
export function Summary({ m, d, lev, rows = 7 }: { m: Market; d: Draft; lev: number; rows?: number }) {
  const limit = d.type === 'limit' ? amount(d.limit) : 0;
  const entry = limit || m.px;
  const margin = amount(d.amt);
  const size = sizeFor(margin, lev, entry, m.szDecimals);
  const all: Array<[string, JSX.Element | string]> = [
    [d.type === 'limit' ? 'Limit price' : 'Price now', <Price key="p" p={entry} sz={m.szDecimals} />],
    [
      'Position size',
      `$${(margin * lev).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ],
    ['Size', `${szText(size, m.szDecimals)} ${m.name}`],
    [
      'Liquidation, about',
      <Price key="l" p={liqPrice(entry, lev, m.maxLeverage, d.side)} sz={m.szDecimals} />,
    ],
    [
      'Funding, 1h',
      <span key="f" title={m.funding >= 0 ? 'Longs pay shorts' : 'Shorts pay longs'}>
        {fundingText(m.funding)}
      </span>,
    ],
  ];
  const tp = amount(d.tp);
  const sl = amount(d.sl);
  if (d.tpsl && tp)
    all.push(['Take profit at', <Price key="tp" p={triggerPx(entry, lev, d.side, tp)} sz={m.szDecimals} />]);
  if (d.tpsl && sl && sl < 100)
    all.push(['Stop loss at', <Price key="sl" p={triggerPx(entry, lev, d.side, -sl)} sz={m.szDecimals} />]);
  return (
    <>
      {all.slice(0, rows).map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </>
  );
}
