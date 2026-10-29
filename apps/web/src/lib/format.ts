/**
 * Display formatting, ported from the prototype's helpers. Floats here are prices, percentages and
 * market caps for display only. SOL amounts are lamport bigints and go through formatSol.
 */
import { formatSol } from '@coinside/core/money';

/** True minus sign, as in the prototype. */
export const M = '−';

export const usd = (x: number): string =>
  '$' +
  (x >= 1e9
    ? (x / 1e9).toFixed(2) + 'B'
    : x >= 1e6
      ? (x / 1e6).toFixed(2) + 'M'
      : x >= 1e3
        ? (x / 1e3).toFixed(1) + 'K'
        : x.toFixed(0));

export const pct = (x: number, d = 1): string => (x >= 0 ? '+' : M) + Math.abs(x * 100).toFixed(d) + '%';

/** Prototype sol(): grouped, fixed decimals. */
export const sol = (lamports: bigint, dp = 2): string => formatSol(lamports, { dp, group: true });
/** Prototype x.toFixed(dp) on a SOL amount. */
export const fixed = (lamports: bigint, dp = 2): string => formatSol(lamports, { dp });
/** Prototype sgn(): "+0.123" or "−0.123". */
export const sgn = (lamports: bigint, dp = 3): string => formatSol(lamports, { dp, signed: true });

export type PriceParts = { kind: 'plain'; text: string } | { kind: 'sub'; zeros: number; digits: string };

/** Prices under $0.001 use the subscript-zero format: $0.0₄5612 is 0.0 then 4 zeros then 5612. */
export function priceParts(p: number): PriceParts {
  if (p >= 1) return { kind: 'plain', text: '$' + p.toFixed(2) };
  if (p >= 0.01) return { kind: 'plain', text: '$' + p.toFixed(4) };
  const z = Math.floor(-Math.log10(p)) - 1;
  if (z < 3) return { kind: 'plain', text: '$' + p.toFixed(z + 4) };
  return { kind: 'sub', zeros: z, digits: String(Math.round(p * Math.pow(10, z + 4))).slice(0, 4) };
}

/** Plain-text price for toasts: "$0.0{4}5612". */
export function plain(p: number): string {
  const r = priceParts(p);
  return r.kind === 'plain' ? r.text : `$0.0{${r.zeros}}${r.digits}`;
}

/** Axis labels: no "$", enough digits for tiny prices. */
export function priceTxt(p: number): string {
  if (p >= 1) return p.toFixed(3);
  if (p >= 0.01) return p.toFixed(5);
  const z = Math.floor(-Math.log10(p)) - 1;
  return p.toFixed(Math.min(z + 4, 12));
}

export const ago = (ms: number): string => {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'h';
};

export const shortA = (a: string): string => a.slice(0, 4) + '…' + a.slice(-4);

export const hueOf = (s: string): number => {
  let h = 11;
  for (const ch of s) h = (h * 37 + ch.charCodeAt(0)) % 360;
  return h;
};

export const hexA = (h: string, a: number): string => {
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Ratio of two lamport amounts as a float, for display only (percent bars, share price). */
export const ratio = (a: bigint, b: bigint): number =>
  b === 0n ? 0 : Number((a * 1_000_000n) / b) / 1_000_000;

export const C = { long: '#3DD68C', short: '#FF5F5F', t1: '#EDEDED', t2: '#A1A1A1', t3: '#6E6E6E' } as const;
