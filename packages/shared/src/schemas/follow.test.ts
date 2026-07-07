import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { FollowSchema } from './follow.ts';

describe('FollowSchema', () => {
  it('should parse a valid input with a valid uuid', () => {
    const result = FollowSchema.safeParse({ userId: crypto.randomUUID() });
    expect(result.success).toBe(true);
  });

  it('should fail when required userId is missing', () => {
    const result = FollowSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('userId'))).toBe(true);
    }
  });

  it('should fail when userId is not a string', () => {
    const result = FollowSchema.safeParse({ userId: 123 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('userId'))).toBe(true);
    }
  });

  it('should reject an invalid uuid for userId', () => {
    const result = FollowSchema.safeParse({ userId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('userId'))).toBe(true);
    }
  });
});
