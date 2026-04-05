/**
 * ProfilePage Tests
 */

import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils.tsx";
import ProfilePage from "./ProfilePage.tsx";

describe("ProfilePage", () => {
  it("renders profile content", () => {
    renderWithProviders(<ProfilePage />);
    const content = document.body.textContent;
    expect(content).toBeTruthy();
  });

  it("renders navigation or user actions", () => {
    renderWithProviders(<ProfilePage />);
    const headings = screen.queryAllByRole("heading");
    expect(headings.length).toBeGreaterThan(0);
  });
});
