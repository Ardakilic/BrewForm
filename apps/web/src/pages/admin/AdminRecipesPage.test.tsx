import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (k: string) => {
      const map: Record<string, string> = {
        'admin.recipes.management': 'Tarif Yönetimi',
        'admin.recipes.author': 'Yazar',
        'admin.recipes.stats': 'İstatistikler',
        'admin.recipes.deleteConfirm': 'Bu tarif silinsin mi?',
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

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.get.mockResolvedValue([]);
});

describe('AdminRecipesPage — tr locale spot-check', () => {
  it('renders the Turkish recipe management heading', async () => {
    render(<AdminRecipesPage />);

    await waitFor(() => {
      expect(screen.getByText('Tarif Yönetimi')).toBeInTheDocument();
    });
  });
});
