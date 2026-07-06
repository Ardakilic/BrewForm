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
        'admin.compatibility.title': 'Uyumluluk Matrisi',
        'admin.compatibility.compatible': 'Uyumlu',
        'admin.flushCache': 'Önbelleği Temizle',
        'common.loading': 'Yükleniyor...',
        'common.flushing': 'Temizleniyor...',
        'common.yes': 'Evet',
        'common.no': 'Hayır',
      };
      return map[k] ?? k;
    },
    locale: 'tr',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

vi.mock('../../api/client.ts', () => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}));

import { api } from '../../api/client.ts';
import { AdminCompatibilityPage } from './AdminCompatibilityPage.tsx';

const mockApi = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.get.mockResolvedValue([]);
});

describe('AdminCompatibilityPage — tr locale spot-check', () => {
  it('renders the Turkish compatibility matrix heading', async () => {
    render(<AdminCompatibilityPage />);

    await waitFor(() => {
      expect(screen.getByText('Uyumluluk Matrisi')).toBeInTheDocument();
    });
  });
});
