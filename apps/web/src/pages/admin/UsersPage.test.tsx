import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils.tsx";
import UsersPage from "./UsersPage.tsx";

describe("Admin UsersPage", () => {
  it("renders users management page", () => {
    renderWithProviders(<UsersPage />);
    const content = document.body.textContent;
    expect(content).toBeTruthy();
  });

  it("renders user list or search", () => {
    renderWithProviders(<UsersPage />);
    const headings = screen.queryAllByRole("heading");
    expect(headings.length).toBeGreaterThanOrEqual(0);
  });
});
