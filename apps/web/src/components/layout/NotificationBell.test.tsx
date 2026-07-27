// ── Module-level mocks (hoisted by Vitest — MUST come before imports) ──

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../api/index.ts', () => ({
  notificationApi: {
    unreadCount: vi.fn(),
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../utils/notification-events.ts', () => ({
  NOTIFICATIONS_CHANGED_EVENT: 'brewform:notifications-changed',
  notifyNotificationsChanged: vi.fn(),
}));

// Stub the dropdown so bell tests stay focused on the badge + toggle.
vi.mock('./NotificationDropdown.tsx', () => ({
  NotificationDropdown: () => <div data-testid='dropdown' />,
}));

// ── Imports (after all vi.mock calls) ──

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { notificationApi } from '../../api/index.ts';
import { NOTIFICATIONS_CHANGED_EVENT } from '../../utils/notification-events.ts';
import { NotificationBell } from './NotificationBell.tsx';

const mockUseTranslation = vi.mocked(useTranslation);
const mockUnreadCount = vi.mocked(notificationApi.unreadCount);

const templates: Record<string, string> = {
  'notifications.bellLabel': 'Notifications',
  'notifications.unreadCount': '{count} unread notifications',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUnreadCount.mockResolvedValue({ count: 3 });
  mockUseTranslation.mockReturnValue({
    locale: 'en',
    setLocale: vi.fn(),
    t: (key: string) => templates[key] ?? key,
    availableLocales: ['en', 'tr'],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NotificationBell', () => {
  it('fetches the unread count on mount and renders the badge', async () => {
    render(<NotificationBell />);
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(mockUnreadCount).toHaveBeenCalled();
  });

  it('hides the badge when the unread count is zero', async () => {
    mockUnreadCount.mockResolvedValue({ count: 0 });
    render(<NotificationBell />);
    await waitFor(() => expect(mockUnreadCount).toHaveBeenCalled());
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('caps the badge display at 9+ for large counts', async () => {
    mockUnreadCount.mockResolvedValue({ count: 42 });
    render(<NotificationBell />);
    expect(await screen.findByText('9+')).toBeInTheDocument();
  });

  it('toggles the dropdown open and closed when the bell is clicked', async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);
    await screen.findByText('3');

    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(screen.queryByTestId('dropdown')).not.toBeInTheDocument();

    await user.click(bell);
    expect(screen.getByTestId('dropdown')).toBeInTheDocument();

    await user.click(bell);
    expect(screen.queryByTestId('dropdown')).not.toBeInTheDocument();
  });

  it('refetches the count when the notifications-changed event fires', async () => {
    render(<NotificationBell />);
    await screen.findByText('3');
    expect(mockUnreadCount).toHaveBeenCalledTimes(1);

    mockUnreadCount.mockResolvedValue({ count: 5 });
    // deno-lint-ignore require-await -- act() requires async wrapper
    await act(async () => {
      globalThis.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    });

    expect(await screen.findByText('5')).toBeInTheDocument();
  });
});
