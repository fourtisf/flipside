import { afterEach, describe, expect, it, vi } from 'vitest';

const load = async (env: Record<string, string>) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./social');
};

afterEach(() => vi.unstubAllEnvs());

describe('token and community links', () => {
  it('shows only what is set and well formed', async () => {
    const s = await load({
      NEXT_PUBLIC_TOKEN_CA: 'J94KQmVXKQ3qZuVVEnVVJKUfmo3eWUY834JAb6orUoDd',
      NEXT_PUBLIC_X_URL: 'https://x.com/coinside',
      NEXT_PUBLIC_TELEGRAM_URL: 'https://t.me/coinside',
    });
    expect(s.TOKEN_CA).toBe('J94KQmVXKQ3qZuVVEnVVJKUfmo3eWUY834JAb6orUoDd');
    expect(s.X_URL).toBe('https://x.com/coinside');
    expect(s.TELEGRAM_URL).toBe('https://t.me/coinside');
  });

  it('hides anything empty, mistyped or pointing elsewhere', async () => {
    const s = await load({
      NEXT_PUBLIC_TOKEN_CA: '0x1234',
      NEXT_PUBLIC_X_URL: 'http://x.com/coinside',
      NEXT_PUBLIC_TELEGRAM_URL: 'https://evil.example/t.me',
    });
    expect(s.TOKEN_CA).toBe('');
    expect(s.X_URL).toBe('');
    expect(s.TELEGRAM_URL).toBe('');
    const empty = await load({
      NEXT_PUBLIC_TOKEN_CA: '',
      NEXT_PUBLIC_X_URL: '',
      NEXT_PUBLIC_TELEGRAM_URL: '',
    });
    expect([empty.TOKEN_CA, empty.X_URL, empty.TELEGRAM_URL]).toEqual(['', '', '']);
  });
});
