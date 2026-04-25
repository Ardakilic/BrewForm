// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';

export async function findById(id: string) {
  return prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: { preferences: true },
  } as any);
}

export async function findByUsername(username: string) {
  return prisma.user.findFirst({
    where: { username, deletedAt: null },
    include: { preferences: true },
  } as any);
}

export async function updateProfile(id: string, data: { displayName?: string; bio?: string; avatarUrl?: string }) {
  return prisma.user.update({
    where: { id },
    data,
    include: { preferences: true },
  } as any);
}

export async function deleteUser(id: string) {
  return prisma.user.update({
    where: { id },
    data: { deletedAt: new Date() },
  } as any);
}

export async function getUserStats(id: string) {
  const [recipeCount, followerCount, followingCount] = await Promise.all([
    prisma.recipe.count({ where: { authorId: id, deletedAt: null, visibility: 'public' } }),
    prisma.userFollow.count({ where: { followingId: id } }),
    prisma.userFollow.count({ where: { followerId: id } }),
  ]);
  return { recipeCount, followerCount, followingCount };
}

export async function searchUsers(query: string, page: number, perPage: number) {
  const where = {
    deletedAt: null,
    OR: [
      { username: { contains: query } },
      { displayName: { contains: query } },
    ],
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * perPage,
      take: perPage,
      select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true, createdAt: true },
    }),
    prisma.user.count({ where }),
  ]);
  return { users, total };
}