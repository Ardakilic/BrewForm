import { t } from '@brewform/shared/i18n';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('../../api/index.ts', () => ({
  adminApi: { getCompatibility: vi.fn(), setCompatibility: vi.fn(), flushCache: vi.fn() },
}));

import { ApiError } from '../../api/errors.ts';
import { adminApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './AdminCompatibilityPage.data.ts';
import { AdminCompatibilityPage } from './AdminCompatibilityPage.tsx';

const mockApi = vi.mocked(adminApi);

const RULE = { id: 'c1', brewMethod: 'pour_over', equipmentType: 'grinder', isCompatible: true };

/** Renders `/admin/compatibility` through its real loader and action. */
function renderPage() {
  return renderWithAppProviders(
    [
      {
        path: '/admin/compatibility',
        loader,
        action,
        Component: AdminCompatibilityPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: ['/admin/compatibility'], auth: 'admin', locale: 'tr' },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockApi.getCompatibility.mockResolvedValue([RULE]);
});

describe('AdminCompatibilityPage', () => {
  it('renders the Turkish heading and the rules from the loader', async () => {
    renderPage();

    expect(await screen.findByText(t('admin.compatibility.title', 'tr'))).toBeInTheDocument();
    expect(screen.getByText('pour over')).toBeInTheDocument();
  });

  it('toggles a rule through the action and revalidates the loader', async () => {
    mockApi.setCompatibility.mockResolvedValue({ ...RULE, isCompatible: false });
    renderPage();
    await screen.findByText('pour over');

    mockApi.getCompatibility.mockResolvedValue([{ ...RULE, isCompatible: false }]);
    fireEvent.click(screen.getByRole('button', { name: t('common.yes', 'tr') }));

    await waitFor(() =>
      expect(mockApi.setCompatibility).toHaveBeenCalledWith('c1', false, {
        signal: expect.any(AbortSignal),
      }),
    );
    expect(await screen.findByRole('button', { name: t('common.no', 'tr') })).toBeInTheDocument();
  });

  it('shows an error toast and keeps the page when the toggle fails', async () => {
    mockApi.setCompatibility.mockRejectedValue(new ApiError('INTERNAL', 'boom', undefined, 500));
    renderPage();
    await screen.findByText('pour over');

    fireEvent.click(screen.getByRole('button', { name: t('common.yes', 'tr') }));

    expect(await screen.findByText(t('admin.compatibility.toggleError', 'tr'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('common.yes', 'tr') })).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('shows an error toast when the cache flush fails', async () => {
    mockApi.flushCache.mockRejectedValue(new Error('down'));
    renderPage();
    await screen.findByText('pour over');

    fireEvent.click(screen.getByRole('button', { name: t('admin.flushCache', 'tr') }));

    expect(await screen.findByText(t('admin.compatibility.flushError', 'tr'))).toBeInTheDocument();
  });

  it('the action returns { ok: false } for an unknown intent', async () => {
    const form = new FormData();
    form.set('intent', 'bogus');
    const result = await action({
      request: new Request('http://localhost/admin/compatibility', { method: 'POST', body: form }),
      params: {},
      context: undefined,
    } as never);
    expect(result).toMatchObject({ ok: false, intent: 'bogus' });
  });
});
