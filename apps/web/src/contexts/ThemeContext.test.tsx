import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeContext.tsx';

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
 * TestConsumer — reads the theme context value via `useTheme()` and
 * renders the active theme plus buttons that call `setTheme`.
 */
function TestConsumer() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid='theme'>{theme}</span>
      <button type='button' onClick={() => setTheme('dark')} data-testid='switch-dark'>
        Switch to Dark
      </button>
      <button type='button' onClick={() => setTheme('coffee')} data-testid='switch-coffee'>
        Switch to Coffee
      </button>
      <button type='button' onClick={() => setTheme('light')} data-testid='switch-light'>
        Switch to Light
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <ThemeProvider>
      <TestConsumer />
    </ThemeProvider>,
  );
}

/** jsdom does not implement matchMedia; stub it to "no dark preference". */
function stubMatchMedia(prefersDark = false) {
  const fn = (query: string): MediaQueryList => ({
    matches: prefersDark && query.includes('dark'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  Object.defineProperty(globalThis, 'matchMedia', {
    value: fn,
    configurable: true,
    writable: true,
  });
}

let originalMatchMedia: typeof globalThis.matchMedia;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  originalMatchMedia = globalThis.matchMedia;
  stubMatchMedia(false);
});

afterEach(() => {
  cleanup();
  Object.defineProperty(globalThis, 'matchMedia', {
    value: originalMatchMedia,
    configurable: true,
    writable: true,
  });
});

/**
 * ThemeContext — owns the active theme (light/dark/coffee), initialised
 * from localStorage or the OS colour scheme, and mirrors it onto the
 * root element's class name.
 */
describe('ThemeContext', () => {
  it('defaults to "light" when localStorage is empty and the OS prefers light', () => {
    stubMatchMedia(false);
    renderProvider();
    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  it('initialises to "dark" when the OS prefers dark and localStorage is empty', () => {
    stubMatchMedia(true);
    renderProvider();
    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });

  it('initialises from localStorage when a valid theme is stored', () => {
    localStorage.setItem('brewform_theme', 'coffee');
    renderProvider();
    expect(screen.getByTestId('theme').textContent).toBe('coffee');
  });

  it('falls back to the OS scheme when localStorage holds an unsupported theme', () => {
    localStorage.setItem('brewform_theme', 'neon');
    stubMatchMedia(false);
    renderProvider();
    // No dark match → 'light'
    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  it('updates the active theme when setTheme is called', () => {
    renderProvider();
    expect(screen.getByTestId('theme').textContent).toBe('light');
    fireEvent.click(screen.getByTestId('switch-dark'));
    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });

  it('persists the new theme to localStorage when setTheme is called', () => {
    renderProvider();
    fireEvent.click(screen.getByTestId('switch-coffee'));
    expect(localStorage.getItem('brewform_theme')).toBe('coffee');
  });

  it('updates document.documentElement.className when the theme changes', () => {
    renderProvider();
    fireEvent.click(screen.getByTestId('switch-dark'));
    expect(document.documentElement.className).toBe('dark');
  });

  it('switches between light, dark, and coffee themes', () => {
    renderProvider();
    fireEvent.click(screen.getByTestId('switch-dark'));
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    fireEvent.click(screen.getByTestId('switch-coffee'));
    expect(screen.getByTestId('theme').textContent).toBe('coffee');
    fireEvent.click(screen.getByTestId('switch-light'));
    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  it('throws when useTheme is called outside a ThemeProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useTheme must be used within ThemeProvider');
    spy.mockRestore();
  });
});
