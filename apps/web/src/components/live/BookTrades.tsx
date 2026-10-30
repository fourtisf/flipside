'use client';

import { pxDiffText, pxText, szCol } from '@/hl/format';
import type { Market } from '@/hl/markets';
import { useBook, useTrades, type Trade } from '@/hl/provider';
import { Price } from '../ui';

const LEVELS = 10;
const TRADES = 24;

const two = (n: number) => String(n).padStart(2, '0');
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
};

/** Hyperliquid's order book for one market: asks above, bids below, with running totals and depth bars. */
export function OrderBook({ m }: { m: Market }) {
  const book = useBook(m.name, LEVELS);
  const sz = m.szDecimals;
  return (
    <div className="pn ob" role="region" aria-labelledby="ob-h">
      <div className="pn-h">
        <h2 className="h3" id="ob-h">
          Order book
        </h2>
        <span className="c">Hyperliquid</span>
      </div>
      <div className="ob-hd" aria-hidden="true">
        <span>Price</span>
        <span>Size ({m.name})</span>
        <span>Total</span>
      </div>
      {!book ? (
        <p className="ob-msg" role="status">
          Loading the order book.
        </p>
      ) : (
        <div id="ob" role="table" aria-label={`${m.name} order book`}>
          <div role="rowgroup" aria-label="Asks">
            {[...book.asks].reverse().map((r) => (
              <div className="ob-r a" role="row" key={r.px}>
                <i style={{ width: `${(r.depth * 100).toFixed(1)}%` }} aria-hidden="true" />
                <span role="cell" className="dn">
                  {pxText(r.px, sz)}
                </span>
                <span role="cell">{szCol(r.sz, sz)}</span>
                <span role="cell" className="t3">
                  {szCol(r.total, sz)}
                </span>
              </div>
            ))}
          </div>
          <div className="ob-sp" role="row">
            <b role="cell">
              <Price p={m.px} sz={sz} />
            </b>
            <span role="cell">
              {book.spread === null
                ? ''
                : `Spread ${pxDiffText(book.spread, m.px, sz)} (${((book.spreadPct ?? 0) * 100).toFixed(3)}%)`}
            </span>
          </div>
          <div role="rowgroup" aria-label="Bids">
            {book.bids.map((r) => (
              <div className="ob-r b" role="row" key={r.px}>
                <i style={{ width: `${(r.depth * 100).toFixed(1)}%` }} aria-hidden="true" />
                <span role="cell" className="up">
                  {pxText(r.px, sz)}
                </span>
                <span role="cell">{szCol(r.sz, sz)}</span>
                <span role="cell" className="t3">
                  {szCol(r.total, sz)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TradeRow({ t, sz }: { t: Trade; sz: number }) {
  return (
    <div className="ob-r" role="row">
      <span role="cell" className={t.side === 'B' ? 'up' : 'dn'}>
        {pxText(t.px, sz)}
      </span>
      <span role="cell">{szCol(t.sz, sz)}</span>
      <span role="cell" className="t3">
        {clock(t.time)}
      </span>
    </div>
  );
}

/** The latest trades on Hyperliquid for one market, newest first. Green when a buyer took the trade. */
export function RecentTrades({ m }: { m: Market }) {
  const trades = useTrades(m.name, TRADES);
  return (
    <div className="pn ob" role="region" aria-labelledby="rt-h">
      <div className="pn-h">
        <h2 className="h3" id="rt-h">
          Recent trades
        </h2>
        <span className="c">Hyperliquid</span>
      </div>
      <div className="ob-hd" aria-hidden="true">
        <span>Price</span>
        <span>Size ({m.name})</span>
        <span>Time</span>
      </div>
      {!trades ? (
        <p className="ob-msg" role="status">
          Loading trades.
        </p>
      ) : !trades.length ? (
        <p className="ob-msg">No trades yet.</p>
      ) : (
        <div id="rt" role="table" aria-label={`${m.name} recent trades`}>
          <div role="rowgroup">
            {trades.map((t) => (
              <TradeRow key={t.tid} t={t} sz={m.szDecimals} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
