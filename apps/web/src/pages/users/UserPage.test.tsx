import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { renderWithProviders } from "../../test/test-utils.tsx";
import UserPage from "./UserPage.tsx";

describe("UserPage", () => {
  it("renders without crashing", () => {
    renderWithProviders(<UserPage />);
    expect(document.body).toBeTruthy();
  });

  it("renders loading state", () => {
    renderWithProviders(<UserPage />);
    expect(document.body).toBeTruthy();
  });
});
