'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { fundingText } from '@/hl/format';
import { change24h, marketHref, pair, type Market } from '@/hl/markets';
import { useHl } from '@/hl/provider';
import type { Side, SortKey, Status } from '@/hl/store';
import { M, pct, usd } from '@/lib/format';
import { Price, Px } from '../ui';
import { LiveMap, MAP_RANGE } from './LiveMap';
import { LiveTicket } from './LiveTicket';
import { statusText } from './status';
import { CoinTok } from './CoinTok';

/* ---------- hero ---------- */
const TRUST = [
  {
    icon: (
      <path
        d="M8 1.5l5.5 2.2v4.1c0 3.2-2.3 5.6-5.5 6.7-3.2-1.1-5.5-3.5-5.5-6.7V3.7z"
        fill="none"
        stroke="#EDEDED"
        strokeWidth="1.3"
      />
    ),
    b: 'Your funds stay yours',
    s: 'They sit in your own Hyperliquid account. Coinside never holds them.',
  },
  {
    icon: (
      <>
        <circle cx="8" cy="8" r="6.4" fill="none" stroke="#EDEDED" strokeWidth="1.3" />
        <path
          d="M5.3 8.2l1.8 1.8 3.7-3.9"
          fill="none"
          stroke="#EDEDED"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
    b: 'A real order book',
    s: "Every order fills on Hyperliquid's book, against real buyers and sellers",
  },
  {
    icon: (
      <>
        <rect x="2" y="4" width="12" height="9" rx="2" fill="none" stroke="#EDEDED" strokeWidth="1.3" />
        <path d="M10.5 8.5h1.5" stroke="#EDEDED" strokeWidth="1.3" strokeLinecap="round" />
      </>
    ),
    b: 'Straight from Solana',
    s: 'Deposit SOL or USDC from your Solana wallet, and withdraw back to it',
  },
];

function Hero() {
  const hl = useHl();
  const n = hl.markets.length;
  return (
    <div className="hero">
      <div>
        <span className="status" role="status">
          <i className={`dot${hl.status === 'live' ? '' : ' off'}`}></i>
          {statusText(hl.status)}
        </span>
        <h1 id="h-hero">
          <span>Every coin has</span>
          <span>two sides.</span>
          <span>Pick one.</span>
        </h1>
        <p className="sub">
          Go long or short on SOL, BTC and{' '}
          {n > 2 ? `${n - 2} more markets` : "the rest of Hyperliquid's markets"}, straight from your Solana
          wallet. Orders fill on Hyperliquid&apos;s order book, so there is always someone on the other side.
        </p>
        <div className="ctas">
          <Link className="btn w lg" href={marketHref(hl.sel)}>
            Open the terminal
          </Link>
          <Link className="btn o lg" href="/docs">
            How it works
          </Link>
        </div>
        <ul className="trust">
          {TRUST.map((t) => (
            <li key={t.b}>
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
                {t.icon}
              </svg>
              <div>
                <b>{t.b}</b>
                <span>{t.s}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <LiveTicket />
    </div>
  );
}

/* ---------- lists ---------- */
function Lr({ m, sub, children }: { m: Market; sub: string; children: ReactNode }) {
  return (
    <Link className="lr" href={marketHref(m.name)}>
      <CoinTok name={m.name} size={28} />
      <span style={{ minWidth: 0 }}>
        <b>{m.name}</b>
        <small>{sub}</small>
      </span>
      <span className="r">{children}</span>
    </Link>
  );
}

function ListPanel({
  id,
  title,
  note,
  list,
  status,
}: {
  id: string;
  title: string;
  note: string;
  list: Market[];
  status: Status;
}) {
  return (
    <div className="pn">
      <div className="pn-h">
        <h3>{title}</h3>
        <span className="c">{note}</span>
      </div>
      <div id={id}>
        {list.map((m) => (
          <Lr key={m.name} m={m} sub={`${usd(m.volume)} traded, up to ${m.maxLeverage}x`}>
            <Price p={m.px} sz={m.szDecimals} />
            <small className={change24h(m) >= 0 ? 'up' : 'dn'}>{pct(change24h(m))}</small>
          </Lr>
        ))}
        {!list.length && <p className="ob-msg">{statusText(status)}</p>}
      </div>
    </div>
  );
}

function Lists() {
  const hl = useHl();
  // Re-ranked on each snapshot, not on every price tick, like the prototype's renderLists.
  const lists = useMemo(() => {
    const ms = hl.markets.filter((m) => m.volume > 0);
    const byChange = [...ms].sort((a, b) => change24h(b) - change24h(a));
    return {
      up: byChange.slice(0, 5),
      down: byChange.slice(-5).reverse(),
      vol: [...ms].sort((a, b) => b.volume - a.volume).slice(0, 5),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hl.rowsKey]);
  return (
    <div className="cols3">
      <ListPanel id="l-up" title="Top gainers" note="24h" list={lists.up} status={hl.status} />
      <ListPanel id="l-down" title="Top losers" note="24h" list={lists.down} status={hl.status} />
      <ListPanel id="l-vol" title="Most traded" note="24h volume" list={lists.vol} status={hl.status} />
    </div>
  );
}

/* ---------- markets table ---------- */
const COLS: Array<[string, SortKey | null, string]> = [
  ['Market', 'name', ''],
  ['Price', 'px', ''],
  ['24h', 'change', 'c-ch'],
  ['Volume', 'volume', 'c-vol'],
  ['Open interest', 'oi', 'c-oi'],
  ['Funding, 1h', 'funding', 'c-fd'],
  ['Max', 'lev', 'c-lv'],
  ['', null, 'r'],
];

const SORTF: Record<SortKey, (m: Market) => number | string> = {
  name: (m) => m.name.toLowerCase(),
  px: (m) => m.px,
  change: change24h,
  volume: (m) => m.volume,
  oi: (m) => m.oi,
  funding: (m) => m.funding,
  lev: (m) => m.maxLeverage,
};

function MarketsTable() {
  const hl = useHl();
  const router = useRouter();
  const { q, sort } = hl.table;
  const open = (name: string, side?: Side) => {
    if (side) hl.set((s) => void (s.draft.side = side));
    router.push(marketHref(name));
  };
  // Row order is rebuilt on sort, filter or a new snapshot only, like the prototype's buildRows.
  const order = useMemo(() => {
    const qq = q.trim().toLowerCase().replace(/^\$/, '');
    const f = SORTF[sort.k];
    return hl.markets
      .filter((m) => !qq || m.name.toLowerCase().includes(qq))
      .sort((a, b) => {
        const x = f(a);
        const y = f(b);
        return sort.d * (x < y ? -1 : x > y ? 1 : 0);
      })
      .map((m) => m.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sort.k, sort.d, hl.rowsKey]);

  return (
    <div className="pn">
      <div className="pn-h">
        <h3>All markets</h3>
        <span className="c" id="mkCount">
          {hl.markets.length ? `${hl.markets.length} markets` : ''}
        </span>
        <label className="filter end">
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="#6E6E6E" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="#6E6E6E" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="vh">Filter markets</span>
          <input
            id="mq"
            placeholder="Filter by ticker"
            value={q}
            onChange={(e) => hl.set((s) => void (s.table.q = e.target.value))}
          />
        </label>
      </div>
      <div role="table" aria-label="All markets">
        <div className="mk hl hd" role="row" id="mkHead">
          {COLS.map(([l, k, cl]) => {
            const on = k !== null && sort.k === k;
            return (
              <span
                key={l || 'act'}
                className={cl || undefined}
                role="columnheader"
                aria-sort={on ? (sort.d < 0 ? 'descending' : 'ascending') : undefined}
              >
                {k ? (
                  <button
                    onClick={() =>
                      hl.set(
                        (s) =>
                          void (s.table.sort =
                            s.table.sort.k === k
                              ? { k, d: s.table.sort.d === 1 ? -1 : 1 }
                              : { k, d: k === 'name' ? 1 : -1 }),
                      )
                    }
                  >
                    {l}
                    {on ? (sort.d < 0 ? ' ↓' : ' ↑') : ''}
                  </button>
                ) : (
                  <span className="vh">Trade</span>
                )}
              </span>
            );
          })}
        </div>
        <div id="rows" role="rowgroup">
          {order.length ? (
            order.map((name) => {
              const m = hl.byName[name];
              if (!m) return null;
              const ch = change24h(m);
              return (
                <div
                  key={name}
                  className="mk hl"
                  role="row"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('[data-trade]')) return;
                    open(name);
                  }}
                >
                  <div className="tk" role="cell">
                    <CoinTok name={m.name} size={28} />
                    <div style={{ minWidth: 0 }}>
                      <Link href={marketHref(name)} onClick={(e) => e.stopPropagation()}>
                        <b>{m.name}</b>
                      </Link>
                      <small>{pair(m.name)}</small>
                    </div>
                  </div>
                  <Px as="div" role="cell" className="n" p={m.px} prev={m.prev} sz={m.szDecimals} />
                  <div role="cell" className="c-ch">
                    <span className={`chg ${ch >= 0 ? 'up' : 'dn'}`}>{pct(ch)}</span>
                  </div>
                  <div role="cell" className="c-vol n">
                    {usd(m.volume)}
                  </div>
                  <div role="cell" className="c-oi n t2">
                    {usd(m.oi)}
                  </div>
                  <div role="cell" className={`c-fd n ${m.funding < 0 ? 'dn' : 't2'}`}>
                    {fundingText(m.funding)}
                  </div>
                  <div role="cell" className="c-lv">
                    <span className={`lev${m.maxLeverage >= 20 ? ' hi' : ''}`}>{m.maxLeverage}x</span>
                  </div>
                  <div role="cell" className="acts r">
                    <button className="sb s" data-trade={name} onClick={() => open(name, 'short')}>
                      Short
                    </button>
                    <button className="sb l" data-trade={name} onClick={() => open(name, 'long')}>
                      Long
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div role="row">
              <div className="empty" role="cell">
                {hl.markets.length ? (
                  <>
                    <b>No markets match</b>Try a ticker like SOL, BTC or HYPE.
                  </>
                ) : (
                  <>
                    <b>{hl.status === 'down' ? "Can't reach Hyperliquid right now" : 'Loading markets'}</b>
                    {hl.status === 'down'
                      ? 'Prices show up here as soon as it answers.'
                      : 'Prices come straight from Hyperliquid.'}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function LiveMarketsView() {
  return (
    <section id="v-markets" aria-labelledby="h-hero">
      <div className="wrap">
        <Hero />
      </div>
      <div className="wrap sec">
        <div className="sec-h">
          <div>
            <h2>Market map</h2>
            <p>Size is 24h volume. Color is the move over 24 hours.</p>
          </div>
          <div className="mapbar">
            <span>
              {M}
              {MAP_RANGE * 100}%
            </span>
            <i></i>
            <span>+{MAP_RANGE * 100}%</span>
          </div>
        </div>
        <LiveMap />
      </div>
      <div className="wrap sec">
        <Lists />
      </div>
      <div className="wrap sec last">
        <MarketsTable />
      </div>
    </section>
  );
}
