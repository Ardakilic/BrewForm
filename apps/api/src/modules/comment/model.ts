// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';

export async function findById(id: string) {
  return prisma.comment.findFirst({
    where: { id, deletedAt: null },
    include: { author: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  } as any);
}

export async function findByRecipe(recipeId: string, page: number, perPage: number) {
  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where: { recipeId, deletedAt: null, parentCommentId: null },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        replies: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
        },
      },
    } as any),
    prisma.comment.count({ where: { recipeId, deletedAt: null, parentCommentId: null } }),
  ]);
  return { comments, total };
}

export async function create(data: any) {
  return prisma.comment.create({
    data,
    include: { author: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  } as any);
}

export async function softDelete(id: string) {
  return prisma.comment.update({
    where: { id },
    data: { deletedAt: new Date() },
  } as any);
}

export async function getRecipeAuthorId(recipeId: string) {
  const recipe = await prisma.recipe.findUnique({ where: { id: recipeId }, select: { authorId: true } });
  return recipe?.authorId;
}