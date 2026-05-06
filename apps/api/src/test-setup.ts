/**
 * Centralized test setup for API tests.
 *
 * Import this module at the top of any test file that needs config/env vars
 * to be present before modules are loaded. This guarantees consistent
 * environment state and avoids cross-test pollution from Deno.env.set.
 */

Deno.env.set('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
Deno.env.set('JWT_SECRET', 'a-very-long-secret-key-for-testing-12345');
