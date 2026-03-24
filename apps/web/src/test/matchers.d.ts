/**
 * Custom matcher type declarations for @std/expect
 * Extends the expect() return type with custom DOM matchers
 */

declare module "@std/expect" {
  interface Expected {
    toBeInTheDocument(): void;
  }
}

export {};
