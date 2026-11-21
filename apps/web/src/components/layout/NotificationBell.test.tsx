// ── Module-level mocks (hoisted by Vitest — MUST come before imports) ──

vi.mock('../../api/index.ts', () => ({
  notificationApi: {
    unreadCount: vi.fn(),
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
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

// Stub the dropdown so bell tests stay focused on the badge + toggle.
vi.mock('./NotificationDropdown.tsx', () => ({
  NotificationDropdown: () => <div data-testid="dropdown" />,
}));

// ── Imports (after all vi.mock calls) ──

import { t } from '@brewform/shared/i18n';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationApi } from '../../api/index.ts';
import {
  shouldRevalidateNotifications,
  unreadCountLoader,
} from '../../routes/resources/notifications.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { NOTIFICATIONS_CHANGED_EVENT } from '../../utils/notification-events.ts';
import { NotificationBell } from './NotificationBell.tsx';

const mockUnreadCount = vi.mocked(notificationApi.unreadCount);

/** Renders the bell with the real `resources/notifications/unread-count` resource route. */
function renderBell() {
  return renderWithAppProviders(
    [
      { path: '/', element: <NotificationBell /> },
      {
        path: '/resources/notifications/unread-count',
        loader: unreadCountLoader,
        shouldRevalidate: shouldRevalidateNotifications,
      },
    ],
    { initialEntries: ['/'], auth: 'user' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockUnreadCount.mockResolvedValue({ count: 3 });
});

describe('NotificationBell', () => {
  it('loads the unread count through the resource route on mount and renders the badge', async () => {
    renderBell();
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(mockUnreadCount).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  it('renders the badge count in var(--bg-primary) on the accent fill', async () => {
    renderBell();
    const badge = await screen.findByText('3');
    expect(badge.className).toContain('bg-[color:var(--accent-primary)]');
    expect(badge.className).toContain('text-[color:var(--bg-primary)]');
  });

  it('hides the badge when the unread count is zero', async () => {
    mockUnreadCount.mockResolvedValue({ count: 0 });
    renderBell();
    await waitFor(() => expect(mockUnreadCount).toHaveBeenCalled());
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('caps the badge display at 9+ for large counts', async () => {
    mockUnreadCount.mockResolvedValue({ count: 42 });
    renderBell();
    expect(await screen.findByText('9+')).toBeInTheDocument();
  });

  it('toggles the dropdown open and closed when the bell is clicked', async () => {
    const user = userEvent.setup();
    renderBell();
    await screen.findByText('3');

    const bell = screen.getByRole('button', { name: t('notifications.bellLabel') });
    expect(screen.queryByTestId('dropdown')).not.toBeInTheDocument();

    await user.click(bell);
    expect(screen.getByTestId('dropdown')).toBeInTheDocument();

    await user.click(bell);
    expect(screen.queryByTestId('dropdown')).not.toBeInTheDocument();
  });

  it('reloads the count when the notifications-changed event fires', async () => {
    renderBell();
    await screen.findByText('3');
    expect(mockUnreadCount).toHaveBeenCalledTimes(1);

    mockUnreadCount.mockResolvedValue({ count: 5 });
    await act(() => {
      globalThis.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    });

    expect(await screen.findByText('5')).toBeInTheDocument();
  });

  it('reloads the count when the window regains focus', async () => {
    renderBell();
    await screen.findByText('3');

    mockUnreadCount.mockResolvedValue({ count: 7 });
    await act(() => {
      globalThis.dispatchEvent(new Event('focus'));
    });

    expect(await screen.findByText('7')).toBeInTheDocument();
    expect(mockUnreadCount).toHaveBeenCalledTimes(2);
  });

  it('keeps the last known count when a reload fails', async () => {
    renderBell();
    await screen.findByText('3');

    mockUnreadCount.mockRejectedValue(new Error('down'));
    await act(() => {
      globalThis.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    });

    await waitFor(() => expect(mockUnreadCount).toHaveBeenCalledTimes(2));
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
