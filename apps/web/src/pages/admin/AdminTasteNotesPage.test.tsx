import { t } from '@brewform/shared/i18n';
import type { TasteNoteOutput } from '@brewform/shared/schemas';
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

vi.mock('../../api/static-cache.ts', () => ({
  getTasteNotesCached: vi.fn(),
  invalidateStaticCache: vi.fn(),
}));

vi.mock('../../api/index.ts', () => ({
  adminApi: { createTasteNote: vi.fn(), deleteTasteNote: vi.fn() },
}));

import { adminApi } from '../../api/index.ts';
import { getTasteNotesCached, invalidateStaticCache } from '../../api/static-cache.ts';
import { RouteErrorState } from '../../components/RouteErrorState.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './AdminTasteNotesPage.data.ts';
import { AdminTasteNotesPage } from './AdminTasteNotesPage.tsx';

const mockApi = vi.mocked(adminApi);
const mockGetTasteNotesCached = vi.mocked(getTasteNotesCached);
const mockInvalidateStaticCache = vi.mocked(invalidateStaticCache);

const FRUITY = { id: 'tn-1', name: 'Fruity', depth: 0, parentId: null } as TasteNoteOutput;

/** Renders `/admin/taste-notes` through its real loader and action. */
function renderPage(locale: 'en' | 'tr' = 'en') {
  return renderWithAppProviders(
    [
      {
        path: '/admin/taste-notes',
        loader,
        action,
        Component: AdminTasteNotesPage,
        errorElement: <RouteErrorState />,
      },
    ],
    { initialEntries: ['/admin/taste-notes'], auth: 'admin', locale },
  );
}

/** Opens the add form, types a name and submits it. */
async function createBerry() {
  await userEvent.click(screen.getByRole('button', { name: t('admin.tasteNotes.add') }));
  await userEvent.type(screen.getByLabelText(/Name \*/), 'Berry');
  await userEvent.click(screen.getByRole('button', { name: t('common.create') }));
}

/** Clicks Delete and confirms in the shared dialog. */
async function confirmDelete(locale: 'en' | 'tr' = 'en') {
  await userEvent.click(screen.getByRole('button', { name: t('common.delete', locale) }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(within(dialog).getByRole('button', { name: t('common.delete', locale) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockGetTasteNotesCached.mockResolvedValue([FRUITY]);
});

describe('AdminTasteNotesPage', () => {
  it('renders the taste notes from the loader (through the static cache)', async () => {
    renderPage();

    expect(await screen.findByText('Fruity')).toBeInTheDocument();
    expect(mockGetTasteNotesCached).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  it('create flow: action creates, invalidates the static cache once and revalidates', async () => {
    const berry = { id: 'tn-2', name: 'Berry', depth: 0, parentId: null } as TasteNoteOutput;
    mockApi.createTasteNote.mockResolvedValue(berry);
    renderPage();
    await screen.findByText('Fruity');

    mockGetTasteNotesCached.mockResolvedValue([FRUITY, berry]);
    await createBerry();

    expect(await screen.findByText('Berry')).toBeInTheDocument();
    expect(mockApi.createTasteNote).toHaveBeenCalledWith(
      { name: 'Berry', parentId: undefined },
      { signal: expect.any(AbortSignal) },
    );
    expect(mockInvalidateStaticCache).toHaveBeenCalledTimes(1);
  });

  it('delete flow: confirm, action deletes and invalidates the static cache once', async () => {
    mockApi.deleteTasteNote.mockResolvedValue({ message: 'ok' });
    renderPage();
    await screen.findByText('Fruity');

    await confirmDelete();

    await waitFor(() => expect(mockApi.deleteTasteNote).toHaveBeenCalledTimes(1));
    expect(mockInvalidateStaticCache).toHaveBeenCalledTimes(1);
  });

  it('a failed create toasts and does NOT invalidate the static cache', async () => {
    mockApi.createTasteNote.mockRejectedValue(new Error('Network error'));
    renderPage();
    await screen.findByText('Fruity');

    await createBerry();

    expect(await screen.findByText(t('admin.tasteNotes.createError'))).toBeInTheDocument();
    expect(mockInvalidateStaticCache).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('a failed delete toasts (Turkish) and does NOT invalidate the static cache', async () => {
    mockApi.deleteTasteNote.mockRejectedValue(new Error('Network error'));
    renderPage('tr');
    await screen.findByText('Fruity');

    await confirmDelete('tr');

    expect(await screen.findByText(t('admin.tasteNotes.deleteFailed', 'tr'))).toBeInTheDocument();
    expect(mockInvalidateStaticCache).not.toHaveBeenCalled();
  });

  it('renders the route error state when the loader fails', async () => {
    mockGetTasteNotesCached.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText(t('error.route.loadFailed'))).toBeInTheDocument();
  });
});
