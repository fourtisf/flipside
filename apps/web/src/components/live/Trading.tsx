'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { pxText, szText } from '@/hl/format';
import type { Market } from '@/hl/markets';
import { useHl } from '@/hl/provider';
import type { Draft } from '@/hl/store';
import { MAX_ORDER_USD, TRADING } from '@/trade/config';
import { planOpen, pnlAt, type OpenInput } from '@/trade/orders';
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
 * The order button: Connect wallet, Deposit first (an empty account, which Hyperliquid won't act for: it goes to
 * the Deposit panel in Portfolio), Enable trading, then Long or Short. Says why an order can't go yet, and what happened to the last one.
 */
export function TradeButton({ id, m, d, lev }: { id: string; m: Market; d: Draft; lev: number }) {
  const wallet = useWallet();
  const account = useAccount();
  const trade = useTrade();
  const router = useRouter();
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
  } else if (account.empty()) {
    label = 'Deposit first';
    cls = 'w';
    onClick = () => router.push('/portfolio#deposit');
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
/** TP/SL and Close on a position row. Neither acts at once: both open the position dialog. */
export function CloseButton({ p }: { p: PositionRow }) {
  const trade = useTrade();
  const hl = useHl();
  const m = hl.byName[p.coin];
  if (!TRADING || !trade.ready() || !m) return null;
  const open = (tab: 'close' | 'tpsl') => trade.set((s) => void (s.manage = { coin: p.coin, tab }));
  return (
    <span className="pos-acts">
      <button
        type="button"
        className="sb"
        data-tpsl={p.coin}
        disabled={!!trade.busy}
        onClick={() => open('tpsl')}
      >
        TP/SL
      </button>
      <button
        type="button"
        className="sb"
        data-close={p.coin}
        disabled={!!trade.busy}
        onClick={() => open('close')}
      >
        Close
      </button>
    </span>
  );
}

const PCTS = [25, 50, 75, 100];
const num = (v: string) => {
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * One position: close all or part of it, at market or at a limit price, after seeing the size, the price and the
 * P&L; or set its take profit and stop loss. Nothing is sent until the button at the bottom.
 */
export function PositionDialog() {
  const trade = useTrade();
  const account = useAccount();
  const hl = useHl();
  const coin = trade.manage?.coin ?? null;
  const p = coin ? account.positions.find((x) => x.coin === coin) : undefined;
  const m = coin ? hl.byName[coin] : undefined;
  const ref = useDialog(!!trade.manage, () => trade.set((s) => void (s.manage = null)));
  const [pct, setPct] = useState(100);
  const [kind, setKind] = useState<'market' | 'limit'>('market');
  const [limit, setLimit] = useState('');
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');
  // a fresh form each time the dialog opens
  useEffect(() => {
    if (!trade.manage) return;
    setPct(100);
    setKind('market');
    setTp('');
    setSl('');
    setLimit(m ? pxText(m.px, m.szDecimals).replace(/,/g, '') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.manage?.coin, trade.manage?.tab]);
  const tab = trade.manage?.tab ?? 'close';
  const busy = !!trade.busy;
  const msg = trade.msg && !trade.msg.ok && Date.now() - trade.msg.at < 60_000 ? trade.msg.text : '';
  const sz = m?.szDecimals ?? 4;
  const size = p ? (pct >= 100 ? p.size : p.size * (pct / 100)) : 0;
  const px = kind === 'limit' ? num(limit) : (m?.px ?? 0);
  const pnl = p && px ? pnlAt(p, px, size) : 0;
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}$${Math.abs(v).toFixed(2)}`;
  return (
    <dialog id="posDialog" aria-labelledby="posT" ref={ref}>
      <form method="dialog">
        {!p || !m ? (
          <>
            <h3 id="posT">Position closed</h3>
            <p>This position is no longer open.</p>
            <div className="dlg-a">
              <button className="btn w" value="close">
                OK
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 id="posT">
              {p.coin} {p.side} {p.lev}x
            </h3>
            <p>
              {szText(p.size, sz)} {p.coin} at ${pxText(p.entry, sz)} entry. Now ${pxText(m.px, sz)}, P&amp;L{' '}
              <span className={p.pnl >= 0 ? 'up' : 'dn'}>{signed(p.pnl)}</span>.
            </p>
            <div className="seg pos-tabs" role="group" aria-label="What to do">
              <button
                type="button"
                aria-pressed={tab === 'close'}
                onClick={() => trade.set((s) => void (s.manage = { coin: p.coin, tab: 'close' }))}
              >
                Close
              </button>
              <button
                type="button"
                aria-pressed={tab === 'tpsl'}
                onClick={() => trade.set((s) => void (s.manage = { coin: p.coin, tab: 'tpsl' }))}
              >
                Take profit / stop loss
              </button>
            </div>
            {tab === 'close' ? (
              <>
                <div className="seg" role="group" aria-label="How to close" id="closeKind">
                  {(['market', 'limit'] as const).map((k) => (
                    <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                      {k === 'market' ? 'Market' : 'Limit'}
                    </button>
                  ))}
                </div>
                {kind === 'limit' && (
                  <div className="amt">
                    <input
                      id="closePx"
                      inputMode="decimal"
                      aria-label="Limit price"
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                    />
                    <span>USD</span>
                  </div>
                )}
                <div className="seg" role="group" aria-label="How much to close" id="closePct">
                  {PCTS.map((v) => (
                    <button key={v} type="button" aria-pressed={pct === v} onClick={() => setPct(v)}>
                      {v}%
                    </button>
                  ))}
                </div>
                <dl className="sum" id="closeSum">
                  <div>
                    <dt>Closing</dt>
                    <dd>
                      {szText(size, sz)} {p.coin}
                    </dd>
                  </div>
                  <div>
                    <dt>{kind === 'limit' ? 'At your price' : 'At about'}</dt>
                    <dd>{px ? `$${pxText(px, sz)}` : '…'}</dd>
                  </div>
                  <div>
                    <dt>P&amp;L on this, about</dt>
                    <dd className={pnl >= 0 ? 'up' : 'dn'}>{signed(pnl)}</dd>
                  </div>
                </dl>
                {kind === 'limit' && (
                  <p className="hint">It waits on the book and fills only when the price reaches yours.</p>
                )}
              </>
            ) : (
              <>
                <p className="hint">
                  Prices that close the whole position for you. They stay with the position and go away when
                  it closes.
                </p>
                <label className="fl" htmlFor="tpPx">
                  Take profit at
                </label>
                <div className="amt">
                  <input id="tpPx" inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} />
                  <span>{num(tp) ? signed(pnlAt(p, num(tp))) : 'USD'}</span>
                </div>
                <label className="fl" htmlFor="slPx">
                  Stop loss at
                </label>
                <div className="amt">
                  <input id="slPx" inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} />
                  <span>{num(sl) ? signed(pnlAt(p, num(sl))) : 'USD'}</span>
                </div>
                {p.liq ? <p className="hint">Liquidation at about ${pxText(p.liq, sz)}.</p> : null}
              </>
            )}
            <p className="omsg" role="alert" id="posMsg">
              {msg}
            </p>
            <div className="dlg-a">
              <button className="btn o" value="cancel">
                Cancel
              </button>
              {tab === 'close' ? (
                <button
                  type="button"
                  className="btn w"
                  id="closeGo"
                  disabled={busy || (kind === 'limit' && !num(limit))}
                  onClick={() => void trade.close(p, m, pct / 100, kind === 'limit' ? num(limit) : undefined)}
                >
                  {busy
                    ? 'Sending'
                    : kind === 'limit'
                      ? `Place limit close (${pct}%)`
                      : pct >= 100
                        ? 'Close all at market'
                        : `Close ${pct}% at market`}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn w"
                  id="tpslGo"
                  disabled={busy || (!num(tp) && !num(sl))}
                  onClick={() => void trade.setTpsl(p, m, num(tp) || undefined, num(sl) || undefined)}
                >
                  {busy ? 'Sending' : 'Set'}
                </button>
              )}
            </div>
          </>
        )}
      </form>
    </dialog>
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
