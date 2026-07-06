import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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
        'admin.cache.management': 'Önbellek Yönetimi',
        'admin.flushCache': 'Önbelleği Temizle',
        'admin.cache.infoTitle': 'Önbellek Bilgisi',
        'admin.cache.flushSuccess': 'Önbellek başarıyla temizlendi!',
        'admin.cache.flushError': 'Önbellek temizlenemedi.',
        'admin.cache.prefixes': 'Önbellek önekleri:',
        'common.flushing': 'Temizleniyor...',
      };
      return map[k] ?? k;
    },
    locale: 'tr',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

vi.mock('../../api/client.ts', () => ({
  api: { post: vi.fn() },
}));

import { AdminCachePage } from './AdminCachePage.tsx';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminCachePage — tr locale spot-check', () => {
  it('renders the Turkish cache management heading', () => {
    render(<AdminCachePage />);
    expect(screen.getByText('Önbellek Yönetimi')).toBeInTheDocument();
  });
});
