import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { NotificationQuerySchema } from './notification.ts';

describe('NotificationQuerySchema', () => {
  it('applies defaults when no params are given', () => {
    const result = NotificationQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.perPage).toBe(20);
      expect(result.data.unreadOnly).toBe(false);
    }
  });

  it('coerces page/perPage from strings', () => {
    const result = NotificationQuerySchema.safeParse({ page: '2', perPage: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.perPage).toBe(50);
    }
  });

  it("parses unreadOnly='true' as true", () => {
    const result = NotificationQuerySchema.safeParse({ unreadOnly: 'true' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.unreadOnly).toBe(true);
  });

  it("parses unreadOnly='false' as false (not the coerce.boolean bug)", () => {
    const result = NotificationQuerySchema.safeParse({ unreadOnly: 'false' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.unreadOnly).toBe(false);
  });

  it("parses unreadOnly='1' as true", () => {
    const result = NotificationQuerySchema.safeParse({ unreadOnly: '1' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.unreadOnly).toBe(true);
  });

  it("parses unreadOnly='0' as false", () => {
    const result = NotificationQuerySchema.safeParse({ unreadOnly: '0' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.unreadOnly).toBe(false);
  });

  it('rejects a non-boolish unreadOnly string', () => {
    const result = NotificationQuerySchema.safeParse({ unreadOnly: 'maybe' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive page', () => {
    const result = NotificationQuerySchema.safeParse({ page: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects perPage above the cap', () => {
    const result = NotificationQuerySchema.safeParse({ perPage: '101' });
    expect(result.success).toBe(false);
  });
});
