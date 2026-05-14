import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CookieConsent } from './CookieConsent';

vi.mock('../contexts/I18nContext', () => ({
  useTranslation: vi.fn(),
}));

import { useTranslation } from '../contexts/I18nContext';

const mockUseTranslation = vi.mocked(useTranslation);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'cookie.consent': 'We use cookies to improve your experience',
    'cookie.accept': 'Accept',
    'cookie.reject': 'Reject',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'cookie.consent': 'Deneyiminizi iyileştirmek için çerezler kullanıyoruz',
    'cookie.accept': 'Kabul Et',
    'cookie.reject': 'Reddet',
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
  // Clear consent so the banner shows
  localStorage.removeItem('brewform_cookie_consent');
});

describe('CookieConsent — i18n', () => {
  it('renders consent text and buttons using t() — English', () => {
    render(<CookieConsent />);

    expect(screen.getByText('We use cookies to improve your experience')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('renders consent text and buttons in Turkish when locale is tr', () => {
    mockUseTranslation.mockReturnValue({
      ...defaultTranslation,
      locale: 'tr',
      t: trT,
    });

    render(<CookieConsent />);

    expect(
      screen.getByText('Deneyiminizi iyileştirmek için çerezler kullanıyoruz'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kabul Et' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reddet' })).toBeInTheDocument();
  });

  it('does not render when consent is already stored', () => {
    localStorage.setItem('brewform_cookie_consent', 'accepted');

    render(<CookieConsent />);

    expect(screen.queryByText('We use cookies to improve your experience')).not.toBeInTheDocument();
  });

  it('hides banner and stores "accepted" when Accept is clicked', async () => {
    render(<CookieConsent />);

    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(screen.queryByText('We use cookies to improve your experience')).not.toBeInTheDocument();
    expect(localStorage.getItem('brewform_cookie_consent')).toBe('accepted');
  });

  it('hides banner and stores "rejected" when Reject is clicked', async () => {
    render(<CookieConsent />);

    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(screen.queryByText('We use cookies to improve your experience')).not.toBeInTheDocument();
    expect(localStorage.getItem('brewform_cookie_consent')).toBe('rejected');
  });
});
