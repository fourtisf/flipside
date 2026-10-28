/**
 * Zod schemas shared by the API and the web app. All amounts cross the wire as lamport strings.
 * P0 covers the endpoints that exist so far; each phase adds the schemas for its endpoints here.
 */
import { z } from 'zod';

export const Lamports = z.string().regex(/^-?\d+$/, 'lamports must be an integer string');
export const Pubkey = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'not a base58 address');

export const HealthResponse = z.object({
  ok: z.boolean(),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

const Tier = z.object({ leverage: z.number().int(), minLiquidity: Lamports });
const WinTier = z.object({ bps: z.number().int(), minPool: Lamports });

/** GET /api/rules: every rule from packages/core/rules.ts, bigints as lamport strings. */
export const RulesResponse = z
  .object({
    openFeeBps: z.number().int(),
    closeFeeBps: z.number().int(),
    minTrade: Lamports,
    minHoldSeconds: z.number().int(),
    twapSeconds: z.number().int(),
    levTiers: z.array(Tier),
    maxWinTiers: z.array(WinTier),
    hash: z.string(),
  })
  .passthrough();
export type RulesResponse = z.infer<typeof RulesResponse>;

/** WebSocket envelope: { ch, t, data }. */
export const WsMessage = z.object({ ch: z.string(), t: z.number(), data: z.unknown() });
export type WsMessage = z.infer<typeof WsMessage>;
