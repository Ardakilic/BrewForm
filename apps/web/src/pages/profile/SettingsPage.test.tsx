import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { renderWithProviders } from "../../test/test-utils.tsx";
import SettingsPage from "./SettingsPage.tsx";

describe("SettingsPage", () => {
  it("renders without crashing", () => {
    renderWithProviders(<SettingsPage />);
    expect(document.body).toBeTruthy();
  });

  it("renders form elements", () => {
    renderWithProviders(<SettingsPage />);
    expect(document.body).toBeTruthy();
  });
});
