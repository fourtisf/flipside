/** Node-only helpers shared by api, engine, indexer and worker. Never import from apps/web. */
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { canonicalRules, type Rules } from '../rules';

/** sha256 of the canonical rules JSON. The engine logs this at boot. */
export const rulesHash = (rules: Rules): string =>
  createHash('sha256').update(canonicalRules(rules)).digest('hex');

export interface HealthOptions {
  service: string;
  version: string;
  port: number;
  host?: string;
  /** Extra fields for the health payload, e.g. last tick time. Return ok: false to report unhealthy. */
  check?: () => Record<string, unknown> & { ok?: boolean };
}

/** Minimal GET /health server for processes that do not otherwise serve HTTP. */
export function startHealthServer({
  service,
  version,
  port,
  host = '127.0.0.1',
  check,
}: HealthOptions): Server {
  const started = Date.now();
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    const extra = check?.() ?? {};
    const ok = extra.ok ?? true;
    const body = { ...extra, ok, service, version, uptimeSeconds: Math.floor((Date.now() - started) / 1000) };
    res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
  server.listen(port, host);
  return server;
}
