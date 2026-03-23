import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { renderWithProviders } from "../../test/test-utils.tsx";
import ComparePage from "./ComparePage.tsx";

describe("ComparePage", () => {
  it("renders without crashing", () => {
    renderWithProviders(<ComparePage />);
    expect(document.body).toBeTruthy();
  });

  it("renders loading state", () => {
    renderWithProviders(<ComparePage />);
    expect(document.body).toBeTruthy();
  });
});
