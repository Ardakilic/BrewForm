/**
 * Centralized test setup for API tests.
 *
 * Import this module at the top of any test file that needs config/env vars
 * to be present before modules are loaded. This guarantees consistent
 * environment state and avoids cross-test pollution from process.env mutation.
 */

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'a-very-long-secret-key-for-testing-12345';
}
process.env.LOG_LEVEL = 'silent';
