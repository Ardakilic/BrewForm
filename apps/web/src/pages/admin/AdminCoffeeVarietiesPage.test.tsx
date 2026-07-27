import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../components/ui/Toast.tsx';

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
        'coffeeVarieties.title': 'Kahve Çeşitleri',
        'admin.coffeeVarieties.add': '+ Kahve Çeşidi Ekle',
        'admin.coffeeVarieties.allCategories': 'Tüm Kategoriler',
        'admin.coffeeVarieties.catVariety': 'Çeşit',
        'admin.coffeeVarieties.catProcessing': 'İşleme',
        'admin.coffeeVarieties.catMarketName': 'Piyasa Adı',
        'admin.coffeeVarieties.searchPlaceholder': 'Ada göre ara...',
        'admin.coffeeVarieties.editTitle': 'Kahve Çeşidini Düzenle',
        'admin.coffeeVarieties.addTitle': 'Kahve Çeşidi Ekle',
        'admin.coffeeVarieties.species': 'Tür',
        'admin.coffeeVarieties.system': 'Sistem',
        'admin.coffeeVarieties.custom': 'Özel',
        'admin.coffeeVarieties.deleteConfirm': 'Bu kahve çeşidi silinsin mi?',
        'common.loading': 'Yükleniyor...',
        'common.name': 'Ad',
        'common.category': 'Kategori',
        'common.actions': 'Eylemler',
        'common.edit': 'Düzenle',
        'common.delete': 'Sil',
        'common.cancel': 'İptal',
        'common.save': 'Kaydet',
        'common.saving': 'Kaydediliyor...',
        'common.cancelEdit': 'Düzenlemeyi İptal Et',
        'common.previous': 'Önceki',
        'common.next': 'İleri',
        'common.confirmDelete': 'Silmeyi Onayla',
        'common.commaSeparated': 'Virgülle ayrılmış değerler',
      };
      return map[k] ?? k;
    },
    locale: 'tr',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

vi.mock('../../api/client.ts', () => ({
  api: { getWithMeta: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { api } from '../../api/client.ts';
import { AdminCoffeeVarietiesPage } from './AdminCoffeeVarietiesPage.tsx';

const mockApi = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.getWithMeta.mockResolvedValue({ data: [], total: 0, success: true });
});

describe('AdminCoffeeVarietiesPage — tr locale spot-check', () => {
  it('renders the Turkish coffee varieties heading', async () => {
    render(
      <ToastProvider>
        <AdminCoffeeVarietiesPage />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Kahve Çeşitleri')).toBeInTheDocument();
    });
  });
});
