/**
 * Mock for src/utils/email/index.ts
 * Redirected via import_map.json during deno test runs.
 */

import { mockFn } from '../mock-fn.js';

export const sendEmail = mockFn(() => Promise.resolve(true));
export const sendVerificationEmail = mockFn(() => Promise.resolve(true));
export const sendPasswordResetEmail = mockFn(() => Promise.resolve(true));
export const sendWelcomeEmail = mockFn(() => Promise.resolve(true));
export const sendPasswordChangedEmail = mockFn(() => Promise.resolve(true));
