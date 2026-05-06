// deno-lint-ignore-file no-explicit-any
let prisma: any;

if (Deno.env.get('DENO_DEPLOY')) {
  const mod = await import('../generated/prisma/client.ts');
  const { withAccelerate } = await import('npm:@prisma/extension-accelerate');
  const PrismaClient = mod.PrismaClient;
  prisma = new PrismaClient({
    datasources: {
      db: { url: Deno.env.get('DATABASE_URL') },
    },
  }).$extends(withAccelerate());
} else {
  const mod = await import('@prisma/client');
  const PrismaClient = (mod as any).PrismaClient || (mod as any).default?.PrismaClient;
  const globalForPrisma = globalThis as unknown as { prisma: any };
  prisma = globalForPrisma.prisma || new PrismaClient({
    datasources: {
      db: { url: Deno.env.get('DATABASE_URL') },
    },
  });
  if (Deno.env.get('APP_ENV') !== 'production') {
    globalForPrisma.prisma = prisma;
  }
}

export { prisma };
export default prisma;
