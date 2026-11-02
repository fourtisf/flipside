'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useTrade } from '@/wallet/provider';

/** A toast for the whole app: funds ready to trade, and the like. It goes away on its own after 20 seconds. */
export function Notice() {
  const trade = useTrade();
  const n = trade.notice;
  useEffect(() => {
    if (!n) return;
    const t = setTimeout(() => trade.dismissNotice(), 20_000);
    return () => clearTimeout(t);
  }, [n, trade]);
  if (!n) return null;
  return (
    <div className="dep-status dep-toast ok" id="notice" role="status">
      <b>{n.title}</b>
      <p>{n.body}</p>
      {n.href && (
        <p>
          {/^https?:/.test(n.href) ? (
            <a className="lnk" href={n.href} target="_blank" rel="noopener noreferrer">
              {n.link ?? 'Open'}
            </a>
          ) : (
            <Link className="lnk" href={n.href} onClick={() => trade.dismissNotice()}>
              {n.link ?? 'Open'}
            </Link>
          )}
        </p>
      )}
      <button type="button" className="lnk dep-x" aria-label="Dismiss" onClick={() => trade.dismissNotice()}>
        ×
      </button>
    </div>
  );
}
