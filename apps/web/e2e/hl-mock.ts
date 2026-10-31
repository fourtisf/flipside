/**
 * Stands in for api.hyperliquid.xyz in the browser: the info API (POST /info) and the WebSocket (/ws), with
 * the fixtures from hl-fixtures.ts. Tests never reach the real exchange, so they don't depend on the market
 * or the network.
 */
import { deflateRawSync } from 'node:zlib';
import type { Page, WebSocketRoute } from '@playwright/test';
import {
  CLEARINGHOUSE,
  EMPTY_CLEARINGHOUSE,
  EMPTY_SPOT,
  FILLS,
  META_AND_CTXS,
  ORDERS,
  SPOT,
  book,
  candles,
  mids,
  trades,
} from './hl-fixtures';

/** fastAssetCtxs arrives as base64 of raw-DEFLATE JSON, as Hyperliquid sends it. */
const packed = (data: unknown) => deflateRawSync(Buffer.from(JSON.stringify(data))).toString('base64');

/** Icons served in place of /logos/<coin>. POPCAT has none, so its letter avatar shows. */
export const NO_LOGO = 'POPCAT';
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#EDEDED"/></svg>';

interface Info {
  type: string;
  coin?: string;
  user?: string;
  req?: { coin: string; interval: string; startTime: number; endTime?: number };
}

export interface Sent {
  action: { type: string } & Record<string, unknown>;
  nonce: number;
}

export interface HlMock {
  /** Every info request the page made, in order. */
  info: Info[];
  /** Every signed action the page sent to /exchange, in order. */
  exchange: Sent[];
  /** Answer the next order with this error, as Hyperliquid does. */
  failNext: (message: string) => void;
  /** Every subscription the page asked for. */
  subs: Array<Record<string, unknown>>;
  /** Push a message to every open socket, as Hyperliquid would. */
  push: (channel: string, data: unknown) => void;
  /** Push new mids over the fast channel, which is where live prices come from. */
  pushMids: (mids: Record<string, string>) => void;
  /** An empty account receives a deposit: the funded account arrives over the socket, as Hyperliquid sends it. */
  fund: (user: string) => void;
}

/** `empty`: the connected wallet has never deposited, as every new address on Hyperliquid. */
export async function mockHyperliquid(page: Page, { down = false, empty = false } = {}): Promise<HlMock> {
  const mock: HlMock = {
    info: [],
    exchange: [],
    subs: [],
    push: () => {},
    pushMids: () => {},
    failNext: () => {},
    fund: () => {},
  };
  let account = empty ? { ch: EMPTY_CLEARINGHOUSE, spot: EMPTY_SPOT } : { ch: CLEARINGHOUSE, spot: SPOT };
  let fail: string | null = null;
  mock.failNext = (m) => void (fail = m);
  const sockets: WebSocketRoute[] = [];
  mock.push = (channel, data) => sockets.forEach((ws) => ws.send(JSON.stringify({ channel, data })));
  mock.pushMids = (m) =>
    mock.push(
      'fastAssetCtxs',
      packed(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { midPx: v }]))),
    );
  mock.fund = (user) => {
    account = { ch: CLEARINGHOUSE, spot: SPOT };
    mock.push('clearinghouseState', { dex: '', user, clearinghouseState: CLEARINGHOUSE });
    mock.push('spotState', { user, spotState: SPOT });
  };

  await page.route('**/logos/*', (route) =>
    route.request().url().endsWith(`/${NO_LOGO}`)
      ? route.fulfill({ status: 404, body: '' })
      : route.fulfill({ contentType: 'image/svg+xml', body: ICON }),
  );

  // signed actions: record them and answer as Hyperliquid would
  await page.route('https://api.hyperliquid.xyz/exchange', async (route) => {
    if (down) return route.abort('connectionrefused');
    const body = route.request().postDataJSON() as Sent;
    mock.exchange.push(body);
    const ok = (response: unknown) => route.fulfill({ json: { status: 'ok', response } });
    switch (body.action.type) {
      case 'order': {
        if (fail) {
          const message = fail;
          fail = null;
          return ok({ type: 'order', data: { statuses: [{ error: message }] } });
        }
        const o = (body.action.orders as Array<{ s: string; p: string; t: { limit?: { tif: string } } }>)[0]!;
        const status =
          o.t.limit?.tif === 'Gtc'
            ? { resting: { oid: 7001 } }
            : { filled: { totalSz: o.s, avgPx: '187.25', oid: 7002 } };
        return ok({ type: 'order', data: { statuses: [status] } });
      }
      case 'cancel':
        return ok({ type: 'cancel', data: { statuses: ['success'] } });
      default:
        return ok({ type: 'default' });
    }
  });

  await page.route('https://api.hyperliquid.xyz/info', async (route) => {
    if (down) return route.abort('connectionrefused');
    const body = route.request().postDataJSON() as Info;
    mock.info.push(body);
    switch (body.type) {
      case 'metaAndAssetCtxs':
        return route.fulfill({ json: META_AND_CTXS });
      case 'candleSnapshot': {
        const r = body.req!;
        return route.fulfill({ json: candles(r.coin, r.interval, r.startTime, r.endTime ?? Date.now()) });
      }
      case 'recentTrades':
        return route.fulfill({ json: trades(body.coin!) });
      case 'l2Book':
        return route.fulfill({ json: book(body.coin!) });
      // the account of whoever connects (any address gets the fixture account)
      case 'clearinghouseState':
        return route.fulfill({ json: account.ch });
      case 'spotClearinghouseState':
        return route.fulfill({ json: account.spot });
      case 'frontendOpenOrders':
        return route.fulfill({ json: empty ? [] : ORDERS });
      case 'userFills':
        return route.fulfill({ json: empty ? [] : FILLS });
      default:
        return route.fulfill({ status: 422, body: `unexpected info request ${body.type}` });
    }
  });

  await page.routeWebSocket('wss://api.hyperliquid.xyz/ws', (ws) => {
    if (down) return ws.close();
    sockets.push(ws);
    ws.onMessage((raw) => {
      const msg = JSON.parse(String(raw)) as { method: string; subscription?: Record<string, unknown> };
      if (msg.method === 'ping') return ws.send(JSON.stringify({ channel: 'pong' }));
      if (msg.method === 'unsubscribe')
        return ws.send(JSON.stringify({ channel: 'subscriptionResponse', data: msg }));
      if (msg.method !== 'subscribe' || !msg.subscription) return;
      const s = msg.subscription;
      mock.subs.push(s);
      ws.send(JSON.stringify({ channel: 'subscriptionResponse', data: msg }));
      const send = (channel: string, data: unknown) => ws.send(JSON.stringify({ channel, data }));
      const coin = String(s.coin ?? '');
      if (s.type === 'allMids') send('allMids', { mids: mids() });
      if (s.type === 'fastAssetCtxs')
        send(
          'fastAssetCtxs',
          packed(Object.fromEntries(Object.entries(mids()).map(([k, v]) => [k, { midPx: v, markPx: v }]))),
        );
      if (s.type === 'l2Book') {
        const b = book(coin)!;
        // the fast feed has the top 5 levels a side, the default feed 20
        send('l2Book', s.fast ? { ...b, levels: [b.levels[0].slice(0, 5), b.levels[1].slice(0, 5)] } : b);
      }
      if (s.type === 'trades')
        send(
          'trades',
          trades(coin, 2, Date.now() + 1_000).map((t, i) => ({ ...t, tid: 2_000_000 + i })),
        );
      if (s.type === 'activeAssetCtx') {
        const i = META_AND_CTXS[0].universe.findIndex((u) => u.name === coin);
        send('activeAssetCtx', { coin, ctx: META_AND_CTXS[1][i] });
      }
      const user = String(s.user ?? '');
      if (s.type === 'clearinghouseState')
        send('clearinghouseState', { dex: '', user, clearinghouseState: account.ch });
      if (s.type === 'spotState') send('spotState', { user, spotState: account.spot });
      if (s.type === 'openOrders') send('openOrders', { dex: '', user, orders: empty ? [] : ORDERS });
      if (s.type === 'userFills') send('userFills', { user, fills: empty ? [] : FILLS, isSnapshot: true });
      if (s.type === 'candle') {
        const now = Date.now();
        send('candle', candles(coin, String(s.interval), now - 60_000, now).at(-1));
      }
    });
  });
  return mock;
}
