// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';

export async function findFollow(followerId: string, followingId: string) {
  return prisma.userFollow.findUnique({
    where: { followerId_followingId: { followerId, followingId } } as any,
  });
}

export async function createFollow(followerId: string, followingId: string) {
  return prisma.userFollow.create({
    data: { followerId, followingId },
  } as any);
}

export async function deleteFollow(followerId: string, followingId: string) {
  const follow = await prisma.userFollow.findFirst({
    where: { followerId, followingId },
  } as any);
  if (!follow) throw new Error('FOLLOW_NOT_FOUND');
  await prisma.userFollow.delete({ where: { id: follow.id } } as any);
}

export async function getFollowers(userId: string, page: number, perPage: number) {
  const [followers, total] = await Promise.all([
    prisma.userFollow.findMany({
      where: { followingId: userId },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: 'desc' },
      include: { follower: { select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true } } },
    }) as any,
    prisma.userFollow.count({ where: { followingId: userId } }),
  ]);
  return { followers, total };
}

export async function getFollowing(userId: string, page: number, perPage: number) {
  const [following, total] = await Promise.all([
    prisma.userFollow.findMany({
      where: { followerId: userId },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: 'desc' },
      include: { following: { select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true } } },
    }) as any,
    prisma.userFollow.count({ where: { followerId: userId } }),
  ]);
  return { following, total };
}

export async function getFollowingIds(userId: string) {
  const follows = await prisma.userFollow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  } as any);
  return follows.map((f: any) => f.followingId);
}

export async function isFollowing(followerId: string, followingId: string) {
  const count = await prisma.userFollow.count({
    where: { followerId, followingId },
  } as any);
  return count > 0;
}