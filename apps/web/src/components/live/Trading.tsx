'use client';

import type { Market } from '@/hl/markets';
import { useHl } from '@/hl/provider';
import type { Draft } from '@/hl/store';
import { MAX_ORDER_USD, TRADING } from '@/trade/config';
import { planOpen, type OpenInput } from '@/trade/orders';
import type { OrderRow, PositionRow } from '@/wallet/account';
import { useAccount, useTrade, useWallet } from '@/wallet/provider';
import { useDialog } from '../dialog';
import { amount } from './OrderBits';

/** The order panel's inputs as an order for Hyperliquid. */
export function inputFrom(m: Market, d: Draft, lev: number, available?: number): OpenInput {
  return {
    m,
    side: d.side,
    margin: amount(d.amt),
    lev,
    type: d.type,
    limit: d.type === 'limit' ? amount(d.limit) : undefined,
    tp: d.tpsl && amount(d.tp) ? amount(d.tp) : undefined,
    sl: d.tpsl && amount(d.sl) ? amount(d.sl) : undefined,
    available,
  };
}

/**
 * The order button: Connect wallet, Enable trading, then Long or Short. Says why an order can't go yet, and what
 * happened to the last one.
 */
export function TradeButton({ id, m, d, lev }: { id: string; m: Market; d: Draft; lev: number }) {
  const wallet = useWallet();
  const account = useAccount();
  const trade = useTrade();
  const side = d.side === 'long' ? 'Long' : 'Short';

  let label = `${side} ${m.name}`;
  let cls: string = d.side;
  let disabled = false;
  let reason = '';
  let onClick: () => void = () => void trade.open(inputFrom(m, d, lev, account.summary?.withdrawable));
  if (!TRADING) {
    label = 'Trading opens soon';
    cls = 'w';
    disabled = true;
  } else if (wallet.status !== 'connected') {
    label = 'Connect wallet';
    cls = 'w';
    onClick = () => wallet.set((s) => void (s.dialog = 'connect'));
  } else if (!trade.ready()) {
    label = 'Enable trading';
    cls = 'w';
    onClick = () => trade.set((s) => void (s.dialog = true));
  } else if (trade.busy === 'order') {
    label = 'Placing order';
    disabled = true;
  } else {
    const planned = planOpen(inputFrom(m, d, lev, account.summary?.withdrawable));
    if (!planned.ok) {
      disabled = true;
      // say why only once something has been typed
      if (amount(d.amt) > 0) reason = planned.reason;
    }
  }
  const msg = trade.msg && Date.now() - trade.msg.at < 60_000 ? trade.msg : null;
  return (
    <>
      <p className={`omsg${msg?.ok && !reason ? ' ok' : ''}`} id={`${id}-msg`} role="status">
        {reason || msg?.text || ''}
      </p>
      <button className={`cta ${cls}`} id={id} type="button" disabled={disabled} onClick={onClick}>
        {label}
      </button>
    </>
  );
}

/** Turn trading on for this wallet: the risk notice, then one wallet signature. */
export function EnableDialog() {
  const trade = useTrade();
  const wallet = useWallet();
  const ref = useDialog(trade.dialog, () => trade.set((s) => void (s.dialog = false)));
  const busy = trade.busy === 'enable';
  return (
    <dialog id="enable" aria-labelledby="enT" ref={ref}>
      <form method="dialog">
        <h3 id="enT">Enable trading</h3>
        <p>
          {wallet.name || 'Your wallet'} signs once to approve a trading key that stays in this browser.
          Orders then go through without a pop-up each time. The trading key can place and cancel orders, and
          can never withdraw or move your funds.
        </p>
        <p>Coinside charges no fee. You pay only Hyperliquid&apos;s own trading fee.</p>
        <p className="hint">
          While trading is new, one order can open at most a ${MAX_ORDER_USD.toLocaleString('en-US')}{' '}
          position.
        </p>
        <label className="ack">
          <input
            type="checkbox"
            id="ack"
            checked={trade.accepted}
            onChange={(e) => trade.setAccepted(e.target.checked)}
          />
          <span>
            I understand that leveraged trading can lose my whole margin, and I&apos;m allowed to trade
            perpetual futures where I live. Hyperliquid isn&apos;t available in the United States.
          </span>
        </label>
        <p className="omsg" role="alert">
          {!trade.msg?.ok ? trade.msg?.text : ''}
        </p>
        <div className="dlg-a">
          <button className="btn o" value="cancel">
            Cancel
          </button>
          <button
            className="btn w"
            type="button"
            id="enableGo"
            disabled={!trade.accepted || busy}
            onClick={() => void trade.enable()}
          >
            {busy ? `Check ${wallet.name || 'your wallet'}` : 'Enable trading'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** Close a position now, at market. */
export function CloseButton({ p }: { p: PositionRow }) {
  const trade = useTrade();
  const hl = useHl();
  const m = hl.byName[p.coin];
  if (!TRADING || !trade.ready() || !m) return null;
  const busy = trade.busy === `close:${p.coin}`;
  return (
    <button
      type="button"
      className="sb"
      data-close={p.coin}
      disabled={!!trade.busy}
      onClick={() => void trade.close(p, m)}
    >
      {busy ? 'Closing' : 'Close'}
    </button>
  );
}

export function CancelButton({ o }: { o: OrderRow }) {
  const trade = useTrade();
  const hl = useHl();
  const m = hl.byName[o.coin];
  if (!TRADING || !trade.ready() || !m) return null;
  return (
    <button
      type="button"
      className="sb"
      data-cancel={o.oid}
      disabled={!!trade.busy}
      onClick={() => void trade.cancel(o, m)}
    >
      {trade.busy === `cancel:${o.oid}` ? 'Cancelling' : 'Cancel'}
    </button>
  );
}
