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

export function planDeposit(amount: string, balance: bigint | null): DepositPlan {
  const lamports = toLamports(amount);
  if (lamports === null || lamports === 0n) return { ok: false, reason: 'Enter an amount of SOL.' };
  if (lamports < MIN_DEPOSIT_LAMPORTS)
    return {
      ok: false,
      reason: `Unit takes at least ${solText(MIN_DEPOSIT_LAMPORTS)} SOL per deposit. Less than that can be lost.`,
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
