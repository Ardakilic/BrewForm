/**
 * LoginPage Tests
 */

import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils.tsx";
import LoginPage from "./LoginPage.tsx";

describe("LoginPage", () => {
  it("renders without crashing", () => {
    renderWithProviders(<LoginPage />);
    expect(document.body).toBeTruthy();
  });

  it("renders form elements", () => {
    renderWithProviders(<LoginPage />);
    const inputs = screen.queryAllByRole("textbox");
    const buttons = screen.queryAllByRole("button");
    expect(inputs.length + buttons.length).toBeGreaterThan(0);
  });

  it("renders links", () => {
    renderWithProviders(<LoginPage />);
    const links = screen.queryAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
  });
});
