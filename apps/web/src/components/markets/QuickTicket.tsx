'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { C, fixed, pct, sgn, shortA } from '@/lib/format';
import { chg1h, floorCent, maxLev, type Coin } from '@/mock/sim';
import { useSim } from '@/mock/provider';
import { useOpenTrade } from '../nav';
import { SearchBox } from '../Search';
import { Lock, Price, Tok } from '../ui';

export const LEVS = [2, 5, 10] as const;
export const PCTS: Array<[number, string]> = [
  [10, '10%'],
  [25, '25%'],
  [50, '50%'],
  [100, 'Max'],
];

export function levHint(c: Coin) {
  const ml = maxLev(c);
  return ml === 10
    ? 'Deep enough for 10x'
    : ml === 5
      ? '10x needs 500 SOL liquidity'
      : '5x needs 150 SOL liquidity';
}

export function LevButtons({ c, lev, onPick }: { c: Coin; lev: number; onPick: (l: number) => void }) {
  const ml = maxLev(c);
  return (
    <>
      {LEVS.map((l) => {
        const dis = l > ml;
        return (
          <button
            key={l}
            data-lev={l}
            type="button"
            aria-pressed={l === lev}
            disabled={dis}
            onClick={() => !dis && onPick(l)}
          >
            {dis && <Lock />}
            {l}x
          </button>
        );
      })}
    </>
  );
}

/** Summary rows shared by the ticket (first four) and the terminal (all six). */
export function SummaryRows({
  c,
  side,
  lev,
  amt,
  rows = 6,
}: {
  c: Coin;
  side: 'long' | 'short';
  lev: number;
  amt: string;
  rows?: number;
}) {
  const sim = useSim();
  const s = sim.summary(c, side, lev, amt);
  const all: Array<[string, JSX.Element | string]> = [
    ['Fill price', <Price key="p" p={s.entry} />],
    ['Liquidation', <Price key="l" p={s.liq} />],
    // rounded down so the preview never overstates size or winnings
    ['Position size', `${fixed(floorCent(s.size))} SOL`],
    [
      'Max win',
      <span key="m" className="up">
        +{fixed(floorCent(s.maxWin))} SOL
      </span>,
    ],
    ['Open fee', `${fixed(s.openFee, 4)} SOL`],
    [`Room for ${side}s`, `${fixed(s.room)} SOL`],
  ];
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

export function QuickTicket() {
  const sim = useSim();
  const openTrade = useOpenTrade();
  const t = sim.tk;
  const c = sim.bySym[t.sym]!;
  const ch = chg1h(c);
  const lev = t.lev > maxLev(c) ? 2 : t.lev;

  // entering the markets view clears the ticket message, like renderTicket(true)
  useEffect(() => sim.set((s) => void (s.tk.msg = '')), [sim]);

  const pts = c.hist.slice(-120);
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
  const st = sim.ctaState(c, t.side, lev, t.amt);
  const mine = sim.myPositions();
  const u = mine.reduce((s, p) => s + sim.posValue(p).pnl, 0n);

  return (
    <form
      className="ticket"
      id="ticket"
      autoComplete="off"
      aria-label="Quick trade"
      onSubmit={(e) => {
        e.preventDefault();
        if (document.activeElement?.id === 'q2') return;
        sim.set((s) => void (s.tk.lev = lev));
        sim.ticketSubmit();
      }}
    >
      <div className="tk-head">
        <b>Quick trade</b>
        <span className="t3" id="tk-mode">
          {sim.mode === 'practice' ? 'Practice mode' : 'Real SOL'}
        </span>
      </div>
      <div className="tk-body">
        <SearchBox
          id="q2"
          className="tk-in"
          placeholder="Paste a contract address or $ticker"
          label="Contract address or ticker"
          onPick={(k) =>
            sim.set((s) => {
              s.tk.sym = k.sym;
              if (s.tk.lev > maxLev(k)) s.tk.lev = 2;
              s.tk.msg = '';
            })
          }
        />
        <div className="tk-coin" id="tk-coin">
          <Tok s={c.sym} logo={c.logo} size={36} />
          <div>
            <b>${c.sym}</b>
            <small>
              {c.name}, {c.venue}, <span className="n">{shortA(c.mint)}</span>
            </small>
          </div>
          <div className="r">
            <b>
              <Price p={c.price} />
            </b>
            <small className={`chg ${ch >= 0 ? 'up' : 'dn'}`}>{pct(ch)} 1h</small>
          </div>
        </div>
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
        <div className="sides" id="tk-side" role="group" aria-label="Side">
          {(['long', 'short'] as const).map((sd) => (
            <button
              key={sd}
              type="button"
              data-side={sd}
              aria-pressed={t.side === sd}
              onClick={() => sim.set((s) => void (s.tk.side = sd))}
            >
              {sd === 'long' ? 'Long' : 'Short'}
            </button>
          ))}
        </div>
        <div className="fl">
          <label htmlFor="tk-amt">Amount</label>
          <b id="tk-avail">{sim.availTxt()}</b>
        </div>
        <div className="amt">
          <input
            id="tk-amt"
            inputMode="decimal"
            value={t.amt}
            onChange={(e) => sim.set((s) => void (s.tk.amt = e.target.value))}
          />
          <span>SOL</span>
        </div>
        <div className="chips" id="tk-pct">
          {PCTS.map(([p, label]) => (
            <button
              key={p}
              data-p={p}
              type="button"
              onClick={() => sim.set((s) => void (s.tk.amt = s.pctAmount(t.sym, t.side, p)))}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="fl">
          <span>Leverage</span>
          <b id="tk-levnote">{levHint(c)}</b>
        </div>
        <div className="levs" id="tk-lev" role="group" aria-label="Leverage">
          <LevButtons c={c} lev={lev} onPick={(l) => sim.set((s) => void (s.tk.lev = l))} />
        </div>
        <dl className="sum" id="tk-sum">
          <SummaryRows c={c} side={t.side} lev={lev} amt={t.amt} rows={4} />
        </dl>
        <p className="omsg" id="tk-msg" role="status">
          {t.msg}
        </p>
        <button className={`cta ${st.cls}`} id="tk-cta" type="submit" disabled={!!st.dis}>
          {st.label}
        </button>
        <div className="tk-foot">
          <span>Filled against the pool at the 60-second average</span>
          <button
            type="button"
            id="tk-full"
            onClick={() => {
              sim.set((s) => {
                s.order.amt = s.tk.amt;
                s.order.lev = lev;
              });
              openTrade(t.sym, t.side);
            }}
          >
            Full terminal
          </button>
        </div>
        <div className="tk-pos" id="tk-pos">
          {mine.length > 0 && (
            <>
              <span>
                {mine.length} open position{mine.length > 1 ? 's' : ''},{' '}
                <span className={`n ${u >= 0n ? 'up' : 'dn'}`}>{sgn(u)} SOL</span>
              </span>
              <Link className="btn sm o" href="/portfolio">
                View
              </Link>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
