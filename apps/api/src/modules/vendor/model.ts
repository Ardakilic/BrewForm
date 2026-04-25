// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';

export async function findById(id: string) {
  return prisma.vendor.findFirst({
    where: { id, deletedAt: null },
  });
}

export async function findMany(page: number, perPage: number) {
  const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({
      where: { deletedAt: null },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { name: 'asc' },
    }),
    prisma.vendor.count({ where: { deletedAt: null } }),
  ]);
  return { vendors, total };
}

export async function search(query: string) {
  return prisma.vendor.findMany({
    where: {
      deletedAt: null,
      name: { contains: query },
    },
    take: 10,
    orderBy: { name: 'asc' },
  });
}

export async function create(data: any) {
  return prisma.vendor.create({ data });
}

export async function update(id: string, data: any) {
  return prisma.vendor.update({ where: { id }, data });
}

export async function softDelete(id: string) {
  return prisma.vendor.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}