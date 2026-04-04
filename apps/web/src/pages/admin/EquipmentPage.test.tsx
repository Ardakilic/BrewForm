import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils.tsx";
import EquipmentPage from "./EquipmentPage.tsx";

describe("Admin EquipmentPage", () => {
  it("renders equipment management page", () => {
    renderWithProviders(<EquipmentPage />);
    const content = document.body.textContent;
    expect(content).toBeTruthy();
  });

  it("renders equipment list or management", () => {
    renderWithProviders(<EquipmentPage />);
    const headings = screen.queryAllByRole("heading");
    expect(headings.length).toBeGreaterThan(0);
  });
});
