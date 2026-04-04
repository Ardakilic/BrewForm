import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils.tsx";
import TasteNotesPage from "./TasteNotesPage.tsx";

describe("Admin TasteNotesPage", () => {
  it("renders taste notes management page", () => {
    renderWithProviders(<TasteNotesPage />);
    const content = document.body.textContent;
    expect(content).toBeTruthy();
  });

  it("renders taste notes list or management", () => {
    renderWithProviders(<TasteNotesPage />);
    const headings = screen.queryAllByRole("heading");
    expect(headings.length).toBeGreaterThan(0);
  });
});
