/**
 * Preservation Test — `FollowButton` successful follow/unfollow toggles state without error
 *
 * **Validates: Requirements 3.2, 3.5**
 *
 * These tests exercise the PRESERVED (non-buggy) path:
 *   When the API mock returns 2xx, `FollowButton` flips `following` state and shows no error.
 *
 * EXPECTED OUTCOME ON UNFIXED CODE: PASS
 *   The current `FollowButton.tsx` correctly toggles `following` on success.
 *   The empty `catch {}` block is never reached on a 2xx response, so no error state is set.
 *
 * Testing approach:
 *   Since this is a Deno environment without a DOM renderer, the toggle logic is extracted
 *   into a pure state-machine function that mirrors the UNFIXED FollowButton implementation.
 *   This lets us test the state transitions directly without React/DOM.
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
  }

  // After the empty catch, loading is reset to false (mirrors the finally block in the real component)
  return { ...next, loading: false };
}

// ---------------------------------------------------------------------------
// Mock API factories
// ---------------------------------------------------------------------------

/** Creates a mock API client that resolves with a given status code (simulates 2xx responses) */
function createSucceedingApiClient(statusCode: number = 200): MockApiClient {
  return {
    post: (_endpoint: string, _body: unknown) =>
      Promise.resolve({ status: statusCode, success: true }),
    delete: (_endpoint: string) => Promise.resolve({ status: statusCode, success: true }),
  };
}

/**
 * Creates a mock API client that counts how many times each method is called.
 * The API resolves after a configurable delay so we can interleave calls.
 */
function createCountingApiClient(
  delayMs: number = 0,
): { client: MockApiClient; callCount: () => number } {
  let count = 0;
  const client: MockApiClient = {
    post: (_endpoint: string, _body: unknown) => {
      count++;
      return new Promise((resolve) =>
        setTimeout(() => resolve({ status: 200, success: true }), delayMs)
      );
    },
    delete: (_endpoint: string) => {
      count++;
      return new Promise((resolve) =>
        setTimeout(() => resolve({ status: 200, success: true }), delayMs)
      );
    },
  };
  return { client, callCount: () => count };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Preservation 2.4 — FollowButton successful toggle preserves state without error', () => {
  it(
    'mock API returns 201 for follow → following becomes true and no error state is set',
    async () => {
      // Preservation: when the API succeeds (201 Created), the button should flip to following=true
      // and no error should be set. This must PASS on unfixed code.
      const initialState: FollowButtonState = {
        following: false,
        loading: false,
        error: null,
      };
      const api = createSucceedingApiClient(201);

      const resultState = await toggle_buggy(initialState, 'user-xyz', api);

      // following must be toggled to true
      expect(resultState.following).toBe(true);
      // no error state should be set (the catch block is never reached on success)
      expect(resultState.error).toBeNull();
      // loading must be reset to false
      expect(resultState.loading).toBe(false);
    },
  );

  it(
    'mock API returns 200 for unfollow → following becomes false and no error state is set',
    async () => {
      // Preservation: when the API succeeds (200 OK), the button should flip to following=false
      // and no error should be set. This must PASS on unfixed code.
      const initialState: FollowButtonState = {
        following: true,
        loading: false,
        error: null,
      };
      const api = createSucceedingApiClient(200);

      const resultState = await toggle_buggy(initialState, 'user-xyz', api);

      // following must be toggled to false
      expect(resultState.following).toBe(false);
      // no error state should be set (the catch block is never reached on success)
      expect(resultState.error).toBeNull();
      // loading must be reset to false
      expect(resultState.loading).toBe(false);
    },
  );

  it(
    'successful follow call leaves loading as false after completion',
    async () => {
      // Preservation: after a successful API call, the loading state must be reset.
      const initialState: FollowButtonState = {
        following: false,
        loading: false,
        error: null,
      };
      const api = createSucceedingApiClient(201);

      const resultState = await toggle_buggy(initialState, 'user-abc', api);

      expect(resultState.loading).toBe(false);
    },
  );

  it(
    'successful unfollow call leaves loading as false after completion',
    async () => {
      // Preservation: after a successful API call, the loading state must be reset.
      const initialState: FollowButtonState = {
        following: true,
        loading: false,
        error: null,
      };
      const api = createSucceedingApiClient(200);

      const resultState = await toggle_buggy(initialState, 'user-abc', api);

      expect(resultState.loading).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// Preservation 2.5 — duplicate click while request in flight is ignored
// ---------------------------------------------------------------------------

describe('Preservation 2.5 — duplicate click while request in flight is ignored', () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * EXPECTED OUTCOME ON UNFIXED CODE: PASS
   *   The current `FollowButton.tsx` has `if (loading) return;` at the top of `toggle()`.
   *   A second click while the first request is in flight is silently ignored.
   *   The API must be called exactly once regardless of how many times toggle is invoked
   *   while `loading` is `true`.
   *
   * Simulation strategy:
   *   The pure state-machine `toggle_buggy` takes a snapshot of state.
   *   "Rapid succession" is modelled by:
   *     1. Firing the first toggle with `loading: false` (normal first click).
   *     2. Immediately firing a second toggle with the in-flight state (`loading: true`),
   *        which is the state the React component would expose between `setLoading(true)`
   *        and the awaited API response.
   *   The second call must return early without touching the API client.
   */

  it(
    'second toggle call with loading=true returns early and does not call the API',
    async () => {
      // Arrange: a counting API client so we can verify call count
      const { client, callCount } = createCountingApiClient(10);

      const initialState: FollowButtonState = {
        following: false,
        loading: false,
        error: null,
      };

      // Act: first click — starts the request, sets loading=true internally
      const firstCallPromise = toggle_buggy(initialState, 'user-dup', client);

      // Simulate the in-flight state that React would expose after setLoading(true)
      const inFlightState: FollowButtonState = { ...initialState, loading: true };

      // Second click arrives while the first is still in flight
      const secondResult = await toggle_buggy(inFlightState, 'user-dup', client);

      // Wait for the first call to complete
      await firstCallPromise;

      // Assert: the API was called exactly once (the second toggle was a no-op)
      expect(callCount()).toBe(1);

      // Assert: the second call returned the in-flight state unchanged
      expect(secondResult).toEqual(inFlightState);
    },
  );

  it(
    'three rapid clicks result in exactly one API call',
    async () => {
      // Arrange
      const { client, callCount } = createCountingApiClient(10);

      const initialState: FollowButtonState = {
        following: false,
        loading: false,
        error: null,
      };

      // Act: first click fires the real request
      const firstCallPromise = toggle_buggy(initialState, 'user-triple', client);

      // Second and third clicks arrive while loading=true
      const inFlightState: FollowButtonState = { ...initialState, loading: true };
      const secondResult = await toggle_buggy(inFlightState, 'user-triple', client);
      const thirdResult = await toggle_buggy(inFlightState, 'user-triple', client);

      await firstCallPromise;

      // Only one API call should have been made
      expect(callCount()).toBe(1);

      // Both duplicate calls returned the in-flight state unchanged
      expect(secondResult).toEqual(inFlightState);
      expect(thirdResult).toEqual(inFlightState);
    },
  );

  it(
    'toggle with loading=true returns the exact same state object (no mutation)',
    async () => {
      // Arrange
      const { client } = createCountingApiClient();

      const inFlightState: FollowButtonState = {
        following: true,
        loading: true,
        error: null,
      };

      // Act: call toggle while already loading
      const result = await toggle_buggy(inFlightState, 'user-noop', client);

      // Assert: the returned state is identical to the input (early return)
      expect(result).toBe(inFlightState); // same reference — no new object created
    },
  );
});
