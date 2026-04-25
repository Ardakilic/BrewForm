// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';

export async function findById(id: string) {
  return prisma.photo.findFirst({
    where: { id, deletedAt: null },
  });
}

export async function findByRecipe(recipeId: string) {
  return prisma.photo.findMany({
    where: { recipeId, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function create(data: any) {
  return prisma.photo.create({ data } as any);
}

export async function softDelete(id: string) {
  return prisma.photo.update({
    where: { id },
    data: { deletedAt: new Date() },
  } as any);
}