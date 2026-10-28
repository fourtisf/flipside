/**
 * Typed client for the Flipside API. Every response is validated against the shared zod schema from
 * @flipside/core. The vault program client joins this package in P3.
 */
import { HealthResponse, RulesResponse } from '@flipside/core/schemas';
import type { z } from 'zod';

export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ClientOptions {
  /** e.g. http://localhost:4000. Paths are appended as /api/... */
  baseUrl: string;
  fetch?: typeof fetch;
}

export function createClient({ baseUrl, fetch: f = globalThis.fetch }: ClientOptions) {
  const root = baseUrl.replace(/\/+$/, '');
  async function get<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
    const res = await f(`${root}/api${path}`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new ApiError(res.status, `GET /api${path} failed with ${res.status}`);
    return schema.parse(await res.json());
  }
  return {
    health: () => get('/health', HealthResponse),
    rules: () => get('/rules', RulesResponse),
  };
}

export type FlipsideClient = ReturnType<typeof createClient>;
