'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { stateText } from '@/trade/deposit-tracker';
import { useDeposits } from '@/wallet/provider';

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Where the last SOL deposit is: on its way (with Unit's own status when it gives one) or arrived as USOL. In the
 * Deposit panel, and as a toast on every other page, so the person hears about it wherever they are.
 */
export function DepositStatus({ toast = false }: { toast?: boolean }) {
  const d = useDeposits();
  const [, tick] = useState(0);
  const [hidden, setHidden] = useState<string | null>(null);
  // re-render once a minute so "taking longer than usual" appears on its own
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const p = d.pending;
  if (!p || (toast && hidden === `${p.sig}:${p.arrived}`)) return null;
  const tx = (
    <a className="lnk" href={`https://solscan.io/tx/${p.sig}`} target="_blank" rel="noopener noreferrer">
      See the transaction
    </a>
  );
  return (
    <div
      className={`dep-status${toast ? ' dep-toast' : ''}${p.arrived ? ' ok' : ''}`}
      id={toast ? 'depToast' : 'depStatus'}
      role="status"
    >
      {p.arrived ? (
        <>
          <b>{p.sol} SOL arrived in your account as USOL.</b>
          {p.received !== undefined && (
            <p>
              {p.received.toLocaleString('en-US', { maximumFractionDigits: 4 })} USOL arrived; Unit kept{' '}
              {Math.max(0, Number(p.sol) - p.received).toLocaleString('en-US', { maximumFractionDigits: 4 })}{' '}
              SOL as its fee. Coinside charges nothing.
            </p>
          )}
          <p>
            {toast ? (
              <Link className="lnk" href="/portfolio#deposit">
                Move it to your trading balance
              </Link>
            ) : (
              'Move it to your trading balance in step 2 below.'
            )}
          </p>
        </>
      ) : (
        <>
          <b>Deposit of {p.sol} SOL on its way.</b>
          <p>
            {stateText(p.state)}
            {d.slow() && ' Taking longer than usual; it can still arrive.'} Sent at {time(p.at)}. {tx}
          </p>
        </>
      )}
      <button
        type="button"
        className="lnk dep-x"
        aria-label="Dismiss"
        onClick={() => (p.arrived ? d.dismiss() : setHidden(`${p.sig}:${p.arrived}`))}
      >
        ×
      </button>
    </div>
  );
}

/** The toast, on every page but Portfolio (where the Deposit panel shows the same). */
export function DepositToast() {
  const path = usePathname();
  if (path === '/portfolio') return null;
  return <DepositStatus toast />;
}
