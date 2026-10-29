/**
 * Every numeric trading and risk rule, in one place (CLAUDE.md sections 4, 7, 8 and 14). Defaults are
 * the brief's; each has an env override with the same name as in .env.example. The engine logs a
 * hash of the resolved rules at boot, and the API serves them read-only at GET /api/rules.
 */
import { parseSol, sol } from './money';

export interface LevTier {
  leverage: number;
  /** Minimum SOL-side liquidity of the coin's pools, in lamports. */
  minLiquidity: bigint;
}

export interface MaxWinTier {
  /** Max win as bps of margin (20000 = +200%). */
  bps: number;
  /** Minimum pool size, in lamports. */
  minPool: bigint;
}

export interface Rules {
  // fees (section 4)
  openFeeBps: number;
  closeFeeBps: number;
  poolFeeShareBps: number;
  referralShareOfProtocolBps: number;
  competitionShareOfProtocolBps: number;
  // trading (section 4)
  minTrade: bigint;
  minHoldSeconds: number;
  twapSeconds: number;
  levTiers: LevTier[];
  maxWinTiers: MaxWinTier[];
  // caps (section 8.6)
  sideCapLiqBps: number;
  sideCapMax: bigint;
  poolCoinExposureBps: number;
  positionMaxPoolBps: number;
  // eligibility (section 8.1, 8.2)
  minMcapUsd: number;
  minHolders: number;
  minFeesPaid: bigint;
  minTradingHours: number;
  minWalletAgeHours: number;
  // guards (section 8.3 to 8.9)
  rugGuardLiqDropBps: number;
  rugGuardWindowSeconds: number;
  insiderTopHolders: number;
  insiderFundingHops: number;
  insiderFundingWindowDays: number;
  skewRatio: number;
  skewFeeBpsPerHour: number;
  hourlyLossBreakerBps: number;
  hourlyLossPauseMinutes: number;
  coinLossBreakerBps: number;
  coinLossPauseMinutes: number;
  deviationGuardBps: number;
  deviationGuardSeconds: number;
  // prices (section 7)
  priceMinPoolLiquidity: bigint;
  // proofs, practice, sessions
  balanceRootIntervalSeconds: number;
  emergencyStaleHours: number;
  practiceGrant: bigint;
  sessionKeyHours: number;
  // launch caps (P6)
  launchPoolMax: bigint;
  launchPositionMax: bigint;
}

export const DEFAULT_RULES: Readonly<Rules> = Object.freeze({
  openFeeBps: 100,
  closeFeeBps: 100,
  poolFeeShareBps: 8000,
  referralShareOfProtocolBps: 5000,
  competitionShareOfProtocolBps: 5000,
  minTrade: 10_000_000n,
  minHoldSeconds: 10,
  twapSeconds: 60,
  levTiers: [
    { leverage: 2, minLiquidity: 0n },
    { leverage: 5, minLiquidity: sol('150') },
    { leverage: 10, minLiquidity: sol('500') },
  ],
  maxWinTiers: [
    { bps: 20000, minPool: 0n },
    { bps: 40000, minPool: sol('100') },
    { bps: 60000, minPool: sol('250') },
    { bps: 100000, minPool: sol('500') },
  ],
  sideCapLiqBps: 100,
  sideCapMax: sol('30'),
  poolCoinExposureBps: 200,
  positionMaxPoolBps: 500,
  minMcapUsd: 30000,
  minHolders: 100,
  minFeesPaid: sol('7'),
  minTradingHours: 24,
  minWalletAgeHours: 24,
  rugGuardLiqDropBps: 3000,
  rugGuardWindowSeconds: 300,
  insiderTopHolders: 20,
  insiderFundingHops: 2,
  insiderFundingWindowDays: 7,
  skewRatio: 2,
  skewFeeBpsPerHour: 10,
  hourlyLossBreakerBps: 300,
  hourlyLossPauseMinutes: 15,
  coinLossBreakerBps: 100,
  coinLossPauseMinutes: 60,
  deviationGuardBps: 500,
  deviationGuardSeconds: 30,
  priceMinPoolLiquidity: sol('25'),
  balanceRootIntervalSeconds: 300,
  emergencyStaleHours: 72,
  practiceGrant: sol('10'),
  sessionKeyHours: 24,
  launchPoolMax: sol('250'),
  launchPositionMax: sol('1'),
});

type Env = Record<string, string | undefined>;

class RulesError extends Error {
  override name = 'RulesError';
}

function int(env: Env, key: string, def: number, lo = 0, hi = Number.MAX_SAFE_INTEGER): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return def;
  // Plain decimal digits only: Number() would also take "0x64", "1e2" or "0b11".
  const v = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  if (!Number.isSafeInteger(v) || v < lo || v > hi)
    throw new RulesError(`${key} must be an integer in [${lo}, ${hi}], got "${raw}"`);
  return v;
}

function lamportsFromSol(env: Env, key: string, def: bigint): bigint {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return def;
  const v = parseSol(raw);
  if (v === null) throw new RulesError(`${key} must be a SOL amount, got "${raw}"`);
  return v;
}

function lamportsRaw(env: Env, key: string, def: bigint): bigint {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return def;
  if (!/^\d+$/.test(raw.trim()))
    throw new RulesError(`${key} must be a whole number of lamports, got "${raw}"`);
  return BigInt(raw.trim());
}

/**
 * "2:0,5:150,10:500" (value:min SOL) into sorted tiers. The first tier starts at 0, minimums are unique,
 * and the value (leverage, max win) rises with the minimum: a deeper market or a bigger pool never gets a
 * smaller tier, so a swapped pair like "10:0,2:500" is rejected instead of giving thin coins 10x.
 */
function tiers(env: Env, key: string): Array<{ value: number; min: bigint }> | null {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return null;
  const out = raw.split(',').map((part) => {
    const [v, m] = part.split(':').map((s) => s.trim());
    const value = v !== undefined && /^\d+$/.test(v) ? Number(v) : NaN;
    const minSol = m === undefined ? null : parseSol(m);
    if (!Number.isSafeInteger(value) || value <= 0 || minSol === null) {
      throw new RulesError(`${key} must look like "2:0,5:150", got "${raw}"`);
    }
    return { value, min: minSol };
  });
  out.sort((a, b) => (a.min < b.min ? -1 : a.min > b.min ? 1 : 0));
  if (out[0]?.min !== 0n) throw new RulesError(`${key} needs a tier starting at 0`);
  for (let i = 1; i < out.length; i++) {
    const [prev, cur] = [out[i - 1]!, out[i]!];
    if (cur.min === prev.min)
      throw new RulesError(`${key} has two tiers starting at the same amount: "${raw}"`);
    if (cur.value <= prev.value)
      throw new RulesError(`${key} must rise with the minimum (a bigger minimum, a bigger value): "${raw}"`);
  }
  return out;
}

/** Resolve rules from env (process.env in Node). Throws RulesError on any invalid override. */
export function loadRules(env: Env = {}): Rules {
  const d = DEFAULT_RULES;
  const lev = tiers(env, 'LEV_TIERS');
  const win = tiers(env, 'MAX_WIN_TIERS');
  const rules: Rules = {
    openFeeBps: int(env, 'OPEN_FEE_BPS', d.openFeeBps, 0, 1000),
    closeFeeBps: int(env, 'CLOSE_FEE_BPS', d.closeFeeBps, 0, 1000),
    poolFeeShareBps: int(env, 'POOL_FEE_SHARE_BPS', d.poolFeeShareBps, 0, 10000),
    referralShareOfProtocolBps: int(
      env,
      'REFERRAL_SHARE_OF_PROTOCOL_BPS',
      d.referralShareOfProtocolBps,
      0,
      10000,
    ),
    competitionShareOfProtocolBps: int(
      env,
      'COMPETITION_SHARE_OF_PROTOCOL_BPS',
      d.competitionShareOfProtocolBps,
      0,
      10000,
    ),
    minTrade: lamportsRaw(env, 'MIN_TRADE_LAMPORTS', d.minTrade),
    minHoldSeconds: int(env, 'MIN_HOLD_SECONDS', d.minHoldSeconds),
    twapSeconds: int(env, 'TWAP_SECONDS', d.twapSeconds, 1),
    levTiers: lev
      ? lev.map((t) => ({ leverage: t.value, minLiquidity: t.min }))
      : d.levTiers.map((t) => ({ ...t })),
    maxWinTiers: win
      ? win.map((t) => ({ bps: t.value, minPool: t.min }))
      : d.maxWinTiers.map((t) => ({ ...t })),
    sideCapLiqBps: int(env, 'SIDE_CAP_LIQ_BPS', d.sideCapLiqBps, 0, 10000),
    sideCapMax: lamportsFromSol(env, 'SIDE_CAP_MAX_SOL', d.sideCapMax),
    poolCoinExposureBps: int(env, 'POOL_COIN_EXPOSURE_BPS', d.poolCoinExposureBps, 0, 10000),
    positionMaxPoolBps: int(env, 'POSITION_MAX_POOL_BPS', d.positionMaxPoolBps, 0, 10000),
    minMcapUsd: int(env, 'MIN_MCAP_USD', d.minMcapUsd),
    minHolders: int(env, 'MIN_HOLDERS', d.minHolders),
    minFeesPaid: lamportsFromSol(env, 'MIN_FEES_PAID_SOL', d.minFeesPaid),
    minTradingHours: int(env, 'MIN_TRADING_HOURS', d.minTradingHours),
    minWalletAgeHours: int(env, 'MIN_WALLET_AGE_HOURS', d.minWalletAgeHours),
    rugGuardLiqDropBps: int(env, 'RUG_GUARD_LIQ_DROP_BPS', d.rugGuardLiqDropBps, 1, 10000),
    rugGuardWindowSeconds: int(env, 'RUG_GUARD_WINDOW_SECONDS', d.rugGuardWindowSeconds, 1),
    insiderTopHolders: int(env, 'INSIDER_TOP_HOLDERS', d.insiderTopHolders),
    insiderFundingHops: int(env, 'INSIDER_FUNDING_HOPS', d.insiderFundingHops),
    insiderFundingWindowDays: int(env, 'INSIDER_FUNDING_WINDOW_DAYS', d.insiderFundingWindowDays),
    skewRatio: int(env, 'SKEW_RATIO', d.skewRatio, 1),
    skewFeeBpsPerHour: int(env, 'SKEW_FEE_BPS_PER_HOUR', d.skewFeeBpsPerHour, 0, 10000),
    hourlyLossBreakerBps: int(env, 'HOURLY_LOSS_BREAKER_BPS', d.hourlyLossBreakerBps, 1, 10000),
    hourlyLossPauseMinutes: int(env, 'HOURLY_LOSS_PAUSE_MINUTES', d.hourlyLossPauseMinutes),
    coinLossBreakerBps: int(env, 'COIN_LOSS_BREAKER_BPS', d.coinLossBreakerBps, 1, 10000),
    coinLossPauseMinutes: int(env, 'COIN_LOSS_PAUSE_MINUTES', d.coinLossPauseMinutes),
    deviationGuardBps: int(env, 'DEVIATION_GUARD_BPS', d.deviationGuardBps, 1, 10000),
    deviationGuardSeconds: int(env, 'DEVIATION_GUARD_SECONDS', d.deviationGuardSeconds, 1),
    priceMinPoolLiquidity: lamportsFromSol(env, 'PRICE_MIN_POOL_LIQ_SOL', d.priceMinPoolLiquidity),
    balanceRootIntervalSeconds: int(env, 'BALANCE_ROOT_INTERVAL_SECONDS', d.balanceRootIntervalSeconds, 1),
    emergencyStaleHours: int(env, 'EMERGENCY_STALE_HOURS', d.emergencyStaleHours, 1),
    practiceGrant: lamportsFromSol(env, 'PRACTICE_GRANT_SOL', d.practiceGrant),
    sessionKeyHours: int(env, 'SESSION_KEY_HOURS', d.sessionKeyHours, 1),
    launchPoolMax: lamportsFromSol(env, 'LAUNCH_POOL_MAX_SOL', d.launchPoolMax),
    launchPositionMax: lamportsFromSol(env, 'LAUNCH_POSITION_MAX_SOL', d.launchPositionMax),
  };
  if (rules.openFeeBps >= 10000 || rules.minTrade <= 0n)
    throw new RulesError('Fees and minimum trade are out of range');
  return rules;
}

/** Highest leverage the coin's liquidity allows. */
export function maxLeverage(liquidity: bigint, rules: Rules = DEFAULT_RULES): number {
  let lev = rules.levTiers[0]?.leverage ?? 1;
  for (const t of rules.levTiers) if (liquidity >= t.minLiquidity) lev = t.leverage;
  return lev;
}

/** Max win in bps of margin for a position opened while the pool is this size. */
export function maxWinBps(pool: bigint, rules: Rules = DEFAULT_RULES): number {
  let bps = rules.maxWinTiers[0]?.bps ?? 0;
  for (const t of rules.maxWinTiers) if (pool >= t.minPool) bps = t.bps;
  return bps;
}

/** Open stake allowed per side per coin: min(sideCapLiqBps of liquidity, sideCapMax). */
export function sideCap(liquidity: bigint, rules: Rules = DEFAULT_RULES): bigint {
  const byLiq = (liquidity * BigInt(rules.sideCapLiqBps)) / 10_000n;
  return byLiq < rules.sideCapMax ? byLiq : rules.sideCapMax;
}

/** JSON-safe rules (bigints as lamport strings), keys sorted so the output is stable for hashing. */
export function rulesToJSON(rules: Rules): Record<string, unknown> {
  const conv = (v: unknown): unknown => {
    if (typeof v === 'bigint') return v.toString();
    if (Array.isArray(v)) return v.map(conv);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, conv((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return conv(rules) as Record<string, unknown>;
}

/** Canonical string the engine hashes at boot. */
export const canonicalRules = (rules: Rules): string => JSON.stringify(rulesToJSON(rules));
