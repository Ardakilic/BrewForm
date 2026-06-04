/**
 * Tests for the badge schemas (`BadgeCreateSchema` / `BadgeUpdateSchema`).
 *
 * Covers: every rule value from {@link BADGE_RULE_VALUES}, missing-field
 * rejection, non-positive threshold rejection, empty/partial update
 * acceptance, and rejection of unknown rules.
 */
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { BADGE_RULE_VALUES } from '../constants/badges.ts';
import { BadgeCreateSchema, BadgeUpdateSchema } from './badge.ts';

const validBadge = {
  name: 'First Brew',
  icon: '\u2615',
  description: 'Logged your first recipe',
  rule: 'first_brew',
  threshold: 1,
};

/** Validates the full create surface, iterating the canonical rule tuple. */
describe('BadgeCreateSchema', () => {
  it('should accept a valid badge', () => {
    const result = BadgeCreateSchema.safeParse(validBadge);
    expect(result.success).toBe(true);
  });

  it('should accept every BADGE_RULE_VALUES value', () => {
    for (const rule of BADGE_RULE_VALUES) {
      const result = BadgeCreateSchema.safeParse({ ...validBadge, rule });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.rule).toBe(rule);
    }
  });

  it('should reject missing name', () => {
    const { name: _name, ...rest } = validBadge;
    const result = BadgeCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('name'))).toBe(true);
    }
  });

  it('should reject missing rule', () => {
    const { rule: _rule, ...rest } = validBadge;
    const result = BadgeCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('rule'))).toBe(true);
    }
  });

  it('should reject missing threshold', () => {
    const { threshold: _threshold, ...rest } = validBadge;
    const result = BadgeCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('threshold'))).toBe(true);
    }
  });

  it('should reject negative threshold', () => {
    const result = BadgeCreateSchema.safeParse({ ...validBadge, threshold: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('threshold'))).toBe(true);
    }
  });

  it('should reject zero threshold', () => {
    const result = BadgeCreateSchema.safeParse({ ...validBadge, threshold: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('threshold'))).toBe(true);
    }
  });

  it('should reject invalid rule', () => {
    const result = BadgeCreateSchema.safeParse({ ...validBadge, rule: 'not_a_rule' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('rule'))).toBe(true);
    }
  });
});

/** Validates the partial update surface (every field is optional). */
describe('BadgeUpdateSchema', () => {
  it('should accept empty object', () => {
    const result = BadgeUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept a partial update with one field', () => {
    const result = BadgeUpdateSchema.safeParse({ name: 'Renamed Badge' });
    expect(result.success).toBe(true);
  });
});
