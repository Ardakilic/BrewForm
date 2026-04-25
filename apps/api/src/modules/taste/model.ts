// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';

export async function findAll() {
  return prisma.tasteNote.findMany({
    where: {},
    orderBy: [{ depth: 'asc' }, { name: 'asc' }],
  });
}

export async function findChildren(parentId: string) {
  return prisma.tasteNote.findMany({
    where: { parentId },
    orderBy: { name: 'asc' },
  });
}

export async function searchByName(query: string) {
  return prisma.tasteNote.findMany({
    where: {
      name: { contains: query },
    },
    orderBy: [{ depth: 'asc' }, { name: 'asc' }],
    take: 50,
  });
}

export async function getHierarchy() {
  return prisma.tasteNote.findMany({
    where: { parentId: null, depth: 0 },
    include: {
      children: {
        include: {
          children: true,
        },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });
}

export async function findById(id: string) {
  return prisma.tasteNote.findUnique({ where: { id } });
}

export async function create(data: { name: string; parentId?: string; color?: string; definition?: string; depth: number }) {
  return prisma.tasteNote.create({ data });
}

export async function update(id: string, data: { name?: string; color?: string; definition?: string }) {
  return prisma.tasteNote.update({ where: { id }, data });
}

export async function remove(id: string) {
  return prisma.tasteNote.delete({ where: { id } });
}