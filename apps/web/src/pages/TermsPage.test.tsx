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

vi.mock('../components/seo/SEOHead.tsx', () => ({
  SEOHead: () => null,
}));

vi.mock('../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (k: string) => {
      const map: Record<string, string> = {
        'legal.terms.title': 'Hizmet Şartları',
        'legal.terms.description': 'BrewForm hizmet şartları.',
        'legal.notice': 'Bu belge şu anda yalnızca İngilizce olarak mevcuttur.',
        'legal.lastUpdated': 'Son güncelleme:',
        'legal.terms.s1.title': '1. Kabul',
        'legal.terms.s2.title': '2. Kullanıcı Hesapları',
        'legal.terms.s3.title': '3. İçerik',
        'legal.terms.s4.title': '4. Davranış',
        'legal.terms.s5.title': '5. Sorumluluk Reddi',
        'legal.terms.s6.title': '6. Değişiklikler',
      };
      return map[k] ?? k;
    },
    locale: 'tr',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

import { TermsPage } from './TermsPage.tsx';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TermsPage — tr locale spot-check', () => {
  it('renders the Turkish terms title', () => {
    render(<TermsPage />);
    expect(screen.getByText('Hizmet Şartları')).toBeInTheDocument();
  });
});
