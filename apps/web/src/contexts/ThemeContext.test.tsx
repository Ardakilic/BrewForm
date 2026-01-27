/**
 * ThemeContext Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { Client as Styletron } from 'styletron-engine-monolithic';
import { Provider as StyletronProvider } from 'styletron-react';
import { BaseProvider } from 'baseui';
import { ThemeProvider, useTheme } from './ThemeContext';

// Mock matchMedia for JSDOM
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const engine = new Styletron();

// Test component that uses the theme context
function ThemeTestComponent() {
  const { isDark, toggleTheme, themeMode, theme } = useTheme();

  return (
    <BaseProvider theme={theme}>
      <div>
        <span data-testid="theme-mode">{themeMode}</span>
        <span data-testid="is-dark">{isDark ? 'dark' : 'light'}</span>
        <button type="button" onClick={toggleTheme} data-testid="toggle-button">
          Toggle Theme
        </button>
      </div>
    </BaseProvider>
  );
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <StyletronProvider value={engine}>
      <ThemeProvider>{children}</ThemeProvider>
    </StyletronProvider>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should provide default theme mode as system', () => {
    render(
      <TestWrapper>
        <ThemeTestComponent />
      </TestWrapper>
    );

    expect(screen.getByTestId('theme-mode')).toHaveTextContent('system');
  });

  it('should toggle between light and dark themes', () => {
    render(
      <TestWrapper>
        <ThemeTestComponent />
      </TestWrapper>
    );

    const toggleButton = screen.getByTestId('toggle-button');
    const initialIsDark = screen.getByTestId('is-dark').textContent;

    fireEvent.click(toggleButton);

    const newIsDark = screen.getByTestId('is-dark').textContent;
    expect(newIsDark).not.toBe(initialIsDark);
  });

  it('should persist theme preference to localStorage', () => {
    render(
      <TestWrapper>
        <ThemeTestComponent />
      </TestWrapper>
    );

    const toggleButton = screen.getByTestId('toggle-button');
    fireEvent.click(toggleButton);

    const savedTheme = localStorage.getItem('brewform-theme');
    expect(savedTheme).toBeTruthy();
    expect(['light', 'dark']).toContain(savedTheme);
  });

  it('should load saved theme preference from localStorage', () => {
    localStorage.setItem('brewform-theme', 'dark');

    render(
      <TestWrapper>
        <ThemeTestComponent />
      </TestWrapper>
    );

    expect(screen.getByTestId('theme-mode')).toHaveTextContent('dark');
  });

  it('should throw error when useTheme is used outside of ThemeProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(
        <StyletronProvider value={engine}>
          <ThemeTestComponent />
        </StyletronProvider>
      );
    }).toThrow('useTheme must be used within a ThemeProvider');

    consoleError.mockRestore();
  });
});
