'use client';

import type { JSX } from 'react';
import { shortA, sgn, sol } from '@/lib/format';
import { useSim } from '@/mock/provider';
import { HistTable, PosTable } from './tables';

export function PortfolioView() {
  const sim = useSim();
  const m = sim.mode;
  const open = sim.myPositions();
  const hist = sim.myHistory();
  const upnl = open.reduce((s, p) => s + sim.posValue(p).pnl, 0n);
  const real = hist.reduce((s, p) => s + p.net, 0n);
  const wins = hist.filter((p) => p.net > 0n).length;
  const u = m === 'practice' ? 'paper SOL' : 'SOL';
  const ref = `coinside.fun/r/${sim.wallet ? shortA(sim.wallet).replace('…', '').toLowerCase() : 'yourname'}`;

  const metrics: Array<[string, JSX.Element, string]> = [
    [
      'Balance',
      <>
        {sol(sim.bal())}
        <small>{u}</small>
      </>,
      'Ready to trade or withdraw',
    ],
    [
      'Open P&L',
      <>
        <span className={upnl >= 0n ? 'up' : 'dn'}>{sgn(upnl)}</span>
        <small>SOL</small>
      </>,
      `${open.length} open position${open.length === 1 ? '' : 's'}`,
    ],
    [
      'Realized P&L',
      <>
        <span className={real >= 0n ? 'up' : 'dn'}>{sgn(real)}</span>
        <small>SOL</small>
      </>,
      `${hist.length} closed trade${hist.length === 1 ? '' : 's'}`,
    ],
    [
      'Win rate',
      hist.length ? (
        <>
          {Math.round((wins / hist.length) * 100)}
          <small>%</small>
        </>
      ) : (
        <span className="t3">None yet</span>
      ),
      hist.length ? `${wins} of ${hist.length} trades won` : 'Close a trade to see it',
    ],
  ];

  return (
    <section id="v-portfolio" className="wrap page" aria-labelledby="h-pf">
      <div className="ph">
        <div>
          <h1 id="h-pf">Portfolio</h1>
          <p id="pf-note">
            {m === 'practice'
              ? 'Practice uses paper SOL against live prices. Nothing you do here touches real money.'
              : sim.wallet
                ? `Wallet ${shortA(sim.wallet)}. Deposits sit in the vault program and only this wallet can withdraw them.`
                : 'Connect a wallet to deposit SOL and trade for real.'}
          </p>
        </div>
        <div className="acts2" id="pf-acts">
          {m === 'practice' ? (
            <button className="btn w" onClick={() => sim.claim()}>
              Claim 10 paper SOL
            </button>
          ) : sim.wallet ? (
            <>
              <button className="btn w" onClick={() => sim.openFund('deposit')}>
                Deposit
              </button>
              <button className="btn o" onClick={() => sim.openFund('withdraw')}>
                Withdraw
              </button>
            </>
          ) : (
            <button className="btn w" onClick={() => sim.requestConnect()}>
              Connect wallet
            </button>
          )}
        </div>
      </div>
      <dl className="metrics" id="pf-metrics">
        {metrics.map(([k, v, s]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
            <dd className="s2">{s}</dd>
          </div>
        ))}
      </dl>
      <div className="pn ref" style={{ marginBottom: 16 }}>
        <div>
          <div className="fl" style={{ marginTop: 0 }}>
            <span>Your referral link</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="link" id="refLink" style={{ flex: 1 }}>
              {ref}
            </span>
            <button
              className="btn o"
              id="refCopy"
              type="button"
              style={{ height: 40 }}
              onClick={() => {
                navigator.clipboard?.writeText('https://' + ref).catch(() => {});
                sim.toast('Referral link copied.', 'good');
              }}
            >
              Copy
            </button>
          </div>
          <p>
            You earn 50% of the protocol&apos;s share of every fee your traders pay, for as long as they
            trade.
          </p>
        </div>
        <dl>
          <div>
            <dt>Traders referred</dt>
            <dd>0</dd>
          </div>
          <div>
            <dt>Earned</dt>
            <dd>
              0.000
              <small className="t3" style={{ fontSize: 12, marginLeft: 4 }}>
                SOL
              </small>
            </dd>
          </div>
        </dl>
      </div>
      <div className="stack">
        <div className="pn">
          <div className="pn-h">
            <h2 className="h3">Open positions</h2>
            <span className="c" id="pf-oc">
              {open.length}
            </span>
          </div>
          <div id="pf-open">
            <PosTable list={open} />
          </div>
        </div>
        <div className="pn">
          <div className="pn-h">
            <h2 className="h3">History</h2>
          </div>
          <div id="pf-hist">
            <HistTable list={hist} />
          </div>
        </div>
      </div>
    </section>
  );
}
