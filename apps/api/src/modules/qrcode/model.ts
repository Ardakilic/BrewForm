// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';

export async function findBySlug(slug: string) {
  return prisma.recipe.findUnique({
    where: { slug, deletedAt: null },
    select: { id: true, visibility: true },
  });
}