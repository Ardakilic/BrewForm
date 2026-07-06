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
        'legal.privacy.title': 'Gizlilik Politikası',
        'legal.privacy.description': 'BrewForm gizlilik politikası.',
        'legal.notice': 'Bu belge şu anda yalnızca İngilizce olarak mevcuttur.',
        'legal.lastUpdated': 'Son güncelleme:',
        'legal.privacy.s1.title': '1. Topladığımız Bilgiler',
        'legal.privacy.s2.title': '2. Bilgilerinizi Nasıl Kullanıyoruz',
        'legal.privacy.s3.title': '3. Bilgi Paylaşımı',
        'legal.privacy.s4.title': '4. Veri Saklama',
        'legal.privacy.s5.title': '5. Çerezler',
        'legal.privacy.s6.title': '6. İletişim',
      };
      return map[k] ?? k;
    },
    locale: 'tr',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

import { PrivacyPage } from './PrivacyPage.tsx';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PrivacyPage — tr locale spot-check', () => {
  it('renders the Turkish privacy title', () => {
    render(<PrivacyPage />);
    expect(screen.getByText('Gizlilik Politikası')).toBeInTheDocument();
  });
});
