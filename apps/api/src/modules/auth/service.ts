/**
 * Auth service — business logic layer for authentication workflows.
 *
 * Orchestrates user registration, login, token refresh, email verification,
 * and password reset flows. Delegates data access to `model.ts` and token
 * operations to `jwt.ts`. Email side-effects are fire-and-forget for
 * registration (non-blocking) but blocking for password resets.
 */
import * as jwt from './jwt.ts';
import * as model from './model.ts';
import { sendPasswordResetEmail, sendVerificationEmail } from './email.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { config } from '../../config/env.ts';
import type { User, UserPreferences } from '@brewform/shared/types';
// Standard dedup approach for future OAuth/social login:
// import { generateUniqueUsername } from '@brewform/shared';

const logger = createLogger('auth-service');

/**
 * Authenticated user shape with the stored `passwordHash` and a
 * fully-typed `preferences` field. Extends the shared {@link User}
 * type so this shape automatically picks up new public user fields.
 *
 * `preferences` is optional because the model's `leftJoin` returns
 * `undefined` when the user has no row in `userPreferences` (e.g.
 * for accounts created before preferences existed).
 */
export interface AuthUser extends Omit<User, 'preferences'> {
  passwordHash: string;
  preferences?: UserPreferences;
}

/**
 * Perform an unchecked cast from a raw user record to `AuthUser`.
 *
 * NOTE: This function does NOT validate the shape of the input — it
 * simply narrows `Record<string, unknown>` to `AuthUser` via
 * `as unknown as`. The caller must guarantee the input matches the
 * `AuthUser` interface before calling this helper.
 *
 * @param user - A raw user record (typically from a Drizzle query result).
 * @returns The same object, cast to the `AuthUser` interface.
 */
export function toAuthUser(user: Record<string, unknown>): AuthUser {
  return user as unknown as AuthUser;
}

/**
 * Register a new user account.
 *
 * @param data.email - User's email address (must be unique)
 * @param data.username - Chosen username (must be unique)
 * @param data.password - Plaintext password (hashed via model.createUser)
 * @param data.displayName - Optional display name
 * @returns Created user object, access token, and refresh token
 * @throws {Error} REGISTRATION_DISABLED if ENABLE_REGISTRATION env var is false
 * @throws {Error} EMAIL_ALREADY_EXISTS if the email is taken
 * @throws {Error} USERNAME_ALREADY_EXISTS if the username is taken
 */
export async function register(data: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}) {
  logger.debug({}, 'register started');
  if (!config.ENABLE_REGISTRATION) {
    throw new Error('REGISTRATION_DISABLED');
  }

  const emailTaken = await model.isEmailTaken(data.email);
  if (emailTaken) {
    throw new Error('EMAIL_ALREADY_EXISTS');
  }

  const usernameTaken = await model.isUsernameTaken(data.username);
  if (usernameTaken) {
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
    await sendVerificationToken(user.id, user.email, user.username);
  } catch (err) {
    logger.warn({ err }, 'Failed to send verification email');
  }

  logger.debug({}, 'register completed');
  return { user, accessToken, refreshToken };
}

/**
 * Authenticate a user with email and password.
 *
 * @param email - Registered email address
 * @param password - Plaintext password to verify
 * @param rememberMe - If true, refresh token uses the longer JWT_REMEMBER_ME_EXPIRY
 * @returns Authenticated user, access token, and refresh token
 * @throws {Error} INVALID_CREDENTIALS if email not found or password mismatch
 * @throws {Error} USER_BANNED if the user account is banned
 */
export async function login(email: string, password: string, rememberMe = false) {
  logger.debug({}, 'login started');
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

  const refreshToken = rememberMe
    ? await jwt.signRefreshToken(user.id, config.JWT_REMEMBER_ME_EXPIRY)
    : await jwt.signRefreshToken(user.id);

  logger.debug({}, 'login completed');
  return { user, accessToken, refreshToken };
}

/**
 * Issue a new access token using a valid refresh token (token rotation).
 *
 * @param refreshToken - A valid, non-expired refresh token
 * @returns Fresh user object, new access token, new refresh token, and a flag
 *          indicating whether the original refresh was a "remember me" token
 * @throws {Error} INVALID_TOKEN_TYPE if the token is not a refresh token
 * @throws {Error} USER_NOT_FOUND if the user no longer exists or is banned
 */
export async function refreshAccessToken(refreshToken: string) {
  logger.debug({}, 'refreshAccessToken started');
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

  const wasRememberMe = jwt.isLongLivedRefreshToken(payload);
  const newRefreshToken = wasRememberMe
    ? await jwt.signRefreshToken(user.id, config.JWT_REMEMBER_ME_EXPIRY)
    : await jwt.signRefreshToken(user.id);

  logger.debug({}, 'refreshAccessToken completed');
  return { user, accessToken: newAccessToken, refreshToken: newRefreshToken, wasRememberMe };
}

/**
 * Initiate a password reset flow. Creates a reset token and emails it.
 * Silently succeeds for non-existent emails to prevent enumeration.
 *
 * @param email - Email to send the reset link to
 * @throws {Error} EMAIL_SEND_FAILED if the email provider rejects delivery
 */
export async function requestPasswordReset(email: string) {
  logger.debug({}, 'requestPasswordReset started');
  const rawUser = await model.findUserByEmail(email);
  if (!rawUser) {
    logger.info('Password reset requested for non-existent email');
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
  logger.debug({}, 'requestPasswordReset completed');
}

/**
 * Complete a password reset by consuming the token and updating the password.
 *
 * @param token - Password reset token from the email link
 * @param newPassword - New plaintext password (hashed before storage)
 * @throws {Error} INVALID_RESET_TOKEN if the token does not exist
 * @throws {Error} TOKEN_ALREADY_USED if the token has been consumed
 * @throws {Error} TOKEN_EXPIRED if the token has passed its expiry
 */
export async function confirmPasswordReset(token: string, newPassword: string) {
  logger.debug({}, 'confirmPasswordReset started');
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
  logger.debug({}, 'confirmPasswordReset completed');
}

/** Fetch the currently authenticated user by ID. */
export async function getAuthenticatedUser(userId: string) {
  logger.debug({ userId }, 'getAuthenticatedUser started');
  const user = await model.findUserById(userId);
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }
  logger.debug({ userId }, 'getAuthenticatedUser completed');
  return user;
}

/**
 * Generate and deliver an email verification token.
 *
 * @param userId - The user to associate the token with
 * @param email - Recipient email address
 * @param username - Used for personalizing the verification email template
 */
export async function sendVerificationToken(userId: string, email: string, username: string) {
  logger.debug({ userId }, 'sendVerificationToken started');
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

  await model.createEmailVerificationToken(userId, token, expiresAt);
  await sendVerificationEmail(email, token, username);
  logger.debug({ userId }, 'sendVerificationToken completed');
}

/**
 * Verify an email address by consuming a verification token.
 *
 * @param token - Email verification token (raw, will be hashed for lookup)
 * @throws {Error} INVALID_VERIFICATION_TOKEN if the token does not exist
 * @throws {Error} TOKEN_ALREADY_USED if the token has been consumed
 * @throws {Error} TOKEN_EXPIRED if the token has passed its expiry
 */
export async function verifyEmail(token: string) {
  logger.debug({}, 'verifyEmail started');
  const record = await model.findEmailVerificationByToken(token);
  if (!record) {
    throw new Error('INVALID_VERIFICATION_TOKEN');
  }
  if (record.usedAt) {
    throw new Error('TOKEN_ALREADY_USED');
  }
  if (new Date(record.expiresAt) < new Date()) {
    throw new Error('TOKEN_EXPIRED');
  }

  await model.markEmailVerified(record.userId, record.id);
  logger.debug({}, 'verifyEmail completed');
}
