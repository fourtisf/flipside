import { DEFAULT_RULES, RulesResponse, HealthResponse, loadRules } from '@coinside/core';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';

const app = await buildApp({ rules: loadRules({}) });
afterAll(() => app.close());

describe('api', () => {
  it('GET /api/health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json())).toMatchObject({ ok: true, service: 'api', release: 'dev' });
  });

  it('sees the visitor address Nginx forwards, and only from loopback', async () => {
    const probe = await buildApp({ rules: loadRules({}) });
    probe.get('/test/ip', async (req) => ({ ip: req.ip }));
    const viaNginx = await probe.inject({
      url: '/test/ip',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    expect(viaNginx.json().ip).toBe('203.0.113.7');
    const direct = await probe.inject({
      url: '/test/ip',
      remoteAddress: '198.51.100.9',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    expect(direct.json().ip).toBe('198.51.100.9');
    await probe.close();
  });

  it('GET /api/rules serves lamport strings and a stable hash', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/rules' });
    const body = RulesResponse.parse(res.json());
    expect(body.minTrade).toBe(DEFAULT_RULES.minTrade.toString());
    expect(body.levTiers.map((t) => t.leverage)).toEqual([2, 5, 10]);
    expect(body.hash).toMatch(/^[0-9a-f]{64}$/);
    const again = await app.inject({ method: 'GET', url: '/api/rules' });
    expect(again.json().hash).toBe(body.hash);
  });
});
