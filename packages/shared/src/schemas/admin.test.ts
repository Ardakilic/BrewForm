import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import { AdminBanUserSchema, AdminCreateUserSchema, AdminUpdateUserSchema } from './admin.ts';

describe('AdminCreateUserSchema', () => {
  it('should accept valid create payload', () => {
    const result = AdminCreateUserSchema.safeParse({
      email: 'newuser@example.com',
      username: 'newuser1',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('should accept payload with all optional fields', () => {
    const result = AdminCreateUserSchema.safeParse({
      email: 'full@example.com',
      username: 'fulluser',
      password: 'password123',
      displayName: 'Full User',
      bio: 'A coffee enthusiast',
      isAdmin: true,
      isBanned: false,
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = AdminCreateUserSchema.safeParse({
      email: 'not-an-email',
      username: 'newuser',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject short username', () => {
    const result = AdminCreateUserSchema.safeParse({
      email: 'test@example.com',
      username: 'ab',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject username with special characters', () => {
    const result = AdminCreateUserSchema.safeParse({
      email: 'test@example.com',
      username: 'user name!',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject weak password', () => {
    const result = AdminCreateUserSchema.safeParse({
      email: 'test@example.com',
      username: 'newuser',
      password: '1234567',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing email', () => {
    const result = AdminCreateUserSchema.safeParse({
      username: 'newuser',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing username', () => {
    const result = AdminCreateUserSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing password', () => {
    const result = AdminCreateUserSchema.safeParse({
      email: 'test@example.com',
      username: 'newuser',
    });
    expect(result.success).toBe(false);
  });

  it('should reject displayName exceeding 50 chars', () => {
    const result = AdminCreateUserSchema.safeParse({
      email: 'test@example.com',
      username: 'newuser',
      password: 'password123',
      displayName: 'A'.repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it('should reject bio exceeding 500 chars', () => {
    const result = AdminCreateUserSchema.safeParse({
      email: 'test@example.com',
      username: 'newuser',
      password: 'password123',
      bio: 'B'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe('AdminUpdateUserSchema', () => {
  it('should reject empty object (no fields provided)', () => {
    const result = AdminUpdateUserSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should accept single field update', () => {
    const result = AdminUpdateUserSchema.safeParse({ displayName: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('should accept all fields', () => {
    const result = AdminUpdateUserSchema.safeParse({
      email: 'updated@example.com',
      username: 'updateduser',
      password: 'newpassword123',
      displayName: 'Updated User',
      bio: 'Updated bio',
      isAdmin: true,
      isBanned: false,
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = AdminUpdateUserSchema.safeParse({ email: 'bad-email' });
    expect(result.success).toBe(false);
  });

  it('should reject short username', () => {
    const result = AdminUpdateUserSchema.safeParse({ username: 'ab' });
    expect(result.success).toBe(false);
  });

  it('should reject short password', () => {
    const result = AdminUpdateUserSchema.safeParse({ password: 'short' });
    expect(result.success).toBe(false);
  });
});

describe('AdminBanUserSchema', () => {
  it('should accept valid ban with reason', () => {
    const result = AdminBanUserSchema.safeParse({
      userId: '550e8400-e29b-41d4-a716-446655440000',
      banned: true,
      reason: 'Spam account',
    });
    expect(result.success).toBe(true);
  });

  it('should accept unban without reason', () => {
    const result = AdminBanUserSchema.safeParse({
      userId: '550e8400-e29b-41d4-a716-446655440000',
      banned: false,
    });
    expect(result.success).toBe(true);
  });

  it('should reject ban without reason', () => {
    const result = AdminBanUserSchema.safeParse({
      userId: '550e8400-e29b-41d4-a716-446655440000',
      banned: true,
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid userId', () => {
    const result = AdminBanUserSchema.safeParse({
      userId: 'not-a-uuid',
      banned: true,
      reason: 'Test',
    });
    expect(result.success).toBe(false);
  });
});
