/**
 * The wallets Coinside offers. A Hyperliquid account is an EVM address, so these are wallets with an EVM
 * account; Phantom and Backpack, the Solana wallets most of our users have, come first. Solana-only wallets
 * (Solflare) can't sign for Hyperliquid and aren't listed.
 *
 * Logos: each wallet's own mark, from @web3icons/core 4.0.58 (MIT), in public/wallets. The marks are their
 * owners' trademarks, shown only to identify each wallet. An installed wallet's own icon (EIP-6963) is used
 * when it announces one.
 */
export type WalletId =
  'phantom' | 'backpack' | 'metamask' | 'rabby' | 'okx' | 'coinbase' | 'rainbow' | 'trust' | 'zerion';

export interface WalletInfo {
  id: WalletId;
  name: string;
  /** EIP-6963 reverse-DNS ids the wallet announces itself with. */
  rdns: string[];
  /** The `window.ethereum` flag a wallet sets when it injects the old way. */
  flag: string;
  logo: string;
  install: string;
  /** Opens this page inside the wallet's mobile app, where the wallet is available. */
  open?: (url: string) => string;
}

const enc = encodeURIComponent;

export const WALLETS: WalletInfo[] = [
  {
    id: 'phantom',
    name: 'Phantom',
    rdns: ['app.phantom'],
    flag: 'isPhantom',
    logo: '/wallets/phantom.svg',
    install: 'https://phantom.com/download',
    open: (url) => `https://phantom.app/ul/browse/${enc(url)}?ref=${enc(new URL(url).origin)}`,
  },
  {
    id: 'backpack',
    name: 'Backpack',
    rdns: ['app.backpack'],
    flag: 'isBackpack',
    logo: '/wallets/backpack.svg',
    install: 'https://backpack.app/downloads',
  },
  {
    id: 'metamask',
    name: 'MetaMask',
    rdns: ['io.metamask', 'io.metamask.flask', 'io.metamask.mobile'],
    flag: 'isMetaMask',
    logo: '/wallets/metamask.svg',
    install: 'https://metamask.io/download/',
    open: (url) => `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, '')}`,
  },
  {
    id: 'rabby',
    name: 'Rabby',
    rdns: ['io.rabby'],
    flag: 'isRabby',
    logo: '/wallets/rabby.svg',
    install: 'https://rabby.io/',
  },
  {
    id: 'okx',
    name: 'OKX Wallet',
    rdns: ['com.okex.wallet'],
    flag: 'isOkxWallet',
    logo: '/wallets/okx.svg',
    install: 'https://www.okx.com/web3',
    open: (url) => `okx://wallet/dapp/url?dappUrl=${enc(url)}`,
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    rdns: ['com.coinbase.wallet'],
    flag: 'isCoinbaseWallet',
    logo: '/wallets/coinbase.svg',
    install: 'https://www.coinbase.com/wallet/downloads',
    open: (url) => `https://go.cb-w.com/dapp?cb_url=${enc(url)}`,
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    rdns: ['me.rainbow'],
    flag: 'isRainbow',
    logo: '/wallets/rainbow.svg',
    install: 'https://rainbow.me/download',
  },
  {
    id: 'trust',
    name: 'Trust Wallet',
    rdns: ['com.trustwallet.app'],
    flag: 'isTrust',
    logo: '/wallets/trust.svg',
    install: 'https://trustwallet.com/download',
    open: (url) => `https://link.trustwallet.com/open_url?coin_id=60&url=${enc(url)}`,
  },
  {
    id: 'zerion',
    name: 'Zerion',
    rdns: ['io.zerion.wallet'],
    flag: 'isZerion',
    logo: '/wallets/zerion.svg',
    install: 'https://zerion.io/download',
  },
];

export const walletById = (id: string) => WALLETS.find((w) => w.id === id);
export const walletByRdns = (rdns: string) => WALLETS.find((w) => w.rdns.includes(rdns));

/**
 * Which catalog wallet an old-style `window.ethereum` is, from its flags. Several wallets also set
 * isMetaMask for compatibility, so MetaMask is the last guess.
 */
export function walletFromFlags(p: Record<string, unknown>): WalletInfo | undefined {
  const order = [...WALLETS.filter((w) => w.id !== 'metamask'), walletById('metamask')!];
  return order.find((w) => p[w.flag] === true);
}

/** "0x1234…abcd" */
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
