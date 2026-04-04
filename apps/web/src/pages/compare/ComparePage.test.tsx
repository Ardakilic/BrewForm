import { describe, it } from "@std/testing";
import { expect } from "@std/expect";
import "../../test/setup.ts";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils.tsx";
import ComparePage from "./ComparePage.tsx";

describe("ComparePage", () => {
  it("renders compare page", () => {
    renderWithProviders(<ComparePage />);
    const content = document.body.textContent;
    expect(content).toBeTruthy();
  });

  it("renders recipe selection or comparison view", () => {
    renderWithProviders(<ComparePage />);
    const headings = screen.queryAllByRole("heading");
    expect(headings.length).toBeGreaterThan(0);
  });
});
