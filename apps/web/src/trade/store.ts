'use client';

import {
  ApiRequestError,
  approveAgent,
  cancel,
  order,
  updateLeverage,
} from '@nktkas/hyperliquid/api/exchange';
import { httpConfig } from '@/hl/client';
import type { Market } from '@/hl/markets';
import type { OrderRow, PositionRow } from '@/wallet/account';
import type { WalletStore } from '@/wallet/store';
import { TRADING } from './config';
import { describe, explain, planClose, planOpen, type OpenInput } from './orders';
import { agentSigner, forgetAgent, loadAgent, newAgent, saveAgent, walletSigner, type Agent } from './signer';

const ACCEPTED = (owner: string) => `coinside.risk.${owner.toLowerCase()}`;

/** The wallet's error code, which the SDK wraps ("Failed to sign the typed data") as the error's cause. */
function walletCode(e: unknown, depth = 0): number | undefined {
  const err = e as { code?: unknown; cause?: unknown } | null;
  if (!err || depth > 4) return undefined;
  return typeof err.code === 'number' ? err.code : walletCode(err.cause, depth + 1);
}

/** What went wrong, for the person: a wallet that said no, Hyperliquid's own message, or a network problem. */
function errorText(e: unknown, wallet: string): string {
  const code = walletCode(e);
  if (code === 4001) return `You closed the request in ${wallet}. Nothing was signed.`;
  if (code !== undefined) return `${wallet} couldn't sign. Unlock it and try again.`;
  if (e instanceof ApiRequestError) return explain(e.message);
  if (e instanceof Error && /fetch|network|timed out/i.test(e.message))
    return "Couldn't reach Hyperliquid. Check your connection and try again.";
  return e instanceof Error ? explain(e.message) : 'Something went wrong. Try again.';
}

/**
 * Trading from Coinside, as an external store: whether this wallet has a trading key, the one action running
 * now, and the last result to show under the order button.
 */
export class TradeStore {
  owner: string | null = null;
  agent: Agent | null = null;
  /** The person has accepted the risk notice on this device. */
  accepted = false;
  dialog = false;
  /** The "how to deposit" dialog is open. */
  deposit = false;
  busy: string | null = null;
  msg: { text: string; ok: boolean; at: number } | null = null;

  version = 0;
  private listeners = new Set<() => void>();
  constructor(private readonly wallet: WalletStore) {}

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };
  getVersion = () => this.version;
  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }
  set(fn: (s: this) => void) {
    fn(this);
    this.emit();
  }
  private say(text: string, ok: boolean) {
    this.msg = { text, ok, at: Date.now() };
  }

  /** Load the trading key of the wallet now connected (or forget it). */
  follow(owner: string | null) {
    if (owner === this.owner) return;
    this.owner = owner;
    this.agent = owner ? loadAgent(owner) : null;
    let accepted = false;
    try {
      accepted = !!owner && localStorage.getItem(ACCEPTED(owner)) === '1';
    } catch {
      // no storage: ask again
    }
    this.accepted = accepted;
    this.msg = null;
    this.busy = null;
    this.emit();
  }

  /** Orders can be placed: trading is on, and this wallet approved a trading key. */
  ready(): boolean {
    return TRADING && !!this.agent && !!this.owner;
  }

  private agentConfig() {
    return { ...httpConfig(), wallet: agentSigner(this.agent!) };
  }

  /** The wallet approves a new trading key: one signature, and no fee to approve (Coinside charges none). */
  async enable() {
    const provider = this.wallet.provider();
    const owner = this.wallet.address;
    if (!provider || !owner || this.busy) return;
    if (!this.accepted)
      return this.set((s) => s.say('Tick the box to confirm you understand the risks.', false));
    const agent = newAgent();
    this.set((s) => {
      s.busy = 'enable';
      s.msg = null;
    });
    try {
      const config = { ...httpConfig(), wallet: walletSigner(provider, owner) };
      await approveAgent(config, { agentAddress: agent.address, agentName: 'coinside' });
      saveAgent(owner, agent);
      this.set((s) => {
        s.agent = agent;
        s.dialog = false;
        s.say('Trading is on for this wallet.', true);
      });
    } catch (e) {
      this.set((s) => s.say(errorText(e, this.wallet.name), false));
    } finally {
      this.set((s) => void (s.busy = null));
    }
  }

  setAccepted(on: boolean) {
    try {
      if (this.owner) localStorage.setItem(ACCEPTED(this.owner), on ? '1' : '0');
    } catch {
      // remembered for this visit only
    }
    this.set((s) => void (s.accepted = on));
  }

  /** Forget this browser's trading key (Enable trading makes a new one). */
  turnOff() {
    if (this.owner) forgetAgent(this.owner);
    this.set((s) => {
      s.agent = null;
      s.msg = null;
    });
  }

  /** A key Hyperliquid no longer knows (replaced elsewhere, or never approved): forget it so the button asks again. */
  private checkKey(e: unknown) {
    if (e instanceof ApiRequestError && /does not exist/i.test(e.message)) this.turnOff();
  }

  async open(input: OpenInput) {
    if (!this.ready() || this.busy) return;
    const planned = planOpen(input);
    if (!planned.ok) return this.set((s) => s.say(planned.reason, false));
    const { plan } = planned;
    this.set((s) => {
      s.busy = 'order';
      s.msg = null;
    });
    try {
      const config = this.agentConfig();
      await updateLeverage(config, plan.leverage);
      const res = await order(config, { orders: plan.orders, grouping: plan.grouping });
      this.set((s) => s.say(describe(res, input.m), true));
    } catch (e) {
      this.checkKey(e);
      this.set((s) => s.say(errorText(e, this.wallet.name), false));
    } finally {
      this.set((s) => void (s.busy = null));
    }
  }

  async close(p: PositionRow, m: Market) {
    if (!this.ready() || this.busy) return;
    this.set((s) => {
      s.busy = `close:${p.coin}`;
      s.msg = null;
    });
    try {
      await order(this.agentConfig(), { orders: [planClose(p, m)], grouping: 'na' });
      this.set((s) => s.say(`Closed your ${p.coin} ${p.side}.`, true));
    } catch (e) {
      this.checkKey(e);
      this.set((s) => s.say(errorText(e, this.wallet.name), false));
    } finally {
      this.set((s) => void (s.busy = null));
    }
  }

  async cancel(o: OrderRow, m: Market) {
    if (!this.ready() || this.busy) return;
    this.set((s) => {
      s.busy = `cancel:${o.oid}`;
      s.msg = null;
    });
    try {
      await cancel(this.agentConfig(), { cancels: [{ a: m.asset, o: o.oid }] });
      this.set((s) => s.say(`Cancelled your ${o.coin} order.`, true));
    } catch (e) {
      this.checkKey(e);
      this.set((s) => s.say(errorText(e, this.wallet.name), false));
    } finally {
      this.set((s) => void (s.busy = null));
    }
  }
}
