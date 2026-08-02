// ── Module-level mocks (hoisted by Vitest — MUST come before imports) ──

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../api/index.ts', () => ({
  notificationApi: {
    list: vi.fn(),
    markAllRead: vi.fn(),
    markRead: vi.fn(),
    unreadCount: vi.fn(),
  },
  ApiError: class extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status = 500) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock('../../utils/logger.ts', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../utils/notification-events.ts', () => ({
  notifyNotificationsChanged: vi.fn(),
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: () => null,
}));

// Stub NotificationItem + PaginationControls so this test targets the page shell.
vi.mock('../../components/layout/NotificationItem.tsx', () => ({
  NotificationItem: (
    { notification }: { notification: { id: string; actorUsername: string | null } },
  ) => <div data-testid='notif-item'>{notification.actorUsername}</div>,
}));

vi.mock('../../components/recipe-list/index.ts', () => ({
  PaginationControls: ({ page, totalPages }: { page: number; totalPages: number }) => (
    <nav data-testid='pagination'>page {page}/{totalPages}</nav>
  ),
}));

// ── Imports (after all vi.mock calls) ──

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type { NotificationOutput, PaginatedResponse } from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { notificationApi } from '../../api/index.ts';
import { loader, NotificationListPage } from './NotificationListPage.tsx';

const mockUseTranslation = vi.mocked(useTranslation);
const mockList = vi.mocked(notificationApi.list);
const mockMarkAllRead = vi.mocked(notificationApi.markAllRead);

const enMap: Record<string, string> = {
  'notifications.title': 'Notifications',
  'notifications.filterLabel': 'Filter notifications',
  'notifications.empty': 'No notifications yet',
  'notifications.markAllRead': 'Mark all as read',
  'notifications.all': 'All',
  'notifications.unread': 'Unread',
  'common.previous': 'Previous',
  'common.next': 'Next',
  'common.pagination': 'Page {page} of {total}',
};

const trMap: Record<string, string> = {
  'notifications.title': 'Bildirimler',
  'notifications.filterLabel': 'Bildirimleri filtrele',
  'notifications.empty': 'Henüz bildirim yok',
  'notifications.markAllRead': 'Tümünü okundu işaretle',
  'notifications.all': 'Tümü',
  'notifications.unread': 'Okunmamış',
};

function makeNotification(overrides: Partial<NotificationOutput> = {}): NotificationOutput {
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

function makeResponse(
  data: NotificationOutput[],
  totalPages = 1,
  page = 1,
): PaginatedResponse<NotificationOutput> {
  return {
    success: true,
    data,
    meta: { requestId: 'test', pagination: { page, perPage: 20, total: data.length, totalPages } },
  };
}

function renderPage(locale: 'en' | 'tr' = 'en') {
  mockUseTranslation.mockReturnValue({
    locale,
    setLocale: vi.fn(),
    t: (key: string) => (locale === 'tr' ? trMap : enMap)[key] ?? key,
    availableLocales: ['en', 'tr'],
  });

  const router = createMemoryRouter(
    [{ path: '/notifications', element: <NotificationListPage />, loader }],
    { initialEntries: ['/notifications'] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMarkAllRead.mockResolvedValue({ message: 'ok' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NotificationListPage', () => {
  it('renders the notifications returned by the loader', async () => {
    mockList.mockResolvedValue(
      makeResponse([makeNotification({ id: 'n1' }), makeNotification({ id: 'n2' })]),
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId('notif-item')).toHaveLength(2);
    });
    expect(mockList).toHaveBeenCalledWith(1, false);
  });

  it('shows the empty state when there are no notifications', async () => {
    mockList.mockResolvedValue(makeResponse([]));
    renderPage();

    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
  });

  it('marks all notifications as read when the button is clicked', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue(makeResponse([makeNotification({ readAt: null })]));
    renderPage();

    const button = await screen.findByText('Mark all as read');
    await user.click(button);

    await waitFor(() => expect(mockMarkAllRead).toHaveBeenCalled());
  });

  it('renders pagination controls when there is more than one page', async () => {
    mockList.mockResolvedValue(makeResponse([makeNotification()], 3));
    renderPage();

    expect(await screen.findByTestId('pagination')).toHaveTextContent('page 1/3');
  });

  it('renders the title in Turkish when locale is tr', async () => {
    mockList.mockResolvedValue(makeResponse([]));
    renderPage('tr');

    expect(await screen.findByText('Bildirimler')).toBeInTheDocument();
    expect(screen.getByText('Henüz bildirim yok')).toBeInTheDocument();
  });

  it('initial render loads notifications with unread filter off (default All)', async () => {
    mockList.mockResolvedValue(makeResponse([makeNotification()]));
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId('notif-item')).toHaveLength(1);
    });
    expect(mockList).toHaveBeenCalledWith(1, false);
  });

  it("clicking the 'Unread' filter calls notificationApi.list with unreadOnly: true", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue(makeResponse([makeNotification()]));
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId('notif-item')).toHaveLength(1);
    });

    await user.click(screen.getByRole('button', { name: 'Unread' }));

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith(1, true);
    });
  });

  it("clicking 'All' after 'Unread' reverts to unreadOnly: false", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue(makeResponse([makeNotification()]));
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId('notif-item')).toHaveLength(1);
    });

    await user.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() => expect(mockList).toHaveBeenCalledWith(1, true));

    await user.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => {
      expect(mockList).toHaveBeenLastCalledWith(1, false);
    });
  });
});
