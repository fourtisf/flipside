'use client';

import { DEFAULT_RULES } from '@flipside/core/rules';
import { ago, fixed, pct, sgn } from '@/lib/format';
import { REASON, liqPrice, type Closed, type Position } from '@/mock/sim';
import { useSim } from '@/mock/provider';
import { Price, SideChip, Tok } from './ui';

export function PosTable({ list }: { list: Position[] }) {
  const sim = useSim();
  if (!list.length)
    return (
      <div className="empty">
        <b>No open positions</b>Pick a coin and open a long or short. It shows up here with live P&amp;L.
      </div>
    );
  const now = Date.now();
  return (
    <>
      <div className="tr hd t-pos">
        <span>Token</span>
        <span>Side</span>
        <span className="c3">Stake</span>
        <span className="c4">Entry</span>
        <span className="c5">Mark</span>
        <span className="c6">Liquidation</span>
        <span>P&amp;L</span>
        <span></span>
      </div>
      {list.map((p) => {
        const c = sim.bySym[p.sym]!;
        const { pnl, ex } = sim.posValue(p);
        const wait = Math.max(0, DEFAULT_RULES.minHoldSeconds - Math.floor((now - p.at) / 1000));
        const ratio = Number((pnl * 10_000n) / p.margin) / 10_000;
        return (
          <div className="tr t-pos" key={p.id}>
            <span className="tk">
              <Tok s={p.sym} size={24} />
              <b>${p.sym}</b>
            </span>
            <span>
              <SideChip side={p.side} lev={p.lev} />
            </span>
            <span className="c3 n">{fixed(p.stake)}</span>
            <span className="c4 n">
              <Price p={p.entry} />
            </span>
            <span className="c5 n">
              <Price p={ex} />
            </span>
            <span className="c6 n t3">
              <Price p={liqPrice(p.entry, p.lev, p.side)} />
            </span>
            <span className={`pnl n ${pnl >= 0n ? 'up' : 'dn'}`}>
              {sgn(pnl)}
              <small>{pct(ratio, 0)}</small>
            </span>
            <span className="r">
              <button
                className="btn sm o"
                disabled={wait > 0 || c.status !== 'open'}
                onClick={() => sim.closeById(p.id)}
              >
                {wait ? `Close in ${wait}s` : 'Close'}
              </button>
            </span>
          </div>
        );
      })}
    </>
  );
}

export function HistTable({ list }: { list: Closed[] }) {
  if (!list.length)
    return (
      <div className="empty">
        <b>No closed trades yet</b>Closed trades show up here with their result.
      </div>
    );
  const now = Date.now();
  return (
    <>
      <div className="tr hd t-hist">
        <span>Token</span>
        <span>Side</span>
        <span className="c3">Stake</span>
        <span className="c4">Entry to exit</span>
        <span>Result</span>
        <span className="c6">How it closed</span>
        <span className="c7 r">When</span>
      </div>
      {list.slice(0, 30).map((p) => (
        <div className="tr t-hist" key={p.id}>
          <span className="tk">
            <Tok s={p.sym} size={24} />
            <b>${p.sym}</b>
          </span>
          <span>
            <SideChip side={p.side} lev={p.lev} />
          </span>
          <span className="c3 n">{fixed(p.stake)}</span>
          <span className="c4 n t2">
            <Price p={p.entry} /> to <Price p={p.exit} />
          </span>
          <span className={`n ${p.net >= 0n ? 'up' : 'dn'}`}>{sgn(p.net)} SOL</span>
          <span className="c6 t2">{REASON[p.reason]}</span>
          <span className="c7 r t3">{ago(now - p.closedAt)} ago</span>
        </div>
      ))}
    </>
  );
}
