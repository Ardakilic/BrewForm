import * as jwt from './jwt.ts';
import * as model from './model.ts';
import { sendPasswordResetEmail, sendWelcomeEmail } from './email.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('auth-service');

interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  passwordHash: string;
  isAdmin: boolean;
  isBanned: boolean;
  onboardingCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  // deno-lint-ignore no-explicit-any
  preferences: any;
}

// deno-lint-ignore no-explicit-any
function toAuthUser(user: any): AuthUser {
  return user as AuthUser;
}

export async function register(data: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}) {
  const existingEmail = await model.findUserByEmail(data.email);
  if (existingEmail) {
    throw new Error('EMAIL_ALREADY_EXISTS');
  }

  const existingUsername = await model.findUserByUsername(data.username);
  if (existingUsername) {
    throw new Error('USERNAME_ALREADY_EXISTS');
  }

  const user = toAuthUser(await model.createUser(data));
  const accessToken = await jwt.signAccessToken({
    id: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
  });
  const refreshToken = await jwt.signRefreshToken(user.id);

  try {
    await sendWelcomeEmail(user.email, user.username);
  } catch (err) {
    logger.warn({ err }, 'Failed to send welcome email');
  }

  return { user, accessToken, refreshToken };
}

export async function login(email: string, password: string) {
  const rawUser = await model.findUserByEmail(email);
  if (!rawUser) {
    throw new Error('INVALID_CREDENTIALS');
  }
  const user = toAuthUser(rawUser);
  if (user.isBanned) {
    throw new Error('USER_BANNED');
  }

  const valid = model.verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const accessToken = await jwt.signAccessToken({
    id: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
  });
  const refreshToken = await jwt.signRefreshToken(user.id);

  return { user, accessToken, refreshToken };
}

export async function refreshAccessToken(refreshToken: string) {
  const payload = await jwt.verifyJwt(refreshToken);
  if (payload.type !== 'refresh') {
    throw new Error('INVALID_TOKEN_TYPE');
  }

  const rawUser = await model.findUserById(payload.sub);
  if (!rawUser) {
    throw new Error('USER_NOT_FOUND');
  }
  const user = toAuthUser(rawUser);
  if (user.isBanned) {
    throw new Error('USER_NOT_FOUND');
  }

  const newAccessToken = await jwt.signAccessToken({
    id: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
  });
  const newRefreshToken = await jwt.signRefreshToken(user.id);

  return { user, accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function requestPasswordReset(email: string) {
  const rawUser = await model.findUserByEmail(email);
  if (!rawUser) {
    logger.info({ email }, 'Password reset requested for non-existent email');
    return;
  }
  const user = toAuthUser(rawUser);

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 3600 * 1000);

  await model.createPasswordReset(user.id, token, expiresAt);

  try {
    await sendPasswordResetEmail(user.email, token, user.username);
  } catch (err) {
    logger.error({ err }, 'Failed to send password reset email');
    throw new Error('EMAIL_SEND_FAILED');
  }
}

export async function confirmPasswordReset(token: string, newPassword: string) {
  const reset = await model.findPasswordResetByToken(token);
  if (!reset) {
    throw new Error('INVALID_RESET_TOKEN');
  }
  if (reset.usedAt) {
    throw new Error('TOKEN_ALREADY_USED');
  }
  if (new Date(reset.expiresAt) < new Date()) {
    throw new Error('TOKEN_EXPIRED');
  }

  await model.updateUserPassword(reset.userId, newPassword);
  await model.markPasswordResetUsed(reset.id);
}

export async function getAuthenticatedUser(userId: string) {
  const user = await model.findUserById(userId);
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }
  return user;
}