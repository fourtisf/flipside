/**
 * All money math for Flipside. Every SOL amount is a bigint in lamports; no floats touch a balance,
 * fee or P&L. Rounding always favors the pool: user credits round down, user debits round up.
 *
 * Prices are fixed-point bigints scaled by PRICE_SCALE. Only the ratio exit/entry enters P&L, so the
 * price unit (lamports per 10^decimals base units in production) cancels out.
 */

export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const SOL_DECIMALS = 9;
export const BPS = 10_000n;
export const PRICE_SCALE = 10n ** 18n;

export type Side = 'long' | 'short';

/** Floor division (toward negative infinity). `b` must be positive. */
export function floorDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new RangeError('floorDiv: divisor must be positive');
  const q = a / b;
  return a % b !== 0n && a < 0n ? q - 1n : q;
}

/** Ceiling division (toward positive infinity). `b` must be positive. */
export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new RangeError('ceilDiv: divisor must be positive');
  const q = a / b;
  return a % b !== 0n && a > 0n ? q + 1n : q;
}

/** amount * bps / 10000, rounded up. Use for anything the user pays. */
export const bpsUp = (amount: bigint, bps: bigint | number): bigint => ceilDiv(amount * BigInt(bps), BPS);
/** amount * bps / 10000, rounded down. Use for anything the user receives. */
export const bpsDown = (amount: bigint, bps: bigint | number): bigint => floorDiv(amount * BigInt(bps), BPS);

export const min = (a: bigint, b: bigint): bigint => (a < b ? a : b);
export const max = (a: bigint, b: bigint): bigint => (a > b ? a : b);
export const abs = (a: bigint): bigint => (a < 0n ? -a : a);
export const clamp = (v: bigint, lo: bigint, hi: bigint): bigint => min(max(v, lo), hi);

const SOL_RE = /^\s*(\d*)(?:\.(\d*))?\s*$/;

/**
 * Parse a user-typed SOL amount ("0.25", "1", ".5") into lamports. Digits past 9 decimals are
 * dropped (rounded down). Returns null for anything that is not a plain non-negative decimal.
 */
export function parseSol(input: string): bigint | null {
  const m = SOL_RE.exec(input);
  if (!m) return null;
  const whole = m[1] ?? '';
  const frac = m[2] ?? '';
  if (!whole && !frac) return null;
  const fracPadded = (frac + '000000000').slice(0, SOL_DECIMALS);
  return BigInt(whole || '0') * LAMPORTS_PER_SOL + BigInt(fracPadded);
}

/** Whole SOL to lamports, for config values like "30" or "0.01". Throws on invalid input. */
export function sol(input: string | number): bigint {
  const v = parseSol(String(input));
  if (v === null) throw new RangeError(`Not a SOL amount: ${String(input)}`);
  return v;
}

export interface FormatOptions {
  /** Fraction digits to show. Default 2. */
  dp?: number;
  /** Thousands separators. Default false. */
  group?: boolean;
  /** Prefix positive values with "+" and negatives with a true minus sign (U+2212). Default false. */
  signed?: boolean;
}

/**
 * Lamports to a display string, rounded half away from zero to `dp` places. Display only: never
 * parse the result back into a balance.
 */
export function formatSol(lamports: bigint, opts: FormatOptions = {}): string {
  const dp = opts.dp ?? 2;
  if (dp < 0 || dp > SOL_DECIMALS) throw new RangeError('formatSol: dp must be 0..9');
  const neg = lamports < 0n;
  const unit = 10n ** BigInt(SOL_DECIMALS - dp);
  const rounded = (abs(lamports) + unit / 2n) / unit;
  const scale = 10n ** BigInt(dp);
  let whole = (rounded / scale).toString();
  if (opts.group) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = dp ? '.' + (rounded % scale).toString().padStart(dp, '0') : '';
  const sign = opts.signed ? (neg && rounded !== 0n ? '−' : '+') : neg && rounded !== 0n ? '-' : '';
  return sign + whole + frac;
}

/** A float price to fixed point. Only for adapters and mocks that receive float prices. */
export function toPriceScaled(price: number): bigint {
  if (!Number.isFinite(price) || price <= 0) throw new RangeError('toPriceScaled: price must be positive');
  // shortest round-trip decimal ("4.8e-3"), so 0.0048 is exactly 48 * 10^-4, not 0.00479999…
  const [mant, exp] = price.toExponential().split('e') as [string, string];
  const [whole, frac = ''] = mant.split('.') as [string, string?];
  const digits = BigInt(whole + frac);
  const e = Number(exp) - frac.length + 18;
  return e >= 0 ? digits * 10n ** BigInt(e) : digits / 10n ** BigInt(-e);
}

/** Fixed point back to a float, for display only. */
export const fromPriceScaled = (p: bigint): number => Number(p) / Number(PRICE_SCALE);

/* ---------- position math (CLAUDE.md section 4) ---------- */

export interface OpenQuote {
  stake: bigint;
  openFee: bigint;
  margin: bigint;
}

/** openFee = ceil(stake * openFeeBps), margin = stake - openFee. */
export function quoteOpen(stake: bigint, openFeeBps: number): OpenQuote {
  if (stake <= 0n) throw new RangeError('quoteOpen: stake must be positive');
  const openFee = bpsUp(stake, openFeeBps);
  return { stake, openFee, margin: stake - openFee };
}

export interface PnlInput {
  margin: bigint;
  leverage: number;
  side: Side;
  entry: bigint;
  exit: bigint;
  /** Max win as bps of margin, fixed at open (e.g. 20000 = +200%). */
  maxWinBps: number;
}

/**
 * pnl = margin * lev * dir * (exit / entry - 1), floored (toward the pool), then clamped to
 * [-margin, margin * maxWin].
 */
export function positionPnl({ margin, leverage, side, entry, exit, maxWinBps }: PnlInput): bigint {
  if (entry <= 0n || exit <= 0n) throw new RangeError('positionPnl: prices must be positive');
  const dir = side === 'long' ? 1n : -1n;
  const raw = floorDiv(margin * BigInt(leverage) * dir * (exit - entry), entry);
  return clamp(raw, -margin, bpsDown(margin, maxWinBps));
}

export interface CloseQuote {
  pnl: bigint;
  value: bigint;
  closeFee: bigint;
  returned: bigint;
  liquidated: boolean;
  maxWin: boolean;
}

/** value = margin + pnl, closeFee = ceil(value * closeFeeBps), returned = value - closeFee. */
export function quoteClose(input: PnlInput, closeFeeBps: number): CloseQuote {
  const pnl = positionPnl(input);
  const value = input.margin + pnl;
  const closeFee = bpsUp(value, closeFeeBps);
  return {
    pnl,
    value,
    closeFee,
    returned: value - closeFee,
    liquidated: pnl <= -input.margin,
    maxWin: pnl >= bpsDown(input.margin, input.maxWinBps),
  };
}

/** Displayed liquidation price: entry * (1 - 1/lev) for longs, entry * (1 + 1/lev) for shorts. */
export function liquidationPrice(entry: bigint, leverage: number, side: Side): bigint {
  const step = entry / BigInt(leverage);
  return side === 'long' ? entry - step : entry + step;
}

/**
 * Fair fill: the worse of live and the 60-second average for the user. Long entry max, long exit
 * min; short entry min, short exit max.
 */
export function fairFill(live: bigint, twap: bigint, side: Side, leg: 'entry' | 'exit'): bigint {
  const userPaysMore = (side === 'long') === (leg === 'entry');
  return userPaysMore ? max(live, twap) : min(live, twap);
}
