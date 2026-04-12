/**
 * Mock for src/utils/logger/index.ts
 * Redirected via import_map.json during deno test runs.
 */

import { spy } from '@std/testing/mock';

const _logger = {
  debug: spy(),
  info: spy(),
  warn: spy(),
  error: spy(),
};

export function getLogger(_name?: string) {
  return _logger;
}

export const logAudit = spy();
export const logSecurity = spy();
export const logRequest = spy();
