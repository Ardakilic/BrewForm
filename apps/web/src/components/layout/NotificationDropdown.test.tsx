// ── Module-level mocks (hoisted by Vitest — MUST come before imports) ──

vi.mock('../../api/index.ts', () => ({
  notificationApi: {
    list: vi.fn(),
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

// Stub the item so dropdown tests stay focused on list/state/mark-all-read logic.
vi.mock('./NotificationItem.tsx', () => ({
  NotificationItem: ({ notification }: { notification: { id: string; readAt: string | null } }) => (
    <div data-testid={`item-${notification.id}`}>
      {notification.id}
      {notification.readAt ? ' read' : ' unread'}
    </div>
  ),
}));

// ── Imports (after all vi.mock calls) ──

import { t } from '@brewform/shared/i18n';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationApi } from '../../api/index.ts';
import {
  markAllReadAction,
  notificationsPageLoader,
  shouldRevalidateNotifications,
} from '../../routes/resources/notifications.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { NOTIFICATIONS_CHANGED_EVENT } from '../../utils/notification-events.ts';
import { NotificationDropdown } from './NotificationDropdown.tsx';

const mockList = vi.mocked(notificationApi.list);
const mockMarkAllRead = vi.mocked(notificationApi.markAllRead);

const MARK_ALL = t('notifications.markAllRead');

/** Build a paginated list response whose `data` is `count` notifications. */
function page(count: number, read = false) {
  return {
    data: Array.from({ length: count }, (_, i) => ({
      id: `n${i + 1}`,
      readAt: read ? '2026-01-01T00:00:00.000Z' : null,
    })),
    meta: { pagination: { total: count, page: 1, perPage: 10, totalPages: 1 } },
  } as never;
}

/** Renders the dropdown with the real notification resource routes. */
function renderDropdown() {
  return renderWithAppProviders(
    [
      { path: '/', element: <NotificationDropdown /> },
      {
        path: '/resources/notifications',
        loader: notificationsPageLoader,
        shouldRevalidate: shouldRevalidateNotifications,
      },
      { path: '/resources/notifications/read-all', action: markAllReadAction },
      { path: '/notifications', element: null },
    ],
    { initialEntries: ['/'], auth: 'user' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('NotificationDropdown', () => {
  it('shows the loading state, then renders the items loaded through the fetcher', async () => {
    mockList.mockResolvedValue(page(2));
    renderDropdown();

    expect(screen.getByText(t('common.loading'))).toBeInTheDocument();
    expect(await screen.findByTestId('item-n1')).toBeInTheDocument();
    expect(screen.getByTestId('item-n2')).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledWith(1, undefined, { signal: expect.any(AbortSignal) });
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

    expect(await screen.findByText(t('notifications.empty'))).toBeInTheDocument();
  });

  it('shows the error message when the resource loader reports a failure', async () => {
    mockList.mockRejectedValue(new Error('down'));
    renderDropdown();

    expect(await screen.findByText(t('notifications.loadError'))).toBeInTheDocument();
  });

  it('marks all read through the action, broadcasts the change and clears the unread items', async () => {
    mockList.mockResolvedValue(page(2));
    mockMarkAllRead.mockResolvedValue({ message: 'ok' });
    const changed = vi.fn();
    globalThis.addEventListener(NOTIFICATIONS_CHANGED_EVENT, changed);
    const user = userEvent.setup();
    renderDropdown();

    await user.click(await screen.findByRole('button', { name: MARK_ALL }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: MARK_ALL })).not.toBeInTheDocument(),
    );
    expect(mockMarkAllRead).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('item-n1')).toHaveTextContent('read');
    // No revalidation: the page is not loaded a second time.
    expect(mockList).toHaveBeenCalledTimes(1);
    globalThis.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, changed);
  });

  it('shows an error toast and keeps the unread items when mark-all-read fails', async () => {
    mockList.mockResolvedValue(page(2));
    mockMarkAllRead.mockRejectedValue(new Error('down'));
    const user = userEvent.setup();
    renderDropdown();

    await user.click(await screen.findByRole('button', { name: MARK_ALL }));

    expect(await screen.findByText(t('notifications.markAllReadError'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: MARK_ALL })).toBeInTheDocument();
    expect(screen.getByTestId('item-n1')).toHaveTextContent('unread');
  });

  it('hides mark-all-read when every notification is already read', async () => {
    mockList.mockResolvedValue(page(2, true));
    renderDropdown();

    await screen.findByTestId('item-n1');
    expect(screen.queryByRole('button', { name: MARK_ALL })).not.toBeInTheDocument();
  });

  it('links to the full notifications page', async () => {
    mockList.mockResolvedValue(page(1));
    renderDropdown();

    const link = await screen.findByRole('link', { name: t('notifications.viewAll') });
    expect(link).toHaveAttribute('href', '/notifications');
  });
});
