// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';

export async function findById(id: string) {
  return prisma.bean.findFirst({
    where: { id, deletedAt: null },
    include: { vendor: true },
  });
}

export async function findByUser(userId: string, page: number, perPage: number) {
  const [beans, total] = await Promise.all([
    prisma.bean.findMany({
      where: { userId, deletedAt: null },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: 'desc' },
      include: { vendor: true },
    }),
    prisma.bean.count({ where: { userId, deletedAt: null } }),
  ]);
  return { beans, total };
}

export async function create(data: any) {
  return prisma.bean.create({ data, include: { vendor: true } });
}

export async function update(id: string, data: any) {
  return prisma.bean.update({ where: { id }, data, include: { vendor: true } });
}

export async function softDelete(id: string) {
  return prisma.bean.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}