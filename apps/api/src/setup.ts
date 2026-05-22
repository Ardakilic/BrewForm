import { db } from '@brewform/db';
import { userPreferences, users } from '@brewform/db/schema';
import { count, eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { createLogger } from './utils/logger/index.ts';

const logger = createLogger('setup');

async function main() {
  logger.info('BrewForm Admin Setup');

  const adminCountResult = await db.select({ count: count() }).from(users).where(
    eq(users.isAdmin, true),
  );
  const adminCount = adminCountResult[0].count;

  if (adminCount > 0) {
    logger.info(`Admin users already exist (${adminCount} found). Skipping setup.`);
    return;
  }

  const email = Deno.env.get('ADMIN_EMAIL') || 'admin@brewform.local';
  const username = Deno.env.get('ADMIN_USERNAME') || 'admin';
  const password = Deno.env.get('ADMIN_PASSWORD') || 'admin123456';

  logger.info(`Creating admin user: ${username} (${email})`);
  logger.info(
    `Password: ${
      Deno.env.get('ADMIN_PASSWORD')
        ? '(from ADMIN_PASSWORD env)'
        : '(default: admin123456 — change immediately!)'
    }`,
  );

  const passwordHash = hashSync(password, 10);

  const user = await db.transaction(async (tx) => {
    const [insertedUser] = await tx.insert(users).values({
      email,
      username,
      passwordHash,
      isAdmin: true,
      isBanned: false,
      onboardingCompleted: true,
    }).returning();

    await tx.insert(userPreferences).values({ userId: insertedUser.id });

    return insertedUser;
  });

  logger.info(`Admin user created: ${user.id}`);
}

main().catch((err) => {
  logger.error({ err }, 'Setup failed');
  Deno.exit(1);
});
