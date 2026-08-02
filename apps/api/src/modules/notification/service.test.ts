/**
 * Unit tests for the notification service (F04 — @mention notifications).
 *
 * Strategy: the service exposes a `deps` proxy ({ model, notifyMentioned })
 * that these tests replace with in-memory stubs, so the REAL service functions
 * run without a database or SMTP. Originals are restored after each test.
 */
import '../../test-setup.ts';
import { afterEach, beforeEach, describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import * as service from './service.ts';
import { deps } from './service.ts';

type ModelDeps = typeof deps.model;
type NotifyMentioned = typeof deps.notifyMentioned;
type NotifyNewFollower = typeof deps.notifyNewFollower;
type NotifyRecipeLiked = typeof deps.notifyRecipeLiked;
type NotifyRecipeCommented = typeof deps.notifyRecipeCommented;
type MentionTarget = Awaited<ReturnType<ModelDeps['findMentionTargets']>>[number];
type NotifyTarget = NonNullable<Awaited<ReturnType<ModelDeps['findNotifyTarget']>>>;
type NotificationRow = NonNullable<Awaited<ReturnType<ModelDeps['findById']>>>;
type CreateData = Parameters<ModelDeps['create']>[0];

/** Default "all notify flags on" preferences for {@link makeNotifyTarget}. */
const ALL_NOTIFY_PREFS_TRUE = {
  notifyNewFollower: true,
  notifyRecipeLiked: true,
  notifyRecipeCommented: true,
  notifyFollowedUserPosted: true,
  notifyMentionedInComment: true,
};

/** In-memory call recorder for the model + email stubs. */
interface Calls {
  findMentionTargets: string[][];
  findNotifyTarget: string[];
  create: CreateData[];
  notifyMentioned: Parameters<NotifyMentioned>[0][];
  notifyNewFollower: Parameters<NotifyNewFollower>[0][];
  notifyRecipeLiked: Parameters<NotifyRecipeLiked>[0][];
  notifyRecipeCommented: Parameters<NotifyRecipeCommented>[0][];
}

function makeCalls(): Calls {
  return {
    findMentionTargets: [],
    findNotifyTarget: [],
    create: [],
    notifyMentioned: [],
    notifyNewFollower: [],
    notifyRecipeLiked: [],
    notifyRecipeCommented: [],
  };
}

function makeTarget(overrides: Partial<MentionTarget> = {}): MentionTarget {
  return {
    id: 'target-1',
    username: 'target',
    prefs: { notifyMentionedInComment: true },
    ...overrides,
  };
}

function makeNotifyTarget(overrides: Partial<NotifyTarget> = {}): NotifyTarget {
  return {
    id: 'target-1',
    username: 'target',
    prefs: { ...ALL_NOTIFY_PREFS_TRUE },
    ...overrides,
  };
}

function makeRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n-1',
    userId: 'user-1',
    type: 'mention',
    actorId: 'actor-1',
    referenceId: 'comment-1',
    referenceType: 'comment',
    metadata: JSON.stringify({ recipeSlug: 'slug-1', recipeTitle: 'Title 1' }),
    readAt: null,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    actor: { username: 'actor' },
    ...overrides,
  };
}

/** Build a stub model; unset methods throw if reached. */
function makeModel(overrides: Partial<ModelDeps>, calls: Calls): ModelDeps {
  const unexpected = (name: string) => () => {
    throw new Error(`unexpected model call: ${name}`);
  };
  return {
    findMentionTargets: (usernames: string[]) => {
      calls.findMentionTargets.push(usernames);
      return Promise.resolve([]);
    },
    findNotifyTarget: (userId: string) => {
      calls.findNotifyTarget.push(userId);
      return Promise.resolve(makeNotifyTarget({ id: userId }));
    },
    create: (data: CreateData) => {
      calls.create.push(data);
      return Promise.resolve(
        {
          id: 'created-1',
          ...data,
          readAt: null,
          createdAt: new Date(),
          deletedAt: null,
        } as Awaited<ReturnType<ModelDeps['create']>>,
      );
    },
    findByUserId: unexpected('findByUserId'),
    markAsRead: unexpected('markAsRead'),
    markAllAsRead: unexpected('markAllAsRead'),
    getUnreadCount: unexpected('getUnreadCount'),
    findById: unexpected('findById'),
    ...overrides,
  } as ModelDeps;
}

const originalModel = deps.model;
const originalNotifyMentioned = deps.notifyMentioned;
const originalNotifyNewFollower = deps.notifyNewFollower;
const originalNotifyRecipeLiked = deps.notifyRecipeLiked;
const originalNotifyRecipeCommented = deps.notifyRecipeCommented;

let calls: Calls;

beforeEach(() => {
  calls = makeCalls();
  deps.notifyMentioned = (params) => {
    calls.notifyMentioned.push(params);
    return Promise.resolve();
  };
  deps.notifyNewFollower = (params) => {
    calls.notifyNewFollower.push(params);
    return Promise.resolve();
  };
  deps.notifyRecipeLiked = (params) => {
    calls.notifyRecipeLiked.push(params);
    return Promise.resolve();
  };
  deps.notifyRecipeCommented = (params) => {
    calls.notifyRecipeCommented.push(params);
    return Promise.resolve();
  };
});

afterEach(() => {
  deps.model = originalModel;
  deps.notifyMentioned = originalNotifyMentioned;
  deps.notifyNewFollower = originalNotifyNewFollower;
  deps.notifyRecipeLiked = originalNotifyRecipeLiked;
  deps.notifyRecipeCommented = originalNotifyRecipeCommented;
});

/** Default params for createMentionNotifications; recipe author is a third user. */
function mentionParams(
  overrides: Partial<Parameters<typeof service.createMentionNotifications>[0]> = {},
) {
  return {
    mentions: ['target'],
    commentId: 'comment-1',
    recipeId: 'recipe-1',
    recipeSlug: 'slug-1',
    recipeTitle: 'Title 1',
    mentionerUserId: 'mentioner-1',
    mentionerUsername: 'mentioner',
    recipeAuthorId: 'author-1',
    ...overrides,
  };
}

describe('createMentionNotifications', () => {
  it('returns early on empty mentions without resolving targets', async () => {
    deps.model = makeModel({}, calls);
    await service.createMentionNotifications(mentionParams({ mentions: [] }));
    expect(calls.findMentionTargets).toEqual([]);
    expect(calls.create).toEqual([]);
    expect(calls.notifyMentioned).toEqual([]);
  });

  it('creates a record and sends an email for an opted-in non-author target', async () => {
    deps.model = makeModel({
      findMentionTargets: (usernames) => {
        calls.findMentionTargets.push(usernames);
        return Promise.resolve([makeTarget()]);
      },
    }, calls);
    await service.createMentionNotifications(mentionParams());
    expect(calls.findMentionTargets).toEqual([['target']]);
    expect(calls.create.length).toBe(1);
    expect(calls.create[0]).toEqual({
      userId: 'target-1',
      type: 'mention',
      actorId: 'mentioner-1',
      referenceId: 'comment-1',
      referenceType: 'comment',
      metadata: JSON.stringify({ recipeSlug: 'slug-1', recipeTitle: 'Title 1' }),
    });
    expect(calls.notifyMentioned).toEqual([{
      mentionedUserId: 'target-1',
      mentionerUsername: 'mentioner',
      recipeTitle: 'Title 1',
      recipeSlug: 'slug-1',
    }]);
  });

  it('drops self-mentions (no record, no email)', async () => {
    deps.model = makeModel({
      findMentionTargets: () => Promise.resolve([makeTarget({ id: 'mentioner-1' })]),
    }, calls);
    await service.createMentionNotifications(mentionParams());
    expect(calls.create).toEqual([]);
    expect(calls.notifyMentioned).toEqual([]);
  });

  it('skips record AND email when notifyMentionedInComment preference is false', async () => {
    deps.model = makeModel({
      findMentionTargets: () =>
        Promise.resolve([makeTarget({ prefs: { notifyMentionedInComment: false } })]),
    }, calls);
    await service.createMentionNotifications(mentionParams());
    expect(calls.create).toEqual([]);
    expect(calls.notifyMentioned).toEqual([]);
  });

  it('treats a missing preferences row (prefs null) as opted in', async () => {
    deps.model = makeModel({
      findMentionTargets: () => Promise.resolve([makeTarget({ prefs: null })]),
    }, calls);
    await service.createMentionNotifications(mentionParams());
    expect(calls.create.length).toBe(1);
    expect(calls.notifyMentioned.length).toBe(1);
  });

  it('creates a record but skips the email when the target is the recipe author', async () => {
    deps.model = makeModel({
      findMentionTargets: () => Promise.resolve([makeTarget({ id: 'author-1' })]),
    }, calls);
    await service.createMentionNotifications(mentionParams());
    expect(calls.create.length).toBe(1);
    expect(calls.create[0].userId).toBe('author-1');
    expect(calls.notifyMentioned).toEqual([]);
  });

  it('is a no-op when no usernames resolve (unknown mentions)', async () => {
    deps.model = makeModel({}, calls); // findMentionTargets resolves []
    await service.createMentionNotifications(mentionParams({ mentions: ['ghost'] }));
    expect(calls.findMentionTargets).toEqual([['ghost']]);
    expect(calls.create).toEqual([]);
    expect(calls.notifyMentioned).toEqual([]);
  });

  it('fans out to multiple targets applying each gate independently', async () => {
    deps.model = makeModel({
      findMentionTargets: () =>
        Promise.resolve([
          makeTarget({ id: 'mentioner-1', username: 'self' }),
          makeTarget({
            id: 'opted-out',
            username: 'quiet',
            prefs: { notifyMentionedInComment: false },
          }),
          makeTarget({ id: 'author-1', username: 'author' }),
          makeTarget({ id: 'plain-1', username: 'plain' }),
        ]),
    }, calls);
    await service.createMentionNotifications(mentionParams({
      mentions: ['self', 'quiet', 'author', 'plain'],
    }));
    expect(calls.create.map((c) => c.userId)).toEqual(['author-1', 'plain-1']);
    expect(calls.notifyMentioned.map((n) => n.mentionedUserId)).toEqual(['plain-1']);
  });
});

describe('listNotifications', () => {
  it('maps rows to the wire shape (ISO timestamps, flattened actorUsername)', async () => {
    const readAt = new Date('2026-07-02T08:30:00.000Z');
    deps.model = makeModel({
      findByUserId: (_userId, _page, _perPage, _unreadOnly) =>
        Promise.resolve({
          notifications: [
            makeRow(),
            makeRow({ id: 'n-2', actorId: null, actor: null, readAt }),
          ],
          total: 2,
        }),
    }, calls);
    const result = await service.listNotifications('user-1', 1, 20, false);
    expect(result.total).toBe(2);
    expect(result.notifications[0]).toEqual({
      id: 'n-1',
      userId: 'user-1',
      type: 'mention',
      actorId: 'actor-1',
      actorUsername: 'actor',
      referenceId: 'comment-1',
      referenceType: 'comment',
      metadata: JSON.stringify({ recipeSlug: 'slug-1', recipeTitle: 'Title 1' }),
      readAt: null,
      createdAt: '2026-07-01T10:00:00.000Z',
    });
    expect(result.notifications[1].actorUsername).toBeNull();
    expect(result.notifications[1].readAt).toBe('2026-07-02T08:30:00.000Z');
  });

  it('forwards pagination arguments to the model', async () => {
    let seen: unknown[] = [];
    deps.model = makeModel({
      findByUserId: (userId, page, perPage, unreadOnly) => {
        seen = [userId, page, perPage, unreadOnly];
        return Promise.resolve({ notifications: [], total: 0 });
      },
    }, calls);
    await service.listNotifications('user-9', 3, 5, true);
    expect(seen).toEqual(['user-9', 3, 5, true]);
  });
});

describe('markAsRead', () => {
  it('throws NOTIFICATION_NOT_FOUND for a missing/deleted row', async () => {
    deps.model = makeModel({ findById: () => Promise.resolve(null) }, calls);
    await expect(service.markAsRead('user-1', 'missing')).rejects.toThrow(
      'NOTIFICATION_NOT_FOUND',
    );
  });

  it('throws FORBIDDEN when the row belongs to another user', async () => {
    deps.model = makeModel({
      findById: () => Promise.resolve(makeRow({ userId: 'someone-else' })),
    }, calls);
    await expect(service.markAsRead('user-1', 'n-1')).rejects.toThrow('FORBIDDEN');
  });

  it('marks an unread notification and returns the updated wire row', async () => {
    const readAt = new Date('2026-07-03T12:00:00.000Z');
    deps.model = makeModel({
      findById: () => Promise.resolve(makeRow()),
      markAsRead: (_id) =>
        Promise.resolve(
          { readAt } as unknown as Awaited<ReturnType<ModelDeps['markAsRead']>>,
        ),
    }, calls);
    const result = await service.markAsRead('user-1', 'n-1');
    expect(result.readAt).toBe('2026-07-03T12:00:00.000Z');
    expect(result.actorUsername).toBe('actor');
  });

  it('is idempotent: an already-read row is returned as-is', async () => {
    const alreadyReadAt = new Date('2026-07-01T11:00:00.000Z');
    deps.model = makeModel({
      findById: () => Promise.resolve(makeRow({ readAt: alreadyReadAt })),
      markAsRead: () => Promise.resolve(undefined), // model guard: already read
    }, calls);
    const result = await service.markAsRead('user-1', 'n-1');
    expect(result.readAt).toBe('2026-07-01T11:00:00.000Z');
  });
});

describe('markAllAsRead / getUnreadCount', () => {
  it('markAllAsRead returns the number of rows marked', async () => {
    deps.model = makeModel({
      markAllAsRead: (userId) => Promise.resolve(userId === 'user-1' ? 4 : 0),
    }, calls);
    expect(await service.markAllAsRead('user-1')).toBe(4);
  });

  it('getUnreadCount returns the model count', async () => {
    deps.model = makeModel({
      getUnreadCount: (userId) => Promise.resolve(userId === 'user-1' ? 7 : 0),
    }, calls);
    expect(await service.getUnreadCount('user-1')).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// F05 — single-recipient fan-out creators (follow / like / comment).
//
// Mirrors `createMentionNotifications` but targets ONE recipient (the followed
// user / recipe author) and gates on a single `notify*` preference that, when
// false, skips BOTH the DB record and the email. Missing prefs (`null`) counts
// as opted-in. Per-call failures are isolated: a thrown `create` is logged and
// execution continues to the email (independent try/catch), and vice-versa.
// ---------------------------------------------------------------------------

describe('createFollowNotification', () => {
  function followerParams(
    overrides: Partial<Parameters<typeof service.createFollowNotification>[0]> = {},
  ) {
    return {
      followerId: 'follower-1',
      followerUsername: 'follower-username',
      followingId: 'target-1',
      ...overrides,
    };
  }

  it('skips record and email when notifyNewFollower preference is false', async () => {
    deps.model = makeModel({
      findNotifyTarget: (userId: string) => {
        calls.findNotifyTarget.push(userId);
        return Promise.resolve(
          makeNotifyTarget({ prefs: { ...ALL_NOTIFY_PREFS_TRUE, notifyNewFollower: false } }),
        );
      },
    }, calls);
    await service.createFollowNotification(followerParams());
    expect(calls.findNotifyTarget).toEqual(['target-1']);
    expect(calls.create).toEqual([]);
    expect(calls.notifyNewFollower).toEqual([]);
  });

  it('treats missing preferences row (prefs null) as opted in', async () => {
    deps.model = makeModel({
      findNotifyTarget: () => Promise.resolve(makeNotifyTarget({ prefs: null })),
    }, calls);
    await service.createFollowNotification(followerParams());
    expect(calls.create.length).toBe(1);
    expect(calls.notifyNewFollower.length).toBe(1);
  });

  it('skips self-follow (no record, no email)', async () => {
    deps.model = makeModel({}, calls);
    await service.createFollowNotification(followerParams({
      followerId: 'self-1',
      followingId: 'self-1',
    }));
    expect(calls.findNotifyTarget).toEqual([]);
    expect(calls.create).toEqual([]);
    expect(calls.notifyNewFollower).toEqual([]);
  });

  it('target not found returns early without record or email', async () => {
    deps.model = makeModel({ findNotifyTarget: () => Promise.resolve(null as never) }, calls);
    await service.createFollowNotification(followerParams());
    expect(calls.create).toEqual([]);
    expect(calls.notifyNewFollower).toEqual([]);
  });

  it('creates record and sends email when opted in', async () => {
    deps.model = makeModel({}, calls);
    await service.createFollowNotification(followerParams());
    expect(calls.findNotifyTarget).toEqual(['target-1']);
    expect(calls.create.length).toBe(1);
    expect(calls.create[0]).toEqual({
      userId: 'target-1',
      type: 'follow',
      actorId: 'follower-1',
      referenceId: null,
      referenceType: 'actor',
      metadata: JSON.stringify({ followerUsername: 'follower-username' }),
    });
    expect(calls.notifyNewFollower).toEqual([{
      followingId: 'target-1',
      followerUsername: 'follower-username',
    }]);
  });

  it('creates record but logs error if email send throws', async () => {
    deps.model = makeModel({}, calls);
    deps.notifyNewFollower = (params) => {
      calls.notifyNewFollower.push(params);
      return Promise.reject(new Error('smtp down'));
    };
    await service.createFollowNotification(followerParams());
    expect(calls.create.length).toBe(1);
    expect(calls.notifyNewFollower.length).toBe(1);
  });

  it('logs error but does not throw if model.create throws (email still fires)', async () => {
    deps.model = makeModel(
      {
        create: (data) => {
          calls.create.push(data);
          return Promise.reject(new Error('db down'));
        },
      },
      calls,
    );
    await service.createFollowNotification(followerParams());
    expect(calls.create.length).toBe(1);
    // Independent try/catch: the email fires even after the record insert failed.
    expect(calls.notifyNewFollower.length).toBe(1);
  });
});

describe('createLikeNotification', () => {
  function likeParams(
    overrides: Partial<Parameters<typeof service.createLikeNotification>[0]> = {},
  ) {
    return {
      likerId: 'liker-1',
      likerUsername: 'liker-username',
      recipeAuthorId: 'target-1',
      recipeId: 'recipe-1',
      recipeSlug: 'slug-1',
      recipeTitle: 'Title 1',
      ...overrides,
    };
  }

  it('skips record and email when notifyRecipeLiked preference is false', async () => {
    deps.model = makeModel({
      findNotifyTarget: (userId: string) => {
        calls.findNotifyTarget.push(userId);
        return Promise.resolve(
          makeNotifyTarget({ prefs: { ...ALL_NOTIFY_PREFS_TRUE, notifyRecipeLiked: false } }),
        );
      },
    }, calls);
    await service.createLikeNotification(likeParams());
    expect(calls.findNotifyTarget).toEqual(['target-1']);
    expect(calls.create).toEqual([]);
    expect(calls.notifyRecipeLiked).toEqual([]);
  });

  it('treats missing preferences row (prefs null) as opted in', async () => {
    deps.model = makeModel({
      findNotifyTarget: () => Promise.resolve(makeNotifyTarget({ prefs: null })),
    }, calls);
    await service.createLikeNotification(likeParams());
    expect(calls.create.length).toBe(1);
    expect(calls.notifyRecipeLiked.length).toBe(1);
  });

  it('skips self-like (no record, no email)', async () => {
    deps.model = makeModel({}, calls);
    await service.createLikeNotification(likeParams({
      likerId: 'self-1',
      recipeAuthorId: 'self-1',
    }));
    expect(calls.findNotifyTarget).toEqual([]);
    expect(calls.create).toEqual([]);
    expect(calls.notifyRecipeLiked).toEqual([]);
  });

  it('target not found returns early without record or email', async () => {
    deps.model = makeModel({ findNotifyTarget: () => Promise.resolve(null as never) }, calls);
    await service.createLikeNotification(likeParams());
    expect(calls.create).toEqual([]);
    expect(calls.notifyRecipeLiked).toEqual([]);
  });

  it('creates record and sends email when opted in', async () => {
    deps.model = makeModel({}, calls);
    await service.createLikeNotification(likeParams());
    expect(calls.findNotifyTarget).toEqual(['target-1']);
    expect(calls.create.length).toBe(1);
    expect(calls.create[0]).toEqual({
      userId: 'target-1',
      type: 'like',
      actorId: 'liker-1',
      referenceId: 'recipe-1',
      referenceType: 'recipe',
      metadata: JSON.stringify({ recipeSlug: 'slug-1', recipeTitle: 'Title 1' }),
    });
    expect(calls.notifyRecipeLiked).toEqual([{
      recipeAuthorId: 'target-1',
      likerUsername: 'liker-username',
      recipeTitle: 'Title 1',
      recipeSlug: 'slug-1',
    }]);
  });

  it('creates record but logs error if email send throws', async () => {
    deps.model = makeModel({}, calls);
    deps.notifyRecipeLiked = (params) => {
      calls.notifyRecipeLiked.push(params);
      return Promise.reject(new Error('smtp down'));
    };
    await service.createLikeNotification(likeParams());
    expect(calls.create.length).toBe(1);
    expect(calls.notifyRecipeLiked.length).toBe(1);
  });

  it('logs error but does not throw if model.create throws (email still fires)', async () => {
    deps.model = makeModel(
      {
        create: (data) => {
          calls.create.push(data);
          return Promise.reject(new Error('db down'));
        },
      },
      calls,
    );
    await service.createLikeNotification(likeParams());
    expect(calls.create.length).toBe(1);
    expect(calls.notifyRecipeLiked.length).toBe(1);
  });
});

describe('createCommentNotification', () => {
  function commentParams(
    overrides: Partial<Parameters<typeof service.createCommentNotification>[0]> = {},
  ) {
    return {
      commenterId: 'commenter-1',
      commenterUsername: 'commenter-username',
      recipeAuthorId: 'target-1',
      recipeId: 'recipe-1',
      recipeSlug: 'slug-1',
      recipeTitle: 'Title 1',
      commentId: 'comment-1',
      ...overrides,
    };
  }

  it('skips record and email when notifyRecipeCommented preference is false', async () => {
    deps.model = makeModel({
      findNotifyTarget: (userId: string) => {
        calls.findNotifyTarget.push(userId);
        return Promise.resolve(
          makeNotifyTarget({ prefs: { ...ALL_NOTIFY_PREFS_TRUE, notifyRecipeCommented: false } }),
        );
      },
    }, calls);
    await service.createCommentNotification(commentParams());
    expect(calls.findNotifyTarget).toEqual(['target-1']);
    expect(calls.create).toEqual([]);
    expect(calls.notifyRecipeCommented).toEqual([]);
  });

  it('treats missing preferences row (prefs null) as opted in', async () => {
    deps.model = makeModel({
      findNotifyTarget: () => Promise.resolve(makeNotifyTarget({ prefs: null })),
    }, calls);
    await service.createCommentNotification(commentParams());
    expect(calls.create.length).toBe(1);
    expect(calls.notifyRecipeCommented.length).toBe(1);
  });

  it('skips self-comment (no record, no email)', async () => {
    deps.model = makeModel({}, calls);
    await service.createCommentNotification(commentParams({
      commenterId: 'self-1',
      recipeAuthorId: 'self-1',
    }));
    expect(calls.findNotifyTarget).toEqual([]);
    expect(calls.create).toEqual([]);
    expect(calls.notifyRecipeCommented).toEqual([]);
  });

  it('target not found returns early without record or email', async () => {
    deps.model = makeModel({ findNotifyTarget: () => Promise.resolve(null as never) }, calls);
    await service.createCommentNotification(commentParams());
    expect(calls.create).toEqual([]);
    expect(calls.notifyRecipeCommented).toEqual([]);
  });

  it('creates record and sends email when opted in', async () => {
    deps.model = makeModel({}, calls);
    await service.createCommentNotification(commentParams());
    expect(calls.findNotifyTarget).toEqual(['target-1']);
    expect(calls.create.length).toBe(1);
    expect(calls.create[0]).toEqual({
      userId: 'target-1',
      type: 'comment',
      actorId: 'commenter-1',
      referenceId: 'comment-1',
      referenceType: 'comment',
      metadata: JSON.stringify({ recipeSlug: 'slug-1', recipeTitle: 'Title 1' }),
    });
    expect(calls.notifyRecipeCommented).toEqual([{
      recipeAuthorId: 'target-1',
      commenterUsername: 'commenter-username',
      recipeTitle: 'Title 1',
      recipeSlug: 'slug-1',
    }]);
  });

  it('creates record but logs error if email send throws', async () => {
    deps.model = makeModel({}, calls);
    deps.notifyRecipeCommented = (params) => {
      calls.notifyRecipeCommented.push(params);
      return Promise.reject(new Error('smtp down'));
    };
    await service.createCommentNotification(commentParams());
    expect(calls.create.length).toBe(1);
    expect(calls.notifyRecipeCommented.length).toBe(1);
  });

  it('logs error but does not throw if model.create throws (email still fires)', async () => {
    deps.model = makeModel(
      {
        create: (data) => {
          calls.create.push(data);
          return Promise.reject(new Error('db down'));
        },
      },
      calls,
    );
    await service.createCommentNotification(commentParams());
    expect(calls.create.length).toBe(1);
    expect(calls.notifyRecipeCommented.length).toBe(1);
  });
});
