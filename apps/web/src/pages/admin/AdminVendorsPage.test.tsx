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
        'admin.vendors.management': 'Satıcı Yönetimi',
        'admin.vendors.add': '+ Satıcı Ekle',
        'admin.vendors.editTitle': 'Satıcıyı Düzenle',
        'admin.vendors.addTitle': 'Satıcı Ekle',
        'admin.vendors.website': 'Web Sitesi',
        'admin.vendors.deleteConfirm': 'Bu satıcı silinsin mi?',
        'common.loading': 'Yükleniyor...',
        'common.name': 'Ad',
        'common.description': 'Açıklama',
        'common.actions': 'Eylemler',
        'common.edit': 'Düzenle',
        'common.delete': 'Sil',
        'common.cancel': 'İptal',
        'common.save': 'Kaydet',
        'common.saving': 'Kaydediliyor...',
        'common.cancelEdit': 'Düzenlemeyi İptal Et',
      };
      return map[k] ?? k;
    },
    locale: 'tr',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

vi.mock('../../api/client.ts', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { api } from '../../api/client.ts';
import { AdminVendorsPage } from './AdminVendorsPage.tsx';

const mockApi = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.get.mockResolvedValue([]);
});

describe('AdminVendorsPage — tr locale spot-check', () => {
  it('renders the Turkish vendor management heading', async () => {
    render(<AdminVendorsPage />);

    await waitFor(() => {
      expect(screen.getByText('Satıcı Yönetimi')).toBeInTheDocument();
    });
  });
});
