'use client';

/**
 * Follows a SOL deposit after the wallet sends it, so the person always knows where it is: sent (with the
 * transaction), what Unit says about it, and when it lands in the account as USOL. Kept on the device per
 * account, so a reload or another page still shows it.
 *
 * Arrival is read from the account itself (its USOL balance goes up), which doesn't depend on Unit's API. Unit's
 * step-by-step status is a bonus: polled from our server every 10 seconds while the deposit is on its way.
 */
import type { SpotRow } from '@/wallet/account';

export interface PendingDeposit {
  sig: string;
  /** SOL sent, as text ("0.12"). */
  sol: string;
  to: string;
  at: number;
  /** The account's USOL when it was sent; more than this means it arrived. */
  usolBefore: number;
  /** Unit's own state for it, when Unit's API says. */
  state: string | null;
  arrived: boolean;
  /** USOL that arrived, once it has. */
  received?: number;
}

const KEY = (hl: string) => `coinside.deposit.${hl.toLowerCase()}`;
/** After this long, the tracker says it's taking longer than usual (it keeps watching). */
export const SLOW_MS = 20 * 60_000;

/** Unit's operation states in plain words. Unknown ones are shown as they come. */
export function stateText(state: string | null): string {
  switch (state) {
    case null:
    case '':
      return 'Waiting for Unit to pick it up, usually a few minutes.';
    case 'sourceTxDiscovered':
      return 'Unit has seen your SOL.';
    case 'waitForSrcTxFinalization':
      return 'Waiting for Solana to finalize the transfer.';
    case 'buildingDstTx':
    case 'signTx':
    case 'broadcastTx':
      return 'Unit is crediting your account.';
    case 'waitForDstTxFinalization':
      return 'Almost there: Hyperliquid is confirming it.';
    case 'done':
      return 'Unit says it is done.';
    case 'failure':
      return 'Unit reports a problem with this deposit. Keep the transaction link; Unit can trace it.';
    default:
      return `Unit says: ${state}.`;
  }
}

const usolOf = (spot: SpotRow[] | null) => spot?.find((b) => b.coin === 'USOL')?.total ?? 0;

export class DepositTracker {
  hl: string | null = null;
  pending: PendingDeposit | null = null;

  version = 0;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  private save() {
    try {
      if (!this.hl) return;
      if (this.pending) localStorage.setItem(KEY(this.hl), JSON.stringify(this.pending));
      else localStorage.removeItem(KEY(this.hl));
    } catch {
      // kept for this visit only
    }
  }

  /** Follow the account in use (or none). */
  follow(hl: string | null) {
    if (hl === this.hl) return;
    this.stop();
    this.hl = hl;
    this.pending = null;
    try {
      const raw = hl ? localStorage.getItem(KEY(hl)) : null;
      const p = raw ? (JSON.parse(raw) as PendingDeposit) : null;
      if (p && typeof p.sig === 'string' && typeof p.usolBefore === 'number') this.pending = p;
    } catch {
      this.pending = null;
    }
    if (this.pending && !this.pending.arrived) this.poll();
    this.emit();
  }

  /** A deposit was just sent. */
  begin(sig: string, sol: string, to: string, spot: SpotRow[] | null) {
    this.pending = { sig, sol, to, at: Date.now(), usolBefore: usolOf(spot), state: null, arrived: false };
    this.save();
    this.poll();
    this.emit();
  }

  /** The account changed: has the USOL arrived? */
  observe(spot: SpotRow[] | null) {
    const p = this.pending;
    if (!p || p.arrived || !spot) return;
    const now = usolOf(spot);
    if (now > p.usolBefore + 1e-9) {
      this.pending = { ...p, arrived: true, received: now - p.usolBefore };
      this.stop();
      this.save();
      this.emit();
    }
  }

  dismiss() {
    this.stop();
    this.pending = null;
    this.save();
    this.emit();
  }

  slow(now = Date.now()): boolean {
    return !!this.pending && !this.pending.arrived && now - this.pending.at > SLOW_MS;
  }

  private poll() {
    this.stop();
    const tick = async () => {
      const p = this.pending;
      const hl = this.hl;
      if (!p || p.arrived || !hl) return this.stop();
      try {
        const res = await fetch(`/unit/operations/${hl}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { operations } = (await res.json()) as {
          operations?: Array<{ state: string; sourceTxHash: string }>;
        };
        const op = operations?.find((o) => o.sourceTxHash && o.sourceTxHash.includes(p.sig));
        if (op && this.pending?.sig === p.sig && op.state !== this.pending.state) {
          this.pending = { ...this.pending, state: op.state || null };
          this.save();
          this.emit();
        }
      } catch {
        // Unit's API is a bonus; arrival is read from the account
      }
    };
    void tick();
    this.timer = setInterval(() => void tick(), 10_000);
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
