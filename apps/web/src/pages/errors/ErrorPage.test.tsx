/**
 * ErrorPage Tests
 */

import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils.tsx";
import ErrorPage from "./ErrorPage.tsx";

describe("ErrorPage", () => {
  it("renders error message", () => {
    renderWithProviders(<ErrorPage />);
    expect(screen.getByText(/error|something went wrong|oops/i))
      .toBeInTheDocument();
  });

  it("renders link to home or retry", () => {
    renderWithProviders(<ErrorPage />);
    const link = screen.queryByRole("link") || screen.queryByRole("button");
    expect(link).toBeInTheDocument();
  });
});
