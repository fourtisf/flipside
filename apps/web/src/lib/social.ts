/**
 * Coinside's token and community links, fixed per build (NEXT_PUBLIC_*): set them in the environment file and
 * deploy. Anything unset or malformed stays hidden (the token's address shows "Coming soon"), so the site never
 * links to the wrong account or shows a mistyped address.
 */
const env = (v: string | undefined) => (v ?? '').trim();

/** The token's contract address (a Solana mint), once it exists. */
export const TOKEN_CA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(env(process.env.NEXT_PUBLIC_TOKEN_CA))
  ? env(process.env.NEXT_PUBLIC_TOKEN_CA)
  : '';

const httpsOn = (url: string, hosts: string[]) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && hosts.includes(u.hostname) ? u.toString() : '';
  } catch {
    return '';
  }
};

/** Coinside's X (Twitter) account. */
export const X_URL = httpsOn(env(process.env.NEXT_PUBLIC_X_URL), ['x.com', 'www.x.com', 'twitter.com']);
/** Coinside's Telegram. */
export const TELEGRAM_URL = httpsOn(env(process.env.NEXT_PUBLIC_TELEGRAM_URL), ['t.me', 'telegram.me']);
