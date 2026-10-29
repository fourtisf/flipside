/**
 * The indexer: prices, liquidity, pools, holders and chain events. P0 only serves /health; pool
 * decoders, Helius streaming, sampling and candles arrive in P1.
 */
import { startHealthServer } from '@coinside/core/node';

const server = startHealthServer({
  service: 'indexer',
  version: '0.0.0',
  port: Number(process.env.INDEXER_HEALTH_PORT ?? 4102),
});
console.log(JSON.stringify({ msg: 'indexer boot' }));

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.once(sig, () => server.close(() => process.exit(0)));
