import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { CommentCreateSchema } from './comment.ts';

describe('CommentCreateSchema', () => {
  it('should parse a valid input with only required fields', () => {
    const result = CommentCreateSchema.safeParse({ content: 'Great recipe!' });
    expect(result.success).toBe(true);
  });

  it('should parse a valid input with parentCommentId', () => {
    const result = CommentCreateSchema.safeParse({
      content: 'Reply to comment',
      parentCommentId: crypto.randomUUID(),
    });
    expect(result.success).toBe(true);
  });

  it('should fail when required content is missing', () => {
    const result = CommentCreateSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('content'))).toBe(true);
    }
  });

  it('should fail when content is empty string', () => {
    const result = CommentCreateSchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('content'))).toBe(true);
    }
  });

  it('should fail when content is not a string', () => {
    const result = CommentCreateSchema.safeParse({ content: 123 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('content'))).toBe(true);
    }
  });

  it('should accept content at max length (5000 chars)', () => {
    const result = CommentCreateSchema.safeParse({ content: 'a'.repeat(5000) });
    expect(result.success).toBe(true);
  });

  it('should reject content exceeding 5000 chars', () => {
    const result = CommentCreateSchema.safeParse({ content: 'a'.repeat(5001) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('content'))).toBe(true);
    }
  });

  it('should accept parentCommentId when omitted', () => {
    const result = CommentCreateSchema.safeParse({ content: 'Top-level comment' });
    expect(result.success).toBe(true);
  });

  it('should accept a valid uuid for parentCommentId', () => {
    const result = CommentCreateSchema.safeParse({
      content: 'Reply',
      parentCommentId: crypto.randomUUID(),
    });
    expect(result.success).toBe(true);
  });

  it('should reject an invalid uuid for parentCommentId', () => {
    const result = CommentCreateSchema.safeParse({
      content: 'Reply',
      parentCommentId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('parentCommentId'))).toBe(true);
    }
  });
});
