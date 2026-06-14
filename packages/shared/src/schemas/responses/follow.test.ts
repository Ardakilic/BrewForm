import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  FollowerListItemOutputSchema,
  FollowingListItemOutputSchema,
  FollowOutputSchema,
} from './follow.ts';

function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

describe('FollowOutputSchema', () => {
  it('parses a raw follow row and round-trips', () => {
    const payload = {
      id: 'follow-1',
      followerId: 'user-1',
      followingId: 'user-2',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    };
    const result = FollowOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });
});

describe('FollowerListItemOutputSchema', () => {
  it('parses a follower list item with joined profile and round-trips', () => {
    const payload = {
      id: 'follow-1',
      followerId: 'user-1',
      followingId: 'user-2',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      follower: {
        id: 'user-1',
        username: 'alice',
        displayName: 'Alice',
        avatarUrl: null,
        bio: 'Coffee lover',
      },
    };
    const result = FollowerListItemOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });
});

describe('FollowingListItemOutputSchema', () => {
  it('parses a following list item with joined profile and round-trips', () => {
    const payload = {
      id: 'follow-2',
      followerId: 'user-1',
      followingId: 'user-3',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      following: {
        id: 'user-3',
        username: 'bob',
        displayName: null,
        avatarUrl: null,
        bio: null,
      },
    };
    const result = FollowingListItemOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });
});
