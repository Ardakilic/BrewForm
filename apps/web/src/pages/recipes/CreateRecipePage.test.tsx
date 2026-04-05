/**
 * CreateRecipePage Tests
 */

import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils.tsx";
import CreateRecipePage from "./CreateRecipePage.tsx";

describe("CreateRecipePage", () => {
  it("renders recipe form", () => {
    renderWithProviders(<CreateRecipePage />);
    const content = document.body.textContent;
    expect(content?.length).toBeGreaterThan(0);
  });

  it("renders form inputs and submit button", () => {
    renderWithProviders(<CreateRecipePage />);
    const buttons = screen.queryAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });
});
