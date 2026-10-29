import websocket from '@fastify/websocket';
import { loadRules, rulesToJSON, type Rules } from '@coinside/core';
import { rulesHash } from '@coinside/core/node';
import Fastify, { type FastifyServerOptions } from 'fastify';

export const VERSION = '0.0.0';

export interface AppOptions {
  rules?: Rules;
  logger?: FastifyServerOptions['logger'];
}

/**
 * REST under /api and the WebSocket at /ws. P0 serves health and rules; markets, feed and stats land
 * in P1, orders and positions in P2.
 */
export async function buildApp({ rules = loadRules(process.env), logger = false }: AppOptions = {}) {
  const app = Fastify({ logger });
  const started = Date.now();
  const rulesBody = { ...rulesToJSON(rules), hash: rulesHash(rules) };

  await app.register(websocket);

  app.get('/api/health', async () => ({
    ok: true,
    service: 'api',
    version: VERSION,
    uptimeSeconds: Math.floor((Date.now() - started) / 1000),
  }));

  app.get('/api/rules', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return rulesBody;
  });

  app.get('/ws', { websocket: true }, (socket) => {
    // Messages are { ch, t, data }. Channels (prices:{mint}, markets, feed, stats, me) arrive in P1/P2.
    socket.send(JSON.stringify({ ch: 'system', t: Date.now(), data: { hello: true, version: VERSION } }));
  });

  return app;
}
