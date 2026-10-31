/**
 * Reading a Solana wallet's SOL balance, on the server. The browser asks GET /solana/balance/<address> and
 * this answers from a Solana mainnet RPC node: the Helius key already in the server's environment file
 * (HELIUS_RPC_URL, or HELIUS_API_KEY), or SOLANA_RPC_URL to override it, else Solana's public node. The key
 * stays on the server: it is never sent to the browser, logged, or put in an error message.
 *
 * It only ever makes one call, getBalance, for one valid address, and keeps each answer for a few seconds, so
 * the route can't be used as an open RPC proxy.
 */

export const PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';

/** A Solana address: base58, 32 to 44 characters. */
export const isSolAddress = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

/** The mainnet RPC URL to use, from the server's environment. A devnet Helius URL is never used for balances. */
export function rpcUrlFromEnv(env: Record<string, string | undefined> = process.env): string {
  const own = env.SOLANA_RPC_URL?.trim();
  if (own) return own;
  const helius = env.HELIUS_RPC_URL?.trim();
  if (helius && helius.includes('mainnet') && !helius.endsWith('api-key=')) return helius;
  const key = env.HELIUS_API_KEY?.trim();
  if (key) return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`;
  return PUBLIC_RPC;
}

const TTL_MS = 5_000;

export class SolBalances {
  private cache = new Map<string, { lamports: string; at: number }>();
  private inflight = new Map<string, Promise<string>>();

  constructor(
    private readonly rpcUrl: string = rpcUrlFromEnv(),
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** Lamports as a decimal string. Throws when the node can't be reached or answers with an error. */
  async get(address: string): Promise<string> {
    if (!isSolAddress(address)) throw new Error('not a Solana address');
    const hit = this.cache.get(address);
    if (hit && this.now() - hit.at < TTL_MS) return hit.lamports;
    let p = this.inflight.get(address);
    if (!p) {
      p = this.read(address).finally(() => this.inflight.delete(address));
      this.inflight.set(address, p);
    }
    return p;
  }

  private async read(address: string): Promise<string> {
    const res = await this.fetcher(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address, { commitment: 'confirmed' }],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Solana RPC answered ${res.status}`);
    const body = (await res.json()) as { result?: { value?: unknown }; error?: { message?: string } };
    const v = body.result?.value;
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)
      throw new Error(body.error?.message ?? 'Solana RPC gave no balance');
    const lamports = String(v);
    if (this.cache.size > 5_000) this.cache.clear();
    this.cache.set(address, { lamports, at: this.now() });
    return lamports;
  }
}
