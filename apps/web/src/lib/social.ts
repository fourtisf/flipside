/**
 * Coinside's token and community links, fixed per build (NEXT_PUBLIC_*): set them in the environment file and
 * deploy. Unset, the official token and X account show; anything malformed stays hidden (the token's address
 * shows "Coming soon"), so the site never links to the wrong account or shows a mistyped address.
 */
const env = (v: string | undefined) => (v ?? '').trim();

/** Coinside's token, launched on pump.fun (ALFA, 1 Nov 2026); NEXT_PUBLIC_TOKEN_CA can replace it. */
export const OFFICIAL_CA = '7qUjC9A27ijrQrG69kj6cU2o8wUT9APHeJgMixLxpump';
const ca = env(process.env.NEXT_PUBLIC_TOKEN_CA) || OFFICIAL_CA;
/** The token's contract address (a Solana mint). */
export const TOKEN_CA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(ca) ? ca : '';

const httpsOn = (url: string, hosts: string[]) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && hosts.includes(u.hostname) ? u.toString() : '';
  } catch {
    return '';
  }
};

/** Coinside's official X account (ALFA, 1 Nov 2026); NEXT_PUBLIC_X_URL can point elsewhere. */
export const OFFICIAL_X = 'https://x.com/usecoinside';
/** Coinside's X (Twitter) account. */
export const X_URL = httpsOn(env(process.env.NEXT_PUBLIC_X_URL) || OFFICIAL_X, [
  'x.com',
  'www.x.com',
  'twitter.com',
]);
/** Coinside's Telegram. */
export const TELEGRAM_URL = httpsOn(env(process.env.NEXT_PUBLIC_TELEGRAM_URL), ['t.me', 'telegram.me']);
