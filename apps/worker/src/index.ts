/**
 * The worker: scheduled jobs (balance roots, skew fees, leaderboard, competition, holders refresh).
 * P0 only serves /health; jobs arrive with the phases that need them.
 */
import { startHealthServer } from '@flipside/core/node';

const server = startHealthServer({
  service: 'worker',
  version: '0.0.0',
  port: Number(process.env.WORKER_HEALTH_PORT ?? 4103),
});
console.log(JSON.stringify({ msg: 'worker boot' }));

for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.once(sig, () => server.close(() => process.exit(0)));
