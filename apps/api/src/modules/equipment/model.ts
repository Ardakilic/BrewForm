// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';
import type { Prisma } from '@prisma/client';

export async function findById(id: string) {
  return prisma.equipment.findFirst({
    where: { id, deletedAt: null },
  });
}

export async function findMany(where: Prisma.EquipmentWhereInput, page: number, perPage: number) {
  const [items, total] = await Promise.all([
    prisma.equipment.findMany({
      where: { ...where, deletedAt: null },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { name: 'asc' },
    }),
    prisma.equipment.count({ where: { ...where, deletedAt: null } }),
  ]);
  return { items, total };
}

export async function search(query: string) {
  return prisma.equipment.findMany({
    where: {
      deletedAt: null,
      OR: [
        { name: { contains: query } },
        { brand: { contains: query } },
        { model: { contains: query } },
      ],
    },
    take: 10,
    orderBy: { name: 'asc' },
  });
}

export async function create(data: Prisma.EquipmentCreateInput) {
  return prisma.equipment.create({ data });
}

export async function update(id: string, data: Prisma.EquipmentUpdateInput) {
  return prisma.equipment.update({ where: { id }, data });
}

export async function softDelete(id: string) {
  return prisma.equipment.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}