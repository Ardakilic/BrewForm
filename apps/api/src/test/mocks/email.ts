/**
 * Mock for src/utils/email/index.ts
 * Redirected via import_map.json during deno test runs.
 */

import { spy } from "@std/testing/mock";

export const sendEmail = spy(() => Promise.resolve(true));
export const sendVerificationEmail = spy(() => Promise.resolve(true));
export const sendPasswordResetEmail = spy(() => Promise.resolve(true));
export const sendWelcomeEmail = spy(() => Promise.resolve(true));
export const sendPasswordChangedEmail = spy(() => Promise.resolve(true));
