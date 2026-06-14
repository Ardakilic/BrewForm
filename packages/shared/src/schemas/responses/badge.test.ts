import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { BadgeOutputSchema, UserBadgeOutputSchema } from './badge.ts';

function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

describe('BadgeOutputSchema', () => {
  it('parses a representative badge row and round-trips', () => {
    const payload = {
      id: 'badge-1',
      name: 'First Brew',
      icon: '☕',
      description: 'Created your first recipe',
      rule: 'first_brew',
      threshold: 1,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    };
    const result = BadgeOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });
});

describe('UserBadgeOutputSchema', () => {
  it('parses a user-badge with joined badge definition and round-trips', () => {
    const payload = {
      id: 'ub-1',
      userId: 'user-1',
      badgeId: 'badge-1',
      awardedAt: new Date('2024-02-01T00:00:00.000Z'),
      badge: {
        id: 'badge-1',
        name: 'First Brew',
        icon: '☕',
        description: 'Created your first recipe',
        rule: 'first_brew',
        threshold: 1,
      },
    };
    const result = UserBadgeOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('accepts a null badge (leftJoin miss)', () => {
    const payload = {
      id: 'ub-1',
      userId: 'user-1',
      badgeId: 'badge-1',
      awardedAt: '2024-02-01T00:00:00.000Z',
      badge: null,
    };
    expect(UserBadgeOutputSchema.safeParse(payload).success).toBe(true);
  });
});
