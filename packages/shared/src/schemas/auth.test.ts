import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import {
  AuthLoginSchema,
  AuthRefreshSchema,
  AuthRegisterSchema,
  PasswordResetConfirmSchema,
  PasswordResetSchema,
} from './auth.ts';

describe('AuthRegisterSchema', () => {
  it('should validate a valid registration', () => {
    const result = AuthRegisterSchema.safeParse({
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional displayName', () => {
    const result = AuthRegisterSchema.safeParse({
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
      displayName: 'Test User',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = AuthRegisterSchema.safeParse({
      email: 'not-an-email',
      username: 'testuser',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject short username', () => {
    const result = AuthRegisterSchema.safeParse({
      email: 'test@example.com',
      username: 'ab',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject username with special characters', () => {
    const result = AuthRegisterSchema.safeParse({
      email: 'test@example.com',
      username: 'test user!',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject short password', () => {
    const result = AuthRegisterSchema.safeParse({
      email: 'test@example.com',
      username: 'testuser',
      password: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('should accept username with hyphens and underscores', () => {
    const result = AuthRegisterSchema.safeParse({
      email: 'test@example.com',
      username: 'test_user-123',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });
});

describe('AuthLoginSchema', () => {
  it('should validate a valid login', () => {
    const result = AuthLoginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing email', () => {
    const result = AuthLoginSchema.safeParse({
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });
});

describe('AuthLoginSchema with rememberMe', () => {
  it('should accept rememberMe: true', () => {
    const result = AuthLoginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      rememberMe: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rememberMe).toBe(true);
    }
  });

  it('should accept rememberMe: false (explicit)', () => {
    const result = AuthLoginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      rememberMe: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rememberMe).toBe(false);
    }
  });

  it('should default rememberMe to false when omitted', () => {
    const result = AuthLoginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rememberMe).toBe(false);
    }
  });

  it('should reject non-boolean rememberMe', () => {
    const result = AuthLoginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      rememberMe: 'yes',
    });
    expect(result.success).toBe(false);
  });

  it('should reject rememberMe as number', () => {
    const result = AuthLoginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      rememberMe: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('AuthRefreshSchema', () => {
  it('should validate a valid refresh request', () => {
    const result = AuthRefreshSchema.safeParse({
      refreshToken: 'some-token',
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing token', () => {
    const result = AuthRefreshSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('AuthRefreshSchema with rememberMe', () => {
  it('should accept rememberMe: true', () => {
    const result = AuthRefreshSchema.safeParse({
      refreshToken: 'some-token',
      rememberMe: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rememberMe).toBe(true);
    }
  });

  it('should default rememberMe to false when omitted', () => {
    const result = AuthRefreshSchema.safeParse({
      refreshToken: 'some-token',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rememberMe).toBe(false);
    }
  });

  it('should reject non-boolean rememberMe', () => {
    const result = AuthRefreshSchema.safeParse({
      refreshToken: 'some-token',
      rememberMe: 'true',
    });
    expect(result.success).toBe(false);
  });
});

describe('PasswordResetSchema', () => {
  it('should validate a valid email', () => {
    const result = PasswordResetSchema.safeParse({
      email: 'test@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = PasswordResetSchema.safeParse({
      email: 'not-email',
    });
    expect(result.success).toBe(false);
  });
});

describe('PasswordResetConfirmSchema', () => {
  it('should validate valid confirmation', () => {
    const result = PasswordResetConfirmSchema.safeParse({
      token: 'reset-token-123',
      newPassword: 'newPassword123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject short password', () => {
    const result = PasswordResetConfirmSchema.safeParse({
      token: 'reset-token-123',
      newPassword: 'short',
    });
    expect(result.success).toBe(false);
  });
});
