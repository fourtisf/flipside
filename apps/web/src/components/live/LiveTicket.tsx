'use client';

import { useRouter } from 'next/navigation';
import { DEFAULT_MARKET, change24h, marketHref, pair, unitNote } from '@/hl/markets';
import { useHl, useSpark } from '@/hl/provider';
import { C, pct } from '@/lib/format';
import { Price } from '../ui';
import { LiveSearchBox } from './LiveSearch';
import { LevButtons, Sides, Summary, levFor } from './OrderBits';
import { statusText } from './status';
import { CoinTok } from './CoinTok';
import { AvailableNote } from './Wallet';

/** The 24h sparkline: 15-minute closes, ending at the live price. */
function Spark({ name, px }: { name: string; px: number }) {
  const closes = useSpark(name);
  const pts = closes?.length ? [...closes, px] : [];
  if (pts.length < 2)
    return <svg className="tk-spark" id="tk-spark" viewBox="0 0 380 34" aria-hidden="true" />;
  const mn = Math.min(...pts);
  const mx = Math.max(...pts);
  const r = mx - mn || 1;
  const d = pts
    .map(
      (v, i) =>
        (i ? 'L' : 'M') +
        ((i / (pts.length - 1)) * 380).toFixed(1) +
        ' ' +
        (32 - ((v - mn) / r) * 30).toFixed(1),
    )
    .join('');
  const up = pts[pts.length - 1]! >= pts[0]!;
  return (
    <svg
      className="tk-spark"
      id="tk-spark"
      viewBox="0 0 380 34"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke={up ? C.long : C.short}
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Quick trade on a Hyperliquid market. Trading isn't open yet, so the order button is closed. */
export function LiveTicket() {
  const hl = useHl();
  const router = useRouter();
  const m = hl.byName[hl.tk] ?? hl.byName[DEFAULT_MARKET] ?? hl.markets[0];
  const d = hl.draft;

  return (
    <form
      className="ticket"
      id="ticket"
      autoComplete="off"
      aria-label="Quick trade"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="tk-head">
        <b>Quick trade</b>
        <span className="t3" id="tk-mode">
          Preview
        </span>
      </div>
      <div className="tk-body">
        <LiveSearchBox
          id="q2"
          className="tk-in"
          placeholder="Search a market, like SOL or BTC"
          label="Market"
          onPick={(name) => hl.set((s) => void (s.tk = name))}
        />
        {m ? (
          <>
            <div className="tk-coin" id="tk-coin">
              <CoinTok name={m.name} size={36} />
              <div>
                <b>{m.name}</b>
                <small>
                  {pair(m.name)} perpetual, up to {m.maxLeverage}x
                  {unitNote(m.name) ? `, ${unitNote(m.name)}` : ''}
                </small>
              </div>
              <div className="r">
                <b>
                  <Price p={m.px} sz={m.szDecimals} />
                </b>
                <small className={`chg ${change24h(m) >= 0 ? 'up' : 'dn'}`}>{pct(change24h(m))} 24h</small>
              </div>
            </div>
            <Spark name={m.name} px={m.px} />
          </>
        ) : (
          <div className="tk-coin tk-wait" id="tk-coin" role="status">
            {statusText(hl.status)}
          </div>
        )}
        <Sides id="tk-side" side={d.side} onPick={(sd) => hl.set((s) => void (s.draft.side = sd))} />
        <div className="fl">
          <label htmlFor="tk-amt">Amount</label>
          <AvailableNote />
        </div>
        <div className="amt">
          <input
            id="tk-amt"
            inputMode="decimal"
            value={d.amt}
            onChange={(e) => hl.set((s) => void (s.draft.amt = e.target.value))}
          />
          <span>USDC</span>
        </div>
        {m && (
          <>
            <div className="fl">
              <span>Leverage</span>
              <b id="tk-levnote">Up to {m.maxLeverage}x</b>
            </div>
            <LevButtons
              id="tk-lev"
              m={m}
              lev={levFor(m, d.lev)}
              onPick={(l) => hl.set((s) => void (s.draft.lev = l))}
            />
            <dl className="sum" id="tk-sum">
              <Summary m={m} d={{ ...d, type: 'market' }} lev={levFor(m, d.lev)} rows={4} />
            </dl>
          </>
        )}
        <button className="cta w" id="tk-cta" type="submit" disabled>
          Trading opens soon
        </button>
        <div className="tk-foot">
          <span>Fills on Hyperliquid&apos;s order book</span>
          <button
            type="button"
            id="tk-full"
            onClick={() => router.push(marketHref(m?.name ?? DEFAULT_MARKET))}
          >
            Full terminal
          </button>
        </div>
      </div>
    </form>
  );
}
