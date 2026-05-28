import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { ReportCreateSchema, ReportFilterSchema } from './report.ts';

describe('ReportCreateSchema', () => {
  it('should validate valid data with recipeId', () => {
    const result = ReportCreateSchema.safeParse({
      recipeId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      reason: 'This recipe contains spam content.',
      type: 'spam',
    });
    expect(result.success).toBe(true);
  });

  it('should validate valid data with commentId', () => {
    const result = ReportCreateSchema.safeParse({
      commentId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      reason: 'This comment is harassment.',
      type: 'harassment',
    });
    expect(result.success).toBe(true);
  });

  it('should accept all valid report types', () => {
    for (const type of ['spam', 'harassment', 'inappropriate', 'other'] as const) {
      const result = ReportCreateSchema.safeParse({
        recipeId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        reason: 'Test reason',
        type,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject missing reason', () => {
    const result = ReportCreateSchema.safeParse({
      recipeId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      type: 'spam',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('reason'))).toBe(true);
    }
  });

  it('should reject empty reason', () => {
    const result = ReportCreateSchema.safeParse({
      recipeId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      reason: '',
      type: 'spam',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('reason'))).toBe(true);
    }
  });

  it('should reject reason exceeding 2000 chars', () => {
    const result = ReportCreateSchema.safeParse({
      recipeId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      reason: 'a'.repeat(2001),
      type: 'spam',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('reason'))).toBe(true);
    }
  });

  it('should reject invalid report type', () => {
    const result = ReportCreateSchema.safeParse({
      recipeId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      reason: 'Test reason',
      type: 'invalid_type',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing type', () => {
    const result = ReportCreateSchema.safeParse({
      recipeId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      reason: 'Test reason',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('type'))).toBe(true);
    }
  });
});

describe('ReportFilterSchema', () => {
  it('should apply defaults', () => {
    const result = ReportFilterSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.perPage).toBe(20);
    }
  });

  it('should accept valid filter values', () => {
    const result = ReportFilterSchema.safeParse({
      status: 'pending',
      page: 2,
      perPage: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('pending');
      expect(result.data.page).toBe(2);
      expect(result.data.perPage).toBe(10);
    }
  });

  it('should accept all valid status values', () => {
    for (const status of ['pending', 'reviewed', 'resolved', 'dismissed'] as const) {
      const result = ReportFilterSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid status', () => {
    const result = ReportFilterSchema.safeParse({ status: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('should reject page 0', () => {
    const result = ReportFilterSchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('should reject negative page', () => {
    const result = ReportFilterSchema.safeParse({ page: -1 });
    expect(result.success).toBe(false);
  });

  it('should reject perPage over 100', () => {
    const result = ReportFilterSchema.safeParse({ perPage: 101 });
    expect(result.success).toBe(false);
  });
});
