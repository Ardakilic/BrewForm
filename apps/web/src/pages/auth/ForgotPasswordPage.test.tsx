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
  it("renders email input field", () => {
    renderWithProviders(<ForgotPasswordPage />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("renders submit button", () => {
    renderWithProviders(<ForgotPasswordPage />);
    expect(screen.getByRole("button", { name: /submit|send|reset/i })).toBeInTheDocument();
  });

  it("renders back to login link", () => {
    renderWithProviders(<ForgotPasswordPage />);
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
  });
});
