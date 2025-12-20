/**
 * BrewForm User Service
 * Handles user profile and preferences
 */

import { getPrisma, softDeleteFilter, getPagination, createPaginationMeta } from '../../utils/database/index.js';
import { logAudit } from '../../utils/logger/index.js';
import { NotFoundError, } from '../../middleware/errorHandler.js';
import type { UnitSystem, Theme } from '@prisma/client';

// ============================================
// Types
// ============================================

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string;
  website?: string;
  preferredLocale?: string;
  preferredTimezone?: string;
  preferredUnits?: UnitSystem;
  preferredTheme?: Theme;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  website: string | null;
  isAdmin: boolean;
  emailVerified: boolean;
  preferredLocale: string;
  preferredTimezone: string;
  preferredUnits: UnitSystem;
  preferredTheme: Theme;
  createdAt: Date;
  recipeCount: number;
  favouriteCount: number;
}

export interface PublicUserProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  website: string | null;
  createdAt: Date;
  recipeCount: number;
}

// ============================================
// Service Functions
// ============================================

/**
 * Get user profile by ID (for authenticated user)
 */
export async function getProfile(userId: string): Promise<UserProfile> {
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { id: userId, ...softDeleteFilter() },
    include: {
      _count: {
        select: {
          recipes: { where: softDeleteFilter() },
          favourites: true,
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    website: user.website,
    isAdmin: user.isAdmin,
    emailVerified: user.emailVerified,
    preferredLocale: user.preferredLocale,
    preferredTimezone: user.preferredTimezone,
    preferredUnits: user.preferredUnits,
    preferredTheme: user.preferredTheme,
    createdAt: user.createdAt,
    recipeCount: user._count.recipes,
    favouriteCount: user._count.favourites,
  };
}

/**
 * Get public user profile by username
 */
export async function getPublicProfile(username: string): Promise<PublicUserProfile> {
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { 
      username: username.toLowerCase(),
      ...softDeleteFilter(),
      isBanned: false,
    },
    include: {
      _count: {
        select: {
          recipes: {
            where: {
              ...softDeleteFilter(),
              visibility: 'PUBLIC',
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    website: user.website,
    createdAt: user.createdAt,
    recipeCount: user._count.recipes,
  };
}

/**
 * Update user profile
 */
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput
): Promise<UserProfile> {
  const prisma = getPrisma();

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      displayName: input.displayName,
      bio: input.bio,
      website: input.website || null,
      preferredLocale: input.preferredLocale,
      preferredTimezone: input.preferredTimezone,
      preferredUnits: input.preferredUnits,
      preferredTheme: input.preferredTheme,
    },
    include: {
      _count: {
        select: {
          recipes: { where: softDeleteFilter() },
          favourites: true,
        },
      },
    },
  });

  logAudit('profile_updated', 'user', userId, userId);

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    website: user.website,
    isAdmin: user.isAdmin,
    emailVerified: user.emailVerified,
    preferredLocale: user.preferredLocale,
    preferredTimezone: user.preferredTimezone,
    preferredUnits: user.preferredUnits,
    preferredTheme: user.preferredTheme,
    createdAt: user.createdAt,
    recipeCount: user._count.recipes,
    favouriteCount: user._count.favourites,
  };
}

/**
 * Get user's recipes
 */
export async function getUserRecipes(
  userId: string,
  viewerId: string | null,
  page = 1,
  limit = 20
) {
  const prisma = getPrisma();
  const pagination = getPagination({ page, limit });

  // Determine visibility filter based on viewer
  const visibilityFilter = viewerId === userId
    ? {} // Owner can see all their recipes
    : { visibility: 'PUBLIC' as const };

  const [recipes, total] = await Promise.all([
    prisma.recipe.findMany({
      where: {
        userId,
        ...softDeleteFilter(),
        ...visibilityFilter,
      },
      include: {
        currentVersion: {
          select: {
            id: true,
            title: true,
            brewMethod: true,
            drinkType: true,
            rating: true,
            emojiRating: true,
            createdAt: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...pagination,
    }),
    prisma.recipe.count({
      where: {
        userId,
        ...softDeleteFilter(),
        ...visibilityFilter,
      },
    }),
  ]);

  return {
    recipes,
    pagination: createPaginationMeta(page, limit, total),
  };
}

/**
 * Get user's favourites
 */
export async function getUserFavourites(userId: string, page = 1, limit = 20) {
  const prisma = getPrisma();
  const pagination = getPagination({ page, limit });

  const [favourites, total] = await Promise.all([
    prisma.userFavourite.findMany({
      where: { userId },
      include: {
        recipe: {
          include: {
            currentVersion: {
              select: {
                id: true,
                title: true,
                brewMethod: true,
                drinkType: true,
                rating: true,
              },
            },
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...pagination,
    }),
    prisma.userFavourite.count({ where: { userId } }),
  ]);

  return {
    favourites: favourites.map((f) => f.recipe),
    pagination: createPaginationMeta(page, limit, total),
  };
}

/**
 * Delete user account (soft delete)
 */
export async function deleteAccount(userId: string): Promise<void> {
  const prisma = getPrisma();

  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
  });

  // Invalidate all sessions
  await prisma.session.deleteMany({
    where: { userId },
  });

  logAudit('account_deleted', 'user', userId, userId);
}

export const userService = {
  getProfile,
  getPublicProfile,
  updateProfile,
  getUserRecipes,
  getUserFavourites,
  deleteAccount,
};

export default userService;
