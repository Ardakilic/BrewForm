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
        'admin.vendors.management': 'Satıcı Yönetimi',
        'admin.vendors.add': '+ Satıcı Ekle',
        'admin.vendors.editTitle': 'Satıcıyı Düzenle',
        'admin.vendors.addTitle': 'Satıcı Ekle',
        'admin.vendors.website': 'Web Sitesi',
        'admin.vendors.deleteConfirm': 'Bu satıcı silinsin mi?',
        'admin.vendors.loadError': 'Satıcılar yüklenemedi.',
        'admin.vendors.saveError': 'Satıcı kaydedilemedi.',
        'admin.vendors.deleteFailed': 'Satıcı silinemedi.',
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

function renderPage() {
  return render(
    <ToastProvider>
      <AdminVendorsPage />
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

describe('AdminVendorsPage — tr locale spot-check', () => {
  it('renders the Turkish vendor management heading', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Satıcı Yönetimi')).toBeInTheDocument();
    });
  });

  it('shows an error toast when delete fails', async () => {
    mockApi.get.mockResolvedValue([
      { id: 'v1', name: 'Onyx', website: null, description: null },
    ]);
    mockApi.delete.mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('confirm', () => true);

    renderPage();
    await waitFor(() => expect(screen.getByText('Onyx')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));

    await waitFor(() => {
      expect(screen.getByText('Satıcı silinemedi.')).toBeInTheDocument();
    });
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
