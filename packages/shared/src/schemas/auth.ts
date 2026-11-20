import { z } from 'zod';
import { EmailSchema } from './common.ts';

/**
 * Password complexity requirements:
 * - 8--128 characters
 * - At least one lowercase letter
 * - At least one uppercase letter
 * - At least one digit
 * - At least one special character
 */
const passwordSchema = z
  .string()
  .min(8, 'password.tooShort')
  .max(128, 'password.tooLong')
  .regex(/[a-z]/, 'password.needsLowercase')
  .regex(/[A-Z]/, 'password.needsUppercase')
  .regex(/[0-9]/, 'password.needsDigit')
  .regex(/[^a-zA-Z0-9]/, 'password.needsSpecial');

/**
 * Validates registration payloads (email, username, complex password). The email is trimmed and
 * lower-cased ({@link EmailSchema}); the username is trimmed but keeps its display case.
 * Used by POST /api/v1/auth/register.
 */
export const AuthRegisterSchema = z.object({
  email: EmailSchema,
  username: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/),
  password: passwordSchema,
  displayName: z.string().max(50).optional(),
});

/**
 * Validates login payloads; the email is trimmed and lower-cased ({@link EmailSchema}).
 * Used by POST /api/v1/auth/login.
 */
export const AuthLoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'password.required'),
  rememberMe: z.boolean().optional().default(false),
});

/**
 * Validates refresh-token payloads.
 * Used by POST /api/v1/auth/refresh.
 */
export const AuthRefreshSchema = z.object({
  refreshToken: z.string(),
  rememberMe: z.boolean().optional().default(false),
});

/**
 * Validates password-reset request payloads (email only, trimmed and lower-cased).
 * Used by POST /api/v1/auth/forgot-password.
 */
export const PasswordResetSchema = z.object({
  email: EmailSchema,
});

/**
 * Validates password-reset confirmation payloads (token + new complex password).
 * Used by POST /api/v1/auth/reset-password.
 */
export const PasswordResetConfirmSchema = z.object({
  token: z.string(),
  newPassword: passwordSchema,
});
