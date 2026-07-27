import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../components/ui/Toast.tsx';

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

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (k: string) => {
      const map: Record<string, string> = {
        'admin.recipes.management': 'Tarif Yönetimi',
        'admin.recipes.author': 'Yazar',
        'admin.recipes.stats': 'İstatistikler',
        'admin.recipes.deleteConfirm': 'Bu tarif silinsin mi?',
        'admin.recipes.visibilityError': 'Tarif görünürlüğü güncellenemedi.',
        'admin.recipes.deleteFailed': 'Tarif silinemedi.',
        'common.loading': 'Yükleniyor...',
        'common.title': 'Başlık',
        'common.actions': 'Eylemler',
        'common.delete': 'Sil',
        'recipe.visibility': 'Görünürlük',
        'visibility.draft': 'Taslak',
        'visibility.private': 'Özel',
        'visibility.unlisted': 'Liste Dışı',
        'visibility.public': 'Herkese Açık',
      };
      return map[k] ?? k;
    },
    locale: 'tr',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

vi.mock('../../api/client.ts', () => ({
  api: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { api } from '../../api/client.ts';
import { AdminRecipesPage } from './AdminRecipesPage.tsx';

const mockApi = vi.mocked(api);

function renderPage() {
  return render(
    <ToastProvider>
      <AdminRecipesPage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.get.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AdminRecipesPage — tr locale spot-check', () => {
  it('renders the Turkish recipe management heading', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Tarif Yönetimi')).toBeInTheDocument();
    });
  });

  it('shows an error toast when delete fails', async () => {
    mockApi.get.mockResolvedValue([
      {
        id: 'r1',
        title: 'Test Recipe',
        slug: 'test-recipe',
        visibility: 'public',
        author: { username: 'alice' },
        likeCount: 0,
        commentCount: 0,
        createdAt: '2025-01-01T00:00:00Z',
      },
    ]);
    mockApi.delete.mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('confirm', () => true);

    renderPage();
    await waitFor(() => expect(screen.getByText('Test Recipe')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));

    await waitFor(() => {
      expect(screen.getByText('Tarif silinemedi.')).toBeInTheDocument();
    });
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
