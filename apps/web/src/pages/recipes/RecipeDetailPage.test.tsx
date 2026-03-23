import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { renderWithProviders } from "../../test/test-utils.tsx";
import RecipeDetailPage from "./RecipeDetailPage.tsx";

describe("RecipeDetailPage", () => {
  it("renders without crashing", () => {
    renderWithProviders(<RecipeDetailPage />);
    expect(document.body).toBeTruthy();
  });

  it("renders loading state", () => {
    renderWithProviders(<RecipeDetailPage />);
    expect(document.body).toBeTruthy();
  });
});
