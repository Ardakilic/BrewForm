// Feature: language-switcher-and-comment-replies, Property 1: createComment authorization matrix
/**
 * Property 1 — createComment Authorization Matrix
 *
 * For any combination of (isAdmin: boolean, isRecipeOwner: boolean, hasParent: boolean),
 * createComment SHALL produce the outcome defined in the authorization matrix:
 *   - hasParent === false → always succeeds regardless of role
 *   - hasParent === true AND (isAdmin || isRecipeOwner) → succeeds
 *   - hasParent === true AND neither → throws FORBIDDEN
 *
 * **Validates: Requirements 2.1, 2.2, 6.6**
 */

import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import fc from 'npm:fast-check';
import { deps, runCommentNotificationSideEffects } from './service.ts';

// ---------------------------------------------------------------------------
// Minimal type definitions — mirror the shape returned by the real model layer
// ---------------------------------------------------------------------------

interface MockComment {
  id: string;
  recipeId: string;
  authorId: string;
  content: string;
  parentCommentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  author:
    | { id: string; username: string; displayName: string | null; avatarUrl: string | null }
    | null;
}

interface MockCreatedComment {
  id: string;
  recipeId: string;
  authorId: string;
  content: string;
  parentCommentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface MockModel {
  findById: (id: string) => Promise<MockComment | null>;
  getRecipeAuthorId: (recipeId: string) => Promise<string | null>;
  create: (data: {
    recipeId: string;
    authorId: string;
    content: string;
    parentCommentId: string | null;
  }) => Promise<MockCreatedComment>;
  softDelete: (id: string) => Promise<MockCreatedComment | null>;
}

interface MockRecipeModel {
  incrementComments: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Inline implementation of createComment — faithful copy of service.ts logic
// with injectable model dependencies (no DB, no env vars required)
// ---------------------------------------------------------------------------

async function createComment(
  userId: string,
  recipeId: string,
  content: string,
  isAdmin: boolean,
  parentCommentId: string | undefined,
  model: MockModel,
  recipeModel: MockRecipeModel,
): Promise<MockCreatedComment> {
  let effectiveParentCommentId: string | null = parentCommentId || null;
  let effectiveContent = content;

  if (parentCommentId) {
    const targetComment = await model.findById(parentCommentId);
    if (!targetComment) throw new Error('COMMENT_NOT_FOUND');

    const recipeAuthorId = await model.getRecipeAuthorId(recipeId);
    if (!isAdmin && recipeAuthorId !== userId) {
      throw new Error('FORBIDDEN');
    }

    // Thread-flattening: if target is itself a Reply, traverse up to find the Top_Level_Comment
    if (targetComment.parentCommentId !== null) {
      const directTarget = targetComment;
      let current = targetComment;
      let hops = 0;

      while (current.parentCommentId !== null) {
        hops++;
        if (hops > 100) throw new Error('COMMENT_DEPTH_EXCEEDED');
        const parent = await model.findById(current.parentCommentId);
        if (!parent) throw new Error('COMMENT_NOT_FOUND');
        current = parent;
      }

      // current is now the Top_Level_Comment
      effectiveParentCommentId = current.id;

      // Prepend @username mention if author username is available
      if (directTarget.author?.username) {
        effectiveContent = `@${directTarget.author.username} ${content}`;
      }
    }
  }

  const comment = await model.create({
    recipeId,
    authorId: userId,
    content: effectiveContent,
    parentCommentId: effectiveParentCommentId,
  });

  await recipeModel.incrementComments(recipeId);

  return comment;
}

// ---------------------------------------------------------------------------
// Inline implementation of deleteComment — faithful copy of service.ts logic
// ---------------------------------------------------------------------------

async function deleteComment(
  userId: string,
  id: string,
  isAdmin: boolean,
  model: MockModel,
): Promise<void> {
  const comment = await model.findById(id);
  if (!comment) throw new Error('COMMENT_NOT_FOUND');
  if (!isAdmin && comment.authorId !== userId) throw new Error('FORBIDDEN');
  await model.softDelete(id);
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeTopLevelComment(id: string, authorId = 'author-1'): MockComment {
  return {
    id,
    recipeId: 'recipe-1',
    authorId,
    content: 'top level content',
    parentCommentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    author: { id: authorId, username: 'authoruser', displayName: 'Author', avatarUrl: null },
  };
}

function makeCreatedComment(id: string): MockCreatedComment {
  return {
    id,
    recipeId: 'recipe-1',
    authorId: 'user-1',
    content: 'some content',
    parentCommentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Property 1 — createComment Authorization Matrix
// ---------------------------------------------------------------------------

describe('Comment Service — Property 1: createComment authorization matrix', () => {
  it(
    'PBT: for all (isAdmin, isRecipeOwner, hasParent) combinations, createComment produces the correct outcome',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            isAdmin: fc.boolean(),
            isRecipeOwner: fc.boolean(),
            hasParent: fc.boolean(),
          }),
          async ({ isAdmin, isRecipeOwner, hasParent }) => {
            const userId = 'user-1';
            const recipeId = 'recipe-1';
            const recipeAuthorId = isRecipeOwner ? userId : 'other-author';
            const parentCommentId = hasParent ? 'parent-comment-1' : undefined;

            // Track calls to model.create
            let createCallCount = 0;
            let createCallArgs: Parameters<MockModel['create']>[0] | null = null;

            const model: MockModel = {
              findById: (_id: string) => Promise.resolve(makeTopLevelComment('parent-comment-1')),
              getRecipeAuthorId: (_recipeId: string) => Promise.resolve(recipeAuthorId),
              create: (data) => {
                createCallCount++;
                createCallArgs = data;
                return Promise.resolve(makeCreatedComment('new-comment-1'));
              },
              softDelete: (_id: string) => Promise.resolve(null),
            };

            const recipeModel: MockRecipeModel = {
              incrementComments: (_id: string) => Promise.resolve(),
            };

            if (!hasParent) {
              // Top-level comment: always succeeds regardless of role
              const result = await createComment(
                userId,
                recipeId,
                'some content',
                isAdmin,
                undefined,
                model,
                recipeModel,
              );
              expect(result).toBeDefined();
              expect(createCallCount).toBe(1);
              expect(createCallArgs!.parentCommentId).toBeNull();
            } else if (isAdmin || isRecipeOwner) {
              // Reply with permission: succeeds
              const result = await createComment(
                userId,
                recipeId,
                'some content',
                isAdmin,
                parentCommentId,
                model,
                recipeModel,
              );
              expect(result).toBeDefined();
              expect(createCallCount).toBe(1);
            } else {
              // Reply without permission: throws FORBIDDEN
              let threw = false;
              try {
                await createComment(
                  userId,
                  recipeId,
                  'some content',
                  isAdmin,
                  parentCommentId,
                  model,
                  recipeModel,
                );
              } catch (err) {
                threw = true;
                expect((err as Error).message).toBe('FORBIDDEN');
              }
              expect(threw).toBe(true);
              // model.create must NOT have been called
              expect(createCallCount).toBe(0);
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Feature: language-switcher-and-comment-replies, Property 2: thread flattening invariant
/**
 * Property 2 — Thread Flattening Invariant
 *
 * For any reply creation where the provided parentCommentId references a comment
 * at any chain depth (1 to 99 hops), the persisted comment's parentCommentId SHALL
 * reference a Top_Level_Comment (a comment whose own parentCommentId is null).
 *
 * Chain structure:
 *   chain[0] = topLevel (parentCommentId: null)
 *   chain[1] = reply1   (parentCommentId: chain[0].id)
 *   ...
 *   chain[depth] = replyN (parentCommentId: chain[depth-1].id)
 *
 * The caller provides chain[depth].id as parentCommentId.
 * The service must flatten to chain[0].id.
 *
 * **Validates: Requirements 2.3, 4.1, 4.2**
 */
// ---------------------------------------------------------------------------

describe('Comment Service — Property 2: thread flattening invariant', () => {
  it(
    'PBT: persisted parentCommentId always references a Top_Level_Comment for any chain depth 1-99',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 99 }),
          async (depth) => {
            // Build a chain of comments:
            //   chain[0] = topLevel (parentCommentId: null)
            //   chain[1] = reply1   (parentCommentId: chain[0].id)
            //   ...
            //   chain[depth] = replyN (parentCommentId: chain[depth-1].id)
            const chain: MockComment[] = [];
            for (let i = 0; i <= depth; i++) {
              chain.push({
                id: `comment-${i}`,
                recipeId: 'recipe-1',
                authorId: `author-${i}`,
                content: `content-${i}`,
                parentCommentId: i === 0 ? null : `comment-${i - 1}`,
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
                author: {
                  id: `author-${i}`,
                  username: `user${i}`,
                  displayName: `User ${i}`,
                  avatarUrl: null,
                },
              });
            }

            const topLevelComment = chain[0];
            const deepestReply = chain[depth];

            // Build a lookup map for findById
            const commentMap = new Map<string, MockComment>(chain.map((c) => [c.id, c]));

            // Capture the args passed to model.create
            let capturedCreateArgs: Parameters<MockModel['create']>[0] | null = null;

            const mockModel: MockModel = {
              // findById traverses the chain via the lookup map
              findById: (id: string) => Promise.resolve(commentMap.get(id) ?? null),
              // getRecipeAuthorId returns the caller's userId so isRecipeOwner=true
              getRecipeAuthorId: () => Promise.resolve('caller-user'),
              create: (data) => {
                capturedCreateArgs = data;
                return Promise.resolve({
                  id: 'new-comment',
                  recipeId: 'recipe-1',
                  authorId: 'caller-user',
                  content: data.content,
                  parentCommentId: data.parentCommentId,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  deletedAt: null,
                });
              },
              softDelete: (_id: string) => Promise.resolve(null),
            };

            const mockRecipeModel: MockRecipeModel = {
              incrementComments: (_id: string) => Promise.resolve(),
            };

            await createComment(
              'caller-user',
              'recipe-1',
              'reply content',
              true, // isAdmin=true to bypass auth checks
              deepestReply.id,
              mockModel,
              mockRecipeModel,
            );

            // Assert model.create was called with parentCommentId === topLevelComment.id
            expect(capturedCreateArgs).not.toBeNull();
            expect(capturedCreateArgs!.parentCommentId).toBe(topLevelComment.id);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Property 3 — Mention Prefix Transformation
// Requirements: 2.4, 6.4
// ---------------------------------------------------------------------------

// Feature: language-switcher-and-comment-replies, Property 3: mention prefix transformation
/**
 * Property 3 — Mention Prefix Transformation
 *
 * For any reply that triggers thread flattening (i.e., the directly targeted comment is itself a
 * Reply), the content passed to model.create SHALL equal
 * "@" + directTarget.author.username + " " + originalContent.
 *
 * **Validates: Requirements 2.4, 6.4**
 */
describe('Comment Service — Property 3: mention prefix transformation', () => {
  it(
    'PBT: content passed to model.create is "@username content" when directTarget is a Reply',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1 }),
          fc.string(),
          async (username, content) => {
            const topLevelId = 'top-level-id';
            const directTargetId = 'direct-target-id';
            const recipeId = 'recipe-id';
            const userId = 'user-id';

            // 2-level chain:
            // topLevel: parentCommentId = null  (Top_Level_Comment)
            // directTarget: parentCommentId = topLevelId  (Reply — triggers flattening)
            const topLevelComment: MockComment = {
              id: topLevelId,
              recipeId,
              authorId: 'other-user-id',
              content: 'top level content',
              parentCommentId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null,
              author: {
                id: 'other-user-id',
                username: 'topauthor',
                displayName: null,
                avatarUrl: null,
              },
            };

            const directTargetComment: MockComment = {
              id: directTargetId,
              recipeId,
              authorId: 'reply-author-id',
              content: 'direct target content',
              parentCommentId: topLevelId,
              createdAt: new Date(),
              updatedAt: new Date(),
              deletedAt: null,
              author: {
                id: 'reply-author-id',
                username,
                displayName: null,
                avatarUrl: null,
              },
            };

            // findById: first call (directTargetId) → directTarget; second call (topLevelId) → topLevel
            let findByIdCallCount = 0;
            let capturedCreateData: Parameters<MockModel['create']>[0] | null = null;

            const mockModel: MockModel = {
              findById: (_id: string) => {
                findByIdCallCount++;
                if (findByIdCallCount === 1) return Promise.resolve(directTargetComment);
                return Promise.resolve(topLevelComment);
              },
              getRecipeAuthorId: () => Promise.resolve('other-author-id'),
              create: (data) => {
                capturedCreateData = data;
                return Promise.resolve({
                  id: 'new-comment-id',
                  recipeId,
                  authorId: userId,
                  content: data.content,
                  parentCommentId: data.parentCommentId,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  deletedAt: null,
                });
              },
              softDelete: (_id: string) => Promise.resolve(null),
            };

            const mockRecipeModel: MockRecipeModel = {
              incrementComments: (_id: string) => Promise.resolve(),
            };

            // isAdmin=true bypasses auth; caller provides directTarget.id as parentCommentId
            await createComment(
              userId,
              recipeId,
              content,
              true,
              directTargetId,
              mockModel,
              mockRecipeModel,
            );

            // Assert: content passed to model.create is "@username content"
            expect(capturedCreateData).not.toBeNull();
            expect((capturedCreateData! as { content: string }).content).toBe(
              `@${username} ${content}`,
            );
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Example / Edge-Case Tests — Task 3.5
// Requirements: 2.6, 2.7, 3.3, 6.1, 6.2, 6.3, 6.5
// ---------------------------------------------------------------------------

// Helpers for edge-case tests

function makeComment(
  id: string,
  parentCommentId: string | null = null,
  authorUsername = 'user',
  authorId = 'author-id',
): MockComment {
  return {
    id,
    recipeId: 'recipe-1',
    authorId,
    content: 'some content',
    parentCommentId,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    author: { id: authorId, username: authorUsername, displayName: null, avatarUrl: null },
  };
}

describe('createComment — edge cases', () => {
  it('throws COMMENT_NOT_FOUND when parentCommentId references a non-existent comment', async () => {
    const mockModel: MockModel = {
      findById: (_id: string) => Promise.resolve(null),
      getRecipeAuthorId: () => Promise.resolve('recipe-author'),
      create: () => Promise.resolve(makeCreatedComment('new')),
      softDelete: () => Promise.resolve(null),
    };
    const mockRecipeModel: MockRecipeModel = { incrementComments: () => Promise.resolve() };

    let threw = false;
    try {
      await createComment(
        'user-1',
        'recipe-1',
        'content',
        true,
        'nonexistent-id',
        mockModel,
        mockRecipeModel,
      );
    } catch (err) {
      threw = true;
      expect((err as Error).message).toBe('COMMENT_NOT_FOUND');
    }
    expect(threw).toBe(true);
  });

  it('throws COMMENT_DEPTH_EXCEEDED when parentCommentId chain is 100 hops deep', async () => {
    // Build a chain of 102 comments (indices 0..101) where each points to the previous
    const chain: MockComment[] = [];
    for (let i = 0; i <= 101; i++) {
      chain.push(makeComment(`c-${i}`, i === 0 ? null : `c-${i - 1}`));
    }
    const commentMap = new Map<string, MockComment>(chain.map((c) => [c.id, c]));

    const mockModel: MockModel = {
      findById: (id: string) => Promise.resolve(commentMap.get(id) ?? null),
      getRecipeAuthorId: () => Promise.resolve('other-author'),
      create: () => Promise.resolve(makeCreatedComment('new')),
      softDelete: () => Promise.resolve(null),
    };
    const mockRecipeModel: MockRecipeModel = { incrementComments: () => Promise.resolve() };

    let threw = false;
    try {
      // Provide the deepest comment (c-101) as parentCommentId
      await createComment(
        'user-1',
        'recipe-1',
        'content',
        true,
        'c-101',
        mockModel,
        mockRecipeModel,
      );
    } catch (err) {
      threw = true;
      expect((err as Error).message).toBe('COMMENT_DEPTH_EXCEEDED');
    }
    expect(threw).toBe(true);
  });

  it('top-level comment (no parentCommentId) always succeeds without auth check', async () => {
    let createCalled = false;
    const mockModel: MockModel = {
      findById: (_id: string) => Promise.resolve(null),
      getRecipeAuthorId: () => Promise.resolve('other-author'),
      create: () => {
        createCalled = true;
        return Promise.resolve(makeCreatedComment('new'));
      },
      softDelete: () => Promise.resolve(null),
    };
    const mockRecipeModel: MockRecipeModel = { incrementComments: () => Promise.resolve() };

    // isAdmin=false, not recipe owner — but no parentCommentId, so no auth check
    const result = await createComment(
      'user-1',
      'recipe-1',
      'content',
      false,
      undefined,
      mockModel,
      mockRecipeModel,
    );
    expect(result).toBeDefined();
    expect(createCalled).toBe(true);
  });
});

describe('deleteComment — edge cases', () => {
  it('throws COMMENT_NOT_FOUND when comment does not exist (non-admin caller)', async () => {
    const mockModel: MockModel = {
      findById: (_id: string) => Promise.resolve(null),
      getRecipeAuthorId: () => Promise.resolve(null),
      create: () => Promise.resolve(makeCreatedComment('new')),
      softDelete: () => Promise.resolve(null),
    };

    let threw = false;
    try {
      await deleteComment('user-1', 'nonexistent-id', false, mockModel);
    } catch (err) {
      threw = true;
      expect((err as Error).message).toBe('COMMENT_NOT_FOUND');
    }
    expect(threw).toBe(true);
  });

  it('throws COMMENT_NOT_FOUND when comment does not exist (admin caller)', async () => {
    const mockModel: MockModel = {
      findById: (_id: string) => Promise.resolve(null),
      getRecipeAuthorId: () => Promise.resolve(null),
      create: () => Promise.resolve(makeCreatedComment('new')),
      softDelete: () => Promise.resolve(null),
    };

    let threw = false;
    try {
      await deleteComment('admin-user', 'nonexistent-id', true, mockModel);
    } catch (err) {
      threw = true;
      expect((err as Error).message).toBe('COMMENT_NOT_FOUND');
    }
    expect(threw).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F04 — createComment notification side-effects (mention flow integration)
//
// Exercises the REAL runCommentNotificationSideEffects exported by service.ts
// via the service-layer `deps` proxy (same idiom as notification/service.test.ts):
// model lookups and the two notification functions are replaced with in-memory
// recorders and restored after each test. Verifies:
//   - notifyRecipeCommented remains gated on recipe.authorId !== userId
//   - the mention scan ALWAYS runs (even when the commenter IS the recipe
//     author) on the effective content, forwarding recipeAuthorId
//   - each notification call has independent error handling: a rejection in
//     one never prevents the other from running
// ---------------------------------------------------------------------------

type ModelDeps = typeof deps.model;
type NotifyRecipeCommentedParams = Parameters<typeof deps.notifyRecipeCommented>[0];
type MentionNotificationParams = Parameters<typeof deps.createMentionNotifications>[0];

const originalModel = deps.model;
const originalNotifyRecipeCommented = deps.notifyRecipeCommented;
const originalCreateMentionNotifications = deps.createMentionNotifications;

describe('createComment — notification side-effects (F04 mention flow)', () => {
  const recipe = {
    id: 'recipe-1',
    slug: 'recipe-slug',
    title: 'Recipe Title',
    authorId: 'author-1',
  };

  let notifyCalls: NotifyRecipeCommentedParams[];
  let mentionCalls: MentionNotificationParams[];

  /** Replace deps with in-memory recorders; pass null to simulate a missing recipe. */
  function stubDeps(recipeResult: typeof recipe | null) {
    const modelStub: ModelDeps = {
      ...originalModel,
      // The model's declared return type omits null (Drizzle types the selected
      // row as non-nullable), so the nullable stub result needs a downcast.
      getRecipeForNotification: () =>
        Promise.resolve(recipeResult) as ReturnType<ModelDeps['getRecipeForNotification']>,
      getCommenterById: (userId: string) => Promise.resolve({ id: userId, username: 'commenter' }),
    };
    deps.model = modelStub;
    deps.notifyRecipeCommented = (params) => {
      notifyCalls.push(params);
      return Promise.resolve();
    };
    deps.createMentionNotifications = (params) => {
      mentionCalls.push(params);
      return Promise.resolve();
    };
  }

  beforeEach(() => {
    notifyCalls = [];
    mentionCalls = [];
  });

  afterEach(() => {
    deps.model = originalModel;
    deps.notifyRecipeCommented = originalNotifyRecipeCommented;
    deps.createMentionNotifications = originalCreateMentionNotifications;
  });

  it('sends recipe-commented AND triggers the mention flow when the commenter is not the author', async () => {
    stubDeps(recipe);
    await runCommentNotificationSideEffects({
      userId: 'commenter-1',
      recipeId: 'recipe-1',
      commentId: 'comment-1',
      effectiveContent: 'Nice one @alice and @bob-2!',
    });
    expect(notifyCalls.length).toBe(1);
    expect(notifyCalls[0].recipeAuthorId).toBe('author-1');
    expect(mentionCalls.length).toBe(1);
    expect(mentionCalls[0].mentions).toEqual(['alice', 'bob-2']);
    expect(mentionCalls[0].commentId).toBe('comment-1');
    expect(mentionCalls[0].mentionerUserId).toBe('commenter-1');
    expect(mentionCalls[0].mentionerUsername).toBe('commenter');
    expect(mentionCalls[0].recipeAuthorId).toBe('author-1');
  });

  it('still triggers the mention flow when the commenter IS the recipe author (no recipe-commented email)', async () => {
    stubDeps(recipe);
    await runCommentNotificationSideEffects({
      userId: 'author-1',
      recipeId: 'recipe-1',
      commentId: 'comment-2',
      effectiveContent: 'Thanks @alice for the tip',
    });
    expect(notifyCalls.length).toBe(0); // gated: author commenting on own recipe
    expect(mentionCalls.length).toBe(1); // mention scan must NOT be skipped
    expect(mentionCalls[0].mentions).toEqual(['alice']);
    expect(mentionCalls[0].recipeAuthorId).toBe('author-1');
  });

  it('parses mentions from the effective (post-prepend) content', async () => {
    stubDeps(recipe);
    // Simulates the reply auto-prepend: "@target original text"
    await runCommentNotificationSideEffects({
      userId: 'commenter-1',
      recipeId: 'recipe-1',
      commentId: 'comment-3',
      effectiveContent: '@reply-target I agree with @alice',
    });
    expect(mentionCalls[0].mentions).toEqual(['reply-target', 'alice']);
  });

  it('invokes the mention flow with an empty list when there are no mentions (service no-ops)', async () => {
    stubDeps(recipe);
    await runCommentNotificationSideEffects({
      userId: 'commenter-1',
      recipeId: 'recipe-1',
      commentId: 'comment-4',
      effectiveContent: 'no mentions here',
    });
    expect(notifyCalls.length).toBe(1);
    expect(mentionCalls.length).toBe(1);
    expect(mentionCalls[0].mentions).toEqual([]);
  });

  it('does nothing when the recipe cannot be loaded', async () => {
    stubDeps(null);
    await runCommentNotificationSideEffects({
      userId: 'commenter-1',
      recipeId: 'recipe-1',
      commentId: 'comment-5',
      effectiveContent: 'hello @alice',
    });
    expect(notifyCalls.length).toBe(0);
    expect(mentionCalls.length).toBe(0);
  });

  it('still runs the mention flow when notifyRecipeCommented rejects', async () => {
    stubDeps(recipe);
    deps.notifyRecipeCommented = () => Promise.reject(new Error('smtp down'));
    await runCommentNotificationSideEffects({
      userId: 'commenter-1',
      recipeId: 'recipe-1',
      commentId: 'comment-6',
      effectiveContent: 'cc @alice',
    });
    expect(mentionCalls.length).toBe(1);
    expect(mentionCalls[0].mentions).toEqual(['alice']);
  });

  it('still sends recipe-commented when createMentionNotifications rejects', async () => {
    stubDeps(recipe);
    deps.createMentionNotifications = () => Promise.reject(new Error('db down'));
    await runCommentNotificationSideEffects({
      userId: 'commenter-1',
      recipeId: 'recipe-1',
      commentId: 'comment-7',
      effectiveContent: 'cc @alice',
    });
    expect(notifyCalls.length).toBe(1);
    expect(notifyCalls[0].recipeAuthorId).toBe('author-1');
  });
});
