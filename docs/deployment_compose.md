# BrewForm — Self-hosting with Docker Compose

This guide runs BrewForm on one Docker host with `compose.production.yml`, the repository's only
production definition, and the published images `ghcr.io/ardakilic/brewform-api` and
`ghcr.io/ardakilic/brewform-web`. Every command here goes through the `make prod-*` targets,
which wrap `docker compose --env-file .env.production -f compose.production.yml`.

> Running on Coolify instead? Use [`docs/deployment_coolify.md`](deployment_coolify.md). Local
> development is in [`docs/docker.md`](docker.md).

**Contents**

1. [Topology](#1-topology)
2. [Prerequisites](#2-prerequisites)
3. [First install](#3-first-install)
4. [Configuration](#4-configuration)
5. [Client IP and `TRUSTED_PROXIES`](#5-client-ip-and-trusted_proxies)
6. [`make prod-*` reference](#6-make-prod--reference)
7. [Data storage](#7-data-storage)
8. [Health checks](#8-health-checks)
9. [Limits, logs and restarts](#9-limits-logs-and-restarts)
10. [Backups](#10-backups)
11. [Restore runbook](#11-restore-runbook)
12. [Upgrade and rollback](#12-upgrade-and-rollback)
13. [Single replica and expand/contract](#13-single-replica-and-expandcontract)
14. [Upgrading from the pre-wave-6 compose file](#14-upgrading-from-the-pre-wave-6-compose-file)
15. [Building the images yourself](#15-building-the-images-yourself)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Topology

```text
  Browser ──HTTPS──▶ your TLS proxy (Cloudflare, Caddy, nginx, Traefik, Coolify …)
                          │ HTTP to the host's WEB_PORT (default 80)
                          ▼
  ┌─────────────────────── compose project `brewform-prod` ────────────────────────┐
  │                                                                                 │
  │   web  (brewform-web, Caddy edge, the only published port)                      │
  │     /                         → SPA files (index.html fallback)                 │
  │     /healthz                  → answered locally ("ok")                         │
  │     /api/* /uploads/* /share/* /health  → reverse proxy to api:8000             │
  │                    │                                                            │
  │                    ▼                                                            │
  │   api  (brewform-api, :8000, not published)  ◀── waits for ── migrate (one-shot)│
  │      │                        │                                                 │
  │      ▼                        ▼                                                 │
  │   postgres                 valkey                                               │
  │   (POSTGRES_DATA_SOURCE)   (cache + rate-limit counters, valkey_data)           │
  │                                                                                 │
  │   backup  (pg_dump + uploads archive → BACKUPS_SOURCE, every 24 h by default)   │
  │   restore (profile `restore`, only `make prod-restore` starts it)               │
  └─────────────────────────────────────────────────────────────────────────────────┘
```

- **One origin.** The web container is the edge: the SPA calls `/api/v1` on the web domain, so
  there is no second domain and no CORS. Photos stored locally are served from
  `https://<WEB_DOMAIN>/uploads/<file>` through the same edge.
- **TLS terminates in front of the stack.** Only the web port is published; point your proxy at
  it. (A split-domain setup is possible: set `VITE_API_URL=https://api.example.com/api/v1` and
  route that domain to the api service yourself.)
- **Start order.** postgres healthy → `migrate` exits `0` → api healthy → web. The api never
  starts on a failed migration.
- **One API replica** (see [§13](#13-single-replica-and-expandcontract)).

## 2. Prerequisites

- A Linux host (amd64; the published images are built for `linux/amd64` only) with Docker Engine
  25 or newer and the Compose v2 plugin (`docker compose version`). The compose file uses health
  check `start_interval`, which needs Engine 25+.
- `git` and `make`, and a checkout of this repository (for `compose.production.yml`, the
  `Makefile` and `.env.production.example`).
- A TLS-terminating proxy and a DNS name for `WEB_DOMAIN`.
- No Node.js or pnpm on the host. The runtime is **Node 26 LTS** inside the API image, and pnpm is
  pinned exactly for builds. The authoritative pins are `.nvmrc`, the root `package.json`
  `engines` / `devEngines` / `packageManager` fields, and the `FROM node:<version>-trixie-slim`
  lines of `Dockerfile` and `Dockerfile.web`; Renovate bumps them, so this guide does not repeat
  the patch versions.
- The GHCR packages are public, so `docker pull` needs no login.

## 3. First install

1. Get the files:

   ```sh
   git clone https://github.com/ardakilic/BrewForm.git brewform
   cd brewform
   cp .env.production.example .env.production
   chmod 600 .env.production
   ```

2. Fill in the five required values in `.env.production` (generate secrets with
   `openssl rand -hex 32`):

   | Variable | What it is |
   |---|---|
   | `POSTGRES_PASSWORD` | Postgres password. Use URL-safe characters (or URL-encode `#`, `@`, `:`, `/`): it is put into the API's `DATABASE_URL`. |
   | `VALKEY_PASSWORD` | Valkey password, URL-safe (it is put into the default `REDIS_URL`). |
   | `JWT_SECRET` | At least 16 characters. |
   | `ADMIN_PASSWORD` | First install only: seeds the admin account when the database is empty. Changing it later does not change the existing admin. |
   | `WEB_DOMAIN` | Public host name without scheme, for example `brewform.example.com`. |

   A blank required value stops `docker compose` with `set <VAR> …` before anything starts.

3. Point your TLS proxy at `http://<host>:80` (or the `WEB_PORT` you set).

4. Pull and start:

   ```sh
   make prod-pull
   make prod-up
   make prod-ps     # postgres, valkey, api, web and backup turn "healthy"; migrate "Exited (0)"
   ```

   The `migrate` container runs the API image in `migrate` mode. `docker-entrypoint.sh` runs the
   `@brewform/db` migration runner with Node (`node /app/packages/db/src/migrate.ts`, the
   drizzle-orm migrator with a `pg_trgm` pre-flight), then the user-count check, then the seed on
   an empty database. `make prod-logs` shows:

   ```text
   Entrypoint mode: migrate
   Running database migrations...
   Migrations complete.
   Database is empty, running seed...
   Seeding complete.
   ```

   The api container then logs `Migrations skipped (RUN_MIGRATIONS=false).` and starts the server
   exactly as the entrypoint's last line does: `cd /app/apps/api && exec node src/main.ts`, one
   Node process with no runtime flags under `tini`. Scheduled jobs (the hourly badge evaluation
   with `node-cron`) run inside the API process, once per replica.

   To run migrations on their own: `docker compose --env-file .env.production -f compose.production.yml run --rm migrate`.
   The image contains neither pnpm nor drizzle-kit; drizzle-kit is only used in development to
   generate migrations (`pnpm run db:generate`).

5. Check it from outside:

   ```sh
   curl -s https://<WEB_DOMAIN>/health    # {"status":"ok"}
   curl -s https://<WEB_DOMAIN>/healthz   # ok
   ```

6. Sign in as the admin (`ADMIN_USERNAME`, default `admin`) and change the password in the app.

## 4. Configuration

All settings live in `.env.production`; `.env.production.example` lists every one with its
default. Always pass `--env-file .env.production` (the `make prod-*` targets do): without it
Compose reads the repository's development `.env`.

**Blank values.** In the API, a variable set to an empty value counts as unset, so its default
applies (`S3_ENDPOINT=` no longer crashes the boot). The required compose variables above are the
exception: blank ones fail fast. `TRUSTED_PROXIES` is the one setting where empty has a meaning
(trust no proxy, see [§5](#5-client-ip-and-trusted_proxies)).

### Optional variables

| Variable | Default | Purpose |
|---|---|---|
| `IMAGE_TAG` | `latest` | Image tag for api, migrate and web: `latest`, a full commit SHA or `vX.Y.Z` (rollback, [§12](#12-upgrade-and-rollback)). |
| `API_IMAGE` / `WEB_IMAGE` | `ghcr.io/ardakilic/brewform-api` / `…/brewform-web` | Image names (for example your own builds, [§15](#15-building-the-images-yourself)). |
| `COMPOSE_PROJECT_NAME` | `brewform-prod` | Project name; volumes are named `<project>_uploads` etc. Keep an older install's name to keep its volumes. |
| `WEB_PORT` | `80` | Host port of the web edge. |
| `VITE_API_URL` | `/api/v1` | API URL for the SPA; an absolute URL selects the split-domain topology. |
| `TRUSTED_PROXIES` | `private_ranges` | Who may send `X-Forwarded-For` to the edge ([§5](#5-client-ip-and-trusted_proxies)). |
| `EDGE_MAX_BODY_SIZE` | `16MB` | Request body cap at the edge. Keep it above the API's photo cap (`UPLOAD_MAX_SIZE_BYTES` + 1 MiB + 64 KiB, about 11.06 MiB by default). |
| `UPLOADS_SOURCE`, `POSTGRES_DATA_SOURCE`, `BACKUPS_SOURCE` | `uploads`, `postgres_data`, `backups` | Where data lives ([§7](#7-data-storage)). |
| `STORAGE_DRIVER` | `local` | `s3` is recommended for production; then set every `S3_*` value and `BACKUP_UPLOADS=false`. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_URL` | unset | Object storage. Passed to the API only when set. `S3_ENDPOINT` is the account endpoint without the bucket. |
| `BACKUP_INTERVAL_SECONDS` | `86400` | Seconds between backups ([§10](#10-backups)). |
| `BACKUP_RETENTION_DAYS` | `14` | Backups older than this are deleted. |
| `BACKUP_UPLOADS` | `true` | Archive the uploads with every dump (only with `STORAGE_DRIVER=local`). |
| `API_MEMORY_LIMIT`, `WEB_MEMORY_LIMIT`, `POSTGRES_MEMORY_LIMIT`, `VALKEY_MEMORY_LIMIT` | `1g`, `256m`, `1g`, `256m` | Container memory limits. |
| `MIGRATE_MEMORY_LIMIT`, `BACKUP_MEMORY_LIMIT`, `RESTORE_MEMORY_LIMIT` | `512m` each | Memory limits of the one-shot and backup services. |
| `VALKEY_MAXMEMORY` | `192mb` | Valkey dataset cap; keep it below `VALKEY_MEMORY_LIMIT`. |
| `DOCKER_LOG_MAX_SIZE` / `DOCKER_LOG_MAX_FILE` | `10m` / `5` | json-file log rotation for every service. |
| `POSTGRES_USER` / `POSTGRES_DB` | `brewform` / `brewform` | Database role and name. |
| `ADMIN_EMAIL` / `ADMIN_USERNAME` | `admin@brewform.local` / `admin` | First-install admin account. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `EMAIL_FROM` | `localhost`, `1025`, empty, empty, `false`, `noreply@<WEB_DOMAIN>` | Outgoing mail. |
| `ENABLE_REGISTRATION` / `OPENAPI_ENABLED` | `true` / `false` | Open sign-up; the `/api/v1/docs` OpenAPI UI. |
| `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY`, `JWT_REMEMBER_ME_EXPIRY` | `15m`, `7d`, `180d` | Token lifetimes. |
| `LOG_LEVEL` | `info` | API log level (logs are JSON). |
| `CACHE_ENABLED` / `CACHE_DRIVER` | `true` / `redis` | API cache; `redis` uses the bundled Valkey and falls back to per-process caching while it is down. |
| `CACHE_MEMORY_MAX_ENTRIES` | `10000` (API default) | Entry cap of the in-memory cache. |
| `REDIS_URL` | `redis://:${VALKEY_PASSWORD}@valkey:6379` | Only to use an external Redis-protocol server. |
| `TRUST_PROXY` / `TRUST_PROXY_HOPS` | `hops` / `1` | How the API finds the client IP behind the edge ([§5](#5-client-ip-and-trusted_proxies)). |
| `TRUST_PROXY_CIDRS` | unset | Extra trusted edge ranges for `TRUST_PROXY=cloudflare`, comma separated. |
| `RATE_LIMIT_ENABLED` | `true` (API default) | `false` turns rate limiting off. |
| `RATE_LIMIT_STORE` | `redis` | Rate-limit counters in Valkey (shared; per-process fallback while it is down). |
| `RATE_LIMIT_GLOBAL_MAX` | `100` (API default) | Requests per client per minute for the global policy. |
| `DB_STATEMENT_TIMEOUT_MS` | unset (API default `10000`) | Per-statement time limit on pooled connections; `0` disables. Longer queries answer `503 QUERY_TIMEOUT`. |

`UPLOAD_DIR` is not configurable: the compose file sets it to the literal `/app/uploads`, where
the uploads source is mounted. `API_DOMAIN` is no longer used.

## 5. Client IP and `TRUSTED_PROXIES`

Rate limits are per client, so the API must see the real client address. The edge replaces
`X-Forwarded-For` and `X-Real-IP` with the one client IP it resolved, so the API always sees
exactly one hop and its defaults (`TRUST_PROXY=hops`, `TRUST_PROXY_HOPS=1`) are right in every
topology below. `TRUSTED_PROXIES` tells the edge (Caddy `trusted_proxies`, read right to left)
which connecting addresses may supply `X-Forwarded-For`:

| What connects to the web port | `TRUSTED_PROXIES` |
|---|---|
| A proxy on the same host or a private network (Caddy, nginx, Traefik, Coolify) | unset (default `private_ranges`) |
| Clients directly (nothing in front) | empty: `TRUSTED_PROXIES=` (trust no proxy) |
| Cloudflare directly (the orange cloud points at this host's port) | the Cloudflare ranges from <https://www.cloudflare.com/ips/>, space separated: `173.245.48.0/20 103.21.244.0/22 …` |
| Cloudflare, then a local proxy | `private_ranges` plus the Cloudflare ranges |

- Alternative for Cloudflare: leave `TRUSTED_PROXIES` at its default and set
  `TRUST_PROXY=cloudflare`. The API then uses `CF-Connecting-IP` only when the address the edge
  resolved is a Cloudflare address (its built-in list plus `TRUST_PROXY_CIDRS`).
- Lock the origin down when Cloudflare is in front: allow the web port only from the Cloudflare
  ranges (host firewall or security group), or clients can bypass Cloudflare and its limits.
- `/health` and `/ready` are never rate limited, also when `/health` arrives through the edge.

## 6. `make prod-*` reference

Every target except `prod-smoke` first checks that `.env.production` exists and stops with a
message (and without running Compose) when it does not.

| Target | Runs |
|---|---|
| `make prod-up` | `up -d`: start or update the stack. |
| `make prod-down` | `down`: stop and remove the containers; volumes stay. |
| `make prod-logs` | `logs -f`. |
| `make prod-ps` | `ps`: state and health of every service. |
| `make prod-pull` | `pull`: fetch the images for `IMAGE_TAG`. |
| `make prod-backup` | one immediate backup (`run --rm --no-deps -e BACKUP_ONESHOT=1 backup`); the stack must be running. |
| `make prod-backup-export DEST=./backup-export` | copies every backup to a host folder (`cp backup:/backups/. $(DEST)`). |
| `make prod-restore DUMP=… UPLOADS=…` | stops api and web, runs the `restore` service, starts the stack ([§11](#11-restore-runbook)). |
| `make prod-check-identifiers [args=…]` | the wave-6 identifier check against the production database ([§14](#14-upgrading-from-the-pre-wave-6-compose-file)). |
| `make prod-fix-uploads-owner` | `chown -R 1000:1000 /app/uploads` as root in a one-off api container. |
| `make prod-smoke` | `make images`, then the CI compose smoke test against those local images (uses `scripts/ci/compose-smoke.env`, never `.env.production`). |

## 7. Data storage

Without S3, the database, the photos and the backups are the data to keep. Each location is chosen
by one variable:

| Variable | Default | Mounted at | Used by |
|---|---|---|---|
| `UPLOADS_SOURCE` | named volume `uploads` | `/app/uploads` (read-write) | `api`, `restore` |
| `UPLOADS_SOURCE` | named volume `uploads` | `/uploads` (read-only) | `backup` |
| `POSTGRES_DATA_SOURCE` | named volume `postgres_data` | `/var/lib/postgresql` | `postgres` |
| `BACKUPS_SOURCE` | named volume `backups` | `/backups` (read-only in `restore`) | `backup`, `restore` |

**Compose's rule decides the type.** A value that starts with `/`, `.` (`./`, `../`) or `~` is a
host folder (bind mount); relative paths are resolved against the folder that holds
`compose.production.yml`, so prefer an absolute path or a `./` path. Any other value is a named
volume and must be one of the volumes the file declares (`uploads`, `postgres_data`, `backups`);
a typo such as `UPLOADS_SOURCE=photos` makes `docker compose config` fail instead of creating a
stray volume.

**Named volumes (default).** Nothing to prepare: a new volume takes the image's ownership. Docker
keeps them under its data root, by default `/var/lib/docker/volumes/<project>_<name>/_data`
(`docker volume inspect brewform-prod_uploads --format '{{.Mountpoint}}'`).

**Host folders.** Create the uploads folder owned by the API user (UID/GID `1000`) before the first
start, because Docker creates a missing folder as root and the API then refuses to start:

```sh
sudo install -d -o 1000 -g 1000 -m 0750 ./data/uploads
```

```env
UPLOADS_SOURCE=./data/uploads
POSTGRES_DATA_SOURCE=./data/postgres
BACKUPS_SOURCE=./backups
```

- Postgres needs no preparation: its entrypoint takes ownership of its data folder.
- Backups are written by root with `umask 077` (files `0600`).
- SELinux (Fedora, RHEL): relabel the folders so containers may use them, for example
  `sudo chcon -Rt container_file_t ./data/uploads`.
- Rootless Docker or `userns-remap`: container UID `1000` is a different UID on the host (your
  subordinate UID range), and that UID must own the folder. `make prod-fix-uploads-owner` runs
  `chown` inside a container, so it applies the right mapping for you.

**Fixing ownership.** When the api exits with `Upload directory /app/uploads is not writable by
uid 1000 gid 1000 …`, run:

```sh
make prod-fix-uploads-owner
make prod-up
```

It works for a named volume and a host folder alike.

**Deleting.** `docker compose down -v` (and `make prod-down` followed by `docker volume rm`)
deletes the named volumes: the database, the photos **and the backups** in them. Host folders are
never deleted by Compose.

`STORAGE_DRIVER=s3` is the recommended production setting; the uploads source then stays mounted
but unused, and `BACKUP_UPLOADS=false` skips the uploads archive.

## 8. Health checks

Every long-running service has a health check, and services start in dependency order:

| Service | Test | Interval | Timeout | Retries | Start period |
|---|---|---|---|---|---|
| `postgres` | `pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"` | 10s | 5s | 5 | 30s |
| `valkey` | `valkey-cli ping \| grep -q PONG` (password from `VALKEYCLI_AUTH`, never on a command line) | 10s | 3s | 5 | 10s |
| `api` | `node /app/healthcheck.mjs /ready` (start interval 2s) | 15s | 5s | 3 | 60s |
| `web` | `wget -q -O /dev/null http://127.0.0.1/healthz` | 30s | 3s | 3 | 10s |
| `backup` | a `db-*.dump` in `/backups` younger than twice `BACKUP_INTERVAL_SECONDS` | 60s | 10s | 3 | 600s |

`migrate` has no health check: the api waits for it to exit `0`
(`service_completed_successfully`). Docker never restarts a container because it is unhealthy;
the status gates start order (web waits for a healthy api) and is what `make prod-ps` shows.

**`/health` versus `/ready`.**

- `GET /health` is liveness: no dependency check, always `200 {"status":"ok"}` while the process
  serves requests. The edge proxies it, so it is reachable at `https://<WEB_DOMAIN>/health`.
- `GET /ready` is readiness: `200` only when a database round-trip finishes within 2 seconds and
  the process is not shutting down, otherwise `503`. It is used by the api health check and is not
  proxied by the edge. Its body always has the same keys:

  | Key | Values |
  |---|---|
  | `status` | `ready`, `not_ready` |
  | `db` | `connected`, `disconnected`, `skipped` (during shutdown) |
  | `cache` | `ok`, `degraded`, `memory`, `disabled` |
  | `rateLimitStore` | `ok`, `degraded`, `memory`, `disabled` |
  | `storage` | `ok`, `ephemeral` (writable but not a mounted volume), `degraded` (not writable), `s3` |
  | `shuttingDown` | `true`, `false` |

  A Valkey outage reports `degraded` but keeps `200`; `storage` never changes the status code.
  Check it from the host with `docker compose --env-file .env.production -f compose.production.yml exec api node /app/healthcheck.mjs /ready`.

**Uptime monitors** use liveness: `https://<WEB_DOMAIN>/health` (expect `200` and
`"status":"ok"`) and `https://<WEB_DOMAIN>/healthz` (the web container). Never point a monitor at
`/ready`.

## 9. Limits, logs and restarts

- Memory limits on every service (defaults in [§4](#optional-variables)); Valkey caps its own
  dataset with `maxmemory` (`VALKEY_MAXMEMORY`) and the `noeviction` policy, so rate-limit
  counters are never evicted early and a full Valkey rejects writes instead of being OOM-killed.
- json-file logs rotate at `DOCKER_LOG_MAX_SIZE` × `DOCKER_LOG_MAX_FILE` (10m × 5).
- Long-running services use `restart: unless-stopped`; `migrate` and `restore` never restart.
- The api gets 30 seconds to shut down: on `SIGTERM` it first turns `/ready` to `503`, closes the
  HTTP server, the database, mail, cache and rate-limit connections, logs
  `Graceful shutdown complete` and exits `0`.

## 10. Backups

The `backup` service (same `postgres` image as the database) writes, at start-up and then every
`BACKUP_INTERVAL_SECONDS` (default 24 h):

- `db-<UTC timestamp>.dump`: `pg_dump -Fc` of the database;
- `uploads-<UTC timestamp>.tar.gz`: the uploads source, only with `STORAGE_DRIVER=local` and
  `BACKUP_UPLOADS` not `false`.

Files are written under a temporary name and renamed when complete, have mode `0600`, and are
deleted after `BACKUP_RETENTION_DAYS` (default 14). A failed run is logged and retried at the next
interval; the service turns `unhealthy` when no dump is younger than twice the interval.

They go to the named volume `backups` by default. Set `BACKUPS_SOURCE=./backups` (or an absolute
path) to write them to a host folder instead.

The `backup` service starts only after `migrate` has completed successfully, so the start-up dump
of a fresh install already holds the schema. `make prod-backup` runs one extra backup with
`--no-deps`: it never starts or re-runs `migrate`, so it dumps the schema the database has right
now (for example the old schema after `make prod-pull`, which is what a rollback needs). It
connects to the running `postgres` service, so the stack must be up (`make prod-up`) first.

```sh
make prod-backup                                              # one backup now (stack running)
docker compose --env-file .env.production -f compose.production.yml exec backup ls -l /backups
```

**Keep a copy off the host.** Backups on the same disk do not survive a disk failure. Export them
(this works the same for a volume and a host folder), then copy them away:

```sh
make prod-backup-export DEST=./backup-export
rsync -a ./backup-export/ backup-host:/srv/brewform-backups/
# or: rclone copy ./backup-export remote:brewform-backups
```

With a host-folder target you can copy the folder directly
(`sudo rsync -a ./backups/ backup-host:/srv/brewform-backups/`; the files are root-owned `0600`).
Schedule the export and copy with cron or a systemd timer.

## 11. Restore runbook

The profile-gated `restore` service restores a dump and/or an uploads archive from the backups
target. `make prod-up` never starts it.

1. **Bring backups from elsewhere** (skip when they are already in the backups target):

   ```sh
   docker compose --env-file .env.production -f compose.production.yml cp ./db-20261118T000000Z.dump backup:/backups/
   docker compose --env-file .env.production -f compose.production.yml cp ./uploads-20261118T000000Z.tar.gz backup:/backups/
   ```

2. **Pick the files:**

   ```sh
   docker compose --env-file .env.production -f compose.production.yml exec backup ls -l /backups
   ```

3. **Restore** (either name may be omitted):

   ```sh
   make prod-restore DUMP=db-20261118T000000Z.dump UPLOADS=uploads-20261118T000000Z.tar.gz
   ```

   This stops `api` and `web`, then the restore container:
   - accepts only names matching `^db-[0-9]{8}T[0-9]{6}Z\.dump$` and
     `^uploads-[0-9]{8}T[0-9]{6}Z\.tar\.gz$` (anything else exits `2` and changes nothing);
   - runs `pg_restore --clean --if-exists --no-owner` into the running database;
   - extracts the archive into `/app/uploads` and runs `chown -R 1000:1000 /app/uploads`;

   and finally `up -d` starts the stack again. The `migrate` service then applies any migration
   newer than the dump. If the restore fails, api and web stay stopped: fix the error and run the
   command again, or `make prod-up`.

4. **Verify:** sign in, open a few recipes and photos, and check `make prod-ps`.

The same commands work for named volumes and host folders. Practise a restore on a second
project before you need it (`COMPOSE_PROJECT_NAME=brewform-drill` and another `WEB_PORT` in a
copy of `.env.production`).

## 12. Upgrade and rollback

**Upgrade:**

```sh
make prod-backup            # a fresh dump to roll back to
git pull                    # new compose file and templates
make prod-pull
make prod-up                # migrate applies new migrations, then the api is recreated
```

Read the release notes first: some releases need a step before `make prod-up` (wave 6 does, see
[§14](#14-upgrading-from-the-pre-wave-6-compose-file)). Compare `.env.production` with the new
`.env.production.example`.

**Rollback:** set `IMAGE_TAG` in `.env.production` to a previous full commit SHA or `vX.Y.Z` and
run `make prod-up`; api, migrate and web all use that tag. Database migrations are **not** rolled
back automatically. When the release you leave changed the schema, restore the dump taken before
the upgrade ([§11](#11-restore-runbook)) after switching the tag.

Image tags: `latest` follows `main`; every published commit also has its full SHA tag, and
version tags (`v1.2.0`) are published for releases. Images are published only after every CI job
passed.

## 13. Single replica and expand/contract

- Run exactly **one** api container. Never `docker compose up --scale api=2`: migrations run once
  per deploy in the `migrate` one-shot, and the in-process jobs would run once per replica.
  Running more replicas requires moving migrations to a single job first.
- Ship destructive schema changes in two releases (**expand/contract**): first add and backfill
  (the old code keeps working), then remove or rename in a later release. A rolling deploy on
  another platform runs the new migrations while the old release still serves, and a rollback
  ([§12](#12-upgrade-and-rollback)) runs old code on the new schema.

## 14. Upgrading from the pre-wave-6 compose file

Installs created with the earlier `compose.production.yml` stored photos in
`/app/apps/api/uploads` inside the api container (outside the `uploads` volume), so **recreating
that container deletes them**. Follow these steps in order.

1. **Rescue the photos first**, with the old compose file still in place and the old stack
   running, **before** `git pull`:

   ```sh
   docker compose --env-file .env.production -f compose.production.yml cp api:/app/apps/api/uploads ./uploads-rescue
   ```

   (`./uploads-rescue` must not exist yet. With `STORAGE_DRIVER=s3` there is nothing to rescue.)
   Also take a database dump, because the old file had no backup service:

   ```sh
   docker compose --env-file .env.production -f compose.production.yml exec -T postgres \
     sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > pre-wave-6.dump
   ```

2. **Keep the old volumes.** The old file had no project name, so its project was named after the
   checkout folder (`docker compose ls` shows it, for example `brewform`). Put that name into
   `.env.production` so the new file reuses the old `postgres_data` and `uploads` volumes:

   ```env
   COMPOSE_PROJECT_NAME=brewform
   ```

3. **Update the files:** `git pull`, then compare `.env.production` with the new
   `.env.production.example`: remove `API_DOMAIN`, make sure `POSTGRES_PASSWORD`,
   `VALKEY_PASSWORD`, `JWT_SECRET`, `ADMIN_PASSWORD` and `WEB_DOMAIN` are set (a blank one stops
   Compose), and choose the uploads source: keep the default named volume, or set
   `UPLOADS_SOURCE` to a host folder created with
   `sudo install -d -o 1000 -g 1000 -m 0750 ./data/uploads` ([§7](#7-data-storage)).

4. **Pull and check the data** before the new migrations run:

   ```sh
   make prod-pull && make prod-check-identifiers
   ```

   Wave 6 adds case-insensitive unique indexes on `user.email` and `user.username` and one active
   default setup per user. Data that violates them (for example `Foo@x.io` and `foo@x.io` as two
   accounts) makes the migration fail; it then rolls back and leaves the database unchanged, and
   the api does not start. The check needs the running database (the old postgres container
   serves it at this point), prints ids and usernames only, and exits `0` when nothing blocks the
   upgrade. Fix what it reports and run it again until it exits `0`:
   - `make prod-check-identifiers args=--fix-deleted-duplicates` rewrites the email and username
     of soft-deleted accounts in a duplicate group;
   - `args=--fix-setup-defaults` keeps each user's most recently updated default setup;
   - `args=--fix-empty-slugs` gives legacy recipes with an empty slug a `recipe-<suffix>` slug
     (a warning only);
   - for two or more active accounts that differ only in letter case, contact the owners, then an
     admin changes all but one username (or email) through `PATCH /api/v1/admin/users/:id`.

5. **Copy the photos into the uploads source** and give them to the API user (works for a named
   volume and a host folder):

   ```sh
   docker compose --env-file .env.production -f compose.production.yml run --rm --no-deps --user 0:0 --entrypoint sh -v "$PWD/uploads-rescue:/rescue:ro" api -c 'cp -a /rescue/. /app/uploads/ && chown -R 1000:1000 /app/uploads'
   ```

   With nothing to copy, run `make prod-fix-uploads-owner` instead: the old image ran as root, so
   an existing `uploads` volume can be root-owned, and the new API refuses to start on an
   unwritable upload directory.

6. **Start:** `make prod-up`, then `make prod-ps`. Old photos load at their previous
   `/uploads/<file>` URLs. If the api exits with the not-writable error, run
   `make prod-fix-uploads-owner` and `make prod-up` again.

### Photo storage security check (installs that ran before wave 6)

Run this once if the install ever ran a version older than wave 6 with `STORAGE_DRIVER=s3` (for
example against a self-hosted Garage or MinIO). Those versions built the object key from the
uploaded file's name and put it unencoded into the signed S3 URL, so a crafted filename could
write to another bucket, overwrite another photo, or send a signed **bucket-configuration** `PUT`
(`?policy=`, `?cors=`, `?acl=`, `?tagging=`, …) with the app's credential. Wave 6 closes this, but
it cannot undo changes already made. Run the commands with the AWS CLI v2 and a credential that may
read bucket configuration (an admin credential, not the app's scoped one).

**0. Get an audit credential.** On Garage (run the commands inside your Garage container, for
example `docker exec -it <garage container> /garage …`), create a separate key with owner rights
on the bucket and read its secret:

```sh
garage key create brewform-audit
garage bucket allow --read --write --owner brewform-uploads --key brewform-audit
garage key info brewform-audit --show-secret
```

Delete it when you are done (`garage key delete --yes brewform-audit`). On MinIO use the root
credentials or an admin service account (`mc admin user svcacct add <alias> <admin user>`); on
Cloudflare R2 an "Admin Read & Write" token; on AWS an IAM user with bucket read permissions.

```sh
export S3_ENDPOINT="https://s3.example.com"         # the API's S3_ENDPOINT
export S3_BUCKET="brewform-uploads"                 # the API's S3_BUCKET
export AWS_ACCESS_KEY_ID="<audit key id>" AWS_SECRET_ACCESS_KEY="<audit secret>"
export AWS_DEFAULT_REGION=auto                      # the API's S3_REGION (Garage: its s3_region)
```

**1. Inspect the bucket configuration.** BrewForm sets none of these, so any policy, extra ACL
grant, CORS rule, tag, lifecycle rule, versioning or website configuration you did not create
yourself is a finding:

```sh
aws s3api get-bucket-policy                --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
aws s3api get-bucket-acl                   --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
aws s3api get-bucket-cors                  --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
aws s3api get-bucket-tagging               --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
aws s3api get-bucket-lifecycle-configuration --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
aws s3api get-bucket-versioning            --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
aws s3api get-bucket-website               --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"
```

How to read the results:

- An error named `NoSuch…` (`NoSuchBucketPolicy`, `NoSuchCORSConfiguration`, `NoSuchTagSet`,
  `NoSuchLifecycleConfiguration`, `NoSuchWebsiteConfiguration`) means "not set": that is the
  expected result.
- `NotImplemented` means the provider does not support that configuration, so it cannot have been
  changed through it.
- `get-bucket-versioning` prints nothing when versioning was never enabled; a `Status` you did not
  set is a finding.
- `get-bucket-acl` always lists the owner's `FULL_CONTROL` grant; any other grant (for example to
  `AllUsers`) is a finding.

**2. Audit the object keys.** List every object, then flag each key that matches neither the
legacy pattern (`<13-digit timestamp>-<8 hex>[_medium].<ext>`) nor the new pattern
(`<uuidv4>[_medium].jpg|png|webp`). Keys containing `/`, `?` or `%` fail both patterns and are
always findings:

```sh
aws s3api list-objects-v2 --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT" --output json > objects.json
jq -r '.Contents[]?.Key
  | select((test("^[0-9]{13}-[0-9a-f]{8}(_medium)?\\.[A-Za-z0-9]+$")
            or test("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(_medium)?\\.(jpg|png|webp)$"))
           | not)' objects.json
```

Any output is a finding. BrewForm never sets object tags, so also check the tag sets of a sample of
legacy objects; a non-empty `TagSet` is a finding:

```sh
jq -r '.Contents[]?.Key | select(test("^[0-9]{13}-"))' objects.json | head -n 20 |
  while read -r key; do
    echo "$key"
    aws s3api get-object-tagging --bucket "$S3_BUCKET" --key "$key" --endpoint-url "$S3_ENDPOINT"
  done
```

**3. Compare the photo rows with the objects.** Photo rows store full URLs; the key is the last
path segment. List each photo's keys with the row's `created_at` from the compose database (adjust
`-U`/`-d` if you changed `POSTGRES_USER`/`POSTGRES_DB`), then join them with the object listing:

```sh
export LC_ALL=C   # sort and join must use the same collation
docker compose --env-file .env.production -f compose.production.yml exec -T postgres \
  psql -U brewform -d brewform -At -F $'\t' -c "
  SELECT regexp_replace(url, '^.*/', ''), created_at FROM photo
  UNION ALL
  SELECT regexp_replace(thumbnail_url, '^.*/', ''), created_at FROM photo
   WHERE thumbnail_url IS NOT NULL AND thumbnail_url <> url" | sort > photos.tsv
jq -r '.Contents[]? | [.Key, .LastModified, (.Size | tostring)] | @tsv' objects.json | sort > objects.tsv
join -t $'\t' -a 1 photos.tsv objects.tsv   # key, created_at, LastModified, Size
```

A row whose `LastModified` is clearly later than its `created_at` points at an object that was
replaced after upload; a row with no `LastModified`/`Size` columns points at a missing object.
Both are findings (open the image to confirm).

**4. Remediate.**

- Delete configuration you did not create:
  `aws s3api delete-bucket-policy`, `delete-bucket-cors`, `delete-bucket-tagging`,
  `delete-bucket-lifecycle` and `delete-bucket-website`, each with
  `--bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"`. Reset extra ACL grants with
  `aws s3api put-bucket-acl --acl private --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"`,
  and suspend versioning you did not enable with
  `aws s3api put-bucket-versioning --versioning-configuration Status=Suspended --bucket "$S3_BUCKET" --endpoint-url "$S3_ENDPOINT"`.
- Restore overwritten objects from backup (or from an earlier object version if versioning was
  on), and delete unexpected objects after reviewing them
  (`aws s3api delete-object --bucket "$S3_BUCKET" --key "<key>" --endpoint-url "$S3_ENDPOINT"`).
- **Rotate the access key whenever any finding exists**: create a new scoped credential (below),
  set it as `S3_ACCESS_KEY` / `S3_SECRET_KEY` in `.env.production`, run `make prod-up`, then revoke
  the old one.

**5. Scope the app's credential to object read/write on the one bucket**, so a future bug cannot
reach bucket configuration. The API only reads, writes and deletes objects:

- **Garage:** a key allowed on the bucket without `--owner`:

  ```sh
  garage key create brewform-api
  garage bucket allow --read --write brewform-uploads --key brewform-api
  # if the key was created with owner rights earlier:
  garage bucket deny --owner brewform-uploads --key brewform-api
  ```

- **AWS S3 or MinIO:** a policy that grants only object actions on the bucket's objects:

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
        "Resource": "arn:aws:s3:::brewform-uploads/*"
      }
    ]
  }
  ```

  On AWS, attach it to the IAM user whose keys the API uses. On MinIO:
  `mc admin policy create <alias> brewform-uploads-rw policy.json` and
  `mc admin policy attach <alias> brewform-uploads-rw --user brewform-api`.

- **Cloudflare R2:** an API token with **Object Read & Write**, applied to `brewform-uploads` only
  (never "Admin Read & Write").

## 15. Building the images yourself

```sh
make images          # brewform-api:local and brewform-web:local
make prod-smoke      # the CI compose smoke test against them
```

Then set `API_IMAGE=brewform-api`, `WEB_IMAGE=brewform-web` and `IMAGE_TAG=local` in
`.env.production`. The Docker `deps` stages install dependencies with `pnpm fetch` followed by
`pnpm install --frozen-lockfile --offline` (CI uses `pnpm install --frozen-lockfile`), inside the
pnpm workspace defined by `pnpm-workspace.yaml` (`packages: ['apps/*', 'packages/*']`). Database
steps in development and CI use the workspace scripts (`pnpm --filter @brewform/db run migrate`
and `run seed`, or `make db-migrate` / `make db-seed`). Neither image contains secrets: the only
build arguments are the public `VITE_API_URL` and `VITE_PUBLIC_APP_URL` of the web image, and the
web container overrides both at runtime (`VITE_API_URL`, `PUBLIC_APP_URL`).

## 16. Troubleshooting

| Symptom | Cause → fix |
|---|---|
| `make prod-…`: `.env.production not found` | Create it: `cp .env.production.example .env.production` ([§3](#3-first-install)). |
| `docker compose`: `set POSTGRES_PASSWORD before running` (or another variable) | A required value is missing or blank in `.env.production`. |
| `UPLOADS_SOURCE=…`: `service … refers to undefined volume …` | Not a declared volume name and not a path: use `uploads` or a path starting with `/`, `./` or `~` ([§7](#7-data-storage)). |
| api log `Upload directory /app/uploads is not writable by uid 1000 gid 1000` and exit `1` | The uploads source is owned by root: `make prod-fix-uploads-owner`, then `make prod-up`. |
| `/ready` shows `storage: "ephemeral"` | The upload directory is not a mounted volume, so photos are lost on recreate. Do not override the uploads mount; check `docker compose … config`. |
| `migrate` exits non-zero, api never starts | `make prod-logs` shows the migration error. A unique-index error on `user_*_lower_unique` or `setup_user_default_unique` needs `make prod-check-identifiers` ([§14](#14-upgrading-from-the-pre-wave-6-compose-file)); nothing was changed. |
| api `unhealthy`, `/ready` `503` with `db: "disconnected"` | Postgres is down or slow; the api recovers without a restart when it answers again. |
| `413` on photo upload through the edge | `EDGE_MAX_BODY_SIZE` is below the API's photo cap; keep the `16MB` default. |
| All clients share one rate limit | `TRUSTED_PROXIES` does not match what connects to the web port ([§5](#5-client-ip-and-trusted_proxies)). |
| `exec format error` | The images are amd64-only; run on amd64 or build your own images ([§15](#15-building-the-images-yourself)). |
| Photos uploaded before this release 404, their URL has `//` after the bucket URL | They were uploaded while `S3_PUBLIC_URL` ended with `/`. The API now ignores a trailing slash, so new uploads are fine; repair the old rows once (below). |

**Repairing photo URLs stored with a trailing-slash `S3_PUBLIC_URL`.** Replace `<base>` with your
`S3_PUBLIC_URL` without the trailing slash (for example `https://cdn.brewform.example.com`) and run
this once inside the postgres container (operator SQL; adjust `-U`/`-d` if you changed
`POSTGRES_USER`/`POSTGRES_DB`):

```sh
docker compose --env-file .env.production -f compose.production.yml exec -T postgres \
  psql -U brewform -d brewform -c "
  UPDATE photo SET url = replace(url, '<base>//', '<base>/'),
         thumbnail_url = replace(thumbnail_url, '<base>//', '<base>/')
   WHERE url LIKE '<base>//%';"
```

---

## See also

- [`docs/deployment_coolify.md`](deployment_coolify.md): the Coolify setup used for `brewform.cc`.
- [`docs/docker.md`](docker.md): the local Docker development environment.
- `compose.production.yml`: the header comment summarises every setting in this guide.
