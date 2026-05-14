import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorPage, ForbiddenPage, NotFoundPage, ServerErrorPage } from './ErrorPage';

vi.mock('react-router', () => ({
  Link: (
    { to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown },
  ) => <a href={to} {...props}>{children}</a>,
}));

vi.mock('../contexts/I18nContext', () => ({
  useTranslation: vi.fn(),
}));

import { useTranslation } from '../contexts/I18nContext';

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

describe('ErrorPage — i18n', () => {
  it('renders "Go Home" link using t() — English', () => {
    render(<ErrorPage statusCode={404} message='Not found' illustration='🫥' />);

    expect(screen.getByRole('link', { name: 'Go Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute('href', '/');
  });

  it('renders "Go Home" link in Turkish when locale is tr', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<ErrorPage statusCode={404} message='Not found' illustration='🫥' />);

    expect(screen.getByRole('link', { name: 'Ana Sayfaya Git' })).toBeInTheDocument();
  });

  it('renders the status code and message passed as props', () => {
    render(<ErrorPage statusCode={503} message='Service unavailable' illustration='⚙️' />);

    expect(screen.getByText('503')).toBeInTheDocument();
    expect(screen.getByText('Service unavailable')).toBeInTheDocument();
  });
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

describe('ForbiddenPage — i18n', () => {
  it('renders 403 with translated message — English', () => {
    render(<ForbiddenPage />);

    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.getByText("You don't have permission to access this page")).toBeInTheDocument();
  });

  it('renders 403 with translated message — Turkish', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<ForbiddenPage />);

    expect(screen.getByText('Bu sayfaya erişim izniniz yok')).toBeInTheDocument();
  });
});
