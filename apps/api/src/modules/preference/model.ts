// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';

export async function findByUserId(userId: string) {
  return prisma.userPreferences.findUnique({ where: { userId } });
}

export async function upsert(userId: string, data: any) {
  return prisma.userPreferences.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  } as any);
}