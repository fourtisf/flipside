/**
 * Depositing SOL from the person's Solana wallet: the amount rules, in lamports (no floats), so every one is
 * unit tested. Unit (the bridge) takes at least 0.12 SOL; while deposits are new, one deposit can move at most
 * NEXT_PUBLIC_MAX_DEPOSIT_SOL (default 1 SOL); and Max leaves 0.002 SOL behind for the network fee.
 */
import { LAMPORTS_PER_SOL, solText } from '@/wallet/solana';

/** Unit's minimum SOL deposit. */
export const MIN_DEPOSIT_LAMPORTS = 120_000_000n;
/** What Max leaves in the wallet for the transaction fee. */
export const FEE_RESERVE_LAMPORTS = 2_000_000n;
/**
 * Unit's fee on a SOL deposit, about: ALFA's first deposit sent 0.12 SOL and 0.1065 USOL arrived (0.0135 kept).
 * Used only to size the minimum so what arrives can be traded; the tracker shows the real fee on each deposit.
 */
export const UNIT_FEE_ESTIMATE_LAMPORTS = 15_000_000n;
/** Hyperliquid's smallest order, with a margin for price moves while the deposit travels. */
const TRADABLE_USD = 11;

/**
 * The smallest deposit worth making: Unit's own minimum, or enough that what arrives after Unit's fee is still
 * worth a sellable order (over $10) at today's SOL price, rounded up to 0.01 SOL.
 */
export function minDepositLamports(solPx: number): bigint {
  if (!(solPx > 0)) return MIN_DEPOSIT_LAMPORTS;
  const tradable = BigInt(Math.ceil((TRADABLE_USD / solPx) * 1e9)) + UNIT_FEE_ESTIMATE_LAMPORTS;
  const step = 10_000_000n;
  const rounded = ((tradable + step - 1n) / step) * step;
  return rounded > MIN_DEPOSIT_LAMPORTS ? rounded : MIN_DEPOSIT_LAMPORTS;
}

/** Exact decimal SOL text to lamports, or null when it isn't a plain amount with at most 9 decimals. */
export function toLamports(text: string): bigint | null {
  const t = text.trim();
  const m = /^(\d{0,12})(?:\.(\d{0,9}))?$/.exec(t);
  if (!m || t === '' || t === '.') return null;
  return BigInt(m[1] || '0') * LAMPORTS_PER_SOL + BigInt((m[2] ?? '').padEnd(9, '0') || '0');
}

const cap = toLamports((process.env.NEXT_PUBLIC_MAX_DEPOSIT_SOL ?? '').trim() || '1');
export const MAX_DEPOSIT_LAMPORTS = cap && cap > 0n ? cap : LAMPORTS_PER_SOL;

export type DepositPlan = { ok: true; lamports: bigint } | { ok: false; reason: string };

export function planDeposit(amount: string, balance: bigint | null, solPx = 0): DepositPlan {
  const lamports = toLamports(amount);
  if (lamports === null || lamports === 0n) return { ok: false, reason: 'Enter an amount of SOL.' };
  if (lamports < MIN_DEPOSIT_LAMPORTS)
    return {
      ok: false,
      reason: `Unit takes at least ${solText(MIN_DEPOSIT_LAMPORTS)} SOL per deposit. Less than that can be lost.`,
    };
  const min = minDepositLamports(solPx);
  if (lamports < min)
    return {
      ok: false,
      reason: `Deposit at least ${solText(min)} SOL: Unit keeps about ${solText(UNIT_FEE_ESTIMATE_LAMPORTS)} SOL as its fee, and what arrives must be worth over $10, Hyperliquid's smallest order, to trade.`,
    };
  if (lamports > MAX_DEPOSIT_LAMPORTS)
    return {
      ok: false,
      reason: `While deposits are new, one deposit can be at most ${solText(MAX_DEPOSIT_LAMPORTS)} SOL.`,
    };
  if (balance !== null && lamports + FEE_RESERVE_LAMPORTS > balance)
    return {
      ok: false,
      reason: `You have ${solText(balance)} SOL. Keep ${solText(FEE_RESERVE_LAMPORTS)} SOL for the network fee.`,
    };
  return { ok: true, lamports };
}
