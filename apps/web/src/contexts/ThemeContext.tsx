/**
 * BrewForm Theme Context
 * Provides light, dark, and coffee themes with system detection
 */

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { createTheme, type LightTheme } from "baseui";

// ============================================
// Coffee Theme (Custom)
// ============================================

const coffeeColors = {
  // Primary coffee browns
  primary: "#6F4E37",
  primary50: "#FDF8F5",
  primary100: "#F5E6DA",
  primary200: "#E8CDB8",
  primary300: "#D4A574",
  primary400: "#B8804A",
  primary500: "#6F4E37",
  primary600: "#5D4230",
  primary700: "#4A3527",
  primary800: "#38291D",
  primary900: "#261C14",

  // Accent (cream)
  accent: "#D4A574",
  accent50: "#FDF8F5",
  accent100: "#F9EFE6",
  accent200: "#F0DCC8",
  accent300: "#E8CDB8",
  accent400: "#D4A574",
  accent500: "#B8804A",
};

const CoffeeTheme = createTheme({
  colors: {
    backgroundPrimary: coffeeColors.primary50,
    backgroundSecondary: coffeeColors.primary100,
    backgroundTertiary: coffeeColors.primary200,
    buttonPrimaryFill: coffeeColors.primary,
    buttonPrimaryHover: coffeeColors.primary600,
    buttonPrimaryActive: coffeeColors.primary700,
    contentPrimary: coffeeColors.primary900,
    contentSecondary: coffeeColors.primary700,
    contentTertiary: coffeeColors.primary500,
  },
});

// Dark Coffee Theme - maintains coffee brown tones with dark background
const DarkCoffeeTheme = createTheme({
  colors: {
    // Dark backgrounds with warm coffee brown undertones
    backgroundPrimary: "#2D2118",
    backgroundSecondary: "#3D2E22",
    backgroundTertiary: "#4D3D2E",
    backgroundInversePrimary: coffeeColors.primary100,

    // Coffee brown primary buttons - warm and visible
    buttonPrimaryFill: coffeeColors.accent400,
    buttonPrimaryHover: coffeeColors.accent500,
    buttonPrimaryActive: coffeeColors.primary,
    buttonSecondaryFill: "#4D3D2E",
    buttonSecondaryHover: "#5D4A3A",
    buttonSecondaryText: "#F5E6DA",
    buttonTertiaryFill: "transparent",
    buttonTertiaryText: coffeeColors.accent400,
    buttonTertiaryHover: "#4D3D2E",

    // Content colors - cream/light for excellent readability
    contentPrimary: "#FDF8F5",
    contentSecondary: "#E8CDB8",
    contentTertiary: "#D4A574",
    contentInversePrimary: coffeeColors.primary900,

    // Borders - visible but subtle
    borderOpaque: "#5D4A3A",
    borderSelected: coffeeColors.accent400,

    // Input/Card backgrounds - slightly lighter than page
    inputFill: "#3D2E22",
    inputFillActive: "#4D3D2E",
    inputBorder: "#5D4A3A",
    inputPlaceholder: "#A89080",

    // Menu/Dropdown - cream background for visibility
    menuFill: "#F5E6DA",
    menuFillHover: "#E8CDB8",

    // Tags - high contrast with cream/light colors
    tagPrimarySolidBackground: coffeeColors.accent400,
    tagPrimarySolidFont: "#1A1412",
    tagNeutralSolidBackground: "#5D4A3A",
    tagNeutralSolidFont: "#FDF8F5",
    tagNeutralOutlinedBackground: "transparent",
    tagNeutralOutlinedFont: "#FDF8F5",
    tagNeutralOutlinedBorder: "#8A7A6A",
    tagNeutralFontDisabled: "#8A7A6A",
    tagLightOutlinedBackground: "#4D3D2E",
    tagLightOutlinedFont: "#FDF8F5",

    // Links
    linkText: coffeeColors.accent400,
    linkHover: coffeeColors.accent300,
    linkVisited: coffeeColors.accent500,

    // Notifications/Toasts
    toastInfoBackground: "#3D2E22",
    toastPositiveBackground: "#2D4A2D",
    toastWarningBackground: "#4A3D2D",
    toastNegativeBackground: "#4A2D2D",
    notificationInfoBackground: "#3D2E22",
    notificationPositiveBackground: "#2D4A2D",
  },
});

// ============================================
// Theme Types
// ============================================

export type ThemeMode = "light" | "dark" | "coffee" | "system";

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  theme: typeof LightTheme;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// ============================================
// Theme Provider
// ============================================

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("brewform-theme");
    return (saved as ThemeMode) || "system";
  });

  const [systemDark, setSystemDark] = useState(() =>
    globalThis.matchMedia("(prefers-color-scheme: dark)").matches
  );

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = globalThis.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Save theme preference
  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem("brewform-theme", mode);
  };

  // Determine actual theme
  const isDark = themeMode === "dark" || (themeMode === "system" && systemDark);

  // Toggle between light and dark (coffee-styled)
  const toggleTheme = () => {
    setThemeMode(isDark ? "light" : "dark");
  };

  const theme = (() => {
    switch (themeMode) {
      case "light":
        return CoffeeTheme; // Use coffee theme for light mode
      case "dark":
        return DarkCoffeeTheme; // Use dark coffee theme for dark mode
      case "coffee":
        return CoffeeTheme;
      default:
        return systemDark ? DarkCoffeeTheme : CoffeeTheme;
    }
  })();

  return (
    <ThemeContext.Provider
      value={{ themeMode, setThemeMode, toggleTheme, theme, isDark }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
