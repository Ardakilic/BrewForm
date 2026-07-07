import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider, useTranslation } from './I18nContext.tsx';

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

/**
 * TestConsumer — reads the i18n context value via `useTranslation()`
 * and renders the active locale plus buttons that call `setLocale`.
 */
function TestConsumer() {
  const { locale, setLocale, availableLocales } = useTranslation();
  return (
    <div>
      <span data-testid='locale'>{locale}</span>
      <span data-testid='available'>{availableLocales.join(',')}</span>
      <button type='button' onClick={() => setLocale('tr')} data-testid='switch-tr'>
        Switch to TR
      </button>
      <button type='button' onClick={() => setLocale('en')} data-testid='switch-en'>
        Switch to EN
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <I18nProvider>
      <TestConsumer />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

/**
 * I18nContext — owns the active locale (persisted in localStorage,
 * default `en`), keeps `<html lang/dir>` in sync, and provides a
 * locale-bound `t()` and `setLocale()`.
 */
describe('I18nContext', () => {
  it('defaults to the "en" locale when localStorage has no stored value', () => {
    renderProvider();
    expect(screen.getByTestId('locale').textContent).toBe('en');
  });

  it('initialises from localStorage when a valid locale is stored', () => {
    localStorage.setItem('brewform_locale', 'tr');
    renderProvider();
    expect(screen.getByTestId('locale').textContent).toBe('tr');
  });

  it('falls back to "en" when localStorage holds an unsupported locale', () => {
    localStorage.setItem('brewform_locale', 'fr');
    renderProvider();
    expect(screen.getByTestId('locale').textContent).toBe('en');
  });

  it('exposes the list of available locales', () => {
    renderProvider();
    expect(screen.getByTestId('available').textContent).toBe('en,tr');
  });

  it('updates the active locale when setLocale is called', () => {
    renderProvider();
    expect(screen.getByTestId('locale').textContent).toBe('en');
    fireEvent.click(screen.getByTestId('switch-tr'));
    expect(screen.getByTestId('locale').textContent).toBe('tr');
  });

  it('persists the new locale to localStorage when setLocale is called', () => {
    renderProvider();
    fireEvent.click(screen.getByTestId('switch-tr'));
    expect(localStorage.getItem('brewform_locale')).toBe('tr');
  });

  it('updates document.documentElement.lang when the locale changes', () => {
    renderProvider();
    fireEvent.click(screen.getByTestId('switch-tr'));
    expect(document.documentElement.lang).toBe('tr');
  });

  it('switches back to "en" when the EN button is clicked', () => {
    renderProvider();
    fireEvent.click(screen.getByTestId('switch-tr'));
    expect(screen.getByTestId('locale').textContent).toBe('tr');
    fireEvent.click(screen.getByTestId('switch-en'));
    expect(screen.getByTestId('locale').textContent).toBe('en');
  });

  it('throws when useTranslation is called outside an I18nProvider', () => {
    // Suppress the expected error output from React for this negative test.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      'useTranslation must be used within I18nProvider',
    );
    spy.mockRestore();
  });
});
