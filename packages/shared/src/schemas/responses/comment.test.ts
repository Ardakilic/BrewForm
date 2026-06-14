import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  CommentOutputSchema,
  CommentWithAuthorOutputSchema,
  CommentWithRepliesOutputSchema,
} from './comment.ts';

function wire<T>(payload: T): unknown {
  return JSON.parse(JSON.stringify(payload));
}

const rawComment = {
  id: 'c-1',
  recipeId: 'recipe-1',
  authorId: 'user-1',
  content: 'Great recipe!',
  parentCommentId: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  deletedAt: null,
};

const author = { id: 'user-1', username: 'alice', displayName: 'Alice', avatarUrl: null };

describe('CommentOutputSchema', () => {
  it('parses the raw create row and round-trips', () => {
    const result = CommentOutputSchema.safeParse(wire(rawComment));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(rawComment));
  });
});

describe('CommentWithAuthorOutputSchema', () => {
  it('parses a row with joined author and round-trips', () => {
    const payload = { ...rawComment, author };
    const result = CommentWithAuthorOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('accepts a null author (leftJoin miss)', () => {
    const payload = { ...rawComment, author: null };
    expect(CommentWithAuthorOutputSchema.safeParse(wire(payload)).success).toBe(true);
  });
});

describe('CommentWithRepliesOutputSchema', () => {
  it('parses a top-level comment with a replies[] thread and round-trips', () => {
    const reply = {
      id: 'c-2',
      recipeId: 'recipe-1',
      authorId: 'user-2',
      content: '@alice thanks!',
      parentCommentId: 'c-1',
      createdAt: new Date('2024-01-01T01:00:00.000Z'),
      updatedAt: new Date('2024-01-01T01:00:00.000Z'),
      deletedAt: null,
      author: { id: 'user-2', username: 'bob', displayName: null, avatarUrl: null },
    };
    const payload = { ...rawComment, author, replies: [reply] };
    const result = CommentWithRepliesOutputSchema.safeParse(wire(payload));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(wire(payload));
  });

  it('accepts an empty replies array', () => {
    const payload = { ...rawComment, author, replies: [] };
    expect(CommentWithRepliesOutputSchema.safeParse(wire(payload)).success).toBe(true);
  });
});
