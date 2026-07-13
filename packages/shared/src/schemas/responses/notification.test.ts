import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { NotificationOutputSchema, UnreadCountOutputSchema } from './notification.ts';

function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

const rawNotification = {
  id: 'n-1',
  userId: 'user-1',
  type: 'mention',
  actorId: 'user-2',
  actorUsername: 'bob',
  referenceId: 'comment-1',
  referenceType: 'comment',
  metadata: null,
  readAt: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

describe('NotificationOutputSchema', () => {
  it('parses a fully-populated row and round-trips', () => {
    const result = NotificationOutputSchema.safeParse(wire(rawNotification));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(rawNotification));
  });

  it('accepts null actor fields (system notification, no actor / no join)', () => {
    const payload = {
      ...rawNotification,
      actorId: null,
      actorUsername: null,
      referenceId: null,
      referenceType: null,
    };
    expect(NotificationOutputSchema.safeParse(wire(payload)).success).toBe(true);
  });

  it('accepts a read notification (readAt set) and metadata string', () => {
    const payload = {
      ...rawNotification,
      metadata: '{"badge":"first-post"}',
      readAt: new Date('2024-02-01T00:00:00.000Z'),
    };
    const result = NotificationOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('rejects a missing required field', () => {
    const { id: _omitted, ...rest } = rawNotification;
    expect(NotificationOutputSchema.safeParse(wire(rest)).success).toBe(false);
  });
});

describe('UnreadCountOutputSchema', () => {
  it('parses a count payload', () => {
    const result = UnreadCountOutputSchema.safeParse({ count: 7 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.count).toBe(7);
  });

  it('rejects a non-integer count', () => {
    expect(UnreadCountOutputSchema.safeParse({ count: 1.5 }).success).toBe(false);
  });
});
