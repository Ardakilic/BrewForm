/**
 * BrewForm Authentication Utilities
 * JWT token handling and password hashing
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { hash, verify } from '@node-rs/argon2';
import { nanoid } from 'nanoid';
import { getConfig } from '../../config/index.js';

// ============================================
// Types
// ============================================

export interface TokenPayload extends JWTPayload {
  userId: string;
  email: string;
  isAdmin: boolean;
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

// ============================================
// Password Hashing
// ============================================

/**
 * Hash a password using Argon2
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// ============================================
// JWT Token Generation
// ============================================

/**
 * Parse duration string to milliseconds
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = Number.parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

/**
 * Create a JWT token
 */
async function createToken(
  payload: Omit<TokenPayload, 'iat' | 'exp'>,
  expiresIn: string
): Promise<string> {
  const config = getConfig();
  const secret = new TextEncoder().encode(config.jwtSecret);
  
  return new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setIssuer(config.appName)
    .sign(secret);
}

/**
 * Generate access and refresh token pair
 */
export async function generateTokenPair(
  userId: string,
  email: string,
  isAdmin: boolean
): Promise<TokenPair> {
  const config = getConfig();

  const accessToken = await createToken(
    { userId, email, isAdmin, type: 'access' },
    config.jwtAccessExpiresIn
  );

  const refreshToken = await createToken(
    { userId, email, isAdmin, type: 'refresh' },
    config.jwtRefreshExpiresIn
  );

  const expiresAt = new Date(
    Date.now() + parseDuration(config.jwtAccessExpiresIn)
  );

  return {
    accessToken,
    refreshToken,
    expiresAt,
  };
}

/**
 * Verify a JWT token
 */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  const config = getConfig();
  const secret = new TextEncoder().encode(config.jwtSecret);

  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: config.appName,
    });

    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Verify an access token
 */
export async function verifyAccessToken(
  token: string
): Promise<TokenPayload | null> {
  const payload = await verifyToken(token);
  
  if (!payload || payload.type !== 'access') {
    return null;
  }

  return payload;
}

/**
 * Verify a refresh token
 */
export async function verifyRefreshToken(
  token: string
): Promise<TokenPayload | null> {
  const payload = await verifyToken(token);
  
  if (!payload || payload.type !== 'refresh') {
    return null;
  }

  return payload;
}

// ============================================
// Token Generation for Email Verification etc.
// ============================================

/**
 * Generate a secure random token
 */
export function generateSecureToken(length = 32): string {
  return nanoid(length);
}

/**
 * Generate a session token
 */
export function generateSessionToken(): string {
  return nanoid(64);
}

/**
 * Generate an email verification token
 */
export function generateVerificationToken(): string {
  return nanoid(32);
}

/**
 * Generate a password reset token
 */
export function generatePasswordResetToken(): string {
  return nanoid(32);
}

// ============================================
// Exports
// ============================================

export const auth = {
  hashPassword,
  verifyPassword,
  generateTokenPair,
  verifyToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateSecureToken,
  generateSessionToken,
  generateVerificationToken,
  generatePasswordResetToken,
};

export default auth;
