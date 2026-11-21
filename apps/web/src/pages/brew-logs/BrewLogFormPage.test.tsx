import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  brewLogApi: { create: vi.fn(), update: vi.fn(), get: vi.fn() },
  recipeApi: { get: vi.fn() },
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  I18nProvider: ({ children }: { children: ReactNode }) => children,
  useTranslation: vi.fn(),
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

// ── Imports after mocks ────────────────────────────────────────────────────

import type { BrewLogOutput, RecipeDetailOutput } from '@brewform/shared/schemas';
import type { ReactNode } from 'react';
import { ApiError } from '../../api/errors.ts';
import { brewLogApi, recipeApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { action, loader } from './BrewLogFormPage.data.ts';
import { BrewLogFormPage } from './BrewLogFormPage.tsx';

const mockUseTranslation = vi.mocked(useTranslation);
const mockCreate = vi.mocked(brewLogApi.create);
const mockUpdate = vi.mocked(brewLogApi.update);
const mockGetLog = vi.mocked(brewLogApi.get);
const mockRecipeGet = vi.mocked(recipeApi.get);

// ── Translation helper ─────────────────────────────────────────────────────

const enT = (key: string) => {
  const map: Record<string, string> = {
    'brewLog.form.titleCreate': 'Log Brew',
    'brewLog.form.titleEdit': 'Edit Brew Log',
    'brewLog.form.brewedAt': 'Brewed At',
    'brewLog.form.yieldActual': 'Yield (g)',
    'brewLog.form.yieldActual.placeholder': 'e.g. 36',
    'brewLog.form.doseActual': 'Dose (g)',
    'brewLog.form.doseActual.placeholder': 'e.g. 18',
    'brewLog.form.notes': 'Notes',
    'brewLog.form.notes.placeholder': 'Grind setting, taste impressions...',
    'brewLog.form.personalRating': 'Personal Rating',
    'brewLog.form.submitCreate': 'Log Brew',
    'brewLog.form.submitUpdate': 'Update',
    'brewLog.form.error.positive': 'Must be a positive number.',
    'brewLog.form.error.ratingRange': 'Rating must be between 1 and 10.',
    'brewLog.error.createFailed': 'Failed to log brew.',
    'brewLog.error.updateFailed': 'Failed to update brew log.',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

// ── Fixtures ───────────────────────────────────────────────────────────────

/** Minimal `RecipeDetailOutput` fixture — the page reads only `versions`/`currentVersion`. */
const sampleRecipe = {
  id: 'r1',
  currentVersion: {
    id: 'v2',
    groundWeightGrams: 18,
    extractionVolumeMl: 36,
  },
  versions: [
    { id: 'v1', groundWeightGrams: 15, extractionVolumeMl: 250 },
    { id: 'v2', groundWeightGrams: 18, extractionVolumeMl: 36 },
  ],
} as unknown as RecipeDetailOutput;

const sampleLog: BrewLogOutput = {
  id: 'bl1',
  userId: 'u1',
  recipeId: 'r1',
  recipeVersionId: 'v2',
  brewedAt: '2026-03-15T09:30:00Z',
  yieldActual: 40,
  doseActual: 20,
  notes: 'Bitter',
  personalRating: 5,
  createdAt: '2026-03-15T09:30:00Z',
  updatedAt: '2026-03-15T09:30:00Z',
};

const HydrateFallback = () => null;

/** Renders the create route (real loader and action) next to a stub journal page. */
function renderCreatePage(initialEntry = '/brew-logs/new?recipeId=r1&recipeVersionId=v2') {
  return renderWithAppProviders(
    [
      { path: '/brew-logs/new', element: <BrewLogFormPage />, loader, action, HydrateFallback },
      { path: '/brew-logs', element: <div>journal page</div> },
    ],
    { initialEntries: [initialEntry], auth: 'user' },
  );
}

/** Renders the edit route for log `bl1` (real loader and action) next to a stub journal page. */
function renderEditPage() {
  return renderWithAppProviders(
    [
      {
        path: '/brew-logs/:id/edit',
        element: <BrewLogFormPage />,
        loader,
        action,
        HydrateFallback,
      },
      { path: '/brew-logs', element: <div>journal page</div> },
    ],
    { initialEntries: ['/brew-logs/bl1/edit'], auth: 'user' },
  );
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockRecipeGet.mockResolvedValue(sampleRecipe);
  mockGetLog.mockResolvedValue(sampleLog);
  mockCreate.mockResolvedValue({} as Awaited<ReturnType<typeof brewLogApi.create>>);
  mockUpdate.mockResolvedValue({} as Awaited<ReturnType<typeof brewLogApi.update>>);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('BrewLogFormPage — loader', () => {
  it('redirects to /brew-logs when create mode has no recipeId', async () => {
    await expect(
      loader({ params: {}, request: new Request('http://localhost/brew-logs/new') }),
    ).rejects.toMatchObject({ status: 302 });
  });

  it('fetches the recipe in create mode', async () => {
    await loader({
      params: {},
      request: new Request('http://localhost/brew-logs/new?recipeId=r1'),
    });

    expect(mockRecipeGet).toHaveBeenCalledWith('r1', { signal: expect.any(AbortSignal) });
  });

  it('fetches the log in edit mode', async () => {
    const data = await loader({
      params: { id: 'bl1' },
      request: new Request('http://localhost/brew-logs/bl1/edit'),
    });

    expect(mockGetLog).toHaveBeenCalledWith('bl1', { signal: expect.any(AbortSignal) });
    expect(data).toEqual({ mode: 'edit', logId: 'bl1', editLog: sampleLog });
    expect(mockRecipeGet).not.toHaveBeenCalled();
  });

  it('redirects to /brew-logs when the edit log fetch fails with 404', async () => {
    mockGetLog.mockRejectedValue(new ApiError('NOT_FOUND', 'not found', undefined, 404));

    const thrown = await loader({
      params: { id: 'missing' },
      request: new Request('http://localhost/brew-logs/missing/edit'),
    }).catch((err: unknown) => err);

    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get('Location')).toBe('/brew-logs');
  });

  it('redirects a final 401 to /login with the encoded return path (requireAuth)', async () => {
    mockGetLog.mockRejectedValue(new ApiError('UNAUTHORIZED', 'no session', undefined, 401));

    const thrown = await loader({
      params: { id: 'bl1' },
      request: new Request('http://localhost/brew-logs/bl1/edit'),
    }).catch((err: unknown) => err);

    expect((thrown as Response).headers.get('Location')).toBe(
      '/login?next=%2Fbrew-logs%2Fbl1%2Fedit',
    );
  });

  it('rethrows unexpected edit loader errors for the error boundary', async () => {
    const boom = new ApiError('INTERNAL', 'server error', undefined, 500);
    mockGetLog.mockRejectedValue(boom);

    await expect(
      loader({
        params: { id: 'bl1' },
        request: new Request('http://localhost/brew-logs/bl1/edit'),
      }),
    ).rejects.toBe(boom);
  });
});

describe('BrewLogFormPage — create mode', () => {
  it('prefills dose and yield from the requested recipe version', async () => {
    renderCreatePage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Log Brew' })).toBeInTheDocument();
    });

    expect((screen.getByLabelText('Dose (g)') as HTMLInputElement).value).toBe('18');
    expect((screen.getByLabelText('Yield (g)') as HTMLInputElement).value).toBe('36');
  });

  it('creates a brew log and navigates to /brew-logs on submit', async () => {
    renderCreatePage();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Log Brew' })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Notes'), 'Great shot');
    await user.click(screen.getByRole('button', { name: 'Log Brew' }));

    await waitFor(() => {
      expect(screen.getByText('journal page')).toBeInTheDocument();
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][1]).toEqual({ signal: expect.any(AbortSignal) });
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.recipeId).toBe('r1');
    expect(payload.recipeVersionId).toBe('v2');
    expect(payload.doseActual).toBe(18);
    expect(payload.yieldActual).toBe(36);
    expect(payload.notes).toBe('Great shot');
  });

  it('shows an error toast and keeps the typed values when the create action fails', async () => {
    mockCreate.mockRejectedValue(new ApiError('SERVER_ERROR', 'boom', undefined, 500));
    renderCreatePage();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Log Brew' })).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText('Notes'), 'Great shot');
    await user.click(screen.getByRole('button', { name: 'Log Brew' }));

    expect(await screen.findByText('Failed to log brew.')).toBeInTheDocument();
    expect(screen.queryByText('journal page')).not.toBeInTheDocument();
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Great shot');
    expect(mockRecipeGet).toHaveBeenCalledTimes(1);
  });
});

describe('BrewLogFormPage — edit mode', () => {
  it('prefills the form from the fetched log', async () => {
    renderEditPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Edit Brew Log' })).toBeInTheDocument();
    });

    expect((screen.getByLabelText('Yield (g)') as HTMLInputElement).value).toBe('40');
    expect((screen.getByLabelText('Dose (g)') as HTMLInputElement).value).toBe('20');
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Bitter');
    expect((screen.getByLabelText('Personal Rating') as HTMLInputElement).value).toBe('5');
  });

  it('updates the brew log with all form values on submit', async () => {
    renderEditPage();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText('Notes'));
    await user.type(screen.getByLabelText('Notes'), 'Smoother now');
    await user.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => {
      expect(screen.getByText('journal page')).toBeInTheDocument();
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [id, patch] = mockUpdate.mock.calls[0];
    expect(id).toBe('bl1');
    expect(patch.notes).toBe('Smoother now');
    expect(patch.yieldActual).toBe(40);
    expect(patch.doseActual).toBe(20);
    expect(patch.personalRating).toBe(5);
    expect(patch.brewedAt).toBeTypeOf('string');
  });

  it('shows an error toast and stays on the page when the update action fails', async () => {
    mockUpdate.mockRejectedValue(new Error('network down'));
    renderEditPage();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Update' }));

    expect(await screen.findByText('Failed to update brew log.')).toBeInTheDocument();
    expect(screen.queryByText('journal page')).not.toBeInTheDocument();
  });

  it('redirects to /brew-logs when the log fetch fails with 404', async () => {
    mockGetLog.mockRejectedValue(new ApiError('NOT_FOUND', 'not found', undefined, 404));
    renderEditPage();

    await waitFor(() => {
      expect(screen.getByText('journal page')).toBeInTheDocument();
    });
  });
});

describe('BrewLogFormPage — action', () => {
  /** Runs the action with a JSON body for the given route params. */
  function runAction(params: Record<string, string>, body: unknown) {
    return action({
      params,
      request: new Request('http://localhost/brew-logs/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      context: undefined,
    } as never);
  }

  const values = {
    brewedAt: '2026-03-15T09:30:00.000Z',
    yieldActual: 36,
    doseActual: null,
    notes: null,
    personalRating: 7,
  };

  it('creates the log with request.signal and returns { ok: true }', async () => {
    await expect(runAction({}, { values, recipeId: 'r1', recipeVersionId: 'v2' })).resolves.toEqual(
      {
        ok: true,
        mode: 'create',
      },
    );
    expect(mockCreate).toHaveBeenCalledWith(
      {
        recipeId: 'r1',
        recipeVersionId: 'v2',
        brewedAt: values.brewedAt,
        yieldActual: 36,
        doseActual: undefined,
        notes: undefined,
        personalRating: 7,
      },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('updates log :id and returns { ok: true }', async () => {
    await expect(runAction({ id: 'bl1' }, { values })).resolves.toEqual({ ok: true, mode: 'edit' });
    expect(mockUpdate).toHaveBeenCalledWith(
      'bl1',
      { ...values },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('returns { ok: false } instead of throwing when the API fails', async () => {
    mockUpdate.mockRejectedValue(new ApiError('VALIDATION_ERROR', 'bad', undefined, 400));

    await expect(runAction({ id: 'bl1' }, { values })).resolves.toMatchObject({
      ok: false,
      mode: 'edit',
      error: 'bad',
      code: 'VALIDATION_ERROR',
    });
  });

  it('returns { ok: false } for a create without a recipe id', async () => {
    await expect(runAction({}, { values })).resolves.toMatchObject({ ok: false, mode: 'create' });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
