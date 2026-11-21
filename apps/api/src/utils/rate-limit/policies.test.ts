import '../../test-setup.ts';
import { describe, expect, it } from 'vitest';
import { POLICIES, type RateLimitPolicy } from './policies.ts';

const all: RateLimitPolicy[] = Object.values(POLICIES);

/** The api-rate-limiting spec table: id → [dimension, points, window seconds, mode]. */
const SPEC_TABLE: Record<string, [RateLimitPolicy['dimension'], number, number, string]> = {
  global: ['ip', 100, 60, 'count'],
  uploads: ['ip', 600, 60, 'count'],
  'auth-login-ip': ['ip', 20, 900, 'count'],
  'auth-login-fail-ip': ['ip', 100, 86_400, 'failures'],
  'auth-login-fail-account-ip': ['email-ip', 5, 900, 'failures'],
  'auth-login-fail-account': ['email', 20, 3600, 'failures'],
  'auth-register-ip': ['ip', 5, 3600, 'count'],
  'auth-forgot-ip': ['ip', 5, 900, 'count'],
  'auth-forgot-account': ['email', 3, 3600, 'count'],
  'auth-token-ip': ['ip', 10, 900, 'count'],
  'auth-verify-send-ip': ['ip', 10, 3600, 'count'],
  'auth-verify-send-user-burst': ['user', 1, 60, 'count'],
  'auth-verify-send-user-daily': ['user', 5, 86_400, 'count'],
  'contact-ip': ['ip', 3, 900, 'count'],
  'comment-ip': ['ip', 5, 60, 'count'],
  'comment-user': ['user', 5, 60, 'count'],
  'report-ip': ['ip', 3, 900, 'count'],
  'report-user': ['user', 3, 900, 'count'],
};

describe('POLICIES', () => {
  it('holds exactly the policies of the spec table', () => {
    expect(all.map((p) => p.id).sort()).toEqual(Object.keys(SPEC_TABLE).sort());
  });

  it('has unique ids', () => {
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
  });

  it('uses positive integers for points and windows', () => {
    for (const p of all) {
      expect(Number.isInteger(p.points) && p.points > 0).toBe(true);
      expect(Number.isInteger(p.durationSec) && p.durationSec > 0).toBe(true);
    }
  });

  it('matches every value in the spec table', () => {
    for (const p of all) {
      const [dimension, points, durationSec, mode] = SPEC_TABLE[p.id];
      expect({
        id: p.id,
        dimension: p.dimension,
        points: p.points,
        durationSec: p.durationSec,
        mode: p.mode,
      }).toEqual({
        id: p.id,
        dimension,
        points,
        durationSec,
        mode,
      });
    }
  });

  it('reads the global limit from RATE_LIMIT_GLOBAL_MAX (default 100)', () => {
    expect(POLICIES.global.points).toBe(100);
  });

  it('uses the login message only on login policies', () => {
    for (const p of all) {
      expect(p.message.length).toBeGreaterThan(0);
      const isLogin = p.id.startsWith('auth-login');
      expect(/login/i.test(p.message)).toBe(isLogin);
    }
  });

  it('is frozen', () => {
    expect(Object.isFrozen(POLICIES)).toBe(true);
    for (const p of all) expect(Object.isFrozen(p)).toBe(true);
  });
});
