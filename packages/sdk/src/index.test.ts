import { describe, expect, it } from 'vitest';
import { ApiError, createClient } from './index';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('sdk', () => {
  it('validates responses against the shared schema', async () => {
    const calls: string[] = [];
    const client = createClient({
      baseUrl: 'http://api.test/',
      fetch: async (url) => {
        calls.push(String(url));
        return json({ ok: true, service: 'api', version: '0.0.0', release: 'dev', uptimeSeconds: 1 });
      },
    });
    await expect(client.health()).resolves.toMatchObject({ ok: true, service: 'api' });
    expect(calls).toEqual(['http://api.test/api/health']);
  });

  it('throws ApiError on non-2xx and on schema mismatch', async () => {
    const bad = createClient({ baseUrl: 'http://x', fetch: async () => json({}, 503) });
    await expect(bad.health()).rejects.toBeInstanceOf(ApiError);
    const wrong = createClient({ baseUrl: 'http://x', fetch: async () => json({ ok: 'yes' }) });
    await expect(wrong.health()).rejects.toThrow();
  });
});
