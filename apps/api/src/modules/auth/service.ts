/**
 * BrewForm Authentication Service
 * Handles user authentication logic
 */

import { getPrisma } from '../../utils/database/index.js';
import {
  hashPassword,
  verifyPassword,
  generateTokenPair,
  generateVerificationToken,
  generatePasswordResetToken,
  generateSessionToken,
  type TokenPair,
} from '../../utils/auth/index.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPasswordChangedEmail,
} from '../../utils/email/index.js';
import { getLogger, logAudit, logSecurity } from '../../utils/logger/index.js';
import { getConfig } from '../../config/index.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from '../../middleware/errorHandler.js';

// ============================================
// Types
// ============================================

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string | null;
    isAdmin: boolean;
  };
  tokens: TokenPair;
}

// ============================================
// Service
// ============================================

/**
 * Register a new user
 */
export async function register(input: RegisterInput): Promise<AuthResult> {
  const prisma = getPrisma();
  const config = getConfig();
  const logger = getLogger();

  // Check if email already exists
  const existingEmail = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (existingEmail) {
    throw new ConflictError('Email already registered');
  }

  // Check if username already exists
  const existingUsername = await prisma.user.findUnique({
    where: { username: input.username.toLowerCase() },
  });

  if (existingUsername) {
    throw new ConflictError('Username already taken');
  }

  // Hash password
  const passwordHash = await hashPassword(input.password);

  // Create user
  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      username: input.username.toLowerCase(),
      displayName: input.displayName || input.username,
      passwordHash,
      emailVerified: !config.enableEmailVerification,
    },
  });

  // Generate tokens
  const tokens = await generateTokenPair(user.id, user.email, user.isAdmin);

  // Create session
  await prisma.session.create({
    data: {
      userId: user.id,
      token: generateSessionToken(),
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    },
  });

  // Send verification email if enabled
  if (config.enableEmailVerification) {
    const verificationToken = generateVerificationToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.emailVerification.create({
      data: {
        userId: user.id,
        token: verificationToken,
        expiresAt,
      },
    });

    await sendVerificationEmail(user.email, user.username, verificationToken);
  }

  logAudit('user_registered', 'user', user.id, user.id);
  logger.info({ type: 'auth', action: 'register', userId: user.id });

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      isAdmin: user.isAdmin,
    },
    tokens,
  };
}

/**
 * Login user
 */
export async function login(
  input: LoginInput,
  userAgent?: string,
  ipAddress?: string
): Promise<AuthResult> {
  const prisma = getPrisma();
  const logger = getLogger();

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (!user || user.deletedAt) {
    logSecurity('login_failed_user_not_found', { email: input.email });
    throw new UnauthorizedError('Invalid email or password');
  }

  // Check if banned
  if (user.isBanned) {
    logSecurity('login_failed_banned', { userId: user.id });
    throw new UnauthorizedError('Your account has been suspended');
  }

  // Verify password
  const isValid = await verifyPassword(input.password, user.passwordHash);

  if (!isValid) {
    logSecurity('login_failed_invalid_password', { userId: user.id });
    throw new UnauthorizedError('Invalid email or password');
  }

  // Generate tokens
  const tokens = await generateTokenPair(user.id, user.email, user.isAdmin);

  // Create session
  await prisma.session.create({
    data: {
      userId: user.id,
      token: generateSessionToken(),
      refreshToken: tokens.refreshToken,
      userAgent,
      ipAddress,
      expiresAt: tokens.expiresAt,
    },
  });

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  logAudit('user_logged_in', 'user', user.id, user.id);
  logger.info({ type: 'auth', action: 'login', userId: user.id });

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      isAdmin: user.isAdmin,
    },
    tokens,
  };
}

/**
 * Logout user (invalidate session)
 */
export async function logout(userId: string, refreshToken: string): Promise<void> {
  const prisma = getPrisma();

  await prisma.session.deleteMany({
    where: {
      userId,
      refreshToken,
    },
  });

  logAudit('user_logged_out', 'user', userId, userId);
}

/**
 * Refresh access token
 */
export async function refreshTokens(refreshToken: string): Promise<TokenPair> {
  const prisma = getPrisma();

  // Find session by refresh token
  const session = await prisma.session.findUnique({
    where: { refreshToken },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  if (session.user.isBanned || session.user.deletedAt) {
    throw new UnauthorizedError('Account is not available');
  }

  // Generate new tokens
  const tokens = await generateTokenPair(
    session.userId,
    session.user.email,
    session.user.isAdmin
  );

  // Update session with new refresh token
  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    },
  });

  return tokens;
}

/**
 * Verify email
 */
export async function verifyEmail(token: string): Promise<void> {
  const prisma = getPrisma();

  const verification = await prisma.emailVerification.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!verification) {
    throw new BadRequestError('Invalid verification token');
  }

  if (verification.usedAt) {
    throw new BadRequestError('Token has already been used');
  }

  if (verification.expiresAt < new Date()) {
    throw new BadRequestError('Token has expired');
  }

  // Mark verification as used
  await prisma.emailVerification.update({
    where: { id: verification.id },
    data: { usedAt: new Date() },
  });

  // Update user email verified status
  await prisma.user.update({
    where: { id: verification.userId },
    data: {
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  // Send welcome email
  await sendWelcomeEmail(verification.user.email, verification.user.username);

  logAudit('email_verified', 'user', verification.userId, verification.userId);
}

/**
 * Request password reset
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const prisma = getPrisma();
  const config = getConfig();

  if (!config.enablePasswordReset) {
    throw new BadRequestError('Password reset is disabled');
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  // Always return success to prevent email enumeration
  if (!user || user.deletedAt || user.isBanned) {
    return;
  }

  // Generate reset token
  const token = generatePasswordResetToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Invalidate existing reset tokens
  await prisma.passwordReset.updateMany({
    where: {
      userId: user.id,
      usedAt: null,
    },
    data: { usedAt: new Date() },
  });

  // Create new reset token
  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  // Send reset email
  await sendPasswordResetEmail(user.email, user.username, token);

  logAudit('password_reset_requested', 'user', user.id, user.id);
}

/**
 * Reset password
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const prisma = getPrisma();

  const reset = await prisma.passwordReset.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!reset) {
    throw new BadRequestError('Invalid reset token');
  }

  if (reset.usedAt) {
    throw new BadRequestError('Token has already been used');
  }

  if (reset.expiresAt < new Date()) {
    throw new BadRequestError('Token has expired');
  }

  // Hash new password
  const passwordHash = await hashPassword(newPassword);

  // Update password
  await prisma.user.update({
    where: { id: reset.userId },
    data: { passwordHash },
  });

  // Mark reset as used
  await prisma.passwordReset.update({
    where: { id: reset.id },
    data: { usedAt: new Date() },
  });

  // Invalidate all sessions
  await prisma.session.deleteMany({
    where: { userId: reset.userId },
  });

  // Send notification
  await sendPasswordChangedEmail(reset.user.email, reset.user.username);

  logAudit('password_reset', 'user', reset.userId, reset.userId);
}

/**
 * Change password (while logged in)
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  // Verify current password
  const isValid = await verifyPassword(currentPassword, user.passwordHash);

  if (!isValid) {
    throw new BadRequestError('Current password is incorrect');
  }

  // Hash new password
  const passwordHash = await hashPassword(newPassword);

  // Update password
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  // Invalidate all other sessions
  await prisma.session.deleteMany({
    where: {
      userId,
      // Keep current session if needed
    },
  });

  // Send notification
  await sendPasswordChangedEmail(user.email, user.username);

  logAudit('password_changed', 'user', userId, userId);
}

export const authService = {
  register,
  login,
  logout,
  refreshTokens,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  changePassword,
};

export default authService;
