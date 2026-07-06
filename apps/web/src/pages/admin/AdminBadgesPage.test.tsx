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
        'admin.badgesShort': 'Rozetler',
        'admin.badges.noResults': 'Rozet bulunamadı.',
        'common.loading': 'Yükleniyor...',
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
import { AdminBadgesPage } from './AdminBadgesPage.tsx';

const mockApi = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.get.mockResolvedValue([]);
});

describe('AdminBadgesPage — tr locale spot-check', () => {
  it('renders the Turkish badges heading', async () => {
    render(<AdminBadgesPage />);

    await waitFor(() => {
      expect(screen.getByText('Rozetler')).toBeInTheDocument();
    });
  });
});
