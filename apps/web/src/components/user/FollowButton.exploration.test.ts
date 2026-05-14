/**
 * Bug 2 Exploration Test — `FollowButton` silently swallows errors
 *
 * **Validates: Requirements 1.2, 2.3**
 *
 * This test exercises the bug condition:
 *   isBugCondition_2(apiCall): apiCall rejects AND catch block is empty AND user receives no feedback
 *
 * EXPECTED OUTCOME ON UNFIXED CODE: FAIL
 *   The current `FollowButton.tsx` has an empty `catch {}` block. When the API call rejects
 *   (e.g., 409 CONFLICT), no error state is set and no error message is rendered.
 *
 * Counterexample documented:
 *   Clicking Follow with a mocked 409 response produces no error feedback;
 *   `error` state is never set — it remains `null` after the rejected call.
 *
 * Testing approach:
 *   Since this is a Deno environment without a DOM renderer, the toggle logic is extracted
 *   into a pure state-machine function that mirrors the UNFIXED and FIXED FollowButton
 *   implementations. This lets us test the state transitions directly without React/DOM.
 */

import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

// ---------------------------------------------------------------------------
// State machine types — mirrors the React state in FollowButton
// ---------------------------------------------------------------------------

interface FollowButtonState {
  following: boolean;
  loading: boolean;
  error: string | null;
}

interface MockApiClient {
  post: (endpoint: string, body: unknown) => Promise<unknown>;
  delete: (endpoint: string) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// BUGGY toggle implementation — faithful copy of the UNFIXED FollowButton logic
//
// Mirrors the current `toggle()` function in FollowButton.tsx:
//   - empty catch block: errors are silently discarded
//   - no error state exists
// ---------------------------------------------------------------------------

async function toggle_buggy(
  state: FollowButtonState,
  userId: string,
  api: MockApiClient,
): Promise<FollowButtonState> {
  if (state.loading) return state;

  const next: FollowButtonState = { ...state, loading: true };

  try {
    if (next.following) {
      await api.delete(`/follow/${userId}`);
    } else {
      await api.post(`/follow/${userId}`, {});
    }
    // Success: toggle the following state
    return { ...next, following: !next.following, loading: false };
  } catch {
    // BUG: empty catch block — error is silently discarded, no error state set
  } finally {
    // In the real component, setLoading(false) runs in finally
  }

  // After the empty catch, loading is still true in the intermediate state.
  // The finally block in the real component sets loading: false.
  // We replicate that here.
  return { ...next, loading: false };
}

// ---------------------------------------------------------------------------
// FIXED toggle implementation — mirrors the INTENDED fix
//
// This is what the fixed toggle() should look like after the fix:
//   - catch block sets error state
//   - error is cleared at the start of each toggle call
//   - following state is NOT toggled on failure
// ---------------------------------------------------------------------------

async function toggle_fixed(
  state: FollowButtonState,
  userId: string,
  api: MockApiClient,
): Promise<FollowButtonState> {
  if (state.loading) return state;

  // Clear any previous error at the start of each toggle
  const next: FollowButtonState = { ...state, loading: true, error: null };

  try {
    if (next.following) {
      await api.delete(`/follow/${userId}`);
    } else {
      await api.post(`/follow/${userId}`, {});
    }
    // Success: toggle the following state, no error
    return { ...next, following: !next.following, loading: false, error: null };
  } catch (err) {
    // FIX: populate error state with a user-visible message
    const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
    return { ...next, loading: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Mock API factories
// ---------------------------------------------------------------------------

/** Creates a mock API client that always rejects with a given error */
function createRejectingApiClient(error: Error): MockApiClient {
  return {
    post: (_endpoint: string, _body: unknown) => Promise.reject(error),
    delete: (_endpoint: string) => Promise.reject(error),
  };
}

/** Creates a mock API client that always resolves successfully */
function createSucceedingApiClient(): MockApiClient {
  return {
    post: (_endpoint: string, _body: unknown) => Promise.resolve({ success: true }),
    delete: (_endpoint: string) => Promise.resolve({ success: true }),
  };
}

// ---------------------------------------------------------------------------
// Simulated API errors
// ---------------------------------------------------------------------------

class ApiError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const conflict409 = new ApiError('CONFLICT', 'Already following this user', 409);
const notFound404 = new ApiError('NOT_FOUND', 'Follow relationship not found', 404);
const networkError = new Error('Network request failed');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bug 2 Exploration — FollowButton silently swallows errors', () => {
  describe('BUGGY toggle (unfixed code)', () => {
    it(
      '[EXPECTED TO FAIL] clicking Follow with a 409 response should set a non-null error state',
      async () => {
        // Bug condition: API rejects with 409 CONFLICT (e.g., already following)
        // On unfixed code this FAILS because catch {} is empty and error state is never set.
        const initialState: FollowButtonState = {
          following: false,
          loading: false,
          error: null,
        };
        const api = createRejectingApiClient(conflict409);

        const resultState = await toggle_buggy(initialState, 'user-xyz', api);

        // This assertion FAILS on unfixed code:
        // resultState.error is null (never set) but we expect a non-null error message.
        expect(resultState.error).not.toBeNull();
      },
    );

    it(
      '[EXPECTED TO FAIL] clicking Unfollow with a 404 response should set a non-null error state',
      async () => {
        // Bug condition: API rejects with 404 NOT_FOUND during unfollow
        const initialState: FollowButtonState = {
          following: true,
          loading: false,
          error: null,
        };
        const api = createRejectingApiClient(notFound404);

        const resultState = await toggle_buggy(initialState, 'user-xyz', api);

        // This assertion FAILS on unfixed code:
        // resultState.error is null (never set) but we expect a non-null error message.
        expect(resultState.error).not.toBeNull();
      },
    );

    it(
      '[EXPECTED TO FAIL] clicking Follow with a network error should set a non-null error state',
      async () => {
        // Bug condition: API rejects with a network error
        const initialState: FollowButtonState = {
          following: false,
          loading: false,
          error: null,
        };
        const api = createRejectingApiClient(networkError);

        const resultState = await toggle_buggy(initialState, 'user-xyz', api);

        // This assertion FAILS on unfixed code:
        // resultState.error is null (never set) but we expect a non-null error message.
        expect(resultState.error).not.toBeNull();
      },
    );

    it(
      '[EXPECTED TO FAIL] after a 409 error, the following state should remain unchanged (false)',
      async () => {
        // Bug condition: on error, the following state must NOT be toggled.
        // On unfixed code, the setFollowing(!following) is inside try{} so it won't run on error —
        // this part actually works correctly. But the error state is still not set.
        // We include this to document the full expected post-error state.
        const initialState: FollowButtonState = {
          following: false,
          loading: false,
          error: null,
        };
        const api = createRejectingApiClient(conflict409);

        const resultState = await toggle_buggy(initialState, 'user-xyz', api);

        // following should remain false (not toggled on error) — this PASSES on unfixed code
        expect(resultState.following).toBe(false);

        // But error should be non-null — this FAILS on unfixed code
        expect(resultState.error).not.toBeNull();
      },
    );
  });

  describe('FIXED toggle (documents expected correct behaviour)', () => {
    it(
      'clicking Follow with a 409 response sets a non-null error message',
      async () => {
        const initialState: FollowButtonState = {
          following: false,
          loading: false,
          error: null,
        };
        const api = createRejectingApiClient(conflict409);

        const resultState = await toggle_fixed(initialState, 'user-xyz', api);

        expect(resultState.error).not.toBeNull();
        expect(typeof resultState.error).toBe('string');
        expect((resultState.error as string).length).toBeGreaterThan(0);
      },
    );

    it(
      'clicking Unfollow with a 404 response sets a non-null error message',
      async () => {
        const initialState: FollowButtonState = {
          following: true,
          loading: false,
          error: null,
        };
        const api = createRejectingApiClient(notFound404);

        const resultState = await toggle_fixed(initialState, 'user-xyz', api);

        expect(resultState.error).not.toBeNull();
        expect(typeof resultState.error).toBe('string');
      },
    );

    it(
      'clicking Follow with a network error sets a non-null error message',
      async () => {
        const initialState: FollowButtonState = {
          following: false,
          loading: false,
          error: null,
        };
        const api = createRejectingApiClient(networkError);

        const resultState = await toggle_fixed(initialState, 'user-xyz', api);

        expect(resultState.error).not.toBeNull();
      },
    );

    it(
      'after a 409 error, the following state remains unchanged (false) — Requirement 2.3.2',
      async () => {
        const initialState: FollowButtonState = {
          following: false,
          loading: false,
          error: null,
        };
        const api = createRejectingApiClient(conflict409);

        const resultState = await toggle_fixed(initialState, 'user-xyz', api);

        // following must NOT be toggled on error
        expect(resultState.following).toBe(false);
        expect(resultState.error).not.toBeNull();
      },
    );

    it(
      'after an unfollow error, the following state remains unchanged (true) — Requirement 2.3.2',
      async () => {
        const initialState: FollowButtonState = {
          following: true,
          loading: false,
          error: null,
        };
        const api = createRejectingApiClient(notFound404);

        const resultState = await toggle_fixed(initialState, 'user-xyz', api);

        // following must NOT be toggled on error
        expect(resultState.following).toBe(true);
        expect(resultState.error).not.toBeNull();
      },
    );

    it(
      'error is cleared at the start of a retry click — Requirement 2.3.3',
      async () => {
        // First click: fails with 409
        const initialState: FollowButtonState = {
          following: false,
          loading: false,
          error: null,
        };
        const failingApi = createRejectingApiClient(conflict409);
        const stateAfterError = await toggle_fixed(initialState, 'user-xyz', failingApi);
        expect(stateAfterError.error).not.toBeNull();

        // Second click: succeeds — error should be cleared
        const succeedingApi = createSucceedingApiClient();
        const stateAfterSuccess = await toggle_fixed(stateAfterError, 'user-xyz', succeedingApi);
        expect(stateAfterSuccess.error).toBeNull();
        expect(stateAfterSuccess.following).toBe(true);
      },
    );

    it(
      'successful follow call sets no error and toggles following to true — Requirement 3.2 (preservation)',
      async () => {
        const initialState: FollowButtonState = {
          following: false,
          loading: false,
          error: null,
        };
        const api = createSucceedingApiClient();

        const resultState = await toggle_fixed(initialState, 'user-xyz', api);

        expect(resultState.error).toBeNull();
        expect(resultState.following).toBe(true);
        expect(resultState.loading).toBe(false);
      },
    );

    it(
      'successful unfollow call sets no error and toggles following to false — Requirement 3.2 (preservation)',
      async () => {
        const initialState: FollowButtonState = {
          following: true,
          loading: false,
          error: null,
        };
        const api = createSucceedingApiClient();

        const resultState = await toggle_fixed(initialState, 'user-xyz', api);

        expect(resultState.error).toBeNull();
        expect(resultState.following).toBe(false);
        expect(resultState.loading).toBe(false);
      },
    );

    it(
      'duplicate click while loading is ignored — Requirement 3.5 (preservation)',
      async () => {
        // When loading is true, toggle returns the same state unchanged
        const loadingState: FollowButtonState = {
          following: false,
          loading: true,
          error: null,
        };
        const api = createSucceedingApiClient();

        const resultState = await toggle_fixed(loadingState, 'user-xyz', api);

        // State must be unchanged — the call was ignored
        expect(resultState).toEqual(loadingState);
      },
    );
  });
});
