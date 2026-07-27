// ── Module-level mocks (hoisted by Vitest — MUST come before imports) ──

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../api/index.ts', () => ({
  notificationApi: {
    list: vi.fn(),
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

// Stub the item so dropdown tests stay focused on list/state/mark-all-read logic.
vi.mock('./NotificationItem.tsx', () => ({
  NotificationItem: ({ notification }: { notification: { id: string } }) => (
    <div data-testid={`item-${notification.id}`}>{notification.id}</div>
  ),
}));

// ── Imports (after all vi.mock calls) ──

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { notificationApi } from '../../api/index.ts';
import { notifyNotificationsChanged } from '../../utils/notification-events.ts';
import { NotificationDropdown } from './NotificationDropdown.tsx';

const mockUseTranslation = vi.mocked(useTranslation);
const mockList = vi.mocked(notificationApi.list);
const mockMarkAllRead = vi.mocked(notificationApi.markAllRead);
const mockNotifyChanged = vi.mocked(notifyNotificationsChanged);

const templates: Record<string, string> = {
  'notifications.title': 'Notifications',
  'notifications.markAllRead': 'Mark all read',
  'notifications.loadError': 'Could not load notifications',
  'notifications.empty': 'No notifications',
  'notifications.viewAll': 'View all',
  'common.loading': 'Loading…',
};

/** Build a paginated list response whose `data` is `count` unread notifications. */
function page(count: number, read = false) {
  return {
    data: Array.from({ length: count }, (_, i) => ({
      id: `n${i + 1}`,
      readAt: read ? '2026-01-01T00:00:00.000Z' : null,
    })),
    meta: { pagination: { total: count, page: 1, perPage: 10, totalPages: 1 } },
  } as never;
}

function renderDropdown() {
  return render(
    <MemoryRouter>
      <NotificationDropdown />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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

describe('NotificationDropdown', () => {
  it('shows the loading state, then renders the fetched items', async () => {
    mockList.mockResolvedValue(page(2));
    renderDropdown();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByTestId('item-n1')).toBeInTheDocument();
    expect(screen.getByTestId('item-n2')).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledWith(1);
  });

  it('caps the rendered items at the recent limit of 10', async () => {
    mockList.mockResolvedValue(page(12));
    renderDropdown();

    await screen.findByTestId('item-n1');
    expect(screen.getByTestId('item-n10')).toBeInTheDocument();
    expect(screen.queryByTestId('item-n11')).not.toBeInTheDocument();
  });

  it('shows the empty message when there are no notifications', async () => {
    mockList.mockResolvedValue(page(0));
    renderDropdown();

    expect(await screen.findByText('No notifications')).toBeInTheDocument();
  });

  it('shows the error message when the fetch rejects', async () => {
    mockList.mockRejectedValue(new Error('down'));
    renderDropdown();

    expect(await screen.findByText('Could not load notifications')).toBeInTheDocument();
  });

  it('offers mark-all-read when unread items exist and clears them on click', async () => {
    mockList.mockResolvedValue(page(2));
    mockMarkAllRead.mockResolvedValue({ message: 'ok' } as never);
    const user = userEvent.setup();
    renderDropdown();

    const button = await screen.findByRole('button', { name: 'Mark all read' });
    await user.click(button);

    expect(mockMarkAllRead).toHaveBeenCalledTimes(1);
    expect(mockNotifyChanged).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Mark all read' })).not.toBeInTheDocument()
    );
  });

  it('hides mark-all-read when every notification is already read', async () => {
    mockList.mockResolvedValue(page(2, true));
    renderDropdown();

    await screen.findByTestId('item-n1');
    expect(screen.queryByRole('button', { name: 'Mark all read' })).not.toBeInTheDocument();
  });

  it('links to the full notifications page', async () => {
    mockList.mockResolvedValue(page(1));
    renderDropdown();

    const link = await screen.findByRole('link', { name: 'View all' });
    expect(link).toHaveAttribute('href', '/notifications');
  });
});
