'use client';

/**
 * One HTTP and one WebSocket connection to Hyperliquid's public API, shared by the whole app. The browser
 * talks to Hyperliquid directly; no Coinside server sits in between, so market data never depends on ours.
 * The SDK reconnects the WebSocket by itself and subscribes again after a reconnect.
 */
import { HttpTransport, WebSocketTransport } from '@nktkas/hyperliquid';

/** Testnet builds (H3) set NEXT_PUBLIC_HL_TESTNET=1. coinside.fun reads mainnet. */
export const TESTNET = process.env.NEXT_PUBLIC_HL_TESTNET === '1';

let http: HttpTransport | null = null;
let ws: WebSocketTransport | null = null;

export function httpConfig() {
  http ??= new HttpTransport({ isTestnet: TESTNET, timeout: 15_000 });
  return { transport: http };
}

export function wsConfig() {
  ws ??= new WebSocketTransport({ isTestnet: TESTNET, timeout: 15_000 });
  return { transport: ws };
}

/** Hyperliquid's Portfolio page, where its Deposit button is: the way to fund an account until Coinside's own (H4). */
export const hlPortfolioUrl = `https://app.hyperliquid${TESTNET ? '-testnet' : ''}.xyz/portfolio`;

/** Where to see the same market on Hyperliquid, for the "Compare on Hyperliquid" link. */
export const hlTradeUrl = (name: string) =>
  `https://app.hyperliquid${TESTNET ? '-testnet' : ''}.xyz/trade/${encodeURIComponent(name)}`;
