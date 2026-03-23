/**
 * Mock for src/utils/slug/index.ts
 * Redirected via import_map.json during deno test runs.
 */

import { mockFn } from "../mock-fn.ts";

export const createSlug = mockFn((title: unknown) =>
  String(title).toLowerCase().replace(/\s+/g, "-")
);

export const createRecipeSlug = mockFn((title: unknown) =>
  String(title).toLowerCase().replace(/\s+/g, "-")
);

export const createEquipmentSlug = mockFn((name: unknown) =>
  String(name).toLowerCase().replace(/\s+/g, "-")
);

export const createVendorSlug = mockFn((name: unknown) =>
  String(name).toLowerCase().replace(/\s+/g, "-")
);

export const createCoffeeSlug = mockFn((name: unknown) =>
  String(name).toLowerCase().replace(/\s+/g, "-")
);

export const createComparisonToken = mockFn(() => "abc123xyz");

export const createUniqueSlug = mockFn((title: unknown) =>
  String(title).toLowerCase().replace(/\s+/g, "-")
);

export const createNumberedSlug = mockFn((base: unknown, n: unknown) =>
  `${String(base)}-${String(n)}`
);

export const isValidSlug = mockFn(() => true);

export const sanitizeSlug = mockFn((s: unknown) => String(s));

export const extractBaseSlug = mockFn((s: unknown) => String(s));
