'use client';

import { DEFAULT_RULES } from '@flipside/core/rules';
import { useEffect, useRef } from 'react';
import { C, fixed, pct, ratio, sol } from '@/lib/format';
import { solF } from '@/mock/sim';
import { useSim } from '@/mock/provider';
import { Shield, Tok } from './ui';

/** Size a canvas for the device pixel ratio and clear it (prototype sizeCanvas). */
export function sizeCanvas(cv: HTMLCanvasElement) {
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(r.width * dpr);
  const H = Math.round(r.height * dpr);
  if (cv.width !== W || cv.height !== H) {
    cv.width = W;
    cv.height = H;
  }
  const x = cv.getContext('2d')!;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, r.width, r.height);
  return { x, w: r.width, h: r.height };
}

const monoFont = () =>
  `400 10.5px ${getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'ui-monospace, monospace'}`;

/** Share price since launch: the prototype's drawPool, line plus the faint fill. */
function PoolChart({ pts, version }: { pts: number[]; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const draw = useRef<() => void>(() => {});
  draw.current = () => {
    const cv = ref.current;
    if (!cv) return;
    const { x, w, h } = sizeCanvas(cv);
    if (!w) return;
    let mn = Math.min(...pts, 1);
    let mx = Math.max(...pts);
    const pd = (mx - mn) * 0.18 || 0.01;
    mn -= pd;
    mx += pd;
    const X = (i: number) => (i / (pts.length - 1)) * (w - 58);
    const Y = (v: number) => h - 22 - ((v - mn) / (mx - mn)) * (h - 36);
    x.font = monoFont();
    x.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) {
      const v = mn + (mx - mn) * (i / 3);
      const y = Math.round(Y(v)) + 0.5;
      x.strokeStyle = '#151515';
      x.beginPath();
      x.moveTo(0, y);
      x.lineTo(w - 54, y);
      x.stroke();
      x.fillStyle = C.t3;
      x.fillText(v.toFixed(3), w - 48, y);
    }
    const y1 = Math.round(Y(1)) + 0.5;
    x.setLineDash([3, 4]);
    x.strokeStyle = '#2A2A2A';
    x.beginPath();
    x.moveTo(0, y1);
    x.lineTo(w - 54, y1);
    x.stroke();
    x.setLineDash([]);
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(237,237,237,.08)');
    g.addColorStop(1, 'rgba(237,237,237,0)');
    x.beginPath();
    pts.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v))));
    x.lineTo(X(pts.length - 1), h - 22);
    x.lineTo(0, h - 22);
    x.closePath();
    x.fillStyle = g;
    x.fill();
    x.beginPath();
    pts.forEach((v, i) => (i ? x.lineTo(X(i), Y(v)) : x.moveTo(X(i), Y(v))));
    x.strokeStyle = C.t1;
    x.lineWidth = 1.5;
    x.lineJoin = 'round';
    x.stroke();
    x.beginPath();
    x.arc(X(pts.length - 1), Y(pts[pts.length - 1]!), 3.5, 0, 7);
    x.fillStyle = C.t1;
    x.fill();
    x.fillStyle = C.t3;
    x.fillText('Launch', 0, h - 7);
    x.textAlign = 'right';
    x.fillText('Now', w - 58, h - 7);
    x.textAlign = 'left';
  };
  useEffect(() => draw.current(), [version]);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ro = new ResizeObserver(() => draw.current());
    ro.observe(cv);
    document.fonts?.ready.then(() => draw.current());
    return () => ro.disconnect();
  }, []);
  return <canvas id="plc" ref={ref} role="img" aria-label="Pool share price since launch"></canvas>;
}

export function PoolView() {
  const sim = useSim();
  const sp = sim.share();
  const r = sp / sim.poolHist[0]! - 1;
  const ow = sim.owed();
  const add = sim.lp.action === 'add';
  const amt = parseFloat(sim.lp.amt) || 0;
  const mine = sim.myPoolValue();
  const real = sim.mode === 'real';

  const metrics: Array<[string, JSX.Element | string, JSX.Element | string]> = [
    [
      'Pool size',
      <>
        {sol(sim.pool.value)}
        <small>SOL</small>
      </>,
      `+${sim.maxWinBps() / 100}% max win per trade at this size`,
    ],
    [
      'Share price',
      sp.toFixed(4),
      <>
        <span className={r >= 0 ? 'up' : 'dn'}>{pct(r, 2)}</span> since launch
      </>,
    ],
    [
      'Held on-chain',
      <>
        {sol(ow + sim.buffer)}
        <small>SOL</small>
      </>,
      `Owes ${sol(ow)} SOL, ${sol(sim.buffer)} SOL to spare`,
    ],
    [
      'Your share',
      <>
        {fixed(mine)}
        <small>SOL</small>
      </>,
      sim.pool.mine > 0n
        ? `${(ratio(sim.pool.mine, sim.pool.shares) * 100).toFixed(3)}% of the pool`
        : 'Add SOL to own a share',
    ],
  ];

  const cap = (sim.pool.value * BigInt(DEFAULT_RULES.poolCoinExposureBps)) / 10_000n;
  const ex = sim.coins
    .map((c) => ({ c, net: c.oiL - c.oiS }))
    .filter((e) => (e.net < 0n ? -e.net : e.net) > 50_000_000n)
    .sort((a, b) => {
      const A = a.net < 0n ? -a.net : a.net;
      const B = b.net < 0n ? -b.net : b.net;
      return B > A ? 1 : B < A ? -1 : 0;
    })
    .slice(0, 8);

  const hist = sim.poolHist;
  const i12 = Math.max(0, hist.length - 12);
  const loss = Math.max(0, ((hist[i12]! - sp) / hist[i12]!) * 100);
  const gd = sim.coins.filter((c) => c.status !== 'open').map((c) => '$' + c.sym);
  const crowd = sim.coins.filter(
    (c) =>
      c.status === 'open' &&
      ((c.oiS > 2n * c.oiL && c.oiS > 500_000_000n) || (c.oiL > 2n * c.oiS && c.oiL > 500_000_000n)),
  ).length;
  const proofAge = Math.floor(((sim.t === 0 ? sim.bootAt : Date.now()) - sim.auditAt) / 1000) + 41;
  const switches: Array<[string, string, string, boolean]> = [
    [
      'Rug guard',
      gd.length
        ? `Settled ${gd.join(', ')} after its liquidity was pulled. Watching ${sim.coins.length - gd.length} other coins.`
        : `Watching liquidity on all ${sim.coins.length} coins.`,
      gd.length ? 'Triggered' : 'Armed',
      !gd.length,
    ],
    [
      'Insider filter',
      'Deployers, wallets they funded and top 20 holders are blocked from shorting their own coin.',
      'On',
      true,
    ],
    [
      'Crowded side fee',
      'Charged hourly where one side is more than 2 to 1, paid to the other side.',
      `${crowd} coins`,
      true,
    ],
    [
      'Hourly loss breaker',
      `Pauses new trades for 15 minutes if the pool loses 3% in an hour. Last hour: ${loss.toFixed(2)}%.`,
      'Armed',
      true,
    ],
    [
      'Balance proof',
      'Posted on-chain every 5 minutes. If it stops for 72 hours, anyone can withdraw their full balance.',
      `${proofAge}s ago`,
      false,
    ],
  ];

  return (
    <section id="v-pool" className="wrap page" aria-labelledby="h-pool">
      <div className="ph">
        <div>
          <h1 id="h-pool">The pool</h1>
          <p>
            The pool is the other side of every trade. It keeps losing stakes, pays winners at once and earns
            80% of every trading fee. Anyone can add SOL and own a share.
          </p>
        </div>
      </div>
      <dl className="metrics" id="pl-metrics">
        {metrics.map(([k, v, s]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
            <dd className="s2">{s}</dd>
          </div>
        ))}
      </dl>
      <div className="pgrid">
        <div className="pn">
          <div className="pn-h">
            <h2 className="h3">Share price</h2>
            <span className="c">since launch</span>
          </div>
          <div className="pchart">
            <PoolChart pts={hist} version={sim.version} />
          </div>
        </div>
        <form
          className="pn lp"
          id="lpForm"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            sim.lpSubmit();
          }}
        >
          <h2 className="h3">Add or remove SOL</h2>
          <div
            className="seg"
            role="group"
            aria-label="Pool action"
            id="lpSeg"
            style={{ marginTop: 14, width: 'max-content' }}
          >
            {(['add', 'remove'] as const).map((a) => (
              <button
                key={a}
                data-lp={a}
                type="button"
                aria-pressed={sim.lp.action === a}
                onClick={() => sim.set((s) => void (s.lp.action = a))}
              >
                {a === 'add' ? 'Add' : 'Remove'}
              </button>
            ))}
          </div>
          <div className="fl">
            <label htmlFor="lpAmt">Amount</label>
            <b id="lpAvail">
              {!real
                ? 'Real SOL only'
                : !sim.wallet
                  ? 'No wallet connected'
                  : add
                    ? `${sol(sim.bal())} SOL available`
                    : `${fixed(mine)} SOL in the pool`}
            </b>
          </div>
          <div className="amt">
            <input
              id="lpAmt"
              inputMode="decimal"
              value={sim.lp.amt}
              onChange={(e) => sim.set((s) => void (s.lp.amt = e.target.value))}
            />
            <span>SOL</span>
          </div>
          <p className="hint" id="lpHint">
            {add
              ? 'You get pool shares at the current share price. Shares rise when traders lose and fall when they win.'
              : 'Shares are redeemed at the current share price. The SOL goes back to your balance at once.'}
          </p>
          <dl className="sum" id="lpSum">
            {(
              [
                ['Share price', sp.toFixed(4)],
                [add ? 'Shares you get' : 'Shares you redeem', (amt / sp).toFixed(3)],
                ['Fee', 'None'],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="omsg" id="lpMsg" role="status">
            {sim.lp.msg}
          </p>
          <button className="cta w" id="lpBtn" type="submit">
            {!real
              ? 'Switch to Real to use the pool'
              : !sim.wallet
                ? 'Connect wallet'
                : add
                  ? 'Add to pool'
                  : 'Remove from pool'}
          </button>
        </form>
      </div>
      <div className="pgrid" style={{ marginTop: 16 }}>
        <div className="pn">
          <div className="pn-h">
            <h2 className="h3">Where the pool is exposed</h2>
            <span className="c end">capped at 2% of the pool per coin</span>
          </div>
          <div id="exposure">
            <div className="exr hd">
              <span>Token</span>
              <span>Pool holds</span>
              <span>Share of the {solF(cap).toFixed(1)} SOL cap</span>
            </div>
            {ex.map(({ c, net }) => {
              const side = net > 0n ? 'short' : 'long';
              const abs = net < 0n ? -net : net;
              const p = Math.min(100, ratio(abs, cap) * 100);
              return (
                <div className="exr" key={c.sym}>
                  <span className="tk">
                    <Tok s={c.sym} size={24} />
                    <b>${c.sym}</b>
                  </span>
                  <span className={`n ${side === 'long' ? 'up' : 'dn'}`}>
                    {fixed(abs)} SOL {side}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="exbar">
                      <i style={{ width: `${p.toFixed(1)}%`, background: p > 75 ? C.short : '#EDEDED' }}></i>
                    </span>
                    <small className="n t3" style={{ width: 32, textAlign: 'right' }}>
                      {p.toFixed(0)}%
                    </small>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="pn">
          <div className="pn-h">
            <h2 className="h3">Safety switches</h2>
          </div>
          <ul className="sw" id="switches">
            {switches.map(([b, s, e, on]) => (
              <li key={b}>
                <div>
                  <b>
                    <Shield c={on ? C.long : '#A1A1A1'} s={13} />
                    {b}
                  </b>
                  <small>{s}</small>
                </div>
                <em className={on ? 'on' : ''}>{e}</em>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
