/**
 * Unit, the bridge that brings SOL from Solana into a Hyperliquid account (it arrives as USOL). For each
 * Hyperliquid address Unit gives a Solana deposit address; SOL sent there is credited to that account.
 *
 * Read on our server (GET /unit/deposit-address/<0x address>), so the browser never depends on Unit's CORS rules
 * and the answer is checked in one place: a well-formed Solana address, and the same address every time for the
 * same account (Unit's addresses are deterministic; a change is refused, not shown).
 *
 * Not yet: checking the guardian signatures Unit returns with each address. That needs Unit's published guardian
 * keys and message format, which weren't reachable from the build environment. ALFA chose to switch deposits on
 * without it, with a 1 SOL cap per deposit until it is in (DECISIONS.md, "Deposits from Solana").
 */
import { isSolAddress } from './solana-rpc';

export const UNIT_API = 'https://api.hyperunit.xyz';

const HL_ADDRESS = /^0x[0-9a-f]{40}$/;
const TTL_MS = 10 * 60_000;

export class UnitAddresses {
  private cache = new Map<string, { address: string; at: number }>();
  /** The first address seen for each account; a different one later is refused. */
  private pinned = new Map<string, string>();

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly api: string = UNIT_API,
  ) {}

  /** The Solana address that deposits SOL into the Hyperliquid account `hl` (lowercase 0x address). */
  async depositAddress(hl: string): Promise<string> {
    const account = hl.toLowerCase();
    if (!HL_ADDRESS.test(account)) throw new Error('not a Hyperliquid address');
    const hit = this.cache.get(account);
    if (hit && this.now() - hit.at < TTL_MS) return hit.address;
    const res = await this.fetcher(`${this.api}/gen/solana/hyperliquid/sol/${account}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Unit answered ${res.status}`);
    const body = (await res.json()) as { address?: unknown; status?: unknown };
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    if (!isSolAddress(address)) throw new Error('Unit gave no Solana address');
    const before = this.pinned.get(account);
    if (before && before !== address) throw new Error('Unit gave a different address than before');
    this.pinned.set(account, address);
    if (this.cache.size > 10_000) this.cache.clear();
    this.cache.set(account, { address, at: this.now() });
    return address;
  }
}

/** One Unit operation (a deposit or withdrawal), reduced to the fields the deposit tracker shows. */
export interface UnitOperation {
  state: string;
  sourceTxHash: string;
  destinationTxHash: string;
  sourceAmount: string;
  asset: string;
}

const text = (v: unknown, max = 120) => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * The account's Unit operations (GET <Unit>/operations/<0x address>), for the deposit tracker. Best effort: the
 * tracker also watches the account itself, so a shape it can't read just means no step-by-step status.
 */
export async function unitOperations(
  hl: string,
  fetcher: typeof fetch = fetch,
  api: string = UNIT_API,
): Promise<UnitOperation[]> {
  const account = hl.toLowerCase();
  if (!HL_ADDRESS.test(account)) throw new Error('not a Hyperliquid address');
  const res = await fetcher(`${api}/operations/${account}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Unit answered ${res.status}`);
  const body = (await res.json()) as { operations?: unknown };
  const ops = Array.isArray(body.operations) ? body.operations : [];
  return ops.slice(0, 50).map((o) => {
    const op = (o ?? {}) as Record<string, unknown>;
    return {
      state: text(op.state, 40),
      sourceTxHash: text(op.sourceTxHash),
      destinationTxHash: text(op.destinationTxHash),
      sourceAmount: text(op.sourceAmount, 40),
      asset: text(op.asset, 20),
    };
  });
}

let shared: UnitAddresses | null = null;
export const unitAddresses = () => (shared ??= new UnitAddresses());
