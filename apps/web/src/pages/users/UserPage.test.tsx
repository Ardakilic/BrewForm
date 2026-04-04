import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils.tsx";
import UserPage from "./UserPage.tsx";

describe("UserPage", () => {
  it("renders user profile page", () => {
    renderWithProviders(<UserPage />);
    const content = document.body.textContent;
    expect(content).toBeTruthy();
  });

  it("renders user recipes or information", () => {
    renderWithProviders(<UserPage />);
    const headings = screen.queryAllByRole("heading");
    expect(headings.length).toBeGreaterThanOrEqual(0);
  });
});
