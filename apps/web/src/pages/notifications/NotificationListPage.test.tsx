// ── Module-level mocks (hoisted by Vitest — MUST come before imports) ──

vi.mock('../../api/index.ts', () => ({
  notificationApi: {
    list: vi.fn(),
    markAllRead: vi.fn(),
    markRead: vi.fn(),
    unreadCount: vi.fn(),
  },
}));

vi.mock('../../utils/logger.ts', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: () => null,
}));

// Stub NotificationItem + PaginationControls so this test targets the page shell.
vi.mock('../../components/layout/NotificationItem.tsx', () => ({
  NotificationItem: ({
    notification,
  }: {
    notification: { id: string; actorUsername: string | null };
  }) => <div data-testid="notif-item">{notification.actorUsername}</div>,
}));

vi.mock('../../components/recipe-list/index.ts', () => ({
  PaginationControls: ({
    page,
    totalPages,
    onPageChange,
  }: {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  }) => (
    <nav data-testid="pagination">
      page {page}/{totalPages}
      <button type="button" onClick={() => onPageChange(page - 1)}>
        Previous
      </button>
      <button type="button" onClick={() => onPageChange(page + 1)}>
        Next
      </button>
    </nav>
  ),
}));

// ── Imports (after all vi.mock calls) ──

import { t } from '@brewform/shared/i18n';
import type { NotificationOutput, PaginatedResponse } from '@brewform/shared/schemas';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors.ts';
import { notificationApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { markAllReadAction } from '../../routes/resources/notifications.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { loader } from './NotificationListPage.data.ts';
import { NotificationListPage } from './NotificationListPage.tsx';

const mockList = vi.mocked(notificationApi.list);
const mockMarkAllRead = vi.mocked(notificationApi.markAllRead);

/** The request options every loader call forwards. */
const SIGNAL = { signal: expect.any(AbortSignal) };

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

/** Renders `/notifications` (or `entry`) through its real loader and the read-all action. */
function renderAt(entry = '/notifications', locale: 'en' | 'tr' = 'en') {
  return renderWithAppProviders(
    [
      {
        path: '/notifications',
        loader,
        Component: NotificationListPage,
        errorElement: <RouteErrorState />,
      },
      { path: '/resources/notifications/read-all', action: markAllReadAction },
    ],
    { initialEntries: [entry], auth: 'user', locale },
  ).router;
}

/** Renders `/notifications` in `locale`. */
function renderPage(locale: 'en' | 'tr' = 'en') {
  return renderAt('/notifications', locale);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockMarkAllRead.mockResolvedValue({ message: 'ok' });
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
    expect(mockList).toHaveBeenCalledWith(1, false, SIGNAL);
  });

  it('shows the empty state when there are no notifications', async () => {
    mockList.mockResolvedValue(makeResponse([]));
    renderPage();

    expect(await screen.findByText(t('notifications.empty'))).toBeInTheDocument();
  });

  it('marks all notifications as read through the action without reloading the page', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue(makeResponse([makeNotification({ readAt: null })]));
    renderPage();

    const button = await screen.findByText(t('notifications.markAllRead'));
    await user.click(button);

    await waitFor(() => expect(mockMarkAllRead).toHaveBeenCalledWith(SIGNAL));
    await waitFor(() =>
      expect(screen.queryByText(t('notifications.markAllRead'))).not.toBeInTheDocument(),
    );
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('shows an error toast and keeps the button when mark-all-read fails', async () => {
    const user = userEvent.setup();
    mockMarkAllRead.mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', undefined, 500));
    mockList.mockResolvedValue(makeResponse([makeNotification({ readAt: null })]));
    renderPage();

    await user.click(await screen.findByText(t('notifications.markAllRead')));

    expect(await screen.findByText(t('notifications.markAllReadError'))).toBeInTheDocument();
    expect(screen.getByText(t('notifications.markAllRead'))).toBeInTheDocument();
  });

  it('renders the route error state (not the empty state) when the load fails', async () => {
    mockList.mockRejectedValue(new ApiError('INTERNAL_ERROR', 'boom', undefined, 500));
    renderPage();

    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
    expect(screen.queryByText(t('notifications.empty'))).not.toBeInTheDocument();
  });

  it('renders pagination controls when there is more than one page', async () => {
    mockList.mockResolvedValue(makeResponse([makeNotification()], 3));
    renderPage();

    expect(await screen.findByTestId('pagination')).toHaveTextContent('page 1/3');
  });

  it('renders the title in Turkish when locale is tr', async () => {
    mockList.mockResolvedValue(makeResponse([]));
    renderPage('tr');

    expect(
      await screen.findByRole('heading', { name: t('notifications.title', 'tr') }),
    ).toBeInTheDocument();
    expect(screen.getByText(t('notifications.empty', 'tr'))).toBeInTheDocument();
  });

  it('initial render loads notifications with unread filter off (default All)', async () => {
    mockList.mockResolvedValue(makeResponse([makeNotification()]));
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId('notif-item')).toHaveLength(1);
    });
    expect(mockList).toHaveBeenCalledWith(1, false, SIGNAL);
  });

  it("clicking the 'Unread' filter calls notificationApi.list with unreadOnly: true", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue(makeResponse([makeNotification()]));
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId('notif-item')).toHaveLength(1);
    });

    await user.click(screen.getByRole('button', { name: t('notifications.unread') }));

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith(1, true, SIGNAL);
    });
  });

  it("clicking 'All' after 'Unread' reverts to unreadOnly: false", async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue(makeResponse([makeNotification()]));
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByTestId('notif-item')).toHaveLength(1);
    });

    await user.click(screen.getByRole('button', { name: t('notifications.unread') }));
    await waitFor(() => expect(mockList).toHaveBeenCalledWith(1, true, SIGNAL));

    await user.click(screen.getByRole('button', { name: t('notifications.all') }));
    await waitFor(() => {
      expect(mockList).toHaveBeenLastCalledWith(1, false, SIGNAL);
    });
  });
});

describe('NotificationListPage loader', () => {
  /** Calls the loader for `url`. */
  function runLoader(url: string, signal?: AbortSignal) {
    return loader({
      request: new Request(url, signal ? { signal } : undefined),
      params: {},
      context: undefined,
    } as never);
  }

  it('reads ?page and ?unreadOnly and forwards the request signal', async () => {
    mockList.mockResolvedValue(makeResponse([]));
    const controller = new AbortController();

    await runLoader('http://localhost/notifications?page=2&unreadOnly=true', controller.signal);

    expect(mockList).toHaveBeenCalledWith(2, true, SIGNAL);
    const opts = mockList.mock.calls[0][2];
    controller.abort();
    expect(opts?.signal?.aborted).toBe(true);
  });

  it('redirects a final 401 to /login with the encoded return path', async () => {
    mockList.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no session', undefined, 401));

    const thrown = await runLoader('http://localhost/notifications?unreadOnly=true').catch(
      (err: unknown) => err,
    );

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get('Location')).toBe(
      '/login?next=%2Fnotifications%3FunreadOnly%3Dtrue',
    );
  });
});

describe('NotificationListPage — canonical URL state', () => {
  it('switching to All drops both unreadOnly and page from the URL', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue(makeResponse([makeNotification()], 4, 3));
    const router = renderAt('/notifications?unreadOnly=true&page=3');
    await waitFor(() => expect(screen.getAllByTestId('notif-item')).toHaveLength(1));
    expect(mockList).toHaveBeenCalledWith(3, true, SIGNAL);

    await user.click(screen.getByRole('button', { name: t('notifications.all') }));

    await waitFor(() => expect(router.state.location.search).toBe(''));
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith(1, false, SIGNAL));
  });

  it('paging keeps the filter and omits page 1', async () => {
    const user = userEvent.setup();
    mockList.mockImplementation(async (page: number) =>
      makeResponse([makeNotification()], 3, page),
    );
    const router = renderAt('/notifications?unreadOnly=true&page=2');
    await screen.findByText('page 2/3');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(router.state.location.search).toBe('?unreadOnly=true&page=3'));
    await screen.findByText('page 3/3');

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(router.state.location.search).toBe('?unreadOnly=true&page=2'));
    await screen.findByText('page 2/3');

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(router.state.location.search).toBe('?unreadOnly=true'));
  });

  it('normalises an invalid page to 1 without an error', async () => {
    mockList.mockResolvedValue(makeResponse([makeNotification()]));
    renderAt('/notifications?page=abc');
    await waitFor(() => expect(screen.getAllByTestId('notif-item')).toHaveLength(1));
    expect(mockList).toHaveBeenCalledWith(1, false, SIGNAL);
  });
});
