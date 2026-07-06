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

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: () => null,
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (k: string) => {
      const map: Record<string, string> = {
        'admin.dashboard': 'Panel',
        'admin.dashboard.seoTitle': 'Yönetici Paneli',
        'admin.dashboard.loading': 'İstatistikler yükleniyor...',
        'admin.dashboard.loadError': 'İstatistikler yüklenemedi.',
        'admin.dashboard.totalUsers': 'Toplam Kullanıcı',
        'admin.dashboard.totalRecipes': 'Toplam Tarif',
        'admin.dashboard.totalComments': 'Toplam Yorum',
        'admin.dashboard.totalPhotos': 'Toplam Fotoğraf',
        'admin.dashboard.recentSignups': 'Son Kayıtlar',
        'admin.dashboard.recentRecipes': 'Son Tarifler',
      };
      return map[k] ?? k;
    },
    locale: 'tr',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

vi.mock('../../api/client.ts', () => ({
  api: { get: vi.fn() },
}));

import { api } from '../../api/client.ts';
import { AdminDashboard } from './AdminDashboard.tsx';

const mockApi = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminDashboard — tr locale spot-check', () => {
  it('renders the Turkish dashboard heading', async () => {
    mockApi.get.mockResolvedValue({
      totalUsers: 0,
      totalRecipes: 0,
      totalComments: 0,
      totalPhotos: 0,
      recentSignups: 0,
      recentRecipes: 0,
    });

    render(<AdminDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Panel')).toBeInTheDocument();
    });
  });
});
