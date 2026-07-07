import { describe, expect, it, vi } from 'vitest';
import { sessionId } from './sessionId.ts';

/**
 * sessionId — per-page-load session identifier used for request tracing
 * via the X-Request-ID header. Generated once at module load using
 * `crypto.randomUUID()` when available, falling back to a
 * Date.now/Math.random-based UUID-like string otherwise.
 */
describe('sessionId', () => {
  it('is a non-empty string', () => {
    expect(typeof sessionId).toBe('string');
    expect(sessionId.length).toBeGreaterThan(0);
  });

  it('is a valid UUID when crypto.randomUUID is available', () => {
    // jsdom provides crypto.randomUUID in modern Node/Deno environments;
    // if so, the generated id matches the canonical 8-4-4-4-12 format.
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      expect(sessionId).toMatch(uuidRe);
    }
  });

  it('remains stable for the lifetime of the module (same instance across imports)', async () => {
    const mod = await import('./sessionId.ts');
    expect(mod.sessionId).toBe(sessionId);
  });

  it('falls back to a Date/Math.random-based id when crypto.randomUUID is unavailable', async () => {
    // Isolate a fresh module evaluation with crypto.randomUUID removed.
    const originalCrypto = globalThis.crypto;
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    vi.resetModules();
    try {
      // Define a crypto object WITHOUT randomUUID so the fallback path runs.
      Object.defineProperty(globalThis, 'crypto', {
        value: { subtle: {} },
        configurable: true,
        writable: true,
      });
      const fallbackMod = await import('./sessionId.ts');
      expect(typeof fallbackMod.sessionId).toBe('string');
      expect(fallbackMod.sessionId.length).toBeGreaterThan(0);
      // Fallback format: <base36 date>-<8 chars>-<8 chars>; at least 2 dashes.
      expect((fallbackMod.sessionId.match(/-/g) || []).length).toBeGreaterThanOrEqual(2);
      // The fallback id should differ from the canonical UUID-shaped id
      // produced when crypto.randomUUID is present (unless both happened to
      // be UUID-shaped, which the next assertion rules out by format).
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidRe.test(fallbackMod.sessionId)).toBe(false);
    } finally {
      // Restore the original crypto descriptor
      vi.resetModules();
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'crypto', originalDescriptor);
      } else {
        // No original descriptor — re-assign the saved value
        Object.defineProperty(globalThis, 'crypto', {
          value: originalCrypto,
          configurable: true,
          writable: true,
        });
      }
    }
  });

  it('falls back gracefully when crypto.randomUUID throws', async () => {
    const originalRandomUUID = globalThis.crypto?.randomUUID;
    vi.resetModules();
    try {
      // Make randomUUID throw to exercise the try/catch fall-through.
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: () => {
          throw new Error('boom');
        },
        configurable: true,
        writable: true,
      });
      const fallbackMod = await import('./sessionId.ts');
      expect(typeof fallbackMod.sessionId).toBe('string');
      expect(fallbackMod.sessionId.length).toBeGreaterThan(0);
    } finally {
      // Restore the original randomUUID
      if (originalRandomUUID) {
        Object.defineProperty(globalThis.crypto, 'randomUUID', {
          value: originalRandomUUID,
          configurable: true,
          writable: true,
        });
      }
      vi.resetModules();
    }
  });
});
