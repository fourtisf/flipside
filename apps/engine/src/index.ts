/**
 * The engine: single writer for the order book and ledger. Run exactly one instance (PM2 fork mode,
 * never clustered). P0 boots, resolves and hashes the rules and serves /health; the ledger, event log,
 * fills and the audit loop arrive in P2.
 */
import { loadRules, rulesToJSON } from '@coinside/core';
import { rulesHash, startHealthServer } from '@coinside/core/node';

const rules = loadRules(process.env);
const hash = rulesHash(rules);
console.log(JSON.stringify({ msg: 'engine boot', rulesHash: hash, rules: rulesToJSON(rules) }));

const server = startHealthServer({
  service: 'engine',
  version: '0.0.0',
  port: Number(process.env.ENGINE_HEALTH_PORT ?? 4101),
  check: () => ({ rulesHash: hash }),
});

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.once(sig, () => server.close(() => process.exit(0)));
