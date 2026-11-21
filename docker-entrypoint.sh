#!/bin/sh
# ============================================================
# BrewForm API image entrypoint (runs as the unprivileged `node` user under tini).
#
# Usage: docker-entrypoint.sh [serve|migrate]
#
#   serve    (default) Run migrations and the first-install bootstrap, then exec the API.
#            RUN_MIGRATIONS=false skips both (an external `migrate` run owns them; the
#            production compose file runs a one-shot `migrate` service and sets it on `api`).
#   migrate  Run migrations and the first-install bootstrap, then exit 0 (the one-shot
#            compose `migrate` service). Any other argument prints usage and exits 2.
#
# Every step runs Node directly on the TypeScript sources (Node 26 native type stripping):
# no pnpm, tsx or drizzle-kit process at runtime.
#   - Migrations: `node /app/packages/db/src/migrate.ts` (Drizzle migrator on the committed
#     packages/db/drizzle folder, default drizzle.__drizzle_migrations table, with the
#     pg_trgm pre-flight). A failure exits non-zero and, with `set -e`, the API never starts.
#   - First boot: `node src/check-users-empty.ts` (cwd /app/packages/db) prints the bare
#     `users` row count; `0` runs the seed with `node src/seed.ts`.
#   - Serve: `cd /app/apps/api && exec node src/main.ts`, so the API is the one Node
#     process and receives SIGTERM/SIGINT from tini (`tini -g` forwards signals to this
#     script's process group, so a stop during migrations or seeding is honoured too).
#
# Required env: DATABASE_URL and JWT_SECRET (validated by the API at startup).
# ============================================================
set -eu

usage() {
  echo "Usage: docker-entrypoint.sh [serve|migrate]" >&2
  echo "  serve    run migrations (unless RUN_MIGRATIONS=false), then start the API (default)" >&2
  echo "  migrate  run migrations and the first-install bootstrap, then exit" >&2
}

MODE="${1:-serve}"
case "$MODE" in
  serve | migrate) ;;
  *)
    echo "Unknown entrypoint mode: $MODE" >&2
    usage
    exit 2
    ;;
esac

echo "Entrypoint mode: $MODE"

# Apply pending migrations, then seed a database that has never been seeded.
run_migrations() {
  echo "Running database migrations..."
  node /app/packages/db/src/migrate.ts
  echo "Migrations complete."

  # First-boot sentinel: count rows in the `users` table with the standalone,
  # @brewform/db-backed check script. The admin account is the first row the seed
  # inserts, so an empty `users` table means the database has never been seeded.
  #
  # The check and the seed run with the @brewform/db workspace as cwd. The check's
  # stdout is the bare integer count, captured here. A failed check is NOT masked to
  # "0": with `set -e`, a genuine failure (DB unreachable, wrong DATABASE_URL, ...)
  # aborts the boot rather than silently re-seeding an already-populated database.
  cd /app/packages/db
  USER_COUNT=$(node /app/packages/db/src/check-users-empty.ts)

  if [ "$USER_COUNT" = "0" ]; then
    # First install only: ADMIN_* seeds the initial admin here; changing them
    # later does not update the existing admin row.
    echo "Database is empty, running seed..."
    node src/seed.ts
    echo "Seeding complete."
  else
    echo "Seed skipped — database already contains data ($USER_COUNT users)."
  fi
}

if [ "$MODE" = "migrate" ]; then
  run_migrations
  exit 0
fi

if [ "${RUN_MIGRATIONS:-true}" = "false" ]; then
  echo "Migrations skipped (RUN_MIGRATIONS=false)."
else
  run_migrations
fi

echo "Starting BrewForm API..."
cd /app/apps/api
exec node src/main.ts
