// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';

export async function findById(id: string) {
  return prisma.setup.findFirst({
    where: { id, deletedAt: null },
    include: {
      portafilter: true,
      basket: true,
      puckScreen: true,
      paperFilter: true,
      tamper: true,
    },
  } as any);
}

export async function findByUser(userId: string, page: number, perPage: number) {
  const [setups, total] = await Promise.all([
    prisma.setup.findMany({
      where: { userId, deletedAt: null },
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: 'desc' },
      include: {
        portafilter: true,
        basket: true,
        puckScreen: true,
        paperFilter: true,
        tamper: true,
      },
    } as any),
    prisma.setup.count({ where: { userId, deletedAt: null } }),
  ]);
  return { setups, total };
}

export async function create(data: any) {
  return prisma.setup.create({
    data,
    include: {
      portafilter: true,
      basket: true,
      puckScreen: true,
      paperFilter: true,
      tamper: true,
    },
  } as any);
}

export async function update(id: string, data: any) {
  return prisma.setup.update({
    where: { id },
    data,
    include: {
      portafilter: true,
      basket: true,
      puckScreen: true,
      paperFilter: true,
      tamper: true,
    },
  } as any);
}

export async function softDelete(id: string) {
  return prisma.setup.update({
    where: { id },
    data: { deletedAt: new Date() },
  } as any);
}

export async function clearDefaultForUser(userId: string) {
  await prisma.setup.updateMany({
    where: { userId, isDefault: true },
    data: { isDefault: false },
  } as any);
}