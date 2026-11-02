/**
 * The account's money movements (Hyperliquid's non-funding ledger) in plain words, for Portfolio's Activity list:
 * deposits, moves between spot and the trading balance, sends (a withdrawal to Solana is a send of SOL to Unit),
 * and anything else Hyperliquid records, so the person can always see where their money went.
 */
import type { UserNonFundingLedgerUpdatesResponse } from '@nktkas/hyperliquid/api/info';

export type LedgerUpdate = UserNonFundingLedgerUpdatesResponse[number];

export interface Movement {
  time: number;
  hash: string;
  /** What happened, in words. */
  what: string;
  /** The amount with its token, signed: "+0.24 SOL", "−$22.80". */
  amount: string;
  /** Fee or counterparty, when there is one. */
  detail: string;
}

/** Unit's SOL on Hyperliquid is SOL to people. */
const tokenName = (t: string) => (t === 'USOL' ? 'SOL' : t);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const num = (v: string) => Number(v) || 0;
const usd = (v: number) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (v: number, token: string) =>
  token === 'USDC'
    ? usd(v)
    : `${v.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${tokenName(token)}`;

export function describeLedger(u: LedgerUpdate, owner: string): Movement {
  const d = u.delta as { type: string } & Record<string, unknown>;
  const base = { time: u.time, hash: u.hash };
  const me = owner.toLowerCase();
  switch (d.type) {
    case 'deposit':
      return { ...base, what: 'Deposit', amount: `+${usd(num(d.usdc as string))}`, detail: '' };
    case 'withdraw':
      return {
        ...base,
        what: 'Withdrawal (USDC)',
        amount: `−${usd(num(d.usdc as string))}`,
        detail: num(d.fee as string) ? `fee ${usd(num(d.fee as string))}` : '',
      };
    case 'accountClassTransfer':
      return d.toPerp
        ? { ...base, what: 'Spot → trading balance', amount: usd(num(d.usdc as string)), detail: '' }
        : { ...base, what: 'Trading balance → spot', amount: usd(num(d.usdc as string)), detail: '' };
    case 'spotTransfer':
    case 'send': {
      const token = String(d.token ?? '');
      const amount = num(d.amount as string);
      const out = String(d.user ?? '').toLowerCase() === me;
      const fee = num((d.fee as string) ?? '0');
      const feeText = fee ? `fee ${qty(fee, (d.feeToken as string) || token)}` : '';
      return out
        ? {
            ...base,
            what: `Sent to ${short(String(d.destination ?? ''))}`,
            amount: `−${qty(amount, token)}`,
            detail: feeText,
          }
        : {
            ...base,
            what: `Received from ${short(String(d.user ?? ''))}`,
            amount: `+${qty(amount, token)}`,
            detail: feeText,
          };
    }
    case 'internalTransfer': {
      const out = String(d.user ?? '').toLowerCase() === me;
      const v = num(d.usdc as string);
      return {
        ...base,
        what: out
          ? `Sent to ${short(String(d.destination ?? ''))}`
          : `Received from ${short(String(d.user ?? ''))}`,
        amount: `${out ? '−' : '+'}${usd(v)}`,
        detail: num(d.fee as string) ? `fee ${usd(num(d.fee as string))}` : '',
      };
    }
    default:
      return { ...base, what: d.type.replace(/([A-Z])/g, ' $1').toLowerCase(), amount: '', detail: '' };
  }
}
