/**
 * Mock for src/utils/logger/index.ts
 * Redirected via import_map.json during deno test runs.
 */

import { mockFn } from '../mock-fn.js';

const _logger = {
  debug: mockFn<void>(),
  info: mockFn<void>(),
  warn: mockFn<void>(),
  error: mockFn<void>(),
};

export function getLogger(_name?: string) {
  return _logger;
}

export const logAudit = mockFn<void>();
export const logSecurity = mockFn<void>();
export const logRequest = mockFn<void>();
