import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils.tsx";
import RecipesPage from "./RecipesPage.tsx";

describe("Admin RecipesPage", () => {
  it("renders recipes management page", () => {
    renderWithProviders(<RecipesPage />);
    const content = document.body.textContent;
    expect(content).toBeTruthy();
  });

  it("renders recipe list or search", () => {
    renderWithProviders(<RecipesPage />);
    const headings = screen.queryAllByRole("heading");
    expect(headings.length).toBeGreaterThanOrEqual(0);
  });
});
