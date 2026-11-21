# database-seed Specification

## Purpose

Defines what the database seed inserts in each environment and keeps it safe to re-run.

## Requirements
### Requirement: Production seed creates only the admin and reference data
The seed (`packages/db/src/seed.ts`) SHALL create demo accounts and demo content only when `APP_ENV` is not `production`; with `APP_ENV=production` it SHALL create only the admin account with its preferences and the reference data.

- Reference data: brew-method/equipment compatibility rules, badges, the system equipment
  catalogue, the system coffee varieties, the vendor directory (the 7 real-roaster vendors of
  `vendorSeedData`) and the SCAA taste notes.
- Demo content: the `userSeedData` accounts (shared `defaultPassword`), their equipment, beans,
  setups, recipes (with versions, photos, preparations and taste notes), social data (follows,
  likes, favourites, ratings, comments and user badges), collections and brew logs.
- The decision SHALL come from an exported pure function `shouldSeedDemoContent(appEnv)`, evaluated
  when the seed runs, and the seed SHALL log one line when it skips demo content. No environment
  variable overrides it (there is no `SEED_DEMO_DATA` switch).
- An install seeded before this rule keeps the demo accounts it already has; the self-hosting and
  Coolify deployment guides SHALL warn about them and give the steps to remove them.
- Development (`make db-seed`, `make test-db-provision`) and test runs keep the full demo data set.

#### Scenario: Fresh production install has no demo accounts
- **WHEN** the API image bootstraps an empty database with `APP_ENV=production`
- **THEN** the `user` table holds exactly one row, the admin, and no address ends with `@example.com`
- **AND** the reference catalogues are populated (the `vendor` table holds the 7 vendors of `vendorSeedData`) and no recipe, bean, setup, collection, brew log, comment or follow exists

#### Scenario: Development seed keeps the demo data
- **WHEN** `make db-seed` runs with `APP_ENV=development`
- **THEN** the demo accounts and their recipes are created as before

#### Scenario: Production seed is idempotent
- **WHEN** the seed runs twice with `APP_ENV=production`
- **THEN** the second run succeeds and every table keeps the counts of the first run

### Requirement: Seed re-runs survive user edits to seeded rows
Re-running the seed SHALL succeed on a database where users edited, renamed or soft-deleted seeded rows, and SHALL NOT violate any unique constraint or unique index, partial unique indexes included.

- Inserts into tables with a unique constraint use `onConflictDoNothing({ target })` keyed on that
  constraint, or select-and-reuse when there is no usable key.
- An insert covered by a partial unique index (for example `setup_user_default_unique`) uses
  `onConflictDoNothing()` without a target, so the conflict is skipped without an `sql` predicate.
- Existing rows are never updated or deleted by a re-run, except the documented collection-item
  `sortOrder` repair.

#### Scenario: Renamed default setup does not break a re-run
- **WHEN** a seeded user renames their default setup and the seed runs again
- **THEN** the seed succeeds, the user keeps exactly one active default setup with the new name, and no second setup is created

#### Scenario: Case variants of seeded identities are reused
- **WHEN** the admin or a demo account already exists with an email or username that differs only in letter case and the seed runs twice
- **THEN** both runs succeed and the existing accounts are reused unchanged

