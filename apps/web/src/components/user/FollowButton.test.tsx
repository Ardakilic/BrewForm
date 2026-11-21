import { t } from '@brewform/shared/i18n';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import type { ActionFunction } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { FollowButton } from './FollowButton.tsx';

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

const FOLLOW = t('follow.follow');
const FOLLOWING = t('follow.followingState');

/** A route action that never settles (the button stays pending). */
const HANGING: ActionFunction = () => new Promise(() => undefined);

/** Renders `ui` at `/` with the app providers and `action` on `follow/:userId`. */
function renderButton(ui: ReactElement, action: ActionFunction = HANGING, locale?: 'en' | 'tr') {
  return renderWithAppProviders(
    [{ path: '/', element: ui, children: [{ path: 'follow/:userId', action, element: null }] }],
    { locale },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('FollowButton — initial state rendering', () => {
  it('renders the follow label when initialFollowing=false', () => {
    renderButton(<FollowButton userId="user-1" initialFollowing={false} />);
    expect(screen.getByRole('button').textContent).toBe(FOLLOW);
  });

  it('renders the following label when initialFollowing=true', () => {
    renderButton(<FollowButton userId="user-1" initialFollowing />);
    expect(screen.getByRole('button').textContent).toBe(FOLLOWING);
  });

  it('renders the Turkish labels in the tr locale', () => {
    renderButton(<FollowButton userId="user-1" initialFollowing />, HANGING, 'tr');
    expect(screen.getByRole('button').textContent).toBe(t('follow.followingState', 'tr'));
  });

  it('button is not disabled when idle', () => {
    renderButton(<FollowButton userId="user-1" initialFollowing={false} />);
    expect(screen.getByRole('button')).not.toBeDisabled();
  });
});

describe('FollowButton — styling', () => {
  it('does not have accent background when not following', () => {
    renderButton(<FollowButton userId="user-1" initialFollowing={false} />);
    expect(screen.getByRole('button').style.backgroundColor).toBeFalsy();
  });

  it('has accent background when following', () => {
    renderButton(<FollowButton userId="user-1" initialFollowing />);
    expect(screen.getByRole('button').style.backgroundColor).toBeTruthy();
  });

  it('renders as button with type button', () => {
    renderButton(<FollowButton userId="user-1" initialFollowing={false} />);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });
});

describe('FollowButton — click interaction', () => {
  it('clicking the button disables it while pending', async () => {
    const user = userEvent.setup();
    renderButton(<FollowButton userId="user-1" initialFollowing={false} />);
    const button = screen.getByRole('button');

    await user.click(button);

    await waitFor(() => expect(button).toBeDisabled());
  });
});

describe('FollowButton — settled state and rollback', () => {
  it('reverts to the pre-click state and toasts when the action fails', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onToggleRollback = vi.fn();
    const action = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'server error', following: false });
    renderButton(
      <FollowButton
        userId="user-1"
        initialFollowing={false}
        onToggle={onToggle}
        onToggleRollback={onToggleRollback}
      />,
      action,
    );
    const button = screen.getByRole('button');

    await user.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toBe(FOLLOW);
    });
    expect(await screen.findByText(t('follow.error'))).toBeInTheDocument();
    expect(onToggleRollback).toHaveBeenCalledTimes(1);
    expect(onToggleRollback).toHaveBeenCalledWith(false);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('keeps the following state after { ok: true, following } (no revalidation)', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ok: true, following: true });
    renderButton(<FollowButton userId="user-1" initialFollowing={false} />, action);
    const button = screen.getByRole('button');

    await user.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toBe(FOLLOWING);
    });
  });

  it('shows Following after a failed unfollow; the next click sends DELETE', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onToggleRollback = vi.fn();
    const methods: string[] = [];
    const action = vi.fn(({ request }: { request: Request }) => {
      methods.push(request.method);
      return methods.length === 1
        ? { ok: true, following: true }
        : methods.length === 2
          ? { ok: false, error: 'server error', following: true }
          : new Promise(() => undefined);
    });
    renderButton(
      <FollowButton
        userId="user-1"
        initialFollowing={false}
        onToggle={onToggle}
        onToggleRollback={onToggleRollback}
      />,
      action,
    );
    const button = screen.getByRole('button');

    await user.click(button);
    await waitFor(() => expect(button.textContent).toBe(FOLLOWING));
    await user.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(onToggleRollback).toHaveBeenCalledTimes(1);
    });
    expect(button.textContent).toBe(FOLLOWING);
    expect(onToggleRollback).toHaveBeenCalledWith(true);
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(await screen.findByText(t('follow.error'))).toBeInTheDocument();

    await user.click(button);
    await waitFor(() => expect(methods).toEqual(['POST', 'DELETE', 'DELETE']));
  });

  it('toasts error.unauthorized for an UNAUTHORIZED failure', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({
      ok: false,
      error: 'no session',
      code: 'UNAUTHORIZED',
      following: false,
    });
    renderButton(<FollowButton userId="user-1" initialFollowing={false} />, action);

    await user.click(screen.getByRole('button'));

    expect(await screen.findByText(t('error.unauthorized'))).toBeInTheDocument();
  });
});

describe('FollowButton — callback contracts', () => {
  it('calls onToggle with true on successful follow', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onToggleRollback = vi.fn();
    renderButton(
      <FollowButton
        userId="user-1"
        initialFollowing={false}
        onToggle={onToggle}
        onToggleRollback={onToggleRollback}
      />,
      () => ({ ok: true, following: true }),
    );

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onToggle).toHaveBeenCalledWith(true);
      expect(onToggleRollback).not.toHaveBeenCalled();
    });
  });

  it('calls onToggle with false on successful unfollow', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onToggleRollback = vi.fn();
    renderButton(
      <FollowButton
        userId="user-1"
        initialFollowing
        onToggle={onToggle}
        onToggleRollback={onToggleRollback}
      />,
      () => ({ ok: true, following: false }),
    );
    const button = screen.getByRole('button');

    await user.click(button);

    await waitFor(() => {
      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onToggle).toHaveBeenCalledWith(false);
      expect(onToggleRollback).not.toHaveBeenCalled();
      expect(button.textContent).toBe(FOLLOW);
    });
  });

  it('ignores duplicate clicks while loading', async () => {
    const user = userEvent.setup();
    let resolveAction!: (value: { ok: boolean; following: boolean }) => void;
    const action = vi.fn().mockReturnValue(
      new Promise<{ ok: boolean; following: boolean }>((resolve) => {
        resolveAction = resolve;
      }),
    );
    renderButton(<FollowButton userId="user-1" initialFollowing={false} />, action);
    const button = screen.getByRole('button');

    await user.click(button);
    await user.click(button);

    expect(action).toHaveBeenCalledTimes(1);

    resolveAction({ ok: true, following: true });

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toBe(FOLLOWING);
    });
  });
});
