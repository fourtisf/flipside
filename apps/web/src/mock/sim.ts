/**
 * P0 mock engine: a port of the prototype's in-page simulation (prices, other traders, positions,
 * pool, rug guard demo). It stands in for the API and WebSocket until P1/P2 and is deleted then.
 *
 * Money follows the production rules even here: every SOL amount is a lamport bigint and position
 * math goes through @coinside/core (fees rounded up, P&L floored toward the pool). Prices,
 * percentages and the random walk are floats because they are display data.
 *
 * Determinism: all randomness at construction comes from a seeded PRNG, so the server render and
 * the client's first render produce identical markup. Timers only start in start() on the client.
 */
import {
  DEFAULT_RULES,
  LAMPORTS_PER_SOL,
  bpsUp,
  maxLeverage,
  maxWinBps,
  parseSol,
  quoteClose,
  quoteOpen,
  sideCap,
  toPriceScaled,
  type Side,
} from '@coinside/core';
import { fixed, plain, sgn, shortA, sol } from '@/lib/format';
import {
  COINS,
  DEFAULT_SYM,
  PROTOCOL,
  RUG_DEMO_SYM,
  SIM_SEED,
  TRADERS,
  USER_WALLETS,
  WALLETS,
  type Venue,
} from './fixtures';

export type { Side };
export type Mode = 'practice' | 'real';
export type CloseReason = 'manual' | 'liq' | 'max' | 'tp' | 'sl' | 'guard';
export type Lev = 2 | 5 | 10;

const R = DEFAULT_RULES;
const LPS = LAMPORTS_PER_SOL;
const CENT = LPS / 100n;
export const HIST = 600;

/* ---------- seeded randomness ---------- */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mock only: a simulated float SOL amount to lamports (micro-SOL precision). */
const lam = (solFloat: number): bigint => BigInt(Math.round(solFloat * 1e6)) * 1000n;
const solStr = (s: string): bigint => parseSol(s)!;
const minB = (a: bigint, b: bigint) => (a < b ? a : b);
const maxB = (a: bigint, b: bigint) => (a > b ? a : b);

/* ---------- types ---------- */
export interface Coin {
  sym: string;
  name: string;
  venue: Venue;
  mint: string;
  logo: string | null;
  supply: number;
  vol: number;
  liq: bigint;
  price: number;
  prev: number;
  hist: number[];
  vols: number[];
  drift: number;
  h1: number;
  oiL: bigint;
  oiS: bigint;
  holders: number;
  v24: bigint;
  status: 'open' | 'guard';
}

export interface Position {
  id: number;
  sym: string;
  side: Side;
  lev: number;
  stake: bigint;
  margin: bigint;
  openFee: bigint;
  entry: number;
  entryScaled: bigint;
  tpBps: number | null;
  slBps: number | null;
  at: number;
  maxWinBps: number;
  mode: Mode;
}

export interface Closed extends Position {
  exit: number;
  net: bigint;
  reason: CloseReason;
  closedAt: number;
}

export type FeedItem =
  | {
      id: number;
      kind: 'open' | 'close' | 'liq';
      sym: string;
      side: Side;
      lev: number;
      size: bigint;
      pnl?: bigint;
      w?: string;
      mine?: boolean;
      at: number;
    }
  | { id: number; kind: 'guard'; sym: string; drop: number; n: number; at: number };

export interface TapeItem {
  kind: 'open' | 'close' | 'liq';
  sym: string;
  side: Side;
  lev: number;
  size: bigint;
  pnl: bigint;
}

export interface Toast {
  id: number;
  msg: string;
  kind: '' | 'good' | 'bad';
}

export interface Win {
  sym: string;
  side: Side;
  lev: number;
  w: string;
  pnl: bigint;
  pc: number;
  me?: boolean;
}

export interface Leader {
  w: string;
  trades: number;
  win: number;
  pnl: bigint;
  best: { sym: string; side: Side; lev: number; pnl: bigint };
}

export type SortKey = 'price' | 'chg' | 'mcap' | 'liq' | 'short';

/* ---------- derived coin values (prototype helpers) ---------- */
export const solF = (l: bigint): number => Number(l) / 1e9;
export const mcap = (c: Coin) => c.price * c.supply;
export const chg1h = (c: Coin) => c.price / c.h1 - 1;
export const maxLev = (c: Coin) => maxLeverage(c.liq);
export const twap = (c: Coin, n = R.twapSeconds) => {
  const a = c.hist.slice(-n);
  return a.reduce((s, v) => s + v, 0) / a.length;
};
export const fillIn = (c: Coin, side: Side) =>
  side === 'long' ? Math.max(c.price, twap(c)) : Math.min(c.price, twap(c));
export const fillOut = (c: Coin, side: Side) =>
  side === 'long' ? Math.min(c.price, twap(c)) : Math.max(c.price, twap(c));
export const room = (c: Coin, side: Side) => maxB(0n, sideCap(c.liq) - (side === 'long' ? c.oiL : c.oiS));
export const hot = (c: Coin) => Math.abs(chg1h(c)) * Math.sqrt(solF(c.liq));
export const shortShare = (c: Coin) => {
  const t = c.oiL + c.oiS;
  return t === 0n ? 0 : Number((c.oiS * 1_000_000n) / t) / 1_000_000;
};
export const liqPrice = (entry: number, lev: number, side: Side) =>
  side === 'long' ? entry * (1 - 1 / lev) : entry * (1 + 1 / lev);
export const SORTF: Record<SortKey, (c: Coin) => number> = {
  price: (c) => c.price,
  chg: chg1h,
  mcap,
  liq: (c) => solF(c.liq),
  short: shortShare,
};
export const REASON: Record<CloseReason, string> = {
  manual: 'Closed by you',
  liq: 'Liquidated',
  max: 'Max win',
  tp: 'Take profit',
  sl: 'Stop loss',
  guard: 'Rug guard',
};

/** Floor a lamport amount to 0.01 SOL, like the prototype's percent chips. */
export const floorCent = (v: bigint) => v - (v % CENT);

/* ---------- the engine ---------- */
export class Sim {
  private rnd: () => number;
  private listeners = new Set<() => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private seq = 0;
  version = 0;

  coins: Coin[];
  bySym: Record<string, Coin>;
  byMint: Record<string, Coin>;

  mode: Mode = 'practice';
  wallet: string | null = null;
  walletName: string | null = null;
  balance: Record<Mode, bigint> = { practice: 0n, real: 0n };
  positions: Position[] = [];
  history: Closed[] = [];
  feed: FeedItem[] = [];
  tapeFill: TapeItem[];
  toasts: Toast[] = [];
  wins: Win[];
  leaders: { day: Leader[]; week: Leader[] };
  poolHist: number[];

  pool: { value: bigint; shares: bigint; mine: bigint };
  usersOwed: bigint;
  buffer: bigint;
  paid24: bigint;
  vol24: bigint;
  trades24: number;
  competitionPot: bigint;
  t = 0;
  bootAt: number;
  auditAt: number;
  /** Bumped when the prototype would rebuild the markets table (sort, filter, rug guard). */
  rowsKey = 0;
  /** Bumped when the prototype would re-render Hot / Most shorted / Big caps (every 4 ticks). */
  listsKey = 0;

  // shared UI state (the prototype kept these in its S object)
  /** The terminal's coin. The URL is the source of truth; this remembers it for the Trade nav link. */
  sel = DEFAULT_SYM;
  tk: { sym: string; side: Side; lev: number; amt: string; msg: string } = {
    sym: DEFAULT_SYM,
    side: 'long',
    lev: 2,
    amt: '0.25',
    msg: '',
  };
  order = {
    side: 'long' as Side,
    lev: 2,
    amt: '0.25',
    tpsl: false,
    tp: '',
    sl: '',
    oneClick: false,
    ocUntil: 0,
    msg: '',
    pt: 'open' as 'open' | 'hist',
    tf: 5,
    flip: false,
  };
  table = { q: '', venue: 'all' as 'all' | Venue, sort: { k: 'mcap' as SortKey, d: -1 } };
  watchQ = '';
  lp = { action: 'add' as 'add' | 'remove', amt: '1', msg: '' };
  range: 'day' | 'week' = 'day';
  dialogs: { wallets: boolean; fund: null | 'deposit' | 'withdraw' } = { wallets: false, fund: null };
  private walletIdx = 0;

  constructor(seed = SIM_SEED, now = Date.now()) {
    this.rnd = mulberry32(seed);
    this.bootAt = now;
    this.auditAt = now;
    this.pool = { value: solStr(PROTOCOL.poolSol), shares: solStr(PROTOCOL.poolShares), mine: 0n };
    this.usersOwed = solStr(PROTOCOL.usersOwedSol);
    this.buffer = solStr(PROTOCOL.bufferSol);
    this.paid24 = solStr(PROTOCOL.paid24Sol);
    this.vol24 = solStr(PROTOCOL.vol24Sol);
    this.trades24 = PROTOCOL.trades24;
    this.competitionPot = solStr(PROTOCOL.competitionPotSol);

    this.coins = COINS.map((s) => {
      const supply = 1e9;
      const p0 = s.mcapUsd / supply;
      const hist: number[] = [];
      const vols: number[] = [];
      let p = p0;
      for (let i = 0; i < HIST; i++) {
        hist.unshift(p);
        vols.unshift(this.rng(0.2, 1) * s.liquiditySol * 0.002);
        p = p * Math.exp(-this.gauss() * s.vol);
      }
      const liq = BigInt(s.liquiditySol) * LPS;
      const cap = minB(liq / 100n, R.sideCapMax);
      const oi = () => minB(floorCent(lam(this.rng(0, 6))), floorCent((cap * 55n) / 100n));
      return {
        sym: s.sym,
        name: s.name,
        venue: s.venue,
        mint: s.mint,
        logo: s.logo,
        supply,
        vol: s.vol,
        liq,
        price: p0,
        prev: p0,
        hist,
        vols,
        drift: 0,
        h1: p0 / (1 + this.rng(-0.22, 0.36)),
        oiL: oi(),
        oiS: oi(),
        holders: Math.round(this.rng(320, 9400)),
        v24: lam(s.liquiditySol * this.rng(0.5, 3.2)),
        status: 'open' as const,
      };
    });
    this.bySym = Object.fromEntries(this.coins.map((c) => [c.sym, c]));
    this.byMint = Object.fromEntries(this.coins.map((c) => [c.mint, c]));
    const fern = this.bySym[RUG_DEMO_SYM]!;
    fern.oiS = solStr('0.42');
    fern.oiL = solStr('0.06');

    // prototype order: tape filler, wins, leaders, then 8 boot feed items
    this.tapeFill = Array.from({ length: 12 }, () => this.simItem());
    // every trader address on the leaderboards and wins list is distinct
    this.wins = Array.from({ length: 8 }, (_, i) => {
      const c = this.pick(this.coins);
      const stake = this.rng(0.2, 0.7);
      const m = this.rng(0.9, 2);
      return {
        sym: c.sym,
        side: (this.rnd() < 0.6 ? 'short' : 'long') as Side,
        lev: this.pick([2, 5, 10]),
        w: WALLETS[24 + i]!,
        pnl: lam(stake * m),
        pc: m,
      };
    }).sort((a, b) => (b.pnl > a.pnl ? 1 : b.pnl < a.pnl ? -1 : 0));
    this.leaders = { day: this.genLeaders(1, 0), week: this.genLeaders(4.2, 12) };
    this.poolHist = this.genPoolHist();
    for (let i = 0; i < 8; i++) {
      const it = this.simItem();
      this.pushFeed({ ...it, w: TRADERS[i]! }, now - 600);
    }
  }

  /* ----- store plumbing for useSyncExternalStore ----- */
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  emit() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  /** Start the 1-second tick and the other-traders feed. Client only. Returns a stop function. */
  start(): () => void {
    const iv = setInterval(() => this.tick(), 1000);
    const loop = () => {
      this.simTrade();
      this.timers.push(setTimeout(loop, this.rng(900, 2600)));
    };
    this.timers.push(setTimeout(loop, 1200));
    return () => {
      clearInterval(iv);
      this.timers.forEach(clearTimeout);
      this.timers = [];
    };
  }

  /* ----- randomness ----- */
  private rng(a: number, b: number) {
    return a + this.rnd() * (b - a);
  }
  private gauss() {
    let u = 0;
    let v = 0;
    while (!u) u = this.rnd();
    while (!v) v = this.rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  private pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.rnd() * a.length)]!;
  }

  private genLeaders(scale: number, offset: number): Leader[] {
    return Array.from({ length: 12 }, (_, i) => {
      const c = this.pick(this.coins);
      return {
        w: WALLETS[offset + i]!,
        trades: Math.round(this.rng(9, 120) * scale),
        win: this.rng(0.44, 0.79),
        pnl: lam(this.rng(0.3, 6.5) * scale),
        best: {
          sym: c.sym,
          side: (this.rnd() < 0.55 ? 'short' : 'long') as Side,
          lev: this.pick([2, 5, 10]),
          pnl: 0n,
        },
      };
    })
      .sort((a, b) => (b.pnl > a.pnl ? 1 : b.pnl < a.pnl ? -1 : 0))
      .map((l) => ({ ...l, best: { ...l.best, pnl: lam(solF(l.pnl) * this.rng(0.25, 0.6)) } }));
  }

  private genPoolHist(): number[] {
    const n = 180;
    const a: number[] = [];
    let v = 1;
    for (let i = 0; i < n; i++) {
      a.push(v);
      v += this.gauss() * 0.0026;
    }
    const end = this.share();
    const d = a[n - 1]! - 1;
    return a.map((x, i) => x - d * (i / (n - 1)) + (end - 1) * (i / (n - 1)));
  }

  private simItem(): TapeItem {
    const c = this.pick(this.coins);
    return {
      kind: this.rnd() < 0.5 ? 'open' : 'close',
      sym: c.sym,
      side: this.rnd() < 0.5 ? 'long' : 'short',
      lev: this.pick([2, 5, 10]),
      size: floorCent(lam(this.rng(0.05, 0.8))),
      pnl: lam(this.rng(-0.3, 0.5)),
    };
  }

  /* ----- selectors ----- */
  bal(): bigint {
    return this.balance[this.mode];
  }
  share(): number {
    return Number((this.pool.value * 1_000_000_000n) / this.pool.shares) / 1e9;
  }
  maxWinBps(): number {
    return maxWinBps(this.pool.value);
  }
  realMargin(): bigint {
    return this.positions.filter((p) => p.mode === 'real').reduce((s, p) => s + p.margin, 0n);
  }
  owed(): bigint {
    return this.usersOwed + this.balance.real + this.realMargin() + this.pool.value;
  }
  myPositions(): Position[] {
    return this.positions.filter((p) => p.mode === this.mode);
  }
  myHistory(): Closed[] {
    return this.history.filter((p) => p.mode === this.mode);
  }
  /** Prototype tapeHTML item list: recent feed, padded with filler until there are 8. */
  tapeItems(): TapeItem[] {
    const recent = this.feed.filter((f): f is Extract<FeedItem, { side: Side }> => f.kind !== 'guard');
    const items: TapeItem[] = recent.map((f) => ({ ...f, pnl: f.pnl ?? 0n }));
    return (items.length >= 8 ? items : items.concat(this.tapeFill)).slice(0, 20);
  }
  refreshTape() {
    this.tapeFill = Array.from({ length: 12 }, () => this.simItem());
  }
  availTxt(): string {
    return this.mode === 'practice'
      ? `${sol(this.bal())} paper SOL available`
      : this.wallet
        ? `${sol(this.bal())} SOL available`
        : 'No wallet connected';
  }

  posValue(p: Position, at?: number) {
    const c = this.bySym[p.sym]!;
    const ex = at ?? fillOut(c, p.side);
    const q = quoteClose(
      {
        margin: p.margin,
        leverage: p.lev,
        side: p.side,
        entry: p.entryScaled,
        exit: toPriceScaled(ex),
        maxWinBps: p.maxWinBps,
      },
      R.closeFeeBps,
    );
    return { ex, ...q };
  }

  /* ----- toasts ----- */
  toast(msg: string, kind: Toast['kind'] = '') {
    const t = { id: ++this.seq, msg, kind };
    this.toasts = [...this.toasts, t].slice(-2);
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        this.toasts = this.toasts.filter((x) => x !== t);
        this.emit();
      }, 3800);
    }
    this.emit();
  }

  /* ----- wallet and mode ----- */
  setMode(m: Mode) {
    this.mode = m;
    this.emit();
  }
  claim() {
    this.balance.practice += R.practiceGrant;
    this.toast('10 paper SOL added. Practice trades use simulated money against live prices.', 'good');
  }
  requestConnect() {
    this.dialogs.wallets = true;
    this.emit();
  }
  closeWalletDialog(choice: string | null) {
    this.dialogs.wallets = false;
    if (choice && choice !== 'cancel') {
      this.wallet = USER_WALLETS[this.walletIdx++ % USER_WALLETS.length]!;
      this.walletName = choice;
      this.toast(`${choice} connected. Deposit SOL from Portfolio to start trading.`, 'good');
    }
    this.emit();
  }
  walletMenu() {
    if (this.wallet)
      this.toast(`Simulated wallet ${shortA(this.wallet)}. In production this opens your wallet menu.`);
  }
  openFund(kind: 'deposit' | 'withdraw') {
    this.dialogs.fund = kind;
    this.emit();
  }
  closeFund(ok: boolean, amount: string) {
    const kind = this.dialogs.fund;
    this.dialogs.fund = null;
    this.emit();
    if (!ok || !kind) return;
    const v = parseSol(amount);
    if (v === null || v <= 0n) return this.toast('Enter an amount above 0.', 'bad');
    if (kind === 'deposit') {
      this.balance.real += v;
      this.toast(`Deposited ${fixed(v)} SOL. It's in your balance now.`, 'good');
    } else {
      if (v > this.bal()) return this.toast(`You can withdraw up to ${sol(this.bal())} SOL.`, 'bad');
      this.balance.real -= v;
      this.toast(`Withdrew ${fixed(v)} SOL to ${shortA(this.wallet ?? '')}.`, 'good');
    }
  }

  /* ----- feed ----- */
  private pushFeed(it: Omit<Extract<FeedItem, { side: Side }>, 'id' | 'at'>, at?: number): void;
  private pushFeed(it: Omit<Extract<FeedItem, { kind: 'guard' }>, 'id' | 'at'>, at?: number): void;
  private pushFeed(it: Omit<FeedItem, 'id' | 'at'>, at = Date.now()) {
    this.feed = [{ ...it, id: ++this.seq, at } as FeedItem, ...this.feed].slice(0, 30);
  }

  /* ----- positions ----- */
  /**
   * Open a position. Returns null on success, '' when it redirected the user (connect or claim),
   * or the error message to show under the order form.
   */
  openPosition(sym: string, side: Side, lev: number, amtStr: string, tp: string | null, sl: string | null) {
    const c = this.bySym[sym]!;
    if (this.mode === 'real' && !this.wallet) {
      this.requestConnect();
      return '';
    }
    if (this.mode === 'practice' && this.bal() <= 0n) {
      this.claim();
      return '';
    }
    if (c.status !== 'open') return `Trading is paused on $${c.sym}.`;
    const amt = parseSol(amtStr);
    if (amt === null || amt < R.minTrade) return 'The minimum trade is 0.01 SOL.';
    if (amt > this.bal())
      return this.mode === 'real'
        ? 'Not enough balance. Deposit SOL from Portfolio or lower the amount.'
        : 'Not enough paper SOL. Lower the amount.';
    const rm = room(c, side);
    if (amt > rm) return `Only ${fixed(rm)} SOL of room is left for ${side}s on $${c.sym}. Lower the amount.`;
    const tpN = tp ? parseFloat(tp) : NaN;
    const slN = sl ? parseFloat(sl) : NaN;
    if (slN >= 100) return 'Stop loss has to be under 100%. At 100% the position is liquidated anyway.';

    const q = quoteOpen(amt, R.openFeeBps);
    const entry = fillIn(c, side);
    const p: Position = {
      id: ++this.seq,
      sym,
      side,
      lev,
      stake: amt,
      margin: q.margin,
      openFee: q.openFee,
      entry,
      entryScaled: toPriceScaled(entry),
      tpBps: tpN > 0 ? Math.round(tpN * 100) : null,
      slBps: slN > 0 ? Math.round(slN * 100) : null,
      at: Date.now(),
      maxWinBps: this.maxWinBps(),
      mode: this.mode,
    };
    this.balance[this.mode] -= amt;
    if (side === 'long') c.oiL += amt;
    else c.oiS += amt;
    if (this.mode === 'real') this.splitFee(q.openFee);
    this.positions = [...this.positions, p];
    this.pushFeed({ kind: 'open', sym, side, lev, size: amt, mine: true });
    this.toast(
      `${side === 'long' ? 'Long' : 'Short'} opened on $${sym}: ${fixed(amt)} SOL at ${lev}x, filled at ${plain(entry)}`,
      'good',
    );
    return null;
  }

  /** 80% of a fee to the pool (rounded up, in the pool's favor), the rest to protocol. */
  private splitFee(fee: bigint) {
    const toPool = bpsUp(fee, R.poolFeeShareBps);
    this.pool.value += toPool;
    this.buffer += fee - toPool;
  }

  closePos(p: Position, reason: CloseReason, at?: number) {
    const c = this.bySym[p.sym]!;
    const { pnl, closeFee, returned, ex } = this.posValue(p, at);
    const net = returned - p.stake;
    this.balance[p.mode] += returned;
    if (p.mode === 'real') {
      this.pool.value -= pnl;
      this.splitFee(closeFee);
      if (pnl > 0n) this.paid24 += pnl;
    }
    if (p.side === 'long') c.oiL = maxB(0n, c.oiL - p.stake);
    else c.oiS = maxB(0n, c.oiS - p.stake);
    this.positions = this.positions.filter((x) => x !== p);
    this.history = [{ ...p, exit: ex, net, reason, closedAt: Date.now() }, ...this.history];
    const L = `${p.lev}x ${p.side} on $${p.sym}`;
    const m: Record<CloseReason, string> = {
      manual: `Closed your ${L}: ${sgn(net)} SOL`,
      liq: `Liquidated: your ${L} lost its ${fixed(p.stake)} SOL stake`,
      max: `Max win reached on your ${L}: ${sgn(net)} SOL`,
      tp: `Take profit hit on your ${L}: ${sgn(net)} SOL`,
      sl: `Stop loss hit on your ${L}: ${sgn(net)} SOL`,
      guard: `Rug guard settled your ${L} at the price before the drop: ${sgn(net)} SOL`,
    };
    if (reason !== 'manual') {
      this.pushFeed({
        kind: reason === 'liq' ? 'liq' : 'close',
        sym: p.sym,
        side: p.side,
        lev: p.lev,
        size: p.stake,
        pnl: net,
        mine: true,
      });
    }
    this.toast(m[reason], net >= 0n ? 'good' : 'bad');
  }

  closeById(id: number) {
    const p = this.positions.find((x) => x.id === id);
    if (!p) return;
    const c = this.bySym[p.sym]!;
    if (c.status !== 'open' || Date.now() - p.at < R.minHoldSeconds * 1000) return;
    this.closePos(p, 'manual');
  }

  /** Liquidation, max win, TP and SL, per the brief's exact thresholds. */
  private checkPositions() {
    for (const p of [...this.positions]) {
      if (this.bySym[p.sym]!.status !== 'open') continue;
      const { pnl, liquidated, maxWin } = this.posValue(p);
      if (liquidated) this.closePos(p, 'liq');
      else if (maxWin) this.closePos(p, 'max');
      else if (p.tpBps && pnl * 10_000n >= p.margin * BigInt(p.tpBps)) this.closePos(p, 'tp');
      else if (p.slBps && pnl * 10_000n <= -p.margin * BigInt(p.slBps)) this.closePos(p, 'sl');
    }
  }

  /* ----- other traders ----- */
  private simTrade() {
    const open = this.coins.filter((c) => c.status === 'open');
    const c = this.pick(open);
    const side: Side = this.rnd() < 0.52 ? 'short' : 'long';
    const levs = [2, 5, 10].filter((l) => l <= maxLev(c));
    const lev = this.pick(levs);
    const size = maxB(R.minTrade, minB(floorCent(lam(this.rng(0.01, 0.9))), sideCap(c.liq)));
    const w = this.pick(TRADERS);
    const fee = (size * 8n) / 1000n;
    const protocolFee = (size * 2n) / 1000n;
    this.vol24 += size;
    this.trades24++;
    c.v24 += size;
    if (this.rnd() < 0.5 && room(c, side) >= size + solStr('0.3')) {
      if (side === 'long') c.oiL += size;
      else c.oiS += size;
      this.pool.value += fee;
      this.buffer += protocolFee;
      this.pushFeed({ kind: 'open', sym: c.sym, side, lev, size, w });
    } else {
      let pnl = lam(solF(size) * lev * this.gauss() * 0.07 - solF(size) * 0.012);
      let kind: 'close' | 'liq' = 'close';
      if (pnl < -((size * 98n) / 100n)) {
        pnl = -size;
        kind = 'liq';
      }
      pnl = minB(pnl, (size * BigInt(this.maxWinBps())) / 10_000n);
      if (side === 'long') c.oiL = maxB(0n, c.oiL - size);
      else c.oiS = maxB(0n, c.oiS - size);
      this.pool.value += -pnl + fee;
      this.buffer += protocolFee;
      if (pnl > 0n) this.paid24 += pnl;
      this.pushFeed({ kind, sym: c.sym, side, lev, size, pnl, w });
    }
    this.emit();
  }

  /* ----- rug guard demo ----- */
  rugGuard(sym: string) {
    const c = this.bySym[sym]!;
    if (c.status !== 'open') return;
    const pre = twap(c, R.twapSeconds);
    c.status = 'guard';
    c.price *= 0.035;
    c.liq = (c.liq * 8n) / 100n;
    for (let i = 0; i < 6; i++) {
      c.hist.push(c.price * (1 + (5 - i) * 0.02));
      c.hist.shift();
      c.vols.push(solF(c.liq) * 0.05);
      c.vols.shift();
    }
    const n = Math.round(solF(c.oiL) * 3 + solF(c.oiS) * 2) + 1;
    for (const p of this.positions.filter((x) => x.sym === sym)) this.closePos(p, 'guard', pre);
    c.oiL = 0n;
    c.oiS = 0n;
    this.pushFeed({ kind: 'guard', sym, drop: 92, n });
    if (this.tk.sym === sym) this.tk.sym = DEFAULT_SYM;
    this.rowsKey++;
    this.listsKey++;
  }

  /* ----- the 1-second tick ----- */
  tick() {
    this.t++;
    for (const c of this.coins) {
      c.prev = c.price;
      if (c.status !== 'open') {
        c.price *= 1 + this.gauss() * 0.002;
        c.hist.push(c.price);
        c.hist.shift();
        c.vols.push(solF(c.liq) * 0.0005);
        c.vols.shift();
        continue;
      }
      if (this.rnd() < 0.025) c.drift = this.gauss() * c.vol * 0.5;
      c.drift *= 0.96;
      c.price *= Math.exp(this.gauss() * c.vol + c.drift);
      c.hist.push(c.price);
      c.hist.shift();
      c.vols.push(this.rng(0.2, 1) * solF(c.liq) * 0.002 * (1 + Math.abs(c.drift) * 80));
      c.vols.shift();
    }
    if (this.t === 40) this.rugGuard(RUG_DEMO_SYM);
    if (this.t % 5 === 0) this.auditAt = Date.now();
    if (this.t % 6 === 0) {
      this.poolHist = [...this.poolHist, this.share()].slice(-240);
    }
    if (this.t % 4 === 0) this.listsKey++;
    this.checkPositions();
    this.emit();
  }

  /* ----- order forms ----- */
  /** Prototype percent chips: share of balance, Max is capped by the side's room. Floored to 0.01. */
  pctAmount(sym: string, side: Side, p: number): string {
    const c = this.bySym[sym]!;
    let v = (this.bal() * BigInt(p)) / 100n;
    if (p === 100) v = minB(this.bal(), room(c, side));
    return fixed(floorCent(v));
  }

  ctaState(c: Coin, side: Side, lev: number, amtStr: string): { label: string; cls: string; dis?: boolean } {
    if (c.status !== 'open') return { label: 'Trading paused on this coin', cls: 'w', dis: true };
    if (this.mode === 'real' && !this.wallet) return { label: 'Connect wallet to trade', cls: 'w' };
    if (this.mode === 'practice' && this.bal() <= 0n)
      return { label: 'Claim 10 paper SOL to start', cls: 'w' };
    const amt = parseSol(amtStr) ?? 0n;
    return {
      label: `${side === 'long' ? 'Long' : 'Short'} $${c.sym} with ${amt > 0n ? fixed(amt) : '0'} SOL at ${lev}x`,
      cls: side,
    };
  }

  /** Order summary rows (the ticket shows the first four). */
  summary(c: Coin, side: Side, lev: number, amtStr: string) {
    const amt = parseSol(amtStr) ?? 0n;
    const q = amt > 0n ? quoteOpen(amt, R.openFeeBps) : { margin: 0n, openFee: 0n };
    const entry = fillIn(c, side);
    return {
      entry,
      liq: liqPrice(entry, lev, side),
      size: q.margin * BigInt(lev),
      maxWin: (q.margin * BigInt(this.maxWinBps())) / 10_000n,
      openFee: q.openFee,
      room: room(c, side),
    };
  }

  ticketSubmit() {
    const t = this.tk;
    const err = this.openPosition(t.sym, t.side, t.lev, t.amt, null, null);
    this.tk.msg = err || '';
    this.emit();
  }

  orderSubmit(sym: string) {
    const o = this.order;
    const err = this.openPosition(sym, o.side, o.lev, o.amt, o.tpsl ? o.tp : null, o.tpsl ? o.sl : null);
    o.msg = err || '';
    if (err === null) o.pt = 'open';
    this.emit();
  }

  toggleOneClick() {
    if (this.mode === 'practice')
      return this.toast('Practice trades never need a signature. One-click trading is for Real mode.');
    if (!this.wallet) return this.requestConnect();
    this.order.oneClick = !this.order.oneClick;
    this.order.ocUntil = Date.now() + R.sessionKeyHours * 3600_000;
    this.toast(
      this.order.oneClick
        ? 'One-click trading is on for 24 hours.'
        : 'One-click trading is off. Each trade asks your wallet again.',
      'good',
    );
  }

  /* ----- pool ----- */
  lpSubmit() {
    this.lp.msg = '';
    if (this.mode !== 'real') return this.setMode('real');
    if (!this.wallet) return this.requestConnect();
    const v = parseSol(this.lp.amt);
    if (v === null || v <= 0n) {
      this.lp.msg = 'Enter an amount above 0.';
      return this.emit();
    }
    const sp = this.share();
    if (this.lp.action === 'add') {
      if (v > this.bal()) {
        this.lp.msg = `You have ${sol(this.bal())} SOL available. Deposit more from Portfolio or lower the amount.`;
        return this.emit();
      }
      // shares minted at NAV, rounded down (in the pool's favor)
      const sh = (v * this.pool.shares) / this.pool.value;
      this.balance.real -= v;
      this.pool.shares += sh;
      this.pool.mine += sh;
      this.pool.value += v;
      this.toast(`Added ${fixed(v)} SOL to the pool at a share price of ${sp.toFixed(4)}.`, 'good');
    } else {
      const have = this.myPoolValue();
      if (v > have) {
        this.lp.msg = `You have ${fixed(have)} SOL in the pool.`;
        return this.emit();
      }
      // shares burned rounded up (in the pool's favor)
      const sh = minB(this.pool.mine, (v * this.pool.shares + this.pool.value - 1n) / this.pool.value);
      this.pool.shares -= sh;
      this.pool.mine -= sh;
      this.pool.value -= v;
      this.balance.real += v;
      this.toast(`Removed ${fixed(v)} SOL from the pool.`, 'good');
    }
  }
  myPoolValue(): bigint {
    return this.pool.shares === 0n ? 0n : (this.pool.mine * this.pool.value) / this.pool.shares;
  }

  copyTrader(w: string) {
    this.toast(`Copying ${shortA(w)} with 0.10 SOL a trade. Change the amount in Portfolio.`, 'good');
  }

  /** UI setters: mutate and notify. */
  set(fn: (s: this) => void) {
    fn(this);
    this.emit();
  }
}
