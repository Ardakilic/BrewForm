/**
 * Mock for src/i18n — avoids JSON locale imports which Deno can't handle without type attributes.
 * Redirected via import_map.json during deno test runs.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        home: {
          hero: {
            title: "Discover & Share Coffee Recipes",
            subtitle:
              "Document your coffee brewing journey. Share your perfect espresso, pour-over, and specialty coffee recipes with the world.",
            cta: "Start Brewing",
            explore: "Explore Recipes",
          },
          features: {
            track: {
              title: "Track Your Brews",
              description:
                "Document every detail of your coffee recipes - from dose and yield to grind size and extraction time.",
            },
            share: {
              title: "Share & Discover",
              description:
                "Share your recipes with the community and discover new brewing techniques from coffee enthusiasts worldwide.",
            },
            compare: {
              title: "Compare & Improve",
              description:
                "Compare recipes side by side, track versions, and continuously improve your brewing skills.",
            },
          },
          latest: "Latest Recipes",
          popular: "Popular Recipes",
          viewAll: "View All",
        },
        auth: {
          login: {
            title: "Welcome Back",
            subtitle: "Log in to your BrewForm account",
            email: "Email",
            password: "Password",
            submit: "Log In",
            forgotPassword: "Forgot password?",
            noAccount: "Don't have an account?",
            signUp: "Sign up",
          },
          register: {
            title: "Join BrewForm",
            subtitle: "Create your account and start your coffee journey",
            email: "Email",
            username: "Username",
            displayName: "Display Name",
            password: "Password",
            confirmPassword: "Confirm Password",
            submit: "Create Account",
            hasAccount: "Already have an account?",
            signIn: "Log in",
          },
          forgotPassword: {
            title: "Reset Password",
            subtitle: "Enter your email to receive a reset link",
            email: "Email",
            submit: "Send Reset Link",
            backToLogin: "Back to login",
          },
        },
        errors: {
          generic: {
            title: "Something Went Wrong",
            description: "We spilled the coffee! Please try again later.",
            retry: "Try Again",
          },
          notFound: {
            title: "Page Not Found",
            description: "Oops! Looks like this coffee got cold.",
            backHome: "Back to Home",
          },
        },
        recipe: {
          tags: {
            morning: "Morning",
            afternoon: "Afternoon",
            evening: "Evening",
            fruity: "Fruity",
            chocolatey: "Chocolatey",
            nutty: "Nutty",
            floral: "Floral",
            spicy: "Spicy",
            sweet: "Sweet",
            bold: "Bold",
            light: "Light",
            creamy: "Creamy",
            iced: "Iced",
            hot: "Hot",
            decaf: "Decaf",
            singleOrigin: "Single Origin",
            blend: "Blend",
            espresso: "Espresso",
          },
          drinkTypes: {
            ESPRESSO: "Espresso",
            RISTRETTO: "Ristretto",
            LUNGO: "Lungo",
            AMERICANO: "Americano",
            LATTE: "Latte",
            CAPPUCCINO: "Cappuccino",
            FLAT_WHITE: "Flat White",
            CORTADO: "Cortado",
            MACCHIATO: "Macchiato",
            POUR_OVER: "Pour Over",
            FRENCH_PRESS: "French Press",
            COLD_BREW: "Cold Brew",
          },
          brewMethods: {
            ESPRESSO_MACHINE: "Espresso Machine",
            POUR_OVER_V60: "Pour Over V60",
            POUR_OVER_CHEMEX: "Pour Over Chemex",
            AEROPRESS: "AeroPress",
            FRENCH_PRESS: "French Press",
            MOKA_POT: "Moka Pot",
            COLD_BREW: "Cold Brew",
            TURKISH_CEZVE: "Turkish Cezve",
          },
          activeFilters: "Active filters",
          empty: {
            title: "No recipes yet",
            description: "Be the first to share a recipe!",
          },
        },
      },
    },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  showSupportNotice: false,
});

export const supportedLanguages = [
  { code: "en", name: "English", flag: "🇬🇧" },
] as const;

export const changeLanguage = (_lang: string) => {};

export default i18n;
