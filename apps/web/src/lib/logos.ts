/**
 * Coin icons for Hyperliquid's markets, served from coinside.fun (GET /logos/<coin>.svg).
 *
 * The icons are Hyperliquid's own (its app has one for every market it lists). The web server fetches each
 * once and keeps it in memory, so visitors' browsers never fetch from Hyperliquid's app, every icon is cached
 * like the rest of the site, and the source can change without touching the pages. Only names Hyperliquid
 * lists are fetched, so the route can't be used to make the server request arbitrary paths. A missing icon
 * is a 404, and the page shows the letter avatar instead.
 */
export const ICON_SOURCE = 'https://app.hyperliquid.xyz/coins/';
const INFO_URL = 'https://api.hyperliquid.xyz/info';
const MAX_BYTES = 100_000;
const NAMES_TTL = 15 * 60_000;
const HIT_TTL = 24 * 3_600_000;
const MISS_TTL = 3_600_000;
/** After a network error, try again this soon rather than an hour later. */
const ERROR_TTL = 60_000;

/** True if the bytes are an SVG document (possibly after an XML declaration or a comment). */
export function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).trimStart().toLowerCase();
  return (
    head.startsWith('<svg') ||
    ((head.startsWith('<?xml') || head.startsWith('<!--')) && head.includes('<svg'))
  );
}

/** Where to look for a market's icon: kPEPE's may be filed as kPEPE or as PEPE. */
export const iconCandidates = (name: string): string[] => {
  const base = name.replace(/^k(?=[A-Z])/, '');
  return base === name ? [name] : [name, base];
};

interface Entry {
  body: Uint8Array | null;
  until: number;
}

export class LogoStore {
  private entries = new Map<string, Entry>();
  private inflight = new Map<string, Promise<Uint8Array | null>>();
  private names: { set: Set<string>; until: number } | null = null;
  private namesInflight: Promise<Set<string> | null> | null = null;

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** Every perp name Hyperliquid lists, refreshed every 15 minutes. Null if it can't be read. */
  private async listed(): Promise<Set<string> | null> {
    if (this.names && this.now() < this.names.until) return this.names.set;
    this.namesInflight ??= (async () => {
      try {
        const r = await this.fetcher(INFO_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'meta' }),
          cache: 'no-store',
          signal: AbortSignal.timeout(8_000),
        });
        if (!r.ok) return this.names?.set ?? null;
        const meta = (await r.json()) as { universe?: Array<{ name?: unknown }> };
        const set = new Set(
          (meta.universe ?? []).map((u) => u.name).filter((n): n is string => typeof n === 'string'),
        );
        if (!set.size) return this.names?.set ?? null;
        this.names = { set, until: this.now() + NAMES_TTL };
        return set;
      } catch {
        return this.names?.set ?? null;
      } finally {
        this.namesInflight = null;
      }
    })();
    return this.namesInflight;
  }

  private async fetchIcon(name: string): Promise<Entry> {
    let failed = false;
    for (const file of iconCandidates(name)) {
      try {
        const r = await this.fetcher(`${ICON_SOURCE}${encodeURIComponent(file)}.svg`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(8_000),
        });
        if (r.status === 404) continue;
        if (!r.ok) {
          failed = true;
          continue;
        }
        const body = new Uint8Array(await r.arrayBuffer());
        if (body.byteLength > 0 && body.byteLength <= MAX_BYTES && looksLikeSvg(body))
          return { body, until: this.now() + HIT_TTL };
      } catch {
        failed = true;
      }
    }
    return { body: null, until: this.now() + (failed ? ERROR_TTL : MISS_TTL) };
  }

  /** The icon for a listed market, or null if Hyperliquid has none (or doesn't list the name). */
  async get(name: string): Promise<Uint8Array | null> {
    const hit = this.entries.get(name);
    if (hit && this.now() < hit.until) return hit.body;
    const listed = await this.listed();
    if (!listed?.has(name)) return null;
    let p = this.inflight.get(name);
    if (!p) {
      p = this.fetchIcon(name)
        .then((e) => {
          this.entries.set(name, e);
          return e.body;
        })
        .finally(() => this.inflight.delete(name));
      this.inflight.set(name, p);
    }
    return p;
  }
}
