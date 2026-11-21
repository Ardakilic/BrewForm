import { describe, expect, it } from 'vitest';
import { HealthOutputSchema, ReadinessOutputSchema } from './health.ts';

/** A valid ready body (the healthy memory-backed setup). */
const READY = {
  status: 'ready',
  db: 'connected',
  cache: 'memory',
  rateLimitStore: 'memory',
  storage: 'ok',
  shuttingDown: false,
} as const;

describe('HealthOutputSchema', () => {
  it('accepts { status: "ok" }', () => {
    expect(HealthOutputSchema.safeParse({ status: 'ok' }).success).toBe(true);
  });

  it('rejects any other status, extra keys and an empty body', () => {
    expect(HealthOutputSchema.safeParse({ status: 'ready' }).success).toBe(false);
    expect(HealthOutputSchema.safeParse({ status: 'ok', db: 'connected' }).success).toBe(false);
    expect(HealthOutputSchema.safeParse({}).success).toBe(false);
  });
});

describe('ReadinessOutputSchema', () => {
  it('accepts the ready body and round-trips it', () => {
    const result = ReadinessOutputSchema.safeParse(READY);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(READY);
  });

  it('accepts the shutting-down body', () => {
    const body = { ...READY, status: 'not_ready', db: 'skipped', shuttingDown: true };
    expect(ReadinessOutputSchema.safeParse(body).success).toBe(true);
  });

  it('accepts every documented value of each key', () => {
    for (const status of ['ready', 'not_ready']) {
      expect(ReadinessOutputSchema.safeParse({ ...READY, status }).success).toBe(true);
    }
    for (const db of ['connected', 'disconnected', 'skipped']) {
      expect(ReadinessOutputSchema.safeParse({ ...READY, db }).success).toBe(true);
    }
    for (const value of ['ok', 'degraded', 'memory', 'disabled']) {
      expect(ReadinessOutputSchema.safeParse({ ...READY, cache: value }).success).toBe(true);
      expect(ReadinessOutputSchema.safeParse({ ...READY, rateLimitStore: value }).success).toBe(
        true,
      );
    }
    for (const storage of ['ok', 'ephemeral', 'degraded', 's3']) {
      expect(ReadinessOutputSchema.safeParse({ ...READY, storage }).success).toBe(true);
    }
  });

  it('rejects extra keys (strict)', () => {
    expect(ReadinessOutputSchema.safeParse({ ...READY, version: '1.0.0' }).success).toBe(false);
  });

  it('rejects unknown values', () => {
    expect(ReadinessOutputSchema.safeParse({ ...READY, status: 'ok' }).success).toBe(false);
    expect(ReadinessOutputSchema.safeParse({ ...READY, db: 'up' }).success).toBe(false);
    expect(ReadinessOutputSchema.safeParse({ ...READY, cache: 'redis' }).success).toBe(false);
    expect(ReadinessOutputSchema.safeParse({ ...READY, rateLimitStore: 'down' }).success).toBe(
      false,
    );
    expect(ReadinessOutputSchema.safeParse({ ...READY, storage: 'local' }).success).toBe(false);
    expect(ReadinessOutputSchema.safeParse({ ...READY, shuttingDown: 'no' }).success).toBe(false);
  });

  it('rejects a body missing a key', () => {
    const { storage: _storage, ...withoutStorage } = READY;
    expect(ReadinessOutputSchema.safeParse(withoutStorage).success).toBe(false);
  });
});
