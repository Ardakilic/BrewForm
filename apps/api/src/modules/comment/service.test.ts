/**
 * Comment service tests.
 *
 * Every block runs the REAL `createComment`, `deleteComment`, `listComments` and
 * `runCommentNotificationSideEffects` exported by `service.ts`. Unit blocks replace
 * the data access and side effects through the service's `deps` proxy (see
 * {@link withDeps}); the DB-backed blocks at the end use the test database.
 *
 * Property 1 — createComment authorization matrix: for any combination of
 * (isAdmin, isRecipeOwner, hasParent), a top-level comment always succeeds, a reply
 * succeeds for an admin or the recipe owner and throws FORBIDDEN otherwise.
 * **Validates: Requirements 2.1, 2.2, 6.6**
 */

import '../../test-setup.ts';
import { db } from '@brewform/db';
import { comments, notifications, recipes, users } from '@brewform/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import fc from 'fast-check';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { reloadConfig } from '../../config/env.ts';
import { sanitizeText } from '../../utils/sanitize.ts';
import { NoteFixtures } from '../recipe-note/test-helpers.ts';
import {
  deleteComment,
  deps,
  listComments,
  createComment as realCreateComment,
  runCommentNotificationSideEffects,
} from './service.ts';

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
  author: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
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

type CreateData = {
  recipeId: string;
  authorId: string;
  content: string;
  parentCommentId: string | null;
};

/** The comment-model surface the service reads; stubs replace these on `deps.model`. */
interface MockModel {
  findById: (id: string) => Promise<MockComment | null>;
  getRecipeForAccessCheck: (
    recipeId: string,
  ) => Promise<{ authorId: string; visibility: string } | null>;
  getRecipeForNotification: (recipeId: string) => Promise<null>;
  create: (data: CreateData) => Promise<MockCreatedComment>;
  softDelete: (id: string) => Promise<MockCreatedComment | null>;
  softDeleteReplies: (parentId: string, recipeId: string) => Promise<string[]>;
}

/** The recipe-model surface the service writes; stubs replace these on `deps.recipeModel`. */
interface MockRecipeModel {
  incrementComments: (id: string) => Promise<void>;
  decrementComments: (id: string, by?: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// deps stubbing — run the real service functions without a database
// ---------------------------------------------------------------------------

const realDeps = { ...deps };

/**
 * Point the service's `deps` at stubs layered over the real modules: `deps.model`
 * becomes `{ ...realModel, ...model }`, `deps.recipeModel` likewise, and the badge
 * and mention side effects resolve without doing anything. {@link restoreDeps}
 * undoes it (every block that calls this restores in `afterEach`).
 */
function withDeps(model: Partial<MockModel>, recipeModel: Partial<MockRecipeModel> = {}): void {
  // Test stubs cover only the surface the service reads, so they are widened to the module type.
  deps.model = { ...realDeps.model, ...model } as unknown as typeof deps.model;
  deps.recipeModel = {
    ...realDeps.recipeModel,
    ...recipeModel,
  } as unknown as typeof deps.recipeModel;
  deps.evaluateBadges = () => Promise.resolve();
  deps.createMentionNotifications = () => Promise.resolve();
}

/** Put every `deps` entry back to the real implementation. */
function restoreDeps(): void {
  Object.assign(deps, realDeps);
}

/** `getRecipeForAccessCheck` stub: a public recipe owned by `authorId`. */
function publicRecipe(authorId: string): MockModel['getRecipeForAccessCheck'] {
  return () => Promise.resolve({ authorId, visibility: 'public' });
}

/** `getRecipeForNotification` stub: `null` makes the fire-and-forget notification chain return early. */
const noNotificationRecipe: MockModel['getRecipeForNotification'] = () => Promise.resolve(null);

/** Recipe-model stub that records every counter call. */
function recordingRecipeModel() {
  const increments: string[] = [];
  const decrements: unknown[][] = [];
  const recipeModel: MockRecipeModel = {
    incrementComments: (id) => {
      increments.push(id);
      return Promise.resolve();
    },
    decrementComments: (...args: unknown[]) => {
      decrements.push(args);
      return Promise.resolve();
    },
  };
  return { recipeModel, increments, decrements };
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
  afterEach(restoreDeps);

  it('PBT: for all (isAdmin, isRecipeOwner, hasParent) combinations, createComment produces the correct outcome', async () => {
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
          let createCallArgs: CreateData | null = null;

          const { recipeModel } = recordingRecipeModel();
          withDeps(
            {
              findById: (_id: string) => Promise.resolve(makeTopLevelComment('parent-comment-1')),
              getRecipeForAccessCheck: publicRecipe(recipeAuthorId),
              getRecipeForNotification: noNotificationRecipe,
              create: (data) => {
                createCallCount++;
                createCallArgs = data;
                return Promise.resolve(makeCreatedComment('new-comment-1'));
              },
              softDelete: (_id: string) => Promise.resolve(null),
            },
            recipeModel,
          );

          if (!hasParent) {
            // Top-level comment: always succeeds regardless of role
            const result = await realCreateComment(
              userId,
              recipeId,
              'some content',
              isAdmin,
              undefined,
            );
            expect(result).toBeDefined();
            expect(createCallCount).toBe(1);
            expect(createCallArgs!.parentCommentId).toBeNull();
          } else if (isAdmin || isRecipeOwner) {
            // Reply with permission: succeeds
            const result = await realCreateComment(
              userId,
              recipeId,
              'some content',
              isAdmin,
              parentCommentId,
            );
            expect(result).toBeDefined();
            expect(createCallCount).toBe(1);
          } else {
            // Reply without permission: throws FORBIDDEN
            await expect(
              realCreateComment(userId, recipeId, 'some content', isAdmin, parentCommentId),
            ).rejects.toThrow('FORBIDDEN');
            // model.create must NOT have been called
            expect(createCallCount).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
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
  afterEach(restoreDeps);

  it('PBT: persisted parentCommentId always references a Top_Level_Comment for any chain depth 1-99', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 99 }), async (depth) => {
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
        let capturedCreateArgs: CreateData | null = null;

        const { recipeModel } = recordingRecipeModel();
        withDeps(
          {
            // findById traverses the chain via the lookup map
            findById: (id: string) => Promise.resolve(commentMap.get(id) ?? null),
            // the caller owns the recipe (isRecipeOwner=true)
            getRecipeForAccessCheck: publicRecipe('caller-user'),
            getRecipeForNotification: noNotificationRecipe,
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
          },
          recipeModel,
        );

        await realCreateComment(
          'caller-user',
          'recipe-1',
          'reply content',
          true, // isAdmin=true to bypass auth checks
          deepestReply.id,
        );

        // Assert model.create was called with parentCommentId === topLevelComment.id
        expect(capturedCreateArgs).not.toBeNull();
        expect(capturedCreateArgs!.parentCommentId).toBe(topLevelComment.id);
      }),
      { numRuns: 100 },
    );
  });
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
 * "@" + directTarget.author.username + " " + sanitizeText(originalContent).
 *
 * **Validates: Requirements 2.4, 6.4**
 */
describe('Comment Service — Property 3: mention prefix transformation', () => {
  afterEach(restoreDeps);

  it('PBT: content passed to model.create is "@username content" when directTarget is a Reply', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), fc.string(), async (username, content) => {
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
        let capturedCreateData: CreateData | null = null;

        const { recipeModel } = recordingRecipeModel();
        withDeps(
          {
            findById: (_id: string) => {
              findByIdCallCount++;
              if (findByIdCallCount === 1) return Promise.resolve(directTargetComment);
              return Promise.resolve(topLevelComment);
            },
            getRecipeForAccessCheck: publicRecipe('other-author-id'),
            getRecipeForNotification: noNotificationRecipe,
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
          },
          recipeModel,
        );

        // isAdmin=true bypasses auth; caller provides directTarget.id as parentCommentId
        await realCreateComment(userId, recipeId, content, true, directTargetId);

        // Assert: content passed to model.create is "@username <sanitized content>"
        expect(capturedCreateData).not.toBeNull();
        expect(capturedCreateData!.content).toBe(`@${username} ${sanitizeText(content)}`);
      }),
      { numRuns: 100 },
    );
  });
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
  afterEach(restoreDeps);

  it('throws COMMENT_NOT_FOUND when parentCommentId references a non-existent comment', async () => {
    withDeps(
      {
        findById: (_id: string) => Promise.resolve(null),
        getRecipeForAccessCheck: publicRecipe('recipe-author'),
        getRecipeForNotification: noNotificationRecipe,
        create: () => Promise.resolve(makeCreatedComment('new')),
        softDelete: () => Promise.resolve(null),
      },
      recordingRecipeModel().recipeModel,
    );

    await expect(
      realCreateComment('user-1', 'recipe-1', 'content', true, 'nonexistent-id'),
    ).rejects.toThrow('COMMENT_NOT_FOUND');
  });

  it('throws COMMENT_DEPTH_EXCEEDED when parentCommentId chain is 100 hops deep', async () => {
    // Build a chain of 102 comments (indices 0..101) where each points to the previous
    const chain: MockComment[] = [];
    for (let i = 0; i <= 101; i++) {
      chain.push(makeComment(`c-${i}`, i === 0 ? null : `c-${i - 1}`));
    }
    const commentMap = new Map<string, MockComment>(chain.map((c) => [c.id, c]));

    withDeps(
      {
        findById: (id: string) => Promise.resolve(commentMap.get(id) ?? null),
        getRecipeForAccessCheck: publicRecipe('other-author'),
        getRecipeForNotification: noNotificationRecipe,
        create: () => Promise.resolve(makeCreatedComment('new')),
        softDelete: () => Promise.resolve(null),
      },
      recordingRecipeModel().recipeModel,
    );

    // Provide the deepest comment (c-101) as parentCommentId
    await expect(realCreateComment('user-1', 'recipe-1', 'content', true, 'c-101')).rejects.toThrow(
      'COMMENT_DEPTH_EXCEEDED',
    );
  });

  it('top-level comment (no parentCommentId) always succeeds without auth check', async () => {
    let createCalled = false;
    withDeps(
      {
        findById: (_id: string) => Promise.resolve(null),
        getRecipeForAccessCheck: publicRecipe('other-author'),
        getRecipeForNotification: noNotificationRecipe,
        create: () => {
          createCalled = true;
          return Promise.resolve(makeCreatedComment('new'));
        },
        softDelete: () => Promise.resolve(null),
      },
      recordingRecipeModel().recipeModel,
    );

    // isAdmin=false, not recipe owner — but no parentCommentId, so no auth check
    const result = await realCreateComment('user-1', 'recipe-1', 'content', false, undefined);
    expect(result).toBeDefined();
    expect(createCalled).toBe(true);
  });
});

describe('deleteComment — edge cases', () => {
  afterEach(restoreDeps);

  it('throws COMMENT_NOT_FOUND when comment does not exist (non-admin caller)', async () => {
    const { recipeModel, decrements } = recordingRecipeModel();
    withDeps(
      {
        findById: (_id: string) => Promise.resolve(null),
        softDelete: () => Promise.resolve(null),
      },
      recipeModel,
    );

    await expect(deleteComment('user-1', 'nonexistent-id', false)).rejects.toThrow(
      'COMMENT_NOT_FOUND',
    );
    expect(decrements).toEqual([]);
  });

  it('throws COMMENT_NOT_FOUND when comment does not exist (admin caller)', async () => {
    const { recipeModel, decrements } = recordingRecipeModel();
    withDeps(
      {
        findById: (_id: string) => Promise.resolve(null),
        softDelete: () => Promise.resolve(null),
      },
      recipeModel,
    );

    await expect(deleteComment('admin-user', 'nonexistent-id', true)).rejects.toThrow(
      'COMMENT_NOT_FOUND',
    );
    expect(decrements).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// #14 — a comment delete decrements only when its own soft delete changed the row
// ---------------------------------------------------------------------------

describe('deleteComment — delete once (#14)', () => {
  afterEach(restoreDeps);

  it('rejects COMMENT_NOT_FOUND and leaves the counter alone when softDelete loses the race', async () => {
    const { recipeModel, decrements } = recordingRecipeModel();
    const cascades: unknown[][] = [];
    withDeps(
      {
        findById: () => Promise.resolve(makeComment('c-1', null, 'user', 'author-1')),
        softDelete: () => Promise.resolve(null),
        softDeleteReplies: (...args) => {
          cascades.push(args);
          return Promise.resolve([]);
        },
      },
      recipeModel,
    );

    await expect(deleteComment('author-1', 'c-1', false)).rejects.toThrow('COMMENT_NOT_FOUND');
    expect(decrements).toEqual([]);
    expect(cascades).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// E1 — deleting a top-level comment removes its thread; the count drops by the rows removed
// ---------------------------------------------------------------------------

describe('deleteComment — thread delete and exact counts (E1)', () => {
  afterEach(restoreDeps);

  /** Stub deps for deleting `target`; `softDeleteReplies` resolves `replyIds`. */
  function stubDelete(target: MockComment, replyIds: string[]) {
    const { recipeModel, decrements } = recordingRecipeModel();
    const cascades: unknown[][] = [];
    withDeps(
      {
        findById: () => Promise.resolve(target),
        softDelete: () =>
          Promise.resolve({ ...makeCreatedComment(target.id), deletedAt: new Date() }),
        softDeleteReplies: (...args) => {
          cascades.push(args);
          return Promise.resolve(replyIds);
        },
      },
      recipeModel,
    );
    return { decrements, cascades };
  }

  it('a top-level delete cascades to its replies and decrements by 1 + replies', async () => {
    const { decrements, cascades } = stubDelete(makeComment('p', null, 'user', 'author-1'), [
      'r1',
      'r2',
    ]);

    await deleteComment('author-1', 'p', false);

    expect(cascades).toEqual([['p', 'recipe-1']]);
    expect(decrements).toEqual([['recipe-1', 3]]);
  });

  it('a reply delete never cascades and decrements by 1', async () => {
    const { decrements, cascades } = stubDelete(makeComment('r', 'p', 'user', 'author-1'), [
      'never',
    ]);

    await deleteComment('author-1', 'r', false);

    expect(cascades).toEqual([]);
    expect(decrements).toEqual([['recipe-1', 1]]);
  });
});

// ---------------------------------------------------------------------------
// #5 — replies stay inside their recipe's thread (deps-stubbed real createComment)
// ---------------------------------------------------------------------------

describe('createComment — replies stay inside their recipe thread (#5)', () => {
  const CALLER = 'caller-1';
  const RECIPE_ID = 'recipe-1';

  let createCalls: CreateData[];
  let mentionCalls: unknown[];
  let increments: string[];

  /** Stub deps over `comments` (looked up by id) on a public recipe the caller owns. */
  function stubThread(commentsById: Record<string, MockComment>) {
    const recorder = recordingRecipeModel();
    increments = recorder.increments;
    withDeps(
      {
        findById: (id: string) => Promise.resolve(commentsById[id] ?? null),
        getRecipeForAccessCheck: publicRecipe(CALLER),
        getRecipeForNotification: noNotificationRecipe,
        create: (data) => {
          createCalls.push(data);
          return Promise.resolve(makeCreatedComment('new'));
        },
        softDelete: () => Promise.resolve(null),
      },
      recorder.recipeModel,
    );
    deps.createMentionNotifications = (params) => {
      mentionCalls.push(params);
      return Promise.resolve();
    };
  }

  beforeEach(() => {
    createCalls = [];
    mentionCalls = [];
    increments = [];
  });

  afterEach(restoreDeps);

  it('rejects a parent on another recipe with COMMENT_NOT_FOUND and no writes or side effects', async () => {
    stubThread({ p: { ...makeComment('p'), recipeId: 'other-recipe' } });

    await expect(
      realCreateComment(CALLER, RECIPE_ID, '@someone hello', false, 'p'),
    ).rejects.toThrow('COMMENT_NOT_FOUND');
    expect(createCalls).toEqual([]);
    expect(increments).toEqual([]);
    expect(mentionCalls).toEqual([]);
  });

  it('rejects a same-recipe direct target whose resolved top-level comment is on another recipe', async () => {
    stubThread({
      top: { ...makeComment('top'), recipeId: 'other-recipe' },
      direct: makeComment('direct', 'top', 'replier'),
    });

    await expect(realCreateComment(CALLER, RECIPE_ID, 'hello', false, 'direct')).rejects.toThrow(
      'COMMENT_NOT_FOUND',
    );
    expect(createCalls).toEqual([]);
    expect(increments).toEqual([]);
    expect(mentionCalls).toEqual([]);
  });

  it('stores no @ prefix when the direct target reply has no visible author (deleted account)', async () => {
    stubThread({
      top: makeComment('top'),
      direct: { ...makeComment('direct', 'top', 'gone'), author: null },
    });

    await realCreateComment(CALLER, RECIPE_ID, 'hello there', false, 'direct');
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].content).toBe('hello there');
    expect(createCalls[0].parentCommentId).toBe('top');
  });

  it('still accepts a reply whose whole chain is on the request recipe', async () => {
    stubThread({
      top: makeComment('top'),
      direct: makeComment('direct', 'top', 'replier'),
    });

    await realCreateComment(CALLER, RECIPE_ID, 'hello', false, 'direct');
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].parentCommentId).toBe('top');
    expect(increments).toEqual([RECIPE_ID]);
  });
});

// ---------------------------------------------------------------------------
// F04 — createComment notification side-effects (mention flow integration)
//
// Exercises the REAL runCommentNotificationSideEffects exported by service.ts
// via the service-layer `deps` proxy (same idiom as notification/service.test.ts):
// model lookups and the notification functions are replaced with in-memory
// recorders and restored after each test. As of the comment/notification
// ownership refactor, createCommentNotification is the SOLE owner of both the
// in-app comment record AND the recipe-commented email; notifyRecipeCommented
// is no longer called from the comment service. Verifies:
//   - createCommentNotification is gated on recipe.authorId !== userId
//   - the mention scan ALWAYS runs (even when the commenter IS the recipe
//     author) on the effective content, forwarding recipeAuthorId
//   - each notification call has independent error handling: a rejection in
//     one never prevents the other from running
// ---------------------------------------------------------------------------

type ModelDeps = typeof deps.model;
type MentionNotificationParams = Parameters<typeof deps.createMentionNotifications>[0];
type CommentNotificationParams = Parameters<typeof deps.createCommentNotification>[0];

const originalModel = deps.model;
const originalCreateMentionNotifications = deps.createMentionNotifications;
const originalCreateCommentNotification = deps.createCommentNotification;

describe('createComment — notification side-effects (F04 mention flow)', () => {
  const recipe = {
    id: 'recipe-1',
    slug: 'recipe-slug',
    title: 'Recipe Title',
    authorId: 'author-1',
  };

  let mentionCalls: MentionNotificationParams[];
  let commentCalls: CommentNotificationParams[];

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
    deps.createMentionNotifications = (params) => {
      mentionCalls.push(params);
      return Promise.resolve();
    };
    deps.createCommentNotification = (params) => {
      commentCalls.push(params);
      return Promise.resolve();
    };
  }

  beforeEach(() => {
    mentionCalls = [];
    commentCalls = [];
  });

  afterEach(() => {
    deps.model = originalModel;
    deps.createMentionNotifications = originalCreateMentionNotifications;
    deps.createCommentNotification = originalCreateCommentNotification;
  });

  it('sends recipe-commented AND triggers the mention flow when the commenter is not the author', async () => {
    stubDeps(recipe);
    await runCommentNotificationSideEffects({
      userId: 'commenter-1',
      recipeId: 'recipe-1',
      commentId: 'comment-1',
      effectiveContent: 'Nice one @alice and @bob-2!',
    });
    expect(commentCalls.length).toBe(1);
    expect(commentCalls[0]).toEqual({
      commenterId: 'commenter-1',
      commenterUsername: 'commenter',
      recipeAuthorId: 'author-1',
      recipeId: 'recipe-1',
      recipeSlug: 'recipe-slug',
      recipeTitle: 'Recipe Title',
      commentId: 'comment-1',
    });
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
    expect(commentCalls.length).toBe(0); // gated: author commenting on own recipe
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
    expect(commentCalls.length).toBe(1);
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
    expect(commentCalls.length).toBe(0);
    expect(mentionCalls.length).toBe(0);
  });

  it('still runs the mention flow when createCommentNotification rejects', async () => {
    stubDeps(recipe);
    deps.createCommentNotification = () => Promise.reject(new Error('db down'));
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
    expect(commentCalls.length).toBe(1);
    expect(commentCalls[0]).toEqual({
      commenterId: 'commenter-1',
      commenterUsername: 'commenter',
      recipeAuthorId: 'author-1',
      recipeId: 'recipe-1',
      recipeSlug: 'recipe-slug',
      recipeTitle: 'Recipe Title',
      commentId: 'comment-7',
    });
  });

  // F05 — single-recipient comment fan-out (createCommentNotification) is
  // gated on commenter != recipe author. The F04 mention flow is independent
  // of that gate and must keep firing for @mentioned users regardless of the
  // commenter/author relationship (regression guard).

  it('createCommentNotification invoked when commenter != recipe author', async () => {
    stubDeps(recipe);
    await runCommentNotificationSideEffects({
      userId: 'commenter-1',
      recipeId: 'recipe-1',
      commentId: 'comment-8',
      effectiveContent: 'nice recipe',
    });
    expect(commentCalls.length).toBe(1);
    expect(commentCalls[0]).toEqual({
      commenterId: 'commenter-1',
      commenterUsername: 'commenter',
      recipeAuthorId: 'author-1',
      recipeId: 'recipe-1',
      recipeSlug: 'recipe-slug',
      recipeTitle: 'Recipe Title',
      commentId: 'comment-8',
    });
  });

  it('createCommentNotification NOT invoked when commenter === recipe author (self-comment)', async () => {
    stubDeps(recipe);
    await runCommentNotificationSideEffects({
      userId: 'author-1',
      recipeId: 'recipe-1',
      commentId: 'comment-9',
      effectiveContent: 'thanks for the tips',
    });
    expect(commentCalls.length).toBe(0);
    // The mention flow (F04) is NOT gated on the commenter/author relationship.
    expect(mentionCalls.length).toBe(1);
  });

  it('createMentionNotifications STILL fires for @mentioned users (F04 regression)', async () => {
    stubDeps(recipe);
    await runCommentNotificationSideEffects({
      userId: 'commenter-1',
      recipeId: 'recipe-1',
      commentId: 'comment-10',
      effectiveContent: 'cc @alice agree',
    });
    // F05 comment fan-out fires (non-author commenter) ...
    expect(commentCalls.length).toBe(1);
    // ... AND the F04 mention fan-out still fires for the @mentioned user.
    expect(mentionCalls.length).toBe(1);
    expect(mentionCalls[0].mentions).toEqual(['alice']);
    expect(mentionCalls[0].recipeAuthorId).toBe('author-1');
  });
});

// ---------------------------------------------------------------------------
// D99.9 — comment visibility gate (createComment + listComments)
//
// Exercises the REAL createComment/listComments via the deps proxy: the model
// layer is replaced with in-memory recorders over a fixture recipe, so the
// visibility × caller matrix runs without a database. Asserts:
//   - draft/private: non-owner (and anonymous for list) → RECIPE_NOT_FOUND;
//     owner/admin → allowed
//   - unlisted/public: every caller allowed (public surface unchanged)
//   - missing recipe → RECIPE_NOT_FOUND (clean 404, no FK error)
//   - on rejection: zero side-effects — deps.model.create,
//     deps.recipeModel.incrementComments, and the mention/notification
//     functions are never invoked (they only run inside successful creation)
// ---------------------------------------------------------------------------

type GateModelDeps = typeof deps.model;
type GateRecipeModelDeps = typeof deps.recipeModel;

const gateOriginalModel = deps.model;
const gateOriginalRecipeModel = deps.recipeModel;
const gateOriginalMentions = deps.createMentionNotifications;
const gateOriginalBadges = deps.evaluateBadges;

describe('D99.9 — comment visibility gate', () => {
  const AUTHOR = 'author-1';
  const STRANGER = 'stranger-2';
  const ADMIN = 'admin-3';
  const RECIPE_ID = 'recipe-1';

  interface FixtureRecipe {
    authorId: string;
    visibility: string;
  }

  let createCalls: unknown[];
  let incrementCalls: unknown[];
  let findByRecipeCalls: unknown[];
  let mentionCalls: unknown[];

  /** Replace deps with in-memory recorders over `fixture` (null = missing recipe). */
  function stubGateDeps(fixture: FixtureRecipe | null) {
    deps.model = {
      ...gateOriginalModel,
      getRecipeForAccessCheck: () => Promise.resolve(fixture),
      // Null here makes the fire-and-forget side-effect chain early-return, so
      // success-path tests stay unit-only (F04 covers the side-effect logic).
      getRecipeForNotification: () => Promise.resolve(null),
      create: (data: unknown) => {
        createCalls.push(data);
        return Promise.resolve({ id: 'comment-new' });
      },
      findByRecipe: (...args: unknown[]) => {
        findByRecipeCalls.push(args);
        return Promise.resolve({ comments: [], total: 0 });
      },
      // Recorder stub — only the gate-relevant model surface is exercised.
    } as unknown as GateModelDeps;
    deps.recipeModel = {
      ...gateOriginalRecipeModel,
      incrementComments: (id: string) => {
        incrementCalls.push(id);
        // Return value is unused (fire-and-forget); must still be a full recipe row.
        return Promise.resolve({
          id,
          slug: 'test-recipe',
          title: 'Test Recipe',
          authorId: AUTHOR,
          visibility: 'public' as const,
          currentVersionId: null,
          likeCount: 0,
          commentCount: 1,
          forkCount: 0,
          forkedFromId: null,
          featured: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        });
      },
    } as GateRecipeModelDeps;
    deps.createMentionNotifications = (params) => {
      mentionCalls.push(params);
      return Promise.resolve();
    };
    deps.evaluateBadges = () => Promise.resolve();
  }

  /** Let fire-and-forget side-effect chains drain before the next test resets the recorders. */
  function flushSideEffects(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  beforeEach(() => {
    createCalls = [];
    incrementCalls = [];
    findByRecipeCalls = [];
    mentionCalls = [];
  });

  afterEach(() => {
    deps.model = gateOriginalModel;
    deps.recipeModel = gateOriginalRecipeModel;
    deps.createMentionNotifications = gateOriginalMentions;
    deps.evaluateBadges = gateOriginalBadges;
  });

  function expectZeroSideEffects() {
    expect(createCalls.length).toBe(0);
    expect(incrementCalls.length).toBe(0);
    expect(mentionCalls.length).toBe(0);
  }

  // ---- createComment matrix ----

  for (const visibility of ['draft', 'private']) {
    it(`createComment rejects a non-owner on a ${visibility} recipe (404 semantics, zero side-effects)`, async () => {
      stubGateDeps({ authorId: AUTHOR, visibility });
      await expect(realCreateComment(STRANGER, RECIPE_ID, 'hello', false)).rejects.toThrow(
        'RECIPE_NOT_FOUND',
      );
      expectZeroSideEffects();
    });

    it(`createComment allows the owner on a ${visibility} recipe`, async () => {
      stubGateDeps({ authorId: AUTHOR, visibility });
      const result = await realCreateComment(AUTHOR, RECIPE_ID, 'hello', false);
      expect(result).toEqual({ id: 'comment-new' });
      expect(createCalls.length).toBe(1);
      expect(incrementCalls.length).toBe(1);
      await flushSideEffects();
    });

    it(`createComment allows an admin on a ${visibility} recipe`, async () => {
      stubGateDeps({ authorId: AUTHOR, visibility });
      const result = await realCreateComment(ADMIN, RECIPE_ID, 'hello', true);
      expect(result).toEqual({ id: 'comment-new' });
      expect(createCalls.length).toBe(1);
      await flushSideEffects();
    });
  }

  for (const visibility of ['unlisted', 'public']) {
    it(`createComment allows any caller on a ${visibility} recipe`, async () => {
      stubGateDeps({ authorId: AUTHOR, visibility });
      const result = await realCreateComment(STRANGER, RECIPE_ID, 'hello', false);
      expect(result).toEqual({ id: 'comment-new' });
      expect(createCalls.length).toBe(1);
      await flushSideEffects();
    });
  }

  it('createComment rejects with RECIPE_NOT_FOUND when the recipe does not exist', async () => {
    stubGateDeps(null);
    await expect(realCreateComment(STRANGER, RECIPE_ID, 'hello', false)).rejects.toThrow(
      'RECIPE_NOT_FOUND',
    );
    expectZeroSideEffects();
  });

  it('createComment rejects mention-bearing content on an invisible recipe with zero side-effects', async () => {
    stubGateDeps({ authorId: AUTHOR, visibility: 'private' });
    await expect(realCreateComment(STRANGER, RECIPE_ID, 'cc @alice', false)).rejects.toThrow(
      'RECIPE_NOT_FOUND',
    );
    expectZeroSideEffects();
  });

  // ---- listComments matrix ----

  for (const visibility of ['draft', 'private']) {
    it(`listComments rejects anonymous on a ${visibility} recipe`, async () => {
      stubGateDeps({ authorId: AUTHOR, visibility });
      await expect(listComments(RECIPE_ID, 1, 20, null)).rejects.toThrow('RECIPE_NOT_FOUND');
      expect(findByRecipeCalls.length).toBe(0);
    });

    it(`listComments rejects a non-owner on a ${visibility} recipe`, async () => {
      stubGateDeps({ authorId: AUTHOR, visibility });
      await expect(listComments(RECIPE_ID, 1, 20, STRANGER)).rejects.toThrow('RECIPE_NOT_FOUND');
      expect(findByRecipeCalls.length).toBe(0);
    });

    it(`listComments allows the owner on a ${visibility} recipe`, async () => {
      stubGateDeps({ authorId: AUTHOR, visibility });
      const result = await listComments(RECIPE_ID, 1, 20, AUTHOR);
      expect(result).toEqual({ comments: [], total: 0 });
      expect(findByRecipeCalls.length).toBe(1);
    });

    it(`listComments allows an admin on a ${visibility} recipe`, async () => {
      stubGateDeps({ authorId: AUTHOR, visibility });
      const result = await listComments(RECIPE_ID, 1, 20, ADMIN, true);
      expect(result).toEqual({ comments: [], total: 0 });
      expect(findByRecipeCalls.length).toBe(1);
    });
  }

  for (const visibility of ['unlisted', 'public']) {
    it(`listComments allows anonymous callers on a ${visibility} recipe`, async () => {
      stubGateDeps({ authorId: AUTHOR, visibility });
      const result = await listComments(RECIPE_ID, 1, 20, null);
      expect(result).toEqual({ comments: [], total: 0 });
      expect(findByRecipeCalls.length).toBe(1);
    });
  }

  it('listComments rejects with RECIPE_NOT_FOUND when the recipe does not exist', async () => {
    stubGateDeps(null);
    await expect(listComments(RECIPE_ID, 1, 20, STRANGER)).rejects.toThrow('RECIPE_NOT_FOUND');
    expect(findByRecipeCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// unique-identifiers: mentions resolve usernames case-insensitively (DB-backed)
// ---------------------------------------------------------------------------
describe('mention notifications resolve usernames case-insensitively (DB-backed)', () => {
  const fixtures = new NoteFixtures();
  const commentIds: string[] = [];
  let originalAppEnv: string | undefined;

  beforeAll(() => {
    // APP_ENV=test suppresses the mention email.
    originalAppEnv = process.env.APP_ENV;
    process.env.APP_ENV = 'test';
    reloadConfig();
  });

  afterAll(async () => {
    for (const id of commentIds) {
      await db.delete(notifications).where(eq(notifications.referenceId, id));
      await db.delete(comments).where(eq(comments.id, id));
    }
    await fixtures.cleanup();
    if (originalAppEnv === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = originalAppEnv;
    }
    reloadConfig();
  });

  it('creates exactly one mention notification for Arda<m> from "@arda<m>"', async () => {
    const m = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
    const target = await fixtures.user('mention-target');
    await db
      .update(users)
      .set({ username: `Arda${m}` })
      .where(eq(users.id, target.id));
    // The commenter is the recipe author, so only the mention flow writes a notification.
    const author = await fixtures.user('mention-author');
    const { recipe } = await fixtures.recipe(author.id);
    const content = `@arda${m} try this, @ARDA${m}!`;
    const [comment] = await db
      .insert(comments)
      .values({ recipeId: recipe.id, authorId: author.id, content })
      .returning({ id: comments.id });
    commentIds.push(comment.id);

    await runCommentNotificationSideEffects({
      userId: author.id,
      recipeId: recipe.id,
      commentId: comment.id,
      effectiveContent: content,
    });

    const rows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, target.id), eq(notifications.type, 'mention')));
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Comment counts — real createComment/deleteComment against the test database
// ---------------------------------------------------------------------------
describe('deleteComment — comment counts (DB-backed)', () => {
  const fixtures = new NoteFixtures();

  /** Read a recipe's stored `commentCount`. */
  async function storedCount(recipeId: string): Promise<number> {
    const [row] = await db
      .select({ commentCount: recipes.commentCount })
      .from(recipes)
      .where(eq(recipes.id, recipeId));
    return row.commentCount;
  }

  beforeAll(() => {
    // Badge evaluation and mention fan-out are fire-and-forget; keep them out of the cleanup race.
    deps.evaluateBadges = () => Promise.resolve();
    deps.createMentionNotifications = () => Promise.resolve();
  });

  afterAll(async () => {
    restoreDeps();
    if (fixtures.recipeIds.length > 0) {
      await db.delete(comments).where(inArray(comments.recipeId, fixtures.recipeIds));
    }
    await fixtures.cleanup();
  });

  it('two concurrent deletes of one comment: one succeeds, one is COMMENT_NOT_FOUND, count drops by 1', async () => {
    const author = await fixtures.user('double-delete');
    const { recipe } = await fixtures.recipe(author.id);
    const created = await realCreateComment(author.id, recipe.id, 'delete me twice', false);
    const before = await storedCount(recipe.id);

    const results = await Promise.allSettled([
      deleteComment(author.id, created.id, false),
      deleteComment(author.id, created.id, false),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect(((rejected[0] as PromiseRejectedResult).reason as Error).message).toBe(
      'COMMENT_NOT_FOUND',
    );
    expect(await storedCount(recipe.id)).toBe(before - 1);
  });

  /** A recipe whose author posted one top-level comment and two replies (count 3). */
  async function threadOfThree(prefix: string) {
    const author = await fixtures.user(prefix);
    const { recipe } = await fixtures.recipe(author.id);
    const parent = await realCreateComment(author.id, recipe.id, 'parent', false);
    const r1 = await realCreateComment(author.id, recipe.id, 'reply one', false, parent.id);
    const r2 = await realCreateComment(author.id, recipe.id, 'reply two', false, parent.id);
    expect(await storedCount(recipe.id)).toBe(3);
    return { author, recipe, parent, replyIds: [r1.id, r2.id] };
  }

  /** Assert the thread is gone from the list, every reply is soft-deleted and the count is 0. */
  async function expectThreadGone(recipeId: string, replyIds: string[]) {
    expect(await storedCount(recipeId)).toBe(0);
    const listed = await realDeps.model.findByRecipe(recipeId, 1, 20);
    expect(listed.comments).toEqual([]);
    expect(listed.total).toBe(0);
    const rows = await db
      .select({ id: comments.id, deletedAt: comments.deletedAt })
      .from(comments)
      .where(inArray(comments.id, replyIds));
    expect(rows).toHaveLength(replyIds.length);
    for (const row of rows) expect(row.deletedAt).not.toBeNull();
  }

  it('the author deletes a comment with two replies: count 3 -> 0, the thread is gone', async () => {
    const { author, recipe, parent, replyIds } = await threadOfThree('e1-author');
    await deleteComment(author.id, parent.id, false);
    await expectThreadGone(recipe.id, replyIds);
  });

  it('a reply deleted first (count 2), then the parent: count 0, never -1', async () => {
    const { author, recipe, parent, replyIds } = await threadOfThree('e1-reply-first');
    await deleteComment(author.id, replyIds[0], false);
    expect(await storedCount(recipe.id)).toBe(2);
    await deleteComment(author.id, parent.id, false);
    await expectThreadGone(recipe.id, replyIds);
  });

  it('an admin who is not the author deletes the parent: same result', async () => {
    const { recipe, parent, replyIds } = await threadOfThree('e1-admin');
    const admin = await fixtures.user('e1-admin-mod', { isAdmin: true });
    await deleteComment(admin.id, parent.id, true);
    await expectThreadGone(recipe.id, replyIds);
  });
});
