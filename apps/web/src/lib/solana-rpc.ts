/**
 * Reading a Solana wallet's SOL balance, on the server. The browser asks GET /solana/balance/<address> and
 * this answers from a Solana mainnet RPC node: the Helius key already in the server's environment file
 * (HELIUS_RPC_URL, or HELIUS_API_KEY), or SOLANA_RPC_URL to override it, else Solana's public node. The key
 * stays on the server: it is never sent to the browser, logged, or put in an error message.
 *
 * It only ever makes two calls, getBalance for one valid address and getLatestBlockhash (for a deposit
 * transaction the wallet signs), and keeps each answer for a few seconds, so the routes can't be used as an
 * open RPC proxy.
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

  private recent: { hash: string; at: number } | null = null;

  /** A recent blockhash for a transaction the person's wallet signs, kept 10 seconds (it stays valid ~60). */
  async blockhash(): Promise<string> {
    if (this.recent && this.now() - this.recent.at < 10_000) return this.recent.hash;
    const v = (await this.call('getLatestBlockhash', [{ commitment: 'confirmed' }])) as {
      blockhash?: unknown;
    };
    if (typeof v?.blockhash !== 'string' || !isSolAddress(v.blockhash))
      throw new Error('Solana RPC gave no blockhash');
    this.recent = { hash: v.blockhash, at: this.now() };
    return v.blockhash;
  }

  private async call(method: 'getBalance' | 'getLatestBlockhash', params: unknown[]): Promise<unknown> {
    const res = await this.fetcher(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Solana RPC answered ${res.status}`);
    const body = (await res.json()) as { result?: { value?: unknown }; error?: { message?: string } };
    if (body.error) throw new Error(body.error.message ?? 'Solana RPC error');
    return body.result?.value;
  }

  private async read(address: string): Promise<string> {
    const v = await this.call('getBalance', [address, { commitment: 'confirmed' }]);
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)
      throw new Error('Solana RPC gave no balance');
    const lamports = String(v);
    if (this.cache.size > 5_000) this.cache.clear();
    this.cache.set(address, { lamports, at: this.now() });
    return lamports;
  }
}

let shared: SolBalances | null = null;
/** One reader per server process, shared by the balance and blockhash routes. */
export const solanaRpc = () => (shared ??= new SolBalances());
