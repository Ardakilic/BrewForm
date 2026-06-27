import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
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

function renderWithRouter(ui: React.ReactElement) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: ui,
        children: [
          {
            path: 'follow/:userId',
            action: () => new Promise(() => {}),
            element: null,
          },
        ],
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FollowButton — initial state rendering', () => {
  it('renders "Follow" when initialFollowing=false', () => {
    renderWithRouter(<FollowButton userId='user-1' initialFollowing={false} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toBe('Follow');
  });

  it('renders "Following" when initialFollowing=true', () => {
    renderWithRouter(<FollowButton userId='user-1' initialFollowing />);
    const button = screen.getByRole('button');
    expect(button.textContent).toBe('Following');
  });

  it('button is not disabled when idle', () => {
    renderWithRouter(<FollowButton userId='user-1' initialFollowing={false} />);
    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();
  });
});

describe('FollowButton — styling', () => {
  it('does not have accent background when not following', () => {
    renderWithRouter(<FollowButton userId='user-1' initialFollowing={false} />);
    const button = screen.getByRole('button');
    expect(button.style.backgroundColor).toBeFalsy();
  });

  it('has accent background when following', () => {
    renderWithRouter(<FollowButton userId='user-1' initialFollowing />);
    const button = screen.getByRole('button');
    expect(button.style.backgroundColor).toBeTruthy();
  });

  it('renders as button with type button', () => {
    renderWithRouter(<FollowButton userId='user-1' initialFollowing={false} />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('type')).toBe('button');
  });
});

describe('FollowButton — click interaction', () => {
  it('clicking the button shows optimistic state and disables while pending', async () => {
    const user = userEvent.setup();
    renderWithRouter(<FollowButton userId='user-1' initialFollowing={false} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toBe('Follow');
    expect(button).not.toBeDisabled();

    await user.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
    });
  });
});

describe('FollowButton — action failure rollback', () => {
  it('reverts to initial state when action returns an error', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <FollowButton userId='user-1' initialFollowing={false} />,
          children: [
            {
              path: 'follow/:userId',
              action: () => ({ ok: false, error: 'server error' }),
              element: null,
            },
          ],
        },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    const button = screen.getByRole('button');

    await user.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toBe('Follow');
    });
  });

  it('completes normally when action returns ok', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <FollowButton userId='user-1' initialFollowing={false} />,
          children: [
            {
              path: 'follow/:userId',
              action: () => ({ ok: true }),
              element: null,
            },
          ],
        },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    const button = screen.getByRole('button');

    await user.click(button);

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toBe('Follow');
    });
  });
});

describe('FollowButton — callback contracts', () => {
  it('calls onToggle with true on successful follow', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onToggleRollback = vi.fn();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <FollowButton
              userId='user-1'
              initialFollowing={false}
              onToggle={onToggle}
              onToggleRollback={onToggleRollback}
            />
          ),
          children: [
            {
              path: 'follow/:userId',
              action: () => ({ ok: true }),
              element: null,
            },
          ],
        },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    const button = screen.getByRole('button');

    await user.click(button);

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
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <FollowButton
              userId='user-1'
              initialFollowing
              onToggle={onToggle}
              onToggleRollback={onToggleRollback}
            />
          ),
          children: [
            {
              path: 'follow/:userId',
              action: () => ({ ok: true }),
              element: null,
            },
          ],
        },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    const button = screen.getByRole('button');

    await user.click(button);

    await waitFor(() => {
      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onToggle).toHaveBeenCalledWith(false);
      expect(onToggleRollback).not.toHaveBeenCalled();
      expect(button.textContent).toBe('Following');
    });
  });

  it('calls onToggleRollback with initialFollowing on error, does not call onToggle', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onToggleRollback = vi.fn();
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <FollowButton
              userId='user-1'
              initialFollowing={false}
              onToggle={onToggle}
              onToggleRollback={onToggleRollback}
            />
          ),
          children: [
            {
              path: 'follow/:userId',
              action: () => ({ ok: false, error: 'server error' }),
              element: null,
            },
          ],
        },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    const button = screen.getByRole('button');

    await user.click(button);

    await waitFor(() => {
      expect(onToggleRollback).toHaveBeenCalledTimes(1);
      expect(onToggleRollback).toHaveBeenCalledWith(false);
      expect(onToggle).not.toHaveBeenCalled();
    });
  });

  it('ignores duplicate clicks while loading and settles to initial state', async () => {
    const user = userEvent.setup();
    let resolveAction!: (value: { ok: boolean }) => void;
    const actionPromise = new Promise<{ ok: boolean }>((resolve) => {
      resolveAction = resolve;
    });
    const action = vi.fn().mockReturnValue(actionPromise);
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <FollowButton userId='user-1' initialFollowing={false} />,
          children: [
            {
              path: 'follow/:userId',
              action,
              element: null,
            },
          ],
        },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    const button = screen.getByRole('button');

    await user.click(button);
    await user.click(button);

    expect(action).toHaveBeenCalledTimes(1);

    resolveAction!({ ok: true });

    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button.textContent).toBe('Follow');
    });
  });
});
