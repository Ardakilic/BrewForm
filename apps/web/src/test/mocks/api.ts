/**
 * Mock for src/utils/api.ts
 * Bypasses import.meta.env (Vite-only) which is undefined in Deno tests.
 * Redirected via import_map.json during deno test runs.
 */

import { mockFn } from "../mock-fn.ts";

export type { ApiResponse } from "../../types";

export const api = {
  get: mockFn(() => Promise.resolve({ success: true, data: null })),
  post: mockFn(() => Promise.resolve({ success: true, data: null })),
  put: mockFn(() => Promise.resolve({ success: true, data: null })),
  patch: mockFn(() => Promise.resolve({ success: true, data: null })),
  delete: mockFn(() => Promise.resolve({ success: true, data: null })),
};

export default api;
