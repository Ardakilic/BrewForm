import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrintButton, FocusModeButton } from './PrintButton';

vi.mock('../../contexts/I18nContext', () => ({
  useTranslation: vi.fn(),
}));

import { useTranslation } from '../../contexts/I18nContext';

const mockUseTranslation = vi.mocked(useTranslation);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'recipe.print': 'Print',
    'recipe.focusMode': 'Focus Mode',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'recipe.print': 'Yazdır',
    'recipe.focusMode': 'Odak Modu',
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
  // Stub globalThis.open so tests don't actually open windows
  vi.stubGlobal('open', vi.fn());
});

describe('PrintButton — i18n', () => {
  it('renders "Print" label using t() — English', () => {
    render(<PrintButton slug='my-espresso' />);
    expect(screen.getByRole('button', { name: /Print/ })).toBeInTheDocument();
  });

  it('renders "Yazdır" label in Turkish', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    render(<PrintButton slug='my-espresso' />);
    expect(screen.getByRole('button', { name: /Yazdır/ })).toBeInTheDocument();
  });

  it('opens the print page in a new tab when clicked', async () => {
    render(<PrintButton slug='my-espresso' />);
    await userEvent.click(screen.getByRole('button', { name: /Print/ }));
    expect(globalThis.open).toHaveBeenCalledWith('/recipes/my-espresso/print', '_blank');
  });
});

describe('FocusModeButton — i18n', () => {
  it('renders "Focus Mode" label using t() — English', () => {
    render(<FocusModeButton slug='my-espresso' />);
    expect(screen.getByRole('button', { name: /Focus Mode/ })).toBeInTheDocument();
  });

  it('renders "Odak Modu" label in Turkish', () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    render(<FocusModeButton slug='my-espresso' />);
    expect(screen.getByRole('button', { name: /Odak Modu/ })).toBeInTheDocument();
  });

  it('opens the focus mode page in a new tab when clicked', async () => {
    render(<FocusModeButton slug='my-espresso' />);
    await userEvent.click(screen.getByRole('button', { name: /Focus Mode/ }));
    expect(globalThis.open).toHaveBeenCalledWith('/recipes/my-espresso/focus', '_blank');
  });
});
