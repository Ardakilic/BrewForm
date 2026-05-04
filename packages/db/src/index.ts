// deno-lint-ignore-file
import prismaPkg from '@prisma/client';
const PrismaClient = (prismaPkg as any).PrismaClient;

const globalForPrisma = globalThis as unknown as { prisma: any };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  datasources: {
    db: {
      url: Deno.env.get('DATABASE_URL'),
    },
  },
});

if (Deno.env.get('APP_ENV') !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
