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
  it("renders without crashing", () => {
    renderWithProviders(<CreateRecipePage />);
    expect(document.body).toBeTruthy();
  });

  it("renders form content", () => {
    renderWithProviders(<CreateRecipePage />);
    const content = document.body.textContent;
    expect(content?.length).toBeGreaterThan(0);
  });

  it("renders buttons", () => {
    renderWithProviders(<CreateRecipePage />);
    const buttons = screen.queryAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
  });
});
