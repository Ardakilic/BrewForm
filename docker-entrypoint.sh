#!/bin/sh
set -e

echo "Running database migrations..."
pnpm --filter @brewform/db run migrate
echo "Migrations complete."

# First-boot sentinel: count rows in the `users` table via the standalone,
# @brewform/db-backed check script. The admin account is the first row the seed
# inserts, so an empty `users` table means the database has never been seeded.
#
# The check script is TypeScript, so it runs via tsx (a devDependency of the
# @brewform/api workspace, kept installed in the runner image). Its stdout is
# the bare integer count, captured here. We do NOT mask a failed check to "0":
# with `set -e`, a genuine failure (DB unreachable, wrong DATABASE_URL, ...)
# aborts the boot rather than silently re-seeding an already-populated
# database on every restart.
USER_COUNT=$(pnpm --filter @brewform/api exec tsx /app/scripts/check-users-empty.ts)

if [ "$USER_COUNT" = "0" ]; then
  echo "Database is empty, running seed..."
  pnpm --filter @brewform/db run seed
  echo "Seeding complete."
else
  echo "Seed skipped — database already contains data ($USER_COUNT users)."
fi

echo "Starting BrewForm API..."
exec pnpm --filter @brewform/api exec tsx src/main.ts
