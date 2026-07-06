import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotFoundPage, ServerErrorPage } from './ErrorPage.tsx';

vi.mock('react-router', () => ({
  Link: (
    { to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown },
  ) => <a href={to} {...props}>{children}</a>,
}));

vi.mock('../contexts/I18nContext', () => ({
  useTranslation: vi.fn(),
}));

import { useTranslation } from '../contexts/I18nContext.tsx';

const mockUseTranslation = vi.mocked(useTranslation);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'common.goHome': 'Go Home',
    'error.404': 'Page not found',
    'error.403': "You don't have permission to access this page",
    'error.500': 'Something went wrong',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'common.goHome': 'Ana Sayfaya Git',
    'error.404': 'Sayfa bulunamadı',
    'error.403': 'Bu sayfaya erişim izniniz yok',
    'error.500': 'Bir şeyler ters gitti',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
});

describe('NotFoundPage — i18n', () => {
  it('renders 404 with translated message — English', () => {
    render(<NotFoundPage />);

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go Home' })).toBeInTheDocument();
  });

  it('renders 404 with translated message — Turkish', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<NotFoundPage />);

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Sayfa bulunamadı')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ana Sayfaya Git' })).toBeInTheDocument();
  });

  it('renders SEOHead with noIndex (document title includes status code)', () => {
    render(<NotFoundPage />);
    expect(document.title).toMatch(/404/);
  });
});

describe('ServerErrorPage — i18n', () => {
  it('renders 500 with translated message — English', () => {
    render(<ServerErrorPage />);

    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders 500 with translated message — Turkish', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<ServerErrorPage />);

    expect(screen.getByText('Bir şeyler ters gitti')).toBeInTheDocument();
  });
});
