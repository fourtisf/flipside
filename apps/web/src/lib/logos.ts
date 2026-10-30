/**
 * Coin icons for Hyperliquid's markets, served from coinside.fun (GET /logos/<coin>).
 *
 * The icons are Hyperliquid's own (its app has one for every market it lists). The web server fetches each
 * once, turns it into a 64 px WebP with sharp (Next's own image library) and keeps it in memory. So visitors'
 * browsers never fetch from Hyperliquid's app, every icon is a few kilobytes however big its source (some
 * memecoin icons are large pictures wrapped in SVG), no SVG from elsewhere is ever served from our domain,
 * and the source can change without touching the pages. Only names Hyperliquid lists are fetched, so the route
 * can't be used to make the server request arbitrary paths. A missing icon is a 404, and the page shows the
 * letter avatar instead.
 */
export const ICON_SOURCE = 'https://app.hyperliquid.xyz/coins/';
const INFO_URL = 'https://api.hyperliquid.xyz/info';
/** The largest source icon we accept. */
const MAX_SOURCE_BYTES = 3_000_000;
/** Without sharp, an SVG up to this size is served as it is. */
const MAX_SVG_BYTES = 300_000;
/** Icon size in pixels: twice the largest avatar on the page, for sharp screens. */
export const ICON_PX = 64;
const NAMES_TTL = 15 * 60_000;
const HIT_TTL = 24 * 3_600_000;
const MISS_TTL = 3_600_000;
/** After a network error, try again this soon rather than an hour later. */
const ERROR_TTL = 60_000;

export interface Icon {
  body: Uint8Array;
  type: 'image/webp' | 'image/svg+xml';
}

/** Turns an SVG into a small raster, or null if it can't. */
export type Render = (svg: Uint8Array) => Promise<Uint8Array | null>;

/** True if the bytes are an SVG document (after any XML declaration, doctype or comment), not an HTML page. */
export function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 4096)).toLowerCase();
  return head.includes('<svg') && !head.includes('<html');
}

/** Where to look for a market's icon: kPEPE's may be filed as kPEPE or as PEPE. */
export const iconCandidates = (name: string): string[] => {
  const base = name.replace(/^k(?=[A-Z])/, '');
  return base === name ? [name] : [name, base];
};

/**
 * sharp renders the SVG (pictures embedded in it included) into a 64 px WebP, on a transparent background. The
 * render density follows the SVG's own size: a fixed density blows a 5000-unit canvas up past sharp's pixel
 * limit, which is how Hyperliquid's own BTC icon first failed.
 */
export const renderWebp: Render = async (svg) => {
  try {
    const { default: sharp } = await import('sharp');
    // reading the size doesn't rasterize, so a huge canvas needn't count against the pixel limit
    const { width = 0, height = 0 } = await sharp(svg, { limitInputPixels: false }).metadata();
    const size = Math.max(width, height) || ICON_PX;
    // rasterize at about twice the icon size, then scale down
    const density = Math.min(2400, Math.max(1, (72 * ICON_PX * 2) / size));
    const out = await sharp(svg, { density })
      .resize(ICON_PX, ICON_PX, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90 })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
};

interface Entry {
  icon: Icon | null;
  until: number;
}

export class LogoStore {
  private entries = new Map<string, Entry>();
  private inflight = new Map<string, Promise<Icon | null>>();
  private names: { set: Set<string>; until: number } | null = null;
  private namesInflight: Promise<Set<string> | null> | null = null;

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly render: Render = renderWebp,
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
        const svg = new Uint8Array(await r.arrayBuffer());
        if (!svg.byteLength || svg.byteLength > MAX_SOURCE_BYTES || !looksLikeSvg(svg)) continue;
        const webp = await this.render(svg);
        if (webp?.byteLength)
          return { icon: { body: webp, type: 'image/webp' }, until: this.now() + HIT_TTL };
        if (svg.byteLength <= MAX_SVG_BYTES)
          return { icon: { body: svg, type: 'image/svg+xml' }, until: this.now() + HIT_TTL };
      } catch {
        failed = true;
      }
    }
    return { icon: null, until: this.now() + (failed ? ERROR_TTL : MISS_TTL) };
  }

  /** The icon for a listed market, or null if Hyperliquid has none (or doesn't list the name). */
  async get(name: string): Promise<Icon | null> {
    const hit = this.entries.get(name);
    if (hit && this.now() < hit.until) return hit.icon;
    const listed = await this.listed();
    if (!listed?.has(name)) return null;
    let p = this.inflight.get(name);
    if (!p) {
      p = this.fetchIcon(name)
        .then((e) => {
          this.entries.set(name, e);
          return e.icon;
        })
        .finally(() => this.inflight.delete(name));
      this.inflight.set(name, p);
    }
    return p;
  }
}
