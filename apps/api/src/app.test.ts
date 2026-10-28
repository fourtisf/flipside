import { DEFAULT_RULES, RulesResponse, HealthResponse, loadRules } from '@flipside/core';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';

const app = await buildApp({ rules: loadRules({}) });
afterAll(() => app.close());

describe('api', () => {
  it('GET /api/health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json())).toMatchObject({ ok: true, service: 'api' });
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
