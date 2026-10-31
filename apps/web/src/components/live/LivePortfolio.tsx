'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { szText } from '@/hl/format';
import { marketHref } from '@/hl/markets';
import { useHl } from '@/hl/provider';
import { M, pct } from '@/lib/format';
import { shortAddr } from '@/wallet/catalog';
import { TRADING } from '@/trade/config';
import { USOL, free } from '@/trade/funds';
import { useAccount, useSolana, useTrade, useWallet } from '@/wallet/provider';
import { LAMPORTS_PER_SOL, shortSol, solText } from '@/wallet/solana';
import { Price, SideChip } from '../ui';
import { CoinTok } from './CoinTok';
import { CancelButton, CloseButton } from './Trading';
import { usd2 } from './Wallet';

const two = (n: number) => String(n).padStart(2, '0');
const when = (ms: number) => {
  const d = new Date(ms);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${two(d.getHours())}:${two(d.getMinutes())}`;
};
/** "+$12.34" / "−$5.00" */
const signedUsd = (v: number) => (v >= 0 ? '+' : M) + usd2(Math.abs(v));

function Panel({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="pn" id={id}>
      <div className="pn-h">
        <h2 className="h3">{title}</h2>
        {note && <span className="c">{note}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * Deposit, in the person's own account on Coinside (ALFA: deposits happen here, never on another site). Step 1
 * is the personal SOL deposit address from Unit, which switches on with H4's address check; step 2 turns what
 * arrived (USOL) into USDC in the trading balance.
 */
function DepositPanel() {
  const account = useAccount();
  const trade = useTrade();
  const wallet = useWallet();
  const usol = free(account.spot, USOL);
  const usdc = free(account.spot, 'USDC');
  const busy = trade.busy === 'move';
  let label = 'Move to trading balance';
  let disabled = !TRADING || busy || !(usol > 0 || usdc >= 0.01);
  let onClick: () => void = () => void trade.moveToTrading(account.spot);
  if (busy) label = `Check ${wallet.name || 'your wallet'}`;
  else if (!(usol > 0 || usdc >= 0.01)) label = 'Nothing to move yet';
  else if (usol > 0 && !trade.ready()) {
    label = 'Enable trading first';
    disabled = !TRADING;
    onClick = () => trade.set((s) => void (s.dialog = true));
  }
  const msg = trade.msg && Date.now() - trade.msg.at < 60_000 ? trade.msg : null;
  return (
    <Panel id="deposit" title="Deposit" note="from Solana">
      {account.empty() && <p className="dep-lead">Your account is empty. Deposit to start trading.</p>}
      <ol className="fsteps">
        <li>
          <b>Send SOL from your Solana wallet</b>
          <SolanaSide />
        </li>
        <li>
          <b>Move it to your trading balance</b>
          <p>
            SOL arrives as USOL. One click sells it for USDC and moves it to your trading balance; your wallet
            signs once.
          </p>
          <dl className="fbal">
            <div>
              <dt>USOL</dt>
              <dd>{usol.toLocaleString('en-US', { maximumFractionDigits: 4 })}</dd>
            </div>
            <div>
              <dt>Spot USDC</dt>
              <dd>{usd2(usdc)}</dd>
            </div>
          </dl>
          <p className={`omsg${msg?.ok ? ' ok' : ''}`} id="moveMsg" role="status">
            {msg?.text ?? ''}
          </p>
          <button className="btn w" type="button" id="moveBtn" disabled={disabled} onClick={onClick}>
            {label}
          </button>
        </li>
      </ol>
    </Panel>
  );
}

/** Step 1 of Deposit: the Solana side of the person's wallet, where their SOL is, and its balance. */
function SolanaSide() {
  const sol = useSolana();
  const wallet = useWallet();
  const hl = useHl();
  if (!sol.address)
    return (
      <>
        <p>
          Connect the Solana side of {wallet.name || 'your wallet'} to see your SOL and deposit it from here.
        </p>
        {sol.picking ? (
          <div className="sol-pick" id="solPick">
            {sol.wallets.map((w) => (
              <button key={w.name} type="button" className="btn o" onClick={() => void sol.connect(w.name)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.icon} alt="" width={18} height={18} />
                {w.name}
              </button>
            ))}
          </div>
        ) : (
          <button
            className="btn w"
            type="button"
            id="solConnect"
            disabled={sol.connecting}
            onClick={() => void sol.connect()}
          >
            {sol.connecting ? `Check ${sol.match()?.name ?? 'your wallet'}` : 'Connect Solana wallet'}
          </button>
        )}
        {sol.error && (
          <p className="omsg" role="alert">
            {sol.error}
          </p>
        )}
      </>
    );
  const px = hl.byName.SOL?.px ?? 0;
  const usd = sol.lamports !== null && px > 0 ? (Number(sol.lamports) / Number(LAMPORTS_PER_SOL)) * px : null;
  return (
    <>
      <dl className="fbal" id="solBal">
        <div>
          <dt>{sol.name}, Solana</dt>
          <dd>{shortSol(sol.address)}</dd>
        </div>
        <div>
          <dt>SOL</dt>
          <dd>{sol.lamports !== null ? solText(sol.lamports) : sol.balanceFailed ? '—' : '…'}</dd>
        </div>
        <div>
          <dt>Value</dt>
          <dd>{usd !== null ? `≈ ${usd2(usd)}` : '…'}</dd>
        </div>
      </dl>
      {sol.balanceFailed && sol.lamports === null && (
        <p className="omsg" role="status">
          Couldn&apos;t read your SOL balance just now. It retries on its own.
        </p>
      )}
      <p>
        Your deposit address shows here once it has been checked, so SOL can only reach your account. The
        Deposit button switches on with it.
      </p>
      <button className="btn w" type="button" id="solDeposit" disabled>
        Deposit SOL
      </button>
    </>
  );
}

const Empty = ({ b, children }: { b: string; children: ReactNode }) => (
  <div className="empty">
    <b>{b}</b>
    {children}
  </div>
);

/** Open positions, with Close once trading is on. Portfolio and the terminal both show it. */
export function PositionsPanel({ id }: { id: string }) {
  const account = useAccount();
  const hl = useHl();
  const sz = (coin: string) => hl.byName[coin]?.szDecimals;
  const s = account.summary;
  const loading = !s && !account.failed;
  return (
    <Panel id={id} title="Open positions" note={s ? String(account.positions.length) : undefined}>
      {account.positions.length ? (
        <div role="table" aria-label="Open positions">
          <div className="tr t-hp hd" role="row">
            <span role="columnheader">Market</span>
            <span role="columnheader">Side</span>
            <span role="columnheader" className="c3">
              Size
            </span>
            <span role="columnheader" className="c4">
              Entry
            </span>
            <span role="columnheader" className="c5">
              Mark
            </span>
            <span role="columnheader" className="c6">
              Liq. price
            </span>
            <span role="columnheader" className="r">
              P&amp;L
            </span>
            <span role="columnheader" className="r">
              <span className="vh">Close</span>
            </span>
          </div>
          {account.positions.map((p) => (
            <div className="tr t-hp" role="row" key={p.coin}>
              <span role="cell" className="tk">
                <CoinTok name={p.coin} size={24} />
                <Link href={marketHref(p.coin)}>
                  <b>{p.coin}</b>
                </Link>
              </span>
              <span role="cell">
                <SideChip side={p.side} lev={p.lev} />
              </span>
              <span role="cell" className="n c3">
                {szText(p.size, sz(p.coin) ?? 6)}
              </span>
              <span role="cell" className="n c4">
                <Price p={p.entry} sz={sz(p.coin)} />
              </span>
              <span role="cell" className="n c5">
                {hl.byName[p.coin] ? <Price p={hl.byName[p.coin]!.px} sz={sz(p.coin)} /> : '…'}
              </span>
              <span role="cell" className="n c6 t2">
                {p.liq ? <Price p={p.liq} sz={sz(p.coin)} /> : 'None'}
              </span>
              <span role="cell" className={`n r pnl ${p.pnl >= 0 ? 'up' : 'dn'}`}>
                {signedUsd(p.pnl)}
                <small>{pct(p.roe)}</small>
              </span>
              <span role="cell" className="r">
                <CloseButton p={p} />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Empty b={loading ? 'Loading positions' : 'No open positions'}>
          {loading
            ? 'Reading your account from Hyperliquid.'
            : 'Positions you open on Hyperliquid show up here.'}
        </Empty>
      )}
    </Panel>
  );
}

/** Open orders, with Cancel once trading is on. */
export function OrdersPanel({ id }: { id: string }) {
  const account = useAccount();
  const hl = useHl();
  const sz = (coin: string) => hl.byName[coin]?.szDecimals;
  return (
    <Panel id={id} title="Open orders" note={account.orders ? String(account.orders.length) : undefined}>
      {account.orders?.length ? (
        <div role="table" aria-label="Open orders">
          <div className="tr t-ho hd" role="row">
            <span role="columnheader">Market</span>
            <span role="columnheader">Side</span>
            <span role="columnheader" className="c3">
              Type
            </span>
            <span role="columnheader">Price</span>
            <span role="columnheader" className="c5">
              Size
            </span>
            <span role="columnheader" className="r c6">
              Placed
            </span>
            <span role="columnheader" className="r">
              <span className="vh">Cancel</span>
            </span>
          </div>
          {account.orders.map((o) => (
            <div className="tr t-ho" role="row" key={o.oid}>
              <span role="cell" className="tk">
                <CoinTok name={o.coin} size={24} />
                <b>{o.coin}</b>
              </span>
              <span role="cell" className={o.side === 'buy' ? 'up' : 'dn'}>
                {o.side === 'buy' ? 'Buy' : 'Sell'}
              </span>
              <span role="cell" className="c3 t2">
                {o.type}
                {o.reduceOnly ? ', reduce only' : ''}
              </span>
              <span role="cell" className="n">
                <Price p={o.trigger ?? o.px} sz={sz(o.coin)} />
              </span>
              <span role="cell" className="n c5">
                {szText(o.size, sz(o.coin) ?? 6)}
              </span>
              <span role="cell" className="r t3 c6">
                {when(o.time)}
              </span>
              <span role="cell" className="r">
                <CancelButton o={o} />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Empty b={account.orders ? 'No open orders' : 'Loading orders'}>
          {account.orders
            ? 'Limit orders and take profit or stop loss orders show up here.'
            : 'Reading your account from Hyperliquid.'}
        </Empty>
      )}
    </Panel>
  );
}

/** Your Hyperliquid account from the connected wallet. */
export function LivePortfolio() {
  const wallet = useWallet();
  const account = useAccount();
  const hl = useHl();
  const sz = (coin: string) => hl.byName[coin]?.szDecimals;

  if (wallet.status !== 'connected' || !wallet.address)
    return (
      <section id="v-portfolio" className="wrap page" aria-labelledby="v-portfolio-h">
        <div className="ph">
          <div>
            <h1 id="v-portfolio-h">Portfolio</h1>
            <p>
              Your Hyperliquid account: balance, open positions, orders and trades, read straight from
              Hyperliquid.
            </p>
          </div>
        </div>
        <div className="pn">
          <div className="empty soon-page">
            <b>Connect a wallet to see your account</b>
            Connecting only reads your address. Nothing is signed or sent.
            <button className="btn w" onClick={() => wallet.set((s) => void (s.dialog = 'connect'))}>
              Connect wallet
            </button>
          </div>
        </div>
      </section>
    );

  const s = account.summary;
  return (
    <section id="v-portfolio" className="wrap page" aria-labelledby="v-portfolio-h">
      <div className="ph">
        <div>
          <h1 id="v-portfolio-h">Portfolio</h1>
          <p>
            Your Hyperliquid account <span className="n">{shortAddr(wallet.address)}</span>, as Hyperliquid
            sees it.
          </p>
        </div>
        <div className="acts2">
          <a className="btn w" href="#deposit">
            Deposit
          </a>
        </div>
      </div>
      {account.failed && !s && (
        <div className="guardbox" role="status">
          Couldn&apos;t read this account from Hyperliquid yet. It fills in as soon as Hyperliquid answers.
        </div>
      )}
      <dl className="metrics" id="pf-metrics">
        <div>
          <dt>Account value</dt>
          <dd>{s ? usd2(s.value) : '…'}</dd>
        </div>
        <div>
          <dt>Withdrawable</dt>
          <dd>{s ? usd2(s.withdrawable) : '…'}</dd>
        </div>
        <div>
          <dt>Unrealized P&amp;L</dt>
          <dd className={s ? (s.pnl >= 0 ? 'up' : 'dn') : undefined}>{s ? signedUsd(s.pnl) : '…'}</dd>
        </div>
        <div>
          <dt>Margin used</dt>
          <dd>{s ? usd2(s.marginUsed) : '…'}</dd>
        </div>
      </dl>
      <div className="stack">
        <DepositPanel />
        <PositionsPanel id="pf-pos" />
        <OrdersPanel id="pf-orders" />
        <Panel id="pf-spot" title="Balances" note="spot">
          {account.spot?.length ? (
            <div role="table" aria-label="Spot balances">
              <div className="tr t-hs hd" role="row">
                <span role="columnheader">Coin</span>
                <span role="columnheader">Total</span>
                <span role="columnheader" className="r">
                  In open orders
                </span>
              </div>
              {account.spot.map((b) => (
                <div className="tr t-hs" role="row" key={b.coin}>
                  <span role="cell" className="tk">
                    <b>{b.coin}</b>
                  </span>
                  <span role="cell" className="n">
                    {szText(b.total, 6)}
                  </span>
                  <span role="cell" className="n r t2">
                    {szText(b.hold, 6)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty b={account.spot ? 'No spot balances' : 'Loading balances'}>
              {account.spot
                ? 'SOL deposited from Solana arrives here as USOL, and USDC from Across as USDC.'
                : 'Reading your account from Hyperliquid.'}
            </Empty>
          )}
        </Panel>
        <Panel id="pf-fills" title="Recent trades" note={account.fills ? 'last 50' : undefined}>
          {account.fills?.length ? (
            <div role="table" aria-label="Recent trades">
              <div className="tr t-hf hd" role="row">
                <span role="columnheader">Market</span>
                <span role="columnheader">Trade</span>
                <span role="columnheader" className="c3">
                  Price
                </span>
                <span role="columnheader" className="c4">
                  Size
                </span>
                <span role="columnheader" className="c5">
                  Fee
                </span>
                <span role="columnheader" className="c6">
                  Closed P&amp;L
                </span>
                <span role="columnheader" className="r">
                  Time
                </span>
              </div>
              {account.fills.map((f) => (
                <div className="tr t-hf" role="row" key={f.tid}>
                  <span role="cell" className="tk">
                    <CoinTok name={f.coin} size={24} />
                    <b>{f.coin}</b>
                  </span>
                  <span role="cell" className={f.side === 'buy' ? 'up' : 'dn'}>
                    {f.dir}
                  </span>
                  <span role="cell" className="n c3">
                    <Price p={f.px} sz={sz(f.coin)} />
                  </span>
                  <span role="cell" className="n c4">
                    {szText(f.size, sz(f.coin) ?? 6)}
                  </span>
                  <span role="cell" className="n c5 t2">
                    {usd2(f.fee)}
                  </span>
                  <span
                    role="cell"
                    className={`n c6 ${f.closedPnl > 0 ? 'up' : f.closedPnl < 0 ? 'dn' : 't3'}`}
                  >
                    {f.closedPnl ? signedUsd(f.closedPnl) : '–'}
                  </span>
                  <span role="cell" className="r t3">
                    {when(f.time)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty b={account.fills ? 'No trades on this account yet' : 'Loading trades'}>
              {account.fills
                ? 'Your trades on Hyperliquid show up here.'
                : 'Reading your account from Hyperliquid.'}
            </Empty>
          )}
        </Panel>
      </div>
    </section>
  );
}
