'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PRELAUNCH } from '@/lib/edition';
import { VENUES } from '@/mock/fixtures';
import { ago, fixed, pct, sgn, shortA, sol, usd } from '@/lib/format';
import {
  SORTF,
  chg1h,
  hot,
  maxLev,
  mcap,
  shortShare,
  solF,
  type Coin,
  type FeedItem,
  type SortKey,
  type TapeItem,
} from '@/mock/sim';
import { useSim } from '@/mock/provider';
import { useOpenTrade } from '../nav';
import { Price, Px, Shield, SideChip, Tok } from '../ui';
import { MarketMap } from './MarketMap';
import { QuickTicket } from './QuickTicket';

/* ---------- tape ---------- */
function TapeRun({ items, hidden }: { items: TapeItem[]; hidden?: boolean }) {
  const sim = useSim();
  return (
    <>
      {items.map((it, i) => (
        <span key={i} aria-hidden={hidden || undefined}>
          <Tok s={it.sym} logo={sim.bySym[it.sym]?.logo} size={18} />
          <b>${it.sym}</b>
          <SideChip side={it.side} lev={it.lev} />
          <span className={`n ${it.kind === 'open' ? 't2' : it.pnl >= 0n ? 'up' : 'dn'}`}>
            {it.kind === 'open' ? fixed(it.size) + ' SOL' : sgn(it.pnl)}
          </span>
        </span>
      ))}
    </>
  );
}

function Tape() {
  const sim = useSim();
  const [items, setItems] = useState(() => sim.tapeItems());
  return (
    <div className="tape" role="marquee" aria-label="Recent trades">
      <div
        className="tape-in"
        id="tape"
        onAnimationIteration={() => {
          sim.refreshTape();
          setItems(sim.tapeItems());
        }}
      >
        <TapeRun items={items} />
        <TapeRun items={items} hidden />
      </div>
    </div>
  );
}

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
    b: 'Rug guard on every coin',
    s: 'Pulled liquidity settles at the price before the drop',
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
    b: 'Verified vault program',
    s: 'Every upgrade waits 72 hours in public',
  },
  {
    icon: (
      <>
        <rect x="2" y="4" width="12" height="9" rx="2" fill="none" stroke="#EDEDED" strokeWidth="1.3" />
        <path d="M10.5 8.5h1.5" stroke="#EDEDED" strokeWidth="1.3" strokeLinecap="round" />
      </>
    ),
    b: 'Your full balance, always',
    s: 'Withdraw from the program even if we go offline',
  },
];

function Hero() {
  const sim = useSim();
  return (
    <div className="hero">
      <div>
        <span className="status">
          {/* Back to "Live on Solana mainnet" once prices come from mainnet (P1). */}
          <i className="dot"></i>Preview with simulated data
        </span>
        <h1 id="h-hero">
          <span>Every coin has</span>
          <span>two sides.</span>
          <span>Pick one.</span>
        </h1>
        <p className="sub">
          Paste any Solana contract address and go long or short at up to 10x. You trade against the pool, so
          it fills the moment you click, and you close whenever you want.
        </p>
        <div className="ctas">
          <Link className="btn w lg" href={`/trade/${sim.bySym[sim.sel]!.mint}`}>
            Open the terminal
          </Link>
          {!PRELAUNCH && (
            <button
              className="btn o lg"
              id="ctaPractice"
              onClick={() => {
                sim.setMode('practice');
                if (sim.bal() <= 0n) sim.claim();
                document.querySelector<HTMLInputElement>('#tk-amt')?.focus();
              }}
            >
              Try it with paper SOL
            </button>
          )}
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
      <QuickTicket />
    </div>
  );
}

/* ---------- stats ---------- */
export function StatsStrip() {
  const sim = useSim();
  const ow = sim.owed();
  return (
    <dl className="stats" aria-label="Protocol stats">
      <div>
        <dt>Pool</dt>
        <dd id="s-pool">
          {sol(sim.pool.value)}
          <small>SOL</small>
        </dd>
      </div>
      <div>
        <dt>Vault, on-chain</dt>
        <dd id="s-held">
          {sol(ow + sim.buffer)}
          <small>SOL</small>
        </dd>
      </div>
      <div>
        <dt>Volume, 24h</dt>
        <dd id="s-vol">
          {sol(sim.vol24, 1)}
          <small>SOL</small>
        </dd>
      </div>
      <div>
        <dt>Trades, 24h</dt>
        <dd id="s-tr">{sim.trades24.toLocaleString('en-US')}</dd>
      </div>
      <div>
        <dt>Paid to winners, 24h</dt>
        <dd id="s-paid">
          {sol(sim.paid24)}
          <small>SOL</small>
        </dd>
      </div>
      <div>
        <dt>Fees</dt>
        <dd>
          1%<small>in</small> 1%<small>out</small>
        </dd>
      </div>
    </dl>
  );
}

/* ---------- lists ---------- */
function Lr({ c, children, onOpen }: { c: Coin; children: React.ReactNode; onOpen: (sym: string) => void }) {
  return (
    <button className="lr" onClick={() => onOpen(c.sym)}>
      <Tok s={c.sym} logo={c.logo} size={28} />
      <span style={{ minWidth: 0 }}>
        <b>${c.sym}</b>
        <small>
          {c.venue}, {Math.round(solF(c.liq)).toLocaleString('en-US')} SOL liquidity
        </small>
      </span>
      <span className="r">{children}</span>
    </button>
  );
}

function Lists() {
  const sim = useSim();
  const openTrade = useOpenTrade();
  // Re-rendered every 4 ticks (and on rug guard), like the prototype's renderLists.
  const lists = useMemo(() => {
    const open = sim.coins.filter((c) => c.status === 'open');
    const snap = (c: Coin) => ({
      c,
      price: c.price,
      ch: chg1h(c),
      mc: mcap(c),
      ss: shortShare(c),
      oiS: c.oiS,
      liq: c.liq,
    });
    return {
      hot: [...open]
        .sort((a, b) => hot(b) - hot(a))
        .slice(0, 5)
        .map(snap),
      short: [...open]
        .filter((c) => c.oiS > 200_000_000n)
        .sort((a, b) => shortShare(b) - shortShare(a))
        .slice(0, 5)
        .map(snap),
      big: [...open]
        .sort((a, b) => mcap(b) - mcap(a))
        .slice(0, 5)
        .map(snap),
      liquid: [...open]
        .sort((a, b) => (b.liq > a.liq ? 1 : b.liq < a.liq ? -1 : 0))
        .slice(0, 5)
        .map(snap),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.listsKey]);
  return (
    <div className="cols3">
      <div className="pn">
        <div className="pn-h">
          <h3>Hot</h3>
          <span className="c">biggest 1h moves</span>
        </div>
        <div id="l-hot">
          {lists.hot.map((x) => (
            <Lr key={x.c.sym} c={x.c} onOpen={openTrade}>
              <Price p={x.price} />
              <small className={x.ch >= 0 ? 'up' : 'dn'}>{pct(x.ch)}</small>
            </Lr>
          ))}
        </div>
      </div>
      {PRELAUNCH ? (
        // Before launch there is no open interest to rank, so the middle list is market data too.
        <div className="pn">
          <div className="pn-h">
            <h3>Most liquid</h3>
            <span className="c">SOL in their pools</span>
          </div>
          <div id="l-liq">
            {lists.liquid.map((x) => (
              <Lr key={x.c.sym} c={x.c} onOpen={openTrade}>
                {Math.round(solF(x.liq)).toLocaleString('en-US')} SOL
                <small>up to {maxLev(x.c)}x</small>
              </Lr>
            ))}
          </div>
        </div>
      ) : (
        <div className="pn">
          <div className="pn-h">
            <h3>Most shorted</h3>
            <span className="c">share of open size</span>
          </div>
          <div id="l-short">
            {lists.short.map((x) => (
              <Lr key={x.c.sym} c={x.c} onOpen={openTrade}>
                <span className="dn">{(x.ss * 100).toFixed(0)}% short</span>
                <small>{fixed(x.oiS)} SOL</small>
              </Lr>
            ))}
          </div>
        </div>
      )}
      <div className="pn">
        <div className="pn-h">
          <h3>Big caps</h3>
          <span className="c">by market cap</span>
        </div>
        <div id="l-big">
          {lists.big.map((x) => (
            <Lr key={x.c.sym} c={x.c} onOpen={openTrade}>
              {usd(x.mc)}
              <small className={x.ch >= 0 ? 'up' : 'dn'}>{pct(x.ch)}</small>
            </Lr>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- markets table ---------- */
const ALL_COLS: Array<[string, SortKey | null, string]> = [
  ['Token', null, ''],
  ['Price', 'price', ''],
  ['1h', 'chg', 'c-ch'],
  ['Market cap', 'mcap', 'c-mc'],
  ['Liquidity', 'liq', 'c-liq'],
  ['Long vs short', 'short', 'c-ls'],
  ['Max', null, 'c-lv'],
  ['', null, 'r'],
];
// Long vs short is the platform's own open interest, which doesn't exist before launch.
const COLS = PRELAUNCH ? ALL_COLS.filter(([, , cl]) => cl !== 'c-ls') : ALL_COLS;
const ROW = PRELAUNCH ? 'mk pre' : 'mk';

function LsBar({ c }: { c: Coin }) {
  const sp = shortShare(c);
  return (
    <>
      <div className="bar">
        <i className="l" style={{ width: `${((1 - sp) * 100).toFixed(1)}%` }}></i>
        <i className="s" style={{ width: `${(sp * 100).toFixed(1)}%` }}></i>
      </div>
      <small>
        {(sp * 100).toFixed(0)}% short, {fixed(c.oiL + c.oiS, 1)} SOL open
      </small>
    </>
  );
}

function MarketsTable() {
  const sim = useSim();
  const openTrade = useOpenTrade();
  const { q, venue, sort } = sim.table;
  // Row order is rebuilt only on sort, filter, venue or rug guard, like the prototype's buildRows.
  const order = useMemo(() => {
    const qq = q.trim().toLowerCase().replace(/^\$/, '');
    return sim.coins
      .filter(
        (c) =>
          (venue === 'all' || c.venue === venue) &&
          (!qq ||
            c.sym.toLowerCase().includes(qq) ||
            c.name.toLowerCase().includes(qq) ||
            c.mint.toLowerCase() === qq),
      )
      .sort(
        (a, b) =>
          Number(a.status !== 'open') - Number(b.status !== 'open') ||
          sort.d * (SORTF[sort.k](a) - SORTF[sort.k](b)),
      )
      .map((c) => c.sym);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, venue, sort.k, sort.d, sim.rowsKey]);

  return (
    <div className="pn">
      <div className="pn-h">
        <h3>All markets</h3>
        <span className="c" id="mkCount">
          {sim.coins.filter((c) => c.status === 'open').length} open
        </span>
        <div className="vchips" role="group" aria-label="Venue" id="vchips">
          {(['all', ...VENUES] as const).map((v) => (
            <button
              key={v}
              data-v={v}
              aria-pressed={v === venue}
              onClick={() => sim.set((s) => void (s.table.venue = v))}
            >
              {v === 'all' ? 'All' : v}
            </button>
          ))}
        </div>
        <label className="filter end">
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="#6E6E6E" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="#6E6E6E" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="vh">Filter markets</span>
          <input
            id="mq"
            placeholder="Filter by name or ticker"
            value={q}
            onChange={(e) => sim.set((s) => void (s.table.q = e.target.value))}
          />
        </label>
      </div>
      <div role="table" aria-label="All markets">
        <div className={`${ROW} hd`} role="row" id="mkHead">
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
                      sim.set(
                        (s) =>
                          void (s.table.sort =
                            s.table.sort.k === k ? { k, d: -s.table.sort.d } : { k, d: -1 }),
                      )
                    }
                  >
                    {l}
                    {on ? (sort.d < 0 ? ' ↓' : ' ↑') : ''}
                  </button>
                ) : l ? (
                  l
                ) : (
                  <span className="vh">Trade</span>
                )}
              </span>
            );
          })}
        </div>
        <div id="rows" role="rowgroup">
          {order.length ? (
            order.map((sym) => {
              const c = sim.bySym[sym]!;
              const ch = chg1h(c);
              const ml = maxLev(c);
              const off = c.status !== 'open';
              return (
                <div
                  key={sym}
                  className={`${ROW}${off ? ' off' : ''}`}
                  role="row"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('[data-trade]')) return;
                    if (off)
                      sim.toast(
                        '$' +
                          c.sym +
                          ' is paused. The rug guard settled every position on it after its liquidity was pulled.',
                      );
                    else openTrade(c.sym);
                  }}
                >
                  <div className="tk" role="cell">
                    <Tok s={c.sym} logo={c.logo} size={28} />
                    <div style={{ minWidth: 0 }}>
                      <b>${c.sym}</b>
                      <small>
                        {c.name}, {c.venue}
                      </small>
                    </div>
                  </div>
                  <Px as="div" role="cell" className="n" p={c.price} prev={c.prev} />
                  <div role="cell" className="c-ch">
                    <span className={`chg ${ch >= 0 ? 'up' : 'dn'}`}>{pct(ch)}</span>
                  </div>
                  <div role="cell" className="c-mc n">
                    {usd(mcap(c))}
                  </div>
                  <div role="cell" className="c-liq n t2">
                    {Math.round(solF(c.liq)).toLocaleString('en-US')} SOL
                  </div>
                  {!PRELAUNCH && (
                    <div role="cell" className="c-ls ls">
                      <LsBar c={c} />
                    </div>
                  )}
                  <div role="cell" className="c-lv">
                    <span className={`lev${ml === 10 ? ' hi' : ''}`}>{ml}x</span>
                  </div>
                  <div role="cell" className="acts r">
                    {off ? (
                      <span className="paused">Paused by rug guard</span>
                    ) : (
                      <>
                        <button className="sb s" data-trade={c.sym} onClick={() => openTrade(c.sym, 'short')}>
                          Short
                        </button>
                        <button className="sb l" data-trade={c.sym} onClick={() => openTrade(c.sym, 'long')}>
                          Long
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div role="row">
              <div className="empty" role="cell">
                <b>No coins match</b>Paste the full contract address in Quick trade to check if it&apos;s
                tradable.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- live trades + wins ---------- */
function FeedRow({ it, now }: { it: FeedItem; now: number }) {
  const sim = useSim();
  const logo = sim.bySym[it.sym]?.logo;
  const fresh = now - it.at < 600;
  if (it.kind === 'guard')
    return (
      <li className={`fi guard${fresh ? ' new' : ''}`}>
        <span className="gi">
          <Shield c="#EDEDED" s={13} />
        </span>
        <div>
          <b>
            Rug guard settled <Tok s={it.sym} logo={logo} size={16} inline />${it.sym}
          </b>
          <div className="t3" style={{ fontSize: '12.5px' }}>
            Its liquidity fell {it.drop}% in under a minute. {it.n} positions closed at the price from before
            the drop.
          </div>
        </div>
      </li>
    );
  const verb = it.kind === 'open' ? 'opened' : it.kind === 'liq' ? 'liquidated' : 'closed';
  const s = (now - it.at) / 1000;
  return (
    <li className={`fi${fresh ? ' new' : ''}`}>
      <Tok s={it.sym} logo={logo} size={28} />
      <div style={{ minWidth: 0 }}>
        <b>${it.sym}</b> <SideChip side={it.side} lev={it.lev} /> <span className="t3">{verb}</span>
        <div className="w">{it.mine ? 'You' : shortA(it.w ?? '')}</div>
      </div>
      <span className={`v ${it.kind === 'open' ? '' : (it.pnl ?? 0n) >= 0n ? 'up' : 'dn'}`}>
        {it.kind === 'open' ? fixed(it.size) + ' SOL' : sgn(it.pnl ?? 0n)}
      </span>
      <span className="ago">{s < 2 ? 'now' : ago(s * 1000)}</span>
    </li>
  );
}

function LiveTrades() {
  const sim = useSim();
  // Before the first tick, measure ages from the sim's boot so the server and client render agree.
  const now = sim.t === 0 ? sim.bootAt : Date.now();
  return (
    <div className="pn">
      <div className="pn-h">
        <h3>Live trades</h3>
        <span className="c" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i className="dot"></i>real SOL
        </span>
      </div>
      <ol id="feed">
        {sim.feed.slice(0, 10).map((it) => (
          <FeedRow key={it.id} it={it} now={now} />
        ))}
      </ol>
    </div>
  );
}

export function TopWins() {
  const sim = useSim();
  const mine = sim.history
    .filter((h) => h.net > 0n)
    .map((h) => ({
      sym: h.sym,
      side: h.side,
      lev: h.lev,
      w: 'You',
      pnl: h.net,
      pc: Number((h.net * 10_000n) / h.stake) / 10_000,
      me: true,
    }));
  const all = [...mine, ...sim.wins].sort((a, b) => (b.pnl > a.pnl ? 1 : b.pnl < a.pnl ? -1 : 0)).slice(0, 6);
  return (
    <div className="pn">
      <div className="pn-h">
        <h3>Top wins today</h3>
        <Link className="btn sm o end" href="/leaderboard">
          Leaderboard
        </Link>
      </div>
      <div id="wins">
        {all.map((w, i) => (
          <div className="wn" key={i}>
            <span className="rk">{i + 1}</span>
            <Tok s={w.sym} logo={sim.bySym[w.sym]?.logo} size={28} />
            <div style={{ minWidth: 0 }}>
              <b>${w.sym}</b> <SideChip side={w.side} lev={w.lev} />
              <span className="w">{'me' in w && w.me ? 'You' : shortA(w.w)}</span>
            </div>
            <span className="v up">
              +{fixed(w.pnl, 3)}
              <small>{pct(w.pc, 0)}</small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarketsView() {
  return (
    <section id="v-markets" aria-labelledby="h-hero">
      {!PRELAUNCH && <Tape />}
      <div className="wrap">
        <Hero />
        {!PRELAUNCH && <StatsStrip />}
      </div>
      <div className="wrap sec">
        <div className="sec-h">
          <div>
            <h2>Market map</h2>
            <p>Size is 24h volume. Color is the move over the last hour.</p>
          </div>
          <div className="mapbar">
            <span>{'−'}30%</span>
            <i></i>
            <span>+30%</span>
          </div>
        </div>
        <MarketMap />
      </div>
      <div className="wrap sec">
        <Lists />
      </div>
      <div className={`wrap sec${PRELAUNCH ? ' last' : ''}`}>
        <MarketsTable />
      </div>
      {!PRELAUNCH && (
        <div className="wrap sec">
          <div className="cols2">
            <LiveTrades />
            <TopWins />
          </div>
        </div>
      )}
    </section>
  );
}
