import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (Deno.env.get('APP_ENV') !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;