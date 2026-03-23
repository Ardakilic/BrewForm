/**
 * ThemeContext Tests
 */

import { beforeEach, describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../test/setup.ts";
import { fireEvent, render, screen } from "@testing-library/react";
import { Client as Styletron } from "styletron-engine-monolithic";
import { Provider as StyletronProvider } from "styletron-react";
import { BaseProvider } from "baseui";
import { spy } from "@std/testing/mock";
import { ThemeProvider, useTheme } from "./ThemeContext.tsx";

// Mock matchMedia for JSDOM
const mockMatchMedia = spy((query: unknown) => ({
  matches: (query as string) === "(prefers-color-scheme: dark)",
  media: query as string,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}));

Object.defineProperty(globalThis, "matchMedia", {
  writable: true,
  value: mockMatchMedia,
});

const engine = new Styletron();

// Test component that uses the theme context
function ThemeTestComponent() {
  const { isDark, toggleTheme, themeMode, theme } = useTheme();

  return (
    <BaseProvider theme={theme}>
      <div>
        <span data-testid="theme-mode">{themeMode}</span>
        <span data-testid="is-dark">{isDark ? "dark" : "light"}</span>
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

describe("ThemeContext", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should provide default theme mode as system", () => {
    render(
      <TestWrapper>
        <ThemeTestComponent />
      </TestWrapper>,
    );

    expect(screen.getByTestId("theme-mode").textContent).toBe("system");
  });

  it("should toggle between light and dark themes", () => {
    render(
      <TestWrapper>
        <ThemeTestComponent />
      </TestWrapper>,
    );

    const toggleButton = screen.getByTestId("toggle-button");
    const initialIsDark = screen.getByTestId("is-dark").textContent;

    fireEvent.click(toggleButton);

    const newIsDark = screen.getByTestId("is-dark").textContent;
    expect(newIsDark).not.toBe(initialIsDark);
  });

  it("should persist theme preference to localStorage", () => {
    render(
      <TestWrapper>
        <ThemeTestComponent />
      </TestWrapper>,
    );

    const toggleButton = screen.getByTestId("toggle-button");
    fireEvent.click(toggleButton);

    const savedTheme = localStorage.getItem("brewform-theme");
    expect(savedTheme).toBeTruthy();
    expect(["light", "dark"]).toContain(savedTheme);
  });

  it("should load saved theme preference from localStorage", () => {
    localStorage.setItem("brewform-theme", "dark");

    render(
      <TestWrapper>
        <ThemeTestComponent />
      </TestWrapper>,
    );

    expect(screen.getByTestId("theme-mode").textContent).toBe("dark");
  });

  it("should throw error when useTheme is used outside of ThemeProvider", () => {
    const originalConsoleError = console.error;
    console.error = () => {};

    expect(() => {
      render(
        <StyletronProvider value={engine}>
          <ThemeTestComponent />
        </StyletronProvider>,
      );
    }).toThrow("useTheme must be used within a ThemeProvider");

    console.error = originalConsoleError;
  });
});
