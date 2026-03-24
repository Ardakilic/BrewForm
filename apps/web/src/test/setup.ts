/**
 * Deno Test Setup
 * Configures DOM environment and suppresses known warnings.
 */

/// <reference types="./matchers.d.ts" />

import { JSDOM } from "jsdom";
import { afterEach } from "@std/testing";
import { expect } from "@std/expect";

// Custom DOM matchers compatible with @std/expect's calling convention.
// @testing-library/jest-dom uses Jest's convention (this=context, first arg=received)
// but @std/expect passes context as the FIRST argument with context.value = received.
expect.extend({
  toBeInTheDocument(context: { value: unknown; isNot: boolean }) {
    const el = context.value as Element | null;
    const pass = el !== null &&
      el !== undefined &&
      // deno-lint-ignore no-explicit-any
      (el as any).ownerDocument?.body?.contains?.(el) === true;
    return {
      pass,
      message: () =>
        pass
          ? "Expected element NOT to be in the document, but it was found"
          : "Expected element to be in the document, but it was not found",
    };
  },
});

// Set up DOM environment for tests
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost:3000",
  pretendToBeVisual: true,
});

// deno-lint-ignore no-explicit-any
const win = dom.window as any;

const defaultMatchMedia = (_query: string) => ({
  matches: false,
  media: _query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

// Set a default globalThis.matchMedia so it's always defined
// deno-lint-ignore no-explicit-any
(globalThis as any).matchMedia = defaultMatchMedia;

// Make win.matchMedia delegate to globalThis.matchMedia so tests that set
// globalThis.matchMedia (e.g. ThemeContext.test.tsx) are seen by components
// that access window.matchMedia (where window === win).
Object.defineProperty(win, "matchMedia", {
  // deno-lint-ignore no-explicit-any
  get: () => (globalThis as any).matchMedia,
  configurable: true,
});

Object.assign(globalThis, {
  window: win,
  document: win.document,
  navigator: win.navigator,
  location: win.location,
  history: win.history,
  localStorage: win.localStorage,
  sessionStorage: win.sessionStorage,
  getComputedStyle: win.getComputedStyle.bind(win),
  requestAnimationFrame: (cb: FrameRequestCallback) => win.setTimeout(cb, 16),
  cancelAnimationFrame: win.clearTimeout.bind(win),
  Node: win.Node,
  Element: win.Element,
  HTMLElement: win.HTMLElement,
  Text: win.Text,
  Event: win.Event,
  CustomEvent: win.CustomEvent,
  MutationObserver: win.MutationObserver,
  URL: win.URL,
  URLSearchParams: win.URLSearchParams,
});

// Auto-cleanup after each test to prevent DOM leaking between tests.
// Uses dynamic import so @testing-library/dom loads AFTER globalThis.document is set.
afterEach(async () => {
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});

// Suppress React defaultProps warnings from BaseUI components
const originalError = console.error;
console.error = (...args: unknown[]) => {
  const message = args[0];
  if (
    typeof message === "string" &&
    message.includes("Support for defaultProps will be removed")
  ) {
    return;
  }
  originalError.apply(console, args);
};

const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const message = args[0];
  if (
    typeof message === "string" &&
    message.includes("Support for defaultProps will be removed")
  ) {
    return;
  }
  originalWarn.apply(console, args);
};
