/**
 * ForgotPasswordPage Tests
 */

import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils.tsx";
import ForgotPasswordPage from "./ForgotPasswordPage.tsx";

describe("ForgotPasswordPage", () => {
  it("renders without crashing", () => {
    renderWithProviders(<ForgotPasswordPage />);
    expect(document.body).toBeTruthy();
  });

  it("renders form elements", () => {
    renderWithProviders(<ForgotPasswordPage />);
    const buttons = screen.queryAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("renders links", () => {
    renderWithProviders(<ForgotPasswordPage />);
    const links = screen.queryAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
  });
});
