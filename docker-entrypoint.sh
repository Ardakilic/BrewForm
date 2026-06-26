#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/packages/db && deno run -A npm:drizzle-kit@0.31 migrate
echo "Migrations complete."

# Return to the workspace root so Deno discovers the root deno.json (the
# workspace config) when running the seed check and the seed — this mirrors how
# the Makefile/CI invoke the seed (`deno run ... packages/db/src/seed.ts` from /app).
cd /app

# First-boot sentinel: count rows in the `users` table via the standalone,
# @brewform/db-backed check script. The admin account is the first row the seed
# inserts, so an empty `users` table means the database has never been seeded.
#
# The check needs Postgres access, hence --allow-env (DATABASE_URL) / --allow-net
# / --allow-read. Its stdout is the bare integer count, captured here. We do NOT
# mask a failed check to "0": with `set -e`, a genuine failure (DB unreachable,
# wrong DATABASE_URL, ...) aborts the boot rather than silently re-seeding an
# already-populated database on every restart.
USER_COUNT=$(deno run --allow-env --allow-net --allow-read /app/scripts/check-users-empty.ts)

if [ "$USER_COUNT" = "0" ]; then
  echo "Database is empty, running seed..."
  deno run --allow-all /app/packages/db/src/seed.ts
  echo "Seeding complete."
else
  echo "Seed skipped — database already contains data ($USER_COUNT users)."
fi

echo "Starting BrewForm API..."
exec deno run --allow-read --allow-write --allow-net --allow-env --allow-sys --unstable-cron --unstable-kv /app/apps/api/src/main.ts
