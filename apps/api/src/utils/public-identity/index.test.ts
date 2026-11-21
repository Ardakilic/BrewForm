/**
 * Unit tests for `visibleIdentity` (capability `account-deletion`, "A deleted account has no
 * public identity").
 */

import { describe, expect, it } from 'vitest';
import { visibleIdentity } from './index.ts';

describe('visibleIdentity', () => {
  it('returns null for a missing projection', () => {
    expect(visibleIdentity(null)).toBeNull();
    expect(visibleIdentity(undefined)).toBeNull();
  });

  it('returns null for a soft-deleted account', () => {
    expect(
      visibleIdentity({ id: 'u-1', username: 'gone', deletedAt: new Date('2026-01-01') }),
    ).toBeNull();
  });

  it('returns the same fields without deletedAt for a live account', () => {
    const identity = visibleIdentity({
      id: 'u-1',
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
      deletedAt: null,
    });
    expect(identity).toEqual({
      id: 'u-1',
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
    });
    expect(identity).not.toHaveProperty('deletedAt');
  });
});
