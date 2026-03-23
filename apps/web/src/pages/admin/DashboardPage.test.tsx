import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { renderWithProviders } from "../../test/test-utils.tsx";
import DashboardPage from "./DashboardPage.tsx";

describe("Admin DashboardPage", () => {
  it("renders without crashing", () => {
    renderWithProviders(<DashboardPage />);
    expect(document.body).toBeTruthy();
  });

  it("renders content", () => {
    renderWithProviders(<DashboardPage />);
    const content = document.body.textContent;
    expect(content?.length).toBeGreaterThan(0);
  });
});
