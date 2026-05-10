/**
 * Bug 3 Exploration Test — `FollowList` renders empty bars
 *
 * **Validates: Requirements 1.3, 2.4**
 *
 * This test exercises the bug condition:
 *   isBugCondition_3(item): item.username is undefined AND item.displayName is undefined
 *                           AND item.follower/following is NOT undefined
 *
 * EXPECTED OUTCOME ON UNFIXED CODE: FAIL
 *   The current `FollowList` in `UserProfilePage.tsx` reads `u.username` and `u.displayName`
 *   directly from the top-level follow record. The API returns user data nested under
 *   `u.follower` (for followers) or `u.following` (for following). The top-level fields are
 *   `undefined`, so the rendered name text is always empty.
 *
 * Counterexample documented:
 *   - `u.username` is `undefined` at the top level of a follow record
 *   - `u.displayName` is `undefined` at the top level of a follow record
 *   - The rendered name text (`u.displayName || u.username`) evaluates to `undefined || undefined`
 *     which is `undefined` — an empty bar is shown instead of the user's name
 *
 * Testing approach:
 *   Since this is a Deno environment without a DOM renderer, the name-extraction logic is
 *   extracted into a pure function that mirrors the UNFIXED and FIXED FollowList render logic.
 *   This lets us test the data transformation directly without React/DOM.
 *
 *   UNFIXED logic (current code):
 *     displayText = u.displayName || u.username   // both undefined → empty
 *     handleText  = u.username                    // undefined → empty
 *
 *   FIXED logic (after fix):
 *     person = 'follower' in u ? u.follower : u.following
 *     displayText = person.displayName || person.username
 *     handleText  = person.username
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

// ---------------------------------------------------------------------------
// Types — mirrors the actual API response shapes
// ---------------------------------------------------------------------------

/** The actual shape returned by the followers API endpoint */
interface FollowerRecord {
  id: string;
  followerId: string;
  follower: {
    id: string;
    username: string;
    displayName: string | null;
  };
}

/** The actual shape returned by the following API endpoint */
interface FollowingRecord {
  id: string;
  followingId: string;
  following: {
    id: string;
    username: string;
    displayName: string | null;
  };
}

type FollowRecord = FollowerRecord | FollowingRecord;

/** The flat shape that FollowList INCORRECTLY assumes the API returns */
interface FlatFollowRecord {
  id: string;
  username: string | undefined;
  displayName: string | null | undefined;
}

// ---------------------------------------------------------------------------
// BUGGY name extraction — faithful copy of the UNFIXED FollowList render logic
//
// Mirrors the current render in UserProfilePage.tsx:
//   <span>{u.displayName || u.username}</span>
//   <span>@{u.username}</span>
//
// The bug: `u` is a FollowRecord (nested shape), but the code treats it as a
// flat user object. `u.username` and `u.displayName` are both `undefined`.
// ---------------------------------------------------------------------------

interface RenderedEntry {
  displayText: string | undefined;
  handleText: string | undefined;
}

function extractName_buggy(u: FollowRecord): RenderedEntry {
  // BUG: reads from top-level record — both fields are undefined for nested API shape
  const flat = u as unknown as FlatFollowRecord;
  return {
    displayText: flat.displayName || flat.username,
    handleText: flat.username,
  };
}

// ---------------------------------------------------------------------------
// FIXED name extraction — mirrors the INTENDED fix
//
// After the fix, FollowList will:
//   const person = 'follower' in u ? u.follower : u.following;
//   <span>{person.displayName || person.username}</span>
//   <span>@{person.username}</span>
// ---------------------------------------------------------------------------

function extractName_fixed(u: FollowRecord): RenderedEntry {
  const person = 'follower' in u ? u.follower : u.following;
  return {
    displayText: person.displayName || person.username,
    handleText: person.username,
  };
}

// ---------------------------------------------------------------------------
// Test data — shaped exactly as the API returns
// ---------------------------------------------------------------------------

/** Followers API response: user data nested under `follower` key */
const followerRecord: FollowerRecord = {
  id: 'f1',
  followerId: 'u2',
  follower: {
    id: 'u2',
    username: 'alice',
    displayName: 'Alice',
  },
};

/** Following API response: user data nested under `following` key */
const followingRecord: FollowingRecord = {
  id: 'f2',
  followingId: 'u3',
  following: {
    id: 'u3',
    username: 'bob',
    displayName: null, // null displayName → should fall back to username
  },
};

/** Following record where displayName is an empty string → should fall back to username */
const followingRecordEmptyDisplayName: FollowingRecord = {
  id: 'f3',
  followingId: 'u4',
  following: {
    id: 'u4',
    username: 'carol',
    displayName: '',
  },
};

/** Follower record where displayName is present and non-empty */
const followerRecordWithDisplayName: FollowerRecord = {
  id: 'f4',
  followerId: 'u5',
  follower: {
    id: 'u5',
    username: 'dave',
    displayName: 'Dave Smith',
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bug 3 Exploration — FollowList renders empty bars', () => {
  describe('BUGGY name extraction (unfixed code)', () => {
    it(
      '[EXPECTED TO FAIL] follower record: displayText should be "Alice" (non-empty)',
      () => {
        // Bug condition: API returns nested shape; unfixed code reads top-level fields
        // On unfixed code this FAILS because u.displayName and u.username are both undefined.
        //
        // Counterexample: u.username is undefined; rendered name text is empty (undefined).
        const result = extractName_buggy(followerRecord);

        // This assertion FAILS on unfixed code:
        // result.displayText is undefined (not "Alice") because u.displayName is undefined at top level
        expect(result.displayText).toBe('Alice');
      },
    );

    it(
      '[EXPECTED TO FAIL] follower record: handleText should be "@alice" (non-empty)',
      () => {
        // Bug condition: u.username is undefined at top level
        // On unfixed code this FAILS because u.username is undefined.
        const result = extractName_buggy(followerRecord);

        // This assertion FAILS on unfixed code:
        // result.handleText is undefined (not "alice")
        expect(result.handleText).toBe('alice');
      },
    );

    it(
      '[EXPECTED TO FAIL] following record with null displayName: displayText should be "bob" (non-empty)',
      () => {
        // Bug condition: following record; u.username is undefined at top level
        // On unfixed code this FAILS because u.username is undefined.
        //
        // Counterexample: u.username is undefined; rendered name text is empty (undefined).
        const result = extractName_buggy(followingRecord);

        // This assertion FAILS on unfixed code:
        // result.displayText is undefined (not "bob")
        expect(result.displayText).toBe('bob');
      },
    );

    it(
      '[EXPECTED TO FAIL] following record with null displayName: handleText should be "@bob" (non-empty)',
      () => {
        // Bug condition: u.username is undefined at top level
        const result = extractName_buggy(followingRecord);

        // This assertion FAILS on unfixed code:
        // result.handleText is undefined (not "bob")
        expect(result.handleText).toBe('bob');
      },
    );

    it(
      '[EXPECTED TO FAIL] displayText and handleText must both be non-empty strings for any follow record',
      () => {
        // Verify the bug manifests for all test records
        const records: FollowRecord[] = [
          followerRecord,
          followingRecord,
          followingRecordEmptyDisplayName,
          followerRecordWithDisplayName,
        ];

        for (const record of records) {
          const result = extractName_buggy(record);

          // Both assertions FAIL on unfixed code — all values are undefined
          expect(result.displayText).toBeTruthy();
          expect(result.handleText).toBeTruthy();
        }
      },
    );
  });

  describe('FIXED name extraction (documents expected correct behaviour)', () => {
    it(
      'follower record: displayText is "Alice" (non-empty displayName used)',
      () => {
        // Requirement 2.4.2: non-null, non-empty displayName → use displayName
        const result = extractName_fixed(followerRecord);

        expect(result.displayText).toBe('Alice');
        expect(result.handleText).toBe('alice');
      },
    );

    it(
      'following record with null displayName: displayText falls back to "bob" — Requirement 2.4.3',
      () => {
        // Requirement 2.4.3: null displayName → fall back to username
        const result = extractName_fixed(followingRecord);

        expect(result.displayText).toBe('bob');
        expect(result.handleText).toBe('bob');
      },
    );

    it(
      'following record with empty displayName: displayText falls back to "carol" — Requirement 2.4.3',
      () => {
        // Requirement 2.4.3: empty string displayName → fall back to username
        const result = extractName_fixed(followingRecordEmptyDisplayName);

        expect(result.displayText).toBe('carol');
        expect(result.handleText).toBe('carol');
      },
    );

    it(
      'follower record with displayName "Dave Smith": displayText is "Dave Smith" — Requirement 2.4.2',
      () => {
        // Requirement 2.4.2: non-null, non-empty displayName → use displayName as sole name text
        const result = extractName_fixed(followerRecordWithDisplayName);

        expect(result.displayText).toBe('Dave Smith');
        expect(result.handleText).toBe('dave');
      },
    );

    it(
      'all follow records produce non-empty displayText and handleText — Requirement 2.4, 2.4.1',
      () => {
        // Requirement 2.4: followers tab renders non-empty name for each entry
        // Requirement 2.4.1: following tab renders non-empty name for each entry
        const records: FollowRecord[] = [
          followerRecord,
          followingRecord,
          followingRecordEmptyDisplayName,
          followerRecordWithDisplayName,
        ];

        for (const record of records) {
          const result = extractName_fixed(record);

          expect(result.displayText).toBeTruthy();
          expect(result.handleText).toBeTruthy();
        }
      },
    );

    it(
      'follower record: @username handle is rendered separately — Requirement 2.4.4',
      () => {
        // Requirement 2.4.4: @username handle rendered as separate text element
        const result = extractName_fixed(followerRecord);

        // handleText is the raw username (the @ prefix is added in JSX: @{person.username})
        expect(result.handleText).toBe('alice');
        // displayText is the name (separate from the handle)
        expect(result.displayText).toBe('Alice');
        // They are different — name and handle are separate
        expect(result.displayText).not.toBe(result.handleText);
      },
    );

    it(
      'following record with null displayName: @username handle equals displayText — Requirement 2.4.3, 2.4.4',
      () => {
        // When displayName is null, displayText falls back to username.
        // The handle (@username) is the same value as displayText in this case.
        const result = extractName_fixed(followingRecord);

        expect(result.handleText).toBe('bob');
        expect(result.displayText).toBe('bob');
      },
    );
  });
});
