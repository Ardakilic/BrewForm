import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

// ── Module mocks (hoisted) ─────────────────────────────────────────────────

vi.mock('../../api/index.ts', () => ({
  brewLogApi: { create: vi.fn(), update: vi.fn(), get: vi.fn() },
  recipeApi: { get: vi.fn() },
  ApiError: class extends Error {
    status: number;
    constructor(status: number) {
      super('api error');
      this.status = status;
    }
  },
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
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

import { useTranslation } from '../../contexts/I18nContext.tsx';
import { brewLogApi, recipeApi } from '../../api/index.ts';
import type { BrewLogOutput, RecipeDetailOutput } from '@brewform/shared/schemas';
import { ToastProvider } from '../../components/ui/Toast.tsx';
import { BrewLogFormPage, loader } from './BrewLogFormPage.tsx';

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

function renderCreatePage(initialEntry = '/brew-logs/new?recipeId=r1&recipeVersionId=v2') {
  const router = createMemoryRouter(
    [
      { path: '/brew-logs/new', element: <BrewLogFormPage />, loader, HydrateFallback },
      { path: '/brew-logs', element: <div>journal page</div> },
    ],
    { initialEntries: [initialEntry] },
  );
  return render(<RouterProvider router={router} />, { wrapper: ToastProvider });
}

function renderEditPage() {
  const router = createMemoryRouter(
    [
      { path: '/brew-logs/:id/edit', element: <BrewLogFormPage />, loader, HydrateFallback },
      { path: '/brew-logs', element: <div>journal page</div> },
    ],
    { initialEntries: [{ pathname: '/brew-logs/bl1/edit' }] },
  );
  return render(<RouterProvider router={router} />, { wrapper: ToastProvider });
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

    expect(mockRecipeGet).toHaveBeenCalledWith('r1');
  });

  it('fetches the log in edit mode', async () => {
    const data = await loader({
      params: { id: 'bl1' },
      request: new Request('http://localhost/brew-logs/bl1/edit'),
    });

    expect(mockGetLog).toHaveBeenCalledWith('bl1');
    expect(data).toEqual({ mode: 'edit', logId: 'bl1', editLog: sampleLog });
    expect(mockRecipeGet).not.toHaveBeenCalled();
  });

  it('redirects to /brew-logs when the edit log fetch fails', async () => {
    mockGetLog.mockRejectedValue(new Error('404'));

    await expect(
      loader({
        params: { id: 'missing' },
        request: new Request('http://localhost/brew-logs/missing/edit'),
      }),
    ).rejects.toMatchObject({ status: 302 });
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
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.recipeId).toBe('r1');
    expect(payload.recipeVersionId).toBe('v2');
    expect(payload.doseActual).toBe(18);
    expect(payload.yieldActual).toBe(36);
    expect(payload.notes).toBe('Great shot');
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

  it('redirects to /brew-logs when the log fetch fails', async () => {
    mockGetLog.mockRejectedValue(new Error('404'));
    renderEditPage();

    await waitFor(() => {
      expect(screen.getByText('journal page')).toBeInTheDocument();
    });
  });
});
