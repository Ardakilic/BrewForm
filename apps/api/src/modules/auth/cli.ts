/**
 * BrewForm Auth CLI Functions
 * Password reset functionality for CLI usage
 */

import type { getPrisma } from '../../utils/database/index.ts';
import { hashPassword } from '../../utils/auth/index.ts';

export interface ResetPasswordResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    username: string;
    displayName: string | null;
    isAdmin: boolean;
  };
  password?: string;
  error?: string;
}

/**
 * Generate a secure random password
 */
export function generatePassword(length = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Find user by email or username
 */
export async function findUser(
  prisma: ReturnType<typeof getPrisma>,
  identifier: string,
) {
  // Try to find by email first
  let user = await prisma.user.findUnique({
    where: { email: identifier.toLowerCase() },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      isAdmin: true,
    },
  });

  // If not found, try by username
  if (!user) {
    user = await prisma.user.findUnique({
      where: { username: identifier.toLowerCase() },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        isAdmin: true,
      },
    });
  }

  return user;
}

/**
 * Reset user password
 * Returns a result object for CLI usage
 */
export async function resetUserPassword(
  prisma: ReturnType<typeof getPrisma>,
  identifier: string,
  newPassword?: string,
): Promise<ResetPasswordResult> {
  // Validate password length if provided
  if (newPassword && newPassword.length < 8) {
    return {
      success: false,
      error: 'Password must be at least 8 characters long',
    };
  }

  // Find the user
  const user = await findUser(prisma, identifier);

  if (!user) {
    return {
      success: false,
      error: `User not found: ${identifier}`,
    };
  }

  // Generate or use provided password
  const password = newPassword || generatePassword();
  const passwordHash = await hashPassword(password);

  // Update the user's password
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  // Invalidate all existing sessions for security
  await prisma.session.deleteMany({
    where: { userId: user.id },
  });

  return {
    success: true,
    user,
    password: newPassword ? undefined : password, // Only return generated passwords
  };
}
