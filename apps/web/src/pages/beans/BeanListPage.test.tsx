import { t } from '@brewform/shared/i18n';
import type { BeanOutput } from '@brewform/shared/schemas';
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
  beanApi: { list: vi.fn(), create: vi.fn(), delete: vi.fn() },
}));

import { ApiError } from '../../api/errors.ts';
import { beanApi } from '../../api/index.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './BeanListPage.data.ts';
import { BeanListPage } from './BeanListPage.tsx';

const mockApi = vi.mocked(beanApi);

const BEANS = [
  {
    id: 'bean-1',
    name: 'Ethiopian Yirgacheffe',
    brand: 'Onyx',
    vendorId: null,
    roaster: null,
    roastLevel: 'Light',
    processing: 'Washed',
    origin: 'Ethiopia',
    userId: 'user-1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
  },
  {
    id: 'bean-2',
    name: 'Colombia Geisha',
    brand: null,
    vendorId: null,
    roaster: null,
    roastLevel: 'Medium',
    processing: 'Natural',
    origin: 'Colombia',
    userId: 'user-1',
    createdAt: '2025-01-02T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    deletedAt: null,
  },
] as unknown as BeanOutput[];

/** Renders `/beans` through its real loader and action. */
function renderPage() {
  return renderWithAppProviders(
    [
      {
        path: '/beans',
        loader,
        action,
        Component: BeanListPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: ['/beans'], auth: 'user', locale: 'en' },
  );
}

/** Runs the action with the given form fields. */
function runAction(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const request = new Request('http://localhost/beans', { method: 'POST', body: form });
  return { request, result: action({ request, params: {}, context: undefined } as never) };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockApi.list.mockResolvedValue(BEANS);
});

describe('/beans loader and action', () => {
  it('loads the beans with request.signal', async () => {
    const request = new Request('http://localhost/beans');
    await expect(loader({ request, params: {}, context: undefined } as never)).resolves.toEqual({
      beans: BEANS,
    });
    expect(mockApi.list).toHaveBeenCalledWith({ signal: request.signal });
  });

  it('redirects a final 401 to the login page with a return path', async () => {
    mockApi.list.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no', undefined, 401));
    const request = new Request('http://localhost/beans');
    const thrown = await loader({ request, params: {}, context: undefined } as never).catch(
      (e: unknown) => e,
    );
    expect((thrown as Response).headers.get('Location')).toBe('/login?next=%2Fbeans');
  });

  it('create omits empty optional fields and forwards request.signal', async () => {
    mockApi.create.mockResolvedValue(BEANS[0]);
    const { request, result } = runAction({
      intent: 'create',
      name: 'Kenya AA',
      brand: '',
      origin: 'Kenya',
      processing: '',
      roastLevel: '',
    });
    await expect(result).resolves.toEqual({ ok: true, intent: 'create' });
    expect(mockApi.create).toHaveBeenCalledWith(
      {
        name: 'Kenya AA',
        brand: undefined,
        origin: 'Kenya',
        processing: undefined,
        roastLevel: undefined,
      },
      { signal: request.signal },
    );
  });

  it('delete returns { ok: false } on an API failure instead of throwing', async () => {
    mockApi.delete.mockRejectedValue(new ApiError('INTERNAL', 'boom', undefined, 500));
    await expect(runAction({ intent: 'delete', id: 'bean-1' }).result).resolves.toEqual({
      ok: false,
      intent: 'delete',
      error: 'boom',
      code: 'INTERNAL',
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(ApiError), beanId: 'bean-1' },
      'BeanListPage deleteBean failed',
    );
  });
});

describe('BeanListPage', () => {
  it('renders the bean list from the loader', async () => {
    renderPage();
    expect(await screen.findByText('Ethiopian Yirgacheffe')).toBeInTheDocument();
    expect(screen.getByText('Colombia Geisha')).toBeInTheDocument();
  });

  it('renders the empty state message when no beans exist', async () => {
    mockApi.list.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(t('bean.noBeansYet'))).toBeInTheDocument();
  });

  it('renders the route error state when the load fails', async () => {
    mockApi.list.mockRejectedValue(new Error('Network error'));
    renderPage();
    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
  });

  it('creates a bean through the action, closes the form and shows the revalidated list', async () => {
    mockApi.create.mockResolvedValue(BEANS[0]);
    renderPage();
    await screen.findByText('Ethiopian Yirgacheffe');

    await userEvent.click(screen.getByRole('button', { name: t('bean.addBean') }));
    await userEvent.type(screen.getByLabelText(t('common.name')), 'Kenya AA');
    mockApi.list.mockResolvedValue([...BEANS, { ...BEANS[0], id: 'bean-3', name: 'Kenya AA' }]);
    await userEvent.click(screen.getByRole('button', { name: t('bean.addBeanTitle') }));

    expect(await screen.findByText('Kenya AA')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText(t('common.name'))).not.toBeInTheDocument());
  });

  it('shows an error toast and keeps the form when create fails', async () => {
    mockApi.create.mockRejectedValue(new Error('down'));
    renderPage();
    await screen.findByText('Ethiopian Yirgacheffe');

    await userEvent.click(screen.getByRole('button', { name: t('bean.addBean') }));
    await userEvent.type(screen.getByLabelText(t('common.name')), 'Kenya AA');
    await userEvent.click(screen.getByRole('button', { name: t('bean.addBeanTitle') }));

    expect(await screen.findByText(t('bean.error.createFailed'))).toBeInTheDocument();
    expect(screen.getByLabelText(t('common.name'))).toHaveValue('Kenya AA');
  });

  it('shows an error toast when delete fails', async () => {
    mockApi.delete.mockRejectedValue(new Error('Network error'));
    renderPage();
    await screen.findByText('Ethiopian Yirgacheffe');

    await userEvent.click(screen.getAllByRole('button', { name: t('common.delete') })[0]);
    // The shared ConfirmProvider (from AppProviders) asks first; confirm inside the dialog.
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: t('common.delete') }));

    expect(await screen.findByText(t('bean.error.deleteFailed'))).toBeInTheDocument();
    expect(mockApi.delete).toHaveBeenCalledWith('bean-1', { signal: expect.any(AbortSignal) });
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('logs mount and unmount', async () => {
    const { unmount } = renderPage();
    await screen.findByText('Ethiopian Yirgacheffe');
    // The mount effect runs after the commit that renders the loader data.
    await waitFor(() => expect(mockLogger.debug).toHaveBeenCalledWith({}, 'BeanListPage mounted'));
    unmount();
    expect(mockLogger.debug).toHaveBeenCalledWith({}, 'BeanListPage unmounted');
  });
});
