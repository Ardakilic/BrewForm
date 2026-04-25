// deno-lint-ignore-file no-explicit-any require-await
import { prisma } from '@brewform/db';

export async function create(reporterId: string, entityType: string, entityId: string, reason: string) {
  return prisma.report.create({
    data: { reporterId, entityType, entityId, reason },
  });
}

export async function findById(id: string) {
  return prisma.report.findUnique({ where: { id } });
}

export async function findMany(status: string | undefined, page: number, perPage: number) {
  const where: any = {};
  if (status) where.status = status;
  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: 'desc' },
      include: { reporter: { select: { id: true, username: true, displayName: true } } },
    }),
    prisma.report.count({ where }),
  ]);
  return { reports, total };
}

export async function resolve(id: string, resolvedBy: string) {
  return prisma.report.update({
    where: { id },
    data: { status: 'resolved', resolvedBy, resolvedAt: new Date() },
  } as any);
}