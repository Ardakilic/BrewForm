import { t } from '@brewform/shared/i18n';
import type { SetupOutput } from '@brewform/shared/schemas';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: () => null,
}));

vi.mock('../../api/index.ts', () => ({
  setupApi: { list: vi.fn(), create: vi.fn(), delete: vi.fn() },
}));

import { ApiError } from '../../api/errors.ts';
import { setupApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './SetupListPage.data.ts';
import { SetupListPage } from './SetupListPage.tsx';

const mockApi = vi.mocked(setupApi);

const SETUPS = [
  {
    id: 'setup-1',
    name: 'V60 Setup',
    userId: 'user-1',
    brewerDetails: 'Hario V60',
    grinder: 'Niche Zero',
    portafilterId: null,
    basketId: null,
    puckScreenId: null,
    paperFilterId: null,
    tamperId: null,
    isDefault: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
  },
  {
    id: 'setup-2',
    name: 'Espresso Setup',
    userId: 'user-1',
    brewerDetails: null,
    grinder: 'Mazzer',
    portafilterId: null,
    basketId: null,
    puckScreenId: null,
    paperFilterId: null,
    tamperId: null,
    isDefault: false,
    createdAt: '2025-01-02T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    deletedAt: null,
  },
] as unknown as SetupOutput[];

/** Renders `/setups` through its real loader and action. */
function renderPage() {
  return renderWithAppProviders(
    [
      {
        path: '/setups',
        loader,
        action,
        Component: SetupListPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: ['/setups'], auth: 'user', locale: 'en' },
  );
}

/** Runs the action with the given form fields. */
function runAction(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const request = new Request('http://localhost/setups', { method: 'POST', body: form });
  return { request, result: action({ request, params: {}, context: undefined } as never) };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockApi.list.mockResolvedValue(SETUPS);
});

describe('/setups loader and action', () => {
  it('loads the setups with request.signal', async () => {
    const request = new Request('http://localhost/setups');
    await expect(loader({ request, params: {}, context: undefined } as never)).resolves.toEqual({
      setups: SETUPS,
    });
    expect(mockApi.list).toHaveBeenCalledWith({ signal: request.signal });
  });

  it('redirects a final 401 to the login page with a return path', async () => {
    mockApi.list.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no', undefined, 401));
    const request = new Request('http://localhost/setups');
    const thrown = await loader({ request, params: {}, context: undefined } as never).catch(
      (e: unknown) => e,
    );
    expect((thrown as Response).headers.get('Location')).toBe('/login?next=%2Fsetups');
  });

  it('create trims the name, never sets the default and forwards request.signal', async () => {
    mockApi.create.mockResolvedValue(SETUPS[1]);
    const { request, result } = runAction({
      intent: 'create',
      name: '  AeroPress  ',
      brewerDetails: '',
      grinder: 'Comandante',
    });
    await expect(result).resolves.toEqual({ ok: true, intent: 'create' });
    expect(mockApi.create).toHaveBeenCalledWith(
      { name: 'AeroPress', isDefault: false, brewerDetails: undefined, grinder: 'Comandante' },
      { signal: request.signal },
    );
  });

  it('returns { ok: false } on an API failure instead of throwing', async () => {
    mockApi.delete.mockRejectedValue(new Error('down'));
    await expect(runAction({ intent: 'delete', id: 'setup-1' }).result).resolves.toEqual({
      ok: false,
      intent: 'delete',
      error: 'down',
    });
  });
});

describe('SetupListPage', () => {
  it('renders the setup list from the loader, with the default badge', async () => {
    renderPage();
    expect(await screen.findByText('V60 Setup')).toBeInTheDocument();
    expect(screen.getByText('Espresso Setup')).toBeInTheDocument();
    expect(screen.getByText(t('setup.default'))).toBeInTheDocument();
  });

  it('renders the empty state message when no setups exist', async () => {
    mockApi.list.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(t('setup.noSetups'))).toBeInTheDocument();
  });

  it('renders the route error state when the load fails', async () => {
    mockApi.list.mockRejectedValue(new Error('Network error'));
    renderPage();
    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
  });

  it('creates a setup through the action and closes the form', async () => {
    mockApi.create.mockResolvedValue(SETUPS[1]);
    renderPage();
    await screen.findByText('V60 Setup');

    await userEvent.click(screen.getByRole('button', { name: t('setup.newSetup') }));
    await userEvent.type(screen.getByLabelText(`${t('setup.name')} *`), 'AeroPress');
    await userEvent.click(screen.getByRole('button', { name: t('setup.createSetup') }));

    await waitFor(() => expect(mockApi.create).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByLabelText(`${t('setup.name')} *`)).not.toBeInTheDocument(),
    );
    expect(mockApi.list).toHaveBeenCalledTimes(2);
  });

  it('shows an error toast and keeps the form when create fails', async () => {
    mockApi.create.mockRejectedValue(new Error('down'));
    renderPage();
    await screen.findByText('V60 Setup');

    await userEvent.click(screen.getByRole('button', { name: t('setup.newSetup') }));
    await userEvent.type(screen.getByLabelText(`${t('setup.name')} *`), 'AeroPress');
    await userEvent.click(screen.getByRole('button', { name: t('setup.createSetup') }));

    expect(await screen.findByText(t('setup.error.createFailed'))).toBeInTheDocument();
    expect(screen.getByLabelText(`${t('setup.name')} *`)).toHaveValue('AeroPress');
  });

  it('shows an error toast when delete fails', async () => {
    mockApi.delete.mockRejectedValue(new Error('down'));
    renderPage();
    await screen.findByText('V60 Setup');

    await userEvent.click(screen.getAllByRole('button', { name: t('common.delete') })[0]);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: t('common.delete') }));

    expect(await screen.findByText(t('setup.error.deleteFailed'))).toBeInTheDocument();
  });

  it('logs mount and unmount', async () => {
    const { unmount } = renderPage();
    await screen.findByText('V60 Setup');
    // The mount effect runs after the commit that renders the loader data.
    await waitFor(() => expect(mockLogger.debug).toHaveBeenCalledWith({}, 'SetupListPage mounted'));
    unmount();
    expect(mockLogger.debug).toHaveBeenCalledWith({}, 'SetupListPage unmounted');
  });
});
