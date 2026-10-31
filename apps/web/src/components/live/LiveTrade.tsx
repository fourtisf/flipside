'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { fundingCountdown, fundingText, pxText } from '@/hl/format';
import { change24h, findMarket, marketHref, pair, unitNote, type Market } from '@/hl/markets';
import { useActiveCtx, useHl } from '@/hl/provider';
import { pct, usd } from '@/lib/format';
import { Price, Px, Shield } from '../ui';
import { OrderBook, RecentTrades } from './BookTrades';
import { LiveChart, TFS, type Tf } from './LiveChart';
import { LevButtons, Sides, Summary, levFor } from './OrderBits';
import { statusText } from './status';
import { CoinTok } from './CoinTok';
import { AvailableNote } from './Wallet';
import { TradeButton } from './Trading';
import { OrdersPanel, PositionsPanel } from './LivePortfolio';
import { useAccount, useWallet } from '@/wallet/provider';

function Watchlist({ sel }: { sel: Market }) {
  const hl = useHl();
  const q = hl.watchQ.trim().toLowerCase().replace(/^\$/, '');
  // Order is fixed while you stay on a market (prototype renderWatch); prices update live.
  const list = useMemo(
    () =>
      hl.markets
        .filter((m) => !q || m.name.toLowerCase().includes(q))
        .sort((a, b) => b.volume - a.volume)
        .map((m) => m.name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, sel.name, hl.markets.length],
  );
  return (
    <div className="pn watch" role="region" aria-label="Markets">
      <label className="filter">
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="5" fill="none" stroke="#6E6E6E" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="#6E6E6E" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="vh">Filter</span>
        <input
          id="wq"
          placeholder="Filter markets"
          value={hl.watchQ}
          onChange={(e) => hl.set((s) => void (s.watchQ = e.target.value))}
        />
      </label>
      <ul id="watch">
        {list.length ? (
          list.map((name) => {
            const m = hl.byName[name];
            if (!m) return null;
            const ch = change24h(m);
            return (
              <li key={name}>
                <Link className="wi" href={marketHref(name)} scroll={false} aria-current={name === sel.name}>
                  <CoinTok name={name} size={24} />
                  <span>
                    <b>{name}</b>
                    <small>{usd(m.volume)}</small>
                  </span>
                  <span className="r">
                    <Price p={m.px} sz={m.szDecimals} />
                    <small className={ch >= 0 ? 'up' : 'dn'}>{pct(ch)}</small>
                  </span>
                </Link>
              </li>
            );
          })
        ) : (
          <li className="hint" style={{ padding: 10 }}>
            No markets match.
          </li>
        )}
      </ul>
    </div>
  );
}

function OrderPanel({ m }: { m: Market }) {
  const hl = useHl();
  const d = hl.draft;
  const lev = levFor(m, d.lev);
  return (
    <div className="pn order" aria-label="Order" role="group">
      <Sides id="o-side" side={d.side} onPick={(sd) => hl.set((s) => void (s.draft.side = sd))} />
      <div className="seg otype" role="group" aria-label="Order type" id="o-type">
        {(['market', 'limit'] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={d.type === t}
            onClick={() =>
              hl.set((s) => {
                s.draft.type = t;
                if (t === 'limit' && !s.draft.limit)
                  s.draft.limit = pxText(m.px, m.szDecimals).replace(/,/g, '');
              })
            }
          >
            {t === 'market' ? 'Market' : 'Limit'}
          </button>
        ))}
      </div>
      {d.type === 'limit' && (
        <>
          <div className="fl">
            <label htmlFor="o-px">Limit price</label>
            <b>USD</b>
          </div>
          <div className="amt">
            <input
              id="o-px"
              inputMode="decimal"
              value={d.limit}
              onChange={(e) => hl.set((s) => void (s.draft.limit = e.target.value))}
            />
            <span>USD</span>
          </div>
        </>
      )}
      <div className="fl">
        <label htmlFor="o-amt">Amount</label>
        <AvailableNote />
      </div>
      <div className="amt">
        <input
          id="o-amt"
          inputMode="decimal"
          value={d.amt}
          onChange={(e) => hl.set((s) => void (s.draft.amt = e.target.value))}
        />
        <span>USDC</span>
      </div>
      <div className="fl">
        <span>Leverage</span>
        <b id="o-levnow">{lev}x</b>
      </div>
      <LevButtons id="o-lev" m={m} lev={lev} onPick={(l) => hl.set((s) => void (s.draft.lev = l))} />
      <p className="hint" id="o-levhint">
        {m.name} allows up to {m.maxLeverage}x{m.onlyIsolated ? ', with isolated margin only.' : '.'}
      </p>
      <div className="swrow">
        <span id="tpslLab">Take profit and stop loss</span>
        <button
          type="button"
          className="switch"
          id="o-tpsl"
          role="switch"
          aria-checked={d.tpsl}
          aria-labelledby="tpslLab"
          onClick={() => hl.set((s) => void (s.draft.tpsl = !s.draft.tpsl))}
        ></button>
      </div>
      <div className="tpsl" id="o-tpslbox" hidden={!d.tpsl}>
        <label className="mini">
          <span className="vh">Take profit percent</span>
          <input
            id="o-tp"
            inputMode="decimal"
            placeholder="Take profit"
            value={d.tp}
            onChange={(e) => hl.set((s) => void (s.draft.tp = e.target.value))}
          />
          <span>% gain</span>
        </label>
        <label className="mini">
          <span className="vh">Stop loss percent</span>
          <input
            id="o-sl"
            inputMode="decimal"
            placeholder="Stop loss"
            value={d.sl}
            onChange={(e) => hl.set((s) => void (s.draft.sl = e.target.value))}
          />
          <span>% loss</span>
        </label>
      </div>
      <dl className="sum" id="o-sum">
        <Summary m={m} d={d} lev={lev} />
      </dl>
      <TradeButton id="o-cta" m={m} d={d} lev={lev} />
      <p className="ogd">
        <Shield c="#6E6E6E" s={13} style={{ flex: 'none', marginTop: 3 }} />
        Orders go straight to Hyperliquid&apos;s order book. Your funds stay in your own Hyperliquid account.
      </p>
    </div>
  );
}

/** The connected account's positions and orders, above the order book, once there are any. */
function MyTrades() {
  const wallet = useWallet();
  const account = useAccount();
  if (wallet.status !== 'connected' || (!account.positions.length && !account.orders?.length)) return null;
  return (
    <div className="stack mine">
      {account.positions.length > 0 && <PositionsPanel id="tv-mypos" />}
      {!!account.orders?.length && <OrdersPanel id="tv-myorders" />}
    </div>
  );
}

/** A clock that ticks every second, for the funding countdown. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Terminal({ m }: { m: Market }) {
  const hl = useHl();
  const now = useNow();
  const [tf, setTf] = useState<Tf>('15m');
  const [flip, setFlip] = useState(false);
  useActiveCtx(m.name);
  const ch = change24h(m);
  const sz = m.szDecimals;
  const stats: Array<[string, string]> = [
    ['Mark', pxText(m.mark, sz)],
    ['Oracle', pxText(m.oracle, sz)],
    ['24h volume', usd(m.volume)],
    ['Open interest', usd(m.oi)],
    ['Funding, 1h', `${fundingText(m.funding)} in ${fundingCountdown(now)}`],
    ['Max leverage', `${m.maxLeverage}x`],
  ];

  useEffect(() => {
    if (hl.sel !== m.name) hl.set((s) => void (s.sel = m.name));
  }, [hl, m.name]);

  return (
    <section id="v-trade" className="wrap tv" aria-labelledby="th-title">
      <div className="thd">
        <div className="th-tok">
          <span id="th-tok">
            <CoinTok name={m.name} size={36} />
          </span>
          <div>
            <h1 id="th-title">{pair(m.name)}</h1>
            <small>
              <span id="th-venue">
                Perpetual on Hyperliquid{unitNote(m.name) ? `, ${unitNote(m.name)}` : ''}
              </span>
            </small>
          </div>
        </div>
        <div className="th-px">
          <Px as="b" p={m.px} prev={m.prev} sz={sz} />
          <span id="th-chg" className={`chg ${ch >= 0 ? 'up' : 'dn'}`}>
            {pct(ch)} 24h
          </span>
        </div>
        {/* scrolls sideways on phones, so it takes keyboard focus */}
        <dl className="th-stats" id="th-stats" tabIndex={0}>
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      {hl.status === 'stale' && (
        <div className="guardbox" role="status">
          {statusText('stale')}
        </div>
      )}
      <div className="tgrid">
        <Watchlist sel={m} />
        <div className="pn chart">
          <div className="ctool">
            <div className="seg" role="group" aria-label="Candle size" id="tfs">
              {TFS.map((t) => (
                <button key={t} data-tf={t} aria-pressed={tf === t} onClick={() => setTf(t)}>
                  {t === '1d' ? '1D' : t}
                </button>
              ))}
            </div>
            <button
              className="flipb"
              id="flip"
              type="button"
              aria-pressed={flip}
              onClick={() => setFlip(!flip)}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M3 5h9l-2.5-2.5M13 11H4l2.5 2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Short view
            </button>
          </div>
          <div className="cbox" id="cbox">
            <LiveChart m={m} tf={tf} flip={flip} />
            <span className="flipnote" id="flipnote" hidden={!flip}>
              Flipped: up means a short is winning
            </span>
          </div>
        </div>
        <OrderPanel m={m} />
        <div className="ptab">
          <MyTrades />
          <div className="hlbt">
            <OrderBook m={m} />
            <RecentTrades m={m} />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The terminal for a Hyperliquid market. The URL names it ("/trade/SOL"); any case works and is replaced
 * by Hyperliquid's own spelling ("/trade/kpepe" becomes "/trade/kPEPE").
 */
export function LiveTradeView({ name }: { name: string }) {
  const hl = useHl();
  const router = useRouter();
  const m = findMarket(hl.markets, name);

  useEffect(() => {
    if (m && m.name !== name) router.replace(marketHref(m.name), { scroll: false });
  }, [m, name, router]);

  if (m) return <Terminal m={m} />;
  const loaded = hl.markets.length > 0;
  return (
    <section id="v-trade" className="wrap page" aria-labelledby="th-title">
      <div className="ph">
        <div>
          <h1 id="th-title">{loaded ? 'Market not found' : pair(name)}</h1>
          <p>{loaded ? `Hyperliquid has no perpetual market called ${name}.` : statusText(hl.status)}</p>
        </div>
      </div>
      {loaded && (
        <div className="pn">
          <div className="empty soon-page">
            <b>Try another ticker</b>
            Search above, or pick one from all {hl.markets.length} markets.
            <Link className="btn o" href="/">
              Browse markets
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
