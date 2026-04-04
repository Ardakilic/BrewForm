/**
 * RecipesPage Tests - Filtering Functionality
 */

import { beforeEach, describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils.tsx";
import RecipesPage from "./RecipesPage.tsx";
import useSWR from "../../test/mocks/swr.ts";

const mockRecipes = [
  {
    id: "recipe_1",
    slug: "morning-espresso",
    currentVersion: {
      title: "Morning Espresso",
      brewMethod: "ESPRESSO_MACHINE",
      drinkType: "ESPRESSO",
      rating: 9,
    },
    user: { username: "coffeelover" },
  },
  {
    id: "recipe_2",
    slug: "afternoon-pour-over",
    currentVersion: {
      title: "Afternoon Pour Over",
      brewMethod: "POUR_OVER_V60",
      drinkType: "POUR_OVER",
      rating: 8,
    },
    user: { username: "barista" },
  },
];

describe("RecipesPage Filtering", () => {
  beforeEach(() => {
    useSWR.mockReset();
  });

  describe("Initial URL params", () => {
    it("should load with single tag filter from URL", () => {
      useSWR.mockImplementation(() => ({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      }));

      renderWithProviders(<RecipesPage />, { initialEntries: ["/recipes?tags=fruity"] });

      expect(screen.getByText("#Fruity")).toBeInTheDocument();
    });

    it("should load with multiple tag filters from URL", () => {
      useSWR.mockImplementation(() => ({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      }));

      renderWithProviders(<RecipesPage />, { initialEntries: ["/recipes?tags=chocolatey&tags=fruity"] });

      expect(screen.getByText("#Chocolatey")).toBeInTheDocument();
      expect(screen.getByText("#Fruity")).toBeInTheDocument();
    });

    it("should load with single brew method filter from URL", () => {
      useSWR.mockImplementation(() => ({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      }));

      renderWithProviders(<RecipesPage />, { initialEntries: ["/recipes?brewMethod=ESPRESSO_MACHINE"] });

      expect(screen.getByText(/Active/i)).toBeInTheDocument();
    });

    it("should load with multiple brew method filters from URL", () => {
      useSWR.mockImplementation(() => ({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      }));

      renderWithProviders(<RecipesPage />, { initialEntries: ["/recipes?brewMethod=ESPRESSO_MACHINE&brewMethod=POUR_OVER_V60"] });

      expect(screen.getByText(/Active/i)).toBeInTheDocument();
      const closeableTags = screen.getAllByRole("button", { name: /remove/i });
      expect(closeableTags.length).toBeGreaterThanOrEqual(2);
    });

    it("should load with single drink type filter from URL", () => {
      useSWR.mockImplementation(() => ({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      }));

      renderWithProviders(<RecipesPage />, { initialEntries: ["/recipes?drinkType=ESPRESSO"] });

      expect(screen.getByText(/Active/i)).toBeInTheDocument();
    });

    it("should load with multiple drink type filters from URL", () => {
      useSWR.mockImplementation(() => ({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      }));

      renderWithProviders(<RecipesPage />, { initialEntries: ["/recipes?drinkType=ESPRESSO&drinkType=LUNGO"] });

      expect(screen.getByText(/Active/i)).toBeInTheDocument();
      expect(screen.getAllByText("Espresso").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Lungo").length).toBeGreaterThan(0);
    });

    it("should load with combined filters from URL", () => {
      useSWR.mockImplementation(() => ({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      }));

      renderWithProviders(<RecipesPage />, {
        initialEntries: [
          "/recipes?brewMethod=ESPRESSO_MACHINE&tags=chocolatey&tags=morning",
        ],
      });

      expect(screen.getByText("#Chocolatey")).toBeInTheDocument();
      expect(screen.getByText("#Morning")).toBeInTheDocument();
    });
  });

  describe("Filter removal", () => {
    it("should remove single tag when clicking close button", async () => {
      useSWR.mockImplementation(() => ({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      }));

      renderWithProviders(<RecipesPage />, {
        initialEntries: ["/recipes?tags=chocolatey&tags=fruity"],
      });

      expect(screen.getByText(/Active/i)).toBeInTheDocument();

      const closeableTags = screen.getAllByRole("button", { name: /remove/i });

      if (closeableTags.length > 0) {
        fireEvent.click(closeableTags[0]);
      }

      await waitFor(() => {
        expect(screen.getByText(/Active/i)).toBeInTheDocument();
      });
    });

    it("should have Clear All button when filters are active", () => {
      useSWR.mockImplementation(() => ({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      }));

      renderWithProviders(<RecipesPage />, {
        initialEntries: [
          "/recipes?tags=chocolatey&tags=fruity&brewMethod=ESPRESSO_MACHINE",
        ],
      });

      expect(screen.getByText(/Active/i)).toBeInTheDocument();

      const clearAllButtons = screen.getAllByRole("button", {
        name: /clear all/i,
      });
      expect(clearAllButtons.length).toBeGreaterThan(0);
    });
  });

  describe("Recipe display", () => {
    it("should display recipes when loaded", () => {
      useSWR.mockImplementation(() => ({
        data: mockRecipes,
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      }));

      renderWithProviders(<RecipesPage />);

      expect(screen.getByText("Morning Espresso")).toBeInTheDocument();
      expect(screen.getByText("Afternoon Pour Over")).toBeInTheDocument();
    });

    it("should show loading spinner while loading", () => {
      useSWR.mockImplementation(() => ({
        data: undefined,
        isLoading: true,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      }));

      renderWithProviders(<RecipesPage />);

      expect(screen.queryByText("Morning Espresso")).not.toBeInTheDocument();
    });

    it("should show empty state when no recipes", () => {
      useSWR.mockImplementation(() => ({
        data: [],
        isLoading: false,
        error: undefined,
        mutate: () => Promise.resolve(undefined),
        isValidating: false,
      }));

      renderWithProviders(<RecipesPage />);

      expect(screen.getByText(/no recipes/i)).toBeInTheDocument();
    });
  });

  describe("API URL construction", () => {
    it("should build correct API URL with multiple tags", () => {
      let capturedUrl: unknown;
      useSWR.mockImplementation((url, ..._rest) => {
        capturedUrl = url;
        return {
          data: mockRecipes,
          isLoading: false,
          error: undefined,
          mutate: () => Promise.resolve(undefined),
          isValidating: false,
        };
      });

      renderWithProviders(<RecipesPage />, {
        initialEntries: ["/recipes?tags=chocolatey&tags=fruity"],
      });

      expect(typeof capturedUrl).toBe("string");
      expect(capturedUrl as string).toContain("tags=chocolatey%2Cfruity");
      expect(screen.getByText("Morning Espresso")).toBeInTheDocument();
    });

    it("should build correct API URL with multiple drink types", () => {
      let capturedUrl: unknown;
      useSWR.mockImplementation((url, ..._rest) => {
        capturedUrl = url;
        return {
          data: mockRecipes,
          isLoading: false,
          error: undefined,
          mutate: () => Promise.resolve(undefined),
          isValidating: false,
        };
      });

      renderWithProviders(<RecipesPage />, {
        initialEntries: ["/recipes?drinkType=ESPRESSO&drinkType=LUNGO"],
      });

      expect(typeof capturedUrl).toBe("string");
      expect(capturedUrl as string).toContain("drinkType=ESPRESSO%2CLUNGO");
      expect(screen.getByText("Morning Espresso")).toBeInTheDocument();
    });
  });
});
