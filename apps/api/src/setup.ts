// deno-lint-ignore-file no-explicit-any
import { prisma } from '@brewform/db';
import { hashSync } from 'bcryptjs';

async function main() {
  console.log('BrewForm Admin Setup');
  console.log('====================');

  const adminCount = await prisma.user.count({
    where: { isAdmin: true } as any,
  });

  if (adminCount > 0) {
    console.log(`Admin users already exist (${adminCount} found). Skipping setup.`);
    await prisma.$disconnect();
    return;
  }

  const email = Deno.env.get('ADMIN_EMAIL') || 'admin@brewform.local';
  const username = Deno.env.get('ADMIN_USERNAME') || 'admin';
  const password = Deno.env.get('ADMIN_PASSWORD') || 'changeme123';

  console.log(`Creating admin user: ${username} (${email})`);
  console.log(`Password: ${Deno.env.get('ADMIN_PASSWORD') ? '(from ADMIN_PASSWORD env)' : '(default: changeme123 — change immediately!)'}`);

  const passwordHash = hashSync(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash,
      isAdmin: true,
      isBanned: false,
      onboardingCompleted: true,
      preferences: {
        create: {},
      },
    } as any,
  });

  console.log(`Admin user created: ${user.id}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Setup failed:', err);
  Deno.exit(1);
});