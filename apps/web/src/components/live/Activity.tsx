'use client';

import * as info from '@nktkas/hyperliquid/api/info';
import { useEffect, useState } from 'react';
import { httpConfig } from '@/hl/client';
import { describeLedger, type Movement } from '@/wallet/ledger';
import { useTrade, useWallet } from '@/wallet/provider';

const two = (n: number) => String(n).padStart(2, '0');
const when = (ms: number) => {
  const d = new Date(ms);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${two(d.getHours())}:${two(d.getMinutes())}`;
};

/**
 * The account's money movements over the last 30 days, newest first, read from Hyperliquid every 15 seconds:
 * deposits, moves, sends (withdrawals to Solana go to Unit) and their fees. So "where is my money" always has an
 * answer on the page.
 */
export function Activity() {
  const wallet = useWallet();
  const trade = useTrade();
  const owner = wallet.address;
  // read again after each action (a move, a withdrawal) finishes
  const after = trade.msg?.at ?? 0;
  const [rows, setRows] = useState<Movement[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!owner) return;
    let live = true;
    const load = () =>
      info
        .userNonFundingLedgerUpdates(httpConfig(), { user: owner, startTime: Date.now() - 30 * 86_400_000 })
        .then((list) => {
          if (!live) return;
          setRows(
            list
              .map((u) => describeLedger(u, owner))
              .sort((a, b) => b.time - a.time)
              .slice(0, 20),
          );
          setFailed(false);
        })
        .catch(() => live && setFailed(true));
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [owner, after]);
  return (
    <div className="pn" id="pf-activity">
      <div className="pn-h">
        <h2 className="h3">Activity</h2>
        <span className="c">deposits, moves and withdrawals</span>
      </div>
      {rows?.length ? (
        <div role="table" aria-label="Account activity">
          {rows.map((r) => (
            <div className="tr t-act" role="row" key={`${r.hash}-${r.what}-${r.amount}`}>
              <span role="cell" className="t2 n">
                {when(r.time)}
              </span>
              <span role="cell">{r.what}</span>
              <span role="cell" className="n r">
                {r.amount}
              </span>
              <span role="cell" className="n r t2">
                {r.detail}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <b>{failed ? "Couldn't read your activity yet" : rows ? 'No activity yet' : 'Loading activity'}</b>
          {failed ? 'It retries on its own.' : 'Deposits, moves and withdrawals show here.'}
        </div>
      )}
    </div>
  );
}
