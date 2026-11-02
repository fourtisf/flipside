'use client';

import { useEffect, useState } from 'react';
import type { UnitOperation } from '@/lib/unit';
import { useWallet } from '@/wallet/provider';
import { shortSol } from '@/wallet/solana';

/** Unit's words for where a withdrawal is, in plain ones. */
export function withdrawalState(state: string): { text: string; ok?: boolean; bad?: boolean } {
  switch (state) {
    case 'done':
      return { text: 'Paid out to your Solana wallet', ok: true };
    case 'failure':
      return { text: 'Failed at Unit', bad: true };
    case '':
    case 'sourceTxDiscovered':
      return { text: 'Unit has your SOL; on its way' };
    case 'waitForSrcTxFinalization':
      return { text: 'On its way: Hyperliquid is confirming the transfer (a few minutes)' };
    case 'buildingDstTx':
    case 'signTx':
    case 'broadcastTx':
      return { text: 'On its way: Unit is sending your SOL on Solana' };
    case 'waitForDstTxFinalization':
      return { text: 'Almost there: Solana is confirming it' };
    default:
      return { text: `On its way (${state})` };
  }
}

/**
 * The account's withdrawals as Unit, the bridge, sees them (GET /unit/operations through our server): paid out
 * with the Solana transaction, on its way, or failed. Read every 20 seconds.
 */
export function UnitWithdrawals() {
  const wallet = useWallet();
  const hl = wallet.address;
  const [ops, setOps] = useState<UnitOperation[] | null>(null);
  useEffect(() => {
    if (!hl) return;
    let live = true;
    const load = () =>
      fetch(`/unit/operations/${hl}`, { cache: 'no-store' })
        .then((r) => (r.ok ? (r.json() as Promise<{ operations?: UnitOperation[] }>) : null))
        .then((b) => live && b && setOps((b.operations ?? []).filter((o) => o.destinationChain === 'solana')))
        .catch(() => {});
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [hl]);
  if (!ops?.length) return null;
  return (
    <div className="wd-ops" id="wdOps">
      <b className="wd-h">Your withdrawals at Unit</b>
      <ul>
        {ops.slice(0, 5).map((o, i) => {
          const s = withdrawalState(o.state);
          const tx = o.destinationTxHash.split(':')[0];
          return (
            <li key={`${o.sourceTxHash}-${i}`} className={s.ok ? 'ok' : s.bad ? 'bad' : undefined}>
              <span>{s.text}</span>
              {o.destinationAddress && <span className="t2 n">to {shortSol(o.destinationAddress)}</span>}
              {o.createdAt && <span className="t2 n">{new Date(o.createdAt).toLocaleString('en-US')}</span>}
              {tx && (
                <a
                  className="lnk"
                  href={`https://solscan.io/tx/${tx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Solana transaction
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
