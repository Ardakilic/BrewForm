/**
 * Mock for src/utils/api.ts
 * Bypasses import.meta.env (Vite-only) which is undefined in Deno tests.
 * Redirected via import_map.json during deno test runs.
 */

import { spy } from "@std/testing/mock";

export type { ApiResponse } from "../../types/index.ts";

export const api = {
  get: spy(() => Promise.resolve({ data: null, error: null })),
  post: spy(() => Promise.resolve({ data: null, error: null })),
  put: spy(() => Promise.resolve({ data: null, error: null })),
  patch: spy(() => Promise.resolve({ data: null, error: null })),
  delete: spy(() => Promise.resolve({ data: null, error: null })),
};

export default api;
