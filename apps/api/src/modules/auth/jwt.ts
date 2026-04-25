import { sign, verify, decode } from 'hono/jwt';
import { config } from '../../config/index.ts';

const JWT_SECRET = config.JWT_SECRET;
const ACCESS_EXPIRY = config.JWT_ACCESS_EXPIRY;
const REFRESH_EXPIRY = config.JWT_REFRESH_EXPIRY;

export interface AccessPayload {
  sub: string;
  email: string;
  username: string;
  isAdmin: boolean;
  type: 'access';
  iat: number;
  exp: number;
}

export interface RefreshPayload {
  sub: string;
  type: 'refresh';
  iat: number;
  exp: number;
}

export type JwtPayload = AccessPayload | RefreshPayload;

export async function signAccessToken(user: { id: string; email: string; username: string; isAdmin: boolean }): Promise<string> {
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

export async function signRefreshToken(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    type: 'refresh' as const,
    iat: now,
    exp: now + parseExpiry(REFRESH_EXPIRY),
  };
  return await sign(payload, JWT_SECRET);
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
  const payload = await verify(token, JWT_SECRET, 'HS256');
  return payload as unknown as JwtPayload;
}

export function decodeJwt(token: string): { header: Record<string, unknown>; payload: Record<string, unknown> } | null {
  try {
    const decoded = decode(token);
    return {
      header: decoded.header as unknown as Record<string, unknown>,
      payload: decoded.payload as unknown as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid expiry format: ${expiry}`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: throw new Error(`Unknown time unit: ${unit}`);
  }
}