'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { fixed, pct, shortA, usd } from '@/lib/format';
import { chg1h, maxLev, mcap, solF, type Coin } from '@/mock/sim';
import { useSim } from '@/mock/provider';
import { LevButtons, PCTS, SummaryRows } from '../markets/QuickTicket';
import { tradeHref } from '../nav';
import { HistTable, PosTable } from '../tables';
import { CopyIcon, Price, Px, Shield, Tok } from '../ui';
import { CandleChart } from './CandleChart';

function Watchlist({ sel }: { sel: Coin }) {
  const sim = useSim();
  const q = sim.watchQ.trim().toLowerCase().replace(/^\$/, '');
  // Order is fixed while you stay on a coin (prototype renderWatch); prices update every tick.
  const list = useMemo(
    () =>
      sim.coins
        .filter((c) => !q || c.sym.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
        .sort((a, b) => mcap(b) - mcap(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, sel.sym],
  );
  return (
    <aside className="pn watch" aria-label="Markets">
      <label className="filter">
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="5" fill="none" stroke="#6E6E6E" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="#6E6E6E" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="vh">Filter</span>
        <input
          id="wq"
          placeholder="Filter markets"
          value={sim.watchQ}
          onChange={(e) => sim.set((s) => void (s.watchQ = e.target.value))}
        />
      </label>
      <ul id="watch">
        {list.length ? (
          list.map((c) => {
            const ch = chg1h(c);
            return (
              <li key={c.sym}>
                <Link className="wi" href={tradeHref(c.mint)} scroll={false} aria-current={c.sym === sel.sym}>
                  <Tok s={c.sym} logo={c.logo} size={24} />
                  <span>
                    <b>${c.sym}</b>
                    <small>{usd(mcap(c))}</small>
                  </span>
                  <span className="r">
                    {c.status !== 'open' ? (
                      <small className="t3">Paused</small>
                    ) : (
                      <>
                        <Price p={c.price} />
                        <small className={ch >= 0 ? 'up' : 'dn'}>{pct(ch)}</small>
                      </>
                    )}
                  </span>
                </Link>
              </li>
            );
          })
        ) : (
          <li className="hint" style={{ padding: 10 }}>
            No coins match.
          </li>
        )}
      </ul>
    </aside>
  );
}

function OrderPanel({ c }: { c: Coin }) {
  const sim = useSim();
  const o = sim.order;
  const ml = maxLev(c);
  const lev = o.lev > ml ? 2 : o.lev;
  const st = sim.ctaState(c, o.side, lev, o.amt);
  const until = new Date(o.ocUntil);
  return (
    <div className="pn order" aria-label="Order" role="group">
      <div id="o-banner">
        {c.status !== 'open' && (
          <div className="guardbox">
            <Shield c="#EDEDED" s={15} />
            <span>
              <b>Trading paused on ${c.sym}.</b> Its liquidity fell 92% in under a minute, so the rug guard
              settled every position at the average price from before the drop.
            </span>
          </div>
        )}
      </div>
      <div className="sides" id="o-side" role="group" aria-label="Side">
        {(['long', 'short'] as const).map((sd) => (
          <button
            key={sd}
            type="button"
            data-side={sd}
            aria-pressed={o.side === sd}
            onClick={() => sim.set((s) => void (s.order.side = sd))}
          >
            {sd === 'long' ? 'Long' : 'Short'}
          </button>
        ))}
      </div>
      <div className="fl">
        <label htmlFor="o-amt">Amount</label>
        <b id="o-avail">{sim.availTxt()}</b>
      </div>
      <div className="amt">
        <input
          id="o-amt"
          inputMode="decimal"
          value={o.amt}
          onChange={(e) => sim.set((s) => void (s.order.amt = e.target.value))}
        />
        <span>SOL</span>
      </div>
      <div className="chips" id="o-pct">
        {PCTS.map(([p, label]) => (
          <button
            key={p}
            data-p={p}
            type="button"
            onClick={() => sim.set((s) => void (s.order.amt = s.pctAmount(c.sym, o.side, p)))}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="fl">
        <span>Leverage</span>
        <b id="o-levnow">{lev}x</b>
      </div>
      <div className="levs" id="o-lev" role="group" aria-label="Leverage">
        <LevButtons c={c} lev={lev} onPick={(l) => sim.set((s) => void (s.order.lev = l))} />
      </div>
      <p className="hint" id="o-levhint">
        {ml === 10
          ? 'This coin is deep enough for 10x.'
          : ml === 5
            ? `10x opens at 500 SOL of liquidity. This coin has ${Math.round(solF(c.liq))}.`
            : `5x opens at 150 SOL of liquidity and 10x at 500. This coin has ${Math.round(solF(c.liq))}.`}
      </p>
      <div className="swrow">
        <span id="tpslLab">Take profit and stop loss</span>
        <button
          type="button"
          className="switch"
          id="o-tpsl"
          role="switch"
          aria-checked={o.tpsl}
          aria-labelledby="tpslLab"
          onClick={() => sim.set((s) => void (s.order.tpsl = !s.order.tpsl))}
        ></button>
      </div>
      <div className="tpsl" id="o-tpslbox" hidden={!o.tpsl}>
        <label className="mini">
          <span className="vh">Take profit percent</span>
          <input
            id="o-tp"
            inputMode="decimal"
            placeholder="Take profit"
            value={o.tp}
            onChange={(e) => sim.set((s) => void (s.order.tp = e.target.value))}
          />
          <span>% gain</span>
        </label>
        <label className="mini">
          <span className="vh">Stop loss percent</span>
          <input
            id="o-sl"
            inputMode="decimal"
            placeholder="Stop loss"
            value={o.sl}
            onChange={(e) => sim.set((s) => void (s.order.sl = e.target.value))}
          />
          <span>% loss</span>
        </label>
      </div>
      <div className="swrow">
        <span id="ocLab">One-click trading</span>
        <button
          type="button"
          className="switch"
          id="o-oc"
          role="switch"
          aria-checked={o.oneClick}
          aria-labelledby="ocLab"
          onClick={() => sim.toggleOneClick()}
        ></button>
      </div>
      <p className="hint" id="o-ochint">
        {o.oneClick
          ? `On until ${until.toLocaleString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}. Trades fill without a wallet pop-up.`
          : 'Sign once, then trade for 24 hours without wallet pop-ups.'}
      </p>
      <dl className="sum" id="o-sum">
        <SummaryRows c={c} side={o.side} lev={lev} amt={o.amt} />
      </dl>
      <p className="omsg" id="o-msg" role="status">
        {o.msg}
      </p>
      <button
        className={`cta ${st.cls}`}
        id="o-cta"
        type="button"
        disabled={!!st.dis}
        onClick={() => {
          sim.set((s) => void (s.order.lev = lev));
          sim.orderSubmit(c.sym);
        }}
      >
        {st.label}
      </button>
      <p className="ogd">
        <Shield c="#6E6E6E" s={13} style={{ flex: 'none', marginTop: 3 }} />
        If this coin loses 30% of its liquidity within 5 minutes, your position settles at the average price
        from before the drop.
      </p>
    </div>
  );
}

export function TradeView({ mint }: { mint: string }) {
  const sim = useSim();
  const c = sim.byMint[mint]!;
  const ch = chg1h(c);

  // entering the terminal (or switching coin) is the prototype's renderTrade(true)
  useEffect(() => {
    sim.set((s) => {
      s.sel = c.sym;
      if (s.order.lev > maxLev(c)) s.order.lev = 2;
      s.order.tp = '';
      s.order.sl = '';
      s.order.msg = '';
    });
  }, [sim, c]);

  const mine = sim.myPositions();
  const onCoin = mine.filter((p) => p.sym === c.sym);
  const stats: Array<[string, string]> = [
    ['Market cap', usd(mcap(c))],
    ['Liquidity', Math.round(solF(c.liq)).toLocaleString('en-US') + ' SOL'],
    ['Holders', c.holders.toLocaleString('en-US')],
    ['Long open', fixed(c.oiL) + ' SOL'],
    ['Short open', fixed(c.oiS) + ' SOL'],
    ['Max leverage', maxLev(c) + 'x'],
    ['Max win', `+${sim.maxWinBps() / 100}%`],
  ];

  return (
    <section id="v-trade" className="wrap tv" aria-labelledby="th-title">
      <div className="thd">
        <div className="th-tok">
          <span id="th-tok">
            <Tok s={c.sym} logo={c.logo} size={36} />
          </span>
          <div>
            <h1 id="th-title">${c.sym}</h1>
            <small>
              <span id="th-venue">
                {c.name}, {c.venue}
              </span>
              <button
                className="copyb"
                id="th-copy"
                type="button"
                title="Copy contract address"
                onClick={() => {
                  navigator.clipboard?.writeText(c.mint).catch(() => {});
                  sim.toast('Contract address copied: ' + shortA(c.mint), 'good');
                }}
              >
                {shortA(c.mint)}
                <CopyIcon />
              </button>
            </small>
          </div>
        </div>
        <div className="th-px">
          <Px as="b" p={c.price} prev={c.prev} />
          <span id="th-chg" className={`chg ${ch >= 0 ? 'up' : 'dn'}`}>
            {pct(ch)} 1h
          </span>
        </div>
        <dl className="th-stats" id="th-stats">
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="tgrid">
        <Watchlist sel={c} />
        <div className="pn chart">
          <div className="ctool">
            <div className="seg" role="group" aria-label="Candle size" id="tfs">
              {[5, 15, 30].map((tf) => (
                <button
                  key={tf}
                  data-tf={tf}
                  aria-pressed={sim.order.tf === tf}
                  onClick={() => sim.set((s) => void (s.order.tf = tf))}
                >
                  {tf}s
                </button>
              ))}
            </div>
            <span className="lg">
              <i></i>60-second average, the price you fill at
            </span>
            <button
              className="flipb"
              id="flip"
              type="button"
              aria-pressed={sim.order.flip}
              onClick={() => sim.set((s) => void (s.order.flip = !s.order.flip))}
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
            <CandleChart
              coin={c}
              tf={sim.order.tf}
              flip={sim.order.flip}
              mine={onCoin}
              version={sim.version}
            />
            <span className="flipnote" id="flipnote" hidden={!sim.order.flip}>
              Flipped: up means a short is winning
            </span>
          </div>
        </div>
        <OrderPanel c={c} />
        <div className="pn ptab">
          <div className="pn-h">
            <div className="seg" role="group" aria-label="Positions" id="ptabs">
              <button
                data-pt="open"
                aria-pressed={sim.order.pt === 'open'}
                onClick={() => sim.set((s) => void (s.order.pt = 'open'))}
              >
                Open positions{mine.length ? ` (${mine.length})` : ''}
              </button>
              <button
                data-pt="hist"
                aria-pressed={sim.order.pt === 'hist'}
                onClick={() => sim.set((s) => void (s.order.pt = 'hist'))}
              >
                History
              </button>
            </div>
          </div>
          <div id="tv-pos">
            {sim.order.pt === 'open' ? <PosTable list={mine} /> : <HistTable list={sim.myHistory()} />}
          </div>
        </div>
      </div>
    </section>
  );
}
