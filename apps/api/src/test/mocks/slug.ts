/**
 * Mock for src/utils/slug/index.ts
 * Redirected via import_map.json during deno test runs.
 */

import { spy } from "@std/testing/mock";

export const createSlug = spy((title: unknown) =>
  String(title).toLowerCase().replace(/\s+/g, "-")
);

export const createRecipeSlug = spy((title: unknown) =>
  String(title).toLowerCase().replace(/\s+/g, "-")
);

export const createEquipmentSlug = spy((name: unknown) =>
  String(name).toLowerCase().replace(/\s+/g, "-")
);

export const createVendorSlug = spy((name: unknown) =>
  String(name).toLowerCase().replace(/\s+/g, "-")
);

export const createCoffeeSlug = spy((name: unknown) =>
  String(name).toLowerCase().replace(/\s+/g, "-")
);

export const createComparisonToken = spy(() => "abc123xyz");

export const createUniqueSlug = spy((title: unknown) =>
  String(title).toLowerCase().replace(/\s+/g, "-")
);

export const createNumberedSlug = spy((base: unknown, n: unknown) =>
  `${String(base)}-${String(n)}`
);

export const isValidSlug = spy(() => true);

export const sanitizeSlug = spy((s: unknown) => String(s));

export const extractBaseSlug = spy((s: unknown) => String(s));
