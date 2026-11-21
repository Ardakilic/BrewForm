import '../../test-setup.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reloadConfig } from '../../config/env.ts';
import { app } from '../../main.ts';
import { peerEnv } from '../../utils/client-ip/test-helpers.ts';
import { resetRateLimitBackend } from '../../utils/rate-limit/registry.ts';
import * as service from './service.ts';

// The service is spied: `getLiveness` runs for real, `getReadiness` is stubbed per test,
// so these route tests need no database.
vi.mock('./service.ts', { spy: true });

/** The ready body of a healthy memory-backed setup. */
const READY_BODY = {
  status: 'ready',
  db: 'connected',
  cache: 'memory',
  rateLimitStore: 'memory',
  storage: 'ok',
  shuttingDown: false,
} as const;

/** A not-ready body (database unreachable). */
const NOT_READY_BODY = { ...READY_BODY, status: 'not_ready', db: 'disconnected' } as const;

afterEach(() => {
  vi.mocked(service.getReadiness).mockReset();
  resetRateLimitBackend();
});

describe('GET /health', () => {
  it('returns 200 {"status":"ok"} with Cache-Control: no-store', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('{"status":"ok"}');
    expect(service.getReadiness).not.toHaveBeenCalled();
  });
});

describe('GET /ready', () => {
  it('mirrors a ready result (200) with Cache-Control: no-store', async () => {
    vi.mocked(service.getReadiness).mockResolvedValueOnce({ httpStatus: 200, body: READY_BODY });
    const res = await app.request('/ready');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual(READY_BODY);
  });

  it('mirrors a not-ready result (503) with Cache-Control: no-store', async () => {
    vi.mocked(service.getReadiness).mockResolvedValueOnce({
      httpStatus: 503,
      body: NOT_READY_BODY,
    });
    const res = await app.request('/ready');
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual(NOT_READY_BODY);
  });

  it('never answers 429 to 150 requests in a row from one peer', async () => {
    vi.mocked(service.getReadiness).mockResolvedValue({ httpStatus: 200, body: READY_BODY });
    const statuses: number[] = [];
    for (let i = 0; i < 150; i++) {
      statuses.push((await app.request('/ready', {}, peerEnv('203.0.113.40'))).status);
    }
    expect(statuses).not.toContain(429);
    expect(statuses.every((s) => s === 200)).toBe(true);
  });
});

describe('OpenAPI metadata', () => {
  it('documents GET /health and GET /ready under tag Health with their response schemas', async () => {
    const original = process.env.OPENAPI_ENABLED;
    try {
      process.env.OPENAPI_ENABLED = 'true';
      reloadConfig();
      const res = await app.request('/api/v1/openapi.json');
      expect(res.status).toBe(200);
      const spec = (await res.json()) as {
        paths: Record<
          string,
          Record<
            string,
            { tags?: string[]; responses?: Record<string, { content?: Record<string, unknown> }> }
          >
        >;
      };

      const live = spec.paths['/health']?.get;
      expect(live?.tags).toEqual(['Health']);
      expect(live?.responses?.['200']?.content?.['application/json']).toMatchObject({
        schema: { properties: { status: { const: 'ok' } }, required: ['status'] },
      });

      const ready = spec.paths['/ready']?.get;
      expect(ready?.tags).toEqual(['Health']);
      for (const code of ['200', '503']) {
        expect(ready?.responses?.[code]?.content?.['application/json']).toMatchObject({
          schema: {
            properties: { storage: { enum: ['ok', 'ephemeral', 'degraded', 's3'] } },
            required: ['status', 'db', 'cache', 'rateLimitStore', 'storage', 'shuttingDown'],
          },
        });
      }
    } finally {
      if (original === undefined) delete process.env.OPENAPI_ENABLED;
      else process.env.OPENAPI_ENABLED = original;
      reloadConfig();
    }
  });
});
