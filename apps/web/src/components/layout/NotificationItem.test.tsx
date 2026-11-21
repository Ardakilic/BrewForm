// ── Module-level mocks (hoisted by Vitest — MUST come before imports) ──

vi.mock('../../api/index.ts', () => ({
  notificationApi: {
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    list: vi.fn(),
    unreadCount: vi.fn(),
  },
}));

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

// ── Imports (after all vi.mock calls) ──

import { t } from '@brewform/shared/i18n';
import type { NotificationOutput } from '@brewform/shared/schemas';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationApi } from '../../api/index.ts';
import { markReadAction } from '../../routes/resources/notifications.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { NOTIFICATIONS_CHANGED_EVENT } from '../../utils/notification-events.ts';
import { NotificationItem } from './NotificationItem.tsx';

const mockMarkRead = vi.mocked(notificationApi.markRead);

/** Renders `ui` with the real `resources/notifications/:id/read` action route. */
function render(ui: ReactElement) {
  return renderWithAppProviders(
    [
      { path: '/', element: ui },
      { path: '/resources/notifications/:id/read', action: markReadAction },
      { path: '/recipes/:slug', element: null },
      { path: '/u/:username', element: null },
    ],
    { initialEntries: ['/'], auth: 'user' },
  );
}

/** Builds a notification fixture (an unread mention on "Pour Over" by default). */
function baseNotification(overrides: Partial<NotificationOutput> = {}): NotificationOutput {
  return {
    id: 'n1',
    userId: 'u1',
    type: 'mention',
    actorId: 'a1',
    actorUsername: 'alice',
    referenceId: 'c1',
    referenceType: 'comment',
    metadata: JSON.stringify({ recipeSlug: 'pour-over', recipeTitle: 'Pour Over' }),
    readAt: null,
    createdAt: '2026-05-09T10:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockMarkRead.mockResolvedValue(baseNotification({ readAt: '2026-05-09T11:00:00Z' }));
});

describe('NotificationItem', () => {
  it('renders mention text with username and recipe title interpolated', async () => {
    render(<NotificationItem notification={baseNotification()} />);
    expect(
      await screen.findByText('alice mentioned you in a comment on Pour Over'),
    ).toBeInTheDocument();
  });

  it('links to the recipe using the metadata slug', async () => {
    render(<NotificationItem notification={baseNotification()} />);
    const link = await screen.findByRole('link');
    expect(link).toHaveAttribute('href', '/recipes/pour-over');
  });

  it('falls back to generic text when metadata is malformed', async () => {
    render(<NotificationItem notification={baseNotification({ metadata: 'not-json{' })} />);
    expect(await screen.findByText('alice mentioned you in a comment')).toBeInTheDocument();
    // No recipe slug parsed → renders a button rather than a Link.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the unread dot and mark-read affordance when unread', async () => {
    render(<NotificationItem notification={baseNotification()} />);
    expect(await screen.findByTestId('unread-dot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('notifications.markRead') })).toBeInTheDocument();
  });

  it('hides the unread dot and mark-read button when already read', async () => {
    render(
      <NotificationItem notification={baseNotification({ readAt: '2026-05-09T11:00:00Z' })} />,
    );
    await screen.findByRole('link');
    expect(screen.queryByTestId('unread-dot')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: t('notifications.markRead') }),
    ).not.toBeInTheDocument();
  });

  it('marks read through the action and broadcasts the change when the button is clicked', async () => {
    const onRead = vi.fn();
    const changed = vi.fn();
    globalThis.addEventListener(NOTIFICATIONS_CHANGED_EVENT, changed);
    const user = userEvent.setup();
    render(<NotificationItem notification={baseNotification()} onRead={onRead} />);

    await user.click(await screen.findByRole('button', { name: t('notifications.markRead') }));

    await waitFor(() => {
      expect(mockMarkRead).toHaveBeenCalledWith('n1', { signal: expect.any(AbortSignal) });
      expect(onRead).toHaveBeenCalledWith('n1');
      expect(changed).toHaveBeenCalledTimes(1);
    });
    globalThis.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, changed);
  });

  it('shows an error toast and does not call onRead when marking read fails', async () => {
    mockMarkRead.mockRejectedValue(new Error('down'));
    const onRead = vi.fn();
    const user = userEvent.setup();
    render(<NotificationItem notification={baseNotification()} onRead={onRead} />);

    await user.click(await screen.findByRole('button', { name: t('notifications.markRead') }));

    expect(await screen.findByText(t('notifications.markReadError'))).toBeInTheDocument();
    expect(onRead).not.toHaveBeenCalled();
  });

  it('renders follow text with actorUsername interpolated and links to the actor profile', async () => {
    render(
      <NotificationItem
        notification={baseNotification({
          type: 'follow',
          metadata: JSON.stringify({ followerUsername: 'alice' }),
        })}
      />,
    );
    expect(await screen.findByText('alice started following you')).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/u/alice');
  });

  it('renders like text with actorUsername and recipeTitle and links to the recipe', async () => {
    render(<NotificationItem notification={baseNotification({ type: 'like' })} />);
    expect(await screen.findByText('alice liked your recipe Pour Over')).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/recipes/pour-over');
  });

  it('renders comment text and links to the recipe with #commentId anchor', async () => {
    render(
      <NotificationItem
        notification={baseNotification({ type: 'comment', referenceId: 'c-123' })}
      />,
    );
    expect(await screen.findByText('alice commented on Pour Over')).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/recipes/pour-over#c-123');
  });

  it('falls back to mentionGeneric for an unknown notification type', async () => {
    // ponytail: `as never` deliberately crosses the type union for forward-compat testing.
    render(<NotificationItem notification={baseNotification({ type: 'futureType' as never })} />);
    expect(await screen.findByText('alice mentioned you in a comment')).toBeInTheDocument();
  });
});
