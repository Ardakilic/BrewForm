import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Footer } from './Footer';

// Mock react-router's Link component so we don't need a Router context
vi.mock('react-router', () => ({
  Link: (
    { to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown },
  ) => <a href={to} {...props}>{children}</a>,
}));

// Mock the I18nContext module so we can control useTranslation's return values
vi.mock('../../contexts/I18nContext', () => ({
  useTranslation: vi.fn(),
}));

import { useTranslation } from '../../contexts/I18nContext';

const mockUseTranslation = vi.mocked(useTranslation);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'app.name': 'BrewForm',
    'footer.tagline': 'Coffee brewing recipes and tasting notes.',
    'footer.explore': 'Explore',
    'footer.popular': 'Popular',
    'footer.legal': 'Legal',
    'footer.privacy': 'Privacy Policy',
    'footer.terms': 'Terms of Service',
    'footer.copyright': 'All rights reserved.',
    'nav.recipes': 'Recipes',
    'taste.reference': 'SCAA Flavor Wheel Reference',
    'preferences.locale': 'Language',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'app.name': 'BrewForm',
    'footer.tagline': 'Kahve demleme tarifleri ve tadım notları.',
    'footer.explore': 'Keşfet',
    'footer.popular': 'Popüler',
    'footer.legal': 'Yasal',
    'footer.privacy': 'Gizlilik Politikası',
    'footer.terms': 'Kullanım Koşulları',
    'footer.copyright': 'Tüm hakları saklıdır.',
    'nav.recipes': 'Tarifler',
    'taste.reference': 'SCAA Lezzet Tekerleği Referansı',
    'preferences.locale': 'Dil',
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

describe('Footer — Language Switcher', () => {
  it('renders language selector with correct options when availableLocales = ["en", "tr"]', async () => {
    // Requirements: 1.1, 1.2
    mockUseTranslation.mockReturnValue({
      ...defaultTranslation,
      availableLocales: ['en', 'tr'],
    });

    render(<Footer />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeInTheDocument();

    await userEvent.click(trigger);

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('🇬🇧 English');
    expect(options[1]).toHaveTextContent('🇹🇷 Türkçe');
  });

  it('does not render <select> when availableLocales = []', () => {
    // Requirements: 1.8
    mockUseTranslation.mockReturnValue({
      ...defaultTranslation,
      availableLocales: [],
    });

    render(<Footer />);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('calls setLocale("tr") when user selects "tr"', async () => {
    // Requirements: 1.3
    const setLocale = vi.fn();
    mockUseTranslation.mockReturnValue({
      ...defaultTranslation,
      locale: 'en',
      setLocale,
      availableLocales: ['en', 'tr'],
    });

    render(<Footer />);

    const trigger = screen.getByRole('combobox');
    await userEvent.click(trigger);

    const trOption = await screen.findByRole('option', { name: '🇹🇷 Türkçe' });
    await userEvent.click(trOption);

    expect(setLocale).toHaveBeenCalledOnce();
    expect(setLocale).toHaveBeenCalledWith('tr');
  });

  it('shows locale = "tr" as selected when active locale is "tr"', () => {
    // Requirements: 1.4
    mockUseTranslation.mockReturnValue({
      ...defaultTranslation,
      locale: 'tr',
      availableLocales: ['en', 'tr'],
    });

    render(<Footer />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('🇹🇷 Türkçe');
  });

  it('label text equals t("preferences.locale") — "Language" for en', () => {
    // Requirements: 1.5
    render(<Footer />);

    expect(screen.getByText('Language')).toBeInTheDocument();
    const label = screen.getByText('Language');
    expect(label.tagName.toLowerCase()).toBe('label');
    expect(label).toHaveAttribute('for', 'language-switcher');
  });

  it('label text changes to "Dil" when locale is tr', () => {
    mockUseTranslation.mockReturnValue({
      ...defaultTranslation,
      locale: 'tr',
      t: trT,
    });

    render(<Footer />);

    const label = screen.getByText('Dil');
    expect(label.tagName.toLowerCase()).toBe('label');
  });
});

describe('Footer — i18n section headings and links', () => {
  it('renders section headings using t() — English', () => {
    render(<Footer />);

    expect(screen.getByText('Explore')).toBeInTheDocument();
    expect(screen.getByText('Legal')).toBeInTheDocument();
  });

  it('renders section headings in Turkish when locale is tr', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<Footer />);

    expect(screen.getByText('Keşfet')).toBeInTheDocument();
    expect(screen.getByText('Yasal')).toBeInTheDocument();
  });

  it('renders footer links using t() — English', () => {
    render(<Footer />);

    expect(screen.getByRole('link', { name: 'Recipes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Popular' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toBeInTheDocument();
  });

  it('renders footer links in Turkish when locale is tr', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<Footer />);

    expect(screen.getByRole('link', { name: 'Tarifler' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Popüler' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gizlilik Politikası' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kullanım Koşulları' })).toBeInTheDocument();
  });

  it('renders tagline using t() — English', () => {
    render(<Footer />);

    expect(screen.getByText('Coffee brewing recipes and tasting notes.')).toBeInTheDocument();
  });

  it('renders tagline in Turkish when locale is tr', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<Footer />);

    expect(screen.getByText('Kahve demleme tarifleri ve tadım notları.')).toBeInTheDocument();
  });
});
