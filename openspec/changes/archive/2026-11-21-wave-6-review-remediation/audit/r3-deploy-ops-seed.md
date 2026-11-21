# r3: deploy, ops and seed (findings 2, 10, 11, 12, 13, 29, 30, 31)

| # | Verdict | Capability touched | Effort |
|---|---|---|---|
| 2 restore half-applies | bigger | production-operations, container-deployment, ci-image-publishing | L |
| 29 no safety backup | confirmed (plus a prune hazard) | production-operations, container-deployment | S |
| 10 tar exit 1 drops archive | confirmed (plus gzip-exit and health-check gaps) | production-operations, ci-image-publishing | S |
| 11 `.dockerignore` gaps | bigger (the review's fix alone does not work) | container-deployment, ci-image-publishing | S |
| 12 demo accounts in production | confirmed | NEW database-seed, container-deployment | M |
| 13 XFF spoofing behind front proxy | bigger (doc-only fix is still right) | production-operations (ADDED) | S |
| 30 secrets on command lines | bigger (3 more places) | deployment-guide (ADDED) | S |
| 31 seed re-run vs renamed default setup | confirmed (only seed path affected) | NEW database-seed | S |

Library facts checked with Context7 (cited inline as [C7-…]):
- [C7-pgr] `/websites/postgresql/18` app-pgrestore: `--single-transaction` wraps the restore in
  BEGIN/COMMIT, "either all the commands complete successfully, or no changes are applied", and
  implies `--exit-on-error`. `-O/--no-owner`: any user can connect and will own the created objects.
- [C7-dropdb] `/websites/postgresql/18` app-dropdb: `--force` terminates existing connections first
  (see DROP DATABASE ... WITH (FORCE)); `--maintenance-db` defaults to `postgres`, falling back to
  `template1`; `--if-exists` turns a missing database into a notice.
- [C7-alterdb] `/websites/postgresql/18` sql-alterdatabase: only the owner or a superuser can rename a
  database; the current database cannot be renamed (connect to another one).
- [C7-psql] `/websites/postgresql/18` app-psql: `-c` strings must be "completely parsable by the
  server (no psql-specific features)", so `:"var"` interpolation needs stdin or `-f`; `:"var"`
  quotes the value as an SQL identifier.
- [C7-tar] `/websites/gnu_software_tar_manual_html_node` Synopsis: exit 0 success; exit 1 "some files
  differ", which under `--create` "means that some files were changed while being archived"; exit 2
  fatal; and "If tar has invoked a subprocess [the compressor] and that subprocess exited with a
  nonzero exit code, tar exits with that code as well". Archive-Creation-Warnings: the
  `file-changed` warning keyword "applies only if used together with the --ignore-failed-read
  option"; Ignore-Failed-Read: that option also hides missing or unreadable files.
- [C7-compose] `/docker/compose` reconcile.go/start.go: the start phase of `up` "starts every
  non-running observed container, rerunning the completed dependency" (so `up -d` re-runs the
  exited `migrate` one-shot); `up --wait` waits for running/healthy, using
  `service_completed_successfully` for one-shots.
- [C7-dockerenv] `/docker/docs`: `docker compose run -e VAR` / `docker run -e VAR` with no value takes
  the value from the caller's environment.
- [C7-drizzle] `/drizzle-team/drizzle-orm` pg-core/dialect.ts + migrator.ts: `migrate()` reads the last
  row of `drizzle.__drizzle_migrations` (`order by created_at desc limit 1`) and applies, in one
  transaction, every journal entry whose `when` (`folderMillis`) is greater; `readMigrationFiles`
  iterates `meta/_journal.json` entries. `onConflictDoNothing()` with no target emits plain
  `on conflict do nothing` (any unique constraint or index, partial ones included); with a target it
  emits `(cols) where <sql> do nothing`.
- [C7-caddy] `/websites/caddyserver_caddyfile` options + reverse_proxy: `trusted_proxies static
  private_ranges` = `192.168.0.0/16 172.16.0.0/12 10.0.0.0/8 127.0.0.1/8 fd00::/8 ::1`; a request
  from a trusted proxy has its client IP parsed from `X-Forwarded-For`; `trusted_proxies_strict`
  parses right to left (first untrusted from the right). `reverse_proxy` by default "will ignore
  their [X-Forwarded-*] values from incoming requests, to prevent spoofing" unless the request came
  from a trusted proxy.
- [C7-nginx] `/websites/nginx_en` ngx_http_proxy_module: by default only `Host` and `Connection` are
  redefined, every other client header (including a client-sent `X-Forwarded-For`) is passed
  through; `$proxy_add_x_forwarded_for` = client XFF + `, $remote_addr`.
- [C7-traefik] `/traefik/traefik` forwarded_header.go: without `forwardedHeaders.insecure` or a
  `trustedIPs` match, Traefik deletes incoming `X-Forwarded-*`; `notAppendXForwardedFor=true` keeps
  the incoming header as-is.
- [C7-vitest] `/vitest-dev/vitest` vi.md: `vi.stubEnv(name, value)` changes `process.env`;
  `vi.unstubAllEnvs()` restores the values from before the first stub.

Empirical check (no project files touched, scratch context in the session scratchpad, Docker
29.8.2 / buildx 0.37.2): see Finding 11.

---

## Finding 2: Restoring a pre-upgrade backup half-restores the database

### 1. Verification

- `compose.production.yml:425-429` runs, inside `sh -euc`:
  `pg_restore --clean --if-exists --no-owner -d "$$PGDATABASE" "/backups/$$dump"`, straight into
  the live database. No `--single-transaction`, no `--exit-on-error`, no pre-check.
- `Makefile:288-298` (`prod-restore`): `stop api web` → `--profile restore run … restore` → on
  failure prints "Fix the error and re-run, or run 'make prod-up'" → else `up -d`. The `backup`
  service keeps running during the restore.
- Reproduced by reasoning against the real schema: migration `0016_talented_dragon_lord.sql` adds
  `user_recipe_note` with FKs `user_recipe_note_user_id_user_id_fk → "user"(id)` and
  `user_recipe_note_recipe_id_recipe_id_fk → recipe(id)`. A pre-wave-6 dump has neither the table
  nor the FKs, so `--clean` never drops them. `DROP TABLE IF EXISTS public."user"` and `… recipe`
  then fail ("other objects depend on it"); `CREATE TABLE` fails (exists); `COPY "user"` fails on the
  primary key, so `user` keeps the NEW rows while every other table gets the OLD rows; the dumped
  `drizzle` schema is dropped and recreated, so `__drizzle_migrations` ends at 0015. pg_restore
  exits 1 (errors are counted, not fatal), `sh -e` aborts, `make` prints "restore failed". If the
  operator then runs `make prod-up` on the wave-6 image, `migrate` re-applies 0016
  (`CREATE TABLE "user_recipe_note"` → already exists) and the api never starts.
  [C7-drizzle: the migrator applies every entry newer than the last recorded `created_at`.]
- Bigger than the review says:
  1. The review's fix (drop + create + restore in place) leaves an EMPTY database when pg_restore
     fails (truncated dump, disk full). The Makefile message then suggests `make prod-up`, and
     `migrate` runs `check-users-empty.ts` → `0` → the seed creates a fresh install over the lost
     data (today with five demo accounts, Finding 12). The design below restores into a scratch
     database and swaps only on success.
  2. Rollback floor: `docs/deployment_compose.md` §12 and the production-operations requirement say
     "set `IMAGE_TAG` to a previous SHA and run `make prod-up`". A pre-wave-6 image cannot run as the
     `migrate` one-shot: `git show main:docker-entrypoint.sh` ignores its arguments, migrates,
     seeds and `exec`s the server, so `migrate` never exits and the api (depends on
     `service_completed_successfully`) is never started. Concrete failing case:
     `IMAGE_TAG=<any pre-#172 sha> make prod-up` hangs with `migrate` running forever.
  3. `docs/deployment_compose.md:482-484` (§14) writes the pre-upgrade dump as `pre-wave-6.dump`,
     a name the restore service rejects (`^db-[0-9]{8}T[0-9]{6}Z\.dump$`), so the documented
     rollback dump cannot be restored without a manual rename.
- Callers / siblings: only `make prod-restore` and the docs §11 invoke the restore service.
  `scripts/ci/compose-config-check.sh:59,133,137-138,150-151` only checks profile gating, no
  passwords and `restart: "no"`. `scripts/ci/smoke-compose.sh:154-167` only runs
  `pg_restore --list` on the dump; no test performs a restore.
- Verdict: **bigger**.

### 2. Root cause

The restore applies a dump over a live database of a possibly different schema version with
per-statement error tolerance, and nothing tests a restore.

### 3. Fix design

Restore into a scratch database in one transaction, then swap it in. Replace
`compose.production.yml:425-429` with (YAML block, `$$` = literal `$`):

```sh
        if [ -n "$$dump" ]; then
          tmp="$${PGDATABASE}_restore"
          pg_restore --list "/backups/$$dump" >/dev/null
          echo "[restore] restoring $$dump into a new database ($$tmp)"
          dropdb --maintenance-db=postgres --if-exists --force "$$tmp"
          createdb --maintenance-db=postgres "$$tmp"
          if ! pg_restore --no-owner --single-transaction --exit-on-error -d "$$tmp" "/backups/$$dump"; then
            dropdb --maintenance-db=postgres --if-exists --force "$$tmp" || true
            echo "[restore] ERROR: pg_restore failed; the database $$PGDATABASE was not changed" >&2
            exit 1
          fi
          echo "[restore] replacing $$PGDATABASE with the restored database"
          dropdb --maintenance-db=postgres --if-exists --force "$$PGDATABASE"
          printf '%s\n' 'ALTER DATABASE :"src" RENAME TO :"dst";' |
            psql -X -q -v ON_ERROR_STOP=1 -d postgres -v src="$$tmp" -v dst="$$PGDATABASE"
          echo "[restore] database restored; migrate applies newer migrations on the next start"
        fi
```

Facts behind each line:
- `pg_restore --list` reads the archive TOC first, so an unreadable file fails before anything is
  dropped.
- `--single-transaction` gives all-or-nothing and implies `--exit-on-error` [C7-pgr]; `--exit-on-error`
  is kept explicit for readers. A BrewForm dump has a few hundred objects, far below the lock-table
  limit that `--transaction-size` exists for [C7-pgr].
- `--no-owner`: objects are owned by the connecting `POSTGRES_USER` [C7-pgr]. The official postgres
  image creates `POSTGRES_USER` as the bootstrap superuser, which has every privilege needed:
  CREATEDB, owner-or-superuser for DROP/RENAME [C7-alterdb], and terminating other backends for
  `--force` [C7-dropdb]. `compose.production.yml` only supports its bundled postgres
  (`DATABASE_URL` is hard-wired to `postgres:5432`), so no non-superuser case exists.
- `--maintenance-db=postgres` is explicit because the container sets `PGDATABASE` to the live
  database, which cannot be dropped or renamed while connected [C7-dropdb, C7-alterdb]. `postgres`
  exists in every cluster created by the image's initdb.
- `dropdb --force` closes leftover connections (a manual psql session, a backup run started by
  hand) [C7-dropdb]. PostgreSQL 13+ only; the image is 18.
- `pg_trgm`: dumps taken after 0018 contain `CREATE EXTENSION IF NOT EXISTS pg_trgm`; restoring it
  needs CREATE on the database (pg_trgm is trusted) and the superuser has it. Dumps taken before 0018
  have no extension; `migrate` creates it (0018) with its existing pre-flight.
- `drizzle` schema: `pg_dump` dumps every non-system schema, so `drizzle.__drizzle_migrations` comes
  back exactly as it was in the dump. On the next `up -d`, Compose re-runs the exited `migrate`
  one-shot [C7-compose] and drizzle applies every journal entry newer than the restored last
  `created_at` [C7-drizzle]: a restored older dump is upgraded exactly like a normal upgrade. A dump
  from a NEWER release than the image applies nothing (expand/contract applies).
- Database-level settings (`ALTER DATABASE … SET`) are not in a dump without `--create`; BrewForm
  sets none (statement timeout is per connection, `packages/db/src/pool-options.ts`). Encoding and
  locale come from `template1`, the same source the image used for `POSTGRES_DB`.
- psql variables go through stdin, because `-c` does no `:"var"` interpolation [C7-psql]; `:"…"`
  quotes the names as identifiers.
- Window: between `dropdb … $PGDATABASE` and the rename, only the scratch database exists. A crash
  exactly there leaves `brewform_restore` intact; re-running the restore would drop it first, so the
  runbook says: rename it (`ALTER DATABASE brewform_restore RENAME TO brewform`) or restore the
  safety dump (Finding 29). Acceptable for a step that takes milliseconds.

Makefile (`prod-restore`, also covers Finding 29):

```make
# Stops api, web and backup, takes a safety backup, restores with the profile-gated `restore`
# service and starts the stack (migrate then applies migrations newer than the dump).
prod-restore: prod-env-check ## Back up, then restore (DUMP=db-<ts>.dump UPLOADS=uploads-<ts>.tar.gz)
	@if [ -z "$(DUMP)$(UPLOADS)" ]; then … unchanged usage … fi
	$(PROD_COMPOSE) stop api web backup
	$(PROD_COMPOSE) up -d --wait postgres
	$(PROD_COMPOSE) run --rm --no-deps -e BACKUP_ONESHOT=1 backup || { \
	  echo "safety backup failed: nothing was restored; api, web and backup are stopped. Fix the error, or run 'make prod-up' to resume." >&2; \
	  exit 1; \
	}
	$(PROD_COMPOSE) --profile restore run --rm -e 'RESTORE_DB_DUMP=$(DUMP)' -e 'RESTORE_UPLOADS_ARCHIVE=$(UPLOADS)' restore || { \
	  echo "restore failed: api, web and backup are still stopped. A failed database restore leaves the live database unchanged; the newest db-*.dump from before this run is the safety copy. Fix the error and re-run, or run 'make prod-up'." >&2; \
	  exit 1; \
	}
	$(PROD_COMPOSE) up -d
```

- `backup` is stopped too: a scheduled run during the swap would be killed by `--force`, and the
  final `up -d` restarts it, which writes a fresh start-up dump of the restored database.
- `up -d --wait postgres` makes the target work after `make prod-down` (it waits for healthy
  [C7-compose]); the safety backup runs `--no-deps` so it never starts `migrate` (which could
  migrate a database the operator wants to keep as it is).
- Rollback floor and pre-wave-6 dump name: docs only (section 6 below).

Alternatives rejected:
- Review's in-place `dropdb` + `createdb` + restore: a failed restore leaves an empty database that
  the next `make prod-up` seeds as a fresh install (see Verification).
- `pg_restore --create --clean -d postgres`: DROP/CREATE DATABASE cannot run inside
  `--single-transaction`, and the live database is still dropped before the restore is known good.
- `createdb -T <scratch> <live>` instead of RENAME: avoids psql but copies the whole database twice.
- Moving the restore logic into a repo script: the compose file is self-contained today; keep it
  inline.

Edge cases the implementation must keep: names still validated before anything runs; dump-only,
archive-only and both; host-folder and named-volume sources (no change: only the dump path changed);
a leftover `<db>_restore` from a killed run is dropped at start.

### 4. Tests

CI round-trip in `scripts/ci/smoke-compose.sh` (the only place a restore can run). It drives the
real `make prod-restore` target: `COMPOSE_PROJECT_NAME="$PROJECT" make -s PROD_ENV_FILE="$ENV_FILE"
prod-restore DUMP=… UPLOADS=…` (a command-line make variable overrides the `:=` assignment before
`PROD_COMPOSE` is expanded; Compose gives `COMPOSE_PROJECT_NAME` precedence over the file's `name:`;
GNU make is preinstalled on GitHub runners and present wherever `make prod-smoke` runs). Add a
helper `sql()` that pipes stdin to
`dc exec -T postgres sh -c 'exec psql -X -q -tA -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${DB:-$POSTGRES_DB}"'`.

New step 5 "restore onto a newer schema" (after the existing one-shot backup of step 4; the old
step 5 "graceful api stop" becomes step 7):
1. Record `D` (newest `db-*.dump`) and `A` (newest `uploads-*.tar.gz`) from step 4 and the user
   count `U0`.
2. Simulate a newer schema plus post-backup data:
   `CREATE TABLE ci_newer (user_id varchar(36) REFERENCES "user"(id), recipe_id varchar(36) REFERENCES recipe(id));`
   (the exact shape of `user_recipe_note` that broke the old restore) and
   `INSERT INTO "user"(id, email, username, password_hash) VALUES (gen_random_uuid()::text, 'ci-after-backup@example.invalid', 'ci-after-backup', 'x');`.
   Delete the probe: `dc exec -T -u node api rm /app/uploads/ci-probe.png`.
3. Run `make prod-restore DUMP=$D UPLOADS=$A` as above; it must exit 0.
4. `wait_stack "postgres valkey api web backup" migrate`.
5. Assert: `select to_regclass('public.ci_newer') is null` → `t`; user count = `U0`;
   `select count(*) from drizzle.__drizzle_migrations` = `jq '.entries | length'
   packages/db/drizzle/meta/_journal.json`; `GET /uploads/ci-probe.png` through the edge is 200;
   some `db-*.dump` in `/backups` lists ` TABLE public ci_newer ` in `pg_restore --list` (only the
   safety backup can contain it, so this proves Finding 29's backup ran before the restore).

New step 6 "restore an older dump, then migrate applies the newer migration" (cross-version with
one image):
1. `jq '.entries |= .[:-1]' packages/db/drizzle/meta/_journal.json > "$TMP/journal-old.json"`;
   `expected=$(jq '.entries | length' packages/db/drizzle/meta/_journal.json)`.
2. `echo 'CREATE DATABASE ci_old;' | sql`.
3. Migrate it to the previous release's schema with the real image and a trimmed journal:
   `dc run --rm --no-deps -v "$TMP/journal-old.json:/app/packages/db/drizzle/meta/_journal.json:ro" --entrypoint sh migrate -c 'DATABASE_URL="${DATABASE_URL%/*}/ci_old" exec node /app/packages/db/src/migrate.ts'`
   (the URL is derived inside the container, so no password reaches a command line;
   [C7-drizzle] the migrator only reads the journal entries). Assert
   `DB=ci_old sql <<< 'select count(*) from drizzle.__drizzle_migrations'` = `expected - 1`.
4. Dump it under a valid name with the backup image:
   `old=$(dc run --rm --no-deps -e PGDATABASE=ci_old -e BACKUP_ONESHOT=1 -e BACKUP_UPLOADS=false backup | sed -n 's/^\[backup\] database dump written: //p')`; assert non-empty.
5. `make prod-restore DUMP=$old` (no archive) → exit 0; `wait_stack … migrate`.
6. Assert migrations count = `expected` (the newest migration was applied on top of the restored
   older schema) and user count = `1` (the restored database was empty, so `migrate` seeded it in
   production mode: admin only, Finding 12).

Failing first: against today's restore service, step 5 fails at 3 (`pg_restore --clean` errors on
the `ci_newer` FKs, the target exits 1).

### 5. Spec impact

MODIFIED in `openspec/specs/production-operations/spec.md` (full block, edits applied):

```markdown
### Requirement: Restore, upgrade and rollback runbook
`compose.production.yml` SHALL define a one-shot `restore` service under the Compose profile `restore` that replaces the database only after the whole dump restored successfully, and the self-hosting deployment guide SHALL document as copy-pasteable commands how to restore with it, how to bring backups from another host into the backups target, how to copy backups off the host, how to upgrade, and how to roll back by pinning an image tag; the restore procedure SHALL be verified by a restore drill before release and by the CI compose smoke test.

- The `restore` service uses the same `postgres` image, runs as root, mounts
  `${UPLOADS_SOURCE:-uploads}` read-write at `/app/uploads` and `${BACKUPS_SOURCE:-backups}`
  read-only at `/backups`, and reads the file names from `RESTORE_DB_DUMP` and
  `RESTORE_UPLOADS_ARCHIVE`. It SHALL accept only names matching
  `^db-[0-9]{8}T[0-9]{6}Z\.dump$` and `^uploads-[0-9]{8}T[0-9]{6}Z\.tar\.gz$`. For a dump it SHALL
  check the archive with `pg_restore --list`, restore it into a new database `<POSTGRES_DB>_restore`
  (dropping a leftover one first) with `pg_restore --no-owner --single-transaction --exit-on-error`,
  and only after that succeeded drop the live database with `dropdb --force` and rename the restored
  database into its place, so a failed restore leaves the live database unchanged. For an archive it
  SHALL extract it into `/app/uploads` and finish with `chown -R 1000:1000 /app/uploads`. Because it
  is in a profile, `make prod-up` never starts it.
- `make prod-restore DUMP=<file> UPLOADS=<file>` SHALL stop `api`, `web` and `backup`, make sure
  `postgres` is healthy, take a safety backup (`BACKUP_ONESHOT=1`, without starting `migrate`),
  stop with a non-zero exit before restoring anything when that backup fails, run the restore
  service with those names (either may be omitted), and start the stack again, which re-runs
  `migrate` so migrations newer than the dump are applied. The same commands work for named volumes
  and host folders.
- Importing backups from another host: `docker compose cp <file> backup:/backups/`.
- Off-host copies: backups on the same disk do not survive a disk failure; the guide SHALL show
  `make prod-backup-export` followed by at least one way to copy the result elsewhere (for example
  `rsync` or `rclone`), and for a host-folder target the direct `rsync` of that folder.
- Upgrade: `make prod-pull` then `make prod-up`; the `migrate` service applies new migrations.
- Rollback: set `IMAGE_TAG` to a previous `<full-sha>` or `vX.Y.Z` and run `make prod-up`; the guide
  SHALL state that database migrations are not rolled back automatically, so rolling back across
  a schema change requires restoring the pre-upgrade dump, and that this compose file runs only
  images that support the `migrate` entrypoint mode (wave 6 and later); an older release needs its
  own `compose.production.yml` from git.

#### Scenario: Restore drill recovers data
- **WHEN** a dump and an uploads archive from one stack are copied into a fresh stack with `docker compose cp` and `make prod-restore DUMP=<dump> UPLOADS=<archive>` runs
- **THEN** the recipe and user counts match the source and previously uploaded photos load

#### Scenario: Restore works with host folders
- **WHEN** `UPLOADS_SOURCE=./data/uploads` and `BACKUPS_SOURCE=./backups` are set and `make prod-restore` runs with a dump and an archive from `./backups`
- **THEN** the photos are extracted into `./data/uploads` owned by `1000:1000` and the api starts healthy

#### Scenario: Restore onto a newer schema replaces the whole database
- **WHEN** the live database has a table that the dump does not contain, with foreign keys to `user` and `recipe`, and `make prod-restore DUMP=<dump>` runs
- **THEN** the target exits `0`, that table no longer exists, every table holds the dump's rows, and `drizzle.__drizzle_migrations` matches the dump before `migrate` runs

#### Scenario: Older dump is upgraded by migrate
- **WHEN** a dump taken before the newest migration is restored with `make prod-restore`
- **THEN** `migrate` exits `0` after applying the missing migrations and the api becomes healthy

#### Scenario: Failed restore leaves the live database unchanged
- **WHEN** `pg_restore` fails part-way through a dump
- **THEN** the restore service exits non-zero, the live database still holds its previous data, no `<POSTGRES_DB>_restore` database is left behind, and api, web and backup stay stopped

#### Scenario: Safety backup precedes every restore
- **WHEN** `make prod-restore` runs
- **THEN** a new `db-*.dump` of the database as it was before the restore exists in the backups target
- **AND** when that backup fails, the target exits non-zero and the restore service never runs

#### Scenario: Unsafe restore names are rejected
- **WHEN** `make prod-restore DUMP=../../etc/passwd` runs
- **THEN** the restore service exits non-zero with a message naming the expected file pattern and changes nothing

#### Scenario: Restore is never started by a normal deploy
- **WHEN** `make prod-up` runs
- **THEN** no `restore` container is created

#### Scenario: Rollback by tag
- **WHEN** an operator sets `IMAGE_TAG=<previous full sha>` in `.env.production` and runs `make prod-up`
- **THEN** both the api and web containers run the images with that tag
```

MODIFIED in `openspec/specs/container-deployment/spec.md`: see Finding 29 (the `prod-restore` and
`prod-backup` bullets live in "Makefile targets for image build and prod profile").

MODIFIED in `openspec/specs/ci-image-publishing/spec.md`: see "Combined CI spec block" at the end of
this file (one block carries Findings 2, 10, 11 and 12).

### 6. Docs / ledger impact

- `docs/deployment_compose.md`:
  - §6 row `make prod-restore`: "stops api, web and backup, takes a safety backup, runs the
    `restore` service, starts the stack".
  - §11 step 3: replace the bullet list with the new sequence (safety backup = the newest
    `db-*.dump`/`uploads-*.tar.gz` pair before the restore; restore into `<POSTGRES_DB>_restore`;
    swap only on success; `migrate` then applies newer migrations). Add: "A dump from before wave 6
    goes through the wave-6 identifier check when `migrate` runs: if `migrate` exits non-zero, run
    `make prod-check-identifiers` (§14), fix, then `make prod-up`." Add the crash-window note
    (rename `<db>_restore` or restore the safety dump). Replace "If the restore fails, api and web
    stay stopped" with the new message.
  - §12 Rollback: add the floor sentence (only images with the `migrate` mode, wave 6 and later;
    older: `git checkout <tag> -- compose.production.yml` and that release's instructions).
  - §14 step 1: write the dump as
    `> "db-$(date -u +%Y%m%dT%H%M%SZ).dump"` and say it can be imported with `docker compose cp`
    and restored with `make prod-restore` (with the old compose file checked out, Finding 2.2).
  - §16 Troubleshooting: row "`[restore] ERROR: pg_restore failed`" → "the live database was not
    changed; check the dump (`pg_restore --list`) and disk space".
- `compose.production.yml` comments: header line 23 unchanged; restore service comment (377-380):
  "restores the dump into `<db>_restore` in one transaction and swaps it in only on success".
- `README.md:284` lists the targets only; no change.
- No D99 entry exists for this.

### 7. Draft tasks

- [ ] R3.12 In `scripts/ci/smoke-compose.sh` add the `sql()` helper and the new steps 5 ("restore onto a newer schema") and 6 ("restore an older dump, then migrate applies the newer migration") exactly as in Finding 2 §4 of `audit/r3-deploy-ops-seed.md`, renumber "graceful api stop" to step 7, and update the header's check list. Run `make prod-smoke` and confirm step 5 fails against the current restore service (`pg_restore` errors on the `ci_newer` foreign keys).
- [ ] R3.13 Replace the dump branch of the `restore` service in `compose.production.yml` (lines 425-429) with the scratch-database restore and swap from Finding 2 §3 (`pg_restore --list` pre-check, `dropdb/createdb --maintenance-db=postgres`, `pg_restore --no-owner --single-transaction --exit-on-error`, `dropdb --force` of the live database, rename through psql stdin with `:"src"`/`:"dst"`), and update the service comment.
- [ ] R3.14 Rewrite `prod-restore` in `Makefile` per Finding 2 §3 (stop `api web backup`, `up -d --wait postgres`, safety backup, restore, `up -d`, both failure messages) and its comment.
- [ ] R3.15 Update `docs/deployment_compose.md` §6, §11, §12, §14 step 1 and §16 per Finding 2 §6, and the restore/backup comments in `compose.production.yml`. Re-run `make prod-smoke`; steps 5 and 6 must pass.

### 8. Risks / migration notes

- No data migration. Existing self-hosters get the new behaviour after `git pull` (the restore runs
  from the compose file, not the image).
- Disk: a restore temporarily needs room for a second copy of the database.
- Rolling back this change restores the old, unsafe behaviour; nothing persistent depends on it.

---

## Finding 29: `make prod-restore` replaces live data with no safety backup

### 1. Verification

- `Makefile:288-298`: no backup before `restore`. `BACKUP_ONESHOT` support exists:
  `compose.production.yml:308-309` (`BACKUP_ONESHOT: "0"`, set per run) and `353-356`
  (`run_backup; exit 0` when `1`/`true`); `Makefile:280-281` already uses
  `run --rm --no-deps -e BACKUP_ONESHOT=1 backup`.
- In one-shot mode `set -eu` applies to the bare `run_backup` call, so a failed `pg_dump`
  (`return 1`) makes the container exit 1: a safety backup failure is detectable.
- New hazard found: `run_backup` ends with pruning (`compose.production.yml:347-350`:
  `find … -mtime +$BACKUP_RETENTION_DAYS -delete`). A safety backup inside `prod-restore` would run
  that prune right before the restore, and `docker compose cp` keeps a file's modification time, so
  restoring an imported dump older than `BACKUP_RETENTION_DAYS` (14 days by default) would delete the
  very dump the operator is about to restore. `make prod-backup` before a manual restore has the same
  hazard today.
- Verdict: **confirmed**, plus the prune hazard.

### 2. Root cause

The restore target was written without a pre-restore backup, and pruning is coupled to every backup
run, including manual one-shots.

### 3. Fix design

- Safety backup in `prod-restore`: see Finding 2 §3 (order: stop writers → postgres healthy →
  one-shot backup → restore → `up -d`).
- Move pruning out of `run_backup` into a `prune()` function that only the scheduled loop calls:

```sh
        prune() {
          find /backups -maxdepth 1 \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) \
            -mtime +"$$BACKUP_RETENTION_DAYS" -print -delete | sed 's|^/backups/|[backup] pruned: |'
          # Leftovers of killed runs (a running dump's .partial is never a day old).
          find /backups -maxdepth 1 -name '.*.partial' -mmin +1440 -delete
        }

        # A one-shot run (make prod-backup, the prod-restore safety backup) never prunes.
        if [ "$$BACKUP_ONESHOT" = "1" ] || [ "$$BACKUP_ONESHOT" = "true" ]; then
          run_backup
          exit 0
        fi
        …
        while :; do
          if run_backup; then prune; else echo "[backup] run failed; retrying in $$BACKUP_INTERVAL_SECONDS s" >&2; fi
          …
```
  Pruning still happens only after a successful run (today's behaviour).
- No `SKIP_SAFETY_BACKUP` switch: when the backup cannot be written (disk full, broken database),
  the runbook documents running the restore service directly
  (`docker compose … --profile restore run --rm -e RESTORE_DB_DUMP=… restore` after stopping api,
  web and backup).

### 4. Tests

- Covered by Finding 2 step 5.5 (some dump lists `ci_newer`, which only the safety backup can hold).
- Prune split: the existing smoke start-up and one-shot backups keep working; no extra test (the
  retention path needs 14-day-old files; the spec scenario wording changes to "scheduled run").

### 5. Spec impact

MODIFIED in `openspec/specs/production-operations/spec.md` (full block, edits applied):

```markdown
### Requirement: Automated database backups
`compose.production.yml` SHALL include a `backup` service, enabled by default, that writes a compressed `pg_dump` of the application database to `/backups`, mounted from `${BACKUPS_SOURCE:-backups}` (the named `backups` volume by default, or a host folder), at start-up and then on a configurable interval, and whose scheduled runs delete dumps older than a configurable retention period.

- Settings: `BACKUPS_SOURCE` (default: the named volume `backups`; a path such as `./backups`
  selects a host folder, following the data-source rule above), `BACKUP_INTERVAL_SECONDS` (default
  `86400`) and `BACKUP_RETENTION_DAYS` (default `14`).
- The service SHALL use the same `postgres` image as the database so `pg_dump` matches the server
  version, and SHALL write each dump to a temporary name and rename it only after `pg_dump`
  succeeds, so an interrupted run never leaves a file named like a complete dump.
- Dumps SHALL be named `db-<UTC timestamp>.dump` (for example `db-20261118T000000Z.dump`) in
  `pg_dump` custom format, and SHALL be created under `umask 077` (mode `0600`), because they hold
  every user's data.
- A failed run SHALL be logged and retried at the next interval, and the service health check SHALL
  turn unhealthy when no dump newer than twice the interval exists.
- Only scheduled runs prune, and only after a successful run. A one-shot run SHALL NOT prune, so a
  manual or safety backup never deletes an imported dump that is about to be restored.
- `make prod-backup` SHALL trigger one immediate backup (`BACKUP_ONESHOT=1` through
  `docker compose run --rm backup`) and exit non-zero when it fails.
- `make prod-backup-export DEST=<dir>` SHALL copy the whole backups target to a host directory with
  `docker compose cp backup:/backups/. <dir>`, so off-host copies work the same way for a named
  volume and a host folder.

#### Scenario: Backup is written on start-up
- **WHEN** the stack starts with default backup settings
- **THEN** `docker compose exec backup ls /backups` lists a `db-<timestamp>.dump` shortly after the database is healthy
- **AND** `pg_restore --list` succeeds on that file

#### Scenario: A host folder receives the backups
- **WHEN** `BACKUPS_SOURCE=./backups` is set and a backup run completes
- **THEN** the dump appears in `./backups` on the host with mode `0600`

#### Scenario: Backups can be exported off the volume
- **WHEN** `make prod-backup-export DEST=./backup-export` runs with the default named volume
- **THEN** `./backup-export` contains every `db-*.dump` and `uploads-*.tar.gz` currently in the volume

#### Scenario: Retention prunes old dumps
- **WHEN** the backups target contains dumps older than `BACKUP_RETENTION_DAYS`
- **THEN** the next successful scheduled backup run deletes them and keeps newer dumps

#### Scenario: One-shot backups never prune
- **WHEN** an imported dump older than `BACKUP_RETENTION_DAYS` is in the backups target and `make prod-backup` (or the safety backup of `make prod-restore`) runs
- **THEN** that dump still exists afterwards

#### Scenario: Interrupted dump leaves no complete-looking file
- **WHEN** the backup container is killed while `pg_dump` is running
- **THEN** no new `db-*.dump` file exists for that run

#### Scenario: Stale backups are visible
- **WHEN** backups have failed for longer than twice `BACKUP_INTERVAL_SECONDS`
- **THEN** `docker compose ps` reports the backup service as `unhealthy`
```

MODIFIED in `openspec/specs/container-deployment/spec.md` (full block, edits applied):

```markdown
### Requirement: Makefile targets for image build and prod profile
The `Makefile` SHALL provide an `images` target that builds both images locally under non-registry tags and `prod-*` targets that wrap `compose.production.yml` with `--env-file .env.production`, and it SHALL NOT provide any target that pushes images to the public registry.

Targets (each with a `##` help comment and listed in `.PHONY`):
- `images`: builds `brewform-api:local` from `Dockerfile` and `brewform-web:local` from
  `Dockerfile.web`, passing `VITE_API_URL` (default `/api/v1`) and `VITE_PUBLIC_APP_URL` (default
  `http://localhost:8080`) as build args. It MUST NOT tag `ghcr.io/...:latest`.
- `prod-up`, `prod-down`, `prod-logs`, `prod-ps`, `prod-pull`: run
  `docker compose --env-file .env.production -f compose.production.yml <up -d|down|logs -f|ps|pull>`.
- `prod-backup`: runs one immediate database (and uploads) backup through the Compose `backup`
  service, without pruning old backups.
- `prod-backup-export`: copies the backups target to `DEST` (default `./backup-export`) with
  `docker compose cp backup:/backups/. $(DEST)`.
- `prod-restore`: stops `api`, `web` and `backup`, runs `up -d --wait postgres`, takes a safety
  backup with `run --rm --no-deps -e BACKUP_ONESHOT=1 backup` (and stops with a non-zero exit when it
  fails), runs the profile-gated `restore` service with `RESTORE_DB_DUMP=$(DUMP)` and
  `RESTORE_UPLOADS_ARCHIVE=$(UPLOADS)`, then runs `up -d`.
- `prod-fix-uploads-owner`: runs
  `docker compose run --rm --no-deps --user 0:0 --entrypoint chown api -R 1000:1000 /app/uploads`,
  which hands the selected uploads source (named volume or host folder) to the API's `node` user.
- `prod-smoke`: runs `images` and then `scripts/ci/smoke-compose.sh` against
  `compose.production.yml` with the local images (`IMAGE_TAG=local` and the local image names), the
  same compose smoke test CI runs, for a pre-release check.

Every `prod-*` target MUST fail with a clear message when `.env.production` does not exist (Compose
would otherwise fall back to the development `.env`). The env file path is the `PROD_ENV_FILE`
make variable (default `.env.production`), which the CI compose smoke test overrides on the command
line. The previous `images-push`, `release` and `prod-up-build` targets SHALL be removed.

#### Scenario: make images builds local tags only
- **WHEN** `make images` is run
- **THEN** `brewform-api:local` and `brewform-web:local` exist in `docker images`
- **AND** no `ghcr.io/ardakilic/brewform-*:latest` tag is created or changed

#### Scenario: make prod-up uses the production compose file
- **WHEN** `make prod-up` is run with `.env.production` present
- **THEN** `docker compose --env-file .env.production -f compose.production.yml up -d` executes

#### Scenario: Uploads ownership is fixed for any source
- **WHEN** `make prod-fix-uploads-owner` runs with `UPLOADS_SOURCE` unset, and again with `UPLOADS_SOURCE=./data/uploads`
- **THEN** after each run `/app/uploads` and every file in it are owned by `1000:1000` inside the api container

#### Scenario: Restore takes a safety backup first
- **WHEN** `make prod-restore DUMP=<dump>` runs against a running stack
- **THEN** a one-shot backup of the current database completes before the `restore` service starts
- **AND** when that backup fails, the target exits non-zero without running the `restore` service

#### Scenario: Missing production env file is refused
- **WHEN** any `prod-*` target is run without `.env.production`
- **THEN** the target exits non-zero with a message telling the operator to copy `.env.production.example`
- **AND** no `docker compose` command runs

#### Scenario: No local publish path exists
- **WHEN** `make release` or `make images-push` is run
- **THEN** make reports that there is no such target
```

### 6. Docs / ledger impact

- `docs/deployment_compose.md` §6 `make prod-backup` row: "(does not prune)"; §10: "Only the
  scheduled runs prune; a one-shot run never does"; §11: the safety backup and the manual restore
  command for when it cannot be written.
- `Makefile:278-281` comment: add "never prunes".
- `compose.production.yml:287-291` comment: same.

### 7. Draft tasks

- [ ] R3.16 In the `backup` service of `compose.production.yml`, move the two `find` prune commands out of `run_backup` into a `prune()` function called only by the scheduled loop after a successful run (`if run_backup; then prune; else …`), keep one-shot runs prune-free, and update the service and `prod-backup` comments (`Makefile:278-281`). Covered by task R3.14 (the safety backup) and the R3.12 smoke steps.

### 8. Risks / migration notes

- A one-shot backup no longer prunes; the scheduled service prunes at its next run (at most
  `BACKUP_INTERVAL_SECONDS` later). Disk usage can grow by one extra pair per manual backup until
  then.

---

## Finding 10: A photo upload during the nightly backup throws away that night's photo backup

### 1. Verification

- `compose.production.yml:336-341`: `if ! tar -czf "/backups/.uploads-$$stamp.partial" -C /uploads .;
  then rm -f …; echo ERROR; return 1; fi`. Any non-zero tar status deletes the partial archive
  and fails the run.
- The backup image is `postgres:18-trixie` (Debian trixie, built on `debian:trixie-slim`), whose
  essential `tar` package is GNU tar. Exit 1 under `--create` means "some files were changed while
  being archived" [C7-tar]. Debian's essential `gzip` is used for `-z`. (The implementer confirms
  with `docker run --rm --entrypoint tar postgres:18-trixie --version`.)
- Health check `compose.production.yml:364-365` only looks for a recent `db-*.dump`, so a missing
  uploads archive never turns the service unhealthy.
- Bigger than the review says: [C7-tar] "If tar has invoked a subprocess and that subprocess exited
  with a nonzero exit code, tar exits with that code as well", and gzip exits 1 on an error (for
  example a full disk). So the review's `tar … || [ $$? -eq 1 ]` would also accept a truncated
  archive written by a failing gzip and rename it as complete.
- No test covers a changing uploads directory: `scripts/ci/smoke-compose.sh:154-167` archives a
  static folder.
- Verdict: **confirmed**, with the gzip ambiguity and the health-check gap.

### 2. Root cause

Treating "file changed while reading" (expected on a live uploads folder) like a fatal error, and
no freshness check on the archives.

### 3. Fix design

Replace `compose.production.yml:337-341`:

```sh
            partial="/backups/.uploads-$$stamp.partial"
            rc=0
            tar -czf "$$partial" -C /uploads . || rc=$$?
            # GNU tar exits 1 when a file changed while it was read (an upload during the run).
            # gzip can also exit 1, so keep the archive only when gzip -t finds it intact.
            if [ "$$rc" -eq 1 ] && gzip -t "$$partial"; then
              echo "[backup] WARNING: uploads changed while archiving (tar exit 1); archive kept, a file written during the run may be incomplete" >&2
            elif [ "$$rc" -ne 0 ]; then
              rm -f "$$partial"
              echo "[backup] ERROR: uploads archive failed (tar exit $$rc)" >&2
              return 1
            fi
            mv "$$partial" "/backups/uploads-$$stamp.tar.gz"
```

- `cmd || rc=$?` is safe under `set -e`. Exit 2 (fatal) and any compressor failure that leaves a
  truncated stream still delete the partial and fail the run.
- Upload keys are write-once UUID names, so the only file that can be incomplete is one written
  during the run; the next run archives it.

Health check (`compose.production.yml:365`): also require a fresh uploads archive when archives
are expected:

```yaml
      test: ["CMD-SHELL", "m=$$(( $$BACKUP_INTERVAL_SECONDS / 30 )); find /backups -maxdepth 1 -name 'db-*.dump' -mmin -$$m | grep -q . && { [ \"$$STORAGE_DRIVER\" != local ] || [ \"$$BACKUP_UPLOADS\" = false ] || find /backups -maxdepth 1 -name 'uploads-*.tar.gz' -mmin -$$m | grep -q .; }"]
```

Alternatives rejected:
- `--warning=no-file-changed`: only effective together with `--ignore-failed-read` [C7-tar], and
  the message is useful in the log.
- `--ignore-failed-read`: also turns missing or unreadable files into warnings with exit 0 [C7-tar].
- `tar -tzf` verification: reads and parses the whole archive; `gzip -t` already detects truncation.

### 4. Tests

In `scripts/ci/smoke-compose.sh` step 4, before the one-shot backup:
1. `dc exec -T -u node api node -e "require('node:fs').writeFileSync('/app/uploads/ci-churn.bin', Buffer.alloc(64*1024*1024))"`.
2. Start a self-stopping writer:
   `dc exec -d -u node api node -e "const fs=require('node:fs');const t=setInterval(()=>fs.appendFileSync('/app/uploads/ci-churn.bin','x'),5);setTimeout(()=>clearInterval(t),60000)"`.
3. `out=$(dc run --rm --no-deps -e BACKUP_ONESHOT=1 backup 2>&1)` must exit 0 and `out` must contain
   `uploads changed while archiving`; the existing assertions (dump readable, archive lists
   `ci-probe.png`) stay. Reading 64 MiB takes well over the 5 ms append interval, so GNU tar sees a
   changed ctime; if this ever proves flaky, keep the exit-0 assertion and drop the log assertion.

Failing first: today the one-shot exits 1 (`set -e` on `return 1`).

### 5. Spec impact

MODIFIED in `openspec/specs/production-operations/spec.md` (full block, edits applied):

```markdown
### Requirement: Uploads are backed up with the database when stored locally
When `STORAGE_DRIVER` is `local`, the `backup` service SHALL also archive the uploads source (the same `${UPLOADS_SOURCE:-uploads}` the api writes, mounted read-only at `/uploads`) to `uploads-<UTC timestamp>.tar.gz` in `/backups` on every run, apply the same temporary-name, `umask 077` and retention rules to those archives, and skip the archive when `BACKUP_UPLOADS=false`.

- GNU tar exit status `1` (files changed while they were archived) SHALL keep the archive when
  `gzip -t` confirms it is intact, and SHALL log a warning. Any other non-zero status, or a failed
  `gzip -t`, SHALL delete the temporary file and fail the run.
- The health check SHALL also turn unhealthy when archives are expected (`STORAGE_DRIVER=local` and
  `BACKUP_UPLOADS` not `false`) and no `uploads-*.tar.gz` newer than twice the interval exists.

The deployment guide SHALL recommend `STORAGE_DRIVER=s3` for production and, in that case, setting
`BACKUP_UPLOADS=false`, because object storage provides its own durability.

#### Scenario: Uploads archive accompanies the dump
- **WHEN** a backup run completes with `STORAGE_DRIVER=local` and default settings
- **THEN** `/backups` contains an `uploads-<timestamp>.tar.gz` whose listing includes the files in the uploads source

#### Scenario: Archive follows a host-folder uploads source
- **WHEN** `UPLOADS_SOURCE=./data/uploads` is set and a backup run completes
- **THEN** the uploads archive lists the files in `./data/uploads`

#### Scenario: Uploads archive can be disabled
- **WHEN** `BACKUP_UPLOADS=false`
- **THEN** backup runs write only database dumps

#### Scenario: A file changing during the run keeps the archive
- **WHEN** a file in the uploads source grows while the backup archives it and tar exits `1`
- **THEN** the run succeeds, `uploads-<timestamp>.tar.gz` exists and the log contains a warning that the uploads changed while archiving

#### Scenario: Missing uploads archives are visible
- **WHEN** `STORAGE_DRIVER=local`, `BACKUP_UPLOADS` is not `false`, and no uploads archive newer than twice `BACKUP_INTERVAL_SECONDS` exists
- **THEN** `docker compose ps` reports the backup service as `unhealthy`
```

ci-image-publishing: see the combined CI block at the end.

### 6. Docs / ledger impact

- `docs/deployment_compose.md` §8 backup row: "a `db-*.dump` (and, with local uploads, an
  `uploads-*.tar.gz`) younger than twice …"; §10: one sentence on the tar-exit-1 warning.
- `compose.production.yml:79-80` header ("backup: a dump younger than twice …"): add "and an
  uploads archive with local storage".

### 7. Draft tasks

- [ ] R3.10 In `scripts/ci/smoke-compose.sh` step 4, add the 64 MiB `ci-churn.bin` file, the self-stopping 5 ms appender (`dc exec -d -u node api node -e …`) and the assertions from Finding 10 §4 (one-shot backup exits 0 and logs `uploads changed while archiving`). Run `make prod-smoke` and confirm it fails today with `[backup] ERROR: uploads archive failed`.
- [ ] R3.11 In the `backup` service of `compose.production.yml`, replace the uploads `tar` block with the `rc`/`gzip -t` handling from Finding 10 §3 and the health-check `test` with the uploads-aware version; update the §8/§10 text of `docs/deployment_compose.md` and the compose header line 79-80. Run `scripts/ci/compose-config-check.sh` and `make prod-smoke`.

### 8. Risks / migration notes

- After upgrading, a stack with local uploads and `BACKUP_UPLOADS` on turns `unhealthy` if archives
  have been failing silently; that is the intended signal (§16 row: "backup unhealthy → `make
  prod-logs` shows the failing archive step").

---

## Finding 11: `make images` fails or copies the live database into the image build

### 1. Verification

- `.dockerignore:25-28` excludes `uploads`, `**/uploads` and `backups` only. `.gitignore:48-56`
  additionally ignores `backup-export/`, `/data/`, `uploads-rescue/`.
- Paths the guides tell operators to create inside the checkout: `./data/uploads`,
  `./data/postgres`, `./backups` (`docs/deployment_compose.md:266-272`), `./backup-export`
  (`:233,382-384`, `Makefile:245`), `./uploads-rescue` (`:475`, `docs/deployment_coolify.md:219`),
  `pre-wave-6.dump` and `./db-20261118T000000Z.dump` / `./uploads-20261118T000000Z.tar.gz` in the repo
  root (`:399-400,483`). `data/uploads` is already covered by `**/uploads`.
- Both Dockerfiles `COPY . .` in their `deps` stage (`Dockerfile:45`, `Dockerfile.web:24`). The
  final stages copy only `apps/api`, `packages/db`, `packages/shared`, `files` (API) or
  `apps/web/dist` (web), so the PUBLISHED images do not contain root-level data; the data reaches the
  build context, the `deps`/`builder` layers and the local build cache (and a remote builder, when
  one is used).
- Empirical check (scratch context in the session scratchpad, `FROM scratch` + `COPY . /ctx/`,
  `docker buildx build -o type=local`; Docker 29.8.2, buildx 0.37.2), with a mode-000
  `data/postgres/18/docker` owned by the invoking user (the postgres image chmods `PGDATA` to 0700
  as uid 999):
  - T1, current `.dockerignore`: `ERROR: … error from sender: failed to xattr data/postgres/18/docker: permission denied`.
  - T2, current file + the review's additions (`data`, `backup-export`, `uploads-rescue`,
    `**/*.dump`): **the same error**. The negations `!*.env.example` / `!**/*.env.example`
    (`.dockerignore:47-48`) make the context walker descend into every excluded directory to look
    for re-included files.
  - T3, additions with the negations removed: builds; output holds only `Dockerfile`,
    `.dockerignore`, `keep.txt`.
  - T4, additions plus explicit-path negations `!.env.example`, `!apps/api/.env.example`,
    `!apps/web/.env.example`: builds; the three templates are present, `.env`, `.env.production`,
    `apps/api/.env`, `data/`, `backup-export/`, `*.dump` are absent.
- Secrets: `.env`, `.env.production` (`.env.*`), nested `.env*` and `garage.toml` are excluded.
  Root `.mcp.json` (21 B) and `opencode.json` (64 B) reach the context but no final image; no other
  secret file was found. `.env.production.example` stays excluded (it matches `.env.*` and no
  negation), which is fine: no build step reads any `*.env.example` file (`git grep env\.example`
  outside docs finds only comments).
- No test covers the build context; CI builds from a clean checkout.
- Verdict: **bigger** (the review's fix alone does not stop the failure); the "ships data inside
  build layers" part is limited to intermediate layers and the build context, not the published
  images.

### 2. Root cause

Missing exclusions for the documented data folders, and `**/` glob negations that force the
context walker into excluded directories.

### 3. Fix design

`.dockerignore`:
- Add to the "Local data" block: `data`, `backup-export`, `uploads-rescue`, `**/*.dump`,
  `**/uploads-*.tar.gz`.
- Replace the negations `!*.env.example` and `!**/*.env.example` with `!.env.example`,
  `!apps/api/.env.example`, `!apps/web/.env.example`, and add a comment: "Re-include templates by
  exact path only: a `**/` negation makes Docker walk into every excluded folder (an unreadable
  `data/postgres` then fails the build)."
- Alternative rejected: dropping the negations entirely also works (T3) but contradicts the
  container-deployment scenario that keeps the templates in the context; exact paths keep both.

### 4. Tests

Add `scripts/ci/dockerignore.test.sh` (POSIX sh, `set -eu`, `trap` that `chmod -R u+rwx` and removes
both temp dirs):
- Build a temp context: copy the repo `.dockerignore`; create `data/postgres/18/docker/PG_VERSION`
  (then `chmod 000 data/postgres/18/docker`), `data/uploads/x.jpg`, `backup-export/db-1.dump`,
  `uploads-rescue/a.jpg`, `backups/b.dump`, `pre-wave-6.dump`, `db-20261118T000000Z.dump`,
  `uploads-20261118T000000Z.tar.gz`, `.env`, `.env.production`, `apps/api/.env`, `.env.example`,
  `apps/api/.env.example`, `apps/web/.env.example`, `files/scaa-2.json`, and a `Dockerfile` with
  `FROM scratch` / `COPY . /ctx/`.
- `docker buildx build --no-cache -q -o "type=local,dest=$OUT" "$CTX"` must exit 0.
- Assert present: `ctx/files/scaa-2.json`, `ctx/.env.example`, `ctx/apps/api/.env.example`,
  `ctx/apps/web/.env.example`. Assert absent: `ctx/data`, `ctx/backup-export`, `ctx/uploads-rescue`,
  `ctx/backups`, every `*.dump`, `uploads-*.tar.gz`, `ctx/.env`, `ctx/.env.production`,
  `ctx/apps/api/.env`.
- Print `ok`/`not ok` lines like the other CI scripts. Run it in the CI `images` job (GitHub runners
  run as a non-root user, so mode 000 is enforced; as root the unreadable check is moot but the
  presence/absence asserts still run).

Failing first: against today's `.dockerignore` the build fails with `permission denied`
(reproduced, T1).

### 5. Spec impact

MODIFIED in `openspec/specs/container-deployment/spec.md` (full blocks, edits applied):

```markdown
### Requirement: Docker build context excludes local state and nested artifacts
The `.dockerignore` SHALL exclude, at any directory depth, `node_modules`, `coverage`, `dist` and `.turbo`, and SHALL exclude local state and tooling directories (`uploads`, `backups`, `data`, `backup-export`, `uploads-rescue`, `.git`, `.github`, `.claude`, `.kiro`, `.opencode`, `.vscode`, `.idea`, `plans`, `openspec`, `docs`) and backup files at any depth (`*.dump`, `uploads-*.tar.gz`), while keeping every path the images need.

Paths the images need, and which therefore MUST NOT be excluded, include `files/`,
`packages/db/drizzle/`, `apps/web/public/`, `apps/api/src/templates/` and the workspace manifests.
Docker evaluates `.dockerignore` patterns relative to the context root, so nested directories need
`**/` patterns. Exceptions (`!` lines) SHALL name exact paths, never a `**/` glob: a glob exception
makes Docker walk into every excluded directory, and an unreadable one (the postgres data folder is
mode `0700`) then fails the build.

#### Scenario: Nested node_modules are not sent to the builder
- **WHEN** a build runs in a working tree that has `apps/web/node_modules` and `packages/db/node_modules`
- **THEN** neither directory is part of the build context

#### Scenario: Local uploads never reach an image
- **WHEN** a build runs in a working tree with files in `uploads/` and `apps/api/uploads/`
- **THEN** neither image contains those files

#### Scenario: Documented data folders never reach the builder
- **WHEN** a build runs in a working tree with an unreadable `data/postgres` folder, `backup-export/`, `uploads-rescue/` and `*.dump` files, as the self-hosting guide creates them
- **THEN** the build succeeds and none of those paths is part of the build context

#### Scenario: Required inputs are still present
- **WHEN** the API image is built
- **THEN** `/app/files/scaa-2.json` and `/app/packages/db/drizzle/meta/_journal.json` exist in the image
```

```markdown
### Requirement: No secrets baked into images
Neither Docker image SHALL contain secrets at build time: all sensitive configuration SHALL be provided as runtime environment variables, and the only build-time `ARG`s SHALL be the public `VITE_API_URL` and `VITE_PUBLIC_APP_URL` of the web image.

Sensitive values include `DATABASE_URL`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `REDIS_URL`,
`VALKEY_PASSWORD`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `SMTP_PASS` and `ADMIN_PASSWORD`. They are set
via Coolify's Environment Variables, `compose.production.yml` `environment:` interpolated from
`.env.production`, or `docker run -e`, never as `ARG` or `ENV` instructions. The API `Dockerfile`
has no build-time `ARG`s.

The `.dockerignore` MUST exclude environment files at any depth (`.env`, `*.env`, `.env.*` and
their `**/` forms) while keeping the committed `.env.example`, `apps/api/.env.example` and
`apps/web/.env.example` templates through exact-path exceptions, because both Dockerfiles use
`COPY . .`.

#### Scenario: API image has no baked secrets
- **WHEN** `docker history --no-trunc` and the image config of the API image are inspected
- **THEN** no layer or `ENV` entry contains `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, `VALKEY_PASSWORD`, `S3_SECRET_KEY`, `SMTP_PASS` or `ADMIN_PASSWORD` values

#### Scenario: Web image build args are public URLs only
- **WHEN** the web image build command is inspected
- **THEN** the only `--build-arg` values are `VITE_API_URL` and `VITE_PUBLIC_APP_URL`

#### Scenario: Local env files never reach an image
- **WHEN** `make images` is run in a working tree containing populated `.env`, `.env.production` and `apps/api/.env` files
- **THEN** none of those files exists in either image
- **AND** the three committed `*.env.example` templates are still present in the build context
```

### 6. Docs / ledger impact

- `docs/deployment_compose.md` §15: one sentence: "Local data folders (`data/`, `backups/`,
  `backup-export/`, `uploads-rescue/`, `*.dump`) are excluded from the build context."
- `.dockerignore` header comment: list the new exclusions and the exact-path rule.

### 7. Draft tasks

- [ ] R3.7 Add `scripts/ci/dockerignore.test.sh` as specified in Finding 11 §4 of `audit/r3-deploy-ops-seed.md`; run it locally and confirm it fails with `permission denied` against the current `.dockerignore`.
- [ ] R3.8 In `.dockerignore`, add `data`, `backup-export`, `uploads-rescue`, `**/*.dump` and `**/uploads-*.tar.gz`, replace `!*.env.example`/`!**/*.env.example` with `!.env.example`, `!apps/api/.env.example` and `!apps/web/.env.example`, and update the comments. Re-run `scripts/ci/dockerignore.test.sh` (passes) and `make images` (both images still build).
- [ ] R3.9 Add a `scripts/ci/dockerignore.test.sh` step to the `images` job of `.github/workflows/ci.yml` (before the builds) and add the §15 sentence to `docs/deployment_compose.md`.

### 8. Risks / migration notes

- None for data. A future template in another folder needs its own `!` line (the comment says so).

---

## Finding 12: Demo accounts with a published password are created on every fresh production install

### 1. Verification

- `packages/db/src/seed.ts:278-322` (`seedUsers`): admin, then every `userSeedData` account
  (`seed-users-recipes.ts:158-199`: alice … evan `@example.com`), `emailVerifiedAt: new Date()`,
  `hashPassword(defaultPassword)` with `defaultPassword = 'user123456'`
  (`seed-users-recipes.ts:9`). `main()` (`seed.ts:1211-1259`) reads no `APP_ENV`.
- `docker-entrypoint.sh:61-70` runs `node src/seed.ts` whenever `check-users-empty.ts` prints `0`,
  in `migrate` mode (compose) and `serve` mode (Coolify). `compose.production.yml:103` and
  `docs/deployment_coolify.md:229` set `APP_ENV=production`; `ENABLE_REGISTRATION` defaults to
  `true` (public sign-ups open), which meets D99.52's revisit condition (`plans/D99-debts.md:950-956`).
- `README.md:98-112` documents the accounts and says to change or delete them after a production
  install; neither deploy guide mentions them.
- Reference data vs demo content (what each seed helper writes):

  | Helper | Data | Class |
  |---|---|---|
  | `seedBrewMethodCompatibility` | `brew_method_equipment_rule` | reference |
  | `seedBadges` | `badge` rules (the hourly badge job awards them) | reference |
  | `seedUsers` admin + its `user_preference` | admin account | required |
  | `seedUsers` demo loop | 5 verified demo accounts + preferences | demo |
  | `seedEquipmentCatalog` | system equipment (`isSystem: true`) | reference |
  | `seedCoffeeVarietiesCatalogue` | system varieties (`isSystem: true`) | reference |
  | `seedVendors` | 7 real roasters, `createdBy` null (`/api/v1/vendors` "roaster directory") | reference (see decision) |
  | `seedTasteNotes` | SCAA wheel from `files/scaa-2.json` | reference |
  | `seedEquipment` | user equipment created by demo users | demo |
  | `seedBeans` | beans owned by demo users | demo |
  | `seedRecipes`, `seedRecipeTasteNotes` | 18 recipes, versions, photos, preparations | demo |
  | `seedSocialData` | follows, likes, favourites, ratings, comments, user badges | demo |
  | `seedSetups` | demo users' setups | demo |
  | `seedCollections` | collections for every seeded user (admin included) | demo |
  | `seedBrewLogs` | brew logs | demo |

- What relies on demo users in production mode: nothing. `scripts/ci/smoke-images.sh` (APP_ENV
  production) only checks `/health`, `/ready`, the SPA and that `/api/v1/sitemap.xml` is an XML
  `<urlset` (static pages are always listed, `apps/api/src/routes/sitemap.ts` `buildXml`);
  `scripts/ci/smoke-compose.sh` never signs in or counts users. Tests that use demo users run with
  `APP_ENV=test` (CI `test` job, `.github/workflows/ci.yml:140`) or `development` (compose `app`
  service, `compose.yml:49`, used by `make test-db-provision` and `make test*`).
- Verdict: **confirmed**.

### 2. Root cause

The seed has no environment switch; the first-install bootstrap runs the full development seed.

### 3. Fix design

In `packages/db/src/seed.ts`:
- Export a pure helper with a docblock:
  `export function shouldSeedDemoContent(appEnv: string | undefined): boolean { return appEnv !== 'production'; }`.
- `seedUsers(tx, { demoUsers }: { demoUsers: boolean })`: always the admin (+ preferences); the demo
  loop only when `demoUsers`.
- `main()`: `const demo = shouldSeedDemoContent(process.env.APP_ENV);` read inside `main()` (so
  tests can stub it). In the transaction: brew-method rules, badges, users, equipment catalog,
  coffee varieties, vendors and taste notes always (move `seedTasteNotes` up, before the demo
  block; it does not depend on recipes, and `seedRecipeTasteNotes` still runs after it); then
  `if (!demo) return;` before `seedEquipment`, `seedBeans`, `seedRecipes`, `seedSocialData`,
  `seedSetups`, `seedRecipeTasteNotes`, `seedCollections`, `seedBrewLogs`.
- Log one line: `console.log('Demo content skipped (APP_ENV=production): admin and reference catalogs only')`
  (the seed logs with `console`, as today). Update the module docblock (lines 1-9) and the
  `main()` docblock.
- No new env variable (no `SEED_DEMO_DATA` override): YAGNI; see user decision below.
- `docker-entrypoint.sh` does not change.

Existing installs: the seed only runs on an empty database, so nothing changes for them. Add a
runbook step to both guides: sign in as the admin, Admin → Users, search `example.com`, delete
`alice`, `bob`, `charlie`, `diana`, `evan` (the admin delete is a soft delete with an audit log
entry, `apps/api/src/modules/admin/service.ts:173-181`; soft-deleted accounts cannot sign in,
`apps/api/src/modules/auth/model.ts:72,83`), and review recipes or comments those accounts posted
after the install date.

Alternatives rejected: separate `seed:base`/`seed:demo` scripts (D99.52's sketch): more entry points
and the entrypoint would still need the environment check; a warning-only doc fix: leaves every new
site with five known logins.

### 4. Tests

- `packages/db/src/seed.test.ts` (no DB): `shouldSeedDemoContent('production')` is `false`;
  `'development'`, `'test'`, `undefined` are `true`. Fails first: not exported.
- `packages/db/src/seed.idempotent.test.ts`, new describe "Seed — production mode seeds no demo
  content": `beforeAll(resetDatabase)`; `vi.stubEnv('APP_ENV', 'production')` [C7-vitest];
  `await main(); await main();` (idempotent in this mode too); assert `user` count `1` with
  `isAdmin: true` and no email ending `@example.com`; `user_preference` `1`; `recipe`, `bean`,
  `setup`, `collection`, `brew_log`, `comment`, `user_follow`, `user_badge` all `0`; `vendor` =
  `vendorSeedData.length`; `equipment` = `equipmentCatalogSeedData.length`; `coffee_variety` =
  `coffeeVarietySeedData.length`; `badge` = `badgeSeedData.length`; `brew_method_equipment_rule` =
  `brewMethodCompatibilityRules.length`; `taste_note` ≥ SCAA names. `afterAll`:
  `vi.unstubAllEnvs()`, `resetDatabase()`, `await main()` so the database ends fully seeded like
  after the other describes. Import `vi`, `afterAll` from `vitest`, and `collections`, `brewLogs`
  from `./schema.ts`. Fails first: 6 users.
- CI: `scripts/ci/smoke-compose.sh` step 1 asserts `select count(*) from "user"` = `1` and
  `select count(*) from "user" where email like '%@example.com'` = `0` (and Finding 2 step 6.6
  re-checks after a fresh seed).

### 5. Spec impact

NEW capability `openspec/specs/database-seed/spec.md` (delta `## ADDED Requirements`; after archive
replace the placeholder Purpose, e.g. "Defines what the database seed inserts in each environment
and keeps it safe to re-run.").

```markdown
### Requirement: Production seed creates only the admin and reference data
The seed (`packages/db/src/seed.ts`) SHALL create demo accounts and demo content only when `APP_ENV` is not `production`; with `APP_ENV=production` it SHALL create only the admin account with its preferences and the reference data.

- Reference data: brew-method/equipment compatibility rules, badges, the system equipment
  catalogue, the system coffee varieties, the vendor directory and the SCAA taste notes.
- Demo content: the `userSeedData` accounts (shared `defaultPassword`), their equipment, beans,
  setups, recipes (with versions, photos, preparations and taste notes), social data, collections
  and brew logs.
- The decision SHALL come from an exported pure function `shouldSeedDemoContent(appEnv)`, evaluated
  when the seed runs, and the seed SHALL log one line when it skips demo content.
- Development (`make db-seed`, `make test-db-provision`) and test runs keep the full demo data set.

#### Scenario: Fresh production install has no demo accounts
- **WHEN** the API image bootstraps an empty database with `APP_ENV=production`
- **THEN** the `user` table holds exactly one row, the admin, and no address ends with `@example.com`
- **AND** the reference catalogues are populated and no recipe, bean, setup, collection or brew log exists

#### Scenario: Development seed keeps the demo data
- **WHEN** `make db-seed` runs with `APP_ENV=development`
- **THEN** the demo accounts and their recipes are created as before

#### Scenario: Production seed is idempotent
- **WHEN** the seed runs twice with `APP_ENV=production`
- **THEN** the second run succeeds and every table keeps the counts of the first run
```

MODIFIED in `openspec/specs/container-deployment/spec.md` (full block, edits applied; only the
"What the seed inserts" paragraph changes):

```markdown
### Requirement: Entrypoint runs seed only on first boot
The `docker-entrypoint.sh` script SHALL run the first-install bootstrap (the `@brewform/db` seed entrypoint, run with `node`) ONLY when the `users` table is empty, as reported by `packages/db/src/check-users-empty.ts` run directly with `node`.

The check script prints the bare integer count of `users` rows to stdout, which the entrypoint
captures. It MUST NOT mask a query failure as `0`: a failed check exits non-zero and, with
`set -e`, aborts the boot instead of re-seeding a populated database. The check SHALL NOT use
`psql` (the runtime image has no Postgres client).

When the count is `0` the script SHALL print `Database is empty, running seed...` before and
`Seeding complete.` after the seed. When the count is greater than `0` it SHALL skip the seed and
print `Seed skipped — database already contains data (<count> users).`

What the seed inserts in a given `APP_ENV` (the admin and reference data only in production) is
defined by the `database-seed` capability, not by this requirement. The seed remains idempotent
(`onConflictDoNothing` on unique keys), so a manual re-run is non-destructive.

#### Scenario: Seed runs on first boot
- **WHEN** the API container starts against a database whose `users` table is empty
- **THEN** the seed entrypoint runs and the admin account from `ADMIN_EMAIL`/`ADMIN_USERNAME`/`ADMIN_PASSWORD` is created
- **AND** stdout contains `Database is empty, running seed...` and `Seeding complete.`
- **AND** the API server starts after seeding completes

#### Scenario: Seed is skipped on subsequent boots
- **WHEN** the API container starts against a database whose `users` table has rows
- **THEN** the seed does NOT run
- **AND** stdout contains `Seed skipped — database already contains data (<N> users).`

#### Scenario: Failed check aborts instead of re-seeding
- **WHEN** the user-count check cannot reach the database
- **THEN** the check exits non-zero and the entrypoint aborts
- **AND** the seed does NOT run

#### Scenario: Seed is non-destructive if run manually
- **WHEN** an operator runs the seed entrypoint manually against a populated database
- **THEN** no existing row is modified or deleted and no unique constraint is violated
```

### 6. Docs / ledger impact

- `README.md:98-112` "Seeded accounts": demo users only with `APP_ENV` other than `production`;
  production installs get the admin and the reference catalogues; installs created before this
  change: the cleanup step. Update `README.md:191` (`make db-seed` comment stays accurate for dev).
- `docs/deployment_compose.md` §3 step 4/6: "On a production install the seed creates only the
  admin and the reference catalogues"; new short subsection (in §12 or §14) "Installs created before
  <release>: remove the demo accounts" with the admin-UI steps.
- `docs/deployment_coolify.md` §6 step 7 (lines 302-313) and §13: same sentence and cleanup step.
- `AGENTS.md` "Seed idempotency" bullet (line 177): add "With `APP_ENV=production` the seed creates
  only the admin and the reference data (`shouldSeedDemoContent`)."
- `plans/D99-debts.md:950`: D99.52 → "✅ Resolved (<date>, wave-6-review-remediation)", with the fix
  summary and the runbook pointer; update the status line at the top of the ledger.
- `packages/db/src/seed.ts` module docblock and `main()` docblock (ADR-020 docblock scan).

### 7. Draft tasks

- [ ] R3.3 Add a failing unit test for `shouldSeedDemoContent` to `packages/db/src/seed.test.ts` (`'production'` → `false`; `'development'`, `'test'`, `undefined` → `true`).
- [ ] R3.4 Add the failing describe "Seed — production mode seeds no demo content" to `packages/db/src/seed.idempotent.test.ts` exactly as in Finding 12 §4 (stub `APP_ENV`, run `main()` twice, assert the counts, restore and re-seed in `afterAll`). Run `make test-specific filter=src/seed` and confirm both new tests fail.
- [ ] R3.5 Implement in `packages/db/src/seed.ts`: exported `shouldSeedDemoContent` with a docblock, `seedUsers(tx, { demoUsers })`, `seedTasteNotes` moved before the demo block, `if (!demo) return;` before the demo helpers, the skip log line, updated module and `main()` docblocks. Run `make check`, `make test-specific filter=src/seed` (all seed tests pass), `make lint`, `make fmt`.
- [ ] R3.6 Add the step-1 assertions (one user, none `@example.com`) to `scripts/ci/smoke-compose.sh`; update `README.md` "Seeded accounts", `docs/deployment_compose.md` §3 plus the demo-account cleanup subsection, `docs/deployment_coolify.md` §6 step 7 and §13, the `AGENTS.md` seed bullet, and close D99.52 in `plans/D99-debts.md`.

### 8. Risks / migration notes

- No data migration. Existing installs keep their demo accounts until an admin removes them (runbook
  step). A fresh production install now has no sample recipes, so the home page starts empty.

---

## Finding 13: The client IP can be spoofed behind a front proxy that does not set X-Forwarded-For

### 1. Verification

- `compose.production.yml:270`: `TRUSTED_PROXIES: ${TRUSTED_PROXIES-private_ranges}`;
  `docker-web-entrypoint.sh:117-132` writes `servers { trusted_proxies static <ranges>;
  trusted_proxies_strict }`; `:99-111` sends the API `X-Forwarded-For {client_ip}` and
  `X-Real-IP {client_ip}`.
- Caddy trusts the client IP from `X-Forwarded-For` of any request whose peer is in
  `private_ranges`, reading right to left [C7-caddy]. nginx `proxy_pass` passes a client-sent
  `X-Forwarded-For` through unchanged unless `proxy_set_header` redefines it [C7-nginx]. With nginx
  on the host (peer = Docker bridge gateway, a private address), a client sending
  `X-Forwarded-For: 198.51.100.7` is rate limited as `198.51.100.7`: a fresh bucket per request, or
  a victim's bucket.
- Broader than the review: the same happens with ANY path where an untrusted client reaches the
  web port from a private address without an appending proxy: an L4/TCP forwarder (HAProxy
  `mode tcp`, nginx `stream`, a private-address cloud TCP load balancer), rootless Docker's port
  forwarder (it does not preserve source addresses), or a client bypassing the front proxy by
  connecting to the published port on a private network. Appending or replacing proxies are safe
  with the strict right-to-left read: nginx with `$proxy_add_x_forwarded_for` [C7-nginx], Caddy
  (ignores untrusted incoming `X-Forwarded-*` [C7-caddy]), Traefik (deletes them unless trusted or
  `insecure`; unsafe only with `notAppendXForwardedFor=true` [C7-traefik]), Cloudflare and AWS ALB
  (append, [C7-caddy]).
- Docs today: `docs/deployment_compose.md:206-219` (§5 table: "A proxy on the same host or a private
  network (Caddy, nginx, Traefik, Coolify) → unset"), `.env.production.example:58-62`, compose header
  `:45-55`. None says the proxy must append or replace the header, none gives a snippet.
- Also found: a front nginx with its default `client_max_body_size 1m` answers 413 to photo uploads
  (API photo cap ~11.06 MiB); the guide's 413 row (`:714`) only blames `EDGE_MAX_BODY_SIZE`.
- Verdict: **bigger** in scope; a documentation fix is still the right fix.

### 2. Root cause

The trust model assumes every private-address peer is an HTTP proxy that sets `X-Forwarded-For`
correctly, and the guide never states that contract.

### 3. Fix design

Documentation only, no default change:
- Rejected: default `TRUSTED_PROXIES` to empty. Behind any proxy every client then shares the
  proxy's rate-limit bucket (`RATE_LIMIT_GLOBAL_MAX=100`/min for the whole site, login lockouts for
  everyone): worse for the documented default topology.
- Rejected: narrowing the default to `127.0.0.1/8`: a host proxy reaches the container from the
  Docker bridge gateway (172.16/12), not loopback, so the default would silently share one bucket.

Add to §5 of `docs/deployment_compose.md`, right after the table, "Front proxy contract":
- The front proxy MUST append its peer to, or replace, `X-Forwarded-For`; a proxy that passes the
  client's header through lets any client choose its IP. TCP (layer 4) forwarders on a private
  address count as "passing through": with one, set `TRUSTED_PROXIES` to the proxy's own address or
  leave it empty.
- Only the proxy may reach the web port: with the proxy on the same host set
  `WEB_PORT=127.0.0.1:8080` (Compose then publishes `127.0.0.1:8080:80`); on a private network,
  firewall the port to the proxy's address.
- Snippets:

```nginx
server {
    listen 443 ssl;
    server_name brewform.example.com;
    client_max_body_size 16m;                      # nginx defaults to 1m; photos are up to ~11 MiB
    location / {
        proxy_pass http://127.0.0.1:8080;          # WEB_PORT=127.0.0.1:8080
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;   # required
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```caddyfile
brewform.example.com {
	reverse_proxy 127.0.0.1:8080
}
# Caddy's reverse_proxy ignores client-sent X-Forwarded-* and sets the client address.
# Do not add trusted_proxies here unless another proxy (e.g. Cloudflare) sits in front of it.
```

```yaml
# Traefik (Docker labels); the default forwardedHeaders handling is correct.
labels:
  - traefik.http.routers.brewform.rule=Host(`brewform.example.com`)
  - traefik.http.routers.brewform.tls.certresolver=le
  - traefik.http.services.brewform.loadbalancer.server.port=80
# Never set entryPoints.<name>.forwardedHeaders.notAppendXForwardedFor=true.
```

- `.env.production.example`: under `TRUSTED_PROXIES` add "The proxy must append to or replace
  X-Forwarded-For (nginx: proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;); a proxy
  that passes it through lets clients pick their IP." Under `WEB_PORT` add
  `# WEB_PORT=127.0.0.1:8080   # loopback only: recommended when the TLS proxy runs on this host`.
- `compose.production.yml` header "Client IP" block (`:45-55`): one line with the same contract.
- `docs/deployment_compose.md` §4 `WEB_PORT` row: "`80`, or `127.0.0.1:8080` to listen on loopback
  only"; §16: extend the 413 row ("or a front nginx with the default `client_max_body_size 1m`") and
  add "Rate limits hit random clients / bypassed → the front proxy passes `X-Forwarded-For` through
  (§5)".
- `docs/deployment_coolify.md`: Coolify's Traefik deletes untrusted `X-Forwarded-*` [C7-traefik];
  no change needed beyond a one-line note in its `TRUST_PROXY` table if the assembler wants
  symmetry (optional).

### 4. Tests

None (documentation only). `make docs-check` must pass. The edge behaviour itself is already covered
by `scripts/ci/web-entrypoint.test.sh` (spoofed headers replaced; right-most untrusted address
kept).

### 5. Spec impact

ADDED in `openspec/specs/production-operations/spec.md`:

```markdown
### Requirement: Self-hosting guide documents the front-proxy client-IP contract
The self-hosting guide and `.env.production.example` SHALL state that a proxy in front of the web edge, when it connects from an address in `TRUSTED_PROXIES`, MUST append its peer address to or replace `X-Forwarded-For`, and that only that proxy may reach the web port.

- The guide SHALL give working front-proxy examples for nginx (with
  `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` and a `client_max_body_size` above
  the photo cap), Caddy (default `reverse_proxy`) and Traefik (default forwarded-headers handling,
  never `notAppendXForwardedFor`).
- It SHALL explain that a TCP (layer 4) forwarder on a private address passes client headers through
  and therefore needs `TRUSTED_PROXIES` set to that forwarder's address or empty.
- It SHALL show `WEB_PORT=127.0.0.1:<port>` for a proxy on the same host and a firewall rule for a
  proxy on a private network.
- The default `TRUSTED_PROXIES=private_ranges` stays.

#### Scenario: nginx operator gets a safe configuration
- **WHEN** an operator configures nginx in front of the stack from the guide's example
- **THEN** a request with a forged `X-Forwarded-For` reaches the API with the client's real address as its client IP
- **AND** a photo upload under the API cap is not rejected by nginx

#### Scenario: Same-host proxy cannot be bypassed
- **WHEN** `WEB_PORT=127.0.0.1:8080` is set as the guide recommends for a proxy on the same host
- **THEN** the web port accepts connections only on the loopback interface
```

### 6. Docs / ledger impact

Listed in §3. No D99 entry.

### 7. Draft tasks

- [ ] R3.17 Add the "Front proxy contract" with the nginx, Caddy and Traefik snippets from Finding 13 §3 to §5 of `docs/deployment_compose.md`, extend the §4 `WEB_PORT` row and the §16 rows, add the `TRUSTED_PROXIES` and `WEB_PORT=127.0.0.1:8080` comment lines to `.env.production.example`, and one contract line to the "Client IP" header block of `compose.production.yml`. Run `make docs-check`.

### 8. Risks / migration notes

- None in code. Operators already behind a plain nginx should add the header after upgrading; the
  release notes should say so.

---

## Finding 30: The Coolify guide puts the database password on the command line

### 1. Verification

Scan of `docs/deployment_coolify.md`, `docs/deployment_compose.md`, `README.md`, `Makefile`,
`.env.production.example`:
- `docs/deployment_coolify.md:677`: `docker run --rm --network <API network> -e DATABASE_URL=<API value> …`
  → the password is in `ps` (the docker CLI process) and in shell history. Confirmed.
- New, `docs/deployment_coolify.md:541`: `psql "$DATABASE_URL" -At …`: the expanded URL (with the
  password) is a psql argument, visible in `ps` while the query runs.
- New, `docs/deployment_coolify.md:481` and `docs/deployment_compose.md:563`:
  `export AWS_ACCESS_KEY_ID="<admin key id>" AWS_SECRET_ACCESS_KEY="<admin secret>"`: a shell builtin
  (not in `ps`) but saved to shell history.
- Not secrets / acceptable: `Makefile:105,119-143` `TEST_DATABASE_URL` holds the public dev
  password `brewform`; `docs/deployment_coolify.md:106` passes an anonymous public GHCR pull token;
  `docs/deployment_compose.md:483,624` run `pg_dump`/`psql` inside the postgres container over the
  local socket (no password); `garage key info … --show-secret` (`:553`) prints a key the operator
  needs; the compose file keeps passwords in env (`PGPASSWORD`, `VALKEYCLI_AUTH`), and every `prod-*`
  target uses `--env-file`.
- Verdict: **bigger** (three more places, all documentation).

### 2. Root cause

Copy-paste snippets that inline secret values.

### 3. Fix design

- `:677` (identifier check):

```sh
read -rs DATABASE_URL && export DATABASE_URL   # paste the API's DATABASE_URL (not shown, not in history)
docker run --rm --network <API network> -e DATABASE_URL \
  --entrypoint node ghcr.io/ardakilic/brewform-api:<new tag> \
  /app/packages/db/src/check-identifiers.ts
unset DATABASE_URL
```
  `-e DATABASE_URL` with no value takes it from the caller's environment [C7-dockerenv]; note that
  `read -s` needs bash or zsh (Coolify servers default to bash).
- `:541`: run the query inside Coolify's postgres container over its local socket, like the compose
  guide (`docs/deployment_compose.md:621-628`):
  `docker exec -i <postgres container> psql -U postgres -d postgres -At -F $'\t' -c "…"` (find the
  container with `docker ps --filter name=postgresql`; adjust `-U`/`-d` to the database in
  `DATABASE_URL`).
- `:481` and compose `:563`: keep the non-secret exports, read the secret with
  `read -rs AWS_SECRET_ACCESS_KEY && export AWS_SECRET_ACCESS_KEY`.

### 4. Tests

None (documentation). `make docs-check`.

### 5. Spec impact

ADDED in `openspec/specs/deployment-guide/spec.md`:

```markdown
### Requirement: Deployment guides keep secrets off command lines
The deployment guides SHALL NOT show a command that puts a password, connection string with a password, or secret key into a process argument or a literal shell assignment; secrets SHALL be passed through the environment (`-e VAR` with no value, `--env-file`), read with `read -rs`, or avoided by running the command inside the database container over its local socket.

#### Scenario: Coolify identifier check passes DATABASE_URL through the environment
- **WHEN** an operator runs the identifier check from `docs/deployment_coolify.md`
- **THEN** the command uses `-e DATABASE_URL` without a value after `read -rs DATABASE_URL`, so the value appears in neither `ps` nor the shell history

#### Scenario: Photo-row audit needs no connection string
- **WHEN** an operator runs the photo-row query of the Coolify photo storage security check
- **THEN** it runs with `docker exec` inside the postgres container without a password argument
```

### 6. Docs / ledger impact

`docs/deployment_coolify.md` (§ "Before upgrading to wave 6" step 1, photo storage check steps 0
and 3), `docs/deployment_compose.md` (photo storage check step 0). No D99 entry.

### 7. Draft tasks

- [ ] R3.18 In `docs/deployment_coolify.md`, replace the identifier-check command (line 677) with the `read -rs DATABASE_URL` + `-e DATABASE_URL` version, the `psql "$DATABASE_URL"` query (line 541) with `docker exec -i <postgres container> psql …`, and the `AWS_SECRET_ACCESS_KEY` literal export (line 481) with `read -rs`; make the same `AWS_SECRET_ACCESS_KEY` change at `docs/deployment_compose.md:563`. Run `make docs-check`.

### 8. Risks / migration notes

None.

---

## Finding 31: Re-running the seed in dev fails if a user renamed their default setup

### 1. Verification

- `packages/db/src/seed.ts:914-948` (`seedSetups`): selects by `(userId, name)` with no
  `deletedAt` filter; when nothing matches it inserts with `isDefault: setupData.isDefault` (every
  `setupSeedData` entry has `isDefault: true`, `seed-users-recipes.ts:1696-1741`) and no conflict
  clause.
- `packages/db/src/schema.ts:699-701` (migration `0017_acoustic_lockheed.sql`):
  `uniqueIndex('setup_user_default_unique').on(userId).where(is_default = true and deleted_at is null)`.
- Failing case: alice renames "Alice's Espresso Setup" (still her default). The re-run finds no row
  named "Alice's Espresso Setup", inserts a second active default → `23505` on
  `setup_user_default_unique` → the whole seed transaction aborts. A soft-deleted or no-longer-default
  seeded setup does not trigger it.
- Every other seed insert checked against the wave-6 unique indexes (0016-0019):
  `user_email_lower_unique` / `user_username_lower_unique` → `findOrCreateSeedUser` (select
  case-insensitively + target-less `onConflictDoNothing`, `seed.ts:220-264`); covered by the test at
  `seed.idempotent.test.ts:267-317`. `user_recipe_note_user_id_recipe_id_unique` → the seed writes no
  notes. 0018/0019 add no unique index. Pre-wave-6 uniques are all handled
  (`onConflictDoNothing({ target })`, select-and-reuse, or `onConflictDoUpdate` for collection
  items). Only `seedSetups` is affected.
- No test covers a renamed setup.
- Verdict: **confirmed**.

### 2. Root cause

The insert has no conflict handling for the new partial unique index, and the existence check keys
on a column (`name`) the user can change.

### 3. Fix design

Add `.onConflictDoNothing()` with no target to the `tx.insert(setups)` call (`seed.ts:935-946`):
Postgres `ON CONFLICT DO NOTHING` without a target covers every unique constraint and index,
partial ones included [C7-drizzle]. The user's renamed default stays the default and the seed does
not add a second setup; repeated runs stay no-ops. Update the `seedSetups` docblock (mention the
partial index and why the target is omitted).

Alternatives rejected: `onConflictDoNothing({ target: setups.userId, where: … })`: the `where`
needs an `sql` fragment matching the index predicate (a new raw-SQL registry entry) and a bound
parameter may not let Postgres infer the arbiter index; inserting with `isDefault: false` when the
user has a default: adds a query and still creates a duplicate setup the user did not ask for.

### 4. Tests

`packages/db/src/seed.idempotent.test.ts`, new describe "Seed idempotency — renamed default setup
(setup_user_default_unique)": `beforeAll(resetDatabase)`; `await main()`; look up alice by
username; `db.update(setups).set({ name: 'Renamed default' }).where(and(eq(setups.userId, alice.id),
eq(setups.isDefault, true)))`; `await expect(main()).resolves.toBeUndefined()`; alice has exactly one
setup, `{ name: 'Renamed default', isDefault: true }`. Import `and`, `eq` from `drizzle-orm` (the
file already imports `count`, `inArray`). Fails first with `23505` on `setup_user_default_unique`.

### 5. Spec impact

ADDED to the NEW `database-seed` capability (same delta file as Finding 12):

```markdown
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
```

### 6. Docs / ledger impact

`AGENTS.md:177` "Seed idempotency": add "a partial unique index (`setup_user_default_unique`) is
handled with target-less `onConflictDoNothing()`". No D99 entry.

### 7. Draft tasks

- [ ] R3.1 Add the failing describe "Seed idempotency — renamed default setup (setup_user_default_unique)" to `packages/db/src/seed.idempotent.test.ts` as in Finding 31 §4. Run `make test-specific filter=src/seed.idempotent` and confirm it fails with `23505` on `setup_user_default_unique`.
- [ ] R3.2 Add `.onConflictDoNothing()` (no target) to the setups insert in `seedSetups` (`packages/db/src/seed.ts`), update its docblock and the `AGENTS.md` seed-idempotency bullet. Re-run the test (passes), then `make check`, `make lint`, `make fmt`.

### 8. Risks / migration notes

Dev-only path; none.

---

## Combined CI spec block (Findings 2, 10, 11, 12)

MODIFIED in `openspec/specs/ci-image-publishing/spec.md` (full block, edits applied):

```markdown
### Requirement: Pull requests build and smoke-test both images without publishing
Every pull-request run of the CI workflow SHALL build both `Dockerfile` and `Dockerfile.web` with pushing disabled (`load: true`, no registry login) and SHALL boot the two images, first standalone against a disposable Postgres and then as the full `compose.production.yml` stack, to verify that both images become healthy through their own `HEALTHCHECK`, that the health and readiness endpoints answer, that the web edge serves the SPA and proxies the API, that local uploads persist, and that a backup can be restored.

The `images` job (`needs: quality`) SHALL run the same builds and smoke tests on `main` and tag
pushes before `publish`. It may run at the same time as `test` because it never pushes. Its steps,
each a script in the repository that also runs locally:

1. `scripts/ci/dockerignore.test.sh`: builds a `FROM scratch` image from a temporary context that
   holds the repository's `.dockerignore`, an unreadable `data/postgres` folder, backup files and
   env files, and asserts that the build succeeds, that the data folders, `*.dump`,
   `uploads-*.tar.gz` and env files are absent and that the three `*.env.example` templates and
   `files/` are present.
2. `scripts/ci/compose-config-check.sh`: renders `compose.production.yml` with
   `docker compose config --format json` from the placeholder env file
   `scripts/ci/compose-smoke.env` and asserts with `jq` that every long-running service (`postgres`,
   `valkey`, `api`, `web`, `backup`) has a health check, that the dependency conditions match the
   production-operations capability, that the api `UPLOAD_DIR` is `/app/uploads`, that the uploads
   mount is a `volume` named `uploads` by default and a `bind` when `UPLOADS_SOURCE=./ci-data/uploads`,
   and that no health-check test or command contains the placeholder passwords.
3. `scripts/ci/smoke-images.sh` (standalone containers on a throwaway network):
   - start `postgres:18-trixie`, then the API image in default `serve` mode (migrations and the
     first-install seed run) with a named volume at `/app/uploads`, and wait up to 180 seconds for
     the container's own health status to become `healthy` (no health-check override)
   - assert `id -u` is `1000`, `GET /health` returns `200` with `{"status":"ok"}`, and `GET /ready`
     returns `200` with exactly the readiness keys defined by the production-operations capability
     and `status: "ready"`
   - start the web image with `API_UPSTREAM` pointing at the API container, wait for it to become
     `healthy`, and assert that `GET /healthz` returns `200`, `GET /` returns the SPA `index.html`,
     `GET /health` returns the API's liveness JSON through the edge, and `GET /api/v1/sitemap.xml`
     returns the API's XML through the edge
   - run the client-IP echo checks and `scripts/ci/web-entrypoint.test.sh`
   - start the API image with `RUN_MIGRATIONS=false` and `/app/uploads` bind-mounted from a
     root-owned `0755` temporary directory, and assert it exits with status `1` and logs
     `is not writable by uid 1000 gid 1000`; repeat with the directory owned by `1000:1000` and
     assert the container becomes `healthy`
4. `scripts/ci/smoke-compose.sh` (the production stack with the just-built images, project name
   `brewform-ci`):
   - `docker compose up -d` and poll until `postgres`, `valkey`, `api`, `web` and `backup` report
     `healthy` and `migrate` has exited with status `0`, failing after 300 seconds; assert the
     production seed created exactly one user (the admin) and no `@example.com` account
   - assert through the published web port that `/healthz` and `/health` return `200`, and inside
     the api container that `node /app/healthcheck.mjs /ready` exits `0`
   - write a small PNG into `/app/uploads` as the `node` user, recreate the api with
     `docker compose up -d --force-recreate api`, wait for `healthy`, and assert `GET /uploads/<file>`
     through the web edge returns it
   - while a file in the uploads source keeps growing, run a one-shot backup and assert it exits `0`
     and logs that the uploads changed while archiving; assert `/backups` holds a `db-*.dump` that
     `pg_restore --list` accepts and an `uploads-*.tar.gz` listing the PNG
   - add a table with foreign keys to `user` and `recipe` and a user row, delete the PNG, run
     `make prod-restore` with the dump and archive (env file and project overridden), and assert the
     stack becomes healthy, the table and the row are gone, the PNG is served again, the migration
     count equals the journal, and a safety dump containing the added table exists
   - migrate a scratch database with the newest journal entry removed, dump it with the backup
     service, restore it with `make prod-restore`, and assert `migrate` applied the missing migration
     (migration count equals the journal) and the api becomes healthy
   - stop the api with `docker compose stop api` and assert exit status `0` and the log line
     `Graceful shutdown complete`
   - always tear down with `docker compose down -v`

Every script SHALL print the logs of all containers it started and fail the job when any assertion
fails, and SHALL clean up with a `trap`.

#### Scenario: Broken Dockerfile fails the pull request
- **WHEN** a pull request introduces a change that makes `docker build -f Dockerfile` fail
- **THEN** the image-build job fails and the pull request shows a failing check

#### Scenario: Entrypoint crash fails the pull request
- **WHEN** a pull request makes the API container exit during migrations or startup
- **THEN** the container never becomes `healthy` within the timeout
- **AND** the job prints the API container logs and fails

#### Scenario: Broken health check fails the pull request
- **WHEN** a pull request changes `/ready` to return `503` for a ready instance, or removes the `HEALTHCHECK` from either Dockerfile
- **THEN** the standalone smoke test fails because the container never reports `healthy`

#### Scenario: Missing compose health check fails the pull request
- **WHEN** a pull request removes the `healthcheck` of any long-running service in `compose.production.yml`
- **THEN** `scripts/ci/compose-config-check.sh` fails naming that service

#### Scenario: Lost uploads fail the pull request
- **WHEN** a pull request changes the api uploads mount or `UPLOAD_DIR` so files no longer land on the uploads source
- **THEN** the compose smoke test's recreate-and-fetch assertion fails

#### Scenario: Broken restore fails the pull request
- **WHEN** a pull request makes the `restore` service or `make prod-restore` leave a mixed database, skip the safety backup, or stop `migrate` from upgrading an older dump
- **THEN** a restore assertion of the compose smoke test fails

#### Scenario: Build-context regression fails the pull request
- **WHEN** a pull request removes a data-folder exclusion from `.dockerignore` or adds a `**/` exception
- **THEN** `scripts/ci/dockerignore.test.sh` fails

#### Scenario: Edge proxy regression fails the pull request
- **WHEN** a pull request breaks the web edge's `/api/*` reverse proxy
- **THEN** the proxied `/api/v1/...` assertion fails and the job fails

#### Scenario: Fork pull requests can run the image job
- **WHEN** a pull request from a fork runs CI
- **THEN** the images are built and smoke-tested without secrets, registry login or push
```

## Track-wide closing tasks

- [ ] R3.19 Write the r3 spec deltas in the change: MODIFIED `production-operations` ("Automated database backups", "Uploads are backed up with the database when stored locally", "Restore, upgrade and rollback runbook") plus ADDED "Self-hosting guide documents the front-proxy client-IP contract"; MODIFIED `container-deployment` ("Makefile targets for image build and prod profile", "No secrets baked into images", "Docker build context excludes local state and nested artifacts", "Entrypoint runs seed only on first boot"); MODIFIED `ci-image-publishing` ("Pull requests build and smoke-test both images without publishing"); ADDED `deployment-guide` ("Deployment guides keep secrets off command lines"); NEW `database-seed` with the two ADDED requirements. Run `openspec validate wave-6-review-remediation --strict`. After archiving, replace the placeholder Purpose of `openspec/specs/database-seed/spec.md`.
- [ ] R3.20 Group check: `sh -n scripts/ci/*.sh`, `scripts/ci/dockerignore.test.sh`, `scripts/ci/compose-config-check.sh`, `docker compose --env-file scripts/ci/compose-smoke.env -f compose.production.yml config --quiet`, `make prod-smoke` (all seven smoke steps green), `make check`, `make lint`, `make test-specific filter=src/seed`, `make fmt`, `make fmt-check`, `make docs-check`. Each must exit 0 (check each exit code separately, never through a pipe).

## Cross-track notes

1. **Rollback floor (new, concrete):** `IMAGE_TAG=<any pre-#172 sha> make prod-up` with the new
   compose file never starts the api: the old entrypoint (`git show main:docker-entrypoint.sh`)
   ignores the `migrate` argument and `exec`s the server, so the `migrate` one-shot never completes.
   Handled in this track as a docs fix (Finding 2 §6, §12 rollback floor) and the MODIFIED restore
   requirement; whoever writes the release notes should repeat it.
2. **Front nginx 413 (new):** nginx's default `client_max_body_size 1m` rejects photo uploads in
   front of the edge; covered by the Finding 13 snippet and §16 row.
3. **Restore leaves orphan photos (note only):** the uploads extract does not remove files uploaded
   after the backup; they become unreferenced files. No correctness impact; no fix proposed.
4. **Turkish-locale databases (finding 26, other track):** `createdb` in the new restore takes the
   cluster default locale from `template1`, the same as the original `POSTGRES_DB`, so the restore
   neither fixes nor worsens finding 26.
5. **Admin user search (finding 4, other track):** the demo-account cleanup runbook (Finding 12)
   tells admins to search `example.com` in Admin → Users; that works today because the seeded
   emails are lower-case, and keeps working after finding 4's `ilike` fix.
