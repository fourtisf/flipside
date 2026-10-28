import { buildApp } from './app';

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? '127.0.0.1';

const app = await buildApp({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
await app.listen({ port, host });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => {
    void app.close().then(() => process.exit(0));
  });
}
