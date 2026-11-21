import { t } from '@brewform/shared/i18n';
import type { PaginatedResponse } from '@brewform/shared/schemas';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../api/index.ts', () => ({
  adminApi: { getAuditLog: vi.fn() },
}));

import { adminApi } from '../../api/index.ts';
import type { AuditLogEntry } from '../../api/types.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { loader } from './AdminAuditLogPage.data.ts';
import { AdminAuditLogPage } from './AdminAuditLogPage.tsx';

const mockGetAuditLog = vi.mocked(adminApi.getAuditLog);

/** Builds the paginated audit-log envelope. */
function logsPage(
  entries: AuditLogEntry[],
  page = 1,
  totalPages = 1,
): PaginatedResponse<AuditLogEntry> {
  return {
    success: true,
    data: entries,
    meta: { requestId: 't', pagination: { page, perPage: 50, total: entries.length, totalPages } },
  };
}

const ENTRY: AuditLogEntry = {
  id: 'a1',
  adminId: 'admin-1',
  action: 'recipe.delete',
  entityType: 'recipe',
  entityId: 'r1',
  details: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  admin: { username: 'root' },
};

/** Renders `/admin/audit-log` (at `entry`) through its real loader. */
function renderAuditLog(entry = '/admin/audit-log') {
  return renderWithAppProviders(
    [
      {
        path: '/admin/audit-log',
        loader,
        Component: AdminAuditLogPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: [entry], auth: 'admin', locale: 'tr' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('AdminAuditLogPage', () => {
  it('renders the Turkish heading and the rows from the loader', async () => {
    mockGetAuditLog.mockResolvedValue(logsPage([ENTRY]));
    renderAuditLog();

    expect(await screen.findByText('recipe.delete')).toBeInTheDocument();
    expect(screen.getByText(t('admin.auditLog', 'tr'))).toBeInTheDocument();
  });

  it('reads entityType and page from the URL for the API call', async () => {
    mockGetAuditLog.mockResolvedValue(logsPage([ENTRY], 2, 3));
    renderAuditLog('/admin/audit-log?entityType=recipe&page=2');

    await screen.findByText('recipe.delete');
    expect(mockGetAuditLog).toHaveBeenCalledWith(
      { page: '2', perPage: '50', entityType: 'recipe' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('a filter change goes back to page 1 and is written to the URL', async () => {
    mockGetAuditLog.mockResolvedValue(logsPage([ENTRY], 2, 3));
    const { router } = renderAuditLog('/admin/audit-log?page=2');
    await screen.findByText('recipe.delete');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'user' } });

    await waitFor(() => expect(router.state.location.search).toBe('?entityType=user'));
    await waitFor(() =>
      expect(mockGetAuditLog).toHaveBeenLastCalledWith(
        { page: '1', perPage: '50', entityType: 'user' },
        { signal: expect.any(AbortSignal) },
      ),
    );
  });

  it('pages with the real total and keeps the filter', async () => {
    mockGetAuditLog.mockImplementation(async (params) =>
      logsPage([ENTRY], Number(params?.page ?? 1), 3),
    );
    const { router } = renderAuditLog('/admin/audit-log?entityType=recipe');
    await screen.findByText('recipe.delete');

    fireEvent.click(screen.getByRole('button', { name: t('common.next', 'tr') }));

    await waitFor(() => expect(router.state.location.search).toBe('?entityType=recipe&page=2'));
  });

  it('renders the route error state when the loader fails', async () => {
    mockGetAuditLog.mockRejectedValue(new Error('boom'));
    renderAuditLog();

    expect(await screen.findByText(t('error.route.loadFailed', 'tr'))).toBeInTheDocument();
  });
});
