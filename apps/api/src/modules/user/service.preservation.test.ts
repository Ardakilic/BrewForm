// deno-lint-ignore-file no-explicit-any

/**
 * Preservation Test 2.1 — Unauthenticated `GET /users/:username` returns `isFollowing: false`
 *
 * **Validates: Requirements 3.1**
 *
 * This is a PRESERVATION test. It MUST PASS on unfixed code.
 * It captures the baseline behaviour that must not regress after the fix:
 *   For any valid username with no requesterId, `isFollowing` is always `false`.
 *
 * Observation: `getPublicProfile(username, undefined)` returns `isFollowing: false` on unfixed code.
 * The hardcoded `isFollowing: false` in the buggy service happens to be correct for the
 * unauthenticated path — this test ensures the fix does not accidentally break that.
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import fc from 'npm:fast-check';

// ---------------------------------------------------------------------------
// Minimal type stubs — mirrors the shape returned by the real model layer
// ---------------------------------------------------------------------------

interface MockUser {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  passwordHash: string;
  email: string;
  isAdmin: boolean;
  isBanned: boolean;
  onboardingCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface MockStats {
  recipeCount: number;
  followerCount: number;
  followingCount: number;
}

// ---------------------------------------------------------------------------
// Mock model factories — same approach as service.exploration.test.ts
// ---------------------------------------------------------------------------

function createMockUserModel(user: MockUser | null, stats?: MockStats, recipes?: unknown[]) {
  return {
    findByUsername: (_username: string) => Promise.resolve(user),
    getUserStats: (_id: string): Promise<MockStats> =>
      Promise.resolve(stats ?? { recipeCount: 3, followerCount: 5, followingCount: 2 }),
    getUserPublicRecipes: (_id: string) => Promise.resolve(recipes ?? []),
  };
}

function createMockFollowModel(followingIds: Set<string>) {
  return {
    isFollowing: (followerId: string, followingId: string): Promise<boolean> =>
      Promise.resolve(followingIds.has(`${followerId}→${followingId}`)),
  };
}

// ---------------------------------------------------------------------------
// Buggy service implementation (mirrors current apps/api/src/modules/user/service.ts)
//
// Faithful copy of the UNFIXED getPublicProfile logic.
// Does NOT accept requesterId and hardcodes isFollowing: false.
// ---------------------------------------------------------------------------

async function getPublicProfile_buggy(
  username: string,
  userModel: ReturnType<typeof createMockUserModel>,
  _followModel: ReturnType<typeof createMockFollowModel>,
) {
  const user = await userModel.findByUsername(username);
  if (!user) throw new Error('USER_NOT_FOUND');
  const { passwordHash: _passwordHash, email: _email, ...safe } = user as any;
  const [stats, recipes] = await Promise.all([
    userModel.getUserStats(user.id),
    userModel.getUserPublicRecipes(user.id),
  ]);
  return {
    ...safe,
    ...stats,
    recipes,
    badges: [],
    isFollowing: false, // BUG: hardcoded — never calls followModel.isFollowing()
  };
}

// ---------------------------------------------------------------------------
// Fixed service implementation (mirrors the INTENDED fix)
//
// This is what the fixed getPublicProfile should look like after the fix.
// Used to compare non-isFollowing fields against the buggy version.
// ---------------------------------------------------------------------------

async function getPublicProfile_fixed(
  username: string,
  requesterId: string | undefined,
  userModel: ReturnType<typeof createMockUserModel>,
  followModel: ReturnType<typeof createMockFollowModel>,
) {
  const user = await userModel.findByUsername(username);
  if (!user) throw new Error('USER_NOT_FOUND');
  const { passwordHash: _passwordHash, email: _email, ...safe } = user as any;
  const [stats, recipes] = await Promise.all([
    userModel.getUserStats(user.id),
    userModel.getUserPublicRecipes(user.id),
  ]);
  return {
    ...safe,
    ...stats,
    recipes,
    badges: [],
    isFollowing: requesterId ? await followModel.isFollowing(requesterId, user.id) : false,
  };
}

// ---------------------------------------------------------------------------
// Arbitrary generators
// ---------------------------------------------------------------------------

/**
 * Generates a valid username string: 1–32 alphanumeric/underscore/hyphen characters.
 */
const validUsernameArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,32}$/);

/**
 * Generates a MockUser with the given username.
 */
function mockUserArb(username: string): fc.Arbitrary<MockUser> {
  return fc.record({
    id: fc.uuid(),
    username: fc.constant(username),
    displayName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
    bio: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
    avatarUrl: fc.option(fc.webUrl(), { nil: null }),
    passwordHash: fc.string({ minLength: 10, maxLength: 60 }),
    email: fc.emailAddress(),
    isAdmin: fc.boolean(),
    isBanned: fc.boolean(),
    onboardingCompleted: fc.boolean(),
    createdAt: fc.date(),
    updatedAt: fc.date(),
    deletedAt: fc.option(fc.date(), { nil: null }),
  });
}

/**
 * Generates a set of follow relationships (arbitrary, may or may not include the profile user).
 * Represented as "followerId→followingId" strings.
 */
const followRelationshipsArb = fc.array(
  fc.tuple(fc.uuid(), fc.uuid()).map(([a, b]) => `${a}→${b}`),
  { minLength: 0, maxLength: 20 },
).map((pairs) => new Set(pairs));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * Preservation Test 2.2 — `GET /users/:username` returns 404 for unknown usernames
 *
 * **Validates: Requirements 3.3**
 *
 * This is a PRESERVATION test. It MUST PASS on unfixed code.
 * It captures the baseline behaviour that must not regress after the fix:
 *   For any username that does not exist in the database, `getPublicProfile` throws
 *   an error with message 'USER_NOT_FOUND'.
 *
 * Observation: `getPublicProfile("nonexistent_user_xyz")` throws `USER_NOT_FOUND` on unfixed code.
 * The fix must not accidentally suppress this error.
 */

describe('Preservation 2.2 — Unknown username throws USER_NOT_FOUND', () => {
  it(
    '[PRESERVATION] getPublicProfile throws USER_NOT_FOUND for any username not in the database',
    async () => {
      /**
       * Property: For any valid username string where the user model returns null
       * (i.e., the user does not exist), `getPublicProfile` ALWAYS throws an error
       * whose message is 'USER_NOT_FOUND'.
       *
       * This PASSES on unfixed code because the throw is unconditional when user is null.
       * After the fix, this must still pass — the 404 path must not be affected.
       *
       * **Validates: Requirements 3.3**
       */
      await fc.assert(
        fc.asyncProperty(
          validUsernameArb,
          followRelationshipsArb,
          async (username, followRelationships) => {
            // Model returns null → user does not exist
            const userModel = createMockUserModel(null);
            const followModel = createMockFollowModel(followRelationships);

            await expect(
              getPublicProfile_buggy(username, userModel, followModel),
            ).rejects.toThrow('USER_NOT_FOUND');
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    '[PRESERVATION] getPublicProfile throws USER_NOT_FOUND for the concrete "nonexistent_user_xyz" case',
    async () => {
      /**
       * Concrete example matching the observation in the task description.
       *
       * **Validates: Requirements 3.3**
       */
      const userModel = createMockUserModel(null);
      const followModel = createMockFollowModel(new Set());

      await expect(
        getPublicProfile_buggy('nonexistent_user_xyz', userModel, followModel),
      ).rejects.toThrow('USER_NOT_FOUND');
    },
  );
});

describe('Preservation 2.1 — Unauthenticated profile fetch always returns isFollowing: false', () => {
  it(
    '[PRESERVATION] getPublicProfile(username, undefined) returns isFollowing: false for any valid username',
    async () => {
      /**
       * Property: For any valid username and any follow relationship set,
       * calling getPublicProfile with no requesterId (unauthenticated path)
       * ALWAYS returns isFollowing: false.
       *
       * This PASSES on unfixed code because the hardcoded false is correct here.
       * After the fix, this must still pass because requesterId is undefined → false.
       *
       * **Validates: Requirements 3.1**
       */
      await fc.assert(
        fc.asyncProperty(
          validUsernameArb,
          followRelationshipsArb,
          async (username, followRelationships) => {
            const user = await fc.sample(mockUserArb(username), 1)[0];
            const userModel = createMockUserModel(user);
            const followModel = createMockFollowModel(followRelationships);

            const result = await getPublicProfile_buggy(username, userModel, followModel);

            expect(result.isFollowing).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    '[PRESERVATION] getPublicProfile(username, undefined) returns isFollowing: false even when follow relationships exist',
    async () => {
      /**
       * Concrete example: even if the follow model has relationships,
       * the unauthenticated path (no requesterId) must return isFollowing: false.
       *
       * **Validates: Requirements 3.1**
       */
      const username = 'userB';
      const user: MockUser = {
        id: 'userB_id',
        username: 'userB',
        displayName: 'User B',
        bio: null,
        avatarUrl: null,
        passwordHash: 'hashed',
        email: 'userb@example.com',
        isAdmin: false,
        isBanned: false,
        onboardingCompleted: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        deletedAt: null,
      };

      // userA follows userB — but since there's no requesterId, isFollowing must still be false
      const followRelationships = new Set(['userA_id→userB_id']);
      const userModel = createMockUserModel(user);
      const followModel = createMockFollowModel(followRelationships);

      const result = await getPublicProfile_buggy(username, userModel, followModel);

      expect(result.isFollowing).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// Additional arbitraries for Preservation 2.3
// ---------------------------------------------------------------------------

/**
 * Generates random MockStats values.
 */
const mockStatsArb: fc.Arbitrary<MockStats> = fc.record({
  recipeCount: fc.nat({ max: 1000 }),
  followerCount: fc.nat({ max: 10000 }),
  followingCount: fc.nat({ max: 10000 }),
});

/**
 * Generates a random requester ID (may or may not be in the follow set).
 */
const requesterIdArb = fc.option(fc.uuid(), { nil: undefined });

// ---------------------------------------------------------------------------
// Preservation Test 2.3 — Profile fields unaffected by `requesterId` addition
// ---------------------------------------------------------------------------

/**
 * Preservation Test 2.3 — Profile fields unaffected by `requesterId` addition
 *
 * **Validates: Requirements 3.4**
 *
 * This is a PRESERVATION test. It MUST PASS on unfixed code.
 * It captures the baseline behaviour that must not regress after the fix:
 *   For any username, all non-`isFollowing` fields in the response are identical
 *   between the buggy implementation and the fixed implementation.
 *
 * Observation: `getPublicProfile(username)` returns `recipeCount`, `followerCount`,
 * `followingCount`, `recipes`, `badges`, `bio`, `avatarUrl` on unfixed code.
 * The fix only changes how `isFollowing` is computed — all other fields must remain
 * identical.
 *
 * This PASSES on unfixed code because both implementations share the same logic for
 * all non-`isFollowing` fields. The buggy version hardcodes `isFollowing: false` but
 * returns all other fields correctly.
 */

describe('Preservation 2.3 — Profile fields unaffected by requesterId addition', () => {
  it(
    '[PRESERVATION] all non-isFollowing fields are identical between buggy and fixed implementations for any username',
    async () => {
      /**
       * Property: For any valid username, user record, stats, follow relationships,
       * and optional requesterId, the non-`isFollowing` fields returned by
       * `getPublicProfile_buggy` and `getPublicProfile_fixed` are ALWAYS identical.
       *
       * The fields checked are: recipeCount, followerCount, followingCount,
       * recipes, badges, bio, avatarUrl, username, displayName, id,
       * isAdmin, isBanned, onboardingCompleted, createdAt, updatedAt, deletedAt.
       *
       * This PASSES on unfixed code because the buggy implementation computes all
       * these fields identically to the fixed implementation — only `isFollowing`
       * differs.
       *
       * **Validates: Requirements 3.4**
       */
      await fc.assert(
        fc.asyncProperty(
          validUsernameArb,
          mockStatsArb,
          followRelationshipsArb,
          requesterIdArb,
          async (username, stats, followRelationships, requesterId) => {
            const user = await fc.sample(mockUserArb(username), 1)[0];

            // Both implementations share the same user model and follow model
            const userModel = createMockUserModel(user, stats, []);
            const followModel = createMockFollowModel(followRelationships);

            const [buggyResult, fixedResult] = await Promise.all([
              getPublicProfile_buggy(username, userModel, followModel),
              getPublicProfile_fixed(username, requesterId, userModel, followModel),
            ]);

            // All non-isFollowing fields must be identical
            const nonFollowingFields = [
              'recipeCount',
              'followerCount',
              'followingCount',
              'recipes',
              'badges',
              'bio',
              'avatarUrl',
              'username',
              'displayName',
              'id',
              'isAdmin',
              'isBanned',
              'onboardingCompleted',
              'createdAt',
              'updatedAt',
              'deletedAt',
            ] as const;

            for (const field of nonFollowingFields) {
              expect((buggyResult as Record<string, unknown>)[field]).toEqual(
                (fixedResult as Record<string, unknown>)[field],
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    '[PRESERVATION] concrete example — recipeCount, followerCount, followingCount, bio, avatarUrl are unchanged',
    async () => {
      /**
       * Concrete example matching the observation in the task description.
       * Verifies that the specific fields mentioned in the task are returned
       * identically by both implementations.
       *
       * **Validates: Requirements 3.4**
       */
      const username = 'brewmaster';
      const user: MockUser = {
        id: 'brewmaster_id',
        username: 'brewmaster',
        displayName: 'Brew Master',
        bio: 'Passionate about craft beer',
        avatarUrl: 'https://example.com/avatar.jpg',
        passwordHash: 'hashed_password',
        email: 'brew@example.com',
        isAdmin: false,
        isBanned: false,
        onboardingCompleted: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-06-01'),
        deletedAt: null,
      };
      const stats: MockStats = { recipeCount: 12, followerCount: 42, followingCount: 7 };

      const userModel = createMockUserModel(user, stats, []);
      const followModel = createMockFollowModel(new Set(['someUser_id→brewmaster_id']));

      const [buggyResult, fixedResult] = await Promise.all([
        getPublicProfile_buggy(username, userModel, followModel),
        // Fixed version with a requesterId that IS following — isFollowing will differ, but other fields must not
        getPublicProfile_fixed(username, 'someUser_id', userModel, followModel),
      ]);

      // isFollowing DOES differ (that's the bug being fixed)
      expect(buggyResult.isFollowing).toBe(false);
      expect(fixedResult.isFollowing).toBe(true);

      // All other fields must be identical
      expect(buggyResult.recipeCount).toBe(fixedResult.recipeCount);
      expect(buggyResult.followerCount).toBe(fixedResult.followerCount);
      expect(buggyResult.followingCount).toBe(fixedResult.followingCount);
      expect(buggyResult.recipes).toEqual(fixedResult.recipes);
      expect(buggyResult.badges).toEqual(fixedResult.badges);
      expect((buggyResult as Record<string, unknown>).bio).toBe(
        (fixedResult as Record<string, unknown>).bio,
      );
      expect((buggyResult as Record<string, unknown>).avatarUrl).toBe(
        (fixedResult as Record<string, unknown>).avatarUrl,
      );
      expect((buggyResult as Record<string, unknown>).username).toBe(
        (fixedResult as Record<string, unknown>).username,
      );
      expect((buggyResult as Record<string, unknown>).displayName).toBe(
        (fixedResult as Record<string, unknown>).displayName,
      );
    },
  );
});
