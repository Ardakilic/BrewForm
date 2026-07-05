/**
 * JWT token management for BrewForm.
 *
 * Uses Hono's built-in `hono/jwt` (sign, verify, decode) with HS256.
 * Two token types with a `type` discriminator to prevent cross-use:
 *   - Access tokens carry full user identity (sub, email, username, isAdmin)
 *   - Refresh tokens carry only the subject (sub)
 *
 * Expiry values are configured via JWT_ACCESS_EXPIRY and JWT_REFRESH_EXPIRY
 * env vars, parsed by parseExpiry() (supports s/m/h/d suffixes).
 */
import { decode, sign, verify } from 'hono/jwt';
import { config } from '../../config/index.ts';

const JWT_SECRET = config.JWT_SECRET;
const ACCESS_EXPIRY = config.JWT_ACCESS_EXPIRY;
const REFRESH_EXPIRY = config.JWT_REFRESH_EXPIRY;

/** Access token payload — full user identity, short-lived (default 15m). */
export interface AccessPayload {
  sub: string;
  email: string;
  username: string;
  isAdmin: boolean;
  type: 'access';
  iat: number;
  exp: number;
}

/** Refresh token payload — minimal subject-only, long-lived (default 7d). */
export interface RefreshPayload {
  sub: string;
  type: 'refresh';
  iat: number;
  exp: number;
}

/** Discriminated union: use `payload.type === 'access'` to narrow. */
export type JwtPayload = AccessPayload | RefreshPayload;

/** Sign a new access token with full user claims. */
export async function signAccessToken(
  user: { id: string; email: string; username: string; isAdmin: boolean },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
    type: 'access' as const,
    iat: now,
    exp: now + parseExpiry(ACCESS_EXPIRY),
  };
  return await sign(payload, JWT_SECRET);
}

/** Sign a new refresh token with subject only (no identity claims).
 *  When customExpiry is provided (e.g. for "remember me"), it overrides
 *  the default JWT_REFRESH_EXPIRY. */
export async function signRefreshToken(
  userId: string,
  customExpiry?: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expirySeconds = parseExpiry(customExpiry ?? REFRESH_EXPIRY);
  const payload = {
    sub: userId,
    type: 'refresh' as const,
    iat: now,
    exp: now + expirySeconds,
  };
  return await sign(payload, JWT_SECRET);
}

/** Verify and decode a JWT, returning a typed AccessPayload or RefreshPayload. */
export async function verifyJwt(token: string): Promise<JwtPayload> {
  const payload = await verify(token, JWT_SECRET, 'HS256');
  // hono/jwt's verify returns its own JWTPayload type; our JwtPayload union is
  // a stricter discriminator — the double cast bridges the library type gap (D34 P3).
  return payload as unknown as JwtPayload;
}

/** Whether a refresh token was issued with a longer-than-standard lifetime
 *  (i.e. via "remember me"), by comparing exp - iat against JWT_REFRESH_EXPIRY. */
export function isLongLivedRefreshToken(payload: RefreshPayload): boolean {
  const originalLifetime = payload.exp - payload.iat;
  const standardLifetime = parseExpiry(REFRESH_EXPIRY);
  return originalLifetime > standardLifetime;
}

/** Decode a JWT without verification. Returns null on malformed input. */
export function decodeJwt(
  token: string,
): { header: Record<string, unknown>; payload: Record<string, unknown> } | null {
  try {
    const decoded = decode(token);
    return {
      // decode returns loosely-typed header/payload objects; cast to Record (D34 P3).
      header: decoded.header as unknown as Record<string, unknown>,
      payload: decoded.payload as unknown as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhdM])$/);
  if (!match) throw new Error(`Invalid expiry format: ${expiry}`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    case 'M':
      return value * 30 * 86400; // 30 days per month
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
}
