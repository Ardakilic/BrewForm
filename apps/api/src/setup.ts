import { db } from '@brewform/db';
import { userPreferences, users } from '@brewform/db/schema';
import { count } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
const { hashSync } = bcrypt;

async function main() {
  console.log('BrewForm Admin Setup');
  console.log('====================');

  const adminCountResult = await db.select({ count: count() }).from(users).where(
    eq(users.isAdmin, true),
  );
  const adminCount = adminCountResult[0].count;

  if (adminCount > 0) {
    console.log(`Admin users already exist (${adminCount} found). Skipping setup.`);
    return;
  }

  const email = Deno.env.get('ADMIN_EMAIL') || 'admin@brewform.local';
  const username = Deno.env.get('ADMIN_USERNAME') || 'admin';
  const password = Deno.env.get('ADMIN_PASSWORD') || 'admin123456';

  console.log(`Creating admin user: ${username} (${email})`);
  console.log(
    `Password: ${
      Deno.env.get('ADMIN_PASSWORD')
        ? '(from ADMIN_PASSWORD env)'
        : '(default: admin123456 — change immediately!)'
    }`,
  );

  const passwordHash = hashSync(password, 10);

  const [user] = await db.insert(users).values({
    email,
    username,
    passwordHash,
    isAdmin: true,
    isBanned: false,
    onboardingCompleted: true,
  }).returning();

  await db.insert(userPreferences).values({ userId: user.id });

  console.log(`Admin user created: ${user.id}`);
}

main().catch((err) => {
  console.error('Setup failed:', err);
  Deno.exit(1);
});
