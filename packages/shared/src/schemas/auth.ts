import { z } from 'zod';

export const AuthRegisterSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
  displayName: z.string().max(50).optional(),
});

export const AuthLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const AuthRefreshSchema = z.object({
  refreshToken: z.string(),
});

export const PasswordResetSchema = z.object({
  email: z.string().email(),
});

export const PasswordResetConfirmSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8).max(128),
});