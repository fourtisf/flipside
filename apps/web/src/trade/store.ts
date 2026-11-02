'use client';

import {
  ApiRequestError,
  approveAgent,
  cancel,
  order,
  spotSend,
  updateLeverage,
  usdClassTransfer,
} from '@nktkas/hyperliquid/api/exchange';
import * as info from '@nktkas/hyperliquid/api/info';
import { httpConfig } from '@/hl/client';
import type { Market } from '@/hl/markets';
import { toSpot, type OrderRow, type PositionRow, type SpotRow } from '@/wallet/account';
import { shortSol } from '@/wallet/solana';
import type { WalletStore } from '@/wallet/store';
import { TRADING } from './config';
import {
  MIN_WITHDRAW_SOL,
  free,
  planSellUsol,
  planSendUsol,
  planWithdraw,
  usdcToMove,
  usolMarket,
} from './funds';
import { describe, explain, planClose, planOpen, planTpsl, type OpenInput } from './orders';
import { agentSigner, forgetAgent, loadAgent, newAgent, saveAgent, type Agent } from './signer';

const ACCEPTED = (owner: string) => `coinside.risk.${owner.toLowerCase()}`;

/** The wallet's error code, which the SDK wraps ("Failed to sign the typed data") as the error's cause. */
function walletCode(e: unknown, depth = 0): number | undefined {
  const err = e as { code?: unknown; cause?: unknown } | null;
  if (!err || depth > 4) return undefined;
  return typeof err.code === 'number' ? err.code : walletCode(err.cause, depth + 1);
}

/** What went wrong, for the person: a wallet that said no, Hyperliquid's own message, or a network problem. */
/** The Hyperliquid address that pays out to the Solana wallet `sol`, from our server (lib/unit.ts), or null. */
async function unitWithdrawAddress(sol: string): Promise<string | null> {
  const res = await fetch(`/unit/withdraw-address/${sol}`, { cache: 'no-store' }).catch(() => null);
  const to = res?.ok
    ? String(((await res.json().catch(() => ({}))) as { address?: unknown }).address ?? '')
    : '';
  return /^0x[0-9a-f]{40}$/.test(to) ? to : null;
}

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
  /** The position dialog: which position, on which tab (close it, or set its take profit and stop loss). */
  manage: { coin: string; tab: 'close' | 'tpsl' } | null = null;
  busy: string | null = null;
  msg: { text: string; ok: boolean; at: number } | null = null;
  /** What the last message is about, so Withdraw and Deposit each show only their own. */
  lastAction: string | null = null;
  /** A notification for the whole app (a toast), for things worth hearing about wherever the person is. */
  notice: { title: string; body: string; href?: string; link?: string; at: number } | null = null;

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
    this.lastAction =
      this.busy === 'withdraw' && this.lastAction === 'withdrawSol' ? 'withdrawSol' : (this.busy ?? null);
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
    const owner = this.wallet.address;
    if (!this.wallet.canSign() || !owner || this.busy) return;
    if (!this.accepted)
      return this.set((s) => s.say('Tick the box to confirm you understand the risks.', false));
    const agent = newAgent();
    this.set((s) => {
      s.busy = 'enable';
      s.msg = null;
    });
    try {
      const config = { ...httpConfig(), wallet: await this.wallet.signer() };
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

  /**
   * Close all (fraction 1) or part of a position, at market or at a limit price. Only ever from the position
   * dialog, after the person has seen the size, the price and the P&L.
   */
  async close(p: PositionRow, m: Market, fraction = 1, limit?: number): Promise<boolean> {
    if (!this.ready() || this.busy) return false;
    this.set((s) => {
      s.busy = `close:${p.coin}`;
      s.msg = null;
    });
    const share = fraction >= 1 ? 'your' : `${Math.round(fraction * 100)}% of your`;
    try {
      const res = await order(this.agentConfig(), {
        orders: [planClose(p, m, fraction, limit)],
        grouping: 'na',
      });
      const st = res.response.data.statuses[0];
      if (st && typeof st === 'object' && 'error' in st) throw new Error(String(st.error));
      this.set((s) => {
        s.say(
          limit
            ? `Limit close placed for ${share} ${p.coin} ${p.side} at $${limit}. It fills when the price gets there.`
            : `Closed ${share} ${p.coin} ${p.side}.`,
          true,
        );
        s.manage = null;
      });
      return true;
    } catch (e) {
      this.checkKey(e);
      this.set((s) => s.say(errorText(e, this.wallet.name), false));
      return false;
    } finally {
      this.set((s) => void (s.busy = null));
    }
  }

  /** Set take profit and/or stop loss on an open position (prices). */
  async setTpsl(p: PositionRow, m: Market, tp?: number, sl?: number): Promise<boolean> {
    if (!this.ready() || this.busy) return false;
    const planned = planTpsl(p, m, tp, sl);
    if (!planned.ok) {
      this.set((s) => s.say(planned.reason, false));
      return false;
    }
    this.set((s) => {
      s.busy = `tpsl:${p.coin}`;
      s.msg = null;
    });
    try {
      const res = await order(this.agentConfig(), { orders: planned.orders, grouping: 'positionTpsl' });
      const bad = res.response.data.statuses.find((st) => st && typeof st === 'object' && 'error' in st);
      if (bad && typeof bad === 'object' && 'error' in bad) throw new Error(String(bad.error));
      const what = tp && sl ? 'Take profit and stop loss' : tp ? 'Take profit' : 'Stop loss';
      this.set((s) => {
        s.say(`${what} set on your ${p.coin} ${p.side}. They show in Open orders.`, true);
        s.manage = null;
      });
      return true;
    } catch (e) {
      this.checkKey(e);
      this.set((s) => s.say(errorText(e, this.wallet.name), false));
      return false;
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

  /**
   * Make a deposit tradable: sell the free USOL for USDC (trading key), then move the spot USDC to perps (one
   * wallet signature). Either step is skipped when there is nothing for it.
   */
  async moveToTrading(spot: SpotRow[] | null) {
    const owner = this.wallet.address;
    if (!TRADING || !this.wallet.canSign() || !owner || this.busy) return;
    this.set((s) => {
      s.busy = 'move';
      s.msg = null;
    });
    try {
      let current = spot;
      const market = usolMarket(await info.spotMetaAndAssetCtxs(httpConfig()));
      // the best bid, so a small amount isn't pushed under the $10 minimum by slippage
      const book = market ? await info.l2Book(httpConfig(), { coin: market.pair }).catch(() => null) : null;
      const bid = Number(book?.levels?.[0]?.[0]?.px ?? 0);
      const sell = planSellUsol(current, market, bid);
      if (sell && !sell.ok) return this.set((s) => s.say(sell.reason, false));
      if (sell) {
        if (!this.ready()) return this.set((s) => s.say('Enable trading first, then move your SOL.', false));
        const res = await order(this.agentConfig(), { orders: [sell.order], grouping: 'na' });
        const st = res.response.data.statuses[0];
        if (st && typeof st === 'object' && 'error' in st)
          return this.set((s) => s.say(explain(String(st.error)), false));
        if (!(st && typeof st === 'object' && 'filled' in st))
          return this.set((s) => s.say("The SOL sale didn't fill. Nothing moved. Try again.", false));
        current = toSpot(await info.spotClearinghouseState(httpConfig(), { user: owner }));
      }
      const amount = usdcToMove(current);
      if (!amount)
        return this.set((s) => s.say('There is nothing to move yet: less than $1 is waiting.', false));
      await usdClassTransfer(
        { ...httpConfig(), wallet: await this.wallet.signer() },
        { amount, toPerp: true },
      );
      this.set((s) => {
        s.say(`Moved $${amount} to your trading balance. You can trade now.`, true);
        s.notice = {
          title: `$${amount} is in your trading balance`,
          body: 'Your deposit is ready to trade. Orders must be worth at least $10.',
          href: '/trade/SOL',
          link: 'Start trading',
          at: Date.now(),
        };
      });
    } catch (e) {
      this.checkKey(e);
      this.set((s) => s.say(errorText(e, this.wallet.name), false));
    } finally {
      this.set((s) => void (s.busy = null));
    }
  }

  /**
   * Withdraw `amount` dollars to the Solana wallet `sol`: move what spot lacks from the trading balance (the wallet
   * signs), buy USOL with it (the trading key), and send the USOL to the wallet's Unit withdrawal address (the
   * wallet signs), which Unit pays out as SOL. The address is fetched and the plan checked before anything moves;
   * if a later step fails, the money waits in spot, where Deposit's "Move to trading balance" puts it back.
   */
  async withdraw(amount: string, sol: string | null): Promise<boolean> {
    const owner = this.wallet.address;
    if (!TRADING || !this.wallet.canSign() || !owner || this.busy) return false;
    const say = (text: string, ok = false) => {
      this.set((s) => {
        s.say(text, ok);
        s.lastAction = 'withdraw';
      });
      return ok;
    };
    if (!sol) return say('Connect your Solana wallet first: the SOL goes back to it.');
    if (!this.ready()) return say('Enable trading first, then withdraw.');
    this.set((s) => {
      s.busy = 'withdraw';
      s.lastAction = 'withdraw';
      s.msg = null;
    });
    try {
      // 1. where it goes, before anything moves
      const to = await unitWithdrawAddress(sol);
      if (!to)
        return say("Couldn't get your withdrawal address from Unit. Nothing moved. Try again in a minute.");
      // 2. the price and the balances right now
      const [spotMeta, perps, spotState] = await Promise.all([
        info.spotMetaAndAssetCtxs(httpConfig()),
        info.clearinghouseState(httpConfig(), { user: owner }),
        info.spotClearinghouseState(httpConfig(), { user: owner }),
      ]);
      const market = usolMarket(spotMeta);
      const book = market ? await info.l2Book(httpConfig(), { coin: market.pair }).catch(() => null) : null;
      const planned = planWithdraw({
        amount: Number(amount),
        perp: Number(perps.withdrawable),
        spotUsdc: free(toSpot(spotState), 'USDC'),
        m: market,
        ask: Number(book?.levels?.[1]?.[0]?.px ?? 0),
      });
      if (!planned.ok) return say(planned.reason);
      const { plan } = planned;
      const signer = await this.wallet.signer();
      // 3. trading balance → spot
      if (plan.toSpot)
        await usdClassTransfer({ ...httpConfig(), wallet: signer }, { amount: plan.toSpot, toPerp: false });
      // 4. USDC → USOL
      const r = await order(this.agentConfig(), { orders: [plan.order], grouping: 'na' });
      const st = r.response.data.statuses[0];
      const waits = ' Your USDC waits in spot; Move USDC to trading balance in Deposit puts it back.';
      if (st && typeof st === 'object' && 'error' in st) return say(explain(String(st.error)) + waits);
      if (!(st && typeof st === 'object' && 'filled' in st))
        return say("The SOL purchase didn't fill: the price moved." + waits);
      const bought = st.filled.totalSz;
      if (Number(bought) < MIN_WITHDRAW_SOL)
        return say(
          `Only ${bought} SOL was bought, under Unit's ${MIN_WITHDRAW_SOL} SOL minimum, so it wasn't sent. It waits in your account; press "Withdraw my SOL" to send it.`,
        );
      // 5. USOL → Unit, which pays out SOL to the wallet
      try {
        await spotSend(
          { ...httpConfig(), wallet: signer },
          { destination: to, token: market!.token, amount: bought },
        );
      } catch (e) {
        this.checkKey(e);
        return say(
          `Bought ${bought} SOL, but sending it to Unit didn't go through: ${errorText(e, this.wallet.name)} It is safe in your account; press "Withdraw my SOL" to send it again.`,
        );
      }
      this.sent(bought, sol);
      return true;
    } catch (e) {
      this.checkKey(e);
      return say(errorText(e, this.wallet.name));
    } finally {
      this.set((s) => void (s.busy = null));
    }
  }

  /**
   * Send USOL already in the account to the Solana wallet `sol` (a deposit not moved yet, or a withdrawal whose
   * last step didn't go through): one signature, no purchase.
   */
  async withdrawUsol(sol: string | null): Promise<boolean> {
    const owner = this.wallet.address;
    if (!TRADING || !this.wallet.canSign() || !owner || this.busy) return false;
    const say = (text: string, ok = false) => {
      this.set((s) => {
        s.say(text, ok);
        s.lastAction = 'withdrawSol';
      });
      return ok;
    };
    if (!sol) return say('Connect your Solana wallet first: the SOL goes back to it.');
    this.set((s) => {
      s.busy = 'withdraw';
      s.lastAction = 'withdrawSol';
      s.msg = null;
    });
    try {
      const to = await unitWithdrawAddress(sol);
      if (!to)
        return say("Couldn't get your withdrawal address from Unit. Nothing moved. Try again in a minute.");
      const [spotMeta, spotState] = await Promise.all([
        info.spotMetaAndAssetCtxs(httpConfig()),
        info.spotClearinghouseState(httpConfig(), { user: owner }),
      ]);
      const market = usolMarket(spotMeta);
      const plan = planSendUsol(toSpot(spotState), market);
      if (!plan) return say('There is no SOL in your account to send.');
      if (!plan.ok) return say(plan.reason);
      await spotSend(
        { ...httpConfig(), wallet: await this.wallet.signer() },
        { destination: to, token: market!.token, amount: plan.amount },
      );
      this.sent(plan.amount, sol);
      return true;
    } catch (e) {
      this.checkKey(e);
      return say(errorText(e, this.wallet.name));
    } finally {
      this.set((s) => void (s.busy = null));
    }
  }

  private sent(amount: string, sol: string) {
    this.set((s) => {
      s.say(
        `Sent ${amount} SOL to Unit for ${shortSol(sol)}. It arrives in your Solana wallet in a few minutes.`,
        true,
      );
      s.lastAction = s.lastAction === 'withdrawSol' ? 'withdrawSol' : 'withdraw';
      s.notice = {
        title: `${amount} SOL is on its way to your Solana wallet`,
        body: `Unit pays it out to ${shortSol(sol)}, usually within a few minutes, less its small network fee.`,
        href: `https://solscan.io/account/${sol}`,
        link: 'Watch it on Solscan',
        at: Date.now(),
      };
    });
  }

  dismissNotice() {
    this.set((s) => void (s.notice = null));
  }
}
