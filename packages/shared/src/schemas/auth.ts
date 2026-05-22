import { z } from 'zod';

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

export const AuthRegisterSchema = z.object({
  email: z.email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  password: passwordSchema,
  displayName: z.string().max(50).optional(),
});

export const AuthLoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1, 'password.required'),
  rememberMe: z.boolean().optional().default(false),
});

export const AuthRefreshSchema = z.object({
  refreshToken: z.string(),
  rememberMe: z.boolean().optional().default(false),
});

export const PasswordResetSchema = z.object({
  email: z.email(),
});

export const PasswordResetConfirmSchema = z.object({
  token: z.string(),
  newPassword: passwordSchema,
});
