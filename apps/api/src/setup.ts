import { db } from '@brewform/db';
import { userPreferences, users } from '@brewform/db/schema';
import { hashSync } from 'bcryptjs';
import { count, eq } from 'drizzle-orm';
import { createLogger } from './utils/logger/index.ts';

const logger = createLogger('setup');

async function main() {
  logger.info('BrewForm Admin Setup');

  const adminCountResult = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.isAdmin, true));
  const adminCount = adminCountResult[0].count;

  if (adminCount > 0) {
    logger.info(`Admin users already exist (${adminCount} found). Skipping setup.`);
    return;
  }

  const email = process.env.ADMIN_EMAIL || 'admin@brewform.local';
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123456';

  logger.info('Creating admin user');
  logger.info(
    process.env.ADMIN_PASSWORD
      ? 'Admin password configured from environment'
      : 'Admin password using default (should be changed immediately)',
  );

  const passwordHash = hashSync(password, 10);

  const user = await db.transaction(async (tx) => {
    const [insertedUser] = await tx
      .insert(users)
      .values({
        email,
        username,
        passwordHash,
        isAdmin: true,
        isBanned: false,
        onboardingCompleted: true,
      })
      .returning();

    await tx.insert(userPreferences).values({ userId: insertedUser.id });

    return insertedUser;
  });

  logger.info(`Admin user created: ${user.id}`);
}

main().catch((err) => {
  logger.error({ err }, 'Setup failed');
  process.exit(1);
});
