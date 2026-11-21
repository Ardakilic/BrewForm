# production-operations Specification

## Purpose

Defines how BrewForm runs in production from one compose definition, `compose.production.yml`, with
its own project name. It covers persistent data locations chosen by one variable each, health checks
with dependency-ordered startup, separate liveness and readiness probes, restart, graceful stop, log
rotation and memory limits, and migrations that run once per deploy before the API serves traffic.
Automated database and upload backups, a restore, upgrade and rollback runbook, and upgrade notes
that protect existing photos complete it.
## Requirements
### Requirement: One production deployment definition
The repository SHALL ship exactly one self-hosted production definition, `compose.production.yml`, and `compose.yml` SHALL NOT define production-profile services.

`compose.yml` keeps only the development (`dev`), preview (`preview`) and infrastructure services.
Every operator-facing entry point (`make prod-*` targets, the README self-hosting section and the
deployment guides) SHALL point to `compose.production.yml` used with
`--env-file .env.production`. `.env.production` and the local backup directory SHALL be listed in
`.gitignore` so production secrets and dumps cannot be committed by accident.

#### Scenario: compose.yml has no production services
- **WHEN** `docker compose --profile prod config --services` is run against `compose.yml`
- **THEN** neither `app-prod` nor `web-prod` is listed

#### Scenario: Production secrets file is ignored by git
- **WHEN** `git check-ignore .env.production backups/db-20261118T000000Z.dump` is run
- **THEN** both paths are reported as ignored

### Requirement: Production compose has its own project name
`compose.production.yml` SHALL declare a top-level Compose project `name` distinct from the development stack so the two never share containers, networks or volumes, and the deployment guide SHALL explain how an existing install keeps its previous project name.

The default name SHALL be `brewform-prod`. Compose's `COMPOSE_PROJECT_NAME` (set in
`.env.production`) or `-p` overrides it, which lets installs created before this change keep their
existing volume names.

#### Scenario: Dev and prod stacks on one host do not collide
- **WHEN** `compose.yml` and `compose.production.yml` are both started from the same checkout with the default data sources
- **THEN** the production volumes are named `brewform-prod_postgres_data`, `brewform-prod_uploads` and `brewform-prod_backups`, separate from the development volumes
- **AND** stopping the development stack leaves the production containers running

#### Scenario: Existing install keeps its data
- **WHEN** an operator whose install predates this change sets `COMPOSE_PROJECT_NAME` to the previous project name in `.env.production`
- **THEN** Compose reuses the existing `postgres_data` and `uploads` volumes

### Requirement: Persistent data locations are selected by one variable each
`compose.production.yml` SHALL mount every persistent data location from a source chosen by exactly one environment variable, defaulting to a project-scoped named volume, so that an install without S3 settings keeps its photos, database and backups across `docker compose down`/`up` and container recreation, and so that the same variable switches that location to a host folder (bind mount).

| Variable | Default (named volume) | Mounted at | Used by |
|---|---|---|---|
| `UPLOADS_SOURCE` | `uploads` | `/app/uploads` (read-write) | `api`, `restore` |
| `UPLOADS_SOURCE` | `uploads` | `/uploads` (read-only) | `backup` |
| `POSTGRES_DATA_SOURCE` | `postgres_data` | `/var/lib/postgresql` | `postgres` |
| `BACKUPS_SOURCE` | `backups` | `/backups` (read-only in `restore`) | `backup`, `restore` |

- Each mount SHALL use the short syntax with a default, for example
  `- ${UPLOADS_SOURCE:-uploads}:/app/uploads`. Compose interpolates the value first and then applies
  its source rule: a value that starts with `/`, `.` (so `./` and `../`) or `~` is a bind mount of
  that host path, with relative paths resolved against the directory of `compose.production.yml`;
  any other value is a named volume, which MUST be declared under the top-level `volumes:` key. The
  file declares `uploads`, `postgres_data`, `backups` and `valkey_data`, so any other volume name
  fails `docker compose config` with an undefined-volume error instead of silently creating an
  unmanaged volume. The guides SHALL recommend absolute paths or `./`-prefixed paths for host
  folders.
- `UPLOAD_DIR` SHALL be the literal `/app/uploads` in the api environment (never interpolated), so
  the mount target and the API's upload directory cannot diverge. The uploads source stays mounted
  when `STORAGE_DRIVER=s3`, where it is simply unused.
- Valkey data (cache entries and rate-limit counters, both disposable) stays on the named
  `valkey_data` volume with no selector variable.
- Host-folder ownership: the API runs as UID/GID `1000` (the image's `node` user), so an uploads
  host folder MUST be owned by `1000:1000`. Docker creates a missing short-syntax bind source as a
  root-owned directory, which makes the API fail fast at startup with the not-writable error defined
  by the api-env-config capability. `make prod-fix-uploads-owner` SHALL fix this for either source
  type by running `chown -R 1000:1000 /app/uploads` as root in a one-off api container
  (`docker compose run --rm --no-deps --user 0:0 --entrypoint chown api -R 1000:1000 /app/uploads`).
  The Postgres data folder needs no manual step, because the official `postgres` image entrypoint
  takes ownership of its data directory when it starts as root. The backups folder is written by
  root with `umask 077`.
- The compose guide SHALL show how to pre-create an uploads host folder
  (`sudo install -d -o 1000 -g 1000 -m 0750 <path>`), how to relabel it on SELinux-enforcing hosts
  (`chcon -Rt container_file_t <path>`), and that rootless Docker or `userns-remap` maps UID `1000`
  to a different host UID that must own the folder instead.

#### Scenario: Photos persist across down and up without S3
- **WHEN** the stack runs with no `S3_*` and no `*_SOURCE` variables set, a photo is uploaded, and the operator runs `make prod-down` followed by `make prod-up`
- **THEN** the photo URL `/uploads/<file>` still returns the image through the web origin
- **AND** `docker volume ls` lists `brewform-prod_uploads`

#### Scenario: A host folder stores the uploads
- **WHEN** `UPLOADS_SOURCE=./data/uploads` is set in `.env.production`, the folder exists owned by `1000:1000`, and a photo is uploaded
- **THEN** `docker compose config` renders a `bind` mount of `<project directory>/data/uploads` at `/app/uploads` for the api service and a read-only `bind` mount of the same folder for the backup service
- **AND** the uploaded file appears in `./data/uploads` on the host

#### Scenario: Bind-mounted data outlives volume removal
- **WHEN** `POSTGRES_DATA_SOURCE=/srv/brewform/postgres` and `UPLOADS_SOURCE=/srv/brewform/uploads` are set and the operator runs `docker compose down -v`
- **THEN** the database files and photos remain in `/srv/brewform/postgres` and `/srv/brewform/uploads`
- **AND** the next `make prod-up` starts with the same data

#### Scenario: An undeclared volume name is rejected
- **WHEN** `UPLOADS_SOURCE=photos` is set
- **THEN** `docker compose --env-file .env.production -f compose.production.yml config` fails with an error naming the undefined volume `photos`

#### Scenario: UPLOAD_DIR cannot drift from the mount
- **WHEN** `.env.production` contains `UPLOAD_DIR=/tmp/elsewhere`
- **THEN** the api container's environment still has `UPLOAD_DIR=/app/uploads`

#### Scenario: A root-owned host folder is fixed with one command
- **WHEN** Docker auto-created the uploads host folder as root and the api container exits with the not-writable error
- **THEN** running `make prod-fix-uploads-owner` and then `make prod-up` gives a healthy api that accepts uploads

### Requirement: Production services declare health checks and start in dependency order
Every long-running service in `compose.production.yml` (`postgres`, `valkey`, `api`, `web` and `backup`) SHALL declare a `healthcheck` with explicit `interval`, `timeout`, `retries` and `start_period`, and every dependency between services SHALL use `condition: service_healthy`, except dependencies on the one-shot `migrate` service, which SHALL use `condition: service_completed_successfully`.

| Service | Test | interval | timeout | retries | start_period |
|---|---|---|---|---|---|
| `postgres` | `["CMD-SHELL", "pg_isready -U \"$$POSTGRES_USER\" -d \"$$POSTGRES_DB\""]` | 10s | 5s | 5 | 30s |
| `valkey` | `["CMD-SHELL", "valkey-cli ping \| grep -q PONG"]`, authenticated by `VALKEYCLI_AUTH` set in the service `environment` | 10s | 3s | 5 | 10s |
| `api` | `["CMD", "node", "/app/healthcheck.mjs", "/ready"]` (readiness, with `start_interval: 2s`) | 15s | 5s | 3 | 60s |
| `web` | `["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1/healthz"]` | 30s | 3s | 3 | 10s |
| `backup` | succeeds only while a `db-*.dump` in `/backups` is younger than twice `BACKUP_INTERVAL_SECONDS` | 60s | 10s | 3 | 600s |

Dependencies:
- `migrate` waits for `postgres` to be healthy.
- `api` waits for `migrate` to complete successfully and for `postgres` and `valkey` to be healthy.
- `web` waits for `api` to be healthy.
- `backup` and `restore` wait for `postgres` to be healthy.

The api check probes readiness, so the api counts as healthy only once it can reach the database. A
Valkey outage leaves it healthy, because readiness reports cache and rate-limit store degradation
without failing (cache-driver capability). No health check SHALL place a password in its test
string or in any process argument: `VALKEY_PASSWORD` reaches `valkey-cli` only through
`VALKEYCLI_AUTH` (`REDISCLI_AUTH` is the legacy name valkey-cli also reads), and `pg_isready` needs
no password.

#### Scenario: Services start in dependency order
- **WHEN** `make prod-up` starts the stack on an empty database
- **THEN** postgres becomes healthy, then the migrate container exits with status `0`, then the api container starts, and the web container is created only after the api container reports `healthy`
- **AND** `docker compose ps` finally shows `postgres`, `valkey`, `api`, `web` and `backup` as `healthy`

#### Scenario: Database outage is visible
- **WHEN** the postgres container is stopped while the stack runs
- **THEN** `docker compose ps` reports the api service as `unhealthy` after its three retries
- **AND** the api returns to `healthy` without a restart once postgres is back

#### Scenario: Valkey outage keeps the api healthy
- **WHEN** the valkey container is stopped while the stack runs with `CACHE_DRIVER=redis` and `RATE_LIMIT_STORE=redis`
- **THEN** the valkey service turns `unhealthy` and the api service stays `healthy`

#### Scenario: Health checks do not leak passwords
- **WHEN** `docker inspect` is run for the valkey and postgres containers and their health checks run
- **THEN** no health-check test string and no process argument contains the value of `VALKEY_PASSWORD` or `POSTGRES_PASSWORD`

### Requirement: API exposes separate liveness and readiness probes
The API SHALL serve `GET /health` as a liveness probe that performs no dependency check and returns `200` with exactly `{ "status": "ok" }` while the process serves requests, and `GET /ready` as a readiness probe that returns `200` with `status: "ready"` only when a bounded database round-trip succeeds and the process is not shutting down, and `503` with `status: "not_ready"` otherwise.

- `/ready` SHALL always return the same keys:

  | Key | Values |
  |---|---|
  | `status` | `ready`, `not_ready` |
  | `db` | `connected`, `disconnected`, `skipped` |
  | `cache` | `ok`, `degraded`, `memory`, `disabled` (as defined by the cache-driver capability) |
  | `rateLimitStore` | `ok`, `degraded`, `memory`, `disabled` (as defined by the cache-driver capability) |
  | `storage` | `ok`, `ephemeral`, `degraded`, `s3` |
  | `shuttingDown` | `true`, `false` |

- Database: the round-trip is one Drizzle query issued by the health module's model
  (`pingDatabase()`; it reads no row data). A ping that has not settled after 2000 ms counts as
  `disconnected`. Concurrent probes share one in-flight ping, so a hung database occupies at most one
  pool connection. A database without the migrated schema also counts as `disconnected`.
- Cache and rate-limit store: a degraded Valkey keeps `/ready` at `200`, as the cache-driver
  capability requires.
- Storage: with `STORAGE_DRIVER=local`, `storage` is `ok` when `UPLOAD_DIR` is writable (one
  `access` system call per probe), `ephemeral` when it is writable but the startup check found that
  it is not a mounted volume in production, and `degraded` when it is not writable. With
  `STORAGE_DRIVER=s3` it is `s3` and nothing is probed. `storage` never changes the status code.
- Shutdown: on `SIGTERM` or `SIGINT` the process SHALL mark itself as shutting down before it
  closes the HTTP server. From then on `/ready` returns `503` with `shuttingDown: true` and
  `db: "skipped"` without touching the database pool, while `/health` keeps returning `200` on
  connections that are still open.
- Both probes SHALL be mounted at the root (not under `/api/v1`), be exempt from the global rate
  limit (api-rate-limiting capability), send `Cache-Control: no-store`, never read or write the
  `CacheProvider`, and carry `describeRoute()` metadata (tag `Health`, responses resolved from
  `HealthOutputSchema` and `ReadinessOutputSchema` in `@brewform/shared/schemas/responses`). They
  return bare JSON, not the success envelope, so any orchestrator can parse them.
- Logging: no probe SHALL emit a log at `info` level or above on its own. The health service logs
  entry and exit at `debug`, one `warn` when readiness changes from ready to not ready
  (`{ db, shuttingDown }`) and one `info` when it recovers.

#### Scenario: Liveness ignores dependencies
- **WHEN** the database and Valkey are both unreachable
- **THEN** `GET /health` returns `200` with body `{"status":"ok"}` without waiting on either

#### Scenario: Ready instance reports every component
- **WHEN** the database is reachable, `CACHE_DRIVER=memory`, `RATE_LIMIT_STORE=memory`, and `STORAGE_DRIVER=local` with a writable, mounted `UPLOAD_DIR`
- **THEN** `GET /ready` returns `200` with body `{"status":"ready","db":"connected","cache":"memory","rateLimitStore":"memory","storage":"ok","shuttingDown":false}`
- **AND** the response carries `Cache-Control: no-store`

#### Scenario: Unreachable database makes the instance not ready
- **WHEN** the database stops answering
- **THEN** `GET /ready` returns `503` with `status: "not_ready"` and `db: "disconnected"` within 2.5 seconds
- **AND** exactly one `warn` log records the transition, and later failing probes add no log above `debug` until the database recovers and one `info` log records the recovery

#### Scenario: A hung database holds one connection
- **WHEN** the database accepts connections but never answers and ten `/ready` requests arrive within two seconds
- **THEN** at most one ping query is in flight and all ten requests return `503`

#### Scenario: Readiness flips before connections close
- **WHEN** the process receives `SIGTERM` while a request is still in flight
- **THEN** a `/ready` request on an already-open connection returns `503` with `shuttingDown: true` and `db: "skipped"`
- **AND** the in-flight request completes before the HTTP server closes

#### Scenario: Unwritable storage degrades without failing readiness
- **WHEN** `UPLOAD_DIR` becomes read-only while the API runs with `STORAGE_DRIVER=local`
- **THEN** `GET /ready` returns `200` with `storage: "degraded"`

#### Scenario: Probes are neither rate limited nor logged
- **WHEN** a client sends 200 `GET /health` and 200 `GET /ready` requests within 60 seconds with `LOG_LEVEL=info` and a healthy database
- **THEN** none of them returns `429` and no log line is emitted

### Requirement: Production services restart, stop gracefully and rotate logs
Every long-running service in `compose.production.yml` SHALL use `restart: unless-stopped` and the `json-file` logging driver with bounded rotation, the one-shot `migrate` and `restore` services SHALL use `restart: "no"`, and the `api` service SHALL have a stop grace period of at least 30 seconds.

Log rotation defaults to `max-size: 10m` and `max-file: 5`, overridable through
`DOCKER_LOG_MAX_SIZE` and `DOCKER_LOG_MAX_FILE`, and is applied to every service (including
`migrate`, `backup` and `restore`) through one shared YAML anchor.

#### Scenario: Logs cannot fill the disk
- **WHEN** `docker inspect` is run for any production container
- **THEN** its log config is `json-file` with `max-size` and `max-file` set

#### Scenario: Crashed service is restarted
- **WHEN** the api process exits unexpectedly
- **THEN** Docker restarts the api container

#### Scenario: Graceful shutdown has time to finish
- **WHEN** `make prod-down` stops the stack
- **THEN** the api container receives `SIGTERM` and up to 30 seconds to close connections before `SIGKILL`
- **AND** it exits with status `0` and its last log line is `Graceful shutdown complete`

### Requirement: Production services have memory limits
Every service in `compose.production.yml` SHALL declare a memory limit with an environment-overridable default, and Valkey SHALL cap its own dataset with `maxmemory` below its container limit while keeping the `noeviction` policy.

Defaults: `api` 1g (`API_MEMORY_LIMIT`), `web` 256m (`WEB_MEMORY_LIMIT`), `postgres` 1g
(`POSTGRES_MEMORY_LIMIT`), `valkey` 256m (`VALKEY_MEMORY_LIMIT`) with `maxmemory`
(`VALKEY_MAXMEMORY`, default `192mb`), `backup`, `migrate` and `restore` 512m. Limits use
`deploy.resources.limits.memory`, which `docker compose` applies without Swarm.

Valkey keeps `noeviction` because rate-limit counters stored there (see the `api-rate-limiting`
capability) must not be evicted early. With `maxmemory` set, a full Valkey rejects writes with an
error instead of growing until the kernel kills the container; the cache layer treats those errors
as cache misses.

#### Scenario: Limits are applied
- **WHEN** `docker inspect --format '{{.HostConfig.Memory}}'` is run for the api container with default settings
- **THEN** the value is `1073741824`

#### Scenario: Full cache rejects writes instead of crashing
- **WHEN** the Valkey dataset reaches its configured `maxmemory`
- **THEN** Valkey rejects new writes with an out-of-memory error and keeps serving reads
- **AND** the valkey container is not OOM-killed and no existing key is evicted

### Requirement: Migrations run once per deploy before the API serves traffic
`compose.production.yml` SHALL run database migrations and the first-install bootstrap in a one-shot `migrate` service (the API image started with the `migrate` argument) that must complete successfully before the `api` service starts, and the `api` service SHALL run with `RUN_MIGRATIONS=false`.

The production definitions (`compose.production.yml` and the Coolify guide) assume exactly one API
replica: Compose SHALL NOT scale the api service, and the guides SHALL state that running more than
one replica requires moving migrations to a single job first. Because Coolify's rolling update
starts the new container (which migrates) while the old one still serves, the deployment guide SHALL
document the expand/contract rule: a schema change that removes or renames something the running
release still uses ships in two releases (add and backfill first, then remove).

#### Scenario: API starts only after a successful migration
- **WHEN** `make prod-up` runs with pending migrations
- **THEN** the `migrate` container applies them and exits with status `0`
- **AND** only then is the api container started

#### Scenario: Failed migration keeps the old API down and the error visible
- **WHEN** a migration fails during `make prod-up`
- **THEN** the `migrate` container exits non-zero, the api container is not started, and `make prod-logs` shows the migration error

#### Scenario: API container does not migrate
- **WHEN** the api container starts under `compose.production.yml`
- **THEN** its logs contain `Migrations skipped (RUN_MIGRATIONS=false).`

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

### Requirement: Upgrade notes protect photos from pre-existing installs
The self-hosting guide and the release notes for this change SHALL tell operators of `compose.production.yml` installs created before this change to copy `/app/apps/api/uploads` out of the running api container with the old compose file before they pull or recreate anything, to copy those files into the uploads source they choose after upgrading, and to give that source to the API's non-root user.

Before this change, uploads were written to `/app/apps/api/uploads` in the container's writable
layer (outside the `uploads` volume), so recreating the container deletes them. The notes SHALL give
the exact commands:
- Before `git pull`, with the old file still in place:
  `docker compose --env-file .env.production -f compose.production.yml cp api:/app/apps/api/uploads ./uploads-rescue`.
- Choose the uploads source: keep the default named volume, or set `UPLOADS_SOURCE` to a host folder
  pre-created and owned by `1000:1000`. Set `COMPOSE_PROJECT_NAME` to the old project name to keep
  the old volumes.
- After upgrading, for either source type:
  `docker compose --env-file .env.production -f compose.production.yml run --rm --no-deps --user 0:0 --entrypoint sh -v "$PWD/uploads-rescue:/rescue:ro" api -c 'cp -a /rescue/. /app/uploads/ && chown -R 1000:1000 /app/uploads'`.

The notes SHALL also say that an existing empty, root-owned `uploads` volume must be handed to the
API user with `make prod-fix-uploads-owner`, because the API now fails fast when the upload directory
is not writable.

#### Scenario: Operator rescues photos before upgrading
- **WHEN** an operator follows the upgrade notes on a pre-existing install that has photos in `/app/apps/api/uploads`
- **THEN** after the upgrade the photos are served from the chosen uploads source at their previous `/uploads/<file>` URLs

#### Scenario: Root-owned volume is fixed before start-up
- **WHEN** the existing `uploads` volume is owned by root and the operator runs `make prod-fix-uploads-owner`
- **THEN** the upgraded api container starts and accepts uploads

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

