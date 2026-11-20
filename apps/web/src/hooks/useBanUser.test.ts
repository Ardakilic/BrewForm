import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

import { renderWithAppProviders } from '../test-utils/render.tsx';
import { useBanUser } from './useBanUser.ts';

const testUser = { id: 'u1', username: 'alice', displayName: 'Alice' };

/** The latest hook result rendered by {@link Harness}. */
let hook: ReturnType<typeof useBanUser>;
const onSuccess = vi.fn();

/** Renders the hook under a route so it can submit to the `/admin/users/:id` action. */
function Harness() {
  hook = useBanUser(onSuccess);
  return null;
}

/** What the mocked route action received: the user id param and the submitted fields. */
let submissions: Array<{ id: string | undefined; intent: string; reason: string | null }> = [];
const routeAction = vi.fn();
const listLoader = vi.fn(() => null);

/**
 * Renders the hook at `/admin/users` (whose loader counts revalidations) next to a
 * `/admin/users/:id` route whose action is a `vi.fn()` returning `result`.
 */
function renderHarness(result: () => unknown) {
  routeAction.mockImplementation(
    async ({ request, params }: { request: Request; params: { id?: string } }) => {
      const form = await request.formData();
      submissions.push({
        id: params.id,
        intent: String(form.get('intent')),
        reason: form.get('reason') as string | null,
      });
      return result();
    },
  );
  return renderWithAppProviders(
    [
      { path: '/admin/users', Component: Harness, loader: listLoader },
      { path: '/admin/users/:id', action: routeAction },
    ],
    { initialEntries: ['/admin/users'], auth: 'admin' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  submissions = [];
});

describe('useBanUser', () => {
  it('openBanDialog sets banDialogUser and clears state', async () => {
    renderHarness(() => ({ ok: true, intent: 'ban' }));
    await waitFor(() => expect(hook).toBeDefined());
    act(() => hook.openBanDialog(testUser));
    expect(hook.banDialogUser).toEqual(testUser);
    expect(hook.processing).toBe(false);
    expect(hook.error).toBeNull();
  });

  it('confirmBan success: submits intent=ban to /admin/users/:id, calls onSuccess(userId, true), closes the dialog', async () => {
    renderHarness(() => ({ ok: true, intent: 'ban' }));
    await waitFor(() => expect(listLoader).toHaveBeenCalledTimes(1));
    act(() => hook.openBanDialog(testUser));

    await act(async () => {
      await hook.confirmBan('Spam');
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('u1', true));
    expect(submissions).toEqual([{ id: 'u1', intent: 'ban', reason: 'Spam' }]);
    await waitFor(() => expect(hook.banDialogUser).toBeNull());
    expect(hook.processing).toBe(false);
    expect(hook.error).toBeNull();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { userId: 'u1' },
      'useBanUser confirmBan started',
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { userId: 'u1' },
      'useBanUser confirmBan completed',
    );
  });

  it('submits with defaultShouldRevalidate: false (no loader re-fetch after a ban)', async () => {
    renderHarness(() => ({ ok: true, intent: 'ban' }));
    await waitFor(() => expect(listLoader).toHaveBeenCalledTimes(1));
    act(() => hook.openBanDialog(testUser));

    await act(async () => {
      await hook.confirmBan('Spam');
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    expect(routeAction).toHaveBeenCalledTimes(1);
    expect(listLoader).toHaveBeenCalledTimes(1);
  });

  it('confirmBan failure: sets error (key, not server text), resets processing, keeps dialog open, logs', async () => {
    renderHarness(() => ({ ok: false, intent: 'ban', error: 'Network error' }));
    await waitFor(() => expect(hook).toBeDefined());
    act(() => hook.openBanDialog(testUser));

    await act(async () => {
      await hook.confirmBan('Spam');
    });

    await waitFor(() => expect(hook.error).toBe('admin.users.banError'));
    expect(hook.processing).toBe(false);
    expect(hook.banDialogUser).toEqual(testUser);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: 'Network error', userId: 'u1' },
      'useBanUser confirmBan failed',
    );
  });

  it('confirmBan with an empty reason returns early without submitting', async () => {
    renderHarness(() => ({ ok: true, intent: 'ban' }));
    await waitFor(() => expect(hook).toBeDefined());
    act(() => hook.openBanDialog(testUser));

    await act(async () => {
      await hook.confirmBan('   ');
    });

    expect(routeAction).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('unban success: submits intent=unban and calls onSuccess(userId, false)', async () => {
    renderHarness(() => ({ ok: true, intent: 'unban' }));
    await waitFor(() => expect(hook).toBeDefined());

    await act(async () => {
      await hook.unban('u1');
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('u1', false));
    expect(submissions).toEqual([{ id: 'u1', intent: 'unban', reason: null }]);
    expect(hook.error).toBeNull();
    expect(hook.processing).toBe(false);
  });

  it('unban failure: sets error (key, not server text) and logs', async () => {
    renderHarness(() => ({ ok: false, intent: 'unban', error: 'Server error' }));
    await waitFor(() => expect(hook).toBeDefined());

    await act(async () => {
      await hook.unban('u1');
    });

    await waitFor(() => expect(hook.error).toBe('admin.users.unbanError'));
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: 'Server error', userId: 'u1' },
      'useBanUser unban failed',
    );
  });

  it('unban rejects duplicate calls while a submission is in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderHarness(async () => {
      await gate;
      return { ok: true, intent: 'unban' };
    });
    await waitFor(() => expect(hook).toBeDefined());

    let first!: Promise<void>;
    act(() => {
      first = hook.unban('u1');
    });
    await waitFor(() => expect(hook.processing).toBe(true));
    await act(async () => {
      await hook.unban('u1');
    });
    release();
    await act(async () => {
      await first;
    });

    await waitFor(() => expect(hook.processing).toBe(false));
    expect(routeAction).toHaveBeenCalledTimes(1);
  });

  it('clearError clears error', async () => {
    renderHarness(() => ({ ok: false, intent: 'unban', error: 'Server error' }));
    await waitFor(() => expect(hook).toBeDefined());
    await act(async () => {
      await hook.unban('u1');
    });
    await waitFor(() => expect(hook.error).toBe('admin.users.unbanError'));

    act(() => hook.clearError());

    expect(hook.error).toBeNull();
  });

  it('closeDialog clears banDialogUser, error, and processing', async () => {
    renderHarness(() => ({ ok: true, intent: 'ban' }));
    await waitFor(() => expect(hook).toBeDefined());
    act(() => hook.openBanDialog(testUser));
    expect(hook.banDialogUser).toEqual(testUser);

    act(() => hook.closeDialog());

    expect(hook.banDialogUser).toBeNull();
    expect(hook.error).toBeNull();
    expect(hook.processing).toBe(false);
  });
});
